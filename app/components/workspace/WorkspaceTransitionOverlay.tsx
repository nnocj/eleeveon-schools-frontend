"use client";

import WorkspaceBootstrapScreen from "../WorkspaceBootstrapScreen";
import type { WorkspaceTransitionState } from "./workspaceTypes";

export default function WorkspaceTransitionOverlay({
  state,
  onRetry,
  onCancel,
}: {
  state: WorkspaceTransitionState;
  onRetry?: () => void;
  onCancel?: () => void;
}) {
  if (!state.active && !state.error) return null;

  return (
    <WorkspaceBootstrapScreen
      progress={{
        stage: state.stage.bootstrapStage,
        percent: state.stage.percent,
        title: state.stage.title,
        detail: state.stage.detail,
        tableName: state.stage.tableName,
        current: state.stage.current,
        total: state.stage.total,
      }}
      error={state.error}
      onRetry={onRetry}
      onCancel={onCancel}
    />
  );
}
