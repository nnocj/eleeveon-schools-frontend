/**
 * app/lib/realtime/realtimeClient.ts
 * --------------------------------------------------------------------------
 * Authenticated Socket.IO client for lightweight backend invalidations.
 *
 * Connection-race fixes:
 * - reuse a socket that is already connecting for the same account;
 * - never destroy a valid in-progress connection merely because connect() is
 *   requested twice;
 * - keep polling first and allow Socket.IO to upgrade to WebSocket;
 * - guard stale socket callbacks with one connection generation.
 */

import { io, type Socket } from "socket.io-client";

import {
  getApiBaseUrl,
  getAuthToken,
  getDeviceId,
} from "../sync/syncConfig";

import {
  getSessionGeneration,
  isLogoutInProgress,
  isSessionGenerationCurrent,
} from "../auth/sessionGeneration";

export type RealtimeEventType =
  | "ACCOUNT_DATA_CHANGED"
  | "MEMBERSHIPS_CHANGED"
  | "PERMISSIONS_CHANGED"
  | "BRANCH_SETTINGS_CHANGED"
  | "ANNOUNCEMENT_CREATED"
  | "MESSAGE_CREATED"
  | "SYNC_CONFLICT_CREATED"
  | "APP_MAINTENANCE_CHANGED";

export type MembershipChangeAction =
  | "created"
  | "updated"
  | "activated"
  | "deactivated"
  | "deleted";

export type RealtimeInvalidationEvent = {
  type: RealtimeEventType;
  accountId: string;
  changedTables: string[];
  sourceDeviceId?: string | null;
  revision: number;
  at: number;
  schoolId?: string | number | null;
  branchId?: string | number | null;
  userId?: string;
  membershipId?: string;
  action?: MembershipChangeAction;
  active?: boolean;
  metadata?: Record<string, unknown>;
};

export type RealtimeConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "unauthorized"
  | "error"
  | "closed";

export type RealtimeStatusSnapshot = {
  status: RealtimeConnectionStatus;
  connected: boolean;
  socketId?: string;
  accountId?: string | null;
  deviceId?: string | null;
  lastConnectedAt?: number;
  lastDisconnectedAt?: number;
  lastEventAt?: number;
  lastError?: string;
  reconnectAttempt: number;
};

type ConnectOptions = {
  accountId: string;
  schoolId?: number | string | null;
  branchId?: number | string | null;
};

type EventListener = (
  event: RealtimeInvalidationEvent,
) => void;

type StatusListener = (
  snapshot: RealtimeStatusSnapshot,
) => void;

const EVENT_NAMES: RealtimeEventType[] = [
  "ACCOUNT_DATA_CHANGED",
  "MEMBERSHIPS_CHANGED",
  "PERMISSIONS_CHANGED",
  "BRANCH_SETTINGS_CHANGED",
  "ANNOUNCEMENT_CREATED",
  "MESSAGE_CREATED",
  "SYNC_CONFLICT_CREATED",
  "APP_MAINTENANCE_CHANGED",
];

const eventListeners =
  new Set<EventListener>();

const statusListeners =
  new Set<StatusListener>();

let socket: Socket | null = null;
let connectOptions:
  | ConnectOptions
  | null = null;

let lifecycleBound = false;
let connectionGeneration = 0;

let snapshot:
  RealtimeStatusSnapshot = {
  status: "idle",
  connected: false,
  reconnectAttempt: 0,
};

function updateStatus(
  patch:
    Partial<RealtimeStatusSnapshot>,
) {
  snapshot = {
    ...snapshot,
    ...patch,
  };

  for (
    const listener of
    statusListeners
  ) {
    try {
      listener(snapshot);
    } catch (error) {
      console.error(
        "[realtime] status listener failed",
        error,
      );
    }
  }
}

function publishEvent(
  event:
    RealtimeInvalidationEvent,
  generation: number,
) {
  if (
    !isSessionGenerationCurrent(
      generation,
    )
  ) {
    return;
  }

  updateStatus({
    lastEventAt:
      Date.now(),
  });

  for (
    const listener of
    eventListeners
  ) {
    try {
      listener(event);
    } catch (error) {
      console.error(
        "[realtime] event listener failed",
        error,
      );
    }
  }
}

function baseUrl() {
  return String(
    getApiBaseUrl() ||
      process.env
        .NEXT_PUBLIC_API_URL ||
      process.env
        .NEXT_PUBLIC_API_BASE_URL ||
      "http://localhost:4000",
  ).replace(/\/$/, "");
}

