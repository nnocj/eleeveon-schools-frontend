/**
 * app/lib/media/mediaAssetUtils.ts
 * ---------------------------------------------------------
 * Eleeveon Schools shared media asset utilities.
 * ---------------------------------------------------------
 * Use this file anywhere a module needs to accept an uploaded
 * image/file instead of writing FileReader logic inside each page.
 *
 * Why this exists:
 * - Avoid storing large Base64 images directly inside records.
 * - Compress images before local storage.
 * - Store full media in mediaAssets / mediaBlobs tables.
 * - Return small record-safe references that Students, Teachers,
 *   Parents, Classes, Settings, Announcements, Payments, etc. can save.
 * - Open a real browser camera stream when modules need “Take photo” instead
 *   of relying on the limited capture="environment" file-input hint.
 *
 * Expected db.ts additions:
 * - mediaAssets table
 * - mediaBlobs table
 * - MediaAsset / MediaBlob interfaces
 * - MediaAsset.ownerTempKey for safe uploads before a record has a local id
 *
 * Typical usage inside a module:
 *
 * const ownerTable = MediaOwners.STUDENTS;
 * const ownerTempKey = createMediaSessionKey(ownerTable);
 *
 * const result = await saveImageAsset(file, {
 *   accountId,
 *   schoolId,
 *   branchId,
 *   ownerTable,
 *   // For new/unsaved forms, pass ownerTempKey so media cannot bleed
 *   // between Students, Teachers, Parents, Classes, etc. before save.
 *   ownerTempKey,
 *   ownerId: form.id,
 *   fieldKey: MediaFieldKeys.PHOTO,
 *   variant: "avatar",
 * });
 *
 * updateForm({
 *   photo: result.previewUrl,
 *   photoMediaId: result.assetId,
 * });
 */

import { db } from "../db";
import { createLocal, updateLocal } from "../sync/syncUtils";
import { getDeviceId } from "../sync/syncConfig";
import {
  buildMediaIdentityKey,
  findExactOwnerFieldMediaAsset,
  mediaIdentityMatches,
  resolveMediaAssetUrl,
} from "./mediaAssetResolver";
import { scheduleMediaUpload } from "./mediaUpload";

export type MediaKind = "image" | "document" | "video" | "audio" | "other";
export type MediaUploadStatus = "local" | "queued" | "uploading" | "uploaded" | "failed";
export type MediaVariant = "avatar" | "cover" | "logo" | "signature" | "gallery" | "receipt" | "attachment";

export type MediaOwnerTable =
  | "schools"
  | "branches"
  | "academicStructures"
  | "academicPeriods"
  | "organizations"
  | "students"
  | "teachers"
  | "parents"
  | "classes"
  | "subjects"
  | "programs"
  | "curriculums"
  | "curriculumPathways"
  | "classSubjects"
  | "gradingSystems"
  | "assessmentStructures"
  | "incomes"
  | "expenses"
  | "studentFeePayments"
  | "staffPaymentRecords"
  | "announcements"
  | "messages"
  | "schoolBranchSettings"
  | string;

/**
 * Central owner names for every module that uses media.
 *
 * Do not hard-code "students", "teachers", "parents", etc. in UI pages.
 * Import MediaOwners instead. That prevents copy/paste mistakes where a
 * Teacher page accidentally saves media under the Students owner table.
 */
export const MediaOwners = {
  SCHOOLS: "schools",
  BRANCHES: "branches",
  ACADEMIC_STRUCTURES: "academicStructures",
  ACADEMIC_PERIODS: "academicPeriods",
  ORGANIZATIONS: "organizations",
  STUDENTS: "students",
  TEACHERS: "teachers",
  PARENTS: "parents",
  CLASSES: "classes",
  SUBJECTS: "subjects",
  PROGRAMS: "programs",
  CURRICULUMS: "curriculums",
  CURRICULUM_PATHWAYS: "curriculumPathways",
  CLASS_SUBJECTS: "classSubjects",
  GRADING_SYSTEMS: "gradingSystems",
  ASSESSMENT_STRUCTURES: "assessmentStructures",
  INCOMES: "incomes",
  EXPENSES: "expenses",
  STUDENT_FEE_PAYMENTS: "studentFeePayments",
  STAFF_PAYMENT_RECORDS: "staffPaymentRecords",
  ANNOUNCEMENTS: "announcements",
  MESSAGES: "messages",
  SCHOOL_BRANCH_SETTINGS: "schoolBranchSettings",
} as const;

export type KnownMediaOwnerTable = (typeof MediaOwners)[keyof typeof MediaOwners];

/**
 * Common field keys used across modules.
 * Pages can still pass custom strings, but these reduce typo risk.
 */
export const MediaFieldKeys = {
  PHOTO: "photo",
  COVER_PHOTO: "coverPhoto",
  LOGO: "logo",
  SIGNATURE: "signature",
  BANNER: "banner",
  RECEIPT: "receipt",
  ATTACHMENT: "attachment",
  GALLERY: "gallery",
} as const;

export type KnownMediaFieldKey = (typeof MediaFieldKeys)[keyof typeof MediaFieldKeys];

export type SaveMediaAssetOptions = {
  accountId: string;
  schoolId?: string | null;
  branchId?: string | null;
  ownerTable: MediaOwnerTable;
  ownerId?: string | null;
  ownerTempKey?: string | null;
  deviceId?: string | null;
  fieldKey: string;
  variant?: MediaVariant;
  altText?: string;
  caption?: string;
  createdBy?: string | number | null;
  replaceExisting?: boolean;
  maxOriginalBytes?: number;
  image?: Partial<ImageCompressionOptions>;
};

export type ImageCompressionOptions = {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  mimeType: "image/webp" | "image/jpeg" | "image/png";
  thumbnailMaxWidth: number;
  thumbnailMaxHeight: number;
  thumbnailQuality: number;
  thumbnailMimeType: "image/webp" | "image/jpeg" | "image/png";
};

