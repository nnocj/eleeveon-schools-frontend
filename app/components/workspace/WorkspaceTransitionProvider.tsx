"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import WorkspaceTransitionOverlay from "./WorkspaceTransitionOverlay";
import { workspaceStage } from "./workspaceStages";
import type {
  WorkspaceTransitionRequest,
  WorkspaceTransitionStageKey,
  WorkspaceTransitionState,
  WorkspaceTransitionTask,
} from "./workspaceTypes";
import type { WorkspaceBootstrapProgress } from "../../lib/sync/workspaceBootstrap";

type WorkspaceTransitionContextValue = {
  state: WorkspaceTransitionState;
  busy: boolean;
  runTransition: <T>(
    request: WorkspaceTransitionRequest,
    task: WorkspaceTransitionTask<T>,
  ) => Promise<T>;
  setStage: (
    key: WorkspaceTransitionStageKey,
    overrides?: Parameters<typeof workspaceStage>[1],
  ) => void;
  setBootstrapProgress: (progress: WorkspaceBootstrapProgress) => void;
  failTransition: (message: string) => void;
  cancelTransition: () => void;
};

const initialState: WorkspaceTransitionState = {
  active: false,
  request: null,
  stage: workspaceStage("preparing"),
  error: null,
};

const WorkspaceTransitionContext =
  createContext<WorkspaceTransitionContextValue | null>(null);

function nextPaint() {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => resolve()),
    );
  });
}

export function WorkspaceTransitionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(initialState);
  const runningRef = useRef(false);

  const setStage = useCallback<WorkspaceTransitionContextValue["setStage"]>(
    (key, overrides) => {
      setState((current) => ({
        ...current,
        active: true,
        error: null,
        stage: workspaceStage(key, overrides),
      }));
    },
    [],
  );

  const setBootstrapProgress = useCallback((progress: WorkspaceBootstrapProgress) => {
    setState((current) => ({
      ...current,
      active: true,
      error: null,
      stage: {
        ...current.stage,
        key: "data",
        bootstrapStage: progress.stage,
        percent: progress.percent,
        title: progress.title,
        detail: progress.detail,
        tableName: progress.tableName,
        current: progress.current,
        total: progress.total,
      },
    }));
  }, []);

  const failTransition = useCallback((message: string) => {
    runningRef.current = false;
    setState((current) => ({ ...current, active: true, error: message }));
  }, []);

  const cancelTransition = useCallback(() => {
    runningRef.current = false;
    setState(initialState);
  }, []);

  const runTransition = useCallback<WorkspaceTransitionContextValue["runTransition"]>(
    async (request, task) => {
      if (runningRef.current) {
        throw new Error("A workspace transition is already running.");
      }

      runningRef.current = true;
      setState({
        active: true,
        request,
        stage: workspaceStage("preparing", {
          title: request.title,
          detail: request.detail,
        }),
        error: null,
      });

      await nextPaint();

      try {
        const result = await task({ setStage, setBootstrapProgress });
        setStage("complete");
        await nextPaint();
        return result;
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "The workspace transition could not be completed.";
        failTransition(message);
        throw error;
      } finally {
        runningRef.current = false;
      }
    },
    [failTransition, setBootstrapProgress, setStage],
  );

  const value = useMemo<WorkspaceTransitionContextValue>(
    () => ({
      state,
      busy: state.active && !state.error,
      runTransition,
      setStage,
      setBootstrapProgress,
      failTransition,
      cancelTransition,
    }),
    [state, runTransition, setStage, setBootstrapProgress, failTransition, cancelTransition],
  );

  return (
    <WorkspaceTransitionContext.Provider value={value}>
      {children}
      <WorkspaceTransitionOverlay
        state={state}
        onCancel={state.error ? cancelTransition : undefined}
      />
    </WorkspaceTransitionContext.Provider>
  );
}

export function useWorkspaceTransition() {
  const context = useContext(WorkspaceTransitionContext);
  if (!context) {
    throw new Error("useWorkspaceTransition must be used inside WorkspaceTransitionProvider");
  }
  return context;
}
