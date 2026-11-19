import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { signedIn } from "./account.js";
import { TeslaPlant } from "./plant.js";
import { pdfReport } from "./pdf-report.js";
import { BadRequest, createRuntime, downloadPaths, parseBody } from "./runtime.js";

const localPreview = process.env.LAB_LOCAL_PREVIEW === "1";
const basePath = process.env.BASE_PATH ?? "";
if (basePath && !/^\/(?:[a-z0-9-]+\/)*[a-z0-9-]+$/.test(basePath)) throw new Error("Invalid BASE_PATH.");
const root = fileURLToPath(new URL("../", import.meta.url));
const modelDir = process.env.TESLA_SIM_DIR ?? join(root, "plant");
const port = Number(process.env.PORT ?? "8792");
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid PORT.");
const read = (name: string) => readFile(join(root, name), "utf8");
const buildFiles = (await readdir(join(root, "dist"))).filter(name => name.endsWith(".js")).sort()
  .map(name => "dist/" + name).concat("public/index.html", "public/style.css", "scripts/render-run-report.py", "bridge.py");
const build = createHash("sha256").update(Buffer.concat(await Promise.all(buildFiles.map(name => readFile(join(root, name)))))).digest("hex");
const python = process.env.PYTHON ?? "python3";
const plant = new TeslaPlant(python, join(root, "bridge.py"), resolve(modelDir));
const handleApi = await (async () => {
  try {
    return await createRuntime(plant, {
      vehicle: await read("data/vehicle.json"),
      target: await read("data/wltc-class-3b.csv"),
      cycles: await read("data/drive-cycles.json"),
      measured: await read("data/tum-wltp-first-pass.json"),
    }, (payload) => pdfReport(python, join(root, "scripts/render-run-report.py"), payload));
  } catch (error) {
    plant.close();
    throw error;
  }
})();
const assets = new Map<string, [string, string]>([
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
async function jsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    throw new BadRequest("Send a JSON body.");
  }
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 4096) throw new BadRequest("Request is too large.");
  }
  return parseBody(body);
}

function sendJson(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
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
    }
    url.pathname = path;
    const result = await handleApi(req.method ?? "GET", url, () => jsonBody(req));
    for (const [name, value] of result.headers) res.setHeader(name, value);
    res.writeHead(result.status);
    res.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
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
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    server.close();
    plant.close();
  });
}
