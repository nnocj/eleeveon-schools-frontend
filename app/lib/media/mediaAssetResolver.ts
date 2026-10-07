/** Canonical permanent-ID media ownership and URL resolution. */
import { db } from "../db";

/**
 * Shared Portal Highlight media ownership contract.
 *
 * Portal Highlight records remain lightweight and store only media IDs/fallback
 * strings. The actual image/video/poster/thumbnail files remain in mediaAssets
 * and mediaBlobs under these owner-field identities.
 */
export const PORTAL_HIGHLIGHT_MEDIA_OWNER_TABLE = "portalHighlights" as const;

export const PORTAL_HIGHLIGHT_MEDIA_FIELDS = {
  media: "media",
  poster: "posterMedia",
  thumbnail: "thumbnailMedia",
} as const;

export type PortalHighlightMediaField =
  (typeof PORTAL_HIGHLIGHT_MEDIA_FIELDS)[keyof typeof PORTAL_HIGHLIGHT_MEDIA_FIELDS];



/** Canonical media ownership values for the public school website system. */
export const WEBSITE_MEDIA_OWNER_TABLES = {
  settings: "websiteSettings",
  pages: "websitePages",
  sections: "websiteSections",
  navigationItems: "websiteNavigationItems",
  forms: "websiteForms",
  templates: "websiteTemplates",
} as const;

export const WEBSITE_MEDIA_FIELDS = {
  logo: "logo",
  favicon: "favicon",
  openGraphImage: "openGraphImage",
  footerLogo: "footerLogo",
  hero: "hero",
  heroBackground: "heroBackground",
  pageBanner: "pageBanner",
  sectionImage: "sectionImage",
  gallery: "websiteGallery",
  thumbnail: "thumbnail",
} as const;

export type WebsiteMediaOwnerTable =
  (typeof WEBSITE_MEDIA_OWNER_TABLES)[keyof typeof WEBSITE_MEDIA_OWNER_TABLES];

export type WebsiteMediaField =
  (typeof WEBSITE_MEDIA_FIELDS)[keyof typeof WEBSITE_MEDIA_FIELDS];

export function websiteMediaOwnerInput(input: {
  accountId?: string | null;
  ownerTable: WebsiteMediaOwnerTable;
  ownerId?: string | null;
  ownerTempKey?: string | null;
  deviceId?: string | null;
  fieldKey: WebsiteMediaField | string;
}): MediaOwnerIdentityInput {
  return {
    accountId: input.accountId,
    ownerTable: input.ownerTable,
    ownerId: input.ownerId,
    ownerTempKey: input.ownerTempKey,
    deviceId: input.deviceId,
    fieldKey: input.fieldKey,
  };
}

export async function resolveWebsiteMediaUrl(input: {
  accountId?: string | null;
  ownerTable: WebsiteMediaOwnerTable;
  ownerId?: string | null;
  ownerTempKey?: string | null;
  deviceId?: string | null;
  fieldKey: WebsiteMediaField | string;
  preferredAssetId?: string | null;
}): Promise<string> {
  const owner = websiteMediaOwnerInput(input);
  const preferred = await findMediaAssetById(input.preferredAssetId, owner);

  if (preferred) {
    return resolveMediaAssetUrl(preferred);
  }

  return resolveExactOwnerFieldMediaUrl(owner);
}

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

export type PortalHighlightMediaIdentityInput = {
  accountId?: string | null;
  highlightId?: string | null;
  ownerTempKey?: string | null;
  deviceId?: string | null;
};

export type ResolvedPortalHighlightMedia = {
  mediaAsset?: any;
  posterAsset?: any;
  thumbnailAsset?: any;
  mediaUrl: string;
  posterUrl: string;
  thumbnailUrl: string;
  displayUrl: string;
};

