import type { EffectiveAccessSource, EntitlementStatus, FeatureKey, LicenseModel, DeploymentMode, SyncPolicy, UpdatePolicy, ResourceLimitKey, LocalAccountEntitlement } from './commercial-access.types';
import { allowLocalAction, canUseFeature, deriveStatus, normalizeDeployment, normalizeSyncPolicy, type AccessAction } from '../../commercial/accessRules';
export interface EffectiveAccessSnapshot {
  accountId:string; source:EffectiveAccessSource; status:EntitlementStatus;
  licenseModel:LicenseModel; deploymentMode:DeploymentMode; syncPolicy:SyncPolicy; updatePolicy:UpdatePolicy;
  entitledVersion?:string|null; featureFlags:Record<string,boolean>; limits:Record<string,number|null>;
  validUntil?:string|null; graceEndsAt?:string|null; version:number;
  can(feature:FeatureKey):boolean; limit(resource:ResourceLimitKey):number|null;
  allows(action:AccessAction):boolean;
}
export function createEffectiveAccess(entitlement:LocalAccountEntitlement):EffectiveAccessSnapshot {
  const featureFlags={...entitlement.featureFlags}; const limits={...entitlement.limits};
  const state=()=>deriveStatus(entitlement);
  const status=state();
  return {
    accountId:entitlement.accountId, source:entitlement.source,
    status:(status==='unknown'?'expired':status) as EntitlementStatus,
    licenseModel:entitlement.licenseModel, deploymentMode:normalizeDeployment(entitlement.deploymentMode),
    syncPolicy:normalizeSyncPolicy(entitlement.syncPolicy), updatePolicy:entitlement.updatePolicy, entitledVersion:entitlement.entitledVersion,
    featureFlags,limits,validUntil:entitlement.validUntil,graceEndsAt:entitlement.graceEndsAt,version:entitlement.version,
    can(feature){return canUseFeature(state(),featureFlags,feature);},
    allows(action){return allowLocalAction(state(),action);},
    limit(resource){const value=limits[resource]; return typeof value==='number' && Number.isFinite(value)?value:null;},
  };
}
export function createNoAccess(accountId:string):EffectiveAccessSnapshot {
  return createEffectiveAccess({id:`no-access:${accountId}`,accountId,source:'trial',status:'expired',licenseModel:'trial',
    deploymentMode:'offline',syncPolicy:'disabled',updatePolicy:'version_locked',featureFlags:{},limits:{},version:0,rebuiltAt:new Date(0).toISOString()});
}
