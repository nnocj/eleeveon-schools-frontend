"use client";

/**
 * app/login/page.tsx
 * ---------------------------------------------------------
 * SECURE LOGIN PAGE
 * ---------------------------------------------------------
 *
 * Purpose:
 * - Login using the platform API client.
 * - Save auth token and accountId.
 * - Clear stale active membership before every new login.
 * - Normalize and save memberships.
 * - Store the chosen active membership BEFORE opening a portal.
 * - Support developer, owner, admin, branch_admin, accountant,
 *   teacher, student, and parent routing.
 */

import React, { useState } from "react";

import WorkspaceBootstrapScreen from "../components/WorkspaceBootstrapScreen";
import {
  bootstrapSelectedWorkspace,
  type WorkspaceBootstrapProgress,
} from "../lib/sync/workspaceBootstrap";
import { useRouter } from "next/navigation";

import { apiRequest, extractToken, saveAuthToken } from "../lib/platformApi";
import { setAccountId } from "../lib/sync/syncConfig";

import {
  clearStoredActiveMembership,
  setStoredActiveMembership,
} from "../lib/auth/activeMembership";

import {
  AppRole,
  getPortalPathByRole,
  getPortalPathForUser,
  normalizeRole,
  shouldChooseMembership,
  UserMembership,
} from "../lib/auth/roleRedirect";

// ======================================================
// TYPES
// ======================================================

type LoginUser = {
  id: string;
  accountId: string;
  email: string;
  role?: string | null;
  fullName?: string;
  name?: string;
  memberships?: UserMembership[];
  userMemberships?: UserMembership[];
  accountMemberships?: UserMembership[];
  schoolMemberships?: UserMembership[];
  roleMemberships?: UserMembership[];
  [key: string]: any;
};

type LoginAccount = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  currency?: string | null;
  status?: string;
  role?: string | null;
  memberships?: UserMembership[];
  userMemberships?: UserMembership[];
  accountMemberships?: UserMembership[];
  schoolMemberships?: UserMembership[];
  roleMemberships?: UserMembership[];
  subscription?: any;
  [key: string]: any;
} | null;

type LoginResponse = {
  token?: string;
  accessToken?: string;
  access_token?: string;
  user: LoginUser;
  memberships?: UserMembership[];
  userMemberships?: UserMembership[];
  accountMemberships?: UserMembership[];
  schoolMemberships?: UserMembership[];
  roleMemberships?: UserMembership[];
  account?: LoginAccount;
};

// ======================================================
// STORAGE KEYS
// ======================================================

const AUTH_USER_KEY = "eleeveon_auth_user";
const AUTH_ACCOUNT_KEY = "eleeveon_auth_account";
const ACCOUNT_USER_KEY = "eleeveon_account_user";
const ACCOUNT_INFO_KEY = "eleeveon_account_info";
const MEMBERSHIP_BACKUP_KEY = "eleeveon_user_memberships";

// ======================================================
// HELPERS
// ======================================================

function asArray<T = any>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

function stringIdOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = String(value).trim();
  return parsed || null;
}

function membershipIsActive(value: any) {
  if (!value) return false;
  if (value.active === false) return false;
  if (value.isActive === false) return false;
  if (value.disabled === true) return false;
  if (value.isDeleted === true) return false;

  const status = String(value.status || "").trim().toLowerCase();
  return !["inactive", "disabled", "deleted", "blocked", "suspended"].includes(status);
}

function normalizeMembershipForLogin(value: any): UserMembership | null {
  if (!membershipIsActive(value)) return null;

  const role = normalizeRole(
    value.role ||
      value.membershipRole ||
      value.portalRole ||
      value.userRole ||
      value.type,
  );

  if (!role) return null;

  const branchId = stringIdOrNull(
    value.branchId ||
      value.schoolBranchId ||
      value.branch?.id ||
      value.activeBranchId ||
      value.contextBranchId,
  );

  return {
    ...value,
    id: stringIdOrNull(value.id) || `membership-${role}-${Date.now()}`,
    role,
    schoolId: stringIdOrNull(
      value.schoolId ||
        value.school?.id ||
        value.activeSchoolId ||
        value.contextSchoolId,
    ),
    branchId,
    schoolBranchId: branchId,
    teacherId: stringIdOrNull(value.teacherId || value.teacher?.id),
    studentId: stringIdOrNull(value.studentId || value.student?.id),
    parentId: stringIdOrNull(value.parentId || value.parent?.id),
    active: true,
  };
}

