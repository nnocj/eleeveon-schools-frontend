/**
 * app/lib/media/mediaUpload.ts
 * --------------------------------------------------------------------------
 * Debounced remote media upload queue.
 *
 * Local media remains immediately usable from mediaBlobs even when remote
 * upload is unavailable. After a successful upload, the permanent remote URL
 * is written into mediaAssets so the media can display on other devices.
 *
 * ID contract:
 * - mediaAssets.id is a permanent UUID string;
 * - mediaBlobs.id/localBlobId remains a local numeric auto-increment key;
 * - ownerId is the permanent UUID string of the owner record;
 * - ownerTempKey identifies media created before its owner is finalized.
 *
 * Expected backend contract:
 *
 * POST /media/upload
 * Content-Type: multipart/form-data
 *
 * Fields:
 * - file
 * - assetId
 * - accountId
 * - ownerTable
 * - fieldKey
 * - ownerId or ownerTempKey
 * - deviceId
 * - schoolId
 * - branchId
 *
 * Response:
 * {
 *   remoteUrl | publicUrl | storageUrl | downloadUrl
 * }
 */

import { db } from "../db";

import {
  getApiBaseUrl,
  getAuthToken,
} from "../sync/syncConfig";

import {
  updateLocal,
} from "../sync/syncUtils";

/**
 * Media asset IDs are permanent UUID strings.
 */
const queued =
  new Set<string>();

let timer:
  | ReturnType<
      typeof setTimeout
    >
  | null = null;

let activeFlush:
  | Promise<MediaUploadBatchResult>
  | null = null;

export type MediaUploadBatchResult = {
  uploaded: number;
  failed: number;
  skipped: number;
  errors: string[];
};

type MediaUploadResult =
  | {
      uploaded: true;
      url: string;
    }
  | {
      skipped: true;
      url?: string;
    };

function optionalString(
  value: unknown,
) {
  const normalized =
    String(
      value ?? "",
    ).trim();

  return normalized || null;
}

function endpoint() {
  const configured =
    String(
      process.env
        .NEXT_PUBLIC_MEDIA_UPLOAD_ENDPOINT ||
        "",
    ).trim();

  if (
    /^https?:\/\//i.test(
      configured,
    )
  ) {
    return configured;
  }

  const base =
    String(
      getApiBaseUrl() ||
        process.env
          .NEXT_PUBLIC_API_BASE_URL ||
        "http://localhost:4000",
    )
      .trim()
      .replace(
        /\/+$/,
        "",
      );

  const route =
    configured ||
    "/media/upload";

  return route.startsWith("/")
    ? `${base}${route}`
    : `${base}/${route}`;
}

async function blobForAsset(
  asset: any,
): Promise<Blob | null> {
  const table =
    (db as any).mediaBlobs;

  if (!table) {
    return null;
  }

  let row: any = null;

  /**
   * mediaBlobs remains local-only and uses a numeric auto-increment primary
   * key. localBlobId must therefore remain numeric.
   */
  if (
    asset.localBlobId !==
      undefined &&
    asset.localBlobId !== null &&
    String(
      asset.localBlobId,
    ).trim() !== ""
  ) {
    const localBlobId =
      Number(
        asset.localBlobId,
      );

    if (
      Number.isFinite(
        localBlobId,
      )
    ) {
      row =
        await table
          .get(
            localBlobId,
          )
          .catch(
            () => null,
          );
    }
  }

  /**
   * Fallback lookup uses the permanent media asset UUID.
   */
  if (
    !row &&
    asset.id
  ) {
    const assetId =
      String(
        asset.id,
      ).trim();

    try {
      row =
        await table
          .where(
            "assetId",
          )
          .equals(
            assetId,
          )
          .first();
    } catch {
      const rows =
        await table
          .toArray();

      row =
        rows.find(
          (
            candidate: any,
          ) =>
            String(
              candidate
                ?.assetId ||
                "",
            ).trim() ===
            assetId,
        ) || null;
    }
  }

  if (
    !row ||
    row.isDeleted ||
    row.active === false
  ) {
    return null;
  }

  if (
    row.blob instanceof
    Blob
  ) {
    return row.blob;
  }

  if (
    row.arrayBuffer
  ) {
    return new Blob(
      [
        row.arrayBuffer,
      ],
      {
        type:
          row.mimeType ||
          asset.mimeType ||
          "application/octet-stream",
      },
    );
  }

  return null;
}

function remoteUrl(
  response: any,
) {
  return String(
    response?.publicUrl ||
      response?.remoteUrl ||
      response?.storageUrl ||
      response?.downloadUrl ||
      response?.url ||
      "",
  ).trim();
}

