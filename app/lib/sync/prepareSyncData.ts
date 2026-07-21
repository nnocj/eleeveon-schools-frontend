/**
 * app/lib/sync/prepareSyncData.ts
 * --------------------------------------------------------------------------
 * Produces JSON-safe sync payloads and enforces exact media identity.
 */

import { getDeviceId } from "./syncConfig";

const LOCAL_ONLY_FIELDS = new Set([
"blob", "file", "fileBlob", "arrayBuffer", "buffer", "binary",
  "localBlob", "localBlobData", "localBlobId", "localObjectUrl", "objectUrl",
  "previewUrl", "localPreviewUrl", "originalFile", "optimizedFile",
]);

function jsonSafe(value: any): any {
  if (value === undefined) return undefined;
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof Blob !== "undefined" && value instanceof Blob) return undefined;
  if (typeof File !== "undefined" && value instanceof File) return undefined;
  if (Array.isArray(value)) return value.map(jsonSafe).filter((v) => v !== undefined);
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [key, child] of Object.entries(value)) {
      if (LOCAL_ONLY_FIELDS.has(key)) continue;
      const safe = jsonSafe(child);
      if (safe !== undefined) out[key] = safe;
    }
    return out;
  }
  return undefined;
}

export function prepareSyncData<T extends Record<string, any>>(
  row: T,
  options?: { tableName?: string; deviceId?: string },
): Record<string, any> {
  const payload = jsonSafe(row) || {};
  const tableName = options?.tableName;

  if (tableName === "mediaAssets") {
    const deviceId = String(payload.deviceId || options?.deviceId || getDeviceId() || "").trim();
    payload.deviceId = deviceId;
    payload.ownerIdentityKey = [payload.accountId, payload.ownerTable, payload.ownerId || payload.ownerTempKey, payload.fieldKey].filter(Boolean).join(":");
    payload.identityVersion = 1;

    if (!payload.isDeleted && payload.active !== false && !payload.ownerIdentityKey) {
      throw new Error(
        "Cannot sync active media without accountId, ownerTable, fieldKey, and a safe owner identity.",
      );
    }

    // Never persist browser-session blob URLs across devices.
    delete payload.localObjectUrl;
    delete payload.previewUrl;
    if (String(payload.previewDataUrl || "").startsWith("blob:")) delete payload.previewDataUrl;
    if (String(payload.thumbnailDataUrl || "").startsWith("blob:")) delete payload.thumbnailDataUrl;
  }

  return payload;
}

export default prepareSyncData;