function collectMemberships(res: LoginResponse): UserMembership[] {
  const raw = [
    res.memberships,
    res.userMemberships,
    res.accountMemberships,
    res.schoolMemberships,
    res.roleMemberships,
    res.user?.memberships,
    res.user?.userMemberships,
    res.user?.accountMemberships,
    res.user?.schoolMemberships,
    res.user?.roleMemberships,
    res.account?.memberships,
    res.account?.userMemberships,
    res.account?.accountMemberships,
    res.account?.schoolMemberships,
    res.account?.roleMemberships,
  ].flatMap((source) => asArray(source));

  const normalized = raw
    .map((membership) => normalizeMembershipForLogin(membership))
    .filter(Boolean) as UserMembership[];

  const unique = new Map<string, UserMembership>();

  normalized.forEach((membership, index) => {
    const key =
      membership.id ||
      `${membership.role}-${membership.schoolId || "school"}-${
        membership.branchId || "branch"
      }-${
        membership.teacherId ||
        membership.studentId ||
        membership.parentId ||
        index
      }`;

    unique.set(String(key), membership);
  });

  return Array.from(unique.values());
}

function saveLoginContext(res: LoginResponse, memberships: UserMembership[]) {
  if (typeof window === "undefined") return;

  const normalizedRole = normalizeRole(res.user?.role) || res.user?.role || null;

  const userToStore = {
    ...res.user,
    role: normalizedRole,
    memberships,
    userMemberships: memberships,
  };

  const accountToStore = res.account
    ? {
        ...res.account,
        role: normalizeRole(res.account.role) || res.account.role || normalizedRole,
        memberships,
        userMemberships: memberships,
      }
    : null;

  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userToStore));
  localStorage.setItem(AUTH_ACCOUNT_KEY, JSON.stringify(accountToStore));
  localStorage.setItem(ACCOUNT_USER_KEY, JSON.stringify(userToStore));
  localStorage.setItem(ACCOUNT_INFO_KEY, JSON.stringify(accountToStore));
  localStorage.setItem(MEMBERSHIP_BACKUP_KEY, JSON.stringify(memberships));

  sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(userToStore));
  sessionStorage.setItem(AUTH_ACCOUNT_KEY, JSON.stringify(accountToStore));
  sessionStorage.setItem(ACCOUNT_USER_KEY, JSON.stringify(userToStore));
  sessionStorage.setItem(ACCOUNT_INFO_KEY, JSON.stringify(accountToStore));
  sessionStorage.setItem(MEMBERSHIP_BACKUP_KEY, JSON.stringify(memberships));

  localStorage.setItem("user", JSON.stringify(userToStore));
  localStorage.setItem("account", JSON.stringify(accountToStore));

  if (normalizedRole) localStorage.setItem("activeRole", String(normalizedRole));
}

function chooseSingleMembershipForRole(
  role: AppRole | undefined,
  memberships: UserMembership[],
) {
  if (!memberships.length) return null;
  if (!role) return memberships[0];
  return memberships.find((membership) => membership.role === role) || memberships[0];
}

function createFallbackMembership(args: {
  role?: AppRole;
  user?: LoginUser;
}): UserMembership | null {
  if (!args.role) return null;

  const branchId = stringIdOrNull(
    args.user?.branchId ||
      args.user?.schoolBranchId ||
      args.user?.activeBranchId,
  );

  return {
    id: `direct-${args.role}-${args.user?.id || Date.now()}`,
    accountId: stringIdOrNull(args.user?.accountId),
    role: args.role,
    schoolId: stringIdOrNull(args.user?.schoolId || args.user?.activeSchoolId),
    branchId,
    schoolBranchId: branchId,
    teacherId: stringIdOrNull(args.user?.teacherId),
    studentId: stringIdOrNull(args.user?.studentId),
    parentId: stringIdOrNull(args.user?.parentId),
    active: true,
  };
}

function openPath(router: ReturnType<typeof useRouter>, path: string) {
  if (typeof window !== "undefined") {
    window.location.replace(path);
    return;
  }

  router.replace(path);
}

