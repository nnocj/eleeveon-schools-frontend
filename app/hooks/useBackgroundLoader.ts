"use client";

/**
 * app/hooks/useBackgroundLoader.ts
 * --------------------------------------------------------------------------
 * Compatibility loader for reactive Dexie modules.
 *
 * Existing modules can keep calling setLoading(true/false):
 * - before the first completed load, loading=true is blocking;
 * - after the first completed load, later loading=true calls set refreshing
 *   without hiding the current page;
 * - loading=false completes either mode.
 */

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

export type BackgroundLoaderState = {
  loading: boolean;
  initialLoading: boolean;
  refreshing: boolean;
  hasLoaded: boolean;
  setLoading: Dispatch<SetStateAction<boolean>>;
  run: <T>(operation: () => Promise<T>) => Promise<T>;
  reset: () => void;
};

export function useBackgroundLoader(
  initiallyLoading = true,
): BackgroundLoaderState {
  const hasLoadedRef = useRef(false);
  const requestedStateRef = useRef(initiallyLoading);

  const [initialLoading, setInitialLoading] =
    useState(initiallyLoading);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const setLoading = useCallback<
    Dispatch<SetStateAction<boolean>>
  >((nextValue) => {
    const next =
      typeof nextValue === "function"
        ? nextValue(requestedStateRef.current)
        : nextValue;

    requestedStateRef.current = next;

    if (next) {
      if (hasLoadedRef.current) {
        setRefreshing(true);
      } else {
        setInitialLoading(true);
      }
      return;
    }

    hasLoadedRef.current = true;
    setHasLoaded(true);
    setInitialLoading(false);
    setRefreshing(false);
  }, []);

  const run = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<T> => {
      setLoading(true);
      try {
        return await operation();
      } finally {
        setLoading(false);
      }
    },
    [setLoading],
  );

  const reset = useCallback(() => {
    hasLoadedRef.current = false;
    requestedStateRef.current = initiallyLoading;
    setHasLoaded(false);
    setInitialLoading(initiallyLoading);
    setRefreshing(false);
  }, [initiallyLoading]);

  return {
    loading: initialLoading,
    initialLoading,
    refreshing,
    hasLoaded,
    setLoading,
    run,
    reset,
  };
}