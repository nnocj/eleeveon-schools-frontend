"use client";

/**
 * app/hooks/useEntityMediaUrls.ts
 * --------------------------------------------------------------------------
 * Resolves synchronized mediaAssets for a collection of local-first rows.
 *
 * This keeps entity pages small and ensures list cards/edit forms prefer:
 *   exact owner field -> remote URL -> local mediaBlob -> legacy URL fallback.
 */

import { useEffect, useMemo, useState } from "react";
import { resolveOwnerMediaUrl } from "../lib/media/mediaAssetUtils";

export type EntityMediaField = {
  fieldKey: string;
  mediaIdKey?: string;
  fallbackKey?: string;
};

export type EntityMediaUrls = Record<number, Record<string, string>>;

function localId(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function safeLegacyUrl(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("data:")) return "";
  if (text.startsWith("blob:")) return "";
  return text;
}

export function useEntityMediaUrls<T extends Record<string, any>>(input: {
  accountId?: string | null;
  ownerTable: string;
  rows: readonly T[];
  fields: readonly EntityMediaField[];
}) {
  const { accountId, ownerTable, rows, fields } = input;
  const [urls, setUrls] = useState<EntityMediaUrls>({});

  const fieldSignature = fields
    .map((field) =>
      [field.fieldKey, field.mediaIdKey || "", field.fallbackKey || ""].join(":"),
    )
    .join("|");

  const stableFields = useMemo(
    () => fields.map((field) => ({ ...field })),
    // The caller may create the fields array inline; the semantic signature is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fieldSignature],
  );

  const rowSignature = useMemo(
    () =>
      rows
        .map((row) =>
          [
            row.id,
            row.cloudId,
            row.updatedAt,
            ...stableFields.flatMap((field) => [
              row[field.mediaIdKey || `${field.fieldKey}MediaId`],
              row[field.fallbackKey || field.fieldKey],
            ]),
          ].join(":"),
        )
        .join("|"),
    [rows, stableFields],
  );

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      if (!accountId || !rows.length) {
        if (!cancelled) setUrls({});
        return;
      }

      const next: EntityMediaUrls = {};

      await Promise.all(
        rows.map(async (row) => {
          const id = localId(row.id);
          if (!id || row.isDeleted) return;

          const fieldUrls: Record<string, string> = {};

          await Promise.all(
            stableFields.map(async (field) => {
              const mediaIdKey = field.mediaIdKey || `${field.fieldKey}MediaId`;
              const fallbackKey = field.fallbackKey || field.fieldKey;

              const resolved = await resolveOwnerMediaUrl({
                accountId,
                ownerTable,
                ownerLocalId: id,
                ownerCloudId: row.cloudId || undefined,
                fieldKey: field.fieldKey,
                fallbackAssetId: row[mediaIdKey],
              }).catch(() => "");

              fieldUrls[field.fieldKey] =
                resolved || safeLegacyUrl(row[fallbackKey]);
            }),
          );

          next[id] = fieldUrls;
        }),
      );

      if (!cancelled) setUrls(next);
    };

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [accountId, ownerTable, rowSignature, stableFields, rows]);

  return urls;
}

export default useEntityMediaUrls;