import type { OfflineGrant } from './verifyOfflineGrant';
import type { UserMembership } from './roleRedirect';

/**
 * A pure, fail-closed bridge between a SIGNATURE-VERIFIED offline grant and the
 * shared membership provider. Do not call with decoded/unverified JWT payloads.
 * Does not create a LocalSession, modify a database, or grant network access.
 */
export function membershipFromVerifiedIndependentGrant(
  grant: OfflineGrant,
  expected: { accountId: string; userId: string; licenseId: string; installationId: string },
): UserMembership {
  if (!grant || grant.typ !== 'eleeveon.offline-grant.v1') throw new Error('Offline authorization missing');
  if (!expected.accountId || !expected.userId || !expected.licenseId || !expected.installationId ||
      grant.accountId !== expected.accountId || grant.userId !== expected.userId ||
      grant.licenseId !== expected.licenseId || grant.installationId !== expected.installationId) {
    throw new Error('Offline authorization identity mismatch');
  }
  if (grant.edition !== 'independent_essentials' && grant.edition !== 'independent_multi_device') {
    throw new Error('Independent license required');
  }
  if (!grant.membershipId || !grant.permissionsRevision) throw new Error('Incomplete offline authorization');
  if (!['owner', 'branch_admin', 'teacher'].includes(grant.role)) throw new Error('Unsupported role');
  if (grant.role === 'teacher' && (grant.edition !== 'independent_multi_device' || !grant.teacherId)) {
    throw new Error('Teacher authorization not permitted');
  }
  if (grant.role !== 'owner' && (!grant.schoolId || !grant.branchId)) {
    throw new Error('Institution scope missing');
  }
  return {
    id: grant.membershipId,
    accountId: grant.accountId,
    role: grant.role === 'owner' ? 'super_admin' : grant.role,
    schoolId: grant.schoolId,
    branchId: grant.branchId,
    teacherId: grant.role === 'teacher' ? grant.teacherId : null,
    active: true,
  };
}
