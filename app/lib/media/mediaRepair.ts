/**
 * app/lib/media/mediaRepair.ts
 * --------------------------------------------------------------------------
 * Detects and optionally repairs historical media corruption.
 */

import { db } from "../db";
import { SYNC_STATUS_VALUE } from "../sync/syncConfig";
import { buildMediaIdentityKey, mediaAssetSortNewestFirst } from "./mediaAssetResolver";
import { clearMediaObjectUrlCache } from "./mediaAssetUtils";

export type MediaRepairIssueType =
  | "missing-owner-table"
  | "missing-field-key"
  | "missing-owner-identity"
  | "duplicate-active-records"
  | "orphaned-blob"
  | "missing-blob"
  | "stale-object-url"
  | "old-mixed-image";

export type MediaRepairIssue = {
  type: MediaRepairIssueType;
  assetIds?: number[];
  blobIds?: number[];
  identityKey?: string;
  message: string;
};

export type MediaRepairReport = {
  accountId: string;
  scannedAssets: number;
  scannedBlobs: number;
  issues: MediaRepairIssue[];
  repaired: number;
  generatedAt: number;
};

function active(row: any) {
  return !row?.isDeleted && row?.active !== false;
}

function newest(rows: any[]) {
  return [...rows].sort(mediaAssetSortNewestFirst)[0];
}

export async function inspectMediaIntegrity(accountId: string): Promise<MediaRepairReport> {
  const assets = (await (db as any).mediaAssets.toArray()).filter((r: any) => r.accountId === accountId);
  const blobs = (await (db as any).mediaBlobs.toArray()).filter((r: any) => r.accountId === accountId);
  const issues: MediaRepairIssue[] = [];
  const assetById = new Map(assets.map((r: any) => [Number(r.id), r]));
  const blobById = new Map(blobs.map((r: any) => [Number(r.id), r]));
  const groups = new Map<string, any[]>();

  for (const asset of assets) {
    const id = Number(asset.id);
    if (!String(asset.ownerTable || "").trim()) issues.push({ type: "missing-owner-table", assetIds: [id], message: `Media asset ${id} has no ownerTable.` });
    if (!String(asset.fieldKey || "").trim()) issues.push({ type: "missing-field-key", assetIds: [id], message: `Media asset ${id} has no fieldKey.` });
    const identityKey = buildMediaIdentityKey(asset);
    if (!identityKey) {
      issues.push({ type: "missing-owner-identity", assetIds: [id], message: `Media asset ${id} has no safe owner identity.` });
    } else if (active(asset)) {
      const list = groups.get(identityKey) || [];
      list.push(asset);
      groups.set(identityKey, list);
    }

    if (asset.localObjectUrl && String(asset.localObjectUrl).startsWith("blob:")) {
      issues.push({ type: "stale-object-url", assetIds: [id], message: `Media asset ${id} stores a non-persistent blob URL.` });
    }
    if (asset.localBlobId && !blobById.has(Number(asset.localBlobId))) {
      issues.push({ type: "missing-blob", assetIds: [id], blobIds: [Number(asset.localBlobId)], message: `Media asset ${id} points to missing blob ${asset.localBlobId}.` });
    }
  }

  for (const [identityKey, rows] of groups) {
    if (rows.length > 1) {
      issues.push({ type: "duplicate-active-records", identityKey, assetIds: rows.map((r) => Number(r.id)), message: `${rows.length} active media records share one exact owner field.` });
    }
  }

  for (const blob of blobs) {
    const blobId = Number(blob.id);
    if (!blob.assetLocalId || !assetById.has(Number(blob.assetLocalId))) {
      issues.push({ type: "orphaned-blob", blobIds: [blobId], message: `Blob ${blobId} has no matching media asset.` });
    }
  }

  // Detect the historical dangerous pattern: same account/table/local id across
  // different devices or fields. These are reported, never auto-merged.
  const loose = new Map<string, any[]>();
  for (const asset of assets.filter(active)) {
    if (!asset.ownerLocalId || !asset.ownerTable) continue;
    const key = [asset.accountId, asset.ownerTable, asset.ownerLocalId].join("|");
    const list = loose.get(key) || [];
    list.push(asset);
    loose.set(key, list);
  }
  for (const rows of loose.values()) {
    const fields = new Set(rows.map((r) => String(r.fieldKey || "")));
    const devices = new Set(rows.map((r) => String(r.deviceId || "")));
    if (fields.size > 1 || devices.size > 1) {
      issues.push({ type: "old-mixed-image", assetIds: rows.map((r) => Number(r.id)), message: "Legacy media share a local owner id across distinct fields/devices. They were not merged." });
    }
  }

  return { accountId, scannedAssets: assets.length, scannedBlobs: blobs.length, issues, repaired: 0, generatedAt: Date.now() };
}

export async function repairMediaIntegrity(accountId: string): Promise<MediaRepairReport> {
  const report = await inspectMediaIntegrity(accountId);
  let repaired = 0;
  const assetsTable = (db as any).mediaAssets;
  const blobsTable = (db as any).mediaBlobs;

  await db.transaction("rw", assetsTable, blobsTable, async () => {
    const assets = (await assetsTable.toArray()).filter((r: any) => r.accountId === accountId);
    const groups = new Map<string, any[]>();

    for (const asset of assets) {
      const patch: Record<string, any> = {};
      const identityKey = buildMediaIdentityKey(asset);
      if (identityKey && asset.ownerIdentityKey !== identityKey) {
        patch.ownerIdentityKey = identityKey;
        patch.identityVersion = 1;
      }
      if (asset.localObjectUrl && String(asset.localObjectUrl).startsWith("blob:")) {
        patch.localObjectUrl = undefined;
      }
      if (Object.keys(patch).length && asset.id) {
        await assetsTable.update(asset.id, patch);
        repaired++;
      }
      if (identityKey && active(asset)) {
        const list = groups.get(identityKey) || [];
        list.push(asset);
        groups.set(identityKey, list);
      }
    }

    for (const rows of groups.values()) {
      if (rows.length < 2) continue;
      const winner = newest(rows);
      for (const row of rows) {
        if (row.id === winner.id) continue;
        await assetsTable.update(row.id, {
          active: false,
          isDeleted: true,
          updatedAt: Date.now(),
          version: Math.max(1, Number(row.version || 1)) + 1,
          synced: SYNC_STATUS_VALUE.PENDING,
          syncError: undefined,
          metadata: { ...(row.metadata || {}), repairedDuplicateOf: winner.id },
        });
        repaired++;
      }
    }

    const currentAssets = await assetsTable.toArray();
    const ids = new Set(currentAssets.map((r: any) => Number(r.id)));
    const blobs = (await blobsTable.toArray()).filter((r: any) => r.accountId === accountId);
    for (const blob of blobs) {
      if (!blob.assetLocalId || !ids.has(Number(blob.assetLocalId))) {
        await blobsTable.delete(blob.id);
        repaired++;
      }
    }
  });

  clearMediaObjectUrlCache();
  return { ...(await inspectMediaIntegrity(accountId)), repaired };
}