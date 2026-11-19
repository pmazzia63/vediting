import path from "node:path";
import chokidar from "chokidar";
import { PROJECTS } from "./paths.ts";

type Client = { send: (data: string) => void; readyState: number };
const clients = new Set<Client>();

export function addClient(ws: Client & { on: (ev: string, cb: () => void) => void }) {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
}

export function broadcast(message: unknown) {
  const data = JSON.stringify(message);
  for (const c of clients) if (c.readyState === 1) c.send(data);
}

/** Watch projects/ (shallowly enough to stay cheap) and announce which project changed. */
export function watchProjects() {
  const pending = new Map<string, NodeJS.Timeout>();
  const watcher = chokidar.watch(PROJECTS, {
    ignoreInitial: true,
    depth: 6,
    followSymlinks: false,
    ignored: (p: string) => /(^|[/\\])\.|\.tmp-\d+$|\/images\/|\.(jpg|png|wav)$/.test(p) && !p.endsWith(PROJECTS),
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 300 },
  });
  watcher.on("all", (_event, file) => {
    const rel = path.relative(PROJECTS, file).split(path.sep);
    const project = rel[0];
    if (!project) return;
    const goal = rel[1] === "goals" ? rel[2] : undefined;
    const area = goal ? rel[3] : rel[1];
    const key = `${project}/${goal ?? ""}/${area ?? ""}`;
    clearTimeout(pending.get(key));
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        broadcast({ type: "fs", project, goal, area });
      }, 400),
    );
  });
  return watcher;
}
