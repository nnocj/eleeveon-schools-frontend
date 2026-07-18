import type {
  WorkspaceTransitionMode,
  WorkspaceTransitionStage,
  WorkspaceTransitionStageKey,
} from "./workspaceTypes";

const STAGES: Record<WorkspaceTransitionStageKey, WorkspaceTransitionStage> = {
  preparing: {
    key: "preparing",
    bootstrapStage: "checking-cache",
    percent: 8,
    title: "Preparing workspace…",
    detail: "Securing the next workspace transition.",
  },
  access: {
    key: "access",
    bootstrapStage: "checking-cache",
    percent: 14,
    title: "Updating access…",
    detail: "Validating the selected role and workspace permissions.",
  },
  membership: {
    key: "membership",
    bootstrapStage: "checking-cache",
    percent: 20,
    title: "Opening selected role…",
    detail: "Activating the selected membership and profile context.",
  },
  institution: {
    key: "institution",
    bootstrapStage: "applying",
    percent: 78,
    title: "Resolving school and branch…",
    detail: "Loading the permitted institution context for this role.",
  },
  settings: {
    key: "settings",
    bootstrapStage: "applying",
    percent: 84,
    title: "Loading workspace settings…",
    detail: "Refreshing the settings permitted for this workspace.",
  },
  branding: {
    key: "branding",
    bootstrapStage: "applying",
    percent: 88,
    title: "Applying branding…",
    detail: "Preparing the correct school, branch, or account identity.",
  },
  appearance: {
    key: "appearance",
    bootstrapStage: "applying",
    percent: 92,
    title: "Applying appearance…",
    detail: "Loading the correct colours, theme, typography, and display preferences.",
  },
  data: {
    key: "data",
    bootstrapStage: "requesting",
    percent: 24,
    title: "Downloading permitted workspace data…",
    detail: "Downloading and validating all permitted tables for this role.",
  },
  dashboard: {
    key: "dashboard",
    bootstrapStage: "applying",
    percent: 97,
    title: "Preparing dashboard…",
    detail: "Finalizing the selected workspace before opening it.",
  },
  complete: {
    key: "complete",
    bootstrapStage: "ready",
    percent: 100,
    title: "Workspace ready",
    detail: "Opening the selected workspace.",
  },
};

export function workspaceStage(
  key: WorkspaceTransitionStageKey,
  overrides?: Partial<Omit<WorkspaceTransitionStage, "key">>,
): WorkspaceTransitionStage {
  return { ...STAGES[key], ...overrides, key };
}

export function workspaceTransitionLabel(mode?: WorkspaceTransitionMode) {
  switch (mode) {
    case "role-switch": return "Secure workspace switch";
    case "school-switch": return "Secure school switch";
    case "branch-switch": return "Secure branch switch";
    case "account-switch": return "Secure account switch";
    default: return "Secure workspace startup";
  }
}
