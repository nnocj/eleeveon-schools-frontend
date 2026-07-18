import type { UserMembership } from "../../lib/auth/roleRedirect";
import type { WorkspaceBootstrapProgress } from "../../lib/sync/workspaceBootstrap";

export type WorkspaceTransitionMode =
  | "startup"
  | "role-switch"
  | "school-switch"
  | "branch-switch"
  | "account-switch";

export type WorkspaceTransitionStageKey =
  | "preparing"
  | "access"
  | "membership"
  | "institution"
  | "settings"
  | "branding"
  | "appearance"
  | "data"
  | "dashboard"
  | "complete";

export type WorkspaceBootstrapStage = WorkspaceBootstrapProgress["stage"];

export type WorkspaceTransitionStage = {
  key: WorkspaceTransitionStageKey;
  bootstrapStage: WorkspaceBootstrapStage;
  percent: number;
  title: string;
  detail: string;
  tableName?: string;
  current?: number;
  total?: number;
};

export type WorkspaceTransitionRequest = {
  mode: WorkspaceTransitionMode;
  membership?: UserMembership | null;
  title?: string;
  detail?: string;
};

export type WorkspaceTransitionState = {
  active: boolean;
  request: WorkspaceTransitionRequest | null;
  stage: WorkspaceTransitionStage;
  error: string | null;
};

export type WorkspaceTransitionReporter = {
  setStage: (
    key: WorkspaceTransitionStageKey,
    overrides?: Partial<Omit<WorkspaceTransitionStage, "key">>,
  ) => void;
  setBootstrapProgress: (progress: WorkspaceBootstrapProgress) => void;
};

export type WorkspaceTransitionTask<T = void> = (
  reporter: WorkspaceTransitionReporter,
) => Promise<T>;
