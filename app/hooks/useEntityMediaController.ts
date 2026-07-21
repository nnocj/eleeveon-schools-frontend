"use client";

/**
 * app/hooks/useEntityMediaController.ts
 * --------------------------------------------------------------------------
 * Shared media lifecycle using permanent string owner and asset IDs.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  commitMediaAssetsToOwner,
  revokeMediaObjectUrl,
  saveImageAsset,
  softDeleteOwnerFieldAssets,
  type MediaVariant,
  type SavedMediaAssetResult,
} from "../lib/media/mediaAssetUtils";

import { useBranchWorkspaceScope } from "./useBranchWorkspaceScope";

export type EntityMediaFieldConfig = {
  fieldKey: string;
  variant?: MediaVariant;
  allowMultiple?: boolean;
  replaceExisting?: boolean;
  altText?: string;
};

export type EntityMediaDraft = {
  assetId: string;
  previewUrl: string;
  result: SavedMediaAssetResult;
};

export type EntityMediaCommitItem = {
  fieldKey: string;
  assetId?: string | null;
  allowMultiple?: boolean;
};

export type EntityMediaOwner = {
  ownerTable: string;
  ownerId?: string | null;
  ownerTempKey?: string | null;
};

function cleanId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  return id || null;
}

function createTempKey(ownerTable: string): string {
  return `media-${ownerTable}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

export function useEntityMediaController(ownerTable: string) {
  const { accountId, schoolId, branchId } = useBranchWorkspaceScope();
  const [drafts, setDrafts] = useState<Record<string, EntityMediaDraft>>({});
  const [busyField, setBusyField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tempKeyRef = useRef(createTempKey(ownerTable));
  const previewUrlsRef = useRef(new Set<string>());

  const rememberPreview = useCallback((url?: string) => {
    if (url?.startsWith("blob:")) previewUrlsRef.current.add(url);
  }, []);

  const releasePreview = useCallback((url?: string) => {
    if (!url) return;
    revokeMediaObjectUrl(url);
    previewUrlsRef.current.delete(url);
  }, []);

  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current) revokeMediaObjectUrl(url);
      previewUrlsRef.current.clear();
    };
  }, []);

  const prepareImage = useCallback(
    async (
      file: File,
      config: EntityMediaFieldConfig,
      owner?: Omit<EntityMediaOwner, "ownerTable">,
    ) => {
      if (!accountId) {
        throw new Error("An active account is required before saving media.");
      }

      setBusyField(config.fieldKey);
      setError(null);

      try {
        const previous = drafts[config.fieldKey];
        const result = await saveImageAsset(file, {
          accountId,
          schoolId,
          branchId,
          ownerTable: ownerTable as any,
          ownerId: cleanId(owner?.ownerId),
          ownerTempKey: cleanId(owner?.ownerTempKey) || tempKeyRef.current,
          fieldKey: config.fieldKey,
          variant: config.variant,
          altText: config.altText,
          replaceExisting: config.replaceExisting ?? !config.allowMultiple,
        });

        if (previous?.previewUrl) releasePreview(previous.previewUrl);
        rememberPreview(result.previewUrl);

        const draft: EntityMediaDraft = {
          assetId: result.assetId,
          previewUrl: result.previewUrl,
          result,
        };

        setDrafts((current) => ({ ...current, [config.fieldKey]: draft }));
        return draft;
      } catch (cause: any) {
        const message = cause?.message || "The image could not be prepared.";
        setError(message);
        throw cause;
      } finally {
        setBusyField(null);
      }
    },
    [
      accountId,
      schoolId,
      branchId,
      ownerTable,
      drafts,
      rememberPreview,
      releasePreview,
    ],
  );

  const commit = useCallback(
    async (
      owner: Omit<EntityMediaOwner, "ownerTable">,
      items: readonly EntityMediaCommitItem[],
    ) => {
      if (!accountId) {
        throw new Error("An active account is required before committing media.");
      }

      const ownerId = cleanId(owner.ownerId);
      if (!ownerId) {
        throw new Error("The owner record must have a permanent ID before media can be committed.");
      }

      setError(null);

      const assets = items
        .map((item) => ({
          fieldKey: item.fieldKey,
          assetId: cleanId(item.assetId ?? drafts[item.fieldKey]?.assetId),
          allowMultiple: item.allowMultiple,
        }))
        .filter(
          (item): item is {
            fieldKey: string;
            assetId: string;
            allowMultiple: boolean | undefined;
          } => Boolean(item.assetId),
        );

      if (!assets.length) return [];

      try {
        return await commitMediaAssetsToOwner({
          accountId,
          ownerTable,
          ownerId,
          ownerTempKey: cleanId(owner.ownerTempKey) || tempKeyRef.current,
          assets,
        });
      } catch (cause: any) {
        const message = cause?.message || "The media could not be attached to the saved record.";
        setError(message);
        throw cause;
      }
    },
    [accountId, ownerTable, drafts],
  );

  const remove = useCallback(
    async (
      fieldKey: string,
      owner: Omit<EntityMediaOwner, "ownerTable">,
      excludeAssetIds?: Array<string | null | undefined>,
    ) => {
      if (!accountId) return;

      setBusyField(fieldKey);
      setError(null);

      try {
        await softDeleteOwnerFieldAssets({
          accountId,
          ownerTable,
          ownerId: cleanId(owner.ownerId),
          ownerTempKey: cleanId(owner.ownerTempKey) || tempKeyRef.current,
          fieldKey,
          excludeAssetIds,
        });

        const draft = drafts[fieldKey];
        if (draft?.previewUrl) releasePreview(draft.previewUrl);

        setDrafts((current) => {
          const next = { ...current };
          delete next[fieldKey];
          return next;
        });
      } catch (cause: any) {
        const message = cause?.message || "The media could not be removed.";
        setError(message);
        throw cause;
      } finally {
        setBusyField(null);
      }
    },
    [accountId, ownerTable, drafts, releasePreview],
  );

  const clearDraft = useCallback(
    (fieldKey: string) => {
      const draft = drafts[fieldKey];
      if (draft?.previewUrl) releasePreview(draft.previewUrl);

      setDrafts((current) => {
        const next = { ...current };
        delete next[fieldKey];
        return next;
      });
    },
    [drafts, releasePreview],
  );

  const reset = useCallback(() => {
    for (const draft of Object.values(drafts)) releasePreview(draft.previewUrl);
    setDrafts({});
    setError(null);
    setBusyField(null);
    tempKeyRef.current = createTempKey(ownerTable);
  }, [drafts, ownerTable, releasePreview]);

  return useMemo(
    () => ({
      accountId,
      schoolId,
      branchId,
      ownerTable,
      ownerTempKey: tempKeyRef.current,
      drafts,
      busyField,
      error,
      prepareImage,
      commit,
      remove,
      clearDraft,
      reset,
      setError,
    }),
    [
      accountId,
      schoolId,
      branchId,
      ownerTable,
      drafts,
      busyField,
      error,
      prepareImage,
      commit,
      remove,
      clearDraft,
      reset,
    ],
  );
}

export default useEntityMediaController;
