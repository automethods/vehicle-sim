import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const execute = promisify(execFile);

for (const basePath of ["", "/projects/vehicle-sim"]) {
  test("launcher reuses the lab and malformed URLs do not stop it at " + (basePath || "/"), async (t) => {
    const env = { ...process.env, BASE_PATH: basePath, PORT: "0", LAB_LOCAL_PREVIEW: "0" };
    const server = spawn(process.execPath, ["dist/server.js"], {
      cwd: root, env, stdio: ["ignore", "pipe", "inherit"],
    });
    const stopped = once(server, "exit");
    t.after(async () => {
      server.kill();
      await stopped;
    });
    const [ready] = await once(server.stdout, "data", { signal: AbortSignal.timeout(5000) });
    const address = /Vehicle lab: (http:\/\/127\.0\.0\.1:(\d+)\S*)/.exec(ready.toString());
    assert.ok(address, ready.toString());
    const [, url, port] = address;
    assert.equal(url, "http://127.0.0.1:" + port + basePath + "/");

    const { stdout } = await execute("bash", ["run.sh", "--no-browser"], {
      cwd: root, env: { ...env, PORT: port }, timeout: 3000,
    });
    assert.equal(stdout.trim(), "Vehicle lab is already running at " + url);
    await assert.rejects(execute("bash", ["run.sh", "--no-browser"], {
      cwd: root, env: { ...env, LAB_LOCAL_PREVIEW: "1", PORT: port }, timeout: 3000,
    }), { stderr: /A different build or mode is running/ });
    assert.equal((await fetch("http://127.0.0.1:" + port + "//")).status, 400);
    const state = await fetch(url + "api/state");
    assert.equal(state.status, 200);
    const initial = await state.json();
    assert.equal(initial.state.time_s, 0);
    assert.equal(initial.config.scenario, "wltc");
    assert.deepEqual(initial.chamber, { temperatureC: 22.5, humidityPct: 50, pressureKpa: 101.325 });
    assert.equal((await fetch(url + "api/trace.csv")).status, 401);
    assert.equal((await fetch(url + "api/diagnostics.csv")).status, 401);
  });
}

test("local launcher enables report preview and serves the diagnostics module", async (t) => {
  const env = { ...process.env, BASE_PATH: "", PORT: "0" };
  delete env.LAB_LOCAL_PREVIEW;
  const server = spawn("bash", ["run.sh", "--no-browser"], { cwd: root, env, stdio: ["ignore", "pipe", "inherit"] });
  const stopped = once(server, "exit");
  t.after(async () => {
    server.kill();
    await stopped;
  });
  const [ready] = await once(server.stdout, "data", { signal: AbortSignal.timeout(5000) });
  const [, url] = /Vehicle lab: (http:\/\/127\.0\.0\.1:\d+\/)/.exec(ready.toString());
  assert.deepEqual(await (await fetch(url + "api/session")).json(), { authenticated: true, localPreview: true });
  assert.match(await (await fetch(url + "api/build")).json().then(build => build.build), /^[0-9a-f]{64}$/);
  assert.equal((await fetch(url + "dist/diagnostics.js")).status, 200);
  assert.equal((await fetch(url + "api/report.engdoc.json")).status, 404);
  const vehicle = await (await fetch(url + "data/vehicle.json")).json();
  const state = await (await fetch(url + "api/state")).json();
  assert.equal(state.config.vehicleId, vehicle.id);
  const reset = (body) => fetch(url + "api/reset", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario: "brake", socPct: 60, temperatureC: 20, ...body }),
  });
  assert.equal((await reset({ vehicleId: "unsupported" })).status, 400);
  assert.equal((await reset({ reducedBrakeForce: "true" })).status, 400);
  const valid = await reset({ vehicleId: vehicle.id, reducedBrakeForce: true });
  assert.equal(valid.status, 200);
  const validRun = await valid.json();
  assert.equal(validRun.config.reducedBrakeForce, true);
  assert.equal(validRun.state.speed_kph, 50);
  const advanced = await fetch(url + "api/advance", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision: validRun.revision, intervals: 10, accelerator: 0, brake: 0, hvOk: true }),
  });
  assert.equal(advanced.status, 200);
  for (const lang of ["en", "uk"]) {
    const response = await fetch(url + "api/report.pdf?lang=" + lang);
    assert.equal(response.status, 200, response.ok ? undefined : await response.text());
    assert.equal(response.headers.get("content-type"), "application/pdf");
    const pdf = Buffer.from(await response.arrayBuffer()).toString("latin1");
    assert.match(pdf, /^%PDF-/);
    if (lang === "en") assert.ok(pdf.includes("/Title (Theoretical dynamometer test report)"));
  }
});
