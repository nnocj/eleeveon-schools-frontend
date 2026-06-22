"use client";

/**
 * accountUsers.tsx
 * ---------------------------------------------------------
 * REAL ACCOUNT USERS + SEPARATE MEMBERSHIP MANAGER
 * ---------------------------------------------------------
 *
 * Scope-aware + smart local linking:
 * - Owner / super_admin can assign across schools and branches.
 * - School admin / admin is limited to the selected school.
 * - Branch admin is locked to the active school branch.
 * - Accountant/admin/branch_admin need school/branch scope only.
 * - Teacher/student/parent memberships use selectors from local Dexie records.
 * - Manual local ID entry is kept only as an Advanced fallback.
 */

import React, { useEffect, useMemo, useState } from "react";

import { apiClient } from "../lib/api/apiClient";
import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";
import {
  db,
  Class,
  ClassSubject,
  ClassTeacher,
  Parent,
  Student,
  StudentEnrollment,
  StudentParent,
  Teacher,
  Assignment,
  Subject,
} from "../lib/db";

// ======================================================
// TYPES
// ======================================================

type RoleKey =
  | "super_admin"
  | "admin"
  | "branch_admin"
  | "teacher"
  | "student"
  | "parent"
  | "accountant";

type Membership = {
  id: string;
  accountId: string;
  userId: string;
  role: RoleKey | string;
  schoolId?: number | null;
  branchId?: number | null;
  teacherLocalId?: number | null;
  studentLocalId?: number | null;
  parentLocalId?: number | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type AccountUserRow = {
  id: string;
  accountId: string;
  fullName: string;
  email: string;
  phone?: string | null;
  role: RoleKey | string;
  active: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  memberships?: Membership[];
};

type AccessForm = {
  fullName?: string;
  email?: string;
  phone?: string;
  password?: string;
  userId?: string;
  role: RoleKey;
  schoolId: string;
  branchId: string;
  teacherLocalId: string;
  studentLocalId: string;
  parentLocalId: string;
  classId: string;
  advancedManualLink: boolean;
};

type CreateUserForm = Required<Pick<AccessForm, "fullName" | "email" | "phone" | "password">> &
  Omit<AccessForm, "fullName" | "email" | "phone" | "password" | "userId">;

type CreateMembershipForm = Required<Pick<AccessForm, "userId">> &
  Omit<AccessForm, "userId" | "fullName" | "email" | "phone" | "password">;

type AnySchool = {
  id?: number;
  localId?: number;
  name?: string;
  schoolName?: string;
  accountId?: string;
  isDeleted?: boolean;
};

type AnyBranch = {
  id?: number;
  localId?: number;
  accountId?: string;
  schoolId?: number;
  name?: string;
  branchName?: string;
  isDeleted?: boolean;
};

type LinkData = {
  teachers: Teacher[];
  students: Student[];
  parents: Parent[];
  studentParents: StudentParent[];
  classes: Class[];
  enrollments: StudentEnrollment[];
  assignments: Assignment[];
  classTeachers: ClassTeacher[];
  classSubjects: ClassSubject[];
  subjects: Subject[];
};

type Tone = "green" | "blue" | "purple" | "orange" | "gray" | "red";
type ViewMode = "users" | "memberships";

const ROLE_OPTIONS: { value: RoleKey; label: string; icon: string; tone: Tone }[] = [
  { value: "super_admin", label: "Owner / Super Admin", icon: "👑", tone: "purple" },
  { value: "admin", label: "School Admin", icon: "🏫", tone: "blue" },
  { value: "branch_admin", label: "Branch Admin", icon: "🏢", tone: "green" },
  { value: "teacher", label: "Teacher", icon: "👨‍🏫", tone: "orange" },
  { value: "student", label: "Student", icon: "🧑‍🎓", tone: "gray" },
  { value: "parent", label: "Parent", icon: "👨‍👩‍👧", tone: "blue" },
  { value: "accountant", label: "Accountant", icon: "💼", tone: "green" },
];

const emptyUserForm = (): CreateUserForm => ({
  fullName: "",
  email: "",
  phone: "",
  password: "",
  role: "branch_admin",
  schoolId: "",
  branchId: "",
  teacherLocalId: "",
  studentLocalId: "",
  parentLocalId: "",
  classId: "",
  advancedManualLink: false,
});

const emptyMembershipForm = (): CreateMembershipForm => ({
  userId: "",
  role: "branch_admin",
  schoolId: "",
  branchId: "",
  teacherLocalId: "",
  studentLocalId: "",
  parentLocalId: "",
  classId: "",
  advancedManualLink: false,
});

// ======================================================
// HELPERS
// ======================================================

function getSchoolId(school: AnySchool) {
  return Number(school.id ?? school.localId ?? 0);
}

function getSchoolName(school: AnySchool) {
  return school.name || school.schoolName || `School ${getSchoolId(school)}`;
}

function getBranchId(branch: AnyBranch) {
  return Number(branch.id ?? branch.localId ?? 0);
}

function getBranchName(branch: AnyBranch) {
  return branch.name || branch.branchName || `Branch ${getBranchId(branch)}`;
}

function getBranchSchoolId(branch: AnyBranch) {
  return Number(branch.schoolId ?? 0);
}

function getSchoolNameById(schools: AnySchool[], schoolId?: number | null) {
  if (!schoolId) return "No school";
  const found = schools.find((school) => getSchoolId(school) === Number(schoolId));
  return found ? getSchoolName(found) : `School ${schoolId}`;
}

function getBranchNameById(branches: AnyBranch[], branchId?: number | null) {
  if (!branchId) return "No branch";
  const found = branches.find((branch) => getBranchId(branch) === Number(branchId));
  return found ? getBranchName(found) : `Branch ${branchId}`;
}

function getUserNameById(users: AccountUserRow[], userId: string) {
  const found = users.find((row) => row.id === userId);
  return found ? found.fullName || found.email : "Unknown user";
}

function getUserEmailById(users: AccountUserRow[], userId: string) {
  const found = users.find((row) => row.id === userId);
  return found?.email || "";
}

function sameScope(row: { accountId?: string; schoolId?: number | string; branchId?: number | string; isDeleted?: boolean }, accountId?: string, schoolId?: string | number, branchId?: string | number) {
  return (
    String(row.accountId || "") === String(accountId || "") &&
    Number(row.schoolId || 0) === Number(schoolId || 0) &&
    Number(row.branchId || 0) === Number(branchId || 0) &&
    !row.isDeleted
  );
}

function displayTeacher(teacher: Teacher) {
  const extras = [teacher.email, teacher.phone].filter(Boolean).join(" · ");
  return `${teacher.fullName}${extras ? ` — ${extras}` : ""}`;
}

function displayStudent(student: Student) {
  const extras = [student.admissionNumber, student.parentName].filter(Boolean).join(" · ");
  return `${student.fullName}${extras ? ` — ${extras}` : ""}`;
}

function displayParent(parent: Parent) {
  const extras = [parent.phone, parent.email, parent.relationship].filter(Boolean).join(" · ");
  return `${parent.fullName}${extras ? ` — ${extras}` : ""}`;
}

function toOptionalNumber(value: string) {
  const clean = String(value || "").trim();
  return clean ? Number(clean) : undefined;
}

function normalizeDateValue(value?: string | null) {
  return value || undefined;
}

async function persistAccessRowsToLocalDb(rows: AccountUserRow[]) {
  const localDb = db as any;

  try {
    if (localDb.appUsers?.bulkPut) {
      await localDb.appUsers.bulkPut(
        rows.map((row) => ({
          id: row.id,
          accountId: row.accountId,
          fullName: row.fullName,
          email: row.email,
          phone: row.phone || undefined,
          role: row.role,
          active: row.active,
          lastLoginAt: normalizeDateValue(row.lastLoginAt),
          createdAt: normalizeDateValue(row.createdAt),
          updatedAt: normalizeDateValue(row.updatedAt),
        }))
      );
    }

    const memberships = rows.flatMap((row) => row.memberships || []);

    if (localDb.userMemberships?.bulkPut && memberships.length) {
      await localDb.userMemberships.bulkPut(
        memberships.map((membership) => ({
          id: membership.id,
          accountId: membership.accountId,
          userId: membership.userId,
          role: membership.role,
          schoolId: membership.schoolId ?? null,
          branchId: membership.branchId ?? null,
          teacherLocalId: membership.teacherLocalId ?? null,
          studentLocalId: membership.studentLocalId ?? null,
          parentLocalId: membership.parentLocalId ?? null,
          active: membership.active,
          createdAt: normalizeDateValue(membership.createdAt),
          updatedAt: normalizeDateValue(membership.updatedAt),
        }))
      );
    }
  } catch (error) {
    console.warn("Failed to persist users/memberships locally:", error);
  }
}

// ======================================================
// COMPONENT
// ======================================================

export default function AccountUsersPage() {
  const { accountId, authenticated, user, account, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeBranch,
    activeSchoolId,
    activeBranchId,
    schools,
    allBranches,
    loading: contextLoading,
  } = useActiveBranch();

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";
  const loadingBase = accountLoading || settingsLoading || contextLoading;

  const role = user?.role || "";
  const isOwner = role === "super_admin";
  const isSchoolAdmin = role === "admin";
  const isBranchAdmin = role === "branch_admin";
  const canManage = ["super_admin", "admin", "branch_admin"].includes(role);

  const schoolOptions = useMemo(() => {
    const rows = ((schools || []) as AnySchool[]).filter((row) => !row.isDeleted && getSchoolId(row));
    if (isOwner) return rows;
    if (activeSchoolId) return rows.filter((row) => getSchoolId(row) === Number(activeSchoolId));
    return [];
  }, [schools, isOwner, activeSchoolId]);

  const branchOptions = useMemo(() => {
    const rows = ((allBranches || []) as AnyBranch[]).filter((row) => !row.isDeleted && getBranchId(row));
    if (isOwner) return rows;
    if (isSchoolAdmin && activeSchoolId) return rows.filter((row) => getBranchSchoolId(row) === Number(activeSchoolId));
    if (isBranchAdmin && activeBranchId) return rows.filter((row) => getBranchId(row) === Number(activeBranchId));
    if (activeSchoolId) return rows.filter((row) => getBranchSchoolId(row) === Number(activeSchoolId));
    return [];
  }, [allBranches, isOwner, isSchoolAdmin, isBranchAdmin, activeSchoolId, activeBranchId]);

  const [viewMode, setViewMode] = useState<ViewMode>("users");
  const [users, setUsers] = useState<AccountUserRow[]>([]);
  const [linkData, setLinkData] = useState<LinkData>({
    teachers: [],
    students: [],
    parents: [],
    studentParents: [],
    classes: [],
    enrollments: [],
    assignments: [],
    classTeachers: [],
    classSubjects: [],
    subjects: [],
  });
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drawer, setDrawer] = useState<"user" | "membership" | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [createUserForm, setCreateUserForm] = useState<CreateUserForm>(emptyUserForm());
  const [membershipForm, setMembershipForm] = useState<CreateMembershipForm>(emptyMembershipForm());

  const loading = loadingBase || loadingUsers;

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const rows = await apiClient<AccountUserRow[]>("/accounts/users");
      const safeRows = rows || [];
      setUsers(safeRows);
      await persistAccessRowsToLocalDb(safeRows);
    } catch (error: any) {
      alert(error?.message || "Failed to load account users");
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadLinkData = async () => {
    try {
      const [teachers, students, parents, studentParents, classes, enrollments, assignments, classTeachers, classSubjects, subjects] = await Promise.all([
        db.teachers.toArray(),
        db.students.toArray(),
        db.parents.toArray(),
        db.studentParents.toArray(),
        db.classes.toArray(),
        db.studentEnrollments.toArray(),
        db.assignments.toArray(),
        db.classTeachers.toArray(),
        db.classSubjects.toArray(),
        db.subjects.toArray(),
      ]);

      setLinkData({ teachers, students, parents, studentParents, classes, enrollments, assignments, classTeachers, classSubjects, subjects });
    } catch (error) {
      console.error("Failed to load smart selector data:", error);
    }
  };

  useEffect(() => {
    if (authenticated && accountId) {
      loadUsers();
      loadLinkData();
    }
  }, [authenticated, accountId]);

  const memberships = useMemo(() => {
    return users.flatMap((row) =>
      (row.memberships || []).map((membership) => ({
        ...membership,
        userName: row.fullName,
        userEmail: row.email,
        userActive: row.active,
      }))
    );
  }, [users]);

  const summary = useMemo(() => {
    const active = users.filter((row) => row.active).length;
    const activeMemberships = memberships.filter((row) => row.active).length;

    return {
      total: users.length,
      active,
      inactive: users.length - active,
      memberships: memberships.length,
      activeMemberships,
      inactiveMemberships: memberships.length - activeMemberships,
    };
  }, [users, memberships]);

  const scopedDefault = () => ({
    schoolId: activeSchoolId ? String(activeSchoolId) : "",
    branchId: activeBranchId ? String(activeBranchId) : "",
  });

  const normalizeScopeForRole = <T extends CreateUserForm | CreateMembershipForm>(form: T): T => {
    const next = { ...form };

    if (form.role === "super_admin") {
      next.schoolId = "";
      next.branchId = "";
      return next;
    }

    if (!isOwner && activeSchoolId) next.schoolId = String(activeSchoolId);
    if (isBranchAdmin && activeBranchId) next.branchId = String(activeBranchId);

    return next;
  };

  const openCreateUser = () => {
    setCreateUserForm(normalizeScopeForRole({ ...emptyUserForm(), ...scopedDefault() }));
    setShowPassword(false);
    setDrawer("user");
  };

  const openCreateMembership = (targetUser?: AccountUserRow) => {
    setMembershipForm(normalizeScopeForRole({ ...emptyMembershipForm(), userId: targetUser?.id || "", ...scopedDefault() }));
    setDrawer("membership");
  };

  const payloadFromForm = (form: CreateUserForm | CreateMembershipForm) => ({
    role: form.role,
    schoolId: toOptionalNumber(form.schoolId),
    branchId: toOptionalNumber(form.branchId),
    teacherLocalId: form.role === "teacher" ? toOptionalNumber(form.teacherLocalId) : undefined,
    studentLocalId: form.role === "student" ? toOptionalNumber(form.studentLocalId) : undefined,
    parentLocalId: form.role === "parent" ? toOptionalNumber(form.parentLocalId) : undefined,
  });

  const validateRoleLink = (form: CreateUserForm | CreateMembershipForm) => {
    if (form.role !== "super_admin" && (!form.schoolId || !form.branchId)) {
      alert("School and branch are required for this role");
      return false;
    }

    if (form.role === "teacher" && !form.teacherLocalId) {
      alert("Select the teacher record to link this user to");
      return false;
    }

    if (form.role === "student" && !form.studentLocalId) {
      alert("Select a class and student record to link this user to");
      return false;
    }

    if (form.role === "parent" && !form.parentLocalId) {
      alert("Select the parent record to link this user to");
      return false;
    }

    return true;
  };

  const createUser = async () => {
    const form = normalizeScopeForRole(createUserForm);

    if (!form.fullName.trim()) return alert("Enter full name");
    if (!form.email.trim()) return alert("Enter email address");
    if (!form.password.trim() || form.password.length < 6) return alert("Password must be at least 6 characters");
    if (!validateRoleLink(form)) return;

    try {
      setSaving(true);

      await apiClient("/accounts/users", {
        method: "POST",
        body: {
          fullName: form.fullName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || undefined,
          password: form.password,
          ...payloadFromForm(form),
        },
      });

      setDrawer(null);
      setCreateUserForm(emptyUserForm());
      await loadUsers();
      setViewMode("users");
    } catch (error: any) {
      alert(error?.message || "Failed to create account user");
    } finally {
      setSaving(false);
    }
  };

  const createMembership = async () => {
    const form = normalizeScopeForRole(membershipForm);

    if (!form.userId) return alert("Select a user");
    if (!validateRoleLink(form)) return;

    try {
      setSaving(true);

      await apiClient("/memberships", {
        method: "POST",
        body: {
          userId: form.userId,
          ...payloadFromForm(form),
        },
      });

      setDrawer(null);
      setMembershipForm(emptyMembershipForm());
      await loadUsers();
      setViewMode("memberships");
    } catch (error: any) {
      alert(error?.message || "Failed to create membership");
    } finally {
      setSaving(false);
    }
  };

  const setUserStatus = async (target: AccountUserRow, active: boolean) => {
    const yes = window.confirm(`${active ? "Activate" : "Deactivate"} ${target.fullName}?`);
    if (!yes) return;

    try {
      await apiClient(`/accounts/users/${target.id}/status`, {
        method: "PATCH",
        body: { active },
      });

      await loadUsers();
    } catch (error: any) {
      alert(error?.message || "Failed to update user status");
    }
  };

  const setMembershipStatus = async (target: Membership, active: boolean) => {
    const owner = getUserNameById(users, target.userId);
    const yes = window.confirm(`${active ? "Activate" : "Deactivate"} this membership for ${owner}?`);
    if (!yes) return;

    try {
      await apiClient(`/memberships/${target.id}/status`, {
        method: "PATCH",
        body: { active },
      });

      await loadUsers();
    } catch (error: any) {
      alert(error?.message || "Failed to update membership status");
    }
  };

  if (loading) {
    return (
      <main className="au-page" style={{ "--au-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="au-state-card">
          <div className="au-spinner" />
          <h2>Opening account access...</h2>
          <p>Checking account access and loading users, memberships, and smart selectors.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="au-page" style={{ "--au-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="au-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before viewing account access.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="au-page" style={{ "--au-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="au-hero">
        <div className="au-hero-left">
          <div className="au-hero-icon">🛡️</div>
          <div className="au-title-wrap">
            <p>Access Control</p>
            <h2>Users & Memberships</h2>
            <span>Manage login users separately from role, scope, and local profile links.</span>
          </div>
        </div>

        <div className="au-action-row">
          <button type="button" className="au-secondary-btn" onClick={() => openCreateMembership()} disabled={!canManage}>
            + Membership
          </button>
          <button type="button" className="au-primary-btn" onClick={openCreateUser} disabled={!canManage}>
            + User
          </button>
        </div>
      </section>

      <section className="au-context-card">
        <div>
          <p>Current Workspace</p>
          <h3>{account?.name || "Account Workspace"}</h3>
          <span>{user?.email || user?.fullName || "Signed-in user"}</span>
        </div>

        <div className="au-pill-row">
          <Chip tone={isOwner ? "purple" : isSchoolAdmin ? "blue" : "green"}>
            {isOwner ? "Owner Scope" : isSchoolAdmin ? "School Admin Scope" : isBranchAdmin ? "Branch Admin Scope" : "Scoped"}
          </Chip>
          <Chip tone={activeSchoolId ? "green" : "orange"}>{activeSchool?.name || "No school selected"}</Chip>
          <Chip tone={activeBranchId ? "green" : "orange"}>{activeBranch?.name || "No branch selected"}</Chip>
        </div>
      </section>

      <section className="au-summary-grid" aria-label="Account access summary">
        <SummaryCard label="Users" value={summary.total} icon="👥" />
        <SummaryCard label="Active Users" value={summary.active} icon="✅" />
        <SummaryCard label="Memberships" value={summary.memberships} icon="🛡️" />
        <SummaryCard label="Active Memberships" value={summary.activeMemberships} icon="🔐" />
      </section>

      <section className="au-switch-card">
        <button type="button" className={viewMode === "users" ? "active" : ""} onClick={() => setViewMode("users")}>
          <span>👥</span>
          <b>Users</b>
          <small>Login accounts and active status</small>
        </button>

        <button type="button" className={viewMode === "memberships" ? "active" : ""} onClick={() => setViewMode("memberships")}>
          <span>🛡️</span>
          <b>Memberships</b>
          <small>Roles, scope, and smart local links</small>
        </button>
      </section>

      {viewMode === "users" ? (
        <section className="au-section-card">
          <div className="au-section-head with-action">
            <div>
              <p>Users Space</p>
              <h3>Manage login users</h3>
            </div>

            <div className="au-head-actions">
              <button type="button" className="light" onClick={() => { loadUsers(); loadLinkData(); }}>Refresh</button>
              <button type="button" onClick={openCreateUser} disabled={!canManage}>New User</button>
            </div>
          </div>

          <div className="au-users-list">
            {users.map((row) => (
              <article key={row.id} className="au-user-card only-users">
                <div className="au-user-main">
                  <div className="au-user-avatar">{initials(row.fullName || row.email)}</div>
                  <div>
                    <h4>{row.fullName}</h4>
                    <p>{row.email}</p>
                    <div className="au-chip-row">
                      <RoleChip role={row.role} />
                      <Chip tone={row.active ? "green" : "red"}>{row.active ? "Active" : "Inactive"}</Chip>
                      <Chip tone="blue">{row.memberships?.length || 0} memberships</Chip>
                      {row.lastLoginAt && <Chip tone="gray">Last login {new Date(row.lastLoginAt).toLocaleDateString()}</Chip>}
                    </div>
                  </div>
                </div>

                <div className="au-user-actions">
                  <button type="button" onClick={() => openCreateMembership(row)} disabled={!canManage}>Add Membership</button>
                  {row.active ? (
                    <button type="button" className="danger" onClick={() => setUserStatus(row, false)} disabled={!canManage}>Deactivate</button>
                  ) : (
                    <button type="button" onClick={() => setUserStatus(row, true)} disabled={!canManage}>Activate</button>
                  )}
                </div>
              </article>
            ))}

            {!users.length && (
              <section className="au-empty-users">
                <div>👥</div>
                <h3>No account users yet</h3>
                <p>Create admins, teachers, accountants, students, or parents for this account.</p>
                <button type="button" onClick={openCreateUser} disabled={!canManage}>Create First User</button>
              </section>
            )}
          </div>
        </section>
      ) : (
        <section className="au-section-card">
          <div className="au-section-head with-action">
            <div>
              <p>Memberships Space</p>
              <h3>Manage roles and access scope</h3>
            </div>

            <div className="au-head-actions">
              <button type="button" className="light" onClick={() => { loadUsers(); loadLinkData(); }}>Refresh</button>
              <button type="button" onClick={() => openCreateMembership()} disabled={!canManage || !users.length}>New Membership</button>
            </div>
          </div>

          <div className="au-membership-list">
            {memberships.map((membership) => (
              <article key={membership.id} className="au-membership-card">
                <div className="au-user-main">
                  <div className="au-user-avatar">{initials(getUserNameById(users, membership.userId))}</div>
                  <div>
                    <h4>{getUserNameById(users, membership.userId)}</h4>
                    <p>{getUserEmailById(users, membership.userId)}</p>
                    <div className="au-chip-row">
                      <RoleChip role={membership.role} />
                      <Chip tone={membership.active ? "green" : "red"}>{membership.active ? "Active" : "Inactive"}</Chip>
                    </div>
                  </div>
                </div>

                <div className="au-membership-detail-grid">
                  <InfoBlock label="School" value={membership.role === "super_admin" ? "All schools" : getSchoolNameById(schoolOptions, membership.schoolId)} />
                  <InfoBlock label="Branch" value={membership.role === "super_admin" ? "All branches" : getBranchNameById(branchOptions, membership.branchId)} />
                  {membership.teacherLocalId ? <InfoBlock label="Teacher" value={getTeacherName(linkData.teachers, membership.teacherLocalId)} /> : null}
                  {membership.studentLocalId ? <InfoBlock label="Student" value={getStudentName(linkData.students, membership.studentLocalId)} /> : null}
                  {membership.parentLocalId ? <InfoBlock label="Parent" value={getParentName(linkData.parents, membership.parentLocalId)} /> : null}
                </div>

                <div className="au-user-actions">
                  {membership.active ? (
                    <button type="button" className="danger" onClick={() => setMembershipStatus(membership, false)} disabled={!canManage}>Deactivate</button>
                  ) : (
                    <button type="button" onClick={() => setMembershipStatus(membership, true)} disabled={!canManage}>Activate</button>
                  )}
                </div>
              </article>
            ))}

            {!memberships.length && (
              <section className="au-empty-users">
                <div>🛡️</div>
                <h3>No memberships yet</h3>
                <p>Create users first, then assign roles, scope, and smart profile links here.</p>
                <button type="button" onClick={() => openCreateMembership()} disabled={!canManage || !users.length}>Create Membership</button>
              </section>
            )}
          </div>
        </section>
      )}

      {drawer && (
        <div className="au-drawer-layer">
          <button className="au-drawer-overlay" onClick={() => setDrawer(null)} aria-label="Close drawer" />

          <aside className="au-drawer">
            <div className="au-drawer-head">
              <div>
                <p>{drawer === "user" ? "Users Space" : "Memberships Space"}</p>
                <h2>{drawer === "user" ? "Create User" : "Assign Membership"}</h2>
                <span>{drawer === "user" ? "Create the login identity and its first scoped membership." : "Assign role, school/branch scope, and local profile link."}</span>
              </div>

              <button type="button" onClick={() => setDrawer(null)}>✕</button>
            </div>

            {drawer === "user" ? (
              <div className="au-form-grid">
                <Field label="Full Name"><input value={createUserForm.fullName} onChange={(e) => setCreateUserForm((p) => ({ ...p, fullName: e.target.value }))} /></Field>
                <Field label="Email"><input value={createUserForm.email} onChange={(e) => setCreateUserForm((p) => ({ ...p, email: e.target.value }))} /></Field>
                <Field label="Phone"><input value={createUserForm.phone} onChange={(e) => setCreateUserForm((p) => ({ ...p, phone: e.target.value }))} /></Field>

                <Field label="Temporary Password">
                  <div className="au-password-wrap">
                    <input type={showPassword ? "text" : "password"} value={createUserForm.password} onChange={(e) => setCreateUserForm((p) => ({ ...p, password: e.target.value }))} />
                    <button type="button" onClick={() => setShowPassword((p) => !p)}>{showPassword ? "🙈" : "👁"}</button>
                  </div>
                </Field>

                <section className="au-info-box">This creates the user login. The selected role below creates the first membership and profile link.</section>

                <Field label="First Membership Role">
                  <RoleSelect
                    value={createUserForm.role}
                    onChange={(role) => setCreateUserForm((p) => normalizeScopeForRole({ ...p, role, teacherLocalId: "", studentLocalId: "", parentLocalId: "", classId: "" }))}
                  />
                </Field>

                <ContextFields
                  mode="user"
                  accountId={accountId}
                  canChooseSchool={isOwner}
                  canChooseBranch={isOwner || isSchoolAdmin}
                  form={createUserForm}
                  schools={schoolOptions}
                  branches={branchOptions}
                  linkData={linkData}
                  onChange={(patch) => setCreateUserForm((p) => normalizeScopeForRole({ ...p, ...patch }))}
                />

                <button type="button" className="au-save-btn" onClick={createUser} disabled={saving}>{saving ? "Saving..." : "Create User"}</button>
              </div>
            ) : (
              <div className="au-form-grid">
                <Field label="User"><select value={membershipForm.userId} onChange={(e) => setMembershipForm((p) => ({ ...p, userId: e.target.value }))}><option value="">Select user</option>{users.map((row) => <option key={row.id} value={row.id}>{row.fullName} — {row.email}</option>)}</select></Field>
                <Field label="Role"><RoleSelect value={membershipForm.role} onChange={(role) => setMembershipForm((p) => normalizeScopeForRole({ ...p, role, teacherLocalId: "", studentLocalId: "", parentLocalId: "", classId: "" }))} /></Field>

                <ContextFields
                  mode="membership"
                  accountId={accountId}
                  canChooseSchool={isOwner}
                  canChooseBranch={isOwner || isSchoolAdmin}
                  form={membershipForm}
                  schools={schoolOptions}
                  branches={branchOptions}
                  linkData={linkData}
                  onChange={(patch) => setMembershipForm((p) => normalizeScopeForRole({ ...p, ...patch }))}
                />

                <button type="button" className="au-save-btn" onClick={createMembership} disabled={saving}>{saving ? "Saving..." : "Assign Membership"}</button>
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon }: { label: string | number; value: string | number; icon: string }) {
  return (
    <article className="au-summary-card"><div className="au-summary-icon">{icon}</div><div><strong>{value}</strong><span>{label}</span></div></article>
  );
}

function InfoBlock({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="au-info-block"><span>{label}</span><b>{value}</b></div>;
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`au-chip ${tone}`}>{children}</span>;
}

function RoleChip({ role }: { role: string }) {
  const found = ROLE_OPTIONS.find((item) => item.value === role);
  return <Chip tone={found?.tone || "gray"}>{found?.icon || "🛡️"} {found?.label || role}</Chip>;
}

function RoleSelect({ value, onChange }: { value: RoleKey; onChange: (role: RoleKey) => void }) {
  return <select value={value} onChange={(e) => onChange(e.target.value as RoleKey)}>{ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.icon} {role.label}</option>)}</select>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="au-field"><span>{label}</span>{children}</label>;
}

function ContextFields({
  accountId,
  canChooseSchool,
  canChooseBranch,
  form,
  schools,
  branches,
  linkData,
  onChange,
}: {
  mode: "user" | "membership";
  accountId?: string;
  canChooseSchool: boolean;
  canChooseBranch: boolean;
  form: CreateUserForm | CreateMembershipForm;
  schools: AnySchool[];
  branches: AnyBranch[];
  linkData: LinkData;
  onChange: (patch: Partial<CreateUserForm & CreateMembershipForm>) => void;
}) {
  const filteredBranches = useMemo(() => {
    if (!form.schoolId) return [];
    return branches.filter((branch) => getBranchSchoolId(branch) === Number(form.schoolId));
  }, [branches, form.schoolId]);

  const scopedClasses = useMemo(() => {
    return linkData.classes
      .filter((row) => sameScope(row, accountId, form.schoolId, form.branchId) && row.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [linkData.classes, accountId, form.schoolId, form.branchId]);

  const scopedTeachers = useMemo(() => {
    return linkData.teachers
      .filter((row) => sameScope(row, accountId, form.schoolId, form.branchId) && row.active !== false)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [linkData.teachers, accountId, form.schoolId, form.branchId]);

  const scopedParents = useMemo(() => {
    return linkData.parents
      .filter((row) => sameScope(row, accountId, form.schoolId, form.branchId))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [linkData.parents, accountId, form.schoolId, form.branchId]);

  const scopedStudents = useMemo(() => {
    const tenantStudents = linkData.students.filter((row) => sameScope(row, accountId, form.schoolId, form.branchId) && row.status !== "withdrawn");
    if (!form.classId) return tenantStudents.sort((a, b) => a.fullName.localeCompare(b.fullName));

    const classId = Number(form.classId);
    const enrolledStudentIds = new Set(
      linkData.enrollments
        .filter((row) => sameScope(row, accountId, form.schoolId, form.branchId) && row.classId === classId && row.status !== "withdrawn")
        .map((row) => row.studentId)
    );

    return tenantStudents
      .filter((student) => student.currentClassId === classId || (student.id && enrolledStudentIds.has(student.id)))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [linkData.students, linkData.enrollments, accountId, form.schoolId, form.branchId, form.classId]);

  const selectedTeacher = scopedTeachers.find((row) => Number(row.id || 0) === Number(form.teacherLocalId || 0));
  const selectedParent = scopedParents.find((row) => Number(row.id || 0) === Number(form.parentLocalId || 0));

  if (form.role === "super_admin") {
    return <section className="au-info-box">Owner role is account-wide and does not require school, branch, or local profile link.</section>;
  }

  return (
    <>
      <div className="au-two">
        <Field label="School">
          <select
            value={form.schoolId}
            disabled={!canChooseSchool}
            onChange={(e) => onChange({ schoolId: e.target.value, branchId: "", classId: "", teacherLocalId: "", studentLocalId: "", parentLocalId: "" })}
          >
            <option value="">Select school</option>
            {schools.map((school) => {
              const id = getSchoolId(school);
              return <option key={id} value={id}>{getSchoolName(school)}</option>;
            })}
          </select>
        </Field>

        <Field label="Branch">
          <select
            value={form.branchId}
            disabled={!canChooseBranch || !form.schoolId}
            onChange={(e) => onChange({ branchId: e.target.value, classId: "", teacherLocalId: "", studentLocalId: "", parentLocalId: "" })}
          >
            <option value="">{!form.schoolId ? "Select school first" : "Select branch"}</option>
            {filteredBranches.map((branch) => {
              const id = getBranchId(branch);
              return <option key={id} value={id}>{getBranchName(branch)}</option>;
            })}
          </select>
        </Field>
      </div>

      {!canChooseSchool || !canChooseBranch ? (
        <section className="au-info-box">Scope is locked by your current role and active school/branch context.</section>
      ) : null}

      {form.schoolId && !filteredBranches.length && <section className="au-info-box orange">No branches found under the selected school.</section>}

      {form.role === "teacher" && (
        <>
          <Field label="Teacher">
            <select value={form.teacherLocalId} disabled={!form.branchId} onChange={(e) => onChange({ teacherLocalId: e.target.value })}>
              <option value="">{form.branchId ? "Select teacher" : "Select branch first"}</option>
              {scopedTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{displayTeacher(teacher)}</option>)}
            </select>
          </Field>
          <TeacherPreview teacher={selectedTeacher} linkData={linkData} accountId={accountId} schoolId={form.schoolId} branchId={form.branchId} />
        </>
      )}

      {form.role === "student" && (
        <>
          <Field label="Class">
            <select value={form.classId} disabled={!form.branchId} onChange={(e) => onChange({ classId: e.target.value, studentLocalId: "" })}>
              <option value="">{form.branchId ? "All classes / choose class" : "Select branch first"}</option>
              {scopedClasses.map((klass) => <option key={klass.id} value={klass.id}>{klass.name}</option>)}
            </select>
          </Field>

          <Field label="Student">
            <select value={form.studentLocalId} disabled={!form.branchId} onChange={(e) => onChange({ studentLocalId: e.target.value })}>
              <option value="">{form.classId ? "Select student from class" : "Select student"}</option>
              {scopedStudents.map((student) => <option key={student.id} value={student.id}>{displayStudent(student)}</option>)}
            </select>
          </Field>
        </>
      )}

      {form.role === "parent" && (
        <>
          <Field label="Parent / Guardian">
            <select value={form.parentLocalId} disabled={!form.branchId} onChange={(e) => onChange({ parentLocalId: e.target.value })}>
              <option value="">{form.branchId ? "Select parent" : "Select branch first"}</option>
              {scopedParents.map((parent) => <option key={parent.id} value={parent.id}>{displayParent(parent)}</option>)}
            </select>
          </Field>
          <ParentPreview parent={selectedParent} linkData={linkData} accountId={accountId} schoolId={form.schoolId} branchId={form.branchId} />
        </>
      )}

      {["admin", "branch_admin", "accountant"].includes(form.role) && <section className="au-info-box">This role needs only school and branch scope. No local teacher, student, or parent record is required.</section>}

      {["teacher", "student", "parent"].includes(form.role) && (
        <section className="au-advanced-box">
          <button type="button" onClick={() => onChange({ advancedManualLink: !form.advancedManualLink })}>
            {form.advancedManualLink ? "Hide advanced manual ID entry" : "Advanced: enter local ID manually"}
          </button>

          {form.advancedManualLink && (
            <div className="au-form-grid mini">
              {form.role === "teacher" && <Field label="Teacher Local ID"><input type="number" value={form.teacherLocalId} onChange={(e) => onChange({ teacherLocalId: e.target.value })} /></Field>}
              {form.role === "student" && <Field label="Student Local ID"><input type="number" value={form.studentLocalId} onChange={(e) => onChange({ studentLocalId: e.target.value })} /></Field>}
              {form.role === "parent" && <Field label="Parent Local ID"><input type="number" value={form.parentLocalId} onChange={(e) => onChange({ parentLocalId: e.target.value })} /></Field>}
            </div>
          )}
        </section>
      )}
    </>
  );
}

function TeacherPreview({ teacher, linkData, accountId, schoolId, branchId }: { teacher?: Teacher; linkData: LinkData; accountId?: string; schoolId: string; branchId: string }) {
  if (!teacher?.id) return null;

  const subjectMap = new Map(linkData.subjects.map((row) => [row.id, row]));
  const classMap = new Map(linkData.classes.map((row) => [row.id, row]));
  const assignments = linkData.assignments.filter((row) => sameScope(row, accountId, schoolId, branchId) && row.teacherId === teacher.id);
  const classTeacherRows = linkData.classTeachers.filter((row) => sameScope(row, accountId, schoolId, branchId) && row.teacherId === teacher.id);
  const classSubjectRows = linkData.classSubjects.filter((row) => sameScope(row, accountId, schoolId, branchId) && row.teacherId === teacher.id && row.active !== false);

  return (
    <section className="au-preview-box">
      <h4>{teacher.fullName}</h4>
      <p>{[teacher.email, teacher.phone, teacher.role].filter(Boolean).join(" · ") || "Teacher record selected"}</p>
      <div className="au-chip-row">
        <Chip tone="orange">{assignments.length} assignments</Chip>
        <Chip tone="blue">{classSubjectRows.length} class subjects</Chip>
        <Chip tone="green">{classTeacherRows.length} class-teacher classes</Chip>
      </div>
      <div className="au-mini-list">
        {classSubjectRows.slice(0, 4).map((row) => <span key={row.id}>{classMap.get(row.classId)?.name || `Class ${row.classId}`} · {subjectMap.get(row.subjectId)?.name || row.name || `Subject ${row.subjectId}`}</span>)}
        {classTeacherRows.slice(0, 3).map((row) => <span key={`ct-${row.id}`}>Class teacher: {classMap.get(row.classId)?.name || `Class ${row.classId}`}</span>)}
      </div>
    </section>
  );
}

function ParentPreview({ parent, linkData, accountId, schoolId, branchId }: { parent?: Parent; linkData: LinkData; accountId?: string; schoolId: string; branchId: string }) {
  if (!parent?.id) return null;

  const studentMap = new Map(linkData.students.map((row) => [row.id, row]));
  const linkedRows = linkData.studentParents.filter((row) => sameScope(row, accountId, schoolId, branchId) && row.parentId === parent.id);
  const linkedChildren = linkedRows.map((row) => studentMap.get(row.studentId)).filter(Boolean) as Student[];

  return (
    <section className="au-preview-box">
      <h4>{parent.fullName}</h4>
      <p>{[parent.phone, parent.email, parent.relationship].filter(Boolean).join(" · ") || "Parent record selected"}</p>
      <div className="au-chip-row"><Chip tone="blue">{linkedChildren.length} linked children</Chip></div>
      <div className="au-mini-list">
        {linkedChildren.slice(0, 5).map((student) => <span key={student.id}>{student.fullName}{student.admissionNumber ? ` · ${student.admissionNumber}` : ""}</span>)}
      </div>
    </section>
  );
}

function getTeacherName(rows: Teacher[], id?: number | null) {
  const found = rows.find((row) => Number(row.id || 0) === Number(id || 0));
  return found ? found.fullName : `Teacher ${id}`;
}

function getStudentName(rows: Student[], id?: number | null) {
  const found = rows.find((row) => Number(row.id || 0) === Number(id || 0));
  return found ? found.fullName : `Student ${id}`;
}

function getParentName(rows: Parent[], id?: number | null) {
  const found = rows.find((row) => Number(row.id || 0) === Number(id || 0));
  return found ? found.fullName : `Parent ${id}`;
}

function initials(value: string) {
  return value.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes auSpin { to { transform: rotate(360deg); } }
.au-page{min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:8px;padding-bottom:max(28px,env(safe-area-inset-bottom));background:var(--bg,#f8fafc);color:var(--text,#0f172a);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);overflow-x:hidden}.au-page *,.au-page *::before,.au-page *::after{box-sizing:border-box}.au-page button,.au-page input,.au-page select,.au-page textarea{font:inherit;max-width:100%}.au-state-card{min-height:min(420px,calc(100dvh - 32px));display:grid;place-items:center;align-content:center;gap:10px;width:min(460px,100%);margin:0 auto;padding:22px;border-radius:28px;background:var(--surface,#fff);border:1px solid rgba(148,163,184,.22);box-shadow:0 24px 60px rgba(15,23,42,.08);text-align:center}.au-state-card h2{margin:0;font-size:clamp(18px,5vw,24px);font-weight:1000;letter-spacing:-.04em}.au-state-card p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.au-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--au-primary) 18%,transparent);border-top-color:var(--au-primary);animation:auSpin .8s linear infinite}.au-primary-btn,.au-secondary-btn,.au-save-btn{min-height:46px;border:0;border-radius:999px;padding:0 18px;background:var(--au-primary);color:#fff;font-weight:950;cursor:pointer}.au-secondary-btn{background:rgba(37,99,235,.1);color:var(--au-primary)}.au-primary-btn:disabled,.au-secondary-btn:disabled,.au-save-btn:disabled{opacity:.55;cursor:not-allowed}.au-hero{display:flex;align-items:stretch;justify-content:space-between;gap:10px;padding:12px;border-radius:28px;background:linear-gradient(135deg,color-mix(in srgb,var(--au-primary) 12%,#fff),#fff 64%);border:1px solid rgba(148,163,184,.22);box-shadow:0 18px 46px rgba(15,23,42,.07);overflow:hidden}.au-hero-left{min-width:0;display:flex;align-items:center;gap:10px;flex:1 1 auto}.au-hero-icon{width:46px;height:46px;flex:0 0 auto;display:grid;place-items:center;border-radius:18px;background:var(--au-primary);color:#fff;box-shadow:0 12px 26px color-mix(in srgb,var(--au-primary) 28%,transparent);font-size:22px}.au-title-wrap{min-width:0}.au-title-wrap p,.au-title-wrap h2,.au-title-wrap span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.au-title-wrap p,.au-context-card p,.au-section-head p,.au-drawer-head p{margin:0;color:var(--au-primary);font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.au-title-wrap h2{margin:0;font-size:clamp(19px,5vw,28px);font-weight:1000;letter-spacing:-.06em;line-height:1}.au-title-wrap span{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:750}.au-action-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.au-context-card,.au-section-card,.au-switch-card{min-width:0;margin-top:10px;padding:12px;border-radius:24px;background:var(--surface,#fff);border:1px solid rgba(148,163,184,.2);box-shadow:0 12px 28px rgba(15,23,42,.045);overflow:hidden}.au-context-card{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.au-context-card div:first-child{min-width:0}.au-context-card h3{margin:3px 0 0;font-size:18px;font-weight:1000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.au-context-card span{display:block;margin-top:2px;color:var(--muted,#64748b);font-size:12px;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.au-pill-row,.au-chip-row{display:flex;gap:7px;flex-wrap:wrap}.au-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}.au-summary-card{min-width:0;display:flex;align-items:center;gap:10px;padding:12px;border-radius:22px;background:var(--surface,#fff);border:1px solid rgba(148,163,184,.2);box-shadow:0 12px 28px rgba(15,23,42,.04);overflow:hidden}.au-summary-icon,.au-user-avatar{width:38px;height:38px;flex:0 0 auto;display:grid;place-items:center;border-radius:15px;background:color-mix(in srgb,var(--au-primary) 12%,#fff);font-size:20px}.au-user-avatar{background:var(--au-primary);color:#fff;font-size:13px;font-weight:1000}.au-summary-card div:last-child{min-width:0}.au-summary-card strong,.au-summary-card span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.au-summary-card strong{font-size:20px;font-weight:1000;letter-spacing:-.05em}.au-summary-card span{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:850}.au-switch-card{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px}.au-switch-card button{min-width:0;border:1px solid rgba(148,163,184,.18);border-radius:20px;background:rgba(148,163,184,.08);padding:12px;text-align:left;cursor:pointer;color:var(--text,#0f172a)}.au-switch-card button.active{background:linear-gradient(135deg,color-mix(in srgb,var(--au-primary) 14%,#fff),#fff);border-color:color-mix(in srgb,var(--au-primary) 28%,transparent);box-shadow:0 12px 24px rgba(15,23,42,.055)}.au-switch-card span,.au-switch-card b,.au-switch-card small{display:block}.au-switch-card span{font-size:22px}.au-switch-card b{margin-top:4px;font-size:14px;font-weight:1000}.au-switch-card small{margin-top:2px;color:#64748b;font-size:11px;font-weight:750;line-height:1.35}.au-section-head{min-width:0;margin-bottom:10px}.au-section-head.with-action{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.au-section-head h3{margin:3px 0 0;font-size:18px;font-weight:1000;letter-spacing:-.03em}.au-head-actions{display:flex;gap:7px;flex-wrap:wrap}.au-section-head button,.au-user-actions button,.au-empty-users button{min-height:38px;border:0;border-radius:999px;padding:0 14px;background:var(--au-primary);color:#fff;font-size:12px;font-weight:950;cursor:pointer}.au-section-head button.light{background:rgba(37,99,235,.1);color:var(--au-primary)}.au-section-head button:disabled,.au-user-actions button:disabled,.au-empty-users button:disabled{opacity:.55;cursor:not-allowed}.au-user-actions button.danger{background:rgba(239,68,68,.12);color:#dc2626}.au-users-list,.au-membership-list{display:grid;gap:8px}.au-user-card,.au-membership-card{display:grid;gap:10px;min-width:0;padding:12px;border-radius:19px;background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.12);overflow:hidden}.au-user-main{display:flex;align-items:flex-start;gap:10px;min-width:0}.au-user-main div:last-child{min-width:0}.au-user-main h4{margin:0;font-size:15px;font-weight:1000}.au-user-main p{margin:4px 0 7px;color:var(--muted,#64748b);font-size:12px;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.au-membership-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.au-info-block{min-width:0;border-radius:15px;background:rgba(255,255,255,.76);border:1px solid rgba(148,163,184,.14);padding:8px}.au-info-block span,.au-info-block b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.au-info-block span{color:#64748b;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.au-info-block b{margin-top:2px;font-size:12px;font-weight:950}.au-user-actions{display:flex;gap:7px;flex-wrap:wrap}.au-empty-users{display:grid;place-items:center;text-align:center;min-height:190px;border-radius:20px;background:rgba(148,163,184,.08);padding:20px}.au-empty-users div{font-size:34px}.au-empty-users h3{margin:8px 0 0;font-size:18px;font-weight:1000}.au-empty-users p{margin:6px 0 12px;color:#64748b;font-size:13px;line-height:1.5}.au-chip{max-width:100%;display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.au-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.au-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.au-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.au-chip.gray{background:rgba(107,114,128,.12);color:#4b5563}.au-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.au-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.au-drawer-layer{position:fixed;inset:0;z-index:90}.au-drawer-overlay{position:absolute;inset:0;border:0;background:rgba(15,23,42,.52)}.au-drawer{position:absolute;right:0;top:0;bottom:0;width:min(94vw,560px);background:var(--surface,#fff);padding:14px;overflow:auto;box-shadow:-24px 0 70px rgba(15,23,42,.22)}.au-drawer-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:10px;background:var(--surface,#fff);padding-bottom:12px}.au-drawer-head div{min-width:0}.au-drawer-head h2{margin:2px 0 0;font-size:24px;font-weight:1000;letter-spacing:-.05em}.au-drawer-head span{display:block;margin-top:4px;color:#64748b;font-size:12px;font-weight:750}.au-drawer-head button{width:38px;height:38px;border-radius:15px;border:1px solid rgba(148,163,184,.24);background:#fff;font-weight:1000}.au-form-grid{display:grid;gap:11px}.au-form-grid.mini{margin-top:10px}.au-two{display:grid;grid-template-columns:1fr;gap:10px}.au-field{display:grid;gap:6px}.au-field>span{color:#64748b;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.au-field input,.au-field select,.au-field textarea{width:100%;border:1px solid rgba(148,163,184,.28);border-radius:15px;padding:0 12px;min-height:44px;background:var(--surface,#fff);color:var(--text,#0f172a);font-weight:750;outline:none}.au-field select:disabled,.au-field input:disabled{opacity:.65;cursor:not-allowed}.au-password-wrap{position:relative}.au-password-wrap input{padding-right:52px}.au-password-wrap button{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:38px;height:38px;border:0;border-radius:13px;background:rgba(148,163,184,.14);cursor:pointer}.au-save-btn{width:100%}.au-info-box,.au-preview-box,.au-advanced-box{border-radius:18px;background:rgba(59,130,246,.1);color:#2563eb;padding:12px;font-size:13px;font-weight:850;line-height:1.5}.au-info-box.orange{background:rgba(245,158,11,.14);color:#b45309}.au-preview-box{background:rgba(148,163,184,.09);color:#0f172a;border:1px solid rgba(148,163,184,.16)}.au-preview-box h4{margin:0;font-size:15px;font-weight:1000}.au-preview-box p{margin:4px 0 8px;color:#64748b;font-size:12px}.au-mini-list{display:grid;gap:5px;margin-top:8px}.au-mini-list span{display:block;border-radius:12px;background:#fff;padding:7px 9px;color:#475569;font-size:12px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.au-advanced-box{background:rgba(107,114,128,.09);color:#475569}.au-advanced-box>button{border:0;background:transparent;color:var(--au-primary);font-weight:950;cursor:pointer;padding:0}@media(min-width:680px){.au-page{padding:12px}.au-summary-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.au-two{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:1040px){.au-page{padding:16px}.au-user-card.only-users{grid-template-columns:minmax(0,1fr) auto;align-items:center}.au-membership-card{grid-template-columns:minmax(0,1fr) minmax(320px,.85fr) auto;align-items:center}}@media(max-width:520px){.au-page{padding:6px}.au-hero{flex-direction:column;border-radius:22px;padding:10px}.au-action-row,.au-primary-btn,.au-secondary-btn{width:100%}.au-context-card{align-items:stretch}.au-summary-grid{gap:6px}.au-summary-card{padding:10px;border-radius:19px}.au-switch-card{grid-template-columns:1fr}.au-drawer{width:100vw}.au-membership-detail-grid{grid-template-columns:1fr}}
`;
