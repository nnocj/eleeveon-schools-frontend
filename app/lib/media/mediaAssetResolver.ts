/** Canonical permanent-ID media ownership and URL resolution. */
import { db } from "../db";

export type MediaOwnerIdentityInput = {
  accountId?: string | null;
  ownerTable?: string | null;
  fieldKey?: string | null;
  ownerId?: string | null;
  ownerTempKey?: string | null;
  deviceId?: string | null;
};

export type ResolvedMediaOwnerIdentity = {
  accountId: string;
  ownerTable: string;
  fieldKey: string;
  ownerKind: "permanent" | "temp";
  ownerValue: string;
  identityKey: string;
};

function text(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

export function resolveMediaOwnerIdentityCandidates(
  input: MediaOwnerIdentityInput,
  options: { requireAccount?: boolean } = {},
): ResolvedMediaOwnerIdentity[] {
  const accountId = text(input.accountId);
  const ownerTable = text(input.ownerTable);
  const fieldKey = text(input.fieldKey);
  const ownerId = text(input.ownerId);
  const ownerTempKey = text(input.ownerTempKey);

  if ((options.requireAccount !== false && !accountId) || !ownerTable || !fieldKey) return [];

  const common = { accountId: accountId || "*", ownerTable, fieldKey };
  const identities: ResolvedMediaOwnerIdentity[] = [];

  if (ownerId) {
    identities.push({
      ...common,
      ownerKind: "permanent",
      ownerValue: ownerId,
      identityKey: [common.accountId, ownerTable, fieldKey, "owner", ownerId].map(encode).join("|"),
    });
  }

  if (ownerTempKey) {
    identities.push({
      ...common,
      ownerKind: "temp",
      ownerValue: ownerTempKey,
      identityKey: [common.accountId, ownerTable, fieldKey, "temp", ownerTempKey].map(encode).join("|"),
    });
  }

  return identities;
}

export function resolveMediaOwnerIdentity(
  input: MediaOwnerIdentityInput,
  options: { requireAccount?: boolean } = {},
): ResolvedMediaOwnerIdentity | null {
  return resolveMediaOwnerIdentityCandidates(input, options)[0] || null;
}

export function buildMediaIdentityKey(input: MediaOwnerIdentityInput): string | undefined {
  return resolveMediaOwnerIdentity(input)?.identityKey;
}

export function mediaIdentityMatches(
  row: MediaOwnerIdentityInput & { ownerIdentityKey?: string | null },
  requested: MediaOwnerIdentityInput,
): boolean {
  const requestedKeys = new Set(resolveMediaOwnerIdentityCandidates(requested).map((item) => item.identityKey));
  if (!requestedKeys.size) return false;
  const stored = text(row.ownerIdentityKey);
  if (stored && requestedKeys.has(stored)) return true;
  return resolveMediaOwnerIdentityCandidates(row).some((item) => requestedKeys.has(item.identityKey));
}

export function mediaAssetSortNewestFirst(a: any, b: any): number {
  const version = Number(b?.version || 0) - Number(a?.version || 0);
  if (version) return version;
  const time = Number(b?.updatedAt || b?.createdAt || 0) - Number(a?.updatedAt || a?.createdAt || 0);
  if (time) return time;
  return String(b?.id || "").localeCompare(String(a?.id || ""));
}

export async function findExactOwnerFieldMediaAssets(
  input: MediaOwnerIdentityInput & { includeDeleted?: boolean },
): Promise<any[]> {
  const identities = resolveMediaOwnerIdentityCandidates(input);
  if (!identities.length) return [];

  const table = db.mediaAssets;
  const found = new Map<string, any>();

  for (const identity of identities) {
    const rows = await table.where("ownerIdentityKey").equals(identity.identityKey).toArray();
    for (const row of rows) found.set(String(row.id), row);
  }

  return [...found.values()]
    .filter((row) => input.includeDeleted || (!row.isDeleted && row.active !== false))
    .filter((row) => mediaIdentityMatches(row, input))
    .sort(mediaAssetSortNewestFirst);
}

export async function findExactOwnerFieldMediaAsset(input: MediaOwnerIdentityInput): Promise<any | undefined> {
  return (await findExactOwnerFieldMediaAssets(input))[0];
}

export async function resolveMediaAssetUrl(asset: any): Promise<string> {
  if (!asset || asset.isDeleted || asset.active === false) return "";

  const remote = text(asset.publicUrl || asset.remoteUrl || asset.storageUrl || asset.downloadUrl);
  if (remote) return remote;

  const preview = text(asset.previewDataUrl || asset.thumbnailDataUrl);
  if (preview && !preview.startsWith("blob:")) return preview;

  let blobRow: any = null;
  if (asset.localBlobId) blobRow = await db.mediaBlobs.get(Number(asset.localBlobId));
  if (!blobRow && asset.id) blobRow = await db.mediaBlobs.where("assetId").equals(String(asset.id)).first();
  if (!blobRow) return "";

  const blob = blobRow.blob instanceof Blob
    ? blobRow.blob
    : blobRow.arrayBuffer
      ? new Blob([blobRow.arrayBuffer], { type: blobRow.mimeType || asset.mimeType || "application/octet-stream" })
      : null;

  return blob ? URL.createObjectURL(blob) : "";
}

export async function resolveExactOwnerFieldMediaUrl(input: MediaOwnerIdentityInput): Promise<string> {
  return resolveMediaAssetUrl(await findExactOwnerFieldMediaAsset(input));
}
