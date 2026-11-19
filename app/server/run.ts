import { spawn } from "node:child_process";
import { CLI, ROOT, python } from "./paths.ts";

/** Run a short bin/vediting command and return its output. */
export function runCli(args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(python(), [CLI, ...args], { cwd: ROOT, env: { ...process.env, PYTHONUNBUFFERED: "1" } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", (e) => resolve({ code: 1, out: String(e) }));
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}