function text(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

function uniqueStrings(values: unknown[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => text(value))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
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

  if (
    (options.requireAccount !== false && !accountId) ||
    !ownerTable ||
    !fieldKey
  ) {
    return [];
  }

  const common = {
    accountId: accountId || "*",
    ownerTable,
    fieldKey,
  };

  const identities: ResolvedMediaOwnerIdentity[] = [];

  if (ownerId) {
    identities.push({
      ...common,
      ownerKind: "permanent",
      ownerValue: ownerId,
      identityKey: [
        common.accountId,
        ownerTable,
        fieldKey,
        "owner",
        ownerId,
      ]
        .map(encode)
        .join("|"),
    });
  }

  if (ownerTempKey) {
    identities.push({
      ...common,
      ownerKind: "temp",
      ownerValue: ownerTempKey,
      identityKey: [
        common.accountId,
        ownerTable,
        fieldKey,
        "temp",
        ownerTempKey,
      ]
        .map(encode)
        .join("|"),
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

export function buildMediaIdentityKey(
  input: MediaOwnerIdentityInput,
): string | undefined {
  return resolveMediaOwnerIdentity(input)?.identityKey;
}

export function mediaIdentityMatches(
  row: MediaOwnerIdentityInput & {
    ownerIdentityKey?: string | null;
  },
  requested: MediaOwnerIdentityInput,
): boolean {
  const requestedKeys = new Set(
    resolveMediaOwnerIdentityCandidates(requested).map(
      (item) => item.identityKey,
    ),
  );

  if (!requestedKeys.size) {
    return false;
  }

  const stored = text(row.ownerIdentityKey);

  if (stored && requestedKeys.has(stored)) {
    return true;
  }

  return resolveMediaOwnerIdentityCandidates(row).some((item) =>
    requestedKeys.has(item.identityKey),
  );
}

export function mediaAssetSortNewestFirst(a: any, b: any): number {
  const version = Number(b?.version || 0) - Number(a?.version || 0);

  if (version) {
    return version;
  }

  const time =
    Number(b?.updatedAt || b?.createdAt || 0) -
    Number(a?.updatedAt || a?.createdAt || 0);

  if (time) {
    return time;
  }

  return String(b?.id || "").localeCompare(String(a?.id || ""));
}

export async function findExactOwnerFieldMediaAssets(
  input: MediaOwnerIdentityInput & {
    includeDeleted?: boolean;
  },
): Promise<any[]> {
  const identities = resolveMediaOwnerIdentityCandidates(input);

  if (!identities.length) {
    return [];
  }

  const table = db.mediaAssets;
  const found = new Map<string, any>();

  for (const identity of identities) {
    const rows = await table
      .where("ownerIdentityKey")
      .equals(identity.identityKey)
      .toArray();

    for (const row of rows) {
      found.set(String(row.id), row);
    }
  }

  return [...found.values()]
    .filter(
      (row) =>
        input.includeDeleted ||
        (!row.isDeleted && row.active !== false),
    )
    .filter((row) => mediaIdentityMatches(row, input))
    .sort(mediaAssetSortNewestFirst);
}

export async function findExactOwnerFieldMediaAsset(
  input: MediaOwnerIdentityInput,
): Promise<any | undefined> {
  return (await findExactOwnerFieldMediaAssets(input))[0];
}

/**
 * Finds a media asset directly by permanent mediaAssets.id.
 *
 * This is useful when the owner record already stores mediaAssetId,
 * posterMediaAssetId or thumbnailMediaAssetId. Ownership is still checked when
 * owner identity data is supplied, preventing an unrelated asset from being
 * displayed accidentally.
 */
export async function findMediaAssetById(
  assetId?: string | null,
  owner?: MediaOwnerIdentityInput,
): Promise<any | undefined> {
  const id = text(assetId);

  if (!id) {
    return undefined;
  }

  const asset = await db.mediaAssets.get(id).catch(() => undefined);

  if (!asset || asset.isDeleted || asset.active === false) {
    return undefined;
  }

  if (owner && !mediaIdentityMatches(asset, owner)) {
    return undefined;
  }

  return asset;
}


function normalizeMediaRemoteUrl(
  value?: string | null,
): string {
  const url = String(value || "").trim();

  if (!url) {
    return "";
  }

  // Repair legacy development URLs.
  if (
    url.startsWith(
      "http://localhost:4000/"
    )
  ) {
    const apiBase =
      String(
        process.env.NEXT_PUBLIC_API_BASE_URL ||
          ""
      )
        .trim()
        .replace(/\/+$/, "");

    if (apiBase) {
      return url.replace(
        "http://localhost:4000",
        apiBase
      );
    }
  }

  return url;
}


export async function resolveMediaAssetUrl(asset: any): Promise<string> {
  if (!asset || asset.isDeleted || asset.active === false) {
    return "";
  }

  const remote =
  normalizeMediaRemoteUrl(
    asset.publicUrl ||
      asset.remoteUrl ||
      asset.storageUrl ||
      asset.downloadUrl
  );

  if (remote) {
    return remote;
  }

  const preview = text(asset.previewDataUrl || asset.thumbnailDataUrl);

  if (preview && !preview.startsWith("blob:")) {
    return preview;
  }

  let blobRow: any = null;

  if (
    asset.localBlobId !== undefined &&
    asset.localBlobId !== null &&
    String(asset.localBlobId).trim() !== ""
  ) {
    const localBlobId = Number(asset.localBlobId);

    if (Number.isFinite(localBlobId)) {
      blobRow = await db.mediaBlobs
        .get(localBlobId)
        .catch(() => undefined);
    }
  }

  if (!blobRow && asset.id) {
    blobRow = await db.mediaBlobs
      .where("assetId")
      .equals(String(asset.id))
      .first()
      .catch(() => undefined);
  }

  if (!blobRow || blobRow.isDeleted || blobRow.active === false) {
    return "";
  }

  const blob =
    blobRow.blob instanceof Blob
      ? blobRow.blob
      : blobRow.arrayBuffer
        ? new Blob([blobRow.arrayBuffer], {
            type:
              blobRow.mimeType ||
              asset.mimeType ||
              "application/octet-stream",
          })
        : null;

  return blob ? URL.createObjectURL(blob) : "";
}

export async function resolveMediaAssetUrlById(
  assetId?: string | null,
  owner?: MediaOwnerIdentityInput,
): Promise<string> {
  return resolveMediaAssetUrl(await findMediaAssetById(assetId, owner));
}

export async function resolveExactOwnerFieldMediaUrl(
  input: MediaOwnerIdentityInput,
): Promise<string> {
  return resolveMediaAssetUrl(
    await findExactOwnerFieldMediaAsset(input),
  );
}

/**
 * Produces the canonical media ownership input for one Portal Highlight field.
 */
export function portalHighlightMediaOwnerInput(
  input: PortalHighlightMediaIdentityInput,
  field: PortalHighlightMediaField,
): MediaOwnerIdentityInput {
  return {
    accountId: input.accountId,
    ownerTable: PORTAL_HIGHLIGHT_MEDIA_OWNER_TABLE,
    fieldKey: field,
    ownerId: input.highlightId,
    ownerTempKey: input.ownerTempKey,
    deviceId: input.deviceId,
  };
}

export function portalHighlightMediaIdentityKey(
  input: PortalHighlightMediaIdentityInput,
  field: PortalHighlightMediaField,
): string | undefined {
  return buildMediaIdentityKey(
    portalHighlightMediaOwnerInput(input, field),
  );
}

export async function findPortalHighlightMediaAsset(
  input: PortalHighlightMediaIdentityInput,
  field: PortalHighlightMediaField,
  preferredAssetId?: string | null,
): Promise<any | undefined> {
  const owner = portalHighlightMediaOwnerInput(input, field);

  /**
   * Prefer the explicit media ID stored on the PortalHighlight record, but
   * require it to match this highlight and field. This protects against stale
   * IDs while keeping permanent-ID lookup fast.
   */
  const preferred = await findMediaAssetById(
    preferredAssetId,
    owner,
  );

  if (preferred) {
    return preferred;
  }

  return findExactOwnerFieldMediaAsset(owner);
}

export async function resolvePortalHighlightMediaUrl(
  input: PortalHighlightMediaIdentityInput,
  field: PortalHighlightMediaField,
  preferredAssetId?: string | null,
): Promise<string> {
  return resolveMediaAssetUrl(
    await findPortalHighlightMediaAsset(
      input,
      field,
      preferredAssetId,
    ),
  );
}

/**
 * Resolves all media needed by a Portal Highlight carousel slide.
 *
 * displayUrl preference:
 * 1. main image/video media
 * 2. video poster
 * 3. thumbnail
 *
 * The caller can use posterUrl for a video poster and displayUrl as a universal
 * visual fallback when the main media is unavailable or still uploading.
 */
export async function resolvePortalHighlightMedia(input: {
  accountId?: string | null;
  highlightId?: string | null;
  ownerTempKey?: string | null;
  deviceId?: string | null;

  mediaAssetId?: string | null;
  posterMediaAssetId?: string | null;
  thumbnailMediaAssetId?: string | null;

  mediaUrl?: string | null;
  posterUrl?: string | null;
  thumbnailUrl?: string | null;
}): Promise<ResolvedPortalHighlightMedia> {
  const identity: PortalHighlightMediaIdentityInput = {
    accountId: input.accountId,
    highlightId: input.highlightId,
    ownerTempKey: input.ownerTempKey,
    deviceId: input.deviceId,
  };

  const [mediaAsset, posterAsset, thumbnailAsset] = await Promise.all([
    findPortalHighlightMediaAsset(
      identity,
      PORTAL_HIGHLIGHT_MEDIA_FIELDS.media,
      input.mediaAssetId,
    ),
    findPortalHighlightMediaAsset(
      identity,
      PORTAL_HIGHLIGHT_MEDIA_FIELDS.poster,
      input.posterMediaAssetId,
    ),
    findPortalHighlightMediaAsset(
      identity,
      PORTAL_HIGHLIGHT_MEDIA_FIELDS.thumbnail,
      input.thumbnailMediaAssetId,
    ),
  ]);

  const [resolvedMediaUrl, resolvedPosterUrl, resolvedThumbnailUrl] =
    await Promise.all([
      resolveMediaAssetUrl(mediaAsset),
      resolveMediaAssetUrl(posterAsset),
      resolveMediaAssetUrl(thumbnailAsset),
    ]);

  const mediaUrl =
    resolvedMediaUrl ||
    text(input.mediaUrl) ||
    "";

  const posterUrl =
    resolvedPosterUrl ||
    text(input.posterUrl) ||
    "";

  const thumbnailUrl =
    resolvedThumbnailUrl ||
    text(input.thumbnailUrl) ||
    "";

  return {
    mediaAsset,
    posterAsset,
    thumbnailAsset,
    mediaUrl,
    posterUrl,
    thumbnailUrl,
    displayUrl:
      uniqueStrings([
        mediaUrl,
        posterUrl,
        thumbnailUrl,
      ])[0] || "",
  };
}

/**
 * Revokes only local object URLs created from mediaBlobs. Remote URLs and data
 * URLs must never be revoked.
 */
export function revokeResolvedMediaUrl(
  value?: string | null,
): void {
  const url = text(value);

  if (!url || !url.startsWith("blob:")) {
    return;
  }

  try {
    URL.revokeObjectURL(url);
  } catch {
    // Revocation is best-effort and safe to ignore.
  }
}

export function revokeResolvedPortalHighlightMedia(
  media?: Partial<ResolvedPortalHighlightMedia> | null,
): void {
  if (!media) {
    return;
  }

  uniqueStrings([
    media.mediaUrl,
    media.posterUrl,
    media.thumbnailUrl,
    media.displayUrl,
  ]).forEach(revokeResolvedMediaUrl);
}