export type SavedMediaAssetResult = {
  assetId: string;
  blobId: number;
  asset: any;
  blob: any;
  previewUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  originalSizeBytes: number;
  mimeType: string;
};

export type CameraFacingMode = "user" | "environment";

export type OpenCameraStreamOptions = {
  facingMode?: CameraFacingMode;
  width?: number;
  height?: number;
  audio?: boolean;
};

export type CaptureCameraPhotoOptions = {
  fileName?: string;
  mimeType?: "image/webp" | "image/jpeg" | "image/png";
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
};


const DEFAULT_MAX_ORIGINAL_BYTES = 12 * 1024 * 1024;

const IMAGE_PRESETS: Record<MediaVariant, ImageCompressionOptions> = {
  avatar: {
    maxWidth: 512,
    maxHeight: 512,
    quality: 0.74,
    mimeType: "image/webp",
    thumbnailMaxWidth: 96,
    thumbnailMaxHeight: 96,
    thumbnailQuality: 0.58,
    thumbnailMimeType: "image/webp",
  },
  cover: {
    maxWidth: 1440,
    maxHeight: 720,
    quality: 0.7,
    mimeType: "image/webp",
    thumbnailMaxWidth: 320,
    thumbnailMaxHeight: 160,
    thumbnailQuality: 0.55,
    thumbnailMimeType: "image/webp",
  },
  logo: {
    maxWidth: 600,
    maxHeight: 600,
    quality: 0.78,
    mimeType: "image/webp",
    thumbnailMaxWidth: 120,
    thumbnailMaxHeight: 120,
    thumbnailQuality: 0.62,
    thumbnailMimeType: "image/webp",
  },
  signature: {
    maxWidth: 700,
    maxHeight: 300,
    quality: 0.78,
    mimeType: "image/png",
    thumbnailMaxWidth: 220,
    thumbnailMaxHeight: 96,
    thumbnailQuality: 0.62,
    thumbnailMimeType: "image/png",
  },
  gallery: {
    maxWidth: 1440,
    maxHeight: 1440,
    quality: 0.7,
    mimeType: "image/webp",
    thumbnailMaxWidth: 260,
    thumbnailMaxHeight: 260,
    thumbnailQuality: 0.56,
    thumbnailMimeType: "image/webp",
  },
  receipt: {
    maxWidth: 1200,
    maxHeight: 1600,
    quality: 0.72,
    mimeType: "image/webp",
    thumbnailMaxWidth: 220,
    thumbnailMaxHeight: 300,
    thumbnailQuality: 0.58,
    thumbnailMimeType: "image/webp",
  },
  attachment: {
    maxWidth: 1440,
    maxHeight: 1440,
    quality: 0.7,
    mimeType: "image/webp",
    thumbnailMaxWidth: 260,
    thumbnailMaxHeight: 260,
    thumbnailQuality: 0.56,
    thumbnailMimeType: "image/webp",
  },
};

function randomMediaIdPart() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cleanOwnerTable(ownerTable?: string | null) {
  const clean = cleanString(ownerTable);
  if (!clean) throw new Error("Media ownerTable is required. Use MediaOwners.STUDENTS, MediaOwners.TEACHERS, etc.");
  return clean;
}

function cleanFieldKey(fieldKey?: string | null) {
  const clean = cleanString(fieldKey);
  if (!clean) throw new Error("Media fieldKey is required. Use MediaFieldKeys.PHOTO, MediaFieldKeys.COVER_PHOTO, etc.");
  return clean;
}

/**
 * Creates a safe temporary media owner key for unsaved forms.
 *
 * Every form/page must create its own key using the correct owner table:
 * - createMediaSessionKey(MediaOwners.STUDENTS)
 * - createMediaSessionKey(MediaOwners.TEACHERS)
 * - createMediaSessionKey(MediaOwners.PARENTS)
 *
 * This prevents a new Teacher photo from being treated as a Student photo,
 * or one unsaved form from reusing another form's latest uploaded image.
 */
export function createMediaSessionKey(ownerTable: MediaOwnerTable, recordId?: number | string | null) {
  const owner = cleanOwnerTable(ownerTable);
  const ownerId = recordId === undefined || recordId === null || recordId === "" ? "new" : String(recordId);
  return `${owner}:${ownerId}:${randomMediaIdPart()}`;
}

/** Old-friendly alias for modules that read better with this name. */
export const createMediaOwnerTempKey = createMediaSessionKey;

export function buildMediaOwnerOptions(params: {
  ownerTable: MediaOwnerTable;
  ownerId?: string | null;
  ownerTempKey?: string | null;
}) {
  return {
    ownerTable: cleanOwnerTable(params.ownerTable) as MediaOwnerTable,
    ownerId: cleanString(params.ownerId),
    ownerTempKey: cleanString(params.ownerTempKey),
  };
}

function validateSaveMediaAssetOptions(options: SaveMediaAssetOptions) {
  if (!cleanString(options.accountId)) {
    throw new Error("Cannot save media without accountId. Please log in again.");
  }

  cleanOwnerTable(options.ownerTable);
  cleanFieldKey(options.fieldKey);
}

function tableSafe(name: string) {
  return (db as any)[name];
}

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function cleanString(value?: string | null) {
  const clean = String(value || "").trim();
  return clean.length ? clean : undefined;
}

function cleanNumber(value?: number | string | null) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function sameString(a?: string | null, b?: string | null) {
  return String(a || "") === String(b || "");
}

function hasOwnerIdentity(params: {
  accountId?: string | null;
  ownerTempKey?: string | null;
  ownerId?: string | null;
  ownerTable?: string | null;
  fieldKey?: string | null;
  deviceId?: string | null;
}) {
  return !!buildMediaIdentityKey({
    ...params,
    deviceId: params.deviceId || getDeviceId(),
  });
}