function sameConnectionAccount(
  accountId: string,
) {
  return (
    connectOptions?.accountId ===
      accountId &&
    snapshot.accountId ===
      accountId
  );
}

function bindLifecycle() {
  if (
    lifecycleBound ||
    typeof window ===
      "undefined"
  ) {
    return;
  }

  lifecycleBound = true;

  window.addEventListener(
    "online",
    () => {
      if (
        !connectOptions ||
        isLogoutInProgress()
      ) {
        return;
      }

      updateStatus({
        status:
          "reconnecting",
      });

      connectRealtime(
        connectOptions,
      );
    },
  );

  window.addEventListener(
    "offline",
    () => {
      /**
       * manager.close() is deliberate here: while offline there is no useful
       * transport. The online handler creates/reconnects it later.
       */
      socket?.disconnect();

      updateStatus({
        status: "offline",
        connected: false,
      });
    },
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        document
          .visibilityState ===
          "visible" &&
        navigator.onLine &&
        connectOptions &&
        !socket?.connected &&
        isSessionGenerationCurrent(
          connectionGeneration,
        )
      ) {
        connectRealtime(
          connectOptions,
        );
      }
    },
  );
}

function attachListeners(
  target: Socket,
  generation: number,
) {
  const current = () =>
    target === socket &&
    isSessionGenerationCurrent(
      generation,
    );

  target.on(
    "connect",
    () => {
      if (!current()) {
        target.disconnect();
        return;
      }

      updateStatus({
        status: "connected",
        connected: true,
        socketId: target.id,
        accountId:
          connectOptions
            ?.accountId ||
          null,
        deviceId:
          getDeviceId(),
        lastConnectedAt:
          Date.now(),
        lastError:
          undefined,
        reconnectAttempt: 0,
      });

      if (
        connectOptions
          ?.schoolId ||
        connectOptions
          ?.branchId
      ) {
        target.emit(
          "SUBSCRIBE_CONTEXT",
          {
            schoolId:
              connectOptions
                .schoolId,
            branchId:
              connectOptions
                .branchId,
          },
        );
      }
    },
  );

  target.io.on(
    "reconnect_attempt",
    (attempt) => {
      if (!current()) return;

      updateStatus({
        status:
          "reconnecting",
        connected: false,
        reconnectAttempt:
          attempt,
      });
    },
  );

  target.on(
    "disconnect",
    (reason) => {
      if (!current()) return;

      const offline =
        typeof navigator !==
          "undefined" &&
        !navigator.onLine;

      updateStatus({
        status: offline
          ? "offline"
          : reason ===
              "io client disconnect"
            ? "closed"
            : "reconnecting",
        connected: false,
        lastDisconnectedAt:
          Date.now(),
      });
    },
  );

  target.on(
    "connect_error",
    (error: any) => {
      if (!current()) return;

      const message =
        error?.message ||
        "Realtime connection failed.";

      const unauthorized =
        /unauthorized|jwt|token|authentication/i.test(
          message,
        );

      updateStatus({
        status: unauthorized
          ? "unauthorized"
          : (
              typeof navigator !==
                "undefined" &&
              !navigator.onLine
            )
            ? "offline"
            : "error",
        connected: false,
        lastError: message,
      });
    },
  );

  target.on(
    "REALTIME_READY",
    (payload: any) => {
      if (!current()) return;

      updateStatus({
        accountId:
          payload?.accountId ||
          connectOptions
            ?.accountId ||
          null,
        deviceId:
          payload?.deviceId ||
          getDeviceId(),
      });
    },
  );

  target.on(
    "REALTIME_AUTH_ERROR",
    (payload: any) => {
      if (!current()) return;

      updateStatus({
        status:
          "unauthorized",
        connected: false,
        lastError:
          payload?.message ||
          "Realtime authentication failed.",
      });
    },
  );

  for (
    const eventName of
    EVENT_NAMES
  ) {
    target.on(
      eventName,
      (
        payload:
          RealtimeInvalidationEvent,
      ) => {
        if (
          !current() ||
          !payload ||
          payload.accountId !==
            connectOptions
              ?.accountId
        ) {
          return;
        }

        publishEvent(
          {
            ...payload,
            type:
              eventName,
            changedTables:
              Array.isArray(
                payload
                  .changedTables,
              )
                ? payload
                    .changedTables
                : [],
            revision:
              Number(
                payload
                  .revision ||
                  Date.now(),
              ),
            at:
              Number(
                payload.at ||
                  Date.now(),
              ),
          },
          generation,
        );
      },
    );
  }
}

