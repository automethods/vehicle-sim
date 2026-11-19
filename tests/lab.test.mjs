import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { TeslaPlant } from "../dist/plant.js";
import { Lab } from "../dist/lab.js";
import { cycleFromCsv, benchmarkCycle } from "../dist/cycle.js";
import { cocInitial, rangeReservePct, topSpeedDurationS } from "../dist/coc.js";
import { diagnosticCsv, diagnosticSummary, diagnosticValue, speedReply } from "../dist/diagnostics.js";
import { engdocReport, runReport } from "../dist/report.js";

const base = new URL("../", import.meta.url);
const model = process.env.TESLA_SIM_DIR ?? fileURLToPath(new URL("plant", base));
const target = cycleFromCsv(await readFile(new URL("data/wltc-class-3b.csv", base), "utf8"));
const measured = JSON.parse(await readFile(new URL("data/tum-wltp-first-pass.json", base), "utf8"));
const neutral = { accelerator: 0, brake: 0, hvOk: true };
const defaults = { scenario: "manual", socPct: 60, temperatureC: 20, ambientC: 20 };
const newLab = (t, catalog) => {
  const plant = new TeslaPlant(process.env.PYTHON ?? "python3", fileURLToPath(new URL("bridge.py", base)), model);
  t.after(() => plant.close());
  return new Lab(plant, target, measured, catalog);
};

test("manual drive, injected HV fault and authoritative reset", async (t) => {
  const lab = newLab(t);
  const initial = await lab.reset(defaults);
  assert.deepEqual(initial.chamber, { temperatureC: 20, humidityPct: 50, pressureKpa: 101.325 });
  let sample = await lab.advance(30, { ...neutral, accelerator: 0.5 });
  assert.ok(sample.state.speed_kph > 10);
  assert.ok(sample.state.battery_current_a > 0);
  const before = sample.state.distance_km;
  sample = await lab.advance(5, { ...neutral, accelerator: 1, hvOk: false });
  assert.equal(sample.state.hv_state, "FAULT");
  assert.equal(sample.state.motor_torque_nm, 0);
  assert.ok(sample.state.distance_km > before);
  assert.equal(lab.observe().state.time_s, sample.state.time_s);
  const reset = await lab.reset(defaults);
  assert.equal(reset.revision, initial.revision + 1);
  assert.equal(reset.state.time_s, 0);
  assert.equal(reset.startedAt, undefined);
  assert.equal(lab.exportCsv().trim().split("\n").length, 2);
});

test("diagnostics exports the selected signals with the OBD speed reply", async (t) => {
  assert.equal(diagnosticValue("speed", 26.5), 26);
  assert.equal(diagnosticValue("speed", 27.5), 28);
  assert.equal(speedReply(diagnosticValue("speed", 270)), "41 0D FF");
  const lab = newLab(t);
  await lab.reset({ ...defaults, ambientC: 23 });
  const sample = await lab.advance(10, { ...neutral, accelerator: 0.6 });
  const selected = ["speed", "accelerator"];
  const csv = diagnosticCsv(lab.exportCsv(), selected).trim().split("\n");
  const speed = diagnosticValue("speed", sample.state.speed_kph);
  assert.equal(csv[0], "time_s,obd_010d_kph,accelerator_pct,obd_010d_response_hex");
  assert.equal(csv.at(-1), "1," + speed + ",60," + speedReply(speed));
  const summary = diagnosticSummary(lab.exportCsv(), selected);
  assert.equal(summary.samples, 2);
  assert.equal(summary.lastTimeS, 1);
  assert.deepEqual(summary.rows, [{ timeS: 0, values: [0, 0] }, { timeS: 1, values: [speed, 60] }]);
  assert.equal(summary.speedReply, speedReply(speed));
  assert.deepEqual(summary.stats.map(({ id, min, max }) => [id, min, max]), [["speed", 0, speed], ["accelerator", 0, 60]]);
});

test("parked DC charging records motor heat and no roller travel", async (t) => {
  const lab = newLab(t);
  await lab.reset({ ...defaults, scenario: "charge-dc", socPct: 20, temperatureC: 15 });
  const sample = await lab.advance(60, neutral);
  assert.equal(sample.state.mode, "CHARGE_DC");
  assert.equal(sample.state.speed_kph, 0);
  assert.equal(sample.state.distance_km, 0);
  assert.ok(sample.state.soc_pct > 20);
  assert.ok(sample.state.pack_heating_kw > 0);
  assert.ok(sample.state.battery_power_kw < 0);
  assert.ok(Math.abs(sample.state.vehicle_energy_residual_j) < 1e-5);
  const report = runReport(sample);
  assert.equal(report.consumption, null);
  assert.ok(report.sourceEnergy > 0);
  assert.ok(!engdocReport(report).native.values.some(value => value.id === "run.consumption"));
});

