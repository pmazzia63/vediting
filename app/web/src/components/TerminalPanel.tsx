import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { api } from "../api";
import { SESSION, useStudio } from "../studio";
import type { Agent } from "../prompts";

const LABEL: Record<string, string> = { claude: "Claude Code", codex: "Codex", shell: "Shell" };

export function TerminalPanel() {
  const { agent, setAgent, terminalOpen, setTerminalOpen, sessionAgent, setSessionAgent, notify } = useStudio();
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal>();
  const fit = useRef<FitAddon>();
  const ws = useRef<WebSocket>();
  const [width, setWidth] = useState(() => Number(localStorage.getItem("vediting.terminalWidth")) || 480);
  const [connected, setConnected] = useState(false);

  // Create the xterm instance once; it survives page navigation.
  useEffect(() => {
    const t = new Terminal({
      fontFamily: '"SF Mono", Menlo, Monaco, monospace',
      fontSize: 12.5,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
      theme: { background: "#0d0f12", foreground: "#d8dde4", cursor: "#f5a623", selectionBackground: "#3a4250" },
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(host.current!);
    term.current = t;
    fit.current = f;
    t.onData((data) => ws.current?.readyState === 1 && ws.current.send(JSON.stringify({ type: "input", data })));
    t.onResize(({ cols, rows }) => ws.current?.readyState === 1 && ws.current.send(JSON.stringify({ type: "resize", cols, rows })));
    const ro = new ResizeObserver(() => {
      try {
        f.fit();
      } catch {
        /* hidden */
      }
    });
    ro.observe(host.current!);
    return () => {
      ro.disconnect();
      t.dispose();
    };
  }, []);

  // (Re)connect whenever the session changes.
  useEffect(() => {
    const t = term.current!;
    let closed = false;
    let retry: number | undefined;
    const open = () => {
      const sock = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/terminal/${SESSION}`);
      ws.current = sock;
      sock.onopen = () => setConnected(true);
      sock.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "hello") {
          t.reset();
          t.write(msg.history);
          sock.send(JSON.stringify({ type: "resize", cols: t.cols, rows: t.rows }));
        } else if (msg.type === "reset") {
          t.reset();
          sock.send(JSON.stringify({ type: "resize", cols: t.cols, rows: t.rows }));
        } else if (msg.type === "data") t.write(msg.data);
        else if (msg.type === "exit") {
          t.write("\r\n\x1b[90m[session terminée]\x1b[0m\r\n");
          setSessionAgent(null);
        } else if (msg.type === "absent") {
          t.reset();
        }
      };
      sock.onclose = () => {
        setConnected(false);
        if (!closed) retry = window.setTimeout(open, 1500);
      };
    };
    open();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws.current?.close();
    };
  }, [sessionAgent, setSessionAgent]);

  useEffect(() => {
    if (terminalOpen) requestAnimationFrame(() => fit.current?.fit());
  }, [terminalOpen, width]);

  const start = async (a: string) => {
    try {
      await api.startTerminal(SESSION, a);
      setSessionAgent(a);
      setTimeout(() => term.current?.focus(), 200);
    } catch (e) {
      notify((e as Error).message, "error");
    }
  };

  const onDrag = (e: React.PointerEvent) => {
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => setWidth(Math.min(Math.max(startW + startX - ev.clientX, 320), window.innerWidth - 360));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setWidth((w) => {
        localStorage.setItem("vediting.terminalWidth", String(w));
        return w;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <aside className="terminal-panel" style={{ width, display: terminalOpen ? "flex" : "none" }}>
      <div className="terminal-drag" onPointerDown={onDrag} />
      <div className="terminal-head">
        <div className="segmented">
          {(["claude", "codex"] as Agent[]).map((a) => (
            <button key={a} className={agent === a ? "on" : ""} onClick={() => setAgent(a)}>
              {LABEL[a]}
            </button>
          ))}
        </div>
        <span className={`dot ${sessionAgent ? "live" : ""}`} title={connected ? "connecté" : "déconnecté"} />
        <span className="muted small">{sessionAgent ? LABEL[sessionAgent] : "arrêté"}</span>
        <div className="spacer" />
        <button className="small" onClick={() => start(agent)}>
          {sessionAgent ? (sessionAgent === agent ? "Redémarrer" : `Basculer sur ${LABEL[agent]}`) : `Lancer ${LABEL[agent]}`}
        </button>
        <button className="small ghost" onClick={() => start("shell")} title="Shell zsh à la racine du repo">
          zsh
        </button>
        <button className="small ghost" onClick={() => setTerminalOpen(false)} title="Masquer (⌘J)">
          ✕
        </button>
      </div>
      <div className="terminal-body">
        <div ref={host} className="xterm-host" />
        {!sessionAgent && (
          <div className="terminal-empty">
            <p>Le terminal s'ouvre à la racine du repo vediting.</p>
            <button className="primary" onClick={() => start(agent)}>
              Lancer {LABEL[agent]}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