function ownerIdentityMatches(row: any, params: any) {
  return mediaIdentityMatches(row, {
    ...params,
    deviceId: params.deviceId || getDeviceId(),
  });
}

function createObjectUrl(blob: Blob) {
  return URL.createObjectURL(blob);
}

type CachedObjectUrl = {
  cacheKey: string;
  url: string;
};

const objectUrlCache = new Map<string, CachedObjectUrl>();

function mediaCacheKey(asset: any, blobRow?: any) {
  return [
    String(asset?.id || ""),
    Number(asset?.localBlobId || 0),
    Number(blobRow?.id || 0),
    Number(asset?.updatedAt || 0),
    Number(blobRow?.updatedAt || 0),
    Number(asset?.sizeBytes || 0),
    Number(blobRow?.sizeBytes || 0),
    String(asset?.mimeType || blobRow?.mimeType || ""),
  ].join(":");
}

function revokeCachedMediaObjectUrl(assetId?: string | null) {
  const id = cleanString(assetId);
  if (!id) return;

  const cached = objectUrlCache.get(id);
  if (cached?.url?.startsWith("blob:")) {
    URL.revokeObjectURL(cached.url);
  }

  objectUrlCache.delete(id);
}

function rememberMediaObjectUrl(assetId: string, cacheKey: string, url: string) {
  const id = cleanString(assetId);
  if (!id || !url) return url;

  const existing = objectUrlCache.get(id);
  if (existing && existing.cacheKey !== cacheKey && existing.url.startsWith("blob:")) {
    URL.revokeObjectURL(existing.url);
  }

  objectUrlCache.set(id, { cacheKey, url });
  return url;
}

function mediaSortTime(row: any) {
  const updatedAt = Number(row?.updatedAt || 0);
  const createdAt = Number(row?.createdAt || 0);
  const uploadedAt = row?.uploadedAt ? new Date(row.uploadedAt).getTime() : 0;
  return Math.max(updatedAt, createdAt, Number.isFinite(uploadedAt) ? uploadedAt : 0);
}

function sortNewestMediaFirst(a: any, b: any) {
  const versionDiff = Number(b?.version || 0) - Number(a?.version || 0);
  if (versionDiff) return versionDiff;

  const timeDiff = mediaSortTime(b) - mediaSortTime(a);
  if (timeDiff) return timeDiff;

  return String(b?.id || "").localeCompare(String(a?.id || ""));
}

async function rawUpdateMediaAssetLocalOnly(assetId: string, patch: Record<string, any>) {
  const id = cleanString(assetId);
  if (!id) return;

  // Important: this is intentionally NOT updateLocal(...). Preview caching is
  // a local display concern. It must not change updatedAt/version/synced,
  // otherwise an old local image can look newer than the database source of truth
  // and win on another sync round.
  await tableSafe("mediaAssets")?.update?.(id, patch);
}

async function softDeleteMediaBlobForAsset(asset: any, now = Date.now()) {
  const blobTable = tableSafe("mediaBlobs");
  if (!blobTable || !asset?.id) return;

  const directBlobId = cleanNumber(asset.localBlobId);
  if (directBlobId) {
    try {
      await blobTable.update(directBlobId, { active: false, isDeleted: true, updatedAt: now });
    } catch {
      // ignore local-only blob cleanup errors
    }
  }

  try {
    const rows = await blobTable.toArray?.();
    const assetId = cleanString(asset.id);

    await Promise.all(
      (rows || [])
        .filter(
          (row: any) =>
            !!assetId &&
            cleanString(row.assetId) === assetId,
        )
        .map((row: any) => {
          const blobId = cleanNumber(row?.id);

          return blobId
            ? blobTable.update(blobId, {
                active: false,
                isDeleted: true,
                updatedAt: now,
              })
            : Promise.resolve();
        }),
    );
  } catch {
    // ignore local-only blob cleanup errors
  }
}

function isInlinePreviewSafe(asset: any) {
  const mimeType = String(asset?.mimeType || "").toLowerCase();
  const kind = String(asset?.kind || asset?.assetKind || "").toLowerCase();
  return kind === "image" || mimeType.startsWith("image/");
}

async function blobRowToDataUrl(blobRow: any, fallbackMimeType?: string) {
  const blob =
    blobRow?.blob ||
    (blobRow?.arrayBuffer
      ? new Blob([blobRow.arrayBuffer], { type: blobRow.mimeType || fallbackMimeType || "application/octet-stream" })
      : undefined);

  if (!blob) return "";
  return fileToDataUrl(blob);
}

export function getMediaKind(fileOrMimeType: File | Blob | string): MediaKind {
  const mimeType = typeof fileOrMimeType === "string" ? fileOrMimeType : fileOrMimeType.type || "";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("sheet") || mimeType.includes("text")) return "document";
  return "other";
}

export function getImageCompressionOptions(variant: MediaVariant = "attachment", overrides?: Partial<ImageCompressionOptions>) {
  return { ...IMAGE_PRESETS[variant], ...(overrides || {}) };
}

export function guessVariantFromField(fieldKey: string): MediaVariant {
  const key = String(fieldKey || "").toLowerCase();
  if (key.includes("cover") || key.includes("banner") || key.includes("hero") || key.includes("background")) return "cover";
  if (key.includes("logo")) return "logo";
  if (key.includes("signature")) return "signature";
  if (key.includes("receipt") || key.includes("proof")) return "receipt";
  if (key.includes("gallery")) return "gallery";
  if (key.includes("photo") || key.includes("avatar")) return "avatar";
  return "attachment";
}

export async function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

export async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error("Failed to read blob."));
    reader.readAsArrayBuffer(blob);
  });
}


