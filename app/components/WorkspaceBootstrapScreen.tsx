"use client";

import type {
  WorkspaceBootstrapProgress,
} from "../lib/sync/workspaceBootstrap";

export default function WorkspaceBootstrapScreen({
  progress,
  error,
  onRetry,
  onCancel,
}: {
  progress?:
    WorkspaceBootstrapProgress | null;
  error?: string | null;
  onRetry?: () => void;
  onCancel?: () => void;
}) {
  const title =
    error
      ? "Workspace needs attention"
      : progress?.title ||
        "Preparing workspace…";

  const detail =
    error ||
    progress?.detail ||
    "Loading the essential data required for this workspace.";

  return (
    <div
      className="workspace-bootstrap-overlay"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-label={title}
    >
      <style>{css}</style>

      <section className="workspace-bootstrap-card">
        <div
          className={
            error
              ? "workspace-bootstrap-icon error"
              : "workspace-bootstrap-spinner"
          }
        >
          {error
            ? "!"
            : ""}
        </div>

        <span>
          Secure workspace startup
        </span>

        <h2>{title}</h2>
        <p>{detail}</p>

        {!error && progress?.tableName && (
          <div className="workspace-bootstrap-table">
            Processing: <strong>{progress.tableName}</strong>
          </div>
        )}

        {!error && (
          <>
            <div className="workspace-bootstrap-percent">
              <strong>{Math.max(0, Math.min(100, progress?.percent ?? 0))}%</strong>
              {progress?.total ? (
                <span>
                  {(progress.current ?? 0).toLocaleString()} / {progress.total.toLocaleString()} records
                </span>
              ) : (
                <span>Downloading and validating all permitted tables</span>
              )}
            </div>

            <div className="workspace-bootstrap-track">
              <i
                style={{
                  width: `${Math.max(2, Math.min(100, progress?.percent ?? 2))}%`,
                }}
              />
            </div>
          </>
        )}

        {error && (
          <div className="workspace-bootstrap-actions">
            {onCancel && (
              <button
                type="button"
                className="ghost"
                onClick={
                  onCancel
                }
              >
                Back
              </button>
            )}

            {onRetry && (
              <button
                type="button"
                onClick={
                  onRetry
                }
              >
                Retry
              </button>
            )}
          </div>
        )}

        <small>
          Offline records are preserved.
        </small>
      </section>
    </div>
  );
}

const css = `
.workspace-bootstrap-overlay {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: grid;
  place-items: center;
  padding: 18px;
  background:
    color-mix(in srgb, var(--bg, #f8fafc) 88%, transparent);
  backdrop-filter: blur(14px);
}

.workspace-bootstrap-card {
  width: min(430px, 100%);
  padding: 24px;
  display: grid;
  justify-items: center;
  text-align: center;
  border-radius: 26px;
  border: 1px solid
    color-mix(in srgb, var(--primary-color, #2563eb) 18%, transparent);
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  box-shadow: 0 28px 80px rgba(15, 23, 42, .16);
}

.workspace-bootstrap-card > span {
  margin-top: 16px;
  color: var(--primary-color, #2563eb);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.workspace-bootstrap-card h2 {
  margin: 6px 0;
  font-size: 23px;
  letter-spacing: -.035em;
}

.workspace-bootstrap-card p {
  max-width: 330px;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.55;
}

.workspace-bootstrap-spinner,
.workspace-bootstrap-icon {
  width: 54px;
  height: 54px;
  border-radius: 19px;
}

.workspace-bootstrap-spinner {
  border: 5px solid
    color-mix(in srgb, var(--primary-color, #2563eb) 17%, transparent);
  border-top-color: var(--primary-color, #2563eb);
  animation: workspace-spin .8s linear infinite;
}

.workspace-bootstrap-icon {
  display: grid;
  place-items: center;
  background: rgba(220, 38, 38, .1);
  color: #dc2626;
  font-size: 25px;
  font-weight: 1000;
}

.workspace-bootstrap-table {
  max-width: 100%;
  margin-top: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-color, #2563eb) 8%, transparent);
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-bootstrap-table strong {
  color: var(--text, #0f172a);
}

.workspace-bootstrap-track {
  width: min(250px, 80%);
  height: 5px;
  margin: 19px 0 4px;
  overflow: hidden;
  border-radius: 999px;
  background:
    color-mix(in srgb, var(--primary-color, #2563eb) 12%, transparent);
}

.workspace-bootstrap-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--primary-color, #2563eb);
  transition: width .28s ease;
}

.workspace-bootstrap-percent {
  width: min(250px, 80%);
  margin-top: 18px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.workspace-bootstrap-percent strong {
  color: var(--primary-color, #2563eb);
  font-size: 25px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.workspace-bootstrap-percent span {
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 850;
  text-align: right;
}

.workspace-bootstrap-actions {
  width: 100%;
  margin-top: 18px;
  display: flex;
  justify-content: center;
  gap: 9px;
}

.workspace-bootstrap-actions button {
  min-height: 42px;
  padding: 0 17px;
  border: 0;
  border-radius: 13px;
  background: var(--primary-color, #2563eb);
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}

.workspace-bootstrap-actions button.ghost {
  border: 1px solid rgba(148, 163, 184, .28);
  background: transparent;
  color: inherit;
}

.workspace-bootstrap-card small {
  margin-top: 14px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 750;
}

@keyframes workspace-spin {
  to { transform: rotate(360deg); }
}

@keyframes workspace-progress {
  from { transform: translateX(-115%); }
  to { transform: translateX(340%); }
}
`;