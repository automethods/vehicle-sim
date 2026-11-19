import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cycleFromCsv } from "../dist/cycle.js";
import { Lab } from "../dist/lab.js";
import { TeslaPlant } from "../dist/plant.js";

const project = fileURLToPath(new URL("../", import.meta.url));
const tesla = resolve(project, "../Vehicle_complete_prjct/Tesla");
const model = process.env.TESLA_SIM_DIR ?? join(project, "plant");
const raw = process.env.TUM_STANDARD_DIR ?? join(tesla,
  "data/tum_model3_sr_plus_2020/Dataset_article/3_Driving_Range/2_Standard_Driving");
const wltc = cycleFromCsv(await readFile(join(project, "data/wltc-class-3b.csv"), "utf8"));
const first = JSON.parse(await readFile(join(project, "data/tum-wltp-first-pass.json"), "utf8"));

async function loadWindow(file, start, duration) {
  const csv = (await readFile(join(raw, file), "utf8")).split(/\r?\n/);
  const header = csv[0].split(",");
  const keys = ["Time_s", "UIspeed_signed_kph", "BattVoltage_V", "SmoothBattCurrent_A",
    "SOCave_percent", "BMSmaxPackTemperatur_Deg", "BMSminPackTemperatur_Deg", "VCFRONT_tempAmbie_Deg"];
  const indexes = keys.map((key) => header.indexOf(key));
  if (indexes.includes(-1)) throw new Error("Missing TUM columns in " + file);
  const rows = csv.slice(1 + start, 2 + start + duration).map((line, offset) => {
    const cells = line.split(",");
    const [timestamp, ...values] = indexes.map((index) => cells[index]);
    const time = timestamp.split(":").reduce((seconds, field) => seconds * 60 + Number(field), 0);
    const numbers = values.map(Number);
    if (time !== start + offset || numbers.some((value) => !Number.isFinite(value))) {
      throw new Error("Invalid one-second TUM record in " + file + " at " + timestamp);
    }
    return numbers;
  });
  if (rows.length !== duration + 1) throw new Error("Incomplete TUM window");
  const [,,, socPct, maxC, minC, ambientC] = rows[0];
  return {
    offsetS: start, socPct, temperatureC: (maxC + minC) / 2, ambientC,
    points: rows.map(([speedKph, voltage, current]) => ({
      speedKph, batteryKw: voltage * current / 1000,
    })),
  };
}

const holdout = await loadWindow("FTP_75_Part2.csv", 0, 1800);
const wltpRepeat = await loadWindow("WLTP.csv", 1810, 1800);
const cases = [
  ["WLTC Class 3b vs TUM first WLTP pass", wltc, first],
  ["TUM WLTP later window, recorded speed", wltpRepeat.points.map((p) => p.speedKph), wltpRepeat],
  ["TUM FTP-75 Part 2 first 1800 s, recorded speed", holdout.points.map((p) => p.speedKph), holdout],
];
const neutral = { accelerator: 0, brake: 0, hvOk: true };
const results = [];
for (const [name, target, measured] of cases) {
  const plant = new TeslaPlant(process.env.PYTHON ?? "python3", join(project, "bridge.py"), model);
  const lab = new Lab(plant, target, measured);
  try {
    for (const profile of ["legacy", "calibrated"]) {
      let snapshot = await lab.reset({
        scenario: "wltc", profile: profile === "legacy" ? "legacy" : undefined,
        socPct: measured.socPct, temperatureC: measured.temperatureC, ambientC: measured.ambientC,
      });
      while (!snapshot.complete) snapshot = await lab.advance(60, neutral);
      const state = snapshot.state;
      const m = snapshot.comparison;
      const simNetKwh = state.energy_battery_out_kwh - state.energy_battery_in_kwh;
      const tumNetKwh = m.measuredOutKwh - m.measuredInKwh;
      results.push({
        run: name, profile, distanceKm: state.distance_km, simNetKwh, tumNetKwh,
        netErrorPct: 100 * (simNetKwh / tumNetKwh - 1),
        simOutKwh: state.energy_battery_out_kwh, tumOutKwh: m.measuredOutKwh,
        simInKwh: state.energy_battery_in_kwh, tumInKwh: m.measuredInKwh,
        targetRmseKph: m.targetRmseKph, tumRmseKph: m.measuredRmseKph, batteryRmseKw: m.batteryRmseKw,
        vehicleResidualJ: state.vehicle_energy_residual_j, batteryResidualJ: state.battery_energy_residual_j,
      });
    }
  } finally {
    plant.close();
  }
}
process.stdout.write(JSON.stringify(results, null, 2) + "\n");
