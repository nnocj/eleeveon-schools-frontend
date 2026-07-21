/**
 * app/lib/media/mediaRepair.ts
 * --------------------------------------------------------------------------
 * Detects and optionally repairs historical media corruption.
 *
 * ID contract:
 * - mediaAssets.id is a permanent UUID string;
 * - mediaBlobs.id remains a local numeric auto-increment key.
 */

import { db } from "../db";
import { SYNC_STATUS_VALUE } from "../sync/syncConfig";
import {
  buildMediaIdentityKey,
  mediaAssetSortNewestFirst,
} from "./mediaAssetResolver";
import {
  clearMediaObjectUrlCache,
} from "./mediaAssetUtils";

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

  /**
   * mediaAssets use permanent UUID string IDs.
   */
  assetIds?: string[];

  /**
   * mediaBlobs remain local-only numeric rows.
   */
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
  return (
    !row?.isDeleted &&
    row?.active !== false
  );
}

function newest(rows: any[]) {
  return [...rows].sort(
    mediaAssetSortNewestFirst,
  )[0];
}

function cleanAssetId(value: unknown) {
  return String(value ?? "").trim();
}

function numericBlobId(value: unknown) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : undefined;
}

export async function inspectMediaIntegrity(
  accountId: string,
): Promise<MediaRepairReport> {
  const assets = (
    await (db as any).mediaAssets.toArray()
  ).filter(
    (row: any) =>
      row.accountId === accountId,
  );

  const blobs = (
    await (db as any).mediaBlobs.toArray()
  ).filter(
    (row: any) =>
      row.accountId === accountId,
  );

  const issues: MediaRepairIssue[] = [];

  const assetById = new Map<string, any>(
    assets
      .map(
        (row: any): readonly [string, any] => [
          cleanAssetId(row.id),
          row,
        ],
      )
      .filter(
        (
          entry: readonly [string, any],
        ): entry is readonly [string, any] =>
          Boolean(entry[0]),
      ),
  );

  const blobById = new Map(
    blobs
      .map((row: any) => {
        const id =
          numericBlobId(row.id);

        return id === undefined
          ? null
          : [id, row] as const;
      })
      .filter(
        (
          entry: readonly [number, any] | null,
        ): entry is readonly [number, any] =>
          entry !== null,
      ),
  );

  const groups =
    new Map<string, any[]>();

  for (const asset of assets) {
    const id =
      cleanAssetId(asset.id);

    if (
      !String(
        asset.ownerTable || "",
      ).trim()
    ) {
      issues.push({
        type: "missing-owner-table",
        assetIds:
          id ? [id] : undefined,
        message:
          `Media asset ${id || "(unknown)"} has no ownerTable.`,
      });
    }

    if (
      !String(
        asset.fieldKey || "",
      ).trim()
    ) {
      issues.push({
        type: "missing-field-key",
        assetIds:
          id ? [id] : undefined,
        message:
          `Media asset ${id || "(unknown)"} has no fieldKey.`,
      });
    }

    const identityKey =
      buildMediaIdentityKey(asset);

    if (!identityKey) {
      issues.push({
        type:
          "missing-owner-identity",
        assetIds:
          id ? [id] : undefined,
        message:
          `Media asset ${id || "(unknown)"} has no safe owner identity.`,
      });
    } else if (active(asset)) {
      const list =
        groups.get(identityKey) || [];

      list.push(asset);
      groups.set(identityKey, list);
    }

    if (
      asset.localObjectUrl &&
      String(
        asset.localObjectUrl,
      ).startsWith("blob:")
    ) {
      issues.push({
        type: "stale-object-url",
        assetIds:
          id ? [id] : undefined,
        message:
          `Media asset ${id || "(unknown)"} stores a non-persistent blob URL.`,
      });
    }

    const localBlobId =
      numericBlobId(
        asset.localBlobId,
      );

    if (
      localBlobId !== undefined &&
      !blobById.has(localBlobId)
    ) {
      issues.push({
        type: "missing-blob",
        assetIds:
          id ? [id] : undefined,
        blobIds: [localBlobId],
        message:
          `Media asset ${id || "(unknown)"} points to missing blob ${localBlobId}.`,
      });
    }
  }

  for (
    const [
      identityKey,
      rows,
    ] of groups
  ) {
    if (rows.length > 1) {
      issues.push({
        type:
          "duplicate-active-records",
        identityKey,
        assetIds:
          rows
            .map((row) =>
              cleanAssetId(row.id),
            )
            .filter(Boolean),
        message:
          `${rows.length} active media records share one exact owner field.`,
      });
    }
  }

  for (const blob of blobs) {
    const blobId =
      numericBlobId(blob.id);

    if (blobId === undefined) {
      continue;
    }

    const assetId =
      cleanAssetId(blob.assetId);

    if (
      !assetId ||
      !assetById.has(assetId)
    ) {
      issues.push({
        type: "orphaned-blob",
        blobIds: [blobId],
        message:
          `Blob ${blobId} has no matching media asset.`,
      });
    }
  }

  /**
   * Detect the historical dangerous pattern: the same account/table/owner UUID
   * reused across different fields or devices. These are reported, never
   * auto-merged.
   */
  const loose =
    new Map<string, any[]>();

  for (
    const asset of assets.filter(active)
  ) {
    if (
      !asset.ownerId ||
      !asset.ownerTable
    ) {
      continue;
    }

    const key = [
      asset.accountId,
      asset.ownerTable,
      String(asset.ownerId),
    ].join("|");

    const list =
      loose.get(key) || [];

    list.push(asset);
    loose.set(key, list);
  }

  for (const rows of loose.values()) {
    const fields =
      new Set(
        rows.map((row) =>
          String(
            row.fieldKey || "",
          ),
        ),
      );

    const devices =
      new Set(
        rows.map((row) =>
          String(
            row.deviceId || "",
          ),
        ),
      );

    if (
      fields.size > 1 ||
      devices.size > 1
    ) {
      issues.push({
        type: "old-mixed-image",
        assetIds:
          rows
            .map((row) =>
              cleanAssetId(row.id),
            )
            .filter(Boolean),
        message:
          "Legacy media share one owner UUID across distinct fields or devices. They were not merged.",
      });
    }
  }

  return {
    accountId,
    scannedAssets:
      assets.length,
    scannedBlobs:
      blobs.length,
    issues,
    repaired: 0,
    generatedAt:
      Date.now(),
  };
}

