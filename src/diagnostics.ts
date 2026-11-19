import type { PlantState } from "./contracts.js";

export const diagnosticSignals = {
  speed: { field: "speed_kph", column: "obd_010d_kph", label: "Vehicle speed", uk: "Швидкість автомобіля", unit: "km/h", digits: 0 },
  motor: { field: "motor_rpm", column: "motor_rpm", label: "Motor speed", uk: "Частота обертання двигуна", unit: "rpm", digits: 0 },
  torque: { field: "motor_torque_nm", column: "motor_torque_nm", label: "Motor torque", uk: "Крутний момент двигуна", unit: "N·m", digits: 1 },
  accelerator: { field: "accelerator", column: "accelerator_pct", label: "Accelerator", uk: "Акселератор", unit: "%", digits: 0 },
  regen: { field: "regen_force_n", column: "regen_force_n", label: "Regenerative braking force", uk: "Сила рекуперативного гальмування", unit: "N", digits: 0 },
  soc: { field: "soc_pct", column: "soc_pct", label: "Battery charge", uk: "Заряд батареї", unit: "%", digits: 1 },
  temperature: { field: "battery_temp_c", column: "battery_temp_c", label: "Pack temperature", uk: "Температура батареї", unit: "°C", digits: 1 },
  voltage: { field: "battery_voltage_v", column: "battery_voltage_v", label: "Pack voltage", uk: "Напруга батареї", unit: "V", digits: 1 },
  current: { field: "battery_current_a", column: "battery_current_a", label: "Pack current", uk: "Струм батареї", unit: "A", digits: 1 },
  power: { field: "battery_power_kw", column: "battery_power_kw", label: "DC pack power", uk: "Потужність батареї (DC)", unit: "kW", digits: 1 },
} as const satisfies Record<string, { field: keyof PlantState; column: string; label: string; uk: string; unit: string; digits: number }>;

export type DiagnosticSignal = keyof typeof diagnosticSignals;
export const diagnosticIds = Object.keys(diagnosticSignals) as DiagnosticSignal[];

export function diagnosticValue(id: DiagnosticSignal, value: number): number {
  if (id === "speed") {
    // The OBD-II lab rounds PID 0D to the nearest km/h, with ties to even.
    const whole = Math.floor(value);
    const quantized = value === whole + 0.5 && whole % 2 === 0 ? whole : Math.round(value);
    return Math.max(0, Math.min(255, quantized));
  }
  return id === "accelerator" ? 100 * value : value;
}

export function speedReply(kph: number): string {
  return "41 0D " + kph.toString(16).padStart(2, "0").toUpperCase();
}

function diagnosticRows(traceCsv: string, ids: readonly DiagnosticSignal[]) {
  const [header, ...lines] = traceCsv.trimEnd().split("\n");
  const fields = header.split(",");
  const indices = ids.map(id => fields.indexOf(diagnosticSignals[id].field));
  return lines.map(line => {
    const row = line.split(",");
    return { timeS: Number(row[0]), values: ids.map((id, index) => diagnosticValue(id, Number(row[indices[index]]))) };
  });
}

export function diagnosticCsv(traceCsv: string, ids: readonly DiagnosticSignal[]): string {
  const speedIndex = ids.indexOf("speed");
  const header = ["time_s", ...ids.map(id => diagnosticSignals[id].column)];
  if (speedIndex >= 0) header.push("obd_010d_response_hex");
  const lines = diagnosticRows(traceCsv, ids).map(({ timeS, values }) => {
    const row = [String(timeS), ...values.map((value, index) => value.toFixed(diagnosticSignals[ids[index]].digits))];
    if (speedIndex >= 0) row.push(speedReply(values[speedIndex]));
    return row.join(",");
  });
  return [header.join(","), ...lines, ""].join("\n");
}

export function diagnosticSummary(traceCsv: string, ids: readonly DiagnosticSignal[]) {
  const rows = diagnosticRows(traceCsv, ids);
  const last = rows.at(-1)!;
  const stats = ids.map((id, index) => ({
    id, ...diagnosticSignals[id], last: last.values[index], min: Infinity, max: -Infinity,
  }));
  for (const { values } of rows) {
    stats.forEach((channel, index) => {
      channel.min = Math.min(channel.min, values[index]);
      channel.max = Math.max(channel.max, values[index]);
    });
  }
  return { samples: rows.length, lastTimeS: last.timeS, stats, rows,
    speedReply: ids.includes("speed") ? speedReply(last.values[ids.indexOf("speed")]) : null };
}
