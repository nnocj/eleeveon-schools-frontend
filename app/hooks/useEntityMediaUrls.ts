"use client";

/**
 * app/hooks/useEntityMediaUrls.ts
 * --------------------------------------------------------------------------
 * Resolves synchronized mediaAssets by permanent owner ID.
 */

import { useEffect, useMemo, useState } from "react";
import { resolveOwnerMediaUrl } from "../lib/media/mediaAssetUtils";

export type EntityMediaField = {
  fieldKey: string;
  mediaIdKey?: string;
  fallbackKey?: string;
};

export type EntityMediaUrls = Record<string, Record<string, string>>;

function cleanId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  return id || null;
}

function safeLegacyUrl(value: unknown): string {
  const text = String(value || "").trim();
  if (!text || text.startsWith("data:") || text.startsWith("blob:")) return "";
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fieldSignature],
  );

  const rowSignature = useMemo(
    () =>
      rows
        .map((row) =>
          [
            row.id,
            row.updatedAt,
            row.isDeleted,
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
          const ownerId = cleanId(row.id);
          if (!ownerId || row.isDeleted) return;

          const fieldUrls: Record<string, string> = {};

          await Promise.all(
            stableFields.map(async (field) => {
              const mediaIdKey = field.mediaIdKey || `${field.fieldKey}MediaId`;
              const fallbackKey = field.fallbackKey || field.fieldKey;
              const fallbackAssetId = cleanId(row[mediaIdKey]);

              const resolved = await resolveOwnerMediaUrl({
                accountId,
                ownerTable,
                ownerId,
                fieldKey: field.fieldKey,
                fallbackAssetId,
              }).catch(() => "");

              fieldUrls[field.fieldKey] =
                resolved || safeLegacyUrl(row[fallbackKey]);
            }),
          );

          next[ownerId] = fieldUrls;
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
