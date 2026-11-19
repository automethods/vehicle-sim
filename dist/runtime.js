import { cocInitial, isCocScenario, rangePlaybackRate } from "./coc.js";
import { chamberDefaults, isRollerTest } from "./contracts.js";
import { benchmarkCycle, cycleFromCsv, cycleInfo } from "./cycle.js";
import { diagnosticCsv, diagnosticIds, diagnosticSummary } from "./diagnostics.js";
import { Lab } from "./lab.js";
import { runReport } from "./report.js";
export const downloadPaths = new Set(["/api/trace.csv", "/api/report.pdf", "/api/diagnostics.csv"]);
export class BadRequest extends Error {
}
function numberIn(body, key, min, max) {
    const val = body[key];
    if (typeof val !== "number" || !Number.isFinite(val) || val < min || val > max) {
        throw new BadRequest(key + " must be between " + min + " and " + max + ".");
    }
    return val;
}
export function parseBody(body) {
    if (body.length > 4096)
        throw new BadRequest("Request is too large.");
    try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            throw new Error();
        return parsed;
    }
    catch {
        throw new BadRequest("Invalid JSON object.");
    }
}
function json(status, data) {
    return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
function download(data, type, filename) {
    return new Response(data, { headers: {
            "Content-Type": type,
            "Content-Disposition": 'attachment; filename="' + filename + '"',
            "Cache-Control": "no-store",
        } });
}
export async function createRuntime(plant, files, renderPdf) {
    const vehicle = JSON.parse(files.vehicle);
    const cycle = cycleFromCsv(files.target);
    const benchmark = benchmarkCycle(cycle);
    const imported = JSON.parse(files.cycles);
    const cycles = new Map([benchmark, ...imported].map((schedule) => [schedule.id, schedule]));
    const catalog = [...cycles.values()].map(cycleInfo);
    const measured = JSON.parse(files.measured);
    const lab = new Lab(plant, cycle, measured, cycles);
    await lab.reset({
        scenario: "wltc", vehicleId: vehicle.id, driver: "automatic",
        socPct: measured.socPct, temperatureC: measured.temperatureC, ambientC: measured.ambientC,
    });
    let queue = Promise.resolve();
    function serial(run) {
        const job = queue.then(run);
        queue = job.catch(() => { });
        return job;
    }
    function readDiagnosticIds(url) {
        const requested = new Set(url.searchParams.getAll("signal"));
        if (!requested.size)
            return diagnosticIds;
        const selected = diagnosticIds.filter(id => requested.has(id));
        if (selected.length !== requested.size)
            throw new BadRequest("Select supported diagnostic signals.");
        return selected;
    }
    return async (method, url, jsonBody) => {
        const path = url.pathname;
        try {
            if (method === "GET") {
                if (path === "/api/state") {
                    return json(200, await serial(() => ({ ...lab.observe(), driverDisplayAvailable: true, cadPackAvailable: true, reportsAvailable: true, wallLogoAvailable: true, cocTestsAvailable: true, history: lab.plotHistory() })));
                }
                if (path === "/api/cycles") {
                    return json(200, catalog);
                }
                if (path.startsWith("/api/cycles/")) {
                    const schedule = cycles.get(path.slice("/api/cycles/".length));
                    return json(schedule ? 200 : 404, schedule ?? { error: "Unknown drive cycle." });
                }
                if (path === "/api/report.pdf") {
                    const { report, trace } = await serial(() => {
                        const snapshot = lab.observe();
                        if (snapshot.state.time_s <= 0)
                            throw new BadRequest("Run the experiment before exporting a report.");
                        const cycle = (snapshot.config.scenario === "wltc" || snapshot.config.scenario === "coc-range") ? benchmark : cycles.get(snapshot.config.cycleId ?? "");
                        return { report: runReport(snapshot, cycle), trace: lab.exportCsv() };
                    });
                    const appendix = url.searchParams.get("diagnostics") === "1"
                        ? diagnosticSummary(trace, readDiagnosticIds(url)) : undefined;
                    const data = await renderPdf({
                        ...report, traceCsv: trace, lang: url.searchParams.get("lang") === "uk" ? "uk" : "en",
                        benchmark: report.scenario === "wltc" ? measured : undefined, diagnostics: appendix,
                    });
                    return download(data, "application/pdf", "vehicle-run.pdf");
                }
                if (path === "/api/trace.csv" || path === "/api/diagnostics.csv") {
                    const diagnostics = path === "/api/diagnostics.csv";
                    const trace = await serial(() => {
                        if (diagnostics && lab.observe().state.time_s <= 0)
                            throw new BadRequest("Run the experiment before exporting diagnostics.");
                        return lab.exportCsv();
                    });
                    const data = diagnostics ? diagnosticCsv(trace, readDiagnosticIds(url)) : trace;
                    return download(data, "text/csv; charset=utf-8", diagnostics ? "vehicle-diagnostics.csv" : "vehicle-run.csv");
                }
            }
            if (method === "POST" && path === "/api/reset") {
                const body = await jsonBody();
                if (body.scenario !== "manual" && body.scenario !== "wltc" && body.scenario !== "cycle" && body.scenario !== "charge-dc" && !isCocScenario(body.scenario) && !isRollerTest(body.scenario)) {
                    throw new BadRequest("Select a supported test.");
                }
                const scenario = body.scenario;
                if (body.vehicleId !== undefined && body.vehicleId !== vehicle.id) {
                    throw new BadRequest("Select an available vehicle.");
                }
                if (body.reducedBrakeForce !== undefined && (scenario !== "brake" || typeof body.reducedBrakeForce !== "boolean")) {
                    throw new BadRequest("Brake fault is available for the service brake test.");
                }
                const driver = body.driver ?? "automatic";
                if (driver !== "automatic" && driver !== "pedals")
                    throw new BadRequest("Choose automatic or pedals.");
                const cycleId = typeof body.cycleId === "string" ? body.cycleId : undefined;
                if (scenario === "cycle" && (!cycleId || cycleId === "wltc" || !cycles.has(cycleId))) {
                    throw new BadRequest("Select a supported drive cycle.");
                }
                const config = isCocScenario(scenario)
                    ? { scenario, ...cocInitial }
                    : scenario === "wltc"
                        ? { scenario, driver, socPct: measured.socPct, temperatureC: measured.temperatureC, ambientC: measured.ambientC }
                        : { scenario, cycleId, driver: scenario === "cycle" ? driver : undefined, socPct: numberIn(body, "socPct", 0, 100),
                            temperatureC: numberIn(body, "temperatureC", -50, 80),
                            ambientC: body.ambientC === undefined ? chamberDefaults.temperatureC : numberIn(body, "ambientC", -50, 80) };
                config.vehicleId = vehicle.id;
                if (scenario === "brake")
                    config.reducedBrakeForce = body.reducedBrakeForce === true;
                return json(200, await serial(() => lab.reset(config)));
            }
            if (method === "POST" && path === "/api/advance") {
                const body = await jsonBody();
                const intervals = numberIn(body, "intervals", 1, rangePlaybackRate);
                if (!Number.isInteger(intervals))
                    throw new BadRequest("intervals must be an integer.");
                const revision = numberIn(body, "revision", 1, Number.MAX_SAFE_INTEGER);
                if (typeof body.hvOk !== "boolean")
                    throw new BadRequest("hvOk must be a boolean.");
                const pedals = {
                    accelerator: numberIn(body, "accelerator", 0, 1), brake: numberIn(body, "brake", 0, 1), hvOk: body.hvOk,
                };
                const result = await serial(() => {
                    const current = lab.observe();
                    if (revision !== current.revision)
                        return null;
                    if (intervals > 60 && current.config.scenario !== "coc-range") {
                        throw new BadRequest("This test supports at most 60 intervals per update.");
                    }
                    return lab.advance(intervals, pedals);
                });
                return json(result ? 200 : 409, result ?? { error: "The experiment has been reset in another view. Reload the page." });
            }
            return json(404, { error: "Not found." });
        }
        catch (error) {
            const status = error instanceof BadRequest ? 400 : 500;
            return json(status, { error: error instanceof Error ? error.message : String(error) });
        }
    };
}
