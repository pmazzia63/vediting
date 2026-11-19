import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import { StudioProvider, useStudio } from "./studio";
import { TerminalPanel } from "./components/TerminalPanel";
import { Projects } from "./pages/Projects";
import { Project } from "./pages/Project";
import { Viewer } from "./pages/Viewer";

function Shell() {
  const { terminalOpen, setTerminalOpen, toast } = useStudio();
  return (
    <div className={`shell ${terminalOpen ? "with-terminal" : ""}`}>
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">▶</span> vediting <span className="muted">Studio</span>
        </Link>
        <button className="ghost" onClick={() => setTerminalOpen(!terminalOpen)} title="Afficher / masquer le terminal (⌘J)">
          {terminalOpen ? "Masquer le terminal" : "Terminal"}
        </button>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Projects />} />
          <Route path="/p/:project" element={<Project />} />
          <Route path="/p/:project/:goal" element={<Viewer />} />
        </Routes>
      </main>
      <TerminalPanel />
      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <StudioProvider>
        <Shell />
      </StudioProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
