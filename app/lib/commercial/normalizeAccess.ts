import type { EffectiveAccessResponse, EffectiveAccessSnapshot, EntitlementUsage } from '../subscription/types';
import { deriveStatus, normalizeDeployment, normalizeSyncPolicy } from './accessRules';

type JsonRecord = Record<string,unknown>;
function record(value:unknown):JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function dateValue(value:unknown):string|null { if(value == null) return null; const d=new Date(String(value)); return Number.isNaN(d.valueOf()) ? null : d.toISOString(); }
/** Strip methods from Nest's EffectiveAccess object. A missing snapshot is an error,
 * not an implicit active entitlement. */
export function normalizeAccessResponse(raw:unknown):EffectiveAccessResponse {
  const root=record(raw), data=record(root.snapshot);
  if (!data.accountId || typeof data.accountId !== 'string') throw new Error('Entitlement response has no account-scoped snapshot.');
  const features=record(data.features ?? data.featureFlags);
  const limits=record(data.limits);
  const normalizedFeatures:Record<string,boolean>={};
  for(const [k,v] of Object.entries(features)) if(typeof v==='boolean') normalizedFeatures[k]=v;
  const normalizedLimits:Record<string,number|null>={};
  for(const [k,v] of Object.entries(limits)) if(v === null || (typeof v==='number' && Number.isFinite(v) && v >= 0)) normalizedLimits[k]=v as number|null;
  const status=deriveStatus({status:String(data.status??'unknown'), validUntil:data.validUntil, graceEndsAt:data.graceEndsAt});
  // Unknown/malformed state never becomes an active entitlement in the browser.
  const safeStatus=status==='unknown'?'expired':status;
  const snapshot:EffectiveAccessSnapshot={
    accountId:data.accountId, entitlementId:typeof data.entitlementId==='string'?data.entitlementId:undefined,
    source: typeof data.source==='string'?data.source as EffectiveAccessSnapshot['source']:'subscription',
    status:safeStatus, planId:typeof data.planId==='string'?data.planId:null,
    subscriptionId:typeof data.subscriptionId==='string'?data.subscriptionId:null,
    perpetualLicenseId:typeof data.perpetualLicenseId==='string'?data.perpetualLicenseId:null,
    licenseModel: (['subscription','perpetual','trial','complimentary'].includes(String(data.licenseModel))?data.licenseModel:'subscription') as EffectiveAccessSnapshot['licenseModel'],
    deploymentMode:normalizeDeployment(data.deploymentMode), syncPolicy:normalizeSyncPolicy(data.syncPolicy),
    updatePolicy:(['continuous','security_only','version_locked'].includes(String(data.updatePolicy))?data.updatePolicy:'version_locked') as EffectiveAccessSnapshot['updatePolicy'],
    entitledVersion:typeof data.entitledVersion==='string'?data.entitledVersion:null,
    validFrom:dateValue(data.validFrom), validUntil:dateValue(data.validUntil), graceEndsAt:dateValue(data.graceEndsAt),
    features:normalizedFeatures, limits:normalizedLimits, version:typeof data.version==='number'?data.version:0,
    schemaVersion:typeof data.schemaVersion==='number'?data.schemaVersion:1,
    rebuiltAt:dateValue(data.rebuiltAt)??new Date(0).toISOString(),
    sourceDetails:record(data.sourceDetails), metadata:record(data.metadata),
  };
  const usageRaw=record(root.usage);
  let usage:EntitlementUsage|undefined;
  if(Object.keys(usageRaw).length) {
    const result: Record<string,number|string|undefined>={};
    for(const [key,value] of Object.entries(usageRaw)) if(typeof value==='number' && Number.isFinite(value)) result[key]=value;
    for(const field of ['schools','branches','users','students','teachers','storageMb','apiCallsPerMonth']) if(typeof result[field]!=='number') result[field]=0;
    usage=result as unknown as EntitlementUsage;
  }
  return {snapshot,usage};
}