function cameraErrorMessage(error: any) {
  const name = String(error?.name || "");

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission was denied. Allow camera access in your browser and try again.";
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera was found on this device.";
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera is already in use by another app or browser tab.";
  }

  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "This camera does not support the requested capture settings.";
  }

  if (name === "SecurityError") {
    return "Camera access requires HTTPS, localhost, or an installed trusted PWA context.";
  }

  return error?.message || "Could not open the camera.";
}

export function isCameraApiAvailable() {
  return (
    isBrowser() &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

export function getCameraUnavailableMessage() {
  if (!isBrowser()) return "Camera capture is only available in the browser.";
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Camera access requires HTTPS, localhost, or an installed trusted PWA context.";
  }
  if (!isCameraApiAvailable()) return "This browser does not support direct camera capture.";
  return "Camera is available.";
}

export async function openCameraStream(options: OpenCameraStreamOptions = {}) {
  if (!isCameraApiAvailable()) {
    throw new Error(getCameraUnavailableMessage());
  }

  const video: MediaTrackConstraints = {
    facingMode: { ideal: options.facingMode || "environment" },
  };

  if (options.width) video.width = { ideal: options.width };
  if (options.height) video.height = { ideal: options.height };

  try {
    return await navigator.mediaDevices.getUserMedia({
      video,
      audio: !!options.audio,
    });
  } catch (error: any) {
    throw new Error(cameraErrorMessage(error));
  }
}

export function stopCameraStream(stream?: MediaStream | null) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

export async function attachCameraStreamToVideo(video: HTMLVideoElement, stream: MediaStream) {
  if (!video) throw new Error("Camera preview video element was not found.");

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;

  await video.play();
}

export async function captureImageFileFromVideo(video: HTMLVideoElement, options: CaptureCameraPhotoOptions = {}) {
  if (!video) throw new Error("Camera preview video element was not found.");

  const sourceWidth = video.videoWidth || video.clientWidth;
  const sourceHeight = video.videoHeight || video.clientHeight;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("Camera is not ready yet. Wait for the preview to appear, then capture again.");
  }

  const maxWidth = options.maxWidth || sourceWidth;
  const maxHeight = options.maxHeight || sourceHeight;
  const size = scaledSize(sourceWidth, sourceHeight, maxWidth, maxHeight);

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  ctx.drawImage(video, 0, 0, size.width, size.height);

  const mimeType = options.mimeType || "image/jpeg";
  const quality = options.quality ?? 0.88;
  const blob = await canvasToBlob(canvas, mimeType, quality);
  const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const fileName = options.fileName || `camera-photo-${Date.now()}.${extension}`;

  return new File([blob], fileName, {
    type: blob.type || mimeType,
    lastModified: Date.now(),
  });
}

export async function saveCameraImageAsset(
  video: HTMLVideoElement,
  saveOptions: SaveMediaAssetOptions,
  captureOptions?: CaptureCameraPhotoOptions
) {
  const file = await captureImageFileFromVideo(video, captureOptions);
  return saveImageAsset(file, saveOptions);
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  if (!isBrowser()) throw new Error("Image compression is only available in the browser.");

  const url = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load image."));
      img.src = url;
    });

    return image;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function scaledSize(width: number, height: number, maxWidth: number, maxHeight: number) {
  if (!width || !height) return { width: maxWidth, height: maxHeight };
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Failed to compress image."));
        else resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

export async function compressImageFile(file: File, options?: Partial<ImageCompressionOptions>) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be compressed with compressImageFile.");
  }

  const merged = getImageCompressionOptions("attachment", options);
  const image = await loadImageFromFile(file);
  const size = scaledSize(image.naturalWidth || image.width, image.naturalHeight || image.height, merged.maxWidth, merged.maxHeight);

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  ctx.drawImage(image, 0, 0, size.width, size.height);
  const blob = await canvasToBlob(canvas, merged.mimeType, merged.quality);

  return {
    blob,
    width: size.width,
    height: size.height,
    mimeType: blob.type || merged.mimeType,
    sizeBytes: blob.size,
    originalSizeBytes: file.size,
  };
}

export async function createImageThumbnail(file: File, options?: Partial<ImageCompressionOptions>) {
  const merged = getImageCompressionOptions("attachment", options);
  const image = await loadImageFromFile(file);
  const size = scaledSize(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    merged.thumbnailMaxWidth,
    merged.thumbnailMaxHeight
  );

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  ctx.drawImage(image, 0, 0, size.width, size.height);
  const blob = await canvasToBlob(canvas, merged.thumbnailMimeType, merged.thumbnailQuality);

  return {
    blob,
    width: size.width,
    height: size.height,
    mimeType: blob.type || merged.thumbnailMimeType,
    sizeBytes: blob.size,
    dataUrl: await fileToDataUrl(blob),
  };
}

