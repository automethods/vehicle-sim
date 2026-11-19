import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cocInitial, isCocScenario, rangePlaybackRate } from "./coc.js";
import { chamberDefaults, isRollerTest } from "./contracts.js";
import { benchmarkCycle, cycleFromCsv, cycleInfo } from "./cycle.js";
import { diagnosticCsv, diagnosticIds, diagnosticSummary } from "./diagnostics.js";
import { Lab } from "./lab.js";
import { signedIn } from "./account.js";
import { TeslaPlant } from "./plant.js";
import { pdfReport, runReport } from "./report.js";
const localPreview = process.env.LAB_LOCAL_PREVIEW === "1";
const basePath = process.env.BASE_PATH ?? "";
if (basePath && !/^\/(?:[a-z0-9-]+\/)*[a-z0-9-]+$/.test(basePath))
    throw new Error("Invalid BASE_PATH.");
const root = fileURLToPath(new URL("../", import.meta.url));
const modelDir = process.env.TESLA_SIM_DIR ?? join(root, "plant");
const port = Number(process.env.PORT ?? "8792");
if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Invalid PORT.");
const read = (name) => readFile(join(root, name), "utf8");
const buildFiles = (await readdir(join(root, "dist"))).filter(name => name.endsWith(".js")).sort()
    .map(name => "dist/" + name).concat("public/index.html", "public/style.css", "scripts/render-run-report.py", "bridge.py");
