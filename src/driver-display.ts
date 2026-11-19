import type { DriveCycle, Point, Snapshot } from "./contracts.js";
import { guideBandKph, targetAt } from "./cycle.js";

const previewS = 60;
const historyS = 14;

const clock = (seconds: number) =>
  Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");

export function driverCue(errorKph: number): { text: string; tone: string } {
  if (errorKph < -guideBandKph) return { text: "Speed up", tone: "slow" };
  if (errorKph > guideBandKph) return { text: "Ease off", tone: "fast" };
  return { text: "On target", tone: "good" };
}

export type DriverTracePainter = (pen: CanvasRenderingContext2D, width: number, height: number) => void;

function paintTrace(
  pen: CanvasRenderingContext2D, width: number, height: number,
  cycle: DriveCycle, snapshot: Snapshot, samples: readonly Point[], t: (text: string) => string,
) {
  pen.clearRect(0, 0, width, height);
  const left = 55, right = width - 20, top = 16, bottom = height - 33;
  const now = snapshot.state.time_s;
  const start = Math.max(0, now - historyS);
  const end = Math.min(cycle.durationS, now + previewS);
  const speed = snapshot.state.speed_kph;
  const history = samples.slice(-historyS - 2).filter((p) => p.timeS >= start && p.timeS < now);
  const guide = [start];
  for (let t = Math.floor(start) + 1; t < end; t++) guide.push(t);
  if (end !== start) guide.push(end);
  const curve = guide.map((t) => ({ t, speed: targetAt(cycle.speedKph, t, cycle.stepS) }));
  const peak = Math.max(speed, ...history.map((p) => p.speedKph), ...curve.map((p) => p.speed));
  const maxKph = Math.max(60, Math.ceil((peak + 5) / 20) * 20);
  const x = (v: number) => left + (right - left) * (v + 4) / (maxKph + 4);
  const y = (t: number) => top + (bottom - top) * (now + previewS - t) / (previewS + historyS);
  const currentY = y(now);

  pen.fillStyle = "#0d1823";
  pen.fillRect(left, top, right - left, currentY - top);
  pen.fillStyle = "#101d29";
  pen.fillRect(left, currentY, right - left, bottom - currentY);
  pen.lineWidth = 1;
  pen.strokeStyle = "#273b4c";
  pen.fillStyle = "#a5b8ca";
  pen.font = "11px system-ui";
  pen.textAlign = "center";
  const gridStep = maxKph > 120 && width < 430 ? 40 : 20;
  for (let v = 0; v <= maxKph; v += gridStep) {
    const px = x(v);
    pen.beginPath();
    pen.moveTo(px, top);
    pen.lineTo(px, bottom);
    pen.stroke();
    pen.fillText(String(v), px, bottom + 15);
  }
  pen.fillText(t("Speed (km/h)"), (left + right) / 2, bottom + 29);
  pen.textAlign = "right";
  for (const offset of [-10, 10, 20, 30, 40, 50, 60]) {
    const py = y(now + offset);
    pen.beginPath();
    pen.moveTo(left, py);
    pen.lineTo(right, py);
    pen.stroke();
    pen.fillText((offset > 0 ? "+" : "−") + Math.abs(offset) + " s", left - 9, py + 4);
  }

  pen.save();
  pen.beginPath();
  pen.rect(left - 5, top, right - left + 10, bottom - top);
  pen.clip();
  function trace(offset: number, reverse = false) {
    const points = reverse ? [...curve].reverse() : curve;
    points.forEach((p, i) => {
      const px = x(p.speed + offset), py = y(p.t);
      if (i === 0 && !reverse) pen.moveTo(px, py);
      else pen.lineTo(px, py);
    });
  }
  pen.beginPath();
  trace(-guideBandKph);
  trace(guideBandKph, true);
  pen.closePath();
  pen.fillStyle = "#26364b";
  pen.fill();
  pen.strokeStyle = "#f2bc74";
  pen.lineWidth = 1.6;
  for (const limit of [-guideBandKph, guideBandKph]) {
    pen.beginPath();
    trace(limit);
    pen.stroke();
  }
  pen.beginPath();
  trace(0);
  pen.strokeStyle = "#ff8c7f";
  pen.lineWidth = 2;
  pen.stroke();

  pen.beginPath();
  pen.moveTo(left, currentY);
  pen.lineTo(right, currentY);
  pen.setLineDash([4, 4]);
  pen.strokeStyle = "#95a9bb";
  pen.lineWidth = 1;
  pen.stroke();
  pen.setLineDash([]);

  pen.beginPath();
  history.forEach((p, i) => {
    if (i === 0) pen.moveTo(x(p.speedKph), y(p.timeS));
    else pen.lineTo(x(p.speedKph), y(p.timeS));
  });
  if (history.length) pen.lineTo(x(speed), currentY);
  pen.strokeStyle = "#eff5fb";
  pen.lineWidth = 2.4;
  pen.stroke();

  const px = x(speed);
  pen.beginPath();
  pen.moveTo(px - 8, currentY);
  pen.lineTo(px + 8, currentY);
  pen.strokeStyle = "#63e1cb";
  pen.lineWidth = 3;
  pen.stroke();
  pen.beginPath();
  pen.arc(px, currentY, 3.5, 0, 2 * Math.PI);
  pen.fillStyle = "#63e1cb";
  pen.fill();
  pen.restore();
  pen.fillStyle = "#dde8f8";
  pen.fillText(t("NOW"), left - 9, currentY + 4);
}