export async function saveImageAsset(file: File, options: SaveMediaAssetOptions): Promise<SavedMediaAssetResult> {
  validateSaveMediaAssetOptions(options);
  if (!file) throw new Error("No file selected.");
  if (!file.type.startsWith("image/")) throw new Error("Please select an image file.");

  const maxOriginalBytes = options.maxOriginalBytes || DEFAULT_MAX_ORIGINAL_BYTES;
  if (file.size > maxOriginalBytes) {
    throw new Error(`Image is too large. Maximum allowed size is ${Math.round(maxOriginalBytes / 1024 / 1024)}MB.`);
  }

  const variant = options.variant || guessVariantFromField(options.fieldKey);
  const compression = getImageCompressionOptions(variant, options.image);
  const compressed = await compressImageFile(file, compression);
  const thumbnail = await createImageThumbnail(file, compression);
  const now = Date.now();

  if (options.replaceExisting) {
    await softDeleteOwnerFieldAssets({
      accountId: options.accountId,
      ownerTable: options.ownerTable,
      ownerId: options.ownerId,
      ownerTempKey: options.ownerTempKey,
      fieldKey: options.fieldKey,
    });
  }

  const blobPayload = {
    accountId: options.accountId,
    schoolId: options.schoolId || undefined,
    branchId: options.branchId || undefined,
    blob: compressed.blob,
    arrayBuffer: await blobToArrayBuffer(compressed.blob),
    mimeType: compressed.mimeType,
    sizeBytes: compressed.sizeBytes,
    checksum: undefined,
    createdAt: now,
    updatedAt: now,
    active: true,
    isDeleted: false,
  };

  const blobId = await tableSafe("mediaBlobs").add(blobPayload);

  const assetPayload = {
    accountId: options.accountId,
    schoolId: options.schoolId || undefined,
    branchId: options.branchId || undefined,
    ownerTable: cleanOwnerTable(options.ownerTable),
    ownerId: cleanString(options.ownerId),
    ownerTempKey: cleanString(options.ownerTempKey),
    fieldKey: cleanFieldKey(options.fieldKey),
    deviceId: cleanString(options.deviceId) || getDeviceId(),
    ownerIdentityKey: buildMediaIdentityKey({
      accountId: options.accountId,
      ownerTable: options.ownerTable,
      ownerId: options.ownerId,
      ownerTempKey: options.ownerTempKey,
      deviceId: cleanString(options.deviceId) || getDeviceId(),
      fieldKey: options.fieldKey,
    }),
    identityVersion: 1,
    kind: "image" as MediaKind,
    assetKind: "image" as MediaKind,
    variant,
    fileName: file.name || `${options.fieldKey}-${now}`,
    originalFileName: file.name || undefined,
    mimeType: compressed.mimeType,
    originalMimeType: file.type || undefined,
    sizeBytes: compressed.sizeBytes,
    originalSizeBytes: file.size,
    width: compressed.width,
    height: compressed.height,
    localBlobId: Number(blobId),
    remoteUrl: undefined,
    publicUrl: undefined,
    thumbnailDataUrl: thumbnail.dataUrl,
    previewDataUrl: await fileToDataUrl(compressed.blob),
    altText: options.altText,
    caption: options.caption,
    uploadStatus: "local" as MediaUploadStatus,
    uploadError: undefined,
    uploadedAt: undefined,
    createdBy: options.createdBy == null ? undefined : String(options.createdBy),
    active: true,
    isDeleted: false,
  };

  const asset = await createLocal("mediaAssets" as any, assetPayload as any);
  const assetId = cleanString((asset as any)?.id) || "";

  if (assetId && blobId) {
    await tableSafe("mediaBlobs").update(Number(blobId), { assetId, updatedAt: Date.now() });
  }

  // Use a stable data URL for image previews instead of a browser blob URL.
  // Blob URLs are short-lived and can appear to “bleed” across React renders
  // when they are revoked/recreated while list items are still mounted.
  const previewUrl = await fileToDataUrl(compressed.blob);

  if (assetId) scheduleMediaUpload(assetId);

  return {
    assetId,
    blobId: Number(blobId),
    asset,
    blob: { ...blobPayload, id: Number(blobId), assetId },
    previewUrl,
    thumbnailUrl: thumbnail.dataUrl,
    width: compressed.width,
    height: compressed.height,
    sizeBytes: compressed.sizeBytes,
    originalSizeBytes: file.size,
    mimeType: compressed.mimeType,
  };
}

