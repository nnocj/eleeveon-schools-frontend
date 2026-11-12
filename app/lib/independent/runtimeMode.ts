/** Build-time Independent runtime designation. Never infer an Independent grant from localStorage. */
export type EleeveonRuntime = 'cloud' | 'independent_essentials' | 'independent_multi_device';
export const ELEEVEON_RUNTIME: EleeveonRuntime =
  process.env.NEXT_PUBLIC_ELEEVEON_RUNTIME === 'independent_essentials' ? 'independent_essentials' :
  process.env.NEXT_PUBLIC_ELEEVEON_RUNTIME === 'independent_multi_device' ? 'independent_multi_device' : 'cloud';
export const IS_INDEPENDENT_RUNTIME = ELEEVEON_RUNTIME !== 'cloud';
/** Does not grant access. Verify a locally held signed license and local user session separately. */
export function mayRunCloudBootstrap(): boolean { return !IS_INDEPENDENT_RUNTIME; }