test("warm DC charging tapers to the cutoff, records cooling, and stops", async (t) => {
  const lab = newLab(t);
  const initial = await lab.reset({ ...defaults, scenario: "charge-dc", socPct: 79.6, temperatureC: 46 });
  assert.equal(initial.startedAt, undefined);
  let sample = await lab.advance(100, neutral);
  const startedAt = sample.startedAt;
  assert.equal(sample.complete, false);
  assert.ok(sample.state.battery_power_kw < -15);
  assert.ok(Date.parse(startedAt) > 0);
  const initialPower = sample.state.battery_power_kw;
  sample = await lab.advance(90, neutral);
  assert.ok(sample.state.battery_power_kw > initialPower);
  while (!sample.complete && sample.state.time_s < 90) sample = await lab.advance(60, neutral);
  assert.equal(sample.complete, true);
  assert.equal(sample.state.soc_pct, 80);
  assert.ok(Math.abs(sample.state.battery_power_kw) < 1e-8);
  assert.ok(sample.state.energy_pack_cooling_electric_kwh > 0);
  assert.equal(sample.startedAt, startedAt);
  assert.equal(runReport(sample).startedAt, startedAt);
  assert.equal((await lab.advance(60, neutral)).state.time_s, sample.state.time_s);
  assert.ok(Math.abs(Number(lab.exportCsv().trim().split("\n").at(-1).split(",")[0]) - sample.state.time_s) < 1e-8);
});

test("manual WLTC keeps the cycle target and uses supplied pedals", async (t) => {
  const lab = newLab(t);
  await lab.reset({ ...defaults, scenario: "wltc", driver: "pedals" });
  let sample = await lab.advance(60, neutral);
  assert.equal(sample.state.speed_kph, 0);
  sample = await lab.advance(20, { ...neutral, accelerator: 0.55 });
  assert.equal(sample.config.driver, "pedals");
  assert.equal(sample.targetKph, 0);
  assert.ok(sample.state.speed_kph > 10);
  assert.ok(sample.comparison.targetRmseKph > 0);
});

test("WLTC follows a speed target with feedback and finishes at 1800 s", async (t) => {
  const lab = newLab(t);
  await lab.reset({
    scenario: "wltc", socPct: measured.socPct, temperatureC: measured.temperatureC, ambientC: measured.ambientC,
  });
  let sample;
  for (let step = 0; step <= 300; step++) sample = await lab.advance(60, neutral);
  assert.equal(sample.complete, true);
  assert.equal(sample.state.time_s, 1800);
  assert.equal(sample.targetKph, 0);
  assert.ok(sample.state.distance_km > 20 && sample.state.distance_km < 27);
  assert.ok(sample.comparison.targetRmseKph < 5, "Target speed RMSE " + sample.comparison.targetRmseKph);
  assert.ok(sample.comparison.measuredOutKwh > sample.comparison.measuredInKwh);
  const simulatedNet = sample.state.energy_battery_out_kwh - sample.state.energy_battery_in_kwh;
  const measuredNet = sample.comparison.measuredOutKwh - sample.comparison.measuredInKwh;
  assert.ok(Math.abs(simulatedNet / measuredNet - 1) < 0.10, "WLTC net pack energy error");
  assert.ok(Number.isFinite(sample.comparison.batteryRmseKw));
  assert.ok(Math.abs(sample.state.vehicle_energy_residual_j) < 0.001);
  assert.ok(Math.abs(sample.state.battery_energy_residual_j) < 0.001);
  const report = runReport(sample, benchmarkCycle(target));
  assert.equal(report.status, "Cycle complete");
  assert.equal(report.net, simulatedNet);
  assert.equal(report.consumption, 100 * simulatedNet / sample.state.distance_km);
  assert.equal(report.comparison.net, measuredNet);
  const formula = engdocReport(report).native.values.find(value => value.id === "run.consumption");
  assert.equal(formula.canonicalUnit, "Wh/km");
  assert.deepEqual(formula.expression.bindings.map(binding => binding.valueId), ["run.net", "run.distance"]);
  const rows = lab.exportCsv().trim().split("\n");
  assert.equal(rows.length, 1802);
  const measuredPower = rows[0].split(",").indexOf("measured_battery_power_kw");
  assert.ok(measuredPower >= 0);
  assert.equal(Number(rows[1].split(",")[measuredPower]), measured.points[0].batteryKw);
  const voltage = rows[0].split(",").indexOf("battery_voltage_v");
  const temperature = rows[0].split(",").indexOf("battery_temp_c");
  let squaredVoltageError = 0;
  for (const [second, point] of measured.points.entries()) {
    const values = rows[second + 1].split(",");
    squaredVoltageError += (Number(values[voltage]) - point.voltageV) ** 2;
    assert.ok(Number(values[temperature]) >= point.minTempC && Number(values[temperature]) <= point.maxTempC);
  }
  assert.ok(Math.sqrt(squaredVoltageError / measured.points.length) < 2.5);
  assert.equal(sample.state.energy_pack_cooling_electric_kwh, 0);
  console.log("Completed WLTC:", JSON.stringify({
    distanceKm: sample.state.distance_km, ...sample.comparison,
    simulatedOutKwh: sample.state.energy_battery_out_kwh, simulatedInKwh: sample.state.energy_battery_in_kwh,
    vehicleResidualJ: sample.state.vehicle_energy_residual_j, batteryResidualJ: sample.state.battery_energy_residual_j,
  }));
});

