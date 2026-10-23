"use client";
import { apiRequest } from "../../../lib/platformApi";

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
  policy: (schoolId: string, branchId: string) =>
    apiRequest<IdentityPolicy>(`/identity/policy?schoolId=${encode(schoolId)}&branchId=${encode(branchId)}`),
  savePolicy: (data: IdentityPolicy & {schoolId: string; branchId: string}) =>
    apiRequest<IdentityPolicy>("/identity/policy", {method:"POST",body:JSON.stringify(data)}),
  get: (p: IdentityTarget) =>
    apiRequest<IdentityCardResult>(`/identity/card?subjectType=${encode(p.subjectType)}&subjectId=${encode(p.subjectId)}&schoolId=${encode(p.schoolId)}&branchId=${encode(p.branchId)}`),
  issue: (p: IdentityTarget, replace = false) =>
    apiRequest<IdentityCardResult>("/identity/card/issue",{method:"POST",body:JSON.stringify({...p, replace})}),
  revoke: (p: IdentityTarget) =>
    apiRequest<{status:"revoked"}>("/identity/card/revoke",{method:"POST",body:JSON.stringify(p)}),
};
