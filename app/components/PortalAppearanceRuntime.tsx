"use client";

/**
 * app/components/PortalAppearanceRuntime.tsx
 * --------------------------------------------------------------------------
 * Global role-aware appearance readiness runtime.
 *
 * Responsibilities:
 * - observes the restored active membership;
 * - determines and verifies the expected role appearance identity;
 * - clears stale branch/account/platform appearance during transitions;
 * - reapplies appearance after reload;
 * - reacts to Branch Settings saves;
 * - exposes first-entry readiness without making realtime or sync authoritative.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useDatabase } from "../context/database-context";
import { useActiveMembership } from "../context/active-membership-context";
import { useSettings } from "../context/settings-context";
import { useTheme } from "../context/theme-context";

import {
  appearanceIdentityFor,
  appearanceIdentityMatches,
  type AppearanceScope,
} from "../lib/theme/appearanceScope";

import {
  clearScopedAppearance,
  type AppliedAppearance,
} from "../lib/theme/applyScopedAppearance";

export type PortalAppearanceReadiness = {
  ready: boolean;
  loading: boolean;
  firstEntryReady: boolean;
  effectiveScope: AppearanceScope | null;
  expectedFor: ReturnType<typeof appearanceIdentityFor> | null;
  appliedFor: AppliedAppearance | null;
  error?: string;
  refresh: () => Promise<AppliedAppearance | null>;
};

const PortalAppearanceContext = createContext<PortalAppearanceReadiness | null>(
  null,
);

function readableError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return "The selected workspace appearance could not be prepared.";
  }
}

export default function PortalAppearanceRuntime({
  children,
}: {
  children: ReactNode;
}) {
  const database = useDatabase();

  const {
    activeMembership,
    restored,
    transition,
    completeMembershipTransition,
    failMembershipTransition,
  } = useActiveMembership();

  const settings = useSettings();
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const requestRef = useRef(0);
  const lastReadyKeyRef = useRef<string | null>(null);
  const synchronizingKeyRef = useRef<string | null>(null);
  const pendingRefreshRef = useRef(false);

  const expectedFor = useMemo(
    () =>
      activeMembership
        ? appearanceIdentityFor({
            role: activeMembership.role,
            accountId: activeMembership.accountId,
            schoolId: activeMembership.schoolId,
            branchId: activeMembership.branchId,
          })
        : null,
    [activeMembership],
  );

  const synchronizeAppearance = useCallback(async () => {
    if (!database.ready || !restored) {
      setLoading(true);
      setReady(false);
      return null;
    }

    const synchronizationKey = activeMembership
      ? appearanceIdentityFor({
          role: activeMembership.role,
          accountId: activeMembership.accountId,
          schoolId: activeMembership.schoolId,
          branchId: activeMembership.branchId,
        }).key
      : "no-membership";

    // Prevent overlapping applications for the same role/workspace.
    // Queue another pass instead of discarding refreshes triggered by
    // Branch Settings saves.
    if (synchronizingKeyRef.current === synchronizationKey) {
      pendingRefreshRef.current = true;
      return null;
    }

    synchronizingKeyRef.current = synchronizationKey;
    const request = ++requestRef.current;

    if (!database.ready || !restored) {
      setLoading(true);
      setReady(false);
      return null;
    }

    if (!activeMembership) {
      clearScopedAppearance();
      theme.resetAppearance();

      if (request === requestRef.current) {
        lastReadyKeyRef.current = null;
        setError(undefined);
        setLoading(false);
        setReady(true);
      }

      return null;
    }

    const expected = appearanceIdentityFor({
      role: activeMembership.role,
      accountId: activeMembership.accountId,
      schoolId: activeMembership.schoolId,
      branchId: activeMembership.branchId,
    });

    setLoading(true);
    setReady(false);
    setError(undefined);

    try {
      // ThemeContext owns the actual document writes. It delegates settings
      // resolution to the role-aware SettingsContext before applying them.
      const applied = await theme.applyForMembership(activeMembership);

      if (request !== requestRef.current) {
        return applied;
      }

      if (!applied || !appearanceIdentityMatches(applied, expected)) {
        throw new Error(
          "The selected role appearance does not match the active workspace.",
        );
      }

      lastReadyKeyRef.current = expected.key;
      setReady(true);
      setLoading(false);

      if (typeof document !== "undefined") {
        document.documentElement.setAttribute(
          "data-portal-appearance-ready",
          expected.key,
        );
      }

      return applied;
    } catch (cause) {
      if (request !== requestRef.current) return null;

      clearScopedAppearance();
      theme.resetAppearance();
      lastReadyKeyRef.current = null;
      setReady(false);
      setLoading(false);
      setError(readableError(cause));

      if (typeof document !== "undefined") {
        document.documentElement.removeAttribute(
          "data-portal-appearance-ready",
        );
      }

      return null;
    } finally {
      if (synchronizingKeyRef.current === synchronizationKey) {
        synchronizingKeyRef.current = null;
      }

      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false;
        queueMicrotask(() => {
          void synchronizeAppearance();
        });
      }
    }
  }, [
    database.ready,
    restored,
    activeMembership?.role,
    activeMembership?.accountId,
    activeMembership?.schoolId,
    activeMembership?.branchId,
    theme.applyForMembership,
    theme.resetAppearance,
  ]);

  useEffect(() => {
    if (!transition.switching) {
      void synchronizeAppearance();
      return;
    }

    // A transition is complete once the stored target has become the active
    // membership. Previously this flag was never cleared, so appearance
    // synchronization was permanently blocked on the opening screen.
    const target = transition.target;
    const targetIdentity = target
      ? appearanceIdentityFor({
          role: target.role,
          accountId: target.accountId,
          schoolId: target.schoolId,
          branchId: target.branchId,
        })
      : null;

    const activeIdentity = activeMembership
      ? appearanceIdentityFor({
          role: activeMembership.role,
          accountId: activeMembership.accountId,
          schoolId: activeMembership.schoolId,
          branchId: activeMembership.branchId,
        })
      : null;

    if (
      targetIdentity &&
      appearanceIdentityMatches(targetIdentity, activeIdentity)
    ) {
      completeMembershipTransition();
      void synchronizeAppearance().catch((cause) => {
        failMembershipTransition(readableError(cause));
      });
      return;
    }

    requestRef.current += 1;
    clearScopedAppearance();
    theme.resetAppearance();
    setLoading(true);
    setReady(false);
    setError(undefined);
  }, [
    transition.switching,
    transition.target,
    activeMembership,
    completeMembershipTransition,
    failMembershipTransition,
    synchronizeAppearance,
    theme.resetAppearance,
  ]);

  useEffect(() => {
    const onSettingsUpdated = (event: Event) => {
      if (!activeMembership) return;

      const detail = (event as CustomEvent<any>).detail || {};
      const expected = appearanceIdentityFor({
        role: activeMembership.role,
        accountId: activeMembership.accountId,
        schoolId: activeMembership.schoolId,
        branchId: activeMembership.branchId,
      });

      if (
        expected.scope === "branch" &&
        detail.accountId &&
        String(detail.accountId) !== String(expected.accountId)
      ) {
        return;
      }

      if (
        expected.scope === "branch" &&
        detail.schoolId &&
        String(detail.schoolId) !== String(expected.schoolId)
      ) {
        return;
      }

      if (
        expected.scope === "branch" &&
        detail.branchId &&
        String(detail.branchId) !== String(expected.branchId)
      ) {
        return;
      }

      void synchronizeAppearance();
    };

    const onStorage = () => {
      void synchronizeAppearance();
    };

    window.addEventListener(
      "school-branch-settings-updated",
      onSettingsUpdated,
    );
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(
        "school-branch-settings-updated",
        onSettingsUpdated,
      );
      window.removeEventListener("storage", onStorage);
    };
  }, [activeMembership, synchronizeAppearance]);

  // A SettingsContext refresh may complete after Dexie is populated by a
  // workspace bootstrap. Re-run only when its loaded identity changes.
  useEffect(() => {
    if (!expectedFor || !settings.loadedFor || transition.switching) return;

    if (
      settings.loadedFor.key === expectedFor.key &&
      lastReadyKeyRef.current !== expectedFor.key
    ) {
      void synchronizeAppearance();
    }
  }, [
    expectedFor?.key,
    settings.loadedFor?.key,
    transition.switching,
    synchronizeAppearance,
  ]);

  const firstEntryReady = Boolean(
    ready &&
    !loading &&
    !transition.switching &&
    (!expectedFor ||
      (theme.appliedFor &&
        appearanceIdentityMatches(theme.appliedFor, expectedFor))),
  );

  const value = useMemo<PortalAppearanceReadiness>(
    () => ({
      ready,
      loading,
      firstEntryReady,
      effectiveScope: expectedFor?.scope || theme.effectiveScope || null,
      expectedFor,
      appliedFor: theme.appliedFor,
      error,
      refresh: synchronizeAppearance,
    }),
    [
      ready,
      loading,
      firstEntryReady,
      expectedFor,
      theme.effectiveScope,
      theme.appliedFor,
      error,
      synchronizeAppearance,
    ],
  );

  return (
    <PortalAppearanceContext.Provider value={value}>
      {children}
    </PortalAppearanceContext.Provider>
  );
}

export function usePortalAppearanceReadiness() {
  const context = useContext(PortalAppearanceContext);

  if (!context) {
    throw new Error(
      "usePortalAppearanceReadiness must be used inside PortalAppearanceRuntime.",
    );
  }

  return context;
}