function backendErrorMessage(
  payload: any,
  status: number,
) {
  const message =
    payload?.message;

  if (
    Array.isArray(
      message,
    )
  ) {
    const combined =
      message
        .map(
          (
            item,
          ) =>
            String(
              item || "",
            ).trim(),
        )
        .filter(
          Boolean,
        )
        .join(
          " ",
        );

    if (combined) {
      return combined;
    }
  }

  if (
    typeof message ===
      "string" &&
    message.trim()
  ) {
    return message.trim();
  }

  if (
    typeof payload?.error ===
      "string" &&
    payload.error.trim()
  ) {
    return payload.error.trim();
  }

  return `Media upload failed (${status}).`;
}

function appendOptionalField(
  form: FormData,
  key: string,
  value: unknown,
) {
  const normalized =
    optionalString(
      value,
    );

  if (normalized) {
    form.set(
      key,
      normalized,
    );
  }
}

export async function uploadMediaAsset(
  assetId: string,
): Promise<MediaUploadResult> {
  const id =
    String(
      assetId || "",
    ).trim();

  if (!id) {
    throw new Error(
      "Invalid media asset ID.",
    );
  }

  const table =
    (db as any).mediaAssets;

  if (!table) {
    throw new Error(
      "The mediaAssets table is unavailable.",
    );
  }

  const asset =
    await table
      .get(
        id,
      )
      .catch(
        () => null,
      );

  if (
    !asset ||
    asset.isDeleted ||
    asset.active === false
  ) {
    return {
      skipped: true,
    };
  }

  const existingRemote =
    remoteUrl(
      asset,
    );

  if (
    existingRemote
  ) {
    if (
      asset.uploadStatus !==
      "uploaded"
    ) {
      await updateLocal(
        "mediaAssets" as any,
        id,
        {
          uploadStatus:
            "uploaded",
          uploadError:
            undefined,
          uploadedAt:
            asset.uploadedAt ||
            new Date()
              .toISOString(),
        } as any,
      );
    }

    return {
      skipped: true,
      url:
        existingRemote,
    };
  }

  if (
    typeof navigator !==
      "undefined" &&
    !navigator.onLine
  ) {
    await updateLocal(
      "mediaAssets" as any,
      id,
      {
        uploadStatus:
          "queued",
        uploadError:
          undefined,
      } as any,
    );

    return {
      skipped: true,
    };
  }

  const token =
    optionalString(
      getAuthToken(),
    );

  if (!token) {
    throw new Error(
      "Media upload requires an authenticated session.",
    );
  }

  const blob =
    await blobForAsset(
      asset,
    );

  if (!blob) {
    throw new Error(
      `Media asset ${id} has no local blob to upload.`,
    );
  }

  if (
    blob.size <= 0
  ) {
    throw new Error(
      `Media asset ${id} contains an empty file.`,
    );
  }

  const ownerTable =
    optionalString(
      asset.ownerTable,
    );

  const fieldKey =
    optionalString(
      asset.fieldKey,
    );

  const ownerId =
    optionalString(
      asset.ownerId,
    );

  const ownerTempKey =
    optionalString(
      asset.ownerTempKey,
    );

  if (!ownerTable) {
    throw new Error(
      `Media asset ${id} has no ownerTable.`,
    );
  }

  if (!fieldKey) {
    throw new Error(
      `Media asset ${id} has no fieldKey.`,
    );
  }

  if (
    !ownerId &&
    !ownerTempKey
  ) {
    throw new Error(
      `Media asset ${id} has no ownerId or ownerTempKey.`,
    );
  }

  await updateLocal(
    "mediaAssets" as any,
    id,
    {
      uploadStatus:
        "uploading",
      uploadError:
        undefined,
      lastUploadAttemptAt:
        new Date()
          .toISOString(),
    } as any,
  );

  const form =
    new FormData();

  form.set(
    "assetId",
    id,
  );

  appendOptionalField(
    form,
    "accountId",
    asset.accountId,
  );

  form.set(
    "ownerTable",
    ownerTable,
  );

  form.set(
    "fieldKey",
    fieldKey,
  );

  if (ownerId) {
    form.set(
      "ownerId",
      ownerId,
    );
  }

  if (
    ownerTempKey
  ) {
    form.set(
      "ownerTempKey",
      ownerTempKey,
    );
  }

  appendOptionalField(
    form,
    "deviceId",
    asset.deviceId,
  );

  appendOptionalField(
    form,
    "schoolId",
    asset.schoolId,
  );

  appendOptionalField(
    form,
    "branchId",
    asset.branchId,
  );

  const fileName =
    optionalString(
      asset.fileName,
    ) ||
    optionalString(
      asset.originalFileName,
    ) ||
    `media-${id}`;

  form.set(
    "file",
    blob,
    fileName,
  );

  try {
    const response =
      await fetch(
        endpoint(),
        {
          method:
            "POST",
          headers: {
            Authorization:
              `Bearer ${token}`,
          },
          body:
            form,
        },
      );

    const responseText =
      await response
        .text()
        .catch(
          () => "",
        );

    let payload: any =
      {};

    if (
      responseText.trim()
    ) {
      try {
        payload =
          JSON.parse(
            responseText,
          );
      } catch {
        payload = {
          message:
            responseText,
        };
      }
    }

    if (
      !response.ok
    ) {
      console.error(
        "Media upload rejected.",
        {
          status:
            response.status,
          statusText:
            response.statusText,
          endpoint:
            endpoint(),
          payload,
          asset: {
            id,
            accountId:
              optionalString(
                asset.accountId,
              ),
            ownerTable,
            fieldKey,
            ownerId,
            ownerTempKey,
            deviceId:
              optionalString(
                asset.deviceId,
              ),
            schoolId:
              optionalString(
                asset.schoolId,
              ),
            branchId:
              optionalString(
                asset.branchId,
              ),
            mimeType:
              blob.type,
            sizeBytes:
              blob.size,
            fileName,
          },
        },
      );

      throw new Error(
        backendErrorMessage(
          payload,
          response.status,
        ),
      );
    }

    const url =
      remoteUrl(
        payload,
      );

    if (!url) {
      throw new Error(
        "Media upload succeeded but returned no remote URL.",
      );
    }

    const uploadedAt =
      new Date()
        .toISOString();

    await updateLocal(
      "mediaAssets" as any,
      id,
      {
        remoteUrl:
          payload.remoteUrl ||
          url,
        publicUrl:
          payload.publicUrl ||
          url,
        storageUrl:
          payload.storageUrl ||
          url,
        downloadUrl:
          payload.downloadUrl ||
          url,
        storageKey:
          payload.storageKey ||
          asset.storageKey,
        remoteFileName:
          payload.filename ||
          asset.remoteFileName,
        remoteMimeType:
          payload.mimeType ||
          blob.type ||
          asset.mimeType,
        remoteSizeBytes:
          payload.sizeBytes ||
          blob.size,
        uploadStatus:
          "uploaded",
        uploadError:
          undefined,
        uploadedAt,
        lastUploadAttemptAt:
          uploadedAt,
      } as any,
    );

    return {
      uploaded: true,
      url,
    };
  } catch (
    error: any
  ) {
    const message =
      error?.message ||
      String(
        error,
      );

    await updateLocal(
      "mediaAssets" as any,
      id,
      {
        uploadStatus:
          "failed",
        uploadError:
          message,
        lastUploadAttemptAt:
          new Date()
            .toISOString(),
      } as any,
    ).catch(
      () =>
        undefined,
    );

    throw error;
  }
}

