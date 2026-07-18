/**
 * app/lib/media/mediaAssetResolver.ts
 * --------------------------------------------------------------------------
 * Canonical exact media identity and resilient owner-field resolution.
 *
 * Permanent identity preference:
 *   ownerCloudId
 *   ownerTempKey
 *   ownerLocalId + deviceId
 *
 * Resolution is deliberately more tolerant than identity creation. When an
 * owner has both a cloud ID and a local ID, the resolver tries every valid
 * candidate in priority order. This allows historical/local assets attached
 * before a cloud ID existed to remain discoverable after synchronization.
 */

import { db } from "../db";
import { getDeviceId } from "../sync/syncConfig";

export type MediaOwnerIdentityInput = {
  accountId?: string | null;
  ownerTable?: string | null;
  fieldKey?: string | null;
  ownerCloudId?: string | null;
  ownerTempKey?: string | null;
  ownerLocalId?: number | string | null;
  deviceId?: string | null;
};

export type ResolvedMediaOwnerIdentity = {
  accountId: string;
  ownerTable: string;
  fieldKey: string;
  ownerKind: "cloud" | "temp" | "local-device";
  ownerValue: string;
  deviceId?: string;
  identityKey: string;
};

function text(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || undefined;
}

function localId(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function encode(value: string) {
  return encodeURIComponent(value);
}

function base(input: MediaOwnerIdentityInput, requireAccount = true) {
  const accountId = text(input.accountId);
  const ownerTable = text(input.ownerTable);
  const fieldKey = text(input.fieldKey);

  if ((requireAccount && !accountId) || !ownerTable || !fieldKey) return null;
  return { accountId: accountId || "*", ownerTable, fieldKey };
}

export function resolveMediaOwnerIdentityCandidates(
  input: MediaOwnerIdentityInput,
  options: { requireAccount?: boolean; deviceIdFallback?: string } = {},
): ResolvedMediaOwnerIdentity[] {
  const common = base(input, options.requireAccount !== false);
  if (!common) return [];

  const candidates: ResolvedMediaOwnerIdentity[] = [];
  const ownerCloudId = text(input.ownerCloudId);
  const ownerTempKey = text(input.ownerTempKey);
  const ownerLocalId = localId(input.ownerLocalId);
  const deviceId = text(input.deviceId) || text(options.deviceIdFallback) || text(getDeviceId());

  if (ownerCloudId) {
    candidates.push({
      ...common,
      ownerKind: "cloud",
      ownerValue: ownerCloudId,
      identityKey: [common.accountId, common.ownerTable, common.fieldKey, "cloud", ownerCloudId]
        .map(encode)
        .join("|"),
    });
  }

  if (ownerTempKey) {
    candidates.push({
      ...common,
      ownerKind: "temp",
      ownerValue: ownerTempKey,
      identityKey: [common.accountId, common.ownerTable, common.fieldKey, "temp", ownerTempKey]
        .map(encode)
        .join("|"),
    });
  }

  if (ownerLocalId && deviceId) {
    candidates.push({
      ...common,
      ownerKind: "local-device",
      ownerValue: String(ownerLocalId),
      deviceId,
      identityKey: [common.accountId, common.ownerTable, common.fieldKey, "local", String(ownerLocalId), deviceId]
        .map(encode)
        .join("|"),
    });
  }

  return candidates;
}

export function resolveMediaOwnerIdentity(
  input: MediaOwnerIdentityInput,
  options: { requireAccount?: boolean; deviceIdFallback?: string } = {},
): ResolvedMediaOwnerIdentity | null {
  return resolveMediaOwnerIdentityCandidates(input, options)[0] || null;
}

export function buildMediaIdentityKey(input: MediaOwnerIdentityInput) {
  return resolveMediaOwnerIdentity(input)?.identityKey;
}

export function mediaIdentityMatches(
  row: MediaOwnerIdentityInput & { ownerIdentityKey?: string | null },
  requested: MediaOwnerIdentityInput,
) {
  const requestedKeys = new Set(
    resolveMediaOwnerIdentityCandidates(requested).map((identity) => identity.identityKey),
  );

  if (!requestedKeys.size) return false;

  const storedKey = text(row.ownerIdentityKey);
  if (storedKey && requestedKeys.has(storedKey)) return true;

  return resolveMediaOwnerIdentityCandidates(row).some((identity) =>
    requestedKeys.has(identity.identityKey),
  );
}

export function mediaAssetSortNewestFirst(a: any, b: any) {
  const version = Number(b?.version || 0) - Number(a?.version || 0);
  if (version) return version;

  const time =
    Number(b?.updatedAt || b?.createdAt || 0) -
    Number(a?.updatedAt || a?.createdAt || 0);
  if (time) return time;

  return Number(b?.id || 0) - Number(a?.id || 0);
}

function legacyOwnerMatch(row: any, input: MediaOwnerIdentityInput) {
  const accountId = text(input.accountId);
  const ownerTable = text(input.ownerTable);
  const fieldKey = text(input.fieldKey);
  if (!ownerTable || !fieldKey) return false;

  if (accountId && text(row?.accountId) !== accountId) return false;
  if (text(row?.ownerTable) !== ownerTable) return false;
  if (text(row?.fieldKey) !== fieldKey) return false;

  const cloud = text(input.ownerCloudId);
  const temp = text(input.ownerTempKey);
  const local = localId(input.ownerLocalId);

  if (cloud && text(row?.ownerCloudId) === cloud) return true;
  if (temp && text(row?.ownerTempKey) === temp) return true;
  if (local && localId(row?.ownerLocalId) === local) return true;

  return false;
}

export async function findExactOwnerFieldMediaAssets(
  input: MediaOwnerIdentityInput & { includeDeleted?: boolean },
) {
  const candidates = resolveMediaOwnerIdentityCandidates(input);
  if (!candidates.length) return [];

  const table = (db as any).mediaAssets;
  if (!table) return [];

  const found = new Map<number | string, any>();

  for (const identity of candidates) {
    try {
      const rows = await table.where("ownerIdentityKey").equals(identity.identityKey).toArray();
      for (const row of rows) found.set(row.id ?? identity.identityKey, row);
    } catch {
      break;
    }
  }

  let resolved = [...found.values()]
    .filter((row) => {
      if (!input.includeDeleted && (row?.isDeleted || row?.active === false)) return false;
      return mediaIdentityMatches(row, input) || legacyOwnerMatch(row, input);
    });

  /**
   * Always run the resilient scan when indexed candidates produced no active
   * exact result. An index can contain only an old/deleted row while the current
   * row still uses a legacy or local-device identity.
   */
  if (!resolved.length) {
    const rows = await table.toArray();
    for (const row of rows) {
      if (!input.includeDeleted && (row?.isDeleted || row?.active === false)) continue;
      if (mediaIdentityMatches(row, input) || legacyOwnerMatch(row, input)) {
        found.set(row.id ?? `${row.ownerTable}:${row.fieldKey}:${row.updatedAt}`, row);
      }
    }

    resolved = [...found.values()].filter((row) => {
      if (!input.includeDeleted && (row?.isDeleted || row?.active === false)) return false;
      return mediaIdentityMatches(row, input) || legacyOwnerMatch(row, input);
    });
  }

  return resolved.sort(mediaAssetSortNewestFirst);
}

export async function findExactOwnerFieldMediaAsset(input: MediaOwnerIdentityInput) {
  return (await findExactOwnerFieldMediaAssets(input))[0];
}

export async function resolveMediaAssetUrl(asset: any): Promise<string> {
  if (!asset || asset.isDeleted || asset.active === false) return "";

  const remote = String(
    asset.publicUrl || asset.remoteUrl || asset.storageUrl || asset.downloadUrl || "",
  ).trim();
  if (remote) return remote;

  const preview = String(asset.previewDataUrl || asset.thumbnailDataUrl || "").trim();
  if (preview && !preview.startsWith("blob:")) return preview;

  const blobTable = (db as any).mediaBlobs;
  if (!blobTable) return "";

  let blobRow: any;
  if (asset.localBlobId) blobRow = await blobTable.get(Number(asset.localBlobId));
  if (!blobRow && asset.id) {
    try {
      blobRow = await blobTable.where("assetLocalId").equals(Number(asset.id)).first();
    } catch {}
  }

  if (!blobRow || blobRow.isDeleted || blobRow.active === false) return "";

  const blob =
    blobRow.blob ||
    (blobRow.arrayBuffer
      ? new Blob([blobRow.arrayBuffer], {
          type: blobRow.mimeType || asset.mimeType || "application/octet-stream",
        })
      : null);

  return blob ? URL.createObjectURL(blob) : "";
}

export async function resolveExactOwnerFieldMediaUrl(input: MediaOwnerIdentityInput) {
  const asset = await findExactOwnerFieldMediaAsset(input);
  return resolveMediaAssetUrl(asset);
}