test("CoC top speed records the steady final kilometre and stops at 90 s", async (t) => {
  const lab = newLab(t);
  await lab.reset({ ...cocInitial, scenario: "coc-speed" });
  let sample = await lab.advance(600, neutral);
  assert.equal(sample.complete, false);
  sample = await lab.advance(600, neutral);
  assert.equal(sample.state.time_s, topSpeedDurationS);
  assert.equal(sample.coc.end, "complete");
  assert.ok(Math.abs(sample.coc.value - 229.1) < 0.1);
  assert.equal(runReport(sample).coc.reference, 225);
  assert.ok(sample.state.road_load_kw > 95);
  assert.equal(sample.accelerationTimes.length, 2);
  const [hundred, twoHundred] = sample.accelerationTimes;
  assert.equal(hundred.speedKph, 100);
  assert.ok(Math.abs(hundred.timeS - 7.0) < 0.1);
  assert.equal(twoHundred.speedKph, 200);
  assert.ok(Math.abs(twoHundred.timeS - 22.2) < 0.1);
});

test("CoC range repeats the WLTC schedule, with separate completion and fault outcomes", async (t) => {
  const lab = newLab(t);
  await lab.reset({ ...cocInitial, scenario: "coc-range" });
  for (let n = 0; n < 4; n++) await lab.advance(4000, neutral);
  const repeated = await lab.advance(2200, neutral);
  assert.equal(repeated.state.time_s, 1820);
  assert.equal(repeated.targetKph, target[20]);
  assert.equal(repeated.complete, false);
  assert.equal(repeated.comparison, null);
  const fault = await lab.advance(1, { ...neutral, hvOk: false });
  assert.equal(fault.complete, true);
  assert.equal(fault.coc.end, "hv-fault");
  assert.equal(fault.coc.value, null);
  await lab.reset({ ...cocInitial, scenario: "coc-range", socPct: rangeReservePct });
  const drained = await lab.advance(1, neutral);
  assert.equal(drained.complete, true);
  assert.equal(drained.coc.end, "complete");
  assert.equal(drained.coc.value, drained.state.distance_km);
  assert.equal(runReport(drained, benchmarkCycle(target)).coc.reference, 440);
});

