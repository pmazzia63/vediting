export type ProjectSummary = {
  slug: string;
  name: string;
  format: string;
  clips: number | null;
  rushes: number;
  stage: string;
  goals: number;
  latest: { goal: string; version: string } | null;
  updated: number;
};

export type Clip = {
  id: string;
  source: string;
  duration: number;
  width: number | null;
  height: number | null;
  graphics: boolean;
  prepared: boolean;
  transcript: boolean;
  moments: "missing" | "pending" | "done";
  rev: string | null;
};

export type Goal = { slug: string; format: string; stage: string; exports: string[]; latest: string | null };

export type ProjectDetail = {
  slug: string;
  name: string;
  format: string;
  path: string;
  rushesPath: string;
  revision: string;
  stage: string;
  rushes: { path: string; size: number; video: boolean; ingested: boolean }[];
  clips: Clip[];
  errors: Record<string, string>;
  goals: Goal[];
};

export type Job = {
  id: string;
  project: string;
  cmd: string;
  args: string[];
  status: "running" | "done" | "failed" | "cancelled";
  index: number;
  total: number;
  clip: string;
  step: string;
  log: string[];
  started: number;
  finished: number | null;
  eta: number | null;
  durations: number[];
  code: number | null;
};

export type ExportInfo = {
  version: string;
  url: string;
  fps: number;
  width: number | null;
  height: number | null;
  size: number;
  created: number;
  notes: number;
};

export type Note = { id: string; start: number; end: number | null; text: string; created: number };

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `${res.status} ${res.statusText}`);
  return data as T;
}

const enc = encodeURIComponent;
const goalBase = (p: string, g: string) => `/api/projects/${enc(p)}/goals/${enc(g)}`;

export const api = {
  projects: () => request<ProjectSummary[]>("GET", "/api/projects"),
  createProject: (name: string) => request<{ slug: string }>("POST", "/api/projects", { name }),
  project: (p: string) => request<ProjectDetail>("GET", `/api/projects/${enc(p)}`),
  reveal: (p: string, goal?: string) => request("POST", `/api/projects/${enc(p)}/reveal`, { goal }),
  jobs: (p: string) => request<Job[]>("GET", `/api/projects/${enc(p)}/jobs`),
  startJob: (p: string, cmd: string, opts: { skipGraphics?: boolean } = {}) =>
    request<Job>("POST", `/api/projects/${enc(p)}/jobs`, { cmd, ...opts }),
  cancelJob: (id: string) => request("POST", `/api/jobs/${enc(id)}/cancel`, {}),
  createGoal: (p: string, slug: string, format: string) =>
    request<{ slug: string }>("POST", `/api/projects/${enc(p)}/goals`, { slug, format }),
  context: (p: string, g?: string) =>
    request<{ text: string; mtime: number }>("GET", g ? `${goalBase(p, g)}/context` : `/api/projects/${enc(p)}/context`),
  saveContext: (p: string, g: string | undefined, text: string, mtime: number) =>
    request<{ mtime: number }>("PUT", g ? `${goalBase(p, g)}/context` : `/api/projects/${enc(p)}/context`, { text, mtime }),
  exports: (p: string, g: string) => request<ExportInfo[]>("GET", `${goalBase(p, g)}/exports`),
  notes: (p: string, g: string, v: string) => request<{ notes: Note[] }>("GET", `${goalBase(p, g)}/notes/${enc(v)}`),
  saveNotes: (p: string, g: string, v: string, notes: Note[]) => request("PUT", `${goalBase(p, g)}/notes/${enc(v)}`, { notes }),
  terminal: (id: string) => request<{ id: string; agent: string | null; alive: boolean }>("GET", `/api/terminal/${enc(id)}`),
  startTerminal: (id: string, agent: string) => request("POST", `/api/terminal/${enc(id)}/start`, { agent }),
  sendToTerminal: (id: string, text: string) => request("POST", `/api/terminal/${enc(id)}/input`, { text }),
};

/* ---------- live events ---------- */

type Listener = (msg: any) => void;
const listeners = new Set<Listener>();
let socket: WebSocket | null = null;

function connect() {
  socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/events`);
  socket.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    for (const l of listeners) l(msg);
  };
  socket.onclose = () => setTimeout(connect, 1500);
}

export function onEvent(fn: Listener) {
  if (!socket) connect();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/* ---------- formatting ---------- */

export function timecode(seconds: number, withMs = true) {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 1000 + 1e-6);
  const base = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return withMs ? `${base}.${String(ms).padStart(3, "0")}` : base;
}

export function bytes(n: number) {
  if (n > 1e9) return `${(n / 1e9).toFixed(1)} Go`;
  if (n > 1e6) return `${(n / 1e6).toFixed(0)} Mo`;
  return `${Math.round(n / 1e3)} Ko`;
}

export function duration(seconds: number) {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)} h ${Math.round((seconds % 3600) / 60)} min`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
  return `${Math.round(seconds)} s`;
}
