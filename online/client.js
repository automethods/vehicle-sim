(() => {
  const base = new URL("../", document.currentScript.src);
  const fetchNetwork = window.fetch.bind(window);
  const exports = new Set(["/api/trace.csv", "/api/report.pdf", "/api/diagnostics.csv"]);
  const commands = new Set(["/api/state", "/api/cycles", "/api/reset", "/api/advance", ...exports]);
  const pending = new Map();
  let nextId = 0;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  ready.catch(() => {});
  const worker = new Worker(new URL("online/worker.mjs", base), { type: "module" });
  let workerError;
  const setStatus = (message) => {
    const notice = document.querySelector("#online-status");
    if (notice) notice.textContent = message;
  };
  worker.onerror = ({ message }) => {
    workerError = new Error(message || "The vehicle model could not start.");
    rejectReady(workerError);
    for (const { reject } of pending.values()) reject(workerError);
    pending.clear();
  };
  worker.onmessage = ({ data }) => {
    if (data.ready) { resolveReady(); return; }
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    job.resolve(new Response(data.buffer, { status: data.status, headers: data.headers }));
  };

  function projectPath(url) {
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return "";
    return "/" + url.pathname.slice(base.pathname.length);
  }

  async function signedIn() {
    const response = await fetchNetwork("/api/session", { cache: "no-store" });
    if (!response.ok) return false;
    const data = await response.json();
    return data.configured === true && typeof data.user?.id === "string" && data.user.id.length > 0;
  }

  window.fetch = async (input, options) => {
    const request = new Request(input instanceof Request ? input : new URL(input, document.baseURI), options);
    const url = new URL(request.url);
    const path = projectPath(url);
    if (path === "/api/session") {
      return Response.json({ authenticated: await signedIn().catch(() => false) });
    }
    if (!commands.has(path) && !path.startsWith("/api/cycles/")) return fetchNetwork(request);
    if (exports.has(path) && !await signedIn().catch(() => false)) {
      return Response.json({ error: "Sign in on AutoMethods to download results." }, { status: 401 });
    }
    const body = request.method === "POST" ? await request.text() : null;
    await ready;
    if (workerError) throw workerError;
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, path: path + url.search, method: request.method, body });
    });
  };

  document.addEventListener("click", async (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link || !exports.has(projectPath(new URL(link.href)))) return;
    event.preventDefault();
    if (link.getAttribute("aria-busy") === "true") return;
    link.setAttribute("aria-busy", "true");
    const uk = document.documentElement.lang === "uk";
    setStatus(uk ? "Готуємо файл…" : "Preparing the file…");
    try {
      const response = await window.fetch(link.href);
      if (response.status === 401) {
        setStatus(uk ? "Увійдіть в обліковий запис АвтоМетод, щоб завантажити результати."
          : "Sign in on AutoMethods to download results.");
        return;
      }
      if (!response.ok) throw new Error("Report unavailable.");
      const url = URL.createObjectURL(await response.blob());
      const save = document.createElement("a");
      save.href = url;
      save.download = response.headers.get("Content-Disposition").match(/filename="([^"]+)"/)[1];
      save.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setStatus("");
    } catch (error) {
      console.error(error);
      setStatus(uk ? "Не вдалося підготувати файл. Спробуйте ще раз." : "The file could not be prepared. Please try again.");
    } finally {
      link.removeAttribute("aria-busy");
    }
  });
})();