export async function repairMediaIntegrity(
  accountId: string,
): Promise<MediaRepairReport> {
  await inspectMediaIntegrity(accountId);

  let repaired = 0;

  const assetsTable =
    (db as any).mediaAssets;

  const blobsTable =
    (db as any).mediaBlobs;

  await db.transaction(
    "rw",
    assetsTable,
    blobsTable,
    async () => {
      const assets = (
        await assetsTable.toArray()
      ).filter(
        (row: any) =>
          row.accountId === accountId,
      );

      const groups =
        new Map<string, any[]>();

      for (const asset of assets) {
        const patch:
          Record<string, any> = {};

        const identityKey =
          buildMediaIdentityKey(asset);

        if (
          identityKey &&
          asset.ownerIdentityKey !==
            identityKey
        ) {
          patch.ownerIdentityKey =
            identityKey;

          patch.identityVersion = 1;
        }

        if (
          asset.localObjectUrl &&
          String(
            asset.localObjectUrl,
          ).startsWith("blob:")
        ) {
          patch.localObjectUrl =
            undefined;
        }

        const assetId =
          cleanAssetId(asset.id);

        if (
          Object.keys(patch).length &&
          assetId
        ) {
          await assetsTable.update(
            assetId,
            patch,
          );

          repaired++;
        }

        if (
          identityKey &&
          active(asset)
        ) {
          const list =
            groups.get(identityKey) || [];

          list.push(asset);
          groups.set(identityKey, list);
        }
      }

      for (
        const rows of groups.values()
      ) {
        if (rows.length < 2) {
          continue;
        }

        const winner =
          newest(rows);

        const winnerId =
          cleanAssetId(winner?.id);

        for (const row of rows) {
          const rowId =
            cleanAssetId(row.id);

          if (
            !rowId ||
            rowId === winnerId
          ) {
            continue;
          }

          await assetsTable.update(
            rowId,
            {
              active: false,
              isDeleted: true,
              updatedAt: Date.now(),
              version:
                Math.max(
                  1,
                  Number(
                    row.version || 1,
                  ),
                ) + 1,
              synced:
                SYNC_STATUS_VALUE.PENDING,
              syncError: undefined,
              metadata: {
                ...(row.metadata || {}),
                repairedDuplicateOf:
                  winnerId,
              },
            },
          );

          repaired++;
        }
      }

      const currentAssets =
        await assetsTable.toArray();

      const ids =
        new Set(
          currentAssets
            .map((row: any) =>
              cleanAssetId(row.id),
            )
            .filter(Boolean),
        );

      const blobs = (
        await blobsTable.toArray()
      ).filter(
        (row: any) =>
          row.accountId === accountId,
      );

      for (const blob of blobs) {
        const assetId =
          cleanAssetId(blob.assetId);

        const blobId =
          numericBlobId(blob.id);

        if (
          blobId === undefined
        ) {
          continue;
        }

        if (
          !assetId ||
          !ids.has(assetId)
        ) {
          await blobsTable.delete(
            blobId,
          );

          repaired++;
        }
      }
    },
  );

  clearMediaObjectUrlCache();

  return {
    ...(
      await inspectMediaIntegrity(
        accountId,
      )
    ),
    repaired,
  };
}