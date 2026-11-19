import { useState } from "react";
import { api, duration, type Job } from "../api";

const CMD: Record<string, string> = { ingest: "Reconnaissance", prepare: "Préparation", analyze: "Analyse", transcribe: "Transcription" };

export function JobProgress({ job, onError }: { job: Job; onError: (m: string) => void }) {
  const [showLog, setShowLog] = useState(job.status === "failed");
  const pct = job.total ? Math.round(((job.status === "done" ? job.total : job.durations.length) / job.total) * 100) : job.status === "done" ? 100 : 0;
  const elapsed = ((job.finished ?? Date.now()) - job.started) / 1000;
  return (
    <div className={`job ${job.status}`}>
      <div className="row">
        <strong>{CMD[job.cmd] ?? job.cmd}</strong>
        <span className="muted small">
          {job.status === "running" ? "en cours" : job.status === "done" ? "terminée" : job.status === "cancelled" ? "annulée" : "échec"} ·{" "}
          {duration(elapsed)}
        </span>
        <div className="spacer" />
        {job.status === "running" && (
          <button className="small ghost" onClick={() => api.cancelJob(job.id).catch((e) => onError(e.message))}>
            Annuler
          </button>
        )}
        <button className="small ghost" onClick={() => setShowLog(!showLog)}>
          {showLog ? "Masquer le log" : "Log"}
        </button>
      </div>
      {(job.total > 0 || job.status === "running") && (
        <div className="progress">
          <div className={`bar ${job.status === "running" && !job.total ? "indeterminate" : ""}`} style={{ width: job.total ? `${pct}%` : undefined }} />
        </div>
      )}
      <div className="small job-step">
        {job.total > 0 && (
          <span className="mono">
            [{job.index}/{job.total}]{" "}
          </span>
        )}
        {job.clip && <span className="mono">{job.clip.replace(/^rushes\//, "")} · </span>}
        <span>{job.step}</span>
        {job.status === "running" && job.eta !== null && <span className="muted"> · reste ≈ {duration(job.eta)}</span>}
      </div>
      {showLog && <pre className="log">{job.log.join("\n")}</pre>}
    </div>
  );
}
