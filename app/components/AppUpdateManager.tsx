"use client";

/**
 * app/components/AppUpdateManager.tsx
 * --------------------------------------------------------------------------
 * Safe deployment detection and service-worker activation.
 *
 * The component renders nothing.
 */

import {
  useCallback,
  useEffect,
  useRef,
} from "react";

import { useDatabase } from "../context/database-context";

import {
  compareAppVersions,
  fetchRemoteAppVersion,
  getBundledAppVersion,
  rememberLoadedAppVersion,
  shouldReloadForControllerChange,
  type AppVersionMetadata,
} from "../lib/pwa/appVersion";

const CHECK_INTERVAL_MS =
  3 * 60_000;

const MINIMUM_CHECK_GAP_MS =
  15_000;

type AppVersionChangedDetail = {
  metadata?: Partial<AppVersionMetadata>;
};

export default function AppUpdateManager() {
  const database = useDatabase();

  const checkingRef =
    useRef(false);

  const lastCheckedAtRef =
    useRef(0);

  const pendingBuildIdRef =
    useRef<string | null>(
      null,
    );

  const controllerChangeHandledRef =
    useRef(false);

  const requestWorkerUpdate =
    useCallback(
      async (
        metadata:
          AppVersionMetadata,
      ) => {
        if (
          !("serviceWorker" in navigator)
        ) {
          return;
        }

        pendingBuildIdRef.current =
          metadata.buildId;

        const registration =
          await navigator
            .serviceWorker
            .getRegistration();

        if (!registration) {
          return;
        }

        await registration.update();

        const waiting =
          registration.waiting;

        if (waiting) {
          waiting.postMessage({
            type: "SKIP_WAITING",
          });
        }
      },
      [],
    );

  const checkForUpdate =
    useCallback(
      async (
        force = false,
      ) => {
        if (
          typeof window ===
            "undefined" ||
          !navigator.onLine ||
          checkingRef.current
        ) {
          return;
        }

        const now =
          Date.now();

        if (
          !force &&
          now -
            lastCheckedAtRef.current <
            MINIMUM_CHECK_GAP_MS
        ) {
          return;
        }

        checkingRef.current =
          true;

        lastCheckedAtRef.current =
          now;

        try {
          const remote =
            await fetchRemoteAppVersion();

          const comparison =
            compareAppVersions(
              remote,
            );

          if (
            !comparison
              .updateAvailable
          ) {
            rememberLoadedAppVersion(
              comparison.local,
            );

            return;
          }

          /**
           * DatabaseBootstrap remains mounted outside the application provider
           * tree. After reload it opens/migrates Dexie before children render.
           *
           * Do not attempt to clear IndexedDB or manually mutate its version.
           */
          await requestWorkerUpdate(
            remote,
          );
        } catch (error) {
          console.warn(
            "[app-update] version check failed",
            error,
          );
        } finally {
          checkingRef.current =
            false;
        }
      },
      [requestWorkerUpdate],
    );

  useEffect(() => {
    rememberLoadedAppVersion(
      getBundledAppVersion(),
    );
  }, []);

  useEffect(() => {
    if (
      typeof window ===
        "undefined" ||
      !(
        "serviceWorker" in
        navigator
      )
    ) {
      return;
    }

    const handleControllerChange =
      () => {
        if (
          controllerChangeHandledRef
            .current
        ) {
          return;
        }

        controllerChangeHandledRef
          .current = true;

        const buildId =
          pendingBuildIdRef.current ||
          "controller-change";

        if (
          shouldReloadForControllerChange(
            buildId,
          )
        ) {
          window.location.reload();
        }
      };

    navigator.serviceWorker
      .addEventListener(
        "controllerchange",
        handleControllerChange,
      );

    return () => {
      navigator.serviceWorker
        .removeEventListener(
          "controllerchange",
          handleControllerChange,
        );
    };
  }, []);

  useEffect(() => {
    if (
      typeof window ===
      "undefined"
    ) {
      return;
    }

    const onFocus = () => {
      void checkForUpdate();
    };

    const onVisible = () => {
      if (
        document.visibilityState ===
        "visible"
      ) {
        void checkForUpdate();
      }
    };

    const onOnline = () => {
      void checkForUpdate(true);
    };

    const onBackendVersionChanged =
      (
        event: Event,
      ) => {
        const detail =
          (
            event as CustomEvent<
              AppVersionChangedDetail
            >
          ).detail;

        if (
          detail?.metadata
            ?.buildId
        ) {
          pendingBuildIdRef.current =
            String(
              detail.metadata
                .buildId,
            );
        }

        void checkForUpdate(
          true,
        );
      };

    window.addEventListener(
      "focus",
      onFocus,
    );

    window.addEventListener(
      "online",
      onOnline,
    );

    window.addEventListener(
      "eleeveon:app-version-changed",
      onBackendVersionChanged,
    );

    document.addEventListener(
      "visibilitychange",
      onVisible,
    );

    const interval =
      window.setInterval(
        () => {
          void checkForUpdate();
        },
        CHECK_INTERVAL_MS,
      );

    void checkForUpdate(
      true,
    );

    return () => {
      window.removeEventListener(
        "focus",
        onFocus,
      );

      window.removeEventListener(
        "online",
        onOnline,
      );

      window.removeEventListener(
        "eleeveon:app-version-changed",
        onBackendVersionChanged,
      );

      document.removeEventListener(
        "visibilitychange",
        onVisible,
      );

      window.clearInterval(
        interval,
      );
    };
  }, [checkForUpdate]);

  /**
   * This dependency makes the intended ordering explicit:
   * database-dependent application children are already guarded by
   * DatabaseBootstrap, while update checks themselves may run independently.
   */
  useEffect(() => {
    if (
      database.ready
    ) {
      void checkForUpdate();
    }
  }, [
    database.ready,
    checkForUpdate,
  ]);

  return null;
}