// ======================================================
// PAGE
// ======================================================

export default function LoginPage() {
  const router = useRouter();

  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [bootstrapProgress, setBootstrapProgress] =
    useState<WorkspaceBootstrapProgress | null>(null);
  const [bootstrapError, setBootstrapError] =
    useState<string | null>(null);
  const [pendingMembership, setPendingMembership] =
    useState<UserMembership | null>(null);

  const update = (patch: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const submit = async () => {
    if (loading) return;
    if (!form.email.trim()) return alert("Enter your email address");
    if (!form.password.trim()) return alert("Enter your password");

    try {
      setLoading(true);

      // Prevent old teacher/student/parent context from leaking into the new login.
      clearStoredActiveMembership();

      const res = await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          password: form.password,
        }),
      });

      const token = extractToken(res);

      if (!token) {
        console.error("Login response without token:", res);
        throw new Error("Login succeeded but no token was returned.");
      }

      if (!res.user?.accountId) {
        console.error("Login response without accountId:", res);
        throw new Error("Login succeeded but no account ID was returned.");
      }

      const memberships = collectMemberships(res);
      const role = normalizeRole(res.user.role);

      saveAuthToken(token);
      setAccountId(res.user.accountId);
      saveLoginContext(res, memberships);

      // Phase 21: do not begin the broad account pull here. The selected
      // workspace is bootstrapped first; ordinary sync continues afterward.

      // Developer does not need school/branch membership.
      if (role === "developer") {
        setStoredActiveMembership(
          createFallbackMembership({ role, user: res.user })
        );
        openPath(router, "/developer");
        return;
      }

      // Platform-team members do not need school/branch membership.
      if (role === "platform_team") {
        setStoredActiveMembership(
          createFallbackMembership({ role, user: res.user })
        );
        openPath(router, "/platform-team");
        return;
      }
      

      // Owner may have no school/branch membership yet because owner creates schools.
      if (role === "super_admin") {
        const ownerMembership =
          chooseSingleMembershipForRole(role, memberships) ||
          createFallbackMembership({ role, user: res.user });

        setStoredActiveMembership(ownerMembership);
        openPath(router, "/owner");
        return;
      }

      // Multiple memberships require the selection page.
      // Important: we do NOT set one active membership here because the user must choose.
      if (
        memberships.length > 1 ||
        shouldChooseMembership({
          role,
          memberships,
        })
      ) {
        openPath(router, "/select-role");
        return;
      }

      // Single membership users receive the same priority workspace bootstrap
      // as users who choose from Select Role.
      if (memberships.length === 1) {
        const membership = memberships[0];

        setStoredActiveMembership(membership);
        setPendingMembership(membership);
        setBootstrapError(null);

        try {
          await bootstrapSelectedWorkspace(
            membership,
            {
              allowCached: true,
              onProgress:
                setBootstrapProgress,
            },
          );

          openPath(
            router,
            getPortalPathByRole(
              membership.role,
            ),
          );
        } catch (error: any) {
          setBootstrapError(
            error?.message ||
              "Failed to prepare this workspace.",
          );
        }

        return;
      }

      // Direct-role fallback for users whose backend login response has role
      // but does not yet return a membership object.
      if (role) {
        const fallbackMembership = createFallbackMembership({
          role,
          user: res.user,
        });

        setStoredActiveMembership(fallbackMembership);

        openPath(
          router,
          getPortalPathForUser({
            role,
            memberships,
          })
        );
        return;
      }

      throw new Error(
        "Login succeeded, but no active membership or role was found."
      );
    } catch (error: any) {
      clearStoredActiveMembership();
      alert(error?.message || "Login failed");
      setLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !loading) submit();
  };

  const retryWorkspaceBootstrap =
    async () => {
      if (!pendingMembership) return;

      setBootstrapError(null);

      try {
        await bootstrapSelectedWorkspace(
          pendingMembership,
          {
            force: true,
            allowCached: true,
            onProgress:
              setBootstrapProgress,
          },
        );

        openPath(
          router,
          getPortalPathByRole(
            pendingMembership.role,
          ),
        );
      } catch (error: any) {
        setBootstrapError(
          error?.message ||
            "Failed to prepare this workspace.",
        );
      }
    };

  return (
    <main className="login-page">
      <style>{css}</style>

      {(bootstrapProgress || bootstrapError) && (
        <WorkspaceBootstrapScreen
          progress={bootstrapProgress}
          error={bootstrapError}
          onRetry={retryWorkspaceBootstrap}
          onCancel={() => {
            setBootstrapProgress(null);
            setBootstrapError(null);
            setPendingMembership(null);
            openPath(router, "/select-role");
          }}
        />
      )}

      <section className="login-card">
        <div className="login-badge">🔐</div>

        <h1>Login</h1>
        <p>Access your Eleeveon workspace.</p>

        <div className="login-grid">
          <input
            placeholder="Email"
            value={form.email}
            onChange={(event) => update({ email: event.target.value })}
            onKeyDown={handleKeyDown}
            autoComplete="email"
            inputMode="email"
            disabled={loading}
          />

          <div className="password-wrap">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={form.password}
              onChange={(event) => update({ password: event.target.value })}
              onKeyDown={handleKeyDown}
              autoComplete="current-password"
              disabled={loading}
            />

            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
              disabled={loading}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "🙈" : "👁"}
            </button>
          </div>

          <button type="button" onClick={submit} disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>

          <button
            type="button"
            className="ghost"
            onClick={() => router.push("/register")}
            disabled={loading}
          >
            Create new account
          </button>
        </div>
      </section>
    </main>
  );
}

