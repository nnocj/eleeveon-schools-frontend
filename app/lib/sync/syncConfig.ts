export const SYNC_ENDPOINTS = {
  PUSH: "/sync/push",
  PULL: "/sync/pull",
  STATUS: "/sync/status",
};

export const LOCAL_STORAGE_KEYS = {
  ACCOUNT_ID: "eleeveon_account_id",
  DEVICE_ID: "eleeveon_device_id",
  LAST_SYNC_AT: "eleeveon_last_sync_at",
};

export const SYNC_STATUS_VALUE = {
  SYNCED: "synced",
  PENDING: "pending",
  ERROR: "error",
} as const;

export type SyncPushRecord = {
  tableName: string;
  localId: number;
  cloudId?: string;
  accountId: string;
  deviceId: string;
  version: number;
  updatedAt: number;
  isDeleted: boolean;
  payload: any;
};

export type SyncPullRecord = {
  tableName: string;
  cloudId: string;
  accountId: string;
  deviceId?: string;
  version: number;
  updatedAt: number;
  isDeleted: boolean;
  payload: any;
};

export type PushResponseItem = {
  tableName: string;
  localId: number;
  cloudId: string;
  version: number;
  updatedAt: number;
  ok: boolean;
  error?: string;
};

export type PullResponse = {
  records: SyncPullRecord[];
  serverTime: number;
};

export type SyncResult = {
  ok: boolean;
  pushed: number;
  pulled: number;
  errors: string[];
};


export function getDeviceId() {
  if (typeof window === "undefined") return "server-device";

  let deviceId = localStorage.getItem(LOCAL_STORAGE_KEYS.DEVICE_ID);

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(LOCAL_STORAGE_KEYS.DEVICE_ID, deviceId);
  }

  return deviceId;
}

export function getLastSyncAt() {
  if (typeof window === "undefined") return 0;

  return Number(localStorage.getItem(LOCAL_STORAGE_KEYS.LAST_SYNC_AT) || 0);
}

export function setLastSyncAt(value: number) {
  if (typeof window === "undefined") return;

  localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_SYNC_AT, String(value));
}

export function isOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

// ======================================================
// syncConfig.ts
// ======================================================

const ACCOUNT_STORAGE_KEY = "eleeveon_account_id";

// ======================================================
// GET ACCOUNT ID
// ======================================================

export function getAccountId(): string | null {
  if (typeof window === "undefined") return null;

  return localStorage.getItem(ACCOUNT_STORAGE_KEY);
}

// ======================================================
// SET ACCOUNT ID
// ======================================================

export function setAccountId(accountId: string) {
  if (typeof window === "undefined") return;

  localStorage.setItem(ACCOUNT_STORAGE_KEY, accountId);
}

// ======================================================
// CLEAR ACCOUNT ID
// ======================================================

export function clearAccountId() {
  if (typeof window === "undefined") return;

  localStorage.removeItem(ACCOUNT_STORAGE_KEY);
}