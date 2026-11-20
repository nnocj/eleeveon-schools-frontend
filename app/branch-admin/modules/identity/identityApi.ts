"use client";
import { apiRequest } from "../../../lib/platformApi";
import { isIndependentIdentity, localGetCard, localIssueCard, localRevokeCard, readLocalIdentityPolicy, saveLocalIdentityPolicy } from "../../../lib/identity/independentIdentity";
import { readVerifiedBrowserLicense } from "../../../lib/independent/browserLicense";
import { db } from "../../../lib/db/db";
async function independentForScope(schoolId:string,branchId:string) {
 const license=await readVerifiedBrowserLicense().catch(()=>null);
 if(!license)return null;
 const school=await db.schools.get(schoolId),branch=await db.branches.get(branchId);
 return school?.accountId===license.claims.accountId && branch?.accountId===license.claims.accountId && branch?.schoolId===schoolId ? license : null;
}

export type IdentitySubject = "student" | "teacher";
export type IssuanceMode = "automatic" | "manual" | "disabled";
export type IdentityPolicy = {
  studentMode: IssuanceMode;
  teacherMode: IssuanceMode;
  expiryMonths: number;
  showClassPublicly: boolean;
  showNamePublicly: boolean;
};
export type IdentityCardResult = {
  status: "not_issued" | "active" | "revoked" | "expired";
  issuedAt?: string;
  expiresAt?: string | null;
  version?: number;
  verificationUrl?: string;
};
export type IdentityTarget = {
  schoolId: string;
  branchId: string;
  subjectId: string;
  subjectType: IdentitySubject;
};
const encode = (value: string) => encodeURIComponent(String(value));
export const identityApi = {
  policy: async (schoolId: string, branchId: string) => {
    const license=await independentForScope(schoolId,branchId);
    if(license) return readLocalIdentityPolicy(license.claims.accountId,schoolId,branchId) as IdentityPolicy;
    return apiRequest<IdentityPolicy>(`/identity/policy?schoolId=${encode(schoolId)}&branchId=${encode(branchId)}`);
  },
  savePolicy: async (data: IdentityPolicy & {schoolId: string; branchId: string}) => {
    const license=await independentForScope(data.schoolId,data.branchId);
    if(license) return saveLocalIdentityPolicy(license.claims.accountId,data.schoolId,data.branchId,data) as IdentityPolicy;
    return apiRequest<IdentityPolicy>('/identity/policy',{method:'POST',body:JSON.stringify(data)});
  },
  get: async (p: IdentityTarget) => {
    const license=await independentForScope(p.schoolId,p.branchId);
    if(license) return localGetCard(p);
    return apiRequest<IdentityCardResult>(`/identity/card?subjectType=${encode(p.subjectType)}&subjectId=${encode(p.subjectId)}&schoolId=${encode(p.schoolId)}&branchId=${encode(p.branchId)}`);
  },
  issue: async (p: IdentityTarget, replace = false) => {
    const license=await independentForScope(p.schoolId,p.branchId);
    if(license) return localIssueCard(p,replace);
    return apiRequest<IdentityCardResult>('/identity/card/issue',{method:'POST',body:JSON.stringify({...p,replace})});
  },
  revoke: async (p: IdentityTarget) => {
    const license=await independentForScope(p.schoolId,p.branchId);
    if(license) return localRevokeCard(p);
    return apiRequest<{status:'revoked'}>('/identity/card/revoke',{method:'POST',body:JSON.stringify(p)});
  },
};
