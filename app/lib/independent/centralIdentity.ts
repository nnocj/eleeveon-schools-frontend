'use client';
import { getAuthToken, getApiBaseUrl } from '../api/apiClient';
import { renewAccessToken } from '../auth/renewAccessToken';
import type { OfflineLicenseClaims } from './offlineLicense';

export type VerifiedIndependentMember = {
  id: string;
  accountId: string;
  fullName: string;
  email: string;
  role: 'owner' | 'branch_admin' | 'teacher';
  membershipId: string;
  schoolId: string | null;
  branchId: string | null;
  teacherId: string | null;
};
/** Only server-confirmed active memberships are accepted. Never trust cached local role strings. */
export async function verifyCentralIndependentMember(license: OfflineLicenseClaims): Promise<VerifiedIndependentMember> {
  let token = getAuthToken();
  if (!token) token = await renewAccessToken(getApiBaseUrl());
  if (!token) throw new Error('Sign in with your Eleeveon account while online.');
  const request = (t: string) => fetch(`${getApiBaseUrl()}/auth/me`, {
    headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' },
    credentials: 'include', cache: 'no-store',
  });
  let response = await request(token);
  if (response.status === 401) {
    const renewed = await renewAccessToken(getApiBaseUrl());
    if (renewed) response = await request(renewed);
  }
  if (!response.ok) throw new Error('Unable to verify your current account permissions.');
  const result = await response.json();
  const user = result?.user;
  if (!user || String(user.accountId) !== String(license.accountId) || !user.active && user.active !== undefined)
    throw new Error('This Independent installation belongs to a different or inactive account.');
  const memberships: any[] = result.memberships || user.memberships || [];
  const active = memberships.filter(m => m && m.active !== false && m.status === 'active' && String(m.accountId) === String(license.accountId));
  const selected = active.find(m => m.role === 'super_admin' || m.role === 'owner') ||
    active.find(m => m.role === 'branch_admin') || active.find(m => m.role === 'teacher' && m.teacherId);
  if (!selected) throw new Error('No authorized Independent membership exists for this user.');
  const role = selected.role === 'super_admin' || selected.role === 'owner' ? 'owner' : selected.role;
  return { id: String(user.id), accountId: String(user.accountId),
    fullName: String(user.fullName || user.email || ''), email: String(user.email || ''),
    role, membershipId: String(selected.id), schoolId: selected.schoolId || null,
    branchId: selected.branchId || null, teacherId: selected.teacherId || null };
}
