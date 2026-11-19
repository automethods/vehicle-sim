export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export function cycleFromCsv(csv) {
    const rows = csv.trim().split(/\r?\n/);
    if (rows[0] !== "#WLTC Class 3b" || rows[1] !== "time_s,speed_kmh") {
        throw new Error("Expected the shared WLTC Class 3b trace.");
    }
    const samples = rows.slice(2).map((row, index) => {
        const [time, speed] = row.split(",").map(Number);
        if (time !== index || !Number.isFinite(speed) || speed < 0)
            throw new Error("Invalid WLTC sample.");
        return speed;
    });
    if (samples.length !== 1801)
        throw new Error("WLTC Class 3b must span 0–1800 s.");
    return samples;
}
export const class3bTitle = "WLTC Class 3b";
export function benchmarkCycle(speedKph) {
    return {
        id: "wltc", title: class3bTitle, group: "WLTP / EV",
        source: "wltc-class-3b.csv", speedKph, stepS: 1, durationS: speedKph.length - 1,
        phases: [
            { title: "Low", endS: 589 }, { title: "Medium", endS: 1022 },
            { title: "High", endS: 1477 }, { title: "Extra-high", endS: 1800 },
        ],
    };
}
export function cycleInfo(cycle) {
    const { id, title, group, source, stepS, durationS, phases } = cycle;
    return { id, title, group, source, stepS, durationS, phases };
}
export function targetAt(samples, seconds, stepS = 1) {
    const t = clamp(seconds / stepS, 0, samples.length - 1);
    const first = Math.floor(t);
    return samples[first] + (samples[Math.min(first + 1, samples.length - 1)] - samples[first]) * (t - first);
}
export function wltcDriver(samples, timeS, speedKph, hvOk, stepS = 1, gradePct = 0) {
    const target = targetAt(samples, timeS + 0.35, stepS);
    const next = targetAt(samples, timeS + 0.95, stepS);
    const error = (target - speedKph) / 3.6;
    const feedForward = (next - target) / (3.6 * 0.60);
    const demand = 1.65 * error + feedForward + 9.81 * Math.sin(Math.atan(gradePct / 100));
    if (target < 0.05 && speedKph < 0.25) {
        return { accelerator: 0.1, brake: Math.max(0.12, -gradePct / 90), hv_ok: hvOk };
    }
    const accelerator = demand >= 0
        ? clamp(0.10 + 0.055 + speedKph * 0.0004 + 0.21 * demand, 0.1, 1)
        : clamp(0.10 * (1 + demand / 1.55), 0, 0.1);
    return {
        accelerator,
        brake: clamp((-demand - 1.55) / 8.0, 0, 1),
        compensate_regen: true,
        hv_ok: hvOk,
    };
}
// Instantaneous guide limits shared by both displays and the report.
export const guideBandKph = 2;