test("catalog preserves speed resolution, repaired clocks and downhill grade", async (t) => {
  const schedules = JSON.parse(await readFile(new URL("data/drive-cycles.json", base), "utf8"));
  const catalog = new Map(schedules.map((cycle) => [cycle.id, cycle]));
  assert.equal(catalog.size, 38);
  for (const cycle of catalog.values()) {
    assert.ok(Math.abs((cycle.speedKph.length - 1) * cycle.stepS - cycle.durationS) < 1e-8, cycle.id);
    assert.ok(cycle.speedKph.every((value) => Number.isFinite(value) && value >= 0), cycle.id);
    if (cycle.gradePct) assert.equal(cycle.gradePct.length, cycle.speedKph.length);
  }
  const city = catalog.get("wltc-city");
  assert.deepEqual(city.speedKph, target.slice(0, 1023));
  assert.equal(catalog.get("epa-ftp10hz_flat").stepS, 0.1);
  assert.equal(catalog.get("asia-epa_j1015col").durationS, 891);
  const lab = newLab(t, catalog);
  let row = await lab.reset({ ...defaults, scenario: "cycle", cycleId: "special-grossglockner_downhilldrive" });
  assert.equal(row.consumptionKwhPer100Km, null);
  for (let step = 0; step < 27; step++) row = await lab.advance(60, neutral);
  assert.ok(row.gradePct < -21 && row.gradePct > -22);
  assert.ok(row.state.distance_km > 0.5);
  assert.ok(row.consumptionKwhPer100Km < 0);
  assert.equal(row.comparison, null);
  assert.ok(row.targetRmseKph >= 0);
  assert.ok(Math.abs(row.state.vehicle_energy_residual_j) < 0.001);
  assert.ok(lab.exportCsv().split("\n")[0].endsWith("target_grade_pct,net_pack_kwh_per_100km"));

  row = await lab.reset({ ...defaults, scenario: "cycle", cycleId: "epa-ececol" });
  while (!row.complete) row = await lab.advance(60, neutral);
  assert.equal(row.state.time_s, 195);
  assert.equal(row.targetKph, 0);
  assert.ok(row.consumptionKwhPer100Km > 0);
  assert.equal(row.comparison, null);
  assert.equal((await lab.advance(60, neutral)).state.time_s, 195);
});

test("roller braking isolates friction and a weak brake increases stopping distance", async (t) => {
  const lab = newLab(t);
  const stops = [];
  for (const reducedBrakeForce of [false, true]) {
    const start = await lab.reset({ ...defaults, scenario: "brake", reducedBrakeForce });
    assert.equal(start.state.speed_kph, 50);
    assert.equal(start.state.gear, "N");
    const end = await lab.advance(60, { ...neutral, accelerator: 1 });
    assert.equal(end.complete, true);
    assert.equal(end.state.speed_kph, 0);
    assert.equal(end.state.motor_torque_nm, 0);
    assert.equal(end.state.regen_force_n, 0);
    assert.equal(end.consumptionKwhPer100Km, null);
    assert.ok(Math.abs(end.state.vehicle_energy_residual_j) < 1e-5);
    assert.equal(runReport(end).rollerTest.brakeForcePct, reducedBrakeForce ? 50 : 100);
    assert.ok(end.points.some(point => point.timeS === 0.1));
    stops.push(end);
  }
  assert.ok(stops[1].state.distance_km > 1.8 * stops[0].state.distance_km);
  assert.ok(stops[1].state.time_s > stops[0].state.time_s);
});

test("roller coastdown measures road load in neutral and ends at 20 km/h", async (t) => {
  const lab = newLab(t);
  let sample = await lab.reset({ ...defaults, scenario: "coastdown" });
  assert.equal(sample.state.speed_kph, 100);
  const initialRoadLoadKw = sample.state.road_load_kw;
  assert.ok(initialRoadLoadKw > 14 && initialRoadLoadKw < 16);
  for (let batch = 0; batch < 30 && !sample.complete; batch++) {
    sample = await lab.advance(60, { ...neutral, accelerator: 1, brake: 1 });
  }
  assert.equal(sample.complete, true);
  assert.ok(sample.state.speed_kph <= 20 && sample.state.speed_kph > 19.9);
  assert.equal(sample.state.friction_force_n, 0);
  assert.equal(sample.state.motor_torque_nm, 0);
  assert.ok(sample.state.road_load_kw < initialRoadLoadKw);
  assert.ok(Math.abs(sample.state.vehicle_energy_residual_j) < 1e-5);
});

test("HV interlock fault terminates automated WLTC and charging runs and records the fault code", async (t) => {
  const lab = newLab(t);
  for (const scenario of ["wltc", "charge-dc"]) {
    const initial = await lab.reset({ ...defaults, scenario });
    assert.equal(initial.faultCode, undefined);
    const before = await lab.advance(60, neutral);
    const fault = await lab.advance(60, { ...neutral, hvOk: false });
    assert.ok(fault.state.time_s - before.state.time_s < 0.11);
    assert.equal(fault.complete, true);
    assert.equal(fault.abortReason, "hv-fault");
    assert.equal(fault.faultCode, "P0A0A");
    assert.equal(fault.state.battery_power_kw, 0);
    assert.equal(runReport(fault).status, "Test ended");
    assert.match(lab.exportCsv().trim().split("\n").at(-1), /,P0A0A,/);
    assert.equal((await lab.advance(60, neutral)).state.time_s, fault.state.time_s);
  }
});