export async function saveGenericFileAsset(file: File, options: SaveMediaAssetOptions): Promise<SavedMediaAssetResult> {
  validateSaveMediaAssetOptions(options);
  if (!file) throw new Error("No file selected.");

  const maxOriginalBytes = options.maxOriginalBytes || DEFAULT_MAX_ORIGINAL_BYTES;
  if (file.size > maxOriginalBytes) {
    throw new Error(`File is too large. Maximum allowed size is ${Math.round(maxOriginalBytes / 1024 / 1024)}MB.`);
  }

  if (file.type.startsWith("image/")) return saveImageAsset(file, options);

  const now = Date.now();

  if (options.replaceExisting) {
    await softDeleteOwnerFieldAssets({
      accountId: options.accountId,
      ownerTable: options.ownerTable,
      ownerId: options.ownerId,
      ownerTempKey: options.ownerTempKey,
      fieldKey: options.fieldKey,
    });
  }

  const blobId = await tableSafe("mediaBlobs").add({
    accountId: options.accountId,
    schoolId: options.schoolId || undefined,
    branchId: options.branchId || undefined,
    blob: file,
    arrayBuffer: await blobToArrayBuffer(file),
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    createdAt: now,
    updatedAt: now,
    active: true,
    isDeleted: false,
  });

  const assetPayload = {
    accountId: options.accountId,
    schoolId: options.schoolId || undefined,
    branchId: options.branchId || undefined,
    ownerTable: cleanOwnerTable(options.ownerTable),
    ownerId: cleanString(options.ownerId),
    ownerTempKey: cleanString(options.ownerTempKey),
    fieldKey: cleanFieldKey(options.fieldKey),
    deviceId: cleanString(options.deviceId) || getDeviceId(),
    ownerIdentityKey: buildMediaIdentityKey({
      accountId: options.accountId,
      ownerTable: options.ownerTable,
      ownerId: options.ownerId,
      ownerTempKey: options.ownerTempKey,
      deviceId: cleanString(options.deviceId) || getDeviceId(),
      fieldKey: options.fieldKey,
    }),
    identityVersion: 1,
    kind: getMediaKind(file),
    assetKind: getMediaKind(file),
    variant: options.variant || "attachment",
    fileName: file.name || `${options.fieldKey}-${now}`,
    originalFileName: file.name || undefined,
    mimeType: file.type || "application/octet-stream",
    originalMimeType: file.type || undefined,
    sizeBytes: file.size,
    originalSizeBytes: file.size,
    localBlobId: Number(blobId),
    uploadStatus: "local" as MediaUploadStatus,
    altText: options.altText,
    caption: options.caption,
    createdBy: options.createdBy == null ? undefined : String(options.createdBy),
    active: true,
    isDeleted: false,
  };

  const asset = await createLocal("mediaAssets" as any, assetPayload as any);
  const assetId = cleanString((asset as any)?.id) || "";

  if (assetId && blobId) {
    await tableSafe("mediaBlobs").update(Number(blobId), { assetId, updatedAt: Date.now() });
  }

  const previewUrl = createObjectUrl(file);
  if (assetId) {
    const cacheKey = mediaCacheKey(
      { ...(asset as any), id: assetId, localBlobId: Number(blobId), updatedAt: now, sizeBytes: file.size, mimeType: file.type || "application/octet-stream" },
      { id: Number(blobId), assetId: assetId, updatedAt: now, sizeBytes: file.size, mimeType: file.type || "application/octet-stream" }
    );
    rememberMediaObjectUrl(assetId, cacheKey, previewUrl);
  }

  if (assetId) scheduleMediaUpload(assetId);

  return {
    assetId,
    blobId: Number(blobId),
    asset,
    blob: { id: Number(blobId), assetId },
    previewUrl,
    width: undefined,
    height: undefined,
    sizeBytes: file.size,
    originalSizeBytes: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}

export async function getMediaAsset(assetId?: string | null) {
  if (!assetId) return undefined;
  return tableSafe("mediaAssets")?.get?.(String(assetId));
}

export async function getMediaBlob(
  assetOrBlobId?: string | number | null,
) {
  const assetId = cleanString(
    assetOrBlobId == null
      ? undefined
      : String(assetOrBlobId),
  );

  if (!assetId) return undefined;

  /**
   * First treat the value as a permanent media asset UUID.
   */
  const asset = await getMediaAsset(assetId);

  if (asset?.localBlobId) {
    const localBlobId = cleanNumber(
      asset.localBlobId,
    );

    if (localBlobId) {
      const blobByAssetPointer =
        await tableSafe("mediaBlobs")
          ?.get?.(localBlobId);

      if (blobByAssetPointer) {
        return blobByAssetPointer;
      }
    }
  }

  /**
   * Fallback lookup uses mediaBlobs.assetId, which stores the asset UUID.
   */
  const rows =
    await tableSafe("mediaBlobs")
      ?.toArray?.();

  const blobByAssetId =
    rows?.find?.(
      (row: any) =>
        !row?.isDeleted &&
        row?.active !== false &&
        cleanString(row.assetId) ===
          assetId,
    );

  if (blobByAssetId) {
    return blobByAssetId;
  }

  /**
   * Legacy callers may still pass a numeric mediaBlobs primary key.
   */
  const blobId = cleanNumber(
    assetOrBlobId,
  );

  return blobId
    ? tableSafe("mediaBlobs")
        ?.get?.(blobId)
    : undefined;
}

export async function getMediaObjectUrl(assetId?: string | null) {
  const id = cleanString(assetId);
  if (!id) return "";

  const asset = await getMediaAsset(id);
  if (!asset || asset.isDeleted || asset.active === false) {
    revokeCachedMediaObjectUrl(id);
    return "";
  }

  if (asset?.publicUrl) return asset.publicUrl;
  if (asset?.remoteUrl) return asset.remoteUrl;

  // Strong anti-bleed rule:
  // For images, prefer stable inline data URLs over object URLs. This prevents
  // browser blob URL revocation/reuse from making one newly uploaded image
  // appear in other students/classes/teachers until cache is cleared.
  if (isInlinePreviewSafe(asset)) {
    if (asset.previewDataUrl) return asset.previewDataUrl;
    if (asset.thumbnailDataUrl) return asset.thumbnailDataUrl;
  }

  const blobRow = await getMediaBlob(id);

  if (isInlinePreviewSafe(asset)) {
    const dataUrl = await blobRowToDataUrl(blobRow, asset?.mimeType);
    if (dataUrl) {
      // Persist the stable preview for future renders. This is best-effort;
      // displaying the correct image must not depend on the update succeeding.
      try {
        await rawUpdateMediaAssetLocalOnly(id, { previewDataUrl: dataUrl });
      } catch {
        // ignore preview cache write failures
      }
      return dataUrl;
    }
  }

  const cacheKey = mediaCacheKey(asset, blobRow);
  const cached = objectUrlCache.get(id);
  if (cached && cached.cacheKey === cacheKey) return cached.url;

  if (cached?.url?.startsWith("blob:")) {
    URL.revokeObjectURL(cached.url);
    objectUrlCache.delete(id);
  }

  const blob =
    blobRow?.blob ||
    (blobRow?.arrayBuffer ? new Blob([blobRow.arrayBuffer], { type: blobRow.mimeType || asset?.mimeType }) : undefined);

  if (blob) {
    return rememberMediaObjectUrl(id, cacheKey, createObjectUrl(blob));
  }

  return asset?.thumbnailDataUrl || "";
}

export async function getOwnerFieldMediaAsset(params: {
  accountId?: string;
  ownerTable: string;
  ownerId?: string | null;
  ownerTempKey?: string | null;
  deviceId?: string | null;
  fieldKey: string;
}) {
  return findExactOwnerFieldMediaAsset({
    ...params,
    deviceId: params.deviceId || getDeviceId(),
  });
}


export async function resolveOwnerMediaUrl(params: {
  accountId?: string;
  ownerTable: string;
  ownerId?: string | null;
  ownerTempKey?: string | null;
  deviceId?: string | null;
  fieldKey: string;
  fallbackAssetId?: string | null;
}) {
  const ownedAsset = await getOwnerFieldMediaAsset({
    accountId: params.accountId,
    ownerTable: params.ownerTable,
    ownerId: params.ownerId,
    ownerTempKey: params.ownerTempKey,
    deviceId: params.deviceId || getDeviceId(),
    fieldKey: params.fieldKey,
  });

  if (ownedAsset?.id) {
    const url = await resolveMediaAssetUrl(ownedAsset);
    if (url) return url;
  }

  const fallbackId = cleanString(params.fallbackAssetId);
  const ownerId = cleanString(params.ownerId);
  const ownerTempKey = cleanString(params.ownerTempKey);

  if (!fallbackId || !hasOwnerIdentity({ ownerId, ownerTempKey })) return "";

  const fallbackAsset = await getMediaAsset(fallbackId);
  if (!fallbackAsset || fallbackAsset.isDeleted || fallbackAsset.active === false) return "";
  if (params.accountId && fallbackAsset.accountId !== params.accountId) return "";
  if (fallbackAsset.ownerTable !== cleanOwnerTable(params.ownerTable)) return "";
  if (fallbackAsset.fieldKey !== cleanFieldKey(params.fieldKey)) return "";
  if (!ownerIdentityMatches(fallbackAsset, { ownerId, ownerTempKey })) return "";

  return getMediaObjectUrl(fallbackId);
}

export async function softDeleteOwnerFieldAssets(params: {
  accountId?: string;
  ownerTable: string;
  ownerId?: string | null;
  ownerTempKey?: string | null;
  deviceId?: string | null;
  fieldKey?: string;
  excludeAssetIds?: Array<number | string | null | undefined>;
}) {
  const table = tableSafe("mediaAssets");
  if (!table) return;

  // Do not delete by ownerTable + fieldKey alone. That is too broad and can
  // delete media from another open unsaved record.
  if (!hasOwnerIdentity(params)) return;

  const excluded = new Set((params.excludeAssetIds || []).map((id) => String(id || "").trim()).filter(Boolean));
  const rows = await table.toArray();
  const matches = rows.filter((row: any) => {
    if (row?.id && excluded.has(String(row.id))) return false;
    if (row.isDeleted) return false;
    if (params.accountId && row.accountId !== params.accountId) return false;
    if (row.ownerTable !== cleanOwnerTable(params.ownerTable)) return false;
    if (params.fieldKey && row.fieldKey !== cleanFieldKey(params.fieldKey)) return false;
    return ownerIdentityMatches(row, params);
  });

  await Promise.all(
    matches.map(async (row: any) => {
      if (!row.id) return;
      revokeCachedMediaObjectUrl(String(row.id));

      await updateLocal("mediaAssets" as any, String(row.id), {
        active: false,
        isDeleted: true,
        ownerTempKey: undefined,
        // Keep uploaded assets marked uploaded so the backend can receive the
        // deletion tombstone instead of the file being treated as a new local upload.
        uploadStatus: row.uploadStatus === "uploaded" ? row.uploadStatus : "local",
      } as any);

      // mediaBlobs are local-only. Clean them locally so the old image stops
      // occupying storage and cannot be resolved by stale blob pointers.
      await softDeleteMediaBlobForAsset(row);
    })
  );
}

export async function attachMediaAssetToOwner(params: {
  assetId: string;
  ownerTable: string;
  ownerId?: string | null;
  ownerTempKey?: string | null;
  /**
   * The destination owner field is authoritative during commit.
   * This repairs legacy assets whose fieldKey used an older alias such as
   * "schoolLogo" while the current owner row stores the media ID under "logo".
   */
  fieldKey?: string | null;
}) {
  const asset = await getMediaAsset(params.assetId);
  if (!asset?.id) return;

  revokeCachedMediaObjectUrl(String(asset.id));

  const ownerTable = cleanOwnerTable(params.ownerTable);
  const ownerId = cleanString(params.ownerId);
  const fieldKey = cleanFieldKey(params.fieldKey || asset.fieldKey);
  const deviceId = asset.deviceId || getDeviceId();

  await updateLocal("mediaAssets" as any, String(asset.id), {
    ownerTable,
    ownerId,
    fieldKey,
    deviceId,
    ownerIdentityKey: buildMediaIdentityKey({
      accountId: asset.accountId,
      ownerTable,
      ownerId,
      deviceId,
      fieldKey,
    }),
    identityVersion: 1,
    // Once attached to a real record, clear the temporary form/session key so
    // future lookups use the permanent owner identity.
    ownerTempKey: undefined,
    active: true,
    isDeleted: false,
  } as any);

  // Replacement cleanup for unsaved-form uploads that become attached later:
  // once this asset has a permanent owner, deactivate older active assets for
  // the same owner + field. The current asset is excluded.
  if (fieldKey && ownerId) {
    await softDeleteOwnerFieldAssets({
      accountId: asset.accountId,
      ownerTable,
      ownerId,
      fieldKey,
      excludeAssetIds: [String(asset.id)],
    });
  }
}


export async function verifyOwnerFieldMedia(params: {
  assetId?: string | null;
  accountId: string;
  ownerTable: string;
  ownerId?: string | null;
  ownerTempKey?: string | null;
  fieldKey: string;
}) {
  const expectedId = cleanString(params.assetId);
  const expectedOwnerTable = cleanOwnerTable(params.ownerTable);
  const expectedFieldKey = cleanFieldKey(params.fieldKey);

  /**
   * When Save already knows the exact media ID, verify that row directly.
   * Do not require an owner-index lookup to rediscover the same row: older
   * IndexedDB schemas, stale ownerIdentityKey indexes, or a local→cloud owner
   * transition can otherwise create a false “not found” error.
   */
  if (expectedId) {
    const expected = await getMediaAsset(expectedId);

    if (!expected?.id) {
      throw new Error(`The ${params.fieldKey} media asset no longer exists after saving.`);
    }

    if (expected.isDeleted || expected.active === false) {
      throw new Error(`The ${params.fieldKey} media asset was deleted before verification.`);
    }

    if (String(expected.accountId || "") !== String(params.accountId || "")) {
      throw new Error(`The ${params.fieldKey} media asset belongs to another account.`);
    }

    if (cleanOwnerTable(expected.ownerTable) !== expectedOwnerTable) {
      throw new Error(`The ${params.fieldKey} media asset was attached to the wrong owner table.`);
    }

    if (cleanFieldKey(expected.fieldKey) !== expectedFieldKey) {
      // A legacy asset may still carry an old field alias. Commit is the
      // authoritative boundary, so repair the exact asset instead of rejecting
      // a valid image that is already referenced by the owner row.
      const repairedDeviceId = expected.deviceId || getDeviceId();

      await updateLocal("mediaAssets" as any, String(expected.id), {
        fieldKey: expectedFieldKey,
        ownerIdentityKey: buildMediaIdentityKey({
          accountId: params.accountId,
          ownerTable: expectedOwnerTable,
          ownerId: params.ownerId,
          ownerTempKey: params.ownerTempKey,
          deviceId: repairedDeviceId,
          fieldKey: expectedFieldKey,
        }),
        identityVersion: 1,
        active: true,
        isDeleted: false,
      } as any);

      const repaired = await getMediaAsset(String(expected.id));

      if (!repaired?.id || cleanFieldKey(repaired.fieldKey) !== expectedFieldKey) {
        throw new Error(`The ${params.fieldKey} media asset could not be assigned to the correct field.`);
      }

      Object.assign(expected, repaired);
    }

    const expectedOwnerId =
      cleanString(params.ownerId);

    const expectedTempKey =
      cleanString(params.ownerTempKey);

    const ownerMatches =
      (
        !!expectedOwnerId &&
        cleanString(expected.ownerId) ===
          expectedOwnerId
      ) ||
      (
        !!expectedTempKey &&
        cleanString(expected.ownerTempKey) ===
          expectedTempKey
      );

    if (
      (
        expectedOwnerId ||
        expectedTempKey
      ) &&
      !ownerMatches
    ) {
      throw new Error(`The ${params.fieldKey} media asset was not attached to the saved owner.`);
    }

    const url = await resolveMediaAssetUrl(expected);
    if (!url) {
      throw new Error(`The ${params.fieldKey} image was saved but cannot be displayed from local or remote storage.`);
    }

    return { asset: expected, url };
  }

  // Fallback for legacy callers that do not store a media ID on the owner row.
  const asset = await getOwnerFieldMediaAsset({
    accountId: params.accountId,
    ownerTable: params.ownerTable,
    ownerId: params.ownerId,
    ownerTempKey: params.ownerTempKey,
    fieldKey: params.fieldKey,
  });

  if (!asset?.id) {
    throw new Error(`The ${params.fieldKey} media asset could not be found after saving.`);
  }

  const url = await resolveMediaAssetUrl(asset);
  if (!url) {
    throw new Error(`The ${params.fieldKey} image was saved but cannot be displayed from local or remote storage.`);
  }

  return { asset, url };
}

export async function commitMediaAssetToOwner(params: {
  assetId: string;
  accountId: string;
  ownerTable: string;
  ownerId?: string | null;
  ownerTempKey?: string | null;
  fieldKey: string;
  allowMultiple?: boolean;
}) {
  const assetId = cleanString(params.assetId);
  if (!assetId) throw new Error("A valid media asset ID is required.");
  if (!cleanString(params.ownerId)) {
    throw new Error(`Cannot attach ${params.fieldKey} media before the owner record exists.`);
  }

  await attachMediaAssetToOwner({
    assetId,
    ownerTable: params.ownerTable,
    ownerId: params.ownerId,
    ownerTempKey: params.ownerTempKey,
    fieldKey: params.fieldKey,
  });

  if (!params.allowMultiple) {
    await softDeleteOwnerFieldAssets({
      accountId: params.accountId,
      ownerTable: params.ownerTable,
      ownerId: params.ownerId,
      fieldKey: params.fieldKey,
      excludeAssetIds: [assetId],
    });
  }

  const verified = await verifyOwnerFieldMedia({
    assetId,
    accountId: params.accountId,
    ownerTable: params.ownerTable,
    ownerId: params.ownerId,
    fieldKey: params.fieldKey,
  });

  scheduleMediaUpload(assetId);
  return verified;
}

export async function commitMediaAssetsToOwner(params: {
  accountId: string;
  ownerTable: string;
  ownerId?: string | null;
  ownerTempKey?: string | null;
  assets: Array<{ assetId?: string | null; fieldKey: string; allowMultiple?: boolean }>;
}) {
  const committed: Array<{ assetId: string; fieldKey: string; url: string }> = [];

  for (const item of params.assets) {
    const assetId = cleanString(item.assetId);
    if (!assetId) continue;

    const result = await commitMediaAssetToOwner({
      assetId,
      accountId: params.accountId,
      ownerTable: params.ownerTable,
      ownerId: params.ownerId,
      ownerTempKey: params.ownerTempKey,
      fieldKey: item.fieldKey,
      allowMultiple: item.allowMultiple,
    });

    committed.push({ assetId, fieldKey: item.fieldKey, url: result.url });
  }

  return committed;
}

export function revokeMediaObjectUrl(url?: string) {
  if (!url) return;
  if (url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
    for (const [assetId, cached] of objectUrlCache.entries()) {
      if (cached.url === url) objectUrlCache.delete(assetId);
    }
  }
}

export function clearMediaObjectUrlCache() {
  for (const cached of objectUrlCache.values()) {
    if (cached.url.startsWith("blob:")) URL.revokeObjectURL(cached.url);
  }
  objectUrlCache.clear();
}