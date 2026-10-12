
"use client";

/**
 * app/select-role/page.tsx
 * ---------------------------------------------------------
 * ELEEVEON ROLE / WORKSPACE SELECTOR — NON-BLOCKING ENTRY
 * ---------------------------------------------------------
 * This page opens the authenticated role/workspace immediately after
 * the essential membership and appearance initialization.
 *
 * IMPORTANT:
 * - It intentionally DOES NOT download the whole workspace before routing.
 * - Role-wide background bootstrap must start from the destination portal
 *   (RolePortalShell), because window.location.replace destroys this page.
 * - The existing workspace-session storage contract is preserved.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useActiveMembership } from "../context/active-membership-context";
import { useTheme } from "../context/theme-context";
import {
  appearanceIdentityFor,
  appearanceIdentityMatches,
} from "../lib/theme/appearanceScope";
import {
  useWorkspaceDisplayNames,
  workspaceScopeLabel,
  workspaceDetailLabel,
} from "../lib/workspaces/useWorkspaceDisplayNames";
import {
  collectUserMemberships,
  getPortalPathByRole,
  type UserMembership,
} from "../lib/auth/roleRedirect";

type RoleTone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

type RoleView = {
  key: string;
  id: string;
  membership: UserMembership;
  role: string;
  label: string;
  icon: string;
  scope: string;
  detail: string;
  tone: RoleTone;
};

const MEMBERSHIP_BACKUP_KEY = "eleeveon_user_memberships";
const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";
const BRANDING_REFRESH_KEY = "eleeveon_branding_refresh_key";

function safeSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, value); } catch {}
  try { window.sessionStorage.setItem(key, value); } catch {}
}

function safeRemove(key: string) {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(key); } catch {}
  try { window.sessionStorage.removeItem(key); } catch {}
}

function safeJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;

  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(key);
  } catch {}

  if (!raw) {
    try {
      raw = window.sessionStorage.getItem(key);
    } catch {}
  }

  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function roleLabel(role: string) {
  if (role === "developer") return "Developer";
  if (role === "platform_team") return "Platform Team";
  if (role === "owner") return "Owner";
  if (role === "super_admin") return "Super Admin";
  if (role === "branch_admin") return "Branch Admin";
  if (role === "admin") return "School Admin";
  if (role === "accountant") return "Accountant";
  if (role === "teacher") return "Teacher";
  if (role === "student") return "Student";
  if (role === "parent") return "Parent";

  return String(role || "User").replaceAll("_", " ");
}

function roleIcon(role: string) {
  if (role === "developer") return "🛠️";
  if (role === "platform_team") return "🧩";
  if (role === "owner" || role === "super_admin") return "👑";
  if (role === "branch_admin") return "🏛️";
  if (role === "admin") return "🏫";
  if (role === "accountant") return "💰";
  if (role === "teacher") return "👨‍🏫";
  if (role === "student") return "🧑‍🎓";
  if (role === "parent") return "👨‍👩‍👧";

  return "👤";
}

function roleTone(role: string): RoleTone {
  if (role === "developer" || role === "platform_team") return "purple";
  if (role === "owner" || role === "super_admin") return "purple";
  if (role === "admin" || role === "branch_admin") return "blue";
  if (role === "accountant") return "green";
  if (role === "teacher") return "blue";
  if (role === "student") return "orange";
  return "gray";
}

function toPermanentId(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const parsed = String(value).trim();
  return parsed || null;
}

function firstPermanentId(...values: unknown[]): string | null {
  for (const value of values) {
    const parsed = toPermanentId(value);
    if (parsed) return parsed;
  }

  return null;
}

function normalizeSelectedMembership(
  membership: UserMembership
): UserMembership {
  const schoolId = firstPermanentId(
    membership.schoolId,
    membership.school?.id,
    membership.activeSchoolId,
    membership.contextSchoolId,
  );

  const branchId = firstPermanentId(
    membership.branchId,
    membership.schoolBranchId,
    membership.branch?.id,
    membership.activeBranchId,
    membership.contextBranchId,
  );

  const teacherId = firstPermanentId(
    membership.teacherId,
    membership.teacher?.id,
  );

  const studentId = firstPermanentId(
    membership.studentId,
    membership.student?.id,
  );

  const parentId = firstPermanentId(
    membership.parentId,
    membership.parent?.id,
  );

  return {
    ...membership,
    schoolId,
    branchId,
    schoolBranchId: branchId,
    teacherId,
    studentId,
    parentId,
    active: membership.active !== false,
  };
}

function membershipHasRequiredProfileId(
  membership: UserMembership
) {
  if (membership.role === "student") {
    return Boolean(membership.studentId);
  }

  if (membership.role === "teacher") {
    return Boolean(membership.teacherId);
  }

  if (membership.role === "parent") {
    return Boolean(membership.parentId);
  }

  return true;
}

function membershipKey(
  membership: UserMembership,
  fallback = "membership"
) {
  return String(
    membership.id ??
      `${membership.role}-${membership.schoolId ?? "account"}-${membership.branchId ?? "root"}-${
        membership.teacherId ??
        membership.studentId ??
        membership.parentId ??
        fallback
      }`,
  );
}

function safeName(value?: string | null) {
  return String(value || "").trim();
}

function collectStoredMemberships() {
  const stored = safeJson<UserMembership[]>(
    MEMBERSHIP_BACKUP_KEY
  );

  return Array.isArray(stored) ? stored : [];
}

function uniqueMemberships(
  memberships: UserMembership[]
) {
  const unique = new Map<string, UserMembership>();

  memberships
    .map(normalizeSelectedMembership)
    .filter((membership) => membership.active !== false)
    .filter(membershipHasRequiredProfileId)
    .forEach((membership, index) => {
      unique.set(
        membershipKey(membership, String(index)),
        membership
      );
    });

  return [...unique.values()];
}

function createBrandingRefreshKey({
  membershipId,
  role,
  schoolId,
  branchId,
}: {
  membershipId: string;
  role?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
}) {
  return [
    role || "role",
    membershipId || "membership",
    schoolId || "school-none",
    branchId || "branch-none",
    Date.now(),
  ].join("-");
}

function writeOpenedWorkspaceSession(
  membership: UserMembership
) {
  const normalized =
    normalizeSelectedMembership(membership);

  const id = membershipKey(normalized);

  safeSet(
    "activeMembership",
    JSON.stringify(normalized)
  );

  safeSet("activeMembershipId", id);
  safeSet("activeRole", normalized.role || "");

  const schoolId = toPermanentId(
    normalized.schoolId
  );

  const branchId = toPermanentId(
    normalized.branchId
  );

  const teacherId = toPermanentId(
    normalized.teacherId
  );

  const studentId = toPermanentId(
    normalized.studentId
  );

  const parentId = toPermanentId(
    normalized.parentId
  );

  const brandingRefreshKey =
    createBrandingRefreshKey({
      membershipId: id,
      role: normalized.role,
      schoolId,
      branchId,
    });

  safeSet(
    BRANDING_REFRESH_KEY,
    brandingRefreshKey
  );

  if (schoolId) {
    safeSet("activeSchoolId", schoolId);
  } else {
    safeRemove("activeSchoolId");
  }

  if (branchId) {
    safeSet("activeBranchId", branchId);
  } else {
    safeRemove("activeBranchId");
  }

  if (teacherId) {
    safeSet("activeTeacherId", teacherId);
  } else {
    safeRemove("activeTeacherId");
  }

  if (studentId) {
    safeSet("activeStudentId", studentId);
  } else {
    safeRemove("activeStudentId");
  }

  if (parentId) {
    safeSet("activeParentId", parentId);
  } else {
    safeRemove("activeParentId");
  }

  safeSet(
    OPEN_WORKSPACE_KEY,
    JSON.stringify({
      membership: normalized,
      membershipId: id,
      role: normalized.role,
      schoolId,
      branchId,
      teacherId,
      studentId,
      parentId,
      brandingRefreshKey,
      openedAt: Date.now(),
    }),
  );

  return normalized;
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: RoleTone;
}) {
  return (
    <span className={`ba-chip ${tone}`}>
      {children}
    </span>
  );
}

export default function SelectRolePage() {
  const router = useRouter();

  const {
    user,
    account,
    logout,
    loading,
    restoring,
    verifying,
    sessionVerified,
    authenticated,
  } = useAccount() as any;

  const {
    setActiveMembership,
    beginMembershipTransition,
    completeMembershipTransition,
    failMembershipTransition,
  } = useActiveMembership();

  const { applyForMembership } = useTheme();

  const [selectingId, setSelectingId] =
    useState<string | null>(null);

  const [openingError, setOpeningError] =
    useState<string | null>(null);

  const memberships = useMemo(() => {
    const merged = [
      ...collectUserMemberships(account),
      ...collectUserMemberships(user),
      ...collectStoredMemberships(),
    ];

    const unique = uniqueMemberships(merged);

    if (unique.length) {
      safeSet(
        MEMBERSHIP_BACKUP_KEY,
        JSON.stringify(unique)
      );
    }

    return unique;
  }, [account, user]);

  const workspaceNames =
    useWorkspaceDisplayNames(memberships);

  const roleRows = useMemo<RoleView[]>(
    () =>
      memberships.map((membership, index) => ({
        key: `${membershipKey(membership)}-${index}`,
        id: membershipKey(membership),
        membership,
        role: membership.role,
        label: roleLabel(membership.role),
        icon: roleIcon(membership.role),
        scope: workspaceScopeLabel(
          membership,
          workspaceNames
        ),
        detail: workspaceDetailLabel(
          membership,
          workspaceNames
        ),
        tone: roleTone(membership.role),
      })),
    [memberships, workspaceNames]
  );

  useEffect(() => {
    if (restoring || loading || verifying) {
      return;
    }

    if (
      sessionVerified &&
      (!authenticated || !user)
    ) {
      router.replace("/login");
    }
  }, [
    restoring,
    loading,
    verifying,
    sessionVerified,
    authenticated,
    user,
    router,
  ]);

  /**
   * -------------------------------------------------------
   * OPEN SELECTED WORKSPACE
   * -------------------------------------------------------
   * This function deliberately does not await the complete
   * workspace bootstrap.
   *
   * Only the essential membership and appearance initialization
   * is performed before portal entry.
   *
   * The destination portal is responsible for triggering
   * role-wide background synchronization.
   */
  const choose = async (
    membership: UserMembership
  ) => {
    if (selectingId) return;

    const normalized =
      normalizeSelectedMembership(membership);

    const id = membershipKey(normalized);

    if (!membershipHasRequiredProfileId(normalized)) {
      setOpeningError(
        "This membership is missing its linked profile ID. Please update the membership record."
      );
      return;
    }

    setSelectingId(id);
    setOpeningError(null);

    try {
      const openedMembership =
        writeOpenedWorkspaceSession(normalized);

      beginMembershipTransition(openedMembership);

      await setActiveMembership(openedMembership);

      /**
       * ThemeProvider already hydrates cached
       * settings when applyForMembership runs.
       *
       * Do not duplicate settings hydration here.
       */
      const applied =
        await applyForMembership(openedMembership);

      const expected = appearanceIdentityFor({
        role: openedMembership.role,
        accountId: openedMembership.accountId,
        schoolId: openedMembership.schoolId,
        branchId: openedMembership.branchId,
      });

      if (
        !applied ||
        !appearanceIdentityMatches(applied, expected)
      ) {
        throw new Error(
          "The selected role appearance could not be applied correctly."
        );
      }

      /**
       * Portal entry is no longer dependent on:
       *
       * bootstrapSelectedWorkspace()
       *
       * The RolePortalShell will need to start
       * background role synchronization after
       * navigation.
       */
      completeMembershipTransition();

      window.location.replace(
        getPortalPathByRole(openedMembership.role)
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to open the selected workspace.";

      console.error(
        "Failed to open selected workspace:",
        error
      );

      failMembershipTransition(message);

      setOpeningError(message);
      setSelectingId(null);
    }
  };

  const hasUsableCachedSession =
    Boolean(user && memberships.length);

  if (
    (restoring || loading) &&
    !hasUsableCachedSession
  ) {
    return (
      <State
        title="Opening roles..."
        text="Restoring your saved account memberships and workspaces."
      />
    );
  }

  if (!authenticated || !user) {
    return (
      <State
        title="Redirecting to login..."
        text="You must sign in before choosing a workspace."
      />
    );
  }

  if (
    !memberships.length &&
    sessionVerified &&
    !verifying
  ) {
    return (
      <main className="ba-page select-role-page">
        <style>{css}</style>

        <section className="ba-state">
          <div className="ba-empty-icon">👤</div>

          <h2>No role membership found</h2>

          <p>
            Your account is signed in, but no active school
            role membership has been assigned yet.
          </p>

          <button
            type="button"
            className="sr-logout-inline"
            onClick={logout}
          >
            Logout
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="ba-page select-role-page">
      <style>{css}</style>

      <section
        className="sr-shell"
        aria-label="Choose workspace role"
      >
        <section className="sr-compact-head">
          <div className="sr-head-icon">
            🔀
          </div>

          <div>
            <span>Choose Workspace</span>

            <strong>
              {safeName(account?.name) ||
                "Eleeveon Account"}
            </strong>

            <small>{user.email}</small>
          </div>
        </section>

        <section
          className="sr-summary-row"
          aria-label="Role summary"
        >
          <span>
            <b>{roleRows.length}</b>{" "}
            role{roleRows.length === 1 ? "" : "s"}
          </span>

          <span>
            <b>
              {
                new Set(
                  roleRows.map((row) => row.scope)
                ).size
              }
            </b>{" "}
            workspace
            {
              new Set(
                roleRows.map((row) => row.scope)
              ).size === 1
                ? ""
                : "s"
            }
          </span>
        </section>

        {openingError && (
          <div
            className="sr-error"
            role="alert"
          >
            <span>{openingError}</span>

            <button
              type="button"
              onClick={() => setOpeningError(null)}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        <section className="ba-list sr-role-list">
          {roleRows.map((row) => {
            const selecting =
              selectingId === row.id;

            return (
              <button
                key={row.key}
                type="button"
                className="student-row sr-role-row"
                onClick={() =>
                  void choose(row.membership)
                }
                disabled={Boolean(selectingId)}
                aria-busy={selecting}
              >
                <span
                  className={`sr-role-avatar ${row.tone}`}
                >
                  {row.icon}
                </span>

                <span className="student-main">
                  <strong>
                    {row.label}
                  </strong>

                  <small>
                    {row.scope}
                  </small>

                  <em>
                    {row.detail}
                  </em>
                </span>

                <span className="student-side">
                  <span
                    className={`status-dot-mini ${row.tone}`}
                    aria-label={`${row.label} role`}
                  />

                  <i>
                    {selecting ? "…" : "→"}
                  </i>
                </span>
              </button>
            );
          })}
        </section>

        <section className="sr-footer-actions">
          <Chip
            tone={verifying ? "orange" : "gray"}
          >
            {verifying
              ? "Updating access…"
              : "Signed in"}
          </Chip>

          <button
            type="button"
            onClick={logout}
          >
            Logout
          </button>
        </section>
      </section>
    </main>
  );
}

function State({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <main className="ba-page select-role-page">
      <style>{css}</style>

      <section className="ba-state">
        <div className="ba-spinner" />

        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

const css = `
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.ba-page {
  --ease: cubic-bezier(.2,.8,.2,1);

  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;

  display: grid;
  place-items: center;

  padding: calc(10px * var(--local-density-scale, 1));
  padding-bottom: max(32px, env(safe-area-inset-bottom));

  background:
    radial-gradient(
      circle at top left,
      color-mix(in srgb, var(--primary-color, #2563eb) 10%, transparent),
      transparent 30rem
    ),
    radial-gradient(
      circle at bottom right,
      color-mix(in srgb, var(--primary-color, #2563eb) 7%, transparent),
      transparent 28rem
    ),
    var(--bg, #f7f8fb);

  color: var(--text, #111827);

  font-family:
    var(
      --font-family,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif
    );

  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}

.ba-page *,
.ba-page *::before,
.ba-page *::after {
  box-sizing: border-box;
  min-width: 0;
}

.ba-page button {
  font: inherit;
  -webkit-tap-highlight-color: transparent;
}

.ba-state,
.sr-shell,
.student-row {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.ba-state {
  min-height: min(420px, calc(100dvh - 32px));
  width: min(520px, 100%);
  margin: 0 auto;

  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;

  padding: 22px;
  border-radius: 28px;
  text-align: center;
}

.ba-state h2 {
  margin: 0;
  color: var(--text, #111827);
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ba-state p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.ba-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;

  border: 4px solid
    color-mix(
      in srgb,
      var(--primary-color, #2563eb) 18%,
      transparent
    );

  border-top-color:
    var(--primary-color, #2563eb);

  animation: spin .8s linear infinite;
}

.ba-empty-icon {
  width: 54px;
  height: 54px;

  display: grid;
  place-items: center;

  border-radius: 20px;

  background:
    color-mix(
      in srgb,
      var(--primary-color, #2563eb) 11%,
      var(--surface, #fff)
    );

  font-size: 25px;
}

.sr-shell {
  width: min(760px, 100%);
  border-radius: 30px;
  padding: 10px;
  overflow: hidden;
}

.sr-compact-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 24px;

  background:
    color-mix(
      in srgb,
      var(--primary-color, #2563eb) 6%,
      transparent
    );
}

.sr-head-icon {
  width: 50px;
  height: 50px;

  display: grid;
  place-items: center;

  border-radius: 18px;
  background: var(--primary-color, #2563eb);
  color: #fff;
  font-size: 22px;

  box-shadow:
    0 12px 28px
    color-mix(
      in srgb,
      var(--primary-color, #2563eb) 22%,
      transparent
    );
}

.sr-compact-head span,
.sr-compact-head strong,
.sr-compact-head small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sr-compact-head span {
  color: var(--primary-color, #2563eb);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.sr-compact-head strong {
  margin-top: 2px;
  color: var(--text, #111827);
  font-size: clamp(18px, 5vw, 25px);
  font-weight: 1000;
  letter-spacing: -.05em;
  line-height: 1.05;
}

.sr-compact-head small {
  margin-top: 4px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.sr-summary-row {
  display: grid;
  grid-template-columns:
    repeat(2, minmax(0, 1fr));

  gap: 7px;
  margin-top: 8px;
}

.sr-summary-row span {
  display: block;
  min-height: 42px;
  padding: 9px 10px;
  border-radius: 17px;

  background:
    color-mix(
      in srgb,
      var(--muted, #64748b) 8%,
      transparent
    );

  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;

  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sr-summary-row b {
  color: var(--text, #111827);
  font-size: 14px;
  font-weight: 1000;
}

.ba-list {
  display: grid;
  gap: 7px;
  margin-top: 10px;
}

.student-row {
  width: 100%;

  display: grid;
  grid-template-columns:
    auto minmax(0,1fr) auto;

  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 22px;
  text-align: left;
  cursor: pointer;

  transition:
    transform .16s var(--ease),
    box-shadow .16s var(--ease),
    border-color .16s var(--ease);
}

.student-row:hover {
  transform: translateY(-1px);

  border-color:
    color-mix(
      in srgb,
      var(--primary-color, #2563eb) 24%,
      var(--border, rgba(0,0,0,.10))
    );

  box-shadow: 0 16px 34px rgba(15,23,42,.07);
}

.student-row:disabled {
  opacity: .66;
  cursor: not-allowed;
  transform: none;
}

.sr-role-avatar {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;

  display: grid;
  place-items: center;

  border-radius: 18px;
  font-size: 21px;

  box-shadow:
    0 12px 24px rgba(15,23,42,.10);
}

.sr-role-avatar.green {
  background: rgba(34,197,94,.12);
}

.sr-role-avatar.red {
  background: rgba(239,68,68,.12);
}

.sr-role-avatar.blue {
  background: rgba(59,130,246,.12);
}

.sr-role-avatar.gray {
  background:
    color-mix(
      in srgb,
      var(--muted,#64748b) 14%,
      transparent
    );
}

.sr-role-avatar.orange {
  background: rgba(245,158,11,.14);
}

.sr-role-avatar.purple {
  background: rgba(147,51,234,.12);
}

.student-main,
.student-main strong,
.student-main small,
.student-main em {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-main strong {
  color: var(--text,#111827);
  font-size: 14px;
  font-weight: 1000;
  letter-spacing: -.02em;
}

.student-main small {
  margin-top: 3px;
  color: var(--muted,#64748b);
  font-size: 12px;
  font-weight: 850;
  font-style: normal;
}

.student-main em {
  margin-top: 3px;

  color:
    color-mix(
      in srgb,
      var(--muted,#64748b) 86%,
      var(--text,#111827)
    );

  font-size: 11px;
  font-weight: 750;
  font-style: normal;
}

.student-side {
  display: grid;
  justify-items: end;
  gap: 6px;
  flex: 0 0 auto;
}

.student-side i {
  color: var(--muted,#64748b);
  font-style: normal;
  font-size: 18px;
  font-weight: 1000;
  line-height: 1;
}

.status-dot-mini {
  width: 10px;
  height: 10px;
  display: inline-block;
  border-radius: 999px;

  background: var(--muted,#64748b);

  box-shadow:
    0 0 0 4px
    color-mix(
      in srgb,
      currentColor 10%,
      transparent
    );
}

.status-dot-mini.green {
  background: #22c55e;
}

.status-dot-mini.red {
  background: #ef4444;
}

.status-dot-mini.blue {
  background: #3b82f6;
}

.status-dot-mini.orange {
  background: #f59e0b;
}

.status-dot-mini.gray {
  background: var(--muted,#64748b);
}

.status-dot-mini.purple {
  background: #9333ea;
}

.ba-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 24px;

  padding: 3px 8px;
  border-radius: 999px;

  font-size: 10px;
  font-weight: 950;

  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
}

.ba-chip.green {
  background: rgba(34,197,94,.12);
  color: #16a34a;
}

.ba-chip.red {
  background: rgba(239,68,68,.12);
  color: #dc2626;
}

.ba-chip.blue {
  background: rgba(59,130,246,.12);
  color: #2563eb;
}

.ba-chip.gray {
  background:
    color-mix(
      in srgb,
      var(--muted,#64748b) 14%,
      transparent
    );

  color: var(--muted,#64748b);
}

.ba-chip.orange {
  background: rgba(245,158,11,.14);
  color: #b45309;
}

.ba-chip.purple {
  background: rgba(147,51,234,.12);
  color: #7e22ce;
}

.sr-footer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 2px 0;
}

.sr-footer-actions button,
.sr-logout-inline {
  min-height: 38px;

  border: 1px solid rgba(239,68,68,.20);
  border-radius: 999px;

  padding: 0 14px;

  background: rgba(239,68,68,.10);
  color: #dc2626;

  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.sr-logout-inline {
  margin-top: 8px;
}

/**
 * NON-BLOCKING ENTRY ERROR DISPLAY
 */
.sr-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 16px;

  border: 1px solid rgba(220,38,38,.25);
  background: rgba(220,38,38,.08);

  color: var(--text, #111827);
  font-size: 12px;
  line-height: 1.5;
}

.sr-error button {
  border: 0;
  background: none;
  color: #dc2626;
  cursor: pointer;
  font-size: 20px;
}

@media (min-width: 720px) {
  .ba-page {
    padding:
      calc(14px * var(--local-density-scale, 1));
  }

  .sr-shell {
    padding: 12px;
  }
}

@media (max-width: 520px) {
  .sr-shell {
    border-radius: 24px;
    padding: 8px;
  }

  .sr-compact-head {
    align-items: start;
  }

  .student-row {
    border-radius: 20px;
  }
}
`;
