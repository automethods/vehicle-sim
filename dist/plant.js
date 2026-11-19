import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { plantStepS } from "./contracts.js";
export class TeslaPlant {
    process;
    request;
    failure;
    diagnostics = "";
    constructor(python, bridgePath, modelPath) {
        this.process = spawn(python, ["-B", "-u", bridgePath, modelPath]);
        this.process.stderr.setEncoding("utf8").on("data", (data) => {
            this.diagnostics = (this.diagnostics + data).slice(-2500);
        });
        const reader = createInterface({ input: this.process.stdout });
        reader.on("line", (line) => {
            const pending = this.request;
            this.request = undefined;
            if (!pending)
                return;
            try {
                const reply = JSON.parse(line);
                if (!reply.ok)
                    throw new Error(reply.error);
                pending.resolve(reply.state);
            }
            catch (error) {
                pending.reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
        this.process.once("error", (error) => this.fail(error));
        this.process.stdin.on("error", (error) => this.fail(error));
        this.process.once("close", () => {
            this.fail(new Error("Tesla model process stopped. " + this.diagnostics.trim()));
            reader.close();
        });
    }
    fail(error) {
        this.failure = error;
        this.request?.reject(error);
        this.request = undefined;
    }
    send(message) {
        if (this.failure)
            return Promise.reject(this.failure);
        if (this.request)
            return Promise.reject(new Error("The plant is already stepping."));
        return new Promise((resolve, reject) => {
            this.request = { resolve, reject };
            this.process.stdin.write(JSON.stringify(message) + "\n");
        });
    }
    reset(config) {
        return this.send({ op: "reset", config, dt_s: plantStepS });
    }
    step(ticks, inputs) {
        return this.send({ op: "step", ticks, inputs });
    }
    close() {
        this.process.stdin.end();
    }
}
