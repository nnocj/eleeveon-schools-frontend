import type { WorkspaceTransitionStage } from "./workspaceTypes";

export default function WorkspaceTransitionProgress({
  stage,
}: {
  stage: WorkspaceTransitionStage;
}) {
  const percent = Math.max(0, Math.min(100, stage.percent));

  return (
    <>
      <div className="workspace-transition-percent">
        <strong>{percent}%</strong>
        <span>{stage.detail}</span>
      </div>
      <div className="workspace-transition-track" aria-hidden="true">
        <i style={{ width: `${Math.max(2, percent)}%` }} />
      </div>
    </>
  );
}