const build = createHash("sha256").update(Buffer.concat(await Promise.all(buildFiles.map(name => readFile(join(root, name)))))).digest("hex");
const vehicle = JSON.parse(await read("data/vehicle.json"));
const cycle = cycleFromCsv(await read("data/wltc-class-3b.csv"));
const benchmark = benchmarkCycle(cycle);
const imported = JSON.parse(await read("data/drive-cycles.json"));
const cycles = new Map([benchmark, ...imported].map((schedule) => [schedule.id, schedule]));
const catalog = [...cycles.values()].map(cycleInfo);
const measured = JSON.parse(await read("data/tum-wltp-first-pass.json"));
const python = process.env.PYTHON ?? "python3";
const plant = new TeslaPlant(python, join(root, "bridge.py"), resolve(modelDir));
const lab = new Lab(plant, cycle, measured, cycles);
try {
    await lab.reset({
        scenario: "wltc", vehicleId: vehicle.id, driver: "automatic",
        socPct: measured.socPct, temperatureC: measured.temperatureC, ambientC: measured.ambientC,
    });
}
catch (error) {
    plant.close();
    throw error;
}
const assets = new Map([
    ["/", ["public/index.html", "text/html; charset=utf-8"]],
    ["/style.css", ["public/style.css", "text/css; charset=utf-8"]],
    ["/dist/web.js", ["dist/web.js", "application/javascript"]],
    ["/dist/contracts.js", ["dist/contracts.js", "application/javascript"]],
    ["/dist/i18n.js", ["dist/i18n.js", "application/javascript"]],
    ["/dist/scene.js", ["dist/scene.js", "application/javascript"]],
    ["/dist/cycle.js", ["dist/cycle.js", "application/javascript"]],
    ["/dist/driver-display.js", ["dist/driver-display.js", "application/javascript"]],
    ["/dist/diagnostics.js", ["dist/diagnostics.js", "application/javascript"]],
    ["/vendor/three/three.module.js", ["public/vendor/three/three.module.js", "application/javascript"]],
    ["/vendor/three/three.core.js", ["public/vendor/three/three.core.js", "application/javascript"]],
    ["/vendor/three/STLLoader.js", ["public/vendor/three/STLLoader.js", "application/javascript"]],
    ["/vendor/three/loaders/GLTFLoader.js", ["public/vendor/three/loaders/GLTFLoader.js", "application/javascript"]],
    ["/vendor/three/utils/BufferGeometryUtils.js", ["public/vendor/three/utils/BufferGeometryUtils.js", "application/javascript"]],
    ["/vendor/three/utils/SkeletonUtils.js", ["public/vendor/three/utils/SkeletonUtils.js", "application/javascript"]],
    ["/models/tesla_2018_model_3.glb", ["models/tesla_2018_model_3.glb", "model/gltf-binary"]],
    ["/models/transport-logo.glb", ["models/transport-logo.glb", "model/gltf-binary"]],
    ["/models/tesla-pack.stl", ["models/tesla-pack.stl", "model/stl"]],
    ["/college.svg", ["public/college.svg", "image/svg+xml"]],
    ["/polissia.svg", ["public/polissia.svg", "image/svg+xml"]],
    ["/department.png", ["public/department.png", "image/png"]],
    ["/data/references.json", ["data/references.json", "application/json"]],
    ["/data/vehicle.json", ["data/vehicle.json", "application/json"]],
    ["/data/wltc-class-3b.csv", ["data/wltc-class-3b.csv", "text/csv; charset=utf-8"]],
]);
class BadRequest extends Error {
}
function numberIn(body, key, min, max) {
    const val = body[key];
    if (typeof val !== "number" || !Number.isFinite(val) || val < min || val > max) {
        throw new BadRequest(key + " must be between " + min + " and " + max + ".");
    }
    return val;
}
async function jsonBody(request) {
    if (!request.headers["content-type"]?.startsWith("application/json")) {
        throw new BadRequest("Send a JSON body.");
    }
    let body = "";
    for await (const chunk of request) {
        body += chunk.toString();
        if (body.length > 4096)
            throw new BadRequest("Request is too large.");
    }
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
function sendJson(response, status, data) {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify(data));
}
let queue = Promise.resolve();
function serial(run) {
    const job = queue.then(run);
    queue = job.catch(() => { });
    return job;
}
const downloadPaths = new Set(["/api/trace.csv", "/api/report.pdf", "/api/diagnostics.csv"]);
function readDiagnosticIds(url) {
    const requested = new Set(url.searchParams.getAll("signal"));
    if (!requested.size)
        return diagnosticIds;
    const selected = diagnosticIds.filter(id => requested.has(id));
    if (selected.length !== requested.size)
        throw new BadRequest("Select supported diagnostic signals.");
    return selected;
}
const server = createServer(async (req, res) => {
    const target = req.url ?? "/";
    if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) {
        sendJson(res, 400, { error: "Invalid request URL." });
        return;
    }
    try {
        const url = new URL("http://127.0.0.1" + target);
        if (basePath && url.pathname === basePath) {
            res.writeHead(308, { Location: basePath + "/" + url.search }).end();
            return;
        }
        if (basePath && !url.pathname.startsWith(basePath + "/")) {
            sendJson(res, 404, { error: "Not found." });
            return;
        }
        const path = url.pathname.slice(basePath.length);
        if (req.method === "GET") {
            const file = assets.get(path);
            if (file) {
                const data = await readFile(join(root, file[0]));
                res.writeHead(200, { "Content-Type": file[1] });
                res.end(data);
                return;
            }
            if (path === "/api/session" || downloadPaths.has(path)) {
                res.setHeader("Vary", "Cookie");
                const preview = localPreview && /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(req.headers.host ?? "");
                const authenticated = preview || await signedIn(req, res);
                if (path === "/api/session") {
                    sendJson(res, 200, { authenticated, localPreview: preview });
                    return;
                }
                if (!authenticated) {
                    sendJson(res, 401, { error: "Sign in on the AutoMethods homepage to download." });
                    return;
                }
            }
            if (path === "/api/build") {
                sendJson(res, 200, { build, localPreview });
                return;
            }
            if (path === "/api/state") {
                sendJson(res, 200, await serial(() => ({ ...lab.observe(), driverDisplayAvailable: true, cadPackAvailable: true, reportsAvailable: true, wallLogoAvailable: true, cocTestsAvailable: true, history: lab.plotHistory() })));
                return;
            }
            if (path === "/api/cycles") {
                sendJson(res, 200, catalog);
                return;
            }
            if (path.startsWith("/api/cycles/")) {
                const schedule = cycles.get(path.slice("/api/cycles/".length));
                sendJson(res, schedule ? 200 : 404, schedule ?? { error: "Unknown drive cycle." });
                return;
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
                const data = await pdfReport(python, join(root, "scripts/render-run-report.py"), report, trace, url.searchParams.get("lang") === "uk" ? "uk" : "en", report.scenario === "wltc" ? measured : undefined, appendix);
                res.writeHead(200, {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": 'attachment; filename="vehicle-run.pdf"',
                    "Cache-Control": "no-store",
                });
                res.end(data);
                return;
            }
            if (path === "/api/trace.csv" || path === "/api/diagnostics.csv") {
                const diagnostics = path === "/api/diagnostics.csv";
                const trace = await serial(() => {
                    if (diagnostics && lab.observe().state.time_s <= 0)
                        throw new BadRequest("Run the experiment before exporting diagnostics.");
                    return lab.exportCsv();
                });
                const data = diagnostics ? diagnosticCsv(trace, readDiagnosticIds(url)) : trace;
                res.writeHead(200, {
                    "Content-Type": "text/csv; charset=utf-8",
                    "Content-Disposition": diagnostics ? 'attachment; filename="vehicle-diagnostics.csv"' : 'attachment; filename="vehicle-run.csv"',
                    "Cache-Control": "no-store",
                });
                res.end(data);
                return;
            }
        }
        if (req.method === "POST" && path === "/api/reset") {
            const body = await jsonBody(req);
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
            sendJson(res, 200, await serial(() => lab.reset(config)));
            return;
        }
        if (req.method === "POST" && path === "/api/advance") {
            const body = await jsonBody(req);
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
            sendJson(res, result ? 200 : 409, result ?? { error: "The experiment has been reset in another view. Reload the page." });
            return;
        }
        sendJson(res, 404, { error: "Not found." });
    }
    catch (error) {
        const status = error instanceof BadRequest ? 400 : 500;
        const message = error instanceof Error ? error.message : String(error);
        sendJson(res, status, { error: message });
    }
});
server.on("error", (error) => {
    plant.close();
    console.error(error.message);
    process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    console.log("Vehicle lab: http://127.0.0.1:" + (typeof address === "object" && address ? address.port : port) + basePath + "/");
});
for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => {
        server.close();
        plant.close();
    });
}
