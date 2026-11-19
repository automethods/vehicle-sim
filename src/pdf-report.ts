import { spawn } from "node:child_process";
import type { PdfPayload } from "./runtime.js";

export function pdfReport(python: string, script: string, payload: PdfPayload): Promise<Buffer<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    const renderer = spawn(python, [script], { timeout: 20_000 });
    const chunks: Buffer[] = [];
    let stderr = "";
    renderer.stderr.setEncoding("utf8");
    renderer.stderr.on("data", (chunk: string) => { stderr += chunk; });
    renderer.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    renderer.on("error", reject);
    renderer.stdin.on("error", () => {}); // The exit handler reports the renderer's diagnostic on a closed pipe.
    renderer.on("close", (code) => {
      if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
      else reject(new Error(stderr.trim() || "Unable to render the PDF report."));
    });
    renderer.stdin.end(JSON.stringify(payload));
  });
}
