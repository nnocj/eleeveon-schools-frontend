"use client";
import React, { createContext, useContext } from "react";
import type { LocalSession } from "./localStaffAuth";
import type { OfflineLicenseClaims } from "./offlineLicense";

/** Explicit Independent host identity. Never infer local authorization from URL or localStorage. */
export type IndependentPortalIdentity = Readonly<{
  session: LocalSession;
  license: OfflineLicenseClaims;
}>;
const Context = createContext<IndependentPortalIdentity | null>(null);
export const IndependentPortalIdentityProvider = Context.Provider;
export function useIndependentPortalIdentity(): IndependentPortalIdentity | null {
  return useContext(Context);
}
