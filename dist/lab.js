import { chamberDefaults, controlIntervalS, hvInterlockCode, isRollerTest, reducedBrakeForceFraction, rollerTests, ticksPerInterval, } from "./contracts.js";
import { benchmarkCycle, targetAt, wltcDriver } from "./cycle.js";
import { cocTests, finalKilometreSpeed, isCocScenario, rangeReservePct, rangeTimeLimitS, topSpeedDurationS, } from "./coc.js";
const csvColumns = [
    "time_s", "speed_kph", "target_kph", "measured_kph", "gear", "mode", "hv_state", "fault_code",
    "accelerator", "brake", "battery_voltage_v", "battery_current_a", "battery_power_kw", "measured_battery_power_kw",
    "battery_temp_c", "soc_pct", "motor_rpm", "motor_torque_nm", "regen_force_n",
    "friction_force_n", "road_load_kw", "distance_km", "energy_battery_out_kwh", "energy_battery_in_kwh",
    "energy_source_kwh", "source_kw", "energy_pack_cooling_electric_kwh", "energy_pack_heat_removed_kwh",
    "vehicle_energy_residual_j", "battery_energy_residual_j",
    "target_grade_pct", "net_pack_kwh_per_100km",
];
function packConsumption(state, config) {
    if (config.scenario === "charge-dc" || isRollerTest(config.scenario) || state.distance_km < 0.01)
        return null;
    return 100 * (state.energy_battery_out_kwh - state.energy_battery_in_kwh) / state.distance_km;
}
export class Lab {
    plant;
    measured;
    cycles;
    state;
    config;
    revision = 0;
    startedAt;
    accelerationTimes;
    samples = 0;
    targetSquaredError = 0;
    measuredSquaredError = 0;
    batterySquaredError = 0;
    measuredOutKwh = 0;
    measuredInKwh = 0;
    measuredDistanceKm = 0;
    cycle = null;
    benchmark;
    measuredSpeed;
    measuredPower;
    trace = [];
    plotted = [];
    coc;
    speedSamples = [];
    constructor(plant, benchmark, measured, cycles = new Map()) {
        this.plant = plant;
        this.measured = measured;
        this.cycles = cycles;
        this.benchmark = benchmarkCycle(benchmark);
        this.measuredSpeed = measured.points.map((point) => point.speedKph);
        this.measuredPower = measured.points.map((point) => point.batteryKw);
        if (this.measuredSpeed.length !== benchmark.length)
            throw new Error("Reference and target durations differ.");
    }
    async reset(config) {
        const cycle = (config.scenario === "wltc" || config.scenario === "coc-range") ? this.benchmark
            : config.scenario === "cycle" ? this.cycles.get(config.cycleId ?? "") : null;
        if (cycle === undefined)
            throw new Error("Unknown drive cycle.");
        const first = this.measured.points[0];
        const initialPack = config.scenario === "wltc" && config.profile !== "legacy"
            && config.socPct === this.measured.socPct
            && first?.voltageV != null && first.currentA != null
            ? { voltageV: first.voltageV, currentA: first.currentA } : undefined;
        const initialSpeedKph = isRollerTest(config.scenario) ? rollerTests[config.scenario].initialSpeedKph : 0;
        const state = await this.plant.reset({ ...config, initialPack, initialSpeedKph });
        this.state = state;
        this.config = { ...config };
        this.cycle = cycle;
        this.revision++;
        this.startedAt = undefined;
        this.accelerationTimes = config.scenario === "coc-speed"
            ? [100, 200].map(speedKph => ({ speedKph, timeS: null })) : undefined;
        this.samples = this.targetSquaredError = this.measuredSquaredError = this.batterySquaredError = 0;
        this.measuredOutKwh = this.measuredInKwh = this.measuredDistanceKm = 0;
        this.trace = [csvColumns.join(",")];
        this.plotted = [];
        this.coc = isCocScenario(config.scenario) ? { value: null, end: null } : undefined;
        this.speedSamples = config.scenario === "coc-speed"
            ? [{ timeS: state.time_s, distanceKm: state.distance_km, speedKph: state.speed_kph }] : [];
        this.record();
        return this.observe();
    }
    targetTime(timeS) {
        return this.config.scenario === "coc-range" ? timeS % this.benchmark.durationS : timeS;
    }
    faultAbortsTest() {
        return this.state.hv_state === "FAULT" && this.config.scenario !== "manual";
    }
    complete() {
        if (this.faultAbortsTest())
            return true;
        if (this.coc)
            return this.coc.end !== null;
        if (this.config.scenario === "charge-dc")
            return this.state.mode === "CHARGE_COMPLETE";
        if (isRollerTest(this.config.scenario))
            return this.state.speed_kph <= rollerTests[this.config.scenario].endSpeedKph;
        return this.cycle !== null && this.state.time_s >= this.cycle.durationS - 1e-9;
    }
    observe() {
        const cycle = this.cycle;
        const timeS = this.state.time_s;
        const scenario = this.config.scenario;
        const coc = isCocScenario(scenario) && this.coc ? { ...cocTests[scenario], ...this.coc } : undefined;
        return {
            revision: this.revision,
            startedAt: this.startedAt,
            faultCode: this.state.hv_state === "FAULT" ? hvInterlockCode : undefined,
            abortReason: this.faultAbortsTest() ? "hv-fault" : undefined,
            accelerationTimes: this.accelerationTimes?.map(point => ({ ...point })),
            config: { ...this.config },
            state: { ...this.state },
            chamber: { ...chamberDefaults, temperatureC: this.config.ambientC },
            targetKph: cycle ? targetAt(cycle.speedKph, this.targetTime(timeS), cycle.stepS) : null,
            cycleDurationS: this.config.scenario === "coc-range" ? 0 : cycle?.durationS ?? 0,
            complete: this.complete(),
            ...(coc && { coc }),
            targetRmseKph: this.samples > 0 ? Math.sqrt(this.targetSquaredError / this.samples) : null,
            consumptionKwhPer100Km: packConsumption(this.state, this.config),
            gradePct: cycle?.gradePct ? targetAt(cycle.gradePct, timeS, cycle.stepS) : null,
            comparison: this.samples === 0 || this.config.scenario !== "wltc" ? null : {
                targetRmseKph: Math.sqrt(this.targetSquaredError / this.samples),
                measuredRmseKph: Math.sqrt(this.measuredSquaredError / this.samples),
                batteryRmseKw: Math.sqrt(this.batterySquaredError / this.samples),
                measuredOutKwh: this.measuredOutKwh,
                measuredInKwh: this.measuredInKwh,
                measuredDistanceKm: this.measuredDistanceKm,
            },
        };
    }
    inputs(pedals) {
        const cycle = this.cycle;
        if (isRollerTest(this.config.scenario)) {
            const braking = this.config.scenario === "brake";
            return { gear: "N", awake: false, brake: braking ? 1 : 0,
                brake_force_fraction: braking && this.config.reducedBrakeForce ? reducedBrakeForceFraction : 1 };
        }
        const grade = cycle?.gradePct ? targetAt(cycle.gradePct, this.state.time_s, cycle.stepS) : 0;
        if (cycle && this.config.driver !== "pedals") {
            return { ...wltcDriver(cycle.speedKph, this.targetTime(this.state.time_s), this.state.speed_kph, pedals.hvOk, cycle.stepS, grade),
                grade_pct: grade };
        }
        if (this.config.scenario === "coc-speed")
            return { accelerator: 1, hv_ok: pedals.hvOk };
        if (this.config.scenario === "charge-dc") {
            return { gear: "P", plug: "dc", charger_kw: 150, charge_target_soc: 0.8, hv_ok: pedals.hvOk };
        }
        return {
            accelerator: pedals.accelerator, brake: pedals.brake, hv_ok: pedals.hvOk,
            compensate_regen: cycle !== null, grade_pct: grade,
        };
    }
    updateCoc(sampleDue, previousTime, previousSpeed) {
        if (!this.coc)
            return;
        const state = this.state;
        if (state.hv_state === "FAULT") {
            this.coc.end = "hv-fault";
            return;
        }
        if (this.config.scenario === "coc-range") {
            if (state.soc_pct <= rangeReservePct) {
                this.coc = { value: state.distance_km, end: "complete" };
            }
            else if (state.time_s >= rangeTimeLimitS - 1e-9) {
                this.coc.end = "time-limit";
            }
            return;
        }
        for (const point of this.accelerationTimes ?? []) {
            if (point.timeS === null && previousSpeed < point.speedKph && state.speed_kph >= point.speedKph) {
                const fraction = (point.speedKph - previousSpeed) / (state.speed_kph - previousSpeed);
                point.timeS = previousTime + fraction * (state.time_s - previousTime);
            }
        }
        if (sampleDue)
            this.speedSamples.push({ timeS: state.time_s, distanceKm: state.distance_km, speedKph: state.speed_kph });
        if (state.time_s >= topSpeedDurationS - 1e-9) {
            const speed = finalKilometreSpeed(this.speedSamples);
            this.coc = { value: speed, end: speed === null ? "unstable-speed" : "complete" };
        }
    }
    record() {
        const timeS = this.state.time_s;
        const cycle = this.cycle;
        const benchmark = this.config.scenario === "wltc";
        const targetKph = cycle ? targetAt(cycle.speedKph, this.targetTime(timeS), cycle.stepS) : null;
        const measuredKph = benchmark ? targetAt(this.measuredSpeed, timeS) : null;
        const measuredBatteryKw = benchmark ? targetAt(this.measuredPower, timeS) : null;
        const row = { ...this.state, target_kph: targetKph, measured_kph: measuredKph,
            fault_code: this.state.hv_state === "FAULT" ? hvInterlockCode : null,
            measured_battery_power_kw: measuredBatteryKw,
            target_grade_pct: cycle?.gradePct ? targetAt(cycle.gradePct, timeS, cycle.stepS) : null,
            net_pack_kwh_per_100km: packConsumption(this.state, this.config) };
        this.trace.push(csvColumns.map((key) => {
            const value = row[key];
            return typeof value === "number" ? Number(value.toFixed(8)).toString() : value ?? "";
        }).join(","));
        const point = { timeS, speedKph: this.state.speed_kph, targetKph, measuredKph,
            batteryKw: this.state.battery_power_kw, measuredBatteryKw };
        this.plotted.push(point);
        return point;
    }
    async advance(intervals, pedals) {
        const points = [];
        const cycle = this.cycle;
        const benchmark = this.config.scenario === "wltc";
        for (let index = 0; index < intervals; index++) {
            const previousTime = this.state.time_s;
            if (this.complete())
                break;
            const previousSpeed = this.state.speed_kph;
            const startedAt = this.startedAt ?? new Date().toISOString();
            this.state = await this.plant.step(ticksPerInterval, this.inputs(pedals));
            this.startedAt = startedAt;
            const timeS = this.state.time_s;
            // Normal traces sample each second. Braking records each control interval.
            const sampleDue = Math.floor(timeS + 1e-8) > Math.floor(previousTime + 1e-8);
            if (benchmark) {
                const midpoint = previousTime + controlIntervalS / 2;
                const measuredKw = targetAt(this.measuredPower, midpoint);
                this.measuredOutKwh += Math.max(0, measuredKw) * controlIntervalS / 3600;
                this.measuredInKwh += Math.max(0, -measuredKw) * controlIntervalS / 3600;
                this.measuredDistanceKm += targetAt(this.measuredSpeed, midpoint) * controlIntervalS / 3600;
            }
            if (cycle && sampleDue) {
                this.samples++;
                this.targetSquaredError += (this.state.speed_kph - targetAt(cycle.speedKph, this.targetTime(timeS), cycle.stepS)) ** 2;
                if (benchmark) {
                    this.measuredSquaredError += (this.state.speed_kph - targetAt(this.measuredSpeed, timeS)) ** 2;
                    this.batterySquaredError += (this.state.battery_power_kw - targetAt(this.measuredPower, timeS)) ** 2;
                }
            }
            this.updateCoc(sampleDue, previousTime, previousSpeed);
            if (sampleDue || this.config.scenario === "brake" || this.complete())
                points.push(this.record());
        }
        return { ...this.observe(), points };
    }
    plotHistory() {
        return this.plotted.slice();
    }
    exportCsv() {
        return this.trace.join("\n") + "\n";
    }
}