export function connectRealtime(
  options: ConnectOptions,
) {
  if (
    typeof window ===
      "undefined" ||
    isLogoutInProgress()
  ) {
    return null;
  }

  bindLifecycle();

  const token =
    getAuthToken();

  if (
    !token ||
    !options.accountId
  ) {
    disconnectRealtime();

    updateStatus({
      status:
        "unauthorized",
      connected: false,
      accountId:
        options.accountId ||
        null,
      lastError:
        "Realtime connection requires an authenticated account.",
    });

    return null;
  }

  if (!navigator.onLine) {
    connectOptions = {
      ...options,
    };

    updateStatus({
      status: "offline",
      connected: false,
      accountId:
        options.accountId,
    });

    return null;
  }

  /**
   * Critical race fix:
   * Reuse both CONNECTED and CONNECTING sockets for the same account.
   *
   * React Strict Mode runs one extra setup/cleanup cycle in development. A
   * second setup must not tear down the first in-progress handshake.
   */
  if (
    socket &&
    connectOptions
      ?.accountId ===
      options.accountId
  ) {
    connectOptions = {
      ...connectOptions,
      ...options,
    };

    updateRealtimeContext(
      options,
    );

    if (
      !socket.connected &&
      !socket.active
    ) {
      socket.connect();
    }

    return socket;
  }

  /**
   * A genuinely different account must get a fresh authenticated Manager.
   */
  if (socket) {
    socket.removeAllListeners();
    socket.io.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  connectOptions = {
    ...options,
  };

  connectionGeneration =
    getSessionGeneration();

  updateStatus({
    status: "connecting",
    connected: false,
    accountId:
      options.accountId,
    deviceId:
      getDeviceId(),
    lastError:
      undefined,
  });

  /**
   * Polling-first is intentional. Socket.IO establishes a broadly compatible
   * Engine.IO connection and then upgrades to WebSocket when possible.
   */
  socket = io(
    `${baseUrl()}/realtime`,
    {
      auth: {
        token,
        deviceId:
          getDeviceId(),
      },
      transports: [
        "polling",
        "websocket",
      ],
      upgrade: true,
      rememberUpgrade:
        false,
      reconnection: true,
      reconnectionAttempts:
        Infinity,
      reconnectionDelay:
        1000,
      reconnectionDelayMax:
        30000,
      randomizationFactor:
        0.35,
      timeout: 20000,
      autoConnect: true,
    },
  );

  attachListeners(
    socket,
    connectionGeneration,
  );

  return socket;
}

export function updateRealtimeContext(
  input: {
    schoolId?:
      number | string | null;
    branchId?:
      number | string | null;
  },
) {
  if (
    !connectOptions ||
    isLogoutInProgress()
  ) {
    return;
  }

  connectOptions = {
    ...connectOptions,
    ...input,
  };

  if (socket?.connected) {
    socket.emit(
      "SUBSCRIBE_CONTEXT",
      input,
    );
  }
}

export function refreshRealtimeAuthentication() {
  if (
    !connectOptions ||
    isLogoutInProgress()
  ) {
    return;
  }

  const options = {
    ...connectOptions,
  };

  disconnectRealtime({
    preserveOptions: true,
  });

  connectRealtime(options);
}

export function disconnectRealtime(
  options?: {
    preserveOptions?: boolean;
  },
) {
  connectionGeneration =
    getSessionGeneration() +
    1;

  if (socket) {
    socket.removeAllListeners();
    socket.io.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  if (
    !options
      ?.preserveOptions
  ) {
    connectOptions = null;
  }

  updateStatus({
    status: "closed",
    connected: false,
    socketId:
      undefined,
    lastDisconnectedAt:
      Date.now(),
  });
}

export function subscribeToRealtimeEvents(
  listener: EventListener,
) {
  eventListeners.add(
    listener,
  );

  return () => {
    eventListeners.delete(
      listener,
    );
  };
}

export function subscribeToRealtimeStatus(
  listener: StatusListener,
) {
  statusListeners.add(
    listener,
  );

  listener(snapshot);

  return () => {
    statusListeners.delete(
      listener,
    );
  };
}

export function getRealtimeStatusSnapshot() {
  return snapshot;
}

export function getRealtimeServerSnapshot():
  RealtimeStatusSnapshot {
  return {
    status: "idle",
    connected: false,
    reconnectAttempt: 0,
  };
}