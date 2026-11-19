import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Agent } from "./prompts";

export const SESSION = "main";

type Toast = { text: string; kind: "info" | "error" } | null;
type Studio = {
  agent: Agent;
  /** The agent prompts are written for: the running one, else the selected one. */
  promptAgent: Agent;
  setAgent: (a: Agent) => void;
  terminalOpen: boolean;
  setTerminalOpen: (v: boolean) => void;
  /** Bumped when the panel should (re)start its session with the current agent. */
  sessionAgent: string | null;
  setSessionAgent: (a: string | null) => void;
  send: (text: string) => Promise<void>;
  copy: (text: string) => Promise<void>;
  notify: (text: string, kind?: "info" | "error") => void;
  toast: Toast;
};

const Ctx = createContext<Studio | null>(null);

function stored<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [agent, setAgentState] = useState<Agent>(() => stored<Agent>("vediting.agent", "claude"));
  const [terminalOpen, setOpenState] = useState(() => stored("vediting.terminal", "1") === "1");
  const [sessionAgent, setSessionAgent] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const timer = useRef<number>();

  const notify = useCallback((text: string, kind: "info" | "error" = "info") => {
    setToast({ text, kind });
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), kind === "error" ? 6000 : 2500);
  }, []);

  const setAgent = (a: Agent) => {
    setAgentState(a);
    store("vediting.agent", a);
  };
  const setTerminalOpen = (v: boolean) => {
    setOpenState(v);
    store("vediting.terminal", v ? "1" : "0");
  };

  useEffect(() => {
    api.terminal(SESSION).then((s) => setSessionAgent(s.alive ? s.agent : null)).catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setTerminalOpen(!terminalOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const send = useCallback(
    async (text: string) => {
      setTerminalOpen(true);
      try {
        const s = await api.terminal(SESSION);
        if (!s.alive) {
          await api.startTerminal(SESSION, agent);
          setSessionAgent(agent);
          notify(`Démarrage de ${agent === "claude" ? "Claude Code" : "Codex"}…`);
          // Give the agent's TUI time to come up before pasting.
          await new Promise((r) => setTimeout(r, 4000));
        }
        await api.sendToTerminal(SESSION, text);
        notify("Prompt envoyé au terminal");
      } catch (e) {
        notify(String((e as Error).message), "error");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agent, notify],
  );

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        notify("Prompt copié");
      } catch {
        notify("Copie impossible dans ce navigateur", "error");
      }
    },
    [notify],
  );

  const promptAgent: Agent = sessionAgent === "claude" || sessionAgent === "codex" ? sessionAgent : agent;

  return (
    <Ctx.Provider
      value={{ agent, promptAgent, setAgent, terminalOpen, setTerminalOpen, sessionAgent, setSessionAgent, send, copy, notify, toast }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useStudio() {
  const v = useContext(Ctx);
  if (!v) throw new Error("StudioProvider missing");
  return v;
}
