/**
 * app/lib/media/mediaUpload.ts
 * --------------------------------------------------------------------------
 * Debounced remote media upload queue.
 *
 * Local media remains immediately usable from mediaBlobs even when upload is
 * unavailable. Successful upload writes a permanent remote URL into
 * mediaAssets so the image can display on other devices.
 *
 * Expected backend contract (multipart/form-data):
 *   POST /media/upload
 *   fields: assetId, accountId, ownerTable, fieldKey, ownerCloudId,
 *           ownerLocalId, deviceId, file
 *   response: { remoteUrl | publicUrl | storageUrl | downloadUrl }
 */

import { db } from "../db";
import { getApiBaseUrl, getAuthToken } from "../sync/syncConfig";
import { updateLocal } from "../sync/syncUtils";

const queued = new Set<number>();
let timer: ReturnType<typeof setTimeout> | null = null;
let activeFlush: Promise<MediaUploadBatchResult> | null = null;

export type MediaUploadBatchResult = {
  uploaded: number;
  failed: number;
  skipped: number;
  errors: string[];
};

function endpoint() {
  const configured = String(process.env.NEXT_PUBLIC_MEDIA_UPLOAD_ENDPOINT || "").trim();
  if (/^https?:\/\//i.test(configured)) return configured;

  const base = String(getApiBaseUrl() || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000")
    .replace(/\/$/, "");

  return `${base}${configured || "/media/upload"}`;
}

async function blobForAsset(asset: any) {
  const table = (db as any).mediaBlobs;
  if (!table) return null;

  let row: any = null;
  if (asset.localBlobId) row = await table.get(Number(asset.localBlobId));
  if (!row && asset.id) {
    try {
      row = await table.where("assetLocalId").equals(Number(asset.id)).first();
    } catch {}
  }

  if (!row || row.isDeleted || row.active === false) return null;
  if (row.blob instanceof Blob) return row.blob;
  if (row.arrayBuffer) {
    return new Blob([row.arrayBuffer], {
      type: row.mimeType || asset.mimeType || "application/octet-stream",
    });
  }

  return null;
}

function remoteUrl(response: any) {
  return String(
    response?.publicUrl ||
      response?.remoteUrl ||
      response?.storageUrl ||
      response?.downloadUrl ||
      response?.url ||
      "",
  ).trim();
}

export async function uploadMediaAsset(assetId: number) {
  const id = Number(assetId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid media asset ID.");

  const table = (db as any).mediaAssets;
  const asset = await table?.get?.(id);
  if (!asset || asset.isDeleted || asset.active === false) return { skipped: true };

  const existingRemote = remoteUrl(asset);
  if (existingRemote) {
    if (asset.uploadStatus !== "uploaded") {
      await updateLocal("mediaAssets" as any, id, {
        uploadStatus: "uploaded",
        uploadError: undefined,
        uploadedAt: asset.uploadedAt || new Date().toISOString(),
      } as any);
    }
    return { skipped: true, url: existingRemote };
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await updateLocal("mediaAssets" as any, id, {
      uploadStatus: "queued",
      uploadError: undefined,
    } as any);
    return { skipped: true };
  }

  const token = getAuthToken();
  if (!token) throw new Error("Media upload requires an authenticated session.");

  const blob = await blobForAsset(asset);
  if (!blob) throw new Error(`Media asset ${id} has no local blob to upload.`);

  await updateLocal("mediaAssets" as any, id, {
    uploadStatus: "uploading",
    uploadError: undefined,
  } as any);

  const form = new FormData();
  form.set("assetId", String(id));
  form.set("accountId", String(asset.accountId || ""));
  form.set("ownerTable", String(asset.ownerTable || ""));
  form.set("fieldKey", String(asset.fieldKey || ""));
  form.set("deviceId", String(asset.deviceId || ""));
  if (asset.ownerCloudId) form.set("ownerCloudId", String(asset.ownerCloudId));
  if (asset.ownerLocalId) form.set("ownerLocalId", String(asset.ownerLocalId));
  form.set(
    "file",
    blob,
    String(asset.fileName || asset.originalFileName || `media-${id}`),
  );

  try {
    const response = await fetch(endpoint(), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || `Media upload failed (${response.status}).`);
    }

    const url = remoteUrl(payload);
    if (!url) throw new Error("Media upload succeeded but returned no remote URL.");

    await updateLocal("mediaAssets" as any, id, {
      remoteUrl: payload.remoteUrl || url,
      publicUrl: payload.publicUrl || url,
      storageUrl: payload.storageUrl,
      downloadUrl: payload.downloadUrl,
      uploadStatus: "uploaded",
      uploadError: undefined,
      uploadedAt: new Date().toISOString(),
    } as any);

    return { uploaded: true, url };
  } catch (error: any) {
    await updateLocal("mediaAssets" as any, id, {
      uploadStatus: "failed",
      uploadError: error?.message || String(error),
    } as any).catch(() => undefined);
    throw error;
  }
}

export function scheduleMediaUpload(assetId: number, delayMs = 1200) {
  const id = Number(assetId);
  if (!Number.isFinite(id) || id <= 0) return;

  queued.add(id);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flushMediaUploadQueue();
  }, Math.max(250, delayMs));
}

export async function flushMediaUploadQueue(): Promise<MediaUploadBatchResult> {
  if (activeFlush) return activeFlush;

  activeFlush = (async () => {
    const ids = [...queued];
    queued.clear();

    let uploaded = 0;
    let failed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        const result: any = await uploadMediaAsset(id);
        if (result?.uploaded) uploaded += 1;
        else skipped += 1;
      } catch (error: any) {
        failed += 1;
        errors.push(error?.message || String(error));
      }
    }

    return { uploaded, failed, skipped, errors };
  })().finally(() => {
    activeFlush = null;
  });

  return activeFlush;
}

export async function retryFailedMediaUploads(accountId?: string) {
  const table = (db as any).mediaAssets;
  if (!table) return { queued: 0 };

  const rows = await table.toArray();
  const failed = rows.filter(
    (row: any) =>
      !row.isDeleted &&
      row.active !== false &&
      row.uploadStatus === "failed" &&
      (!accountId || row.accountId === accountId),
  );

  for (const row of failed) scheduleMediaUpload(Number(row.id), 250);
  return { queued: failed.length };
}