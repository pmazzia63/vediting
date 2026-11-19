import * as pty from "node-pty";
import { HttpError, ROOT } from "./paths.ts";

type Agent = "claude" | "codex" | "shell";
type Session = {
  id: string;
  agent: Agent;
  term: pty.IPty;
  history: string;
  clients: Set<{ send: (d: string) => void; readyState: number }>;
  alive: boolean;
};

const MAX_HISTORY = 200_000;
const sessions = new Map<string, Session>();

/** The app may itself be started from an agent session: don't leak its markers into the new one. */
function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k === "CLAUDECODE" || k.startsWith("CLAUDE_CODE_") || k === "NODE_ENV") continue;
    env[k] = v;
  }
  return { ...env, TERM: "xterm-256color", COLORTERM: "truecolor" };
}

function spawnSession(id: string, agent: Agent): Session {
  const shell = process.env.SHELL || "/bin/zsh";
  const term = pty.spawn(shell, ["-l"], {
    name: "xterm-256color",
    cols: 100,
    rows: 30,
    cwd: ROOT,
    env: cleanEnv(),
  });
  const s: Session = { id, agent, term, history: "", clients: new Set(), alive: true };
  term.onData((d) => {
    s.history += d;
    if (s.history.length > MAX_HISTORY) s.history = s.history.slice(-MAX_HISTORY);
    for (const c of s.clients) if (c.readyState === 1) c.send(JSON.stringify({ type: "data", data: d }));
  });
  term.onExit(({ exitCode }) => {
    s.alive = false;
    for (const c of s.clients) if (c.readyState === 1) c.send(JSON.stringify({ type: "exit", code: exitCode }));
    sessions.delete(id);
  });
  if (agent !== "shell") setTimeout(() => term.write(`${agent}\r`), 300);
  sessions.set(id, s);
  return s;
}

export function sessionInfo(id: string) {
  const s = sessions.get(id);
  return s ? { id, agent: s.agent, alive: s.alive } : null;
}

/** Start (or restart with another agent) the session `id`. */
export function startSession(id: string, agent: unknown) {
  if (!/^[a-z0-9-]{1,40}$/.test(id)) throw new HttpError(400, "Invalid session id");
  if (agent !== "claude" && agent !== "codex" && agent !== "shell") throw new HttpError(400, "Unknown agent");
  const existing = sessions.get(id);
  if (existing) {
    const clients = existing.clients;
    sessions.delete(id);
    existing.term.kill();
    const s = spawnSession(id, agent);
    for (const c of clients) {
      s.clients.add(c);
      if (c.readyState === 1) c.send(JSON.stringify({ type: "reset" }));
    }
    return sessionInfo(id);
  }
  spawnSession(id, agent);
  return sessionInfo(id);
}

/**
 * Paste text into the agent's prompt. Bracketed paste keeps multi-line prompts
 * as one message; the trailing carriage return submits it.
 */
export function sendInput(id: string, text: unknown, submit = true) {
  const s = sessions.get(id);
  if (!s) throw new HttpError(404, "Terminal non démarré");
  if (typeof text !== "string" || !text) throw new HttpError(400, "text required");
  s.term.write(`\x1b[200~${text}\x1b[201~`);
  if (submit) setTimeout(() => s.term.write("\r"), 120);
  return { ok: true };
}

export function attach(id: string, ws: any) {
  const s = sessions.get(id);
  if (!s) {
    ws.send(JSON.stringify({ type: "absent" }));
  } else {
    s.clients.add(ws);
    ws.send(JSON.stringify({ type: "hello", agent: s.agent, history: s.history }));
  }
  ws.on("message", (raw: Buffer) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const cur = sessions.get(id);
    if (!cur) return;
    cur.clients.add(ws);
    if (msg.type === "input" && typeof msg.data === "string") cur.term.write(msg.data);
    if (msg.type === "resize" && msg.cols > 0 && msg.rows > 0) cur.term.resize(Math.min(msg.cols, 500), Math.min(msg.rows, 200));
  });
  ws.on("close", () => sessions.get(id)?.clients.delete(ws));
}

export function killSessions() {
  for (const s of sessions.values()) s.term.kill();
}