export function createDriverDisplay(
  container: HTMLElement,
  overview: HTMLCanvasElement,
  operatorGuide: HTMLCanvasElement,
  updateMonitor: (snapshot: Snapshot, trace: DriverTracePainter) => void,
  t: (text: string) => string = (text) => text,
) {
  function get<T extends HTMLElement>(id: string) {
    return container.querySelector<T>("#" + id)!;
  }
  const canvas = get<HTMLCanvasElement>("driver-plot");
  const pen = canvas.getContext("2d")!;
  const overviewPen = overview.getContext("2d")!;
  const overviewNote = overview.previousElementSibling as HTMLElement;
  const operatorPen = operatorGuide.getContext("2d")!;
  const operatorNote = document.getElementById("operator-guide-empty")!;
  const operatorLegend = document.getElementById("operator-guide-legend")!;
  const operatorStatus = document.getElementById("operator-guide-status")!;
  const progress = get<HTMLProgressElement>("driver-progress");
  const phaseList = get("driver-phase-list");
  const live = get("driver-live");
  const inactive = get("driver-inactive");
  const cue = get("driver-cue");
  let cycle: DriveCycle | undefined;
  let selectedId: string | undefined;
  let peakKph = 0;
  let snapshot: Snapshot | undefined;
  let samples: readonly Point[] = [];

  function fitCanvas(surface: HTMLCanvasElement, context: CanvasRenderingContext2D) {
    const { width, height } = surface.getBoundingClientRect();
    if (width === 0 || height === 0) return null;
    const scale = Math.min(window.devicePixelRatio, 2);
    const pixelWidth = Math.round(width * scale);
    const pixelHeight = Math.round(height * scale);
    if (surface.width !== pixelWidth || surface.height !== pixelHeight) {
      surface.width = pixelWidth;
      surface.height = pixelHeight;
    }
    context.setTransform(scale, 0, 0, scale, 0, 0);
    return { width, height };
  }

  function draw(surface: HTMLCanvasElement, context: CanvasRenderingContext2D) {
    const trace = painter();
    if (!trace) return;
    const bounds = fitCanvas(surface, context);
    if (bounds) trace(context, bounds.width, bounds.height);
  }

  function drawOverview() {
    if (!cycle || !snapshot || snapshot.targetKph === null) return;
    const bounds = fitCanvas(overview, overviewPen);
    if (!bounds) return;
    const { width, height } = bounds;
    const n = cycle.durationS;
    const scaleKph = Math.max(20, Math.ceil(peakKph / 20) * 20);
    const x = (speed: number) => 32 + (width - 44) * speed / scaleKph;
    const y = (time: number) => height - 16 - (height - 25) * time / n;
    overviewPen.clearRect(0, 0, width, height);
    let start = 0;
    const ends = cycle.phases.length ? cycle.phases.map((phase) => phase.endS) : [n];
    for (const [phase, end] of ends.entries()) {
      overviewPen.fillStyle = phase % 2 === 0 ? "#132331" : "#192b3a";
      overviewPen.fillRect(x(0), y(end), x(scaleKph) - x(0), y(start) - y(end));
      start = end;
    }
    overviewPen.strokeStyle = "#ff8c7f";
    overviewPen.lineWidth = 1.2;
    overviewPen.beginPath();
    for (let time = 0; time <= n; time++) {
      const speed = targetAt(cycle.speedKph, time, cycle.stepS);
      if (time === 0) overviewPen.moveTo(x(speed), y(time));
      else overviewPen.lineTo(x(speed), y(time));
    }
    overviewPen.stroke();
    const currentY = y(snapshot.state.time_s);
    overviewPen.strokeStyle = "#63e1cb";
    overviewPen.beginPath();
    overviewPen.moveTo(x(0), currentY);
    overviewPen.lineTo(x(scaleKph), currentY);
    overviewPen.stroke();
    overviewPen.font = "10px system-ui";
    overviewPen.fillStyle = "#a5b8ca";
    overviewPen.textAlign = "right";
    overviewPen.fillText("0:00", x(0) - 4, y(0) + 3);
    overviewPen.fillText(clock(n), x(0) - 4, y(n) + 3);
    overviewPen.fillText(scaleKph + " km/h", x(scaleKph), height - 3);
  }

  function painter(): DriverTracePainter | undefined {
    if (!cycle || !snapshot || snapshot.targetKph === null) return;
    const schedule = cycle;
    const current = snapshot;
    return (context, width, height) => paintTrace(context, width, height, schedule, current, samples, t);
  }
  new ResizeObserver(() => draw(canvas, pen)).observe(canvas);
  new ResizeObserver(() => draw(operatorGuide, operatorPen)).observe(operatorGuide);
  new ResizeObserver(drawOverview).observe(overview);

  function refresh() {
    draw(canvas, pen);
    draw(operatorGuide, operatorPen);
    drawOverview();
    const trace = painter();
    if (snapshot && trace) updateMonitor(snapshot, trace);
  }

  return {
    setCycle(schedule?: DriveCycle) {
      cycle = schedule;
      peakKph = schedule?.speedKph.reduce((peak, speed) => Math.max(peak, speed), 0) ?? 0;
      const phases = schedule?.phases ?? [];
      phaseList.replaceChildren();
      phaseList.hidden = phases.length === 0;
      let start = 0;
      phaseList.style.gridTemplateColumns = phases.map(({ endS }) => {
        const width = endS - start;
        start = endS;
        return width + "fr";
      }).join(" ");
      for (const phase of phases) {
        const label = document.createElement("li");
        label.textContent = t(phase.title);
        phaseList.append(label);
      }
      selectedId = schedule?.id;
    },
    show(next: Snapshot, points: readonly Point[], running: boolean) {
      snapshot = next;
      samples = points;
      const id = next.config.scenario === "wltc" ? "wltc" : next.config.cycleId;
      live.hidden = next.targetKph === null || !cycle || id !== selectedId;
      inactive.hidden = !live.hidden;
      overview.hidden = live.hidden;
      overviewNote.hidden = !live.hidden;
      operatorGuide.hidden = live.hidden;
      operatorNote.hidden = !live.hidden;
      operatorLegend.hidden = live.hidden;
      if (live.hidden || next.targetKph === null || !cycle) {
        operatorStatus.textContent = "—";
        return;
      }
      const seconds = next.state.time_s;
      const error = next.state.speed_kph - next.targetKph;
      const phase = cycle.phases.findIndex(({ endS }) => seconds < endS);
      const left = Math.max(0, Math.ceil(next.cycleDurationS - seconds));
      const guidance = driverCue(error);
      const status = next.complete ? "Complete" : running ? "Running" : seconds === 0 ? "Ready" : "Paused";
      operatorStatus.textContent = t(status);
      get("driver-state").textContent = t(status);
      get("driver-cycle-title").textContent = cycle.title;
      get("driver-target").textContent = next.targetKph.toFixed(1);
      get("driver-actual").textContent = next.state.speed_kph.toFixed(1);
      get("driver-error").textContent = (error >= 0.05 ? "+" : "") + error.toFixed(1);
      cue.textContent = t(running ? guidance.text : status);
      cue.dataset.tone = running ? guidance.tone : "idle";
      get("driver-remaining").textContent = clock(left) + " " + t("remaining");
      get("driver-phase").textContent = t(next.complete ? "Cycle complete"
        : phase >= 0 ? cycle.phases[phase].title : "Cycle progress");
      Array.from(phaseList.children).forEach((label, index) => {
        label.textContent = t(cycle!.phases[index].title);
        if (index === phase) label.setAttribute("aria-current", "step");
        else label.removeAttribute("aria-current");
      });
      progress.max = next.cycleDurationS;
      progress.value = seconds;
      refresh();
    },
  };
}
