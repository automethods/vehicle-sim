import { spawn } from "node:child_process";
import { cocTests, isCocScenario } from "./coc.js";
import { guideBandKph } from "./cycle.js";
import { isRollerTest, reducedBrakeForceFraction, rollerTests } from "./contracts.js";
const study = "https://doi.org/10.3390/wevj15060268";
export function runReport(snapshot, cycle) {
    const { state, config, comparison } = snapshot;
    const targetTime = snapshot.cycleDurationS;
    const consumption = snapshot.consumptionKwhPer100Km;
    const rollerTest = isRollerTest(config.scenario) ? rollerTests[config.scenario] : null;
    return {
        scenario: config.scenario,
        startedAt: snapshot.startedAt ?? null,
        faultCode: snapshot.faultCode ?? null,
        abortReason: snapshot.abortReason ?? null,
        rollerTest: rollerTest && {
            ...rollerTest,
            finalSpeedKph: state.speed_kph,
            brakeForcePct: config.scenario === "brake" ? (config.reducedBrakeForce ? 100 * reducedBrakeForceFraction : 100) : null,
            meanDeceleration: state.time_s > 0 ? (rollerTest.initialSpeedKph - state.speed_kph) / (3.6 * state.time_s) : null,
        },
        accelerationTimes: snapshot.accelerationTimes ?? [],
        coc: isCocScenario(config.scenario) && snapshot.coc ? { ...cocTests[config.scenario], ...snapshot.coc } : null,
        title: isCocScenario(config.scenario) ? cocTests[config.scenario].title : rollerTest?.title ?? cycle?.title ?? (config.scenario === "charge-dc" ? "DC fast charging" : "Manual driving"),
        vehicle: "Tesla Model 3 Standard Range Plus · 2020 · LFP · RWD",
        status: snapshot.abortReason ? "Test ended" : targetTime ? (snapshot.complete ? "Cycle complete" : "Partial cycle")
            : snapshot.coc ? (snapshot.coc.end === "complete" ? "Test complete" : snapshot.coc.end ? "Test ended" : "Test in progress")
                : snapshot.complete ? "Test complete" : "Recorded segment",
        driver: cycle ? (config.driver === "pedals" ? "Manual pedals" : "Automatic") : null,
        source: cycle?.source ?? null,
        guideBandKph,
        cycleId: cycle?.id ?? null,
        phases: cycle?.phases ?? [],
        sampleStep: cycle?.stepS ?? null,
        study,
        elapsedS: state.time_s,
        targetTime,
        initialSoc: config.socPct,
        finalSoc: state.soc_pct,
        initialTemp: config.temperatureC,
        finalTemp: state.battery_temp_c,
        ambient: config.ambientC,
        chamber: snapshot.chamber,
        distance: state.distance_km,
        out: state.energy_battery_out_kwh,
        into: state.energy_battery_in_kwh,
        net: state.energy_battery_out_kwh - state.energy_battery_in_kwh,
        sourceEnergy: config.scenario === "charge-dc" ? state.energy_source_kwh : null,
        roadLoadKw: config.scenario === "coc-speed" ? state.road_load_kw : null,
        coolingEnergy: state.energy_pack_cooling_electric_kwh ?? 0,
        heatRemoved: state.energy_pack_heat_removed_kwh ?? 0,
        consumption,
        targetRmse: snapshot.targetRmseKph,
        vehicleResidual: state.vehicle_energy_residual_j,
        batteryResidual: state.battery_energy_residual_j,
        comparison: comparison && {
            distance: comparison.measuredDistanceKm,
            out: comparison.measuredOutKwh,
            into: comparison.measuredInKwh,
            speedRmse: comparison.measuredRmseKph,
            powerRmse: comparison.batteryRmseKw,
            net: comparison.measuredOutKwh - comparison.measuredInKwh,
            consumption: comparison.measuredDistanceKm >= 0.01
                ? 100 * (comparison.measuredOutKwh - comparison.measuredInKwh) / comparison.measuredDistanceKm : null,
        },
    };
}
export function engdocReport(report) {
    const content = (text) => [{ kind: "text", text }];
    const heading = (id, level, text) => ({ id, kind: "heading", level, content: content(text) });
    const paragraph = (id, text) => ({ id, kind: "paragraph", content: content(text) });
    const inputs = [
        { id: "distance", label: "Distance travelled", symbol: "d", value: report.distance, unit: "km" },
        { id: "discharge", label: "Energy discharged from pack", symbol: "Eout", value: report.out, unit: "kWh" },
        { id: "returned", label: "Energy returned to pack", symbol: "Ein", value: report.into, unit: "kWh" },
    ];
    const values = inputs.map(({ id, label, symbol, value, unit }) => ({
        id: "run." + id, ownerNodeId: id, role: "input", label, symbol,
        value: { kind: "quantity", value, canonicalUnit: unit },
    }));
    const nodes = [
        heading("title", 1, report.title),
        paragraph("vehicle", report.vehicle),
        ...(report.startedAt ? [paragraph("test-date", "Test start (UTC) " + report.startedAt.slice(0, 19).replace("T", " "))] : []),
        paragraph("coc-definition", "Published vehicle specifications include values from the vehicle’s Certificate of Conformity (CoC)."),
        paragraph("status", report.status + " · " + report.elapsedS.toFixed(1) + " s"
            + (report.targetTime ? " / " + report.targetTime + " s · " + report.driver : "")),
        paragraph("conditions", "Simulated chamber air " + report.ambient.toFixed(1) + " °C. Relative humidity "
            + report.chamber.humidityPct + " % and pressure " + report.chamber.pressureKpa.toFixed(3) + " kPa. Pack temperature "
            + report.initialTemp.toFixed(1) + " → " + report.finalTemp.toFixed(1) + " °C. State of charge "
            + report.initialSoc.toFixed(1) + " → " + report.finalSoc.toFixed(1) + " %."),
        heading("energy", 2, "Pack energy and distance"),
        ...inputs.map(({ id }) => ({ id, kind: "input", valueId: "run." + id })),
    ];
    const calculations = [{
            id: "run.net", ownerNodeId: "net", role: "calculation", label: "Net pack energy", symbol: "Enet",
            valueType: "quantity", canonicalUnit: "kWh", expression: {
                source: "Eout - Ein", bindings: inputs.slice(1).map(({ id, symbol }) => ({ token: symbol, valueId: "run." + id })),
            },
        }];
    const equations = new Map([["net", String.raw `E_{net}=E_{out}-E_{in}`]]);
    nodes.push({ id: "net", kind: "calculation", valueId: "run.net" });
    if (report.consumption !== null) {
        calculations.push({
            id: "run.consumption", ownerNodeId: "consumption", role: "calculation", label: "Net pack consumption", symbol: "C",
            valueType: "quantity", canonicalUnit: "Wh/km", expression: {
                source: "Enet / d", bindings: [{ token: "Enet", valueId: "run.net" }, { token: "d", valueId: "run.distance" }],
            },
        });
        equations.set("consumption", String.raw `C=\frac{E_{net}}{d}`);
        nodes.push({ id: "consumption", kind: "calculation", valueId: "run.consumption" });
    }
    nodes.push(paragraph("boundary", "Energy is measured at the DC pack terminals. Divide Wh/km by 10 for kWh/100 km. "
        + "Consumption is omitted for charging and runs under 10 m."), heading("checks", 2, "Simulation checks"), paragraph("balance", "Energy-balance residuals: vehicle " + report.vehicleResidual.toExponential(2)
        + " J, battery " + report.batteryResidual.toExponential(2) + " J."));
    if (report.coc) {
        const result = report.coc.value === null ? "Pending or unavailable"
            : report.coc.value.toFixed(1) + " " + report.coc.unit;
        nodes.push(paragraph("coc-comparison", "Simulation result: " + result + ". Published CoC reference: "
            + report.coc.reference + " " + report.coc.unit + " [1]."));
    }
    if (report.accelerationTimes.length) {
        const times = report.accelerationTimes.map(({ speedKph, timeS }) => "0–" + speedKph + " km/h " + (timeS === null ? "—" : timeS.toFixed(1) + " s"));
        nodes.push(paragraph("acceleration", times.join(" · ") + ". Times are measured from test start, including precharge."));
        nodes.push(paragraph("road-load", "Simulated road-load power at the end of the test was "
            + report.roadLoadKw?.toFixed(1) + " kW. The road load includes aerodynamic drag [1]."));
    }
    if (report.coolingEnergy > 0) {
        nodes.push(paragraph("cooling", "Pack cooling used " + report.coolingEnergy.toFixed(3)
            + " kWh of electricity and removed " + report.heatRemoved.toFixed(3) + " kWh of heat."));
    }
    if (report.targetRmse !== null) {
        nodes.push(paragraph("tracking", "Speed RMSE against the target was " + report.targetRmse.toFixed(2) + " km/h."));
    }
    if (report.comparison) {
        nodes.push(paragraph("reference", "TUM reference: " + report.comparison.net.toFixed(3) + " kWh net pack energy. "
            + (report.comparison.consumption === null ? "" : report.comparison.consumption.toFixed(2) + " kWh/100 km. ")
            + "Simulation RMSE against TUM: " + report.comparison.speedRmse.toFixed(2) + " km/h, "
            + report.comparison.powerRmse.toFixed(2) + " kW."));
    }
    if (report.sourceEnergy !== null) {
        nodes.push(paragraph("source-energy", "DC source delivered " + report.sourceEnergy.toFixed(3) + " kWh."));
    }
    if (report.cycleId && ["wltc", "wltc-city", "wltc-3b-three-phase"].includes(report.cycleId)) {
        nodes.push(paragraph("schedule-source", "The speed cycle follows the Worldwide Harmonized Light Vehicles Test Procedure (WLTP). "
            + "UN Regulation No. 154 defines the cycles in Annex B1 and the electric energy and range procedure in Annex B8. "
            + "https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ%3AL_202601130"));
    }
    nodes.push(paragraph("model-source", "Vehicle model and reference study: " + report.study));
    return {
        format: "engdoc-wordcraft-lab/0.1",
        native: {
            format: "engdoc-native-draft/0.3", id: "doc.vehicle-run", title: report.title,
            pageSetup: { size: "A4", orientation: "portrait", marginMm: 22 },
            nodes, values: [...values, ...calculations],
        },
        appearance: { title: { font: "sans", size: 32, color: "#10263B" } },
        equations: Object.fromEntries([...equations].map(([id, source]) => [id, { source, notation: "latex" }])),
    };
}
export function pdfReport(python, script, report, traceCsv, lang, benchmark, diagnostics) {
    return new Promise((resolve, reject) => {
        const renderer = spawn(python, [script], { timeout: 20_000 });
        const chunks = [];
        let stderr = "";
        renderer.stderr.setEncoding("utf8");
        renderer.stderr.on("data", (chunk) => { stderr += chunk; });
        renderer.stdout.on("data", (chunk) => chunks.push(chunk));
        renderer.on("error", reject);
        renderer.stdin.on("error", () => { }); // The exit handler reports the renderer's diagnostic on a closed pipe.
        renderer.on("close", (code) => {
            if (code === 0 && chunks.length)
                resolve(Buffer.concat(chunks));
            else
                reject(new Error(stderr.trim() || "Unable to render the PDF report."));
        });
        renderer.stdin.end(JSON.stringify({ ...report, traceCsv, lang, benchmark, diagnostics }));
    });
}