export function scheduleMediaUpload(
  assetId: string,
  delayMs = 1200,
) {
  const id =
    String(
      assetId || "",
    ).trim();

  if (!id) {
    return;
  }

  queued.add(
    id,
  );

  if (timer) {
    clearTimeout(
      timer,
    );
  }

  timer =
    setTimeout(
      () => {
        timer = null;

        void flushMediaUploadQueue();
      },
      Math.max(
        250,
        delayMs,
      ),
    );
}

export async function flushMediaUploadQueue():
Promise<MediaUploadBatchResult> {
  if (
    activeFlush
  ) {
    return activeFlush;
  }

  activeFlush =
    (async () => {
      const ids =
        Array.from(
          queued,
        );

      queued.clear();

      let uploaded =
        0;

      let failed =
        0;

      let skipped =
        0;

      const errors:
        string[] = [];

      for (
        const id of ids
      ) {
        try {
          const result =
            await uploadMediaAsset(
              id,
            );

          if (
            "uploaded" in
              result &&
            result.uploaded
          ) {
            uploaded +=
              1;
          } else {
            skipped +=
              1;
          }
        } catch (
          error: any
        ) {
          failed +=
            1;

          errors.push(
            error?.message ||
              String(
                error,
              ),
          );
        }
      }

      return {
        uploaded,
        failed,
        skipped,
        errors,
      };
    })().finally(
      () => {
        activeFlush =
          null;

        /**
         * Assets may have been queued while the active batch was running.
         */
        if (
          queued.size >
          0 &&
          !timer
        ) {
          timer =
            setTimeout(
              () => {
                timer =
                  null;

                void flushMediaUploadQueue();
              },
              250,
            );
        }
      },
    );

  return activeFlush;
}

export async function retryFailedMediaUploads(
  accountId?: string,
) {
  const table =
    (db as any).mediaAssets;

  if (!table) {
    return {
      queued: 0,
    };
  }

  const normalizedAccountId =
    optionalString(
      accountId,
    );

  const rows =
    await table
      .toArray();

  const failed =
    rows.filter(
      (
        row: any,
      ) =>
        !row.isDeleted &&
        row.active !==
          false &&
        row.uploadStatus ===
          "failed" &&
        (
          !normalizedAccountId ||
          String(
            row.accountId ||
              "",
          ).trim() ===
            normalizedAccountId
        ),
    );

  let queuedCount =
    0;

  for (
    const row of failed
  ) {
    const assetId =
      optionalString(
        row.id,
      );

    if (!assetId) {
      continue;
    }

    scheduleMediaUpload(
      assetId,
      250,
    );

    queuedCount +=
      1;
  }

  return {
    queued:
      queuedCount,
  };
}