const css = `
.login-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;
  display: grid;
  place-items: center;
  padding: 16px;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--primary-color, #2563eb) 18%, transparent), transparent 34%),
    var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
}

.login-page *,
.login-page *::before,
.login-page *::after {
  box-sizing: border-box;
}

.login-card {
  width: min(430px, 100%);
  border-radius: 28px;
  padding: 24px;
  background: var(--surface, #ffffff);
  border: 1px solid rgba(148, 163, 184, .24);
  box-shadow: 0 24px 70px rgba(15, 23, 42, .12);
  overflow: hidden;
}

.login-badge {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--primary-color, #2563eb) 13%, #fff);
  font-size: 26px;
}

.login-card h1 {
  margin: 16px 0 4px;
  font-size: clamp(28px, 9vw, 38px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.login-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.55;
}

.login-grid {
  display: grid;
  gap: 12px;
  margin-top: 20px;
}

.login-grid input,
.password-wrap input {
  width: 100%;
  min-height: 48px;
  border: 1px solid rgba(148, 163, 184, .28);
  border-radius: 16px;
  padding: 0 14px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  outline: none;
  font: inherit;
  font-weight: 750;
}

.login-grid input:disabled,
.password-wrap input:disabled {
  opacity: .72;
  cursor: not-allowed;
}

.password-wrap {
  position: relative;
  width: 100%;
  min-width: 0;
}

.password-wrap input {
  padding-right: 52px;
}

.password-toggle {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  min-height: 40px !important;
  border: 0 !important;
  border-radius: 14px !important;
  padding: 0 !important;
  background: rgba(148, 163, 184, .12) !important;
  color: var(--text, #0f172a) !important;
  display: grid;
  place-items: center;
  font-size: 17px;
  cursor: pointer;
}

.login-grid input:focus,
.password-wrap input:focus {
  border-color: color-mix(in srgb, var(--primary-color, #2563eb) 60%, rgba(148,163,184,.28));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary-color, #2563eb) 13%, transparent);
}

.login-grid button {
  min-height: 48px;
  border: 0;
  border-radius: 16px;
  padding: 0 16px;
  background: var(--primary-color, #2563eb);
  color: #fff;
  font: inherit;
  font-weight: 950;
  cursor: pointer;
}

.login-grid button:disabled {
  opacity: .58;
  cursor: not-allowed;
}

.login-grid button.ghost {
  border: 1px solid rgba(148, 163, 184, .24);
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
}

@media (max-width: 420px) {
  .login-page {
    padding: 10px;
  }

  .login-card {
    border-radius: 24px;
    padding: 18px;
  }

  .login-grid input,
  .login-grid button,
  .password-wrap input {
    min-height: 46px;
    border-radius: 15px;
  }

  .password-toggle {
    width: 38px;
    height: 38px;
    min-height: 38px !important;
    border-radius: 13px !important;
  }
}
`;