import { loadPyodide } from "./python/pyodide.mjs";
import { plantStepS } from "../dist/contracts.js";
import { createRuntime, parseBody } from "../dist/runtime.js";

const project = new URL("../", import.meta.url);
const pythonBase = new URL("python/", import.meta.url);
const fetchFile = async (name) => {
  const response = await fetch(new URL(name, project));
  if (!response.ok) throw new Error("Could not load " + name + ".");
  return response;
};

const runtime = await loadPyodide({ indexURL: pythonBase.href });
async function writeFiles(files) {
  await Promise.all(Object.entries(files).map(async ([name, source]) => {
    const contents = new Uint8Array(await (await fetchFile(source)).arrayBuffer());
    const path = "/lab/" + name;
    runtime.FS.mkdirTree(path.slice(0, path.lastIndexOf("/")));
    runtime.FS.writeFile(path, contents);
  }));
}

const plantFiles = writeFiles({
  "bridge.py": "online/plant/bridge.py",
  "plant/model3_ev.py": "online/plant/model3_ev.py",
  "plant/tum_dyno.json": "online/plant/tum_dyno.json",
});
const dataFiles = Object.fromEntries(await Promise.all(Object.entries({
  vehicle: "vehicle.json",
  target: "wltc-class-3b.csv",
  cycles: "drive-cycles.json",
  measured: "tum-wltp-first-pass.json",
}).map(async ([name, file]) => [name, await (await fetchFile("data/" + file)).text()])));
await plantFiles;
runtime.runPython("import sys; sys.path[:0] = ['/lab', '/lab/plant']");
const exchange = runtime.runPython("from bridge import exchange; exchange");
function model(message) {
  const reply = JSON.parse(exchange(JSON.stringify(message)));
  if (!reply.ok) throw new Error(reply.error);
  return reply.state;
}

let pdfRenderer;
async function preparePdf() {
  const wheel = "reportlab-4.4.10-py3-none-any.whl";
  await Promise.all([
    runtime.loadPackage(["pillow", "charset-normalizer", new URL(wheel, pythonBase).href]),
    writeFiles({
      "scripts/render-run-report.py": "downloads/render-run-report.py",
      "fonts/DejaVuSans.ttf": "downloads/DejaVuSans.ttf",
      "fonts/DejaVuSans-Bold.ttf": "downloads/DejaVuSans-Bold.ttf",
      "data/vehicle.json": "data/vehicle.json",
      "data/references.json": "data/references.json",
      "public/department.png": "department.png",
      "models/report-college.png": "models/report-college.png",
      "models/report-polissia.png": "models/report-polissia.png",
      "models/model3-front.png": "models/model3-front.png",
      "models/model3-side.png": "models/model3-side.png",
      "models/model3-top.png": "models/model3-top.png",
    }),
  ]);
  runtime.runPython("import os, sys; os.environ['REPORT_FONT_DIR'] = '/lab/fonts'; sys.path.insert(0, '/lab/scripts')");
  return runtime.runPython("from importlib import import_module; import_module('render-run-report').render_pdf");
}

const handle = await createRuntime({
  async reset(config) { return model({ op: "reset", config, dt_s: plantStepS }); },
  async step(ticks, inputs) { return model({ op: "step", ticks, inputs }); },
}, dataFiles, async (payload) => {
  pdfRenderer ??= preparePdf().catch(error => { pdfRenderer = undefined; throw error; });
  const render = await pdfRenderer;
  const result = render(JSON.stringify(payload));
  try {
    return result.toJs();
  } finally {
    result.destroy();
  }
});

self.onmessage = async ({ data: { id, path, method, body } }) => {
  const response = await handle(method, new URL(path, project.origin), async () => parseBody(body));
  const buffer = await response.arrayBuffer();
  self.postMessage({ id, status: response.status, headers: [...response.headers], buffer }, [buffer]);
};
self.postMessage({ ready: true });
