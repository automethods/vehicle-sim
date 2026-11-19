import { createScene } from "./scene.js";
import { benchmarkCycle, class3bTitle, cycleFromCsv, cycleInfo, guideBandKph, targetAt } from "./cycle.js";
import { isRollerTest, rollerTests } from "./contracts.js";
const brandMark = document.querySelector(".brand-mark");
const brandColors = getComputedStyle(brandMark);
const faviconMark = brandMark.cloneNode(true);
for (const color of ["--brand-outline", "--brand-center"]) {
    faviconMark.style.setProperty(color, brandColors.getPropertyValue(color).trim());
}
const favicon = document.createElement("link");
favicon.rel = "icon";
favicon.type = "image/svg+xml";
favicon.href = "data:image/svg+xml," + encodeURIComponent(new XMLSerializer().serializeToString(faviconMark));
document.head.append(favicon);
function element(id) {
    const node = document.getElementById(id);
    if (!node)
        throw new Error("Missing page element: " + id);
    return node;
}
const run = element("run");
const reset = element("reset");
const scenario = element("scenario");
const vehicleSelect = element("vehicle-select");
const otherScenario = element("other-scenario");
const otherTests = element("other-tests");
const rangeRate = element("rate").querySelector('option[value="400"]');
const rate = element("rate");
const cycleDriver = element("cycle-driver");
const rollerSetup = element("roller-setup");
let preferredRollerSetup = rollerSetup.value;
const brakeFault = element("brake-fault");
const chargingMetrics = document.querySelectorAll("[data-charging-metric]");
const drivingMetrics = document.querySelectorAll("[data-driving-metric]");
const socInput = element("soc-input");
const tempInput = element("temp-input");
const accelerator = element("accelerator");
const brake = element("brake");
const hvFault = element("hv-fault");
const errorBox = element("error");
const canvas = element("vehicle");
const sceneStatus = element("scene-fallback");
const plot = element("speed-plot");
const traceSignal = element("trace-signal");
const pen = plot.getContext("2d");
const updatePeriodMs = 100;
let benchView = "cell";
const benchViews = ["cell", "driver", "operator"];
const heldPedalKeys = new Set();
const pedalKeys = new Set(["KeyW", "ArrowUp", "KeyS", "ArrowDown", "Space"]);
let guideExpanded = false;
let driverDisplay;
let data;
let points = [];
let running = false;
let resetting = false;
let timer;
let inFlight;
let vehicle;
let scene;
const schedules = new Map();
let t = (value) => value === "Actual readout" ? "Actual" : value === "Target readout" ? "Target" : value;
let language = "en";
let legacyBenchmark;
let reportsAvailable = false;
let authenticated = false;
let activeCycle;
let sceneMessage = "";
let diagnostics;
const diagnosticPanel = element("diagnostics");
const diagnosticAppendix = element("diagnostic-appendix");
const diagnosticCsvLink = element("diagnostic-csv");
const diagnosticRows = new Map();
const notes = {
    manual: "Control the pedals while the simulation drives the rollers.",
    wltc: "The run follows the standard Class 3b cycle for this electric vehicle under WLTP (Worldwide Harmonized Light Vehicles Test Procedure). The run traces show the TUM reference pass with a 9 s recording offset.",
    "coc-speed": "Full throttle for 90 s with level-road load, including air resistance. The result is the average over the final kilometre if the speed stays steady.",
    "coc-range": "Repeats the full WLTC Class 3b from 100% charge to a 1% simulated reserve. The result is the distance travelled.",
    "charge-dc": "The parked car charges from a 150 kW DC source up to 80% SOC. A cold pack requests motor heat.",
    brake: "Starts at 50 km/h on level ground and applies the friction brakes in neutral until the vehicle stops.",
    coastdown: "Coasts from 100 to 20 km/h in neutral on level ground. Road load slows the vehicle.",
};
function populateCycles(catalog) {
    const groups = new Map();
    for (const cycle of catalog) {
        schedules.set(cycle.id, cycle);
        if (cycle.id === "wltc")
            continue;
        let group = groups.get(cycle.group);
        if (!group) {
            group = document.createElement("optgroup");
            group.label = t(cycle.group);
            group.dataset.name = cycle.group;
            groups.set(cycle.group, group);
            otherScenario.append(group);
        }
        group.append(new Option(cycle.title + " · " + timeLabel(cycle.durationS).split(".")[0], cycle.id));
    }
}
function selectedExperiment() {
    return scenario.value === "other" ? otherScenario.value : scenario.value;
}
function selectExperiment(snapshot) {
    const other = snapshot.config.scenario === "cycle";
    scenario.value = other ? "other" : snapshot.config.scenario;
    otherScenario.value = other ? snapshot.config.cycleId ?? "" : "";
    if (other)
        otherTests.open = true;
}
async function api(url, body) {
    const response = await fetch("." + url, body === undefined ? undefined : {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const reply = await response.json();
    if (!response.ok)
        throw new Error(reply.error || "The model did not respond.");
    return reply;
}
async function loadCatalog() {
    const response = await fetch("./api/cycles");
    if (response.status !== 404) {
        if (!response.ok)
            throw new Error("Drive-cycle catalog unavailable.");
        return response.json();
    }
    // A previously started lab can still be serving the completed or paused benchmark.
    const benchmarkResponse = await fetch("./data/wltc-class-3b.csv");
    if (!benchmarkResponse.ok)
        throw new Error("Benchmark target trace unavailable.");
    legacyBenchmark = benchmarkCycle(cycleFromCsv(await benchmarkResponse.text()));
    return [cycleInfo(legacyBenchmark)];
}
function display(id, value) {
    element(id).textContent = value;
}
function rpmLabel(speedKph, radius) {
    return (speedKph * 1000 / (120 * Math.PI * radius)).toFixed(0) + " " + t("rpm");
}
function rollerReadouts(speedKph) {
    if (!vehicle)
        return;
    const rearOnly = rollerSetup.value === "rear";
    display("wheel-speed", (t(rearOnly ? "Rear wheels" : "All wheels") + " ") + rpmLabel(speedKph, vehicle.wheelRadiusM));
    display("roller-speed", (t(rearOnly ? "Rear drums" : "Synced drums") + " ") + rpmLabel(speedKph, vehicle.rollerRadiusM));
}
function timeLabel(seconds) {
    const tenth = Math.round(seconds * 10);
    const minutes = Math.floor(tenth / 600);
    const rest = (tenth % 600 / 10).toFixed(1).padStart(4, "0");
    return String(minutes).padStart(2, "0") + ":" + rest;
}
function drawPlot() {
    const box = plot.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0)
        return;
    const scale = Math.min(window.devicePixelRatio, 2);
    const w = box.width;
    const h = box.height;
    if (plot.width !== Math.round(w * scale) || plot.height !== Math.round(h * scale)) {
        plot.width = Math.round(w * scale);
        plot.height = Math.round(h * scale);
    }
    pen.setTransform(scale, 0, 0, scale, 0, 0);
    pen.clearRect(0, 0, w, h);
    const left = 42;
    const right = w - 23;
    const top = 22;
    const bottom = h - 24;
    const power = traceSignal.value === "power";
    const lastTime = data?.state.time_s ?? points.at(-1)?.timeS ?? 0;
    const current = data && (power ? data.state.battery_power_kw : data.state.speed_kph);
    const cycle = power ? undefined : activeCycle;
    const brakeTest = data?.config.scenario === "brake";
    const xMax = activeCycle?.durationS ?? (brakeTest
        ? Math.max(3, Math.ceil(lastTime * 2) / 2)
        : Math.max(15, Math.ceil(lastTime / 15) * 15));
    const targetPoints = cycle ? (() => {
        const count = Math.max(1, Math.min(cycle.speedKph.length - 1, Math.ceil(w * 2)));
        return Array.from({ length: count + 1 }, (_, index) => {
            const time = index * cycle.durationS / count;
            return { time, speed: targetAt(cycle.speedKph, time, cycle.stepS) };
        });
    })() : points.flatMap(({ timeS, targetKph }) => !power && targetKph != null ? [{ time: timeS, speed: targetKph }] : []);
    const series = power
        ? [["measuredBatteryKw", "#e7b77a", [2, 3]], ["batteryKw", "#63e1cb", []]]
        : [["speedKph", "#63e1cb", []], ["measuredKph", "#e7b77a", [2, 3]]];
    let yMin = power ? Math.min(-20, Math.floor((current ?? 0) / 20) * 20) : 0;
    const chargingPower = power && data?.config.scenario === "charge-dc";
    let yMax = Math.max(power ? (chargingPower ? 0 : 20) : 40, Math.ceil((current ?? 0) / 20) * 20);
    for (const point of points) {
        for (const [key] of series) {
            const value = point[key] ?? 0;
            yMin = Math.min(yMin, Math.floor(value / 20) * 20);
            yMax = Math.max(yMax, Math.ceil(value / 20) * 20);
        }
    }
    if (targetPoints.length) {
        yMin = -5;
        for (const point of targetPoints)
            yMax = Math.max(yMax, Math.ceil((point.speed + guideBandKph) / 20) * 20);
    }
    const x = (time) => left + (right - left) * time / xMax;
    const y = (value) => bottom - (bottom - top) * (value - yMin) / (yMax - yMin);
    pen.font = "11px system-ui";
    pen.fillStyle = "#a5b8ca";
    pen.strokeStyle = "#2a3b4c";
    pen.lineWidth = 1;
    pen.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
        const value = yMin + (yMax - yMin) * i / 4;
        const py = y(value);
        pen.beginPath();
        pen.moveTo(left, py);
        pen.lineTo(right, py);
        pen.stroke();
        pen.fillText(value.toFixed(0), left - 8, py + 4);
    }
    pen.textAlign = "center";
    for (let i = 0; i <= 3; i++) {
        const time = xMax * i / 3;
        const label = String(brakeTest ? Number(time.toFixed(1)) : Math.round(time)) + (i === 3 ? " " + t("s") : "");
        pen.fillText(label, x(time), bottom + 14);
    }
    pen.textAlign = "left";
    pen.fillText(t(power ? "kW" : "km/h"), 1, 11);
    const targetPath = (offset, reverse = false) => {
        (reverse ? [...targetPoints].reverse() : targetPoints).forEach(({ time, speed }, index) => {
            if (!reverse && index === 0)
                pen.moveTo(x(time), y(speed + offset));
            else
                pen.lineTo(x(time), y(speed + offset));
        });
    };
    if (targetPoints.length > 1) {
        pen.beginPath();
        targetPath(guideBandKph);
        targetPath(-guideBandKph, true);
        pen.closePath();
        pen.fillStyle = "#f2bc7438";
        pen.fill();
        pen.strokeStyle = "#f2bc74";
        pen.lineWidth = 1;
        pen.setLineDash([]);
        for (const offset of [-guideBandKph, guideBandKph]) {
            pen.beginPath();
            targetPath(offset);
            pen.stroke();
        }
    }
    for (const [key, color, dash] of series) {
        if (!points.length)
            continue;
        pen.beginPath();
        pen.lineWidth = dash.length === 0 ? 2.1 : 1.3;
        pen.strokeStyle = color;
        pen.setLineDash(dash);
        let started = false;
        for (const point of points) {
            const value = point[key];
            if (value == null)
                continue;
            if (started)
                pen.lineTo(x(point.timeS), y(value));
            else
                pen.moveTo(x(point.timeS), y(value));
            started = true;
        }
        if (started && !dash.length && current !== undefined && lastTime > points.at(-1).timeS) {
            pen.lineTo(x(lastTime), y(current));
        }
        pen.stroke();
    }
    if (targetPoints.length > 1) {
        pen.beginPath();
        targetPath(0);
        pen.strokeStyle = "#8fbbff";
        pen.lineWidth = 1.6;
        pen.setLineDash([5, 4]);
        pen.stroke();
    }
    pen.setLineDash([]);
    if (!power) {
        for (const { speedKph, timeS } of data?.accelerationTimes ?? []) {
            if (timeS === null)
                continue;
            const marker = x(timeS);
            const speed = y(speedKph);
            pen.strokeStyle = "#f0c282";
            pen.fillStyle = "#f0c282";
            pen.setLineDash([3, 3]);
            pen.beginPath();
            pen.moveTo(marker, bottom);
            pen.lineTo(marker, speed);
            pen.stroke();
            pen.setLineDash([]);
            pen.beginPath();
            pen.arc(marker, speed, 3.5, 0, 2 * Math.PI);
            pen.fill();
            pen.font = "bold 11px system-ui";
            const label = speedKph + " " + t("km/h") + " · " + timeS.toFixed(1) + " " + t("s");
            pen.fillText(label, Math.min(marker + 7, right - pen.measureText(label).width), Math.max(top + 11, speed - 7));
        }
    }
    if (current !== undefined) {
        const marker = x(Math.min(lastTime, xMax));
        pen.strokeStyle = "#e2f0f9";
        pen.lineWidth = 1.2;
        pen.setLineDash([3, 3]);
        pen.beginPath();
        pen.moveTo(marker, top);
        pen.lineTo(marker, bottom);
        pen.stroke();
        pen.setLineDash([]);
        pen.beginPath();
        pen.arc(marker, y(current), 4, 0, 2 * Math.PI);
        pen.fillStyle = "#63e1cb";
        pen.fill();
        pen.stroke();
        pen.font = "bold 11px system-ui";
        pen.fillStyle = "#e2f0f9";
        const timestamp = timeLabel(lastTime);
        const labelX = Math.min(right - pen.measureText(timestamp).width, marker + 5);
        pen.fillText(timestamp, labelX, top - 6);
    }
}
new ResizeObserver(drawPlot).observe(plot);
function translateDiagnosticRows() {
    if (!diagnostics)
        return;
    for (const [id, row] of diagnosticRows) {
        const signal = diagnostics.diagnosticSignals[id];
        row.name.textContent = language === "uk" ? signal.uk : signal.label;
        row.include.setAttribute("aria-label", t("Export") + " · " + row.name.textContent);
    }
}
function setupDiagnostics() {
    if (!diagnostics)
        return;
    const table = element("diagnostic-signals");
    for (const id of diagnostics.diagnosticIds) {
        const row = document.createElement("tr");
        const label = document.createElement("th");
        label.scope = "row";
        const reading = document.createElement("td");
        const exportCell = document.createElement("td");
        const include = document.createElement("input");
        include.type = "checkbox";
        include.checked = true;
        exportCell.append(include);
        row.append(label, reading, exportCell);
        table.append(row);
        diagnosticRows.set(id, { name: label, reading, include });
    }
    table.addEventListener("change", updateDiagnosticExportLinks);
    diagnosticAppendix.addEventListener("change", updateDiagnosticExportLinks);
    diagnosticPanel.addEventListener("toggle", () => { if (data)
        showDiagnostics(data); });
    translateDiagnosticRows();
    updateDiagnosticExportLinks();
    diagnosticPanel.hidden = false;
}
function showDiagnostics(snapshot) {
    if (!diagnostics || !diagnosticPanel.open)
        return;
    for (const [id, row] of diagnosticRows) {
        const signal = diagnostics.diagnosticSignals[id];
        const value = diagnostics.diagnosticValue(id, snapshot.state[signal.field]);
        row.reading.textContent = value.toFixed(signal.digits) + " " + t(signal.unit);
        if (id === "speed") {
            display("diagnostic-speed-reply", diagnostics.speedReply(value));
            display("diagnostic-speed-decoded", "(" + value + " " + t("km/h") + ")");
        }
    }
}
function updateDiagnosticExportLinks() {
    if (!diagnostics)
        return;
    const ids = [...diagnosticRows].filter(([, row]) => row.include.checked).map(([id]) => id);
    diagnosticAppendix.disabled = ids.length === 0;
    if (diagnosticAppendix.disabled)
        diagnosticAppendix.checked = false;
    diagnosticCsvLink.hidden = diagnosticAppendix.disabled || (data?.state.time_s ?? 0) === 0;
    const csv = new URL("./api/diagnostics.csv", location.href);
    for (const id of ids)
        csv.searchParams.append("signal", id);
    diagnosticCsvLink.href = csv.href;
    for (const link of document.querySelectorAll('a[href*="/api/report.pdf"]')) {
        const url = new URL(link.href);
        url.searchParams.delete("diagnostics");
        url.searchParams.delete("signal");
        if (diagnosticAppendix.checked && ids.length) {
            url.searchParams.set("diagnostics", "1");
            for (const id of ids)
                url.searchParams.append("signal", id);
        }
        link.href = url.href;
    }
}
function updateExports() {
    const recorded = (data?.state.time_s ?? 0) > 0;
    element("run-exports").hidden = !authenticated || !recorded;
    element("report-exports").hidden = !reportsAvailable;
    element("diagnostic-exports").hidden = !diagnostics || !authenticated;
    diagnosticCsvLink.hidden = diagnosticAppendix.disabled || !recorded;
    element("export-signin").hidden = authenticated;
    const completed = data?.complete === true;
    element("report-ready").hidden = !completed;
    const ended = data?.abortReason || (data?.coc?.end && data.coc.end !== "complete");
    element("report-status").textContent = t(ended ? "Test ended" : "Test complete");
    element("complete-pdf").hidden = !authenticated || !reportsAvailable;
    element("complete-signin").hidden = authenticated;
}
async function refreshAccount() {
    const session = await api("/api/session").catch(() => null);
    authenticated = session?.authenticated === true;
    updateExports();
}
window.addEventListener("focus", () => void refreshAccount());
void refreshAccount();
function updateTrace() {
    const power = traceSignal.value === "power";
    element("target-key").hidden = element("target-band-key").hidden = power || data?.targetKph == null;
    const label = t(power ? "Battery terminal power versus simulation time" : "Vehicle speed versus simulation time");
    plot.setAttribute("aria-label", data ? label + " · " + t("Simulated time") + " " + timeLabel(data.state.time_s) : label);
    drawPlot();
}
traceSignal.addEventListener("change", updateTrace);
function updateOperator(snapshot) {
    const state = snapshot.state;
    const operatorMode = snapshot.config.scenario === "charge-dc" ? "DC charging"
        : snapshot.config.scenario === "manual" || snapshot.config.driver === "pedals" ? "Manual pedals" : "Automatic";
    const status = snapshot.faultCode ? "Fault" : snapshot.complete ? "Complete" : running ? "Running" : state.time_s > 0 ? "Paused" : "Ready";
    display("operator-status", t(status));
    element("operator-status").dataset.state = status.toLowerCase();
    display("operator-mode", t(operatorMode));
    display("operator-speed", state.speed_kph.toFixed(1) + " km/h");
    display("operator-target", snapshot.targetKph === null ? "—" : snapshot.targetKph.toFixed(1) + " km/h");
    display("operator-road-load", state.road_load_kw.toFixed(2) + " kW");
    display("operator-distance", state.distance_km.toFixed(3) + " km");
    display("operator-rpm", vehicle ? rpmLabel(state.speed_kph, vehicle.rollerRadiusM) : "—");
    display("operator-ambient", snapshot.config.ambientC.toFixed(1) + " °C");
    display("operator-pack-temp", state.battery_temp_c.toFixed(1) + " °C");
    display("operator-soc", state.soc_pct.toFixed(1) + " %");
    display("operator-hv", state.hv_state);
}
function manualPedals() {
    return data?.config.scenario === "manual" || (data?.targetKph != null && data.config.driver === "pedals");
}
function updateCabin() {
    const canShowGuide = Boolean(driverDisplay) && (data?.cycleDurationS ?? 0) > 0 && data?.targetKph != null;
    const expanded = canShowGuide && (guideExpanded || !scene);
    const toggle = element("show-guide");
    toggle.hidden = !canShowGuide || !scene;
    toggle.textContent = t(expanded ? "Cabin view" : "Full guide");
    toggle.setAttribute("aria-pressed", String(expanded));
    element("guide-panel").hidden = !expanded;
    element("driver-camera").hidden = expanded;
    element("driver-camera-fallback").hidden = Boolean(scene);
}
function updateControls() {
    const selected = selectedExperiment();
    const driveCycle = schedules.has(selected);
    const usingPedals = selected === "manual" || (driveCycle && cycleDriver.value === "pedals");
    const fixedConditions = selected === "wltc" || selected === "coc-speed" || selected === "coc-range";
    socInput.disabled = tempInput.disabled = fixedConditions || resetting;
    element("cycle-driver-field").hidden = !driveCycle || !driverDisplay;
    cycleDriver.disabled = !driveCycle || running || resetting;
    element("pedals").hidden = !usingPedals;
    display("experiment-note", t(driveCycle && usingPedals
        ? "Follow the target on the Driver display with the pedals below."
        : notes[selected] ?? "The automatic driver follows the selected speed schedule."));
    scenario.disabled = otherScenario.disabled = vehicleSelect.disabled = resetting || !data;
    const rollerTest = isRollerTest(selected);
    rollerSetup.disabled = resetting || rollerTest;
    element("brake-fault-field").hidden = selected !== "brake";
    brakeFault.disabled = running || resetting;
    element("hv-fault-field").hidden = rollerTest;
    run.disabled = resetting || !data || data.complete;
    reset.disabled = resetting || !data;
    run.textContent = t(data?.abortReason ? "Test ended" : data?.complete ? "Complete" : running ? "Pause" : "Run test");
    if (data) {
        updateCabin();
        driverDisplay?.show(data, points, running);
        if (benchView === "operator")
            updateOperator(data);
    }
}
function setSceneMessage(message) {
    sceneMessage = message;
    sceneStatus.textContent = t(message);
    sceneStatus.hidden = message === "";
}
function showBenchView(next) {
    for (const view of benchViews) {
        element(view + "-view").hidden = view !== next;
        element("show-" + view).setAttribute("aria-pressed", String(view === next));
    }
    if (next === "operator") {
        element("operator-camera").prepend(canvas);
        element("operator-camera-fallback").hidden = Boolean(scene);
        scene?.view("station");
        scene?.pit(false);
        scene?.cutaway(false);
    }
    else if (next === "driver") {
        element("driver-camera").prepend(canvas);
        scene?.view("eye");
        scene?.pit(false);
        scene?.cutaway(false);
        updateCabin();
    }
    else {
        element("cell-view").prepend(canvas);
        const camera = document.querySelector("[data-view][aria-pressed='true']");
        scene?.view(camera?.dataset.view ?? "station");
        scene?.pit(element("pit-view").getAttribute("aria-pressed") === "true");
        scene?.cutaway(element("cutaway").getAttribute("aria-pressed") === "true");
    }
    if (scene)
        canvas.after(sceneStatus);
    benchView = next;
    if (next === "operator" && data)
        updateOperator(data);
}
function show(snapshot, newRun = false, history) {
    if (newRun && data?.config.scenario !== snapshot.config.scenario) {
        traceSignal.value = snapshot.config.scenario === "charge-dc" ? "power" : "speed";
    }
    data = snapshot;
    element("vehicle-fault").hidden = element("diagnostic-fault").hidden = !snapshot.faultCode;
    display("setup-fault-code", snapshot.faultCode ?? "");
    display("diagnostic-fault-code", snapshot.faultCode ?? "");
    showDiagnostics(snapshot);
    if (snapshot.chamber) {
        const { temperatureC, humidityPct, pressureKpa } = snapshot.chamber;
        display("chamber-air", temperatureC.toFixed(1) + " °C");
        display("chamber-humidity", humidityPct + " %");
        display("chamber-pressure", pressureKpa.toFixed(3) + " " + t("kPa"));
        scene?.climate(snapshot.chamber);
    }
    if (newRun) {
        points = history?.length ? history : [{ timeS: snapshot.state.time_s, speedKph: snapshot.state.speed_kph,
                targetKph: snapshot.targetKph, measuredKph: null,
                batteryKw: snapshot.state.battery_power_kw, measuredBatteryKw: null }];
        selectExperiment(snapshot);
        const selected = selectedExperiment();
        vehicleSelect.value = snapshot.config.vehicleId ?? vehicle?.id ?? "";
        if (vehicle) {
            display("vehicle-title", "Tesla " + vehicle.title);
            display("vehicle-configuration", vehicle.configuration.replace("RWD", t("RWD")));
        }
        brakeFault.checked = snapshot.config.reducedBrakeForce === true;
        rollerSetup.value = isRollerTest(selected) ? "sync" : preferredRollerSetup;
        scene?.rollerSetup(rollerSetup.value === "rear");
        for (const metric of chargingMetrics)
            metric.hidden = selected !== "charge-dc";
        for (const metric of drivingMetrics)
            metric.hidden = selected === "charge-dc";
        if (selected === "brake")
            rate.value = "1";
        const rangeTest = selected === "coc-range";
        rangeRate.hidden = rangeRate.disabled = !rangeTest;
        if (rangeTest)
            rate.value = rangeRate.value;
        else if (rate.value === rangeRate.value)
            rate.value = "1";
        activeCycle = undefined;
        driverDisplay?.setCycle();
        scene?.monitor(snapshot.state.speed_kph, snapshot.targetKph);
        if (snapshot.targetKph != null && snapshot.cycleDurationS > 0) {
            const trace = legacyBenchmark ? Promise.resolve(legacyBenchmark)
                : api("/api/cycles/" + encodeURIComponent(selected));
            void trace.then((cycle) => {
                if (data?.revision !== snapshot.revision)
                    return;
                activeCycle = cycle.id === "wltc" ? { ...cycle, title: class3bTitle } : cycle;
                driverDisplay?.setCycle(activeCycle);
                updateTrace();
                updateControls();
            }).catch((error) => {
                if (data?.revision === snapshot.revision)
                    fail(error);
            });
        }
        cycleDriver.value = snapshot.config.driver ?? "automatic";
        socInput.value = String(snapshot.config.socPct);
        tempInput.value = String(snapshot.config.temperatureC);
    }
    const state = snapshot.state;
    updateExports();
    const charge = snapshot.config.scenario === "charge-dc";
    scene?.charging(charge, !snapshot.complete && state.source_kw > 0);
    scene?.coolingFans(running && !charge && state.hv_state !== "FAULT", state.speed_kph);
    scene?.brakeLights(state.friction_force_n > 10);
    const result = snapshot.coc;
    element("coc-result").hidden = !result;
    if (result) {
        const unit = t(result.unit);
        display("coc-sim", result.value == null ? "—" : result.value.toFixed(1) + " " + unit);
        display("coc-ref", result.reference + " " + unit);
        const endings = {
            complete: "Test complete",
            "hv-fault": "Test stopped by a high-voltage fault.",
            "unstable-speed": "The final kilometre did not meet the steady-speed criterion.",
            "time-limit": "The simulated time limit was reached before the battery reserve.",
        };
        display("coc-status", result.end ? t(endings[result.end]) : "");
    }
    element("source-row").hidden = element("heat-row").hidden = !charge;
    element("measured-key").hidden = snapshot.config.scenario !== "wltc";
    const distanceM = state.distance_km * 1000;
    canvas.dataset.distanceM = String(distanceM);
    scene?.animate(distanceM, running && !newRun ? updatePeriodMs : 0);
    if (!driverDisplay || snapshot.cycleDurationS === 0 || snapshot.targetKph === null)
        scene?.monitor(state.speed_kph, snapshot.targetKph);
    rollerReadouts(state.speed_kph);
    display("elapsed", timeLabel(state.time_s));
    display("speed", state.speed_kph.toFixed(1));
    display("cabin-speed", state.speed_kph.toFixed(1));
    scene?.benchStatus(state.hv_state === "FAULT" ? "fault" : running ? "running" : "standby");
    display("power", state.battery_power_kw.toFixed(1));
    if (charge) {
        display("charge-voltage", state.battery_voltage_v.toFixed(1));
        display("charge-current", Math.max(0, -state.battery_current_a).toFixed(1));
        display("charge-energy", state.energy_battery_in_kwh.toFixed(2));
    }
    display("soc", state.soc_pct.toFixed(1));
    display("temperature", state.battery_temp_c.toFixed(1));
    display("distance", state.distance_km.toFixed(2));
    const consumption = legacyBenchmark && !charge && state.distance_km >= 0.01
        ? 100 * (state.energy_battery_out_kwh - state.energy_battery_in_kwh) / state.distance_km
        : snapshot.consumptionKwhPer100Km;
    display("consumption", consumption?.toFixed(2) ?? "—");
    display("consumption-whkm", consumption == null ? "" : (10 * consumption).toFixed(1) + " " + t("Wh/km"));
    element("grade-row").hidden = snapshot.gradePct == null;
    display("grade", snapshot.gradePct == null ? "—" : snapshot.gradePct.toFixed(1) + " %");
    display("mode", state.mode.replaceAll("_", " "));
    element("mode").classList.toggle("fault", state.hv_state === "FAULT");
    display("hv-state", state.hv_state);
    display("voltage", state.battery_voltage_v.toFixed(1) + " V");
    display("current", state.battery_current_a.toFixed(1) + " A");
    display("charge-limit", state.battery_charge_limit_kw.toFixed(1) + " kW");
    display("torque", state.motor_torque_nm.toFixed(1) + " N·m");
    display("recovered", state.energy_regen_into_battery_kwh.toFixed(3) + " kWh");
    display("source-power", state.source_kw.toFixed(1) + " kW");
    display("pack-heat", state.pack_heating_kw.toFixed(2) + " kW");
    const compare = element("comparison");
    const comparison = snapshot.comparison;
    const rmse = snapshot.targetRmseKph ?? comparison?.targetRmseKph;
    const test = snapshot.config.scenario;
    compare.hidden = rmse == null && !snapshot.accelerationTimes && !isRollerTest(test);
    if (isRollerTest(test)) {
        const time = state.time_s;
        const meanDeceleration = time > 0 ? (rollerTests[test].initialSpeedKph - state.speed_kph) / (3.6 * time) : null;
        const motion = [
            t(test === "brake" ? "Braking distance" : "Coastdown distance") + " " + distanceM.toFixed(1) + " " + t("m"),
            t("Elapsed time") + " " + time.toFixed(1) + " " + t("s"),
        ];
        if (test === "brake" && meanDeceleration !== null)
            motion.push(t("Mean deceleration") + " " + meanDeceleration.toFixed(2) + " " + t("m/s²"));
        if (test === "coastdown")
            motion.push(t("Road-load power") + " " + state.road_load_kw.toFixed(1) + " " + t("kW"));
        compare.textContent = motion.join(" · ");
    }
    else if (snapshot.accelerationTimes) {
        const times = snapshot.accelerationTimes.map(({ speedKph, timeS }) => "0–" + speedKph + " " + t("km/h") + " " + (timeS === null ? "—" : timeS.toFixed(1) + " " + t("s")));
        compare.textContent = [...times, t("Road-load power") + " " + state.road_load_kw.toFixed(1) + " " + t("kW")].join(" · ");
    }
    else if (comparison) {
        const simulatedNet = state.energy_battery_out_kwh - state.energy_battery_in_kwh;
        const measuredNet = comparison.measuredOutKwh - comparison.measuredInKwh;
        const measuredConsumption = comparison.measuredDistanceKm >= 0.01
            ? " · " + t("TUM pack consumption") + " " + (100 * measuredNet / comparison.measuredDistanceKm).toFixed(2) + " " + t("kWh/100 km")
            : "";
        compare.textContent = t("Target speed RMSE") + " " + comparison.targetRmseKph.toFixed(2) + " " + t("km/h")
            + " · " + t("TUM speed RMSE") + " " + comparison.measuredRmseKph.toFixed(2) + " " + t("km/h")
            + " · " + t("TUM pack power RMSE") + " " + comparison.batteryRmseKw.toFixed(2) + " " + t("kW")
            + " · " + t("Pack net") + " " + simulatedNet.toFixed(3) + " / " + measuredNet.toFixed(3) + " " + t("kWh") + " (" + t("simulated / TUM") + ")"
            + " · " + t("Energy into pack") + " " + state.energy_battery_in_kwh.toFixed(3) + " / "
            + comparison.measuredInKwh.toFixed(3) + " " + t("kWh") + measuredConsumption;
    }
    else {
        compare.textContent = rmse == null ? "" : t("Target speed RMSE") + " " + rmse.toFixed(2) + " " + t("km/h");
    }
    updateTrace();
    updateControls();
}
function pause() {
    running = false;
    window.clearTimeout(timer);
    releaseKeyboardPedals();
    scene?.coolingFans(false);
    scene?.benchStatus(data?.state.hv_state === "FAULT" ? "fault" : "standby");
    updateControls();
}
function fail(error) {
    pause();
    errorBox.hidden = false;
    errorBox.textContent = t(error instanceof Error ? error.message : String(error));
}
function step() {
    if (!running || resetting || !data || inFlight)
        return;
    updateKeyboardPedals(true);
    errorBox.hidden = true;
    const started = performance.now();
    inFlight = api("/api/advance", {
        revision: data.revision,
        intervals: Number(rate.value),
        accelerator: accelerator.valueAsNumber / 100,
        brake: brake.valueAsNumber / 100,
        hvOk: !hvFault.checked,
    }).then((result) => {
        points.push(...result.points);
        if (result.complete)
            pause();
        show(result);
    }).catch(fail).finally(() => {
        inFlight = undefined;
        if (running)
            timer = window.setTimeout(step, Math.max(0, updatePeriodMs - (performance.now() - started)));
    });
}
async function resetExperiment(presetChange) {
    if (resetting || !data)
        return;
    pause();
    resetting = true;
    updateControls();
    await inFlight;
    const selected = selectedExperiment();
    if (presetChange) {
        guideExpanded = false;
        cycleDriver.value = "automatic";
        brakeFault.checked = false;
        socInput.value = selected === "charge-dc" ? "20" : "60";
        tempInput.value = selected === "charge-dc" ? "15" : "20";
    }
    errorBox.hidden = true;
    try {
        if (selected !== "wltc" && (!socInput.validity.valid || !tempInput.validity.valid
            || !Number.isFinite(socInput.valueAsNumber) || !Number.isFinite(tempInput.valueAsNumber))) {
            throw new Error("Enter SOC from 0 to 100% and temperature from −50 to 80 °C.");
        }
        const cycleId = schedules.has(selected) && selected !== "wltc" ? selected : undefined;
        const result = await api("/api/reset", {
            scenario: cycleId ? "cycle" : selected, vehicleId: vehicleSelect.value, cycleId,
            reducedBrakeForce: selected === "brake" ? brakeFault.checked : undefined,
            driver: cycleDriver.value, socPct: socInput.valueAsNumber,
            temperatureC: tempInput.valueAsNumber, ambientC: data.chamber ? undefined : 20,
        });
        accelerator.value = brake.value = "0";
        hvFault.checked = false;
        paintPedals();
        show(result, true);
        if (presetChange && benchView !== "operator")
            showBenchView(driverDisplay && result.cycleDurationS > 0 ? "driver" : "cell");
        if (presetChange && benchView === "operator")
            showBenchView("operator");
    }
    catch (error) {
        selectExperiment(data);
        brakeFault.checked = data.config.reducedBrakeForce === true;
        cycleDriver.value = data.config.driver ?? "automatic";
        fail(error);
    }
    finally {
        resetting = false;
        updateControls();
    }
}
function paintPedals() {
    display("accelerator-value", accelerator.value + "%");
    display("brake-value", brake.value + "%");
}
function updateKeyboardPedals(ramp) {
    if (!heldPedalKeys.size && ramp)
        return;
    const fullBrake = heldPedalKeys.has("Space");
    const braking = fullBrake || heldPedalKeys.has("KeyS") || heldPedalKeys.has("ArrowDown");
    const accelerating = !braking && (heldPedalKeys.has("KeyW") || heldPedalKeys.has("ArrowUp"));
    accelerator.value = accelerating ? String(Math.min(100, accelerator.valueAsNumber + (ramp ? 10 : 0))) : "0";
    brake.value = fullBrake ? "100" : braking ? String(Math.min(100, brake.valueAsNumber + (ramp ? 22 : 0))) : "0";
    paintPedals();
}
function releaseKeyboardPedals() {
    if (!heldPedalKeys.size)
        return;
    heldPedalKeys.clear();
    updateKeyboardPedals(false);
}
window.addEventListener("keydown", (event) => {
    if (!running || resetting || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey
        || element("vehicle-datasheet").open)
        return;
    if (event.code === "Escape") {
        pause();
        return;
    }
    if (!manualPedals() || !pedalKeys.has(event.code))
        return;
    const target = event.target;
    if (target instanceof HTMLElement) {
        if (target.isContentEditable || target.closest("input:not([type=range]), textarea"))
            return;
        const letterPedal = event.code === "KeyW" || event.code === "KeyS";
        if (!letterPedal && target.closest("select, input[type=range]"))
            return;
    }
    event.preventDefault();
    if (heldPedalKeys.has(event.code))
        return;
    if (!heldPedalKeys.size)
        accelerator.value = brake.value = "0";
    heldPedalKeys.add(event.code);
    updateKeyboardPedals(false);
});
window.addEventListener("keyup", (event) => {
    if (heldPedalKeys.delete(event.code))
        updateKeyboardPedals(false);
});
window.addEventListener("blur", releaseKeyboardPedals);
document.addEventListener("visibilitychange", () => {
    if (document.hidden)
        releaseKeyboardPedals();
});
document.addEventListener("focusin", (event) => {
    if (event.target instanceof HTMLElement && (event.target.isContentEditable
        || event.target.closest("input, select, textarea")))
        releaseKeyboardPedals();
});
accelerator.addEventListener("input", paintPedals);
brake.addEventListener("input", paintPedals);
reset.addEventListener("click", () => { void resetExperiment(false); });
scenario.addEventListener("change", () => { void resetExperiment(true); });
vehicleSelect.addEventListener("change", () => { void resetExperiment(true); });
brakeFault.addEventListener("change", () => { void resetExperiment(false); });
otherScenario.addEventListener("change", () => {
    scenario.value = "other";
    void resetExperiment(true);
});
cycleDriver.addEventListener("change", () => { void resetExperiment(false); });
rollerSetup.addEventListener("change", () => {
    preferredRollerSetup = rollerSetup.value;
    scene?.rollerSetup(rollerSetup.value === "rear");
    rollerReadouts(data?.state.speed_kph ?? 0);
});
for (const view of benchViews) {
    element("show-" + view).addEventListener("click", () => { showBenchView(view); });
}
element("show-guide").addEventListener("click", () => {
    guideExpanded = !guideExpanded;
    updateCabin();
});
const projectAbout = element("project-about");
document.addEventListener("click", (event) => {
    if (projectAbout.open && !event.composedPath().includes(projectAbout))
        projectAbout.open = false;
});
element("show-datasheet").addEventListener("click", () => {
    releaseKeyboardPedals();
    element("vehicle-datasheet").showModal();
});
run.addEventListener("click", () => {
    if (running)
        pause();
    else {
        running = true;
        if (manualPedals()) {
            run.focus({ preventScroll: true });
            if (benchView === "cell" && data?.state.time_s === 0)
                showBenchView("driver");
        }
        updateControls();
        step();
    }
});
for (const button of document.querySelectorAll("[data-view]")) {
    button.addEventListener("click", () => {
        scene?.view(button.dataset.view ?? "iso");
        const fixedView = button.dataset.view === "eye" || button.dataset.view === "wall" || button.dataset.view === "climate";
        if (fixedView)
            element("pit-view").setAttribute("aria-pressed", "false");
        element("pit-view").disabled = fixedView;
        for (const other of document.querySelectorAll("[data-view]"))
            other.setAttribute("aria-pressed", String(button === other));
    });
}
element("reset-view").addEventListener("click", () => {
    const current = document.querySelector('[data-view][aria-pressed="true"]');
    scene?.view(current?.dataset.view ?? "station");
});
element("cutaway").addEventListener("click", (event) => {
    const button = event.currentTarget;
    const showPack = button.getAttribute("aria-pressed") !== "true";
    scene?.cutaway(showPack);
    button.setAttribute("aria-pressed", String(showPack));
});
element("pit-view").addEventListener("click", (event) => {
    const button = event.currentTarget;
    const showPit = button.getAttribute("aria-pressed") !== "true";
    scene?.pit(showPit);
    button.setAttribute("aria-pressed", String(showPit));
});
function setConnection(status) {
    const connection = element("connection");
    connection.dataset.status = status;
    connection.replaceChildren(document.createElement("span"), document.createTextNode(t(status)));
}
function setReportLanguage() {
    for (const link of document.querySelectorAll('a[href*="/api/report."]')) {
        const url = new URL(link.href);
        url.searchParams.set("lang", language);
        link.href = url.href;
    }
}
const localeModule = await import("./i18n.js").catch(() => null);
if (localeModule) {
    const localized = localeModule.setupLanguage((next) => {
        language = next;
        setReportLanguage();
        translateDiagnosticRows();
        scene?.refreshLabels();
        setSceneMessage(sceneMessage);
        setConnection(element("connection").dataset.status ?? "Connecting");
        if (vehicle)
            display("vehicle-configuration", vehicle.configuration.replace("RWD", t("RWD")));
        for (const group of otherScenario.querySelectorAll("optgroup"))
            group.label = t(group.dataset.name ?? "");
        if (data)
            show(data);
    });
    t = localized.translate;
    language = localized.language;
    setReportLanguage();
    setConnection("Connecting");
}
const bibliography = element("reference-list");
void api("/data/references.json").then((references) => {
    references.forEach(({ title, url, license }, index) => {
        const entry = document.createElement("li");
        entry.id = "ref-" + (index + 1);
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = "[" + (index + 1) + "]";
        entry.append(link, " " + title);
        if (license) {
            const terms = document.createElement("a");
            terms.href = license.url;
            terms.target = "_blank";
            terms.rel = "noopener";
            terms.textContent = license.title;
            entry.append(" ", terms);
        }
        bibliography.append(entry);
    });
}).catch(() => { bibliography.textContent = t("References unavailable."); });
for (const cite of document.querySelectorAll(".cite")) {
    cite.addEventListener("click", (event) => {
        event.preventDefault();
        cite.closest("dialog")?.close();
        element("references").open = true;
        const entry = document.querySelector(cite.hash);
        entry?.scrollIntoView();
        entry?.querySelector("a")?.focus({ preventScroll: true });
    });
}
try {
    const [model, state, catalog] = await Promise.all([
        api("/data/vehicle.json"), api("/api/state"),
        loadCatalog(),
    ]);
    reportsAvailable = state.reportsAvailable === true;
    if (state.chamber) {
        element("chamber-conditions").hidden = false;
        document.querySelector('[data-view="climate"]').hidden = false;
        diagnostics = await import("./diagnostics.js").catch(() => undefined);
        setupDiagnostics();
    }
    populateCycles(catalog);
    const cocOptions = element("coc-options");
    cocOptions.hidden = !state.cocTestsAvailable;
    cocOptions.disabled = !state.cocTestsAvailable;
    for (const option of cocOptions.querySelectorAll("option"))
        option.disabled = cocOptions.disabled;
    if (state.driverDisplayAvailable) {
        const module = await import("./driver-display.js");
        driverDisplay = module.createDriverDisplay(element("driver-view"), element("operator-cycle"), element("operator-guide"), (current, trace) => scene?.monitor(current.state.speed_kph, current.targetKph, trace, current.state.time_s), (text) => t(text));
    }
    vehicle = model;
    vehicleSelect.add(new Option("Tesla " + model.title + " · " + model.configuration, model.id, true, true));
    try {
        scene = createScene(canvas, model, (text) => t(text));
        scene.rollerSetup(rollerSetup.value === "rear");
        if (state.cadPackAvailable)
            void scene.loadPack().catch(() => {
                element("cutaway").title = "Measured pack mesh unavailable. Showing the schematic.";
            });
        if (state.wallLogoAvailable)
            void scene.loadWallLogo().catch((error) => {
                console.warn("Wall emblem:", error);
            });
        setSceneMessage("Loading Tesla Model 3…");
        void scene.loadVehicle().then(() => setSceneMessage("")).catch((error) => {
            setSceneMessage("Tesla Model 3 could not load.");
            console.warn("Tesla model:", error);
        });
    }
    catch {
        setSceneMessage("The 3D view requires WebGL 2. Test controls and measurements are available below.");
        for (const button of document.querySelectorAll(".view-buttons button"))
            button.disabled = true;
    }
    setConnection("Plant connected");
    show(state, true, state.history);
    showBenchView(driverDisplay && state.cycleDurationS > 0 && state.state.time_s > 0 ? "driver" : "cell");
}
catch (error) {
    element("connection").classList.add("offline");
    setConnection("Plant unavailable");
    fail(error);
}
