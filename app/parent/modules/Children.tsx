"use client";

/**
 * app/parent/modules/Children.tsx
 * ---------------------------------------------------------
 * PARENT PORTAL — CHILDREN
 * ---------------------------------------------------------
 *
 * Parent-scoped children module:
 * - No school selector.
 * - No branch selector.
 * - Uses active parent membership.
 * - Shows only students linked to the logged-in parent.
 *
 * UI:
 * - Cards / Table / Analytics view switching.
 * - Mobile-first.
 * - Dark-mode safe.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";

import {
  AcademicPeriod,
  AcademicStructure,
  Class,
  db,
  Parent,
  Student,
  StudentEnrollment,
  StudentParent,
} from "../../lib/db/db";

// ======================================================
// TYPES
// ======================================================

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type ViewMode = "cards" | "table" | "analytics";

type ChildView = {
  student: Student;
  parentLinks: StudentParent[];
  className: string;
  academicStructureName: string;
  academicPeriodName: string;
  enrollmentStatus: string;
  relationship: string;
  isPrimary: boolean;
};

type Breakdown = {
  name: string;
  count: number;
};

// ======================================================
// HELPERS
// ======================================================

const textOrDash = (value?: string | number | null) => {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
};

const ageFromDob = (dob?: string) => {
  if (!dob) return undefined;

  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return undefined;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age >= 0 ? age : undefined;
};

const relationshipLabel = (relationship?: string) => {
  if (!relationship) return "Guardian";
  return relationship.charAt(0).toUpperCase() + relationship.slice(1);
};

// ======================================================
// COMPONENT
// ======================================================

export default function Children() {
  const router = useRouter();

  const {
    accountId,
    authenticated,
    loading: accountLoading,
  } = useAccount();

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const membershipContext = useActiveMembership() as any;

  const activeMembership = membershipContext?.activeMembership;
  const activeParentId =
    membershipContext?.activeParentId ||
    activeMembership?.parentLocalId ||
    undefined;

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  const [parents, setParents] = useState<Parent[]>([]);
  const [studentParents, setStudentParents] = useState<StudentParent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Student["status"]>("all");
  const [classFilter, setClassFilter] = useState<number | "all">("all");

  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  // ======================================================
  // AUTH PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId || !activeBranchId) {
      router.replace("/owner");
    }
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    activeSchoolId,
    activeBranchId,
    router,
  ]);

  // ======================================================
  // LOAD DATA
  // ======================================================

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const clearData = () => {
    setParents([]);
    setStudentParents([]);
    setStudents([]);
    setClasses([]);
    setEnrollments([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        parentRows,
        studentParentRows,
        studentRows,
        classRows,
        enrollmentRows,
        academicStructureRows,
        academicPeriodRows,
      ] = await Promise.all([
        db.parents.toArray(),
        db.studentParents.toArray(),
        db.students.toArray(),
        db.classes.toArray(),
        db.studentEnrollments.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
      ]);

      const scopedParents = parentRows.filter(sameTenant);
      const scopedStudentParents = studentParentRows.filter(sameTenant);
      const scopedStudents = studentRows.filter(sameTenant);

      const parentIds = new Set<number>();

      if (activeParentId) parentIds.add(Number(activeParentId));
      if (activeMembership?.parentLocalId) parentIds.add(Number(activeMembership.parentLocalId));

      const userEmail = String((activeMembership as any)?.email || "").toLowerCase();
      scopedParents
        .filter((parent) => userEmail && String(parent.email || "").toLowerCase() === userEmail)
        .forEach((parent) => {
          if (parent.id) parentIds.add(parent.id);
        });

      const linkedStudentParents = scopedStudentParents.filter(
        (link) => !parentIds.size || parentIds.has(link.parentId)
      );

      const childIds = new Set<number>(linkedStudentParents.map((link) => link.studentId));
      const childRows = scopedStudents.filter((student) => student.id && childIds.has(student.id));

      setParents(parentIds.size ? scopedParents.filter((parent) => parent.id && parentIds.has(parent.id)) : scopedParents);
      setStudentParents(linkedStudentParents);
      setStudents(childRows);
      setClasses(classRows.filter((row) => sameTenant(row) && row.active !== false));
      setEnrollments(enrollmentRows.filter(sameTenant).filter((row) => childIds.has(row.studentId)));
      setAcademicStructures(academicStructureRows.filter((row) => sameTenant(row) && row.active !== false));
      setAcademicPeriods(academicPeriodRows.filter((row) => sameTenant(row) && row.active !== false));
    } catch (error) {
      console.error("Failed to load children:", error);
      clearData();
      alert("Failed to load children.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId, activeParentId]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const classMap = useMemo(() => new Map(classes.map((row) => [row.id, row])), [classes]);
  const structureMap = useMemo(() => new Map(academicStructures.map((row) => [row.id, row])), [academicStructures]);
  const periodMap = useMemo(() => new Map(academicPeriods.map((row) => [row.id, row])), [academicPeriods]);

  const children = useMemo<ChildView[]>(() => {
    return students
      .map((student) => {
        const links = studentParents.filter((link) => link.studentId === student.id);
        const activeEnrollment =
          enrollments.find((row) => row.studentId === student.id && row.status === "active") ||
          enrollments.find((row) => row.studentId === student.id);

        const classId = student.currentClassId || activeEnrollment?.classId;
        const className = classId ? classMap.get(classId)?.name || "Class not found" : "No class assigned";

        const academicStructureName = activeEnrollment?.academicStructureId
          ? structureMap.get(activeEnrollment.academicStructureId)?.name || "Structure not found"
          : "Not enrolled";

        const academicPeriodName = activeEnrollment?.academicPeriodId
          ? periodMap.get(activeEnrollment.academicPeriodId)?.name || "Period not found"
          : "Not enrolled";

        const primaryLink = links.find((link) => link.isPrimary) || links[0];

        return {
          student,
          parentLinks: links,
          className,
          academicStructureName,
          academicPeriodName,
          enrollmentStatus: activeEnrollment?.status || "not_enrolled",
          relationship: relationshipLabel(primaryLink?.relationship),
          isPrimary: Boolean(primaryLink?.isPrimary),
        };
      })
      .sort((a, b) => a.student.fullName.localeCompare(b.student.fullName));
  }, [students, studentParents, enrollments, classMap, structureMap, periodMap]);

  const filteredChildren = useMemo(() => {
    const query = search.trim().toLowerCase();

    return children.filter((item) => {
      const student = item.student;

      if (statusFilter !== "all" && student.status !== statusFilter) return false;

      if (classFilter !== "all") {
        const studentClassId = student.currentClassId || enrollments.find((row) => row.studentId === student.id)?.classId;
        if (studentClassId !== classFilter) return false;
      }

      if (!query) return true;

      return `
        ${student.fullName}
        ${student.admissionNumber || ""}
        ${student.gender || ""}
        ${student.parentName || ""}
        ${student.parentPhone || ""}
        ${student.parentEmail || ""}
        ${student.address || ""}
        ${item.className}
        ${item.academicStructureName}
        ${item.academicPeriodName}
        ${item.relationship}
      `
        .toLowerCase()
        .includes(query);
    });
  }, [children, search, statusFilter, classFilter, enrollments]);

  const selectedChild = useMemo(() => {
    if (!selectedStudentId) return null;
    return children.find((child) => child.student.id === selectedStudentId) || null;
  }, [selectedStudentId, children]);

  const summary = useMemo(() => {
    const active = filteredChildren.filter((child) => child.student.status !== "graduated" && child.student.status !== "withdrawn").length;
    const enrolled = filteredChildren.filter((child) => child.enrollmentStatus === "active").length;
    const noClass = filteredChildren.filter((child) => child.className === "No class assigned").length;
    const primaryLinks = filteredChildren.filter((child) => child.isPrimary).length;

    return {
      total: filteredChildren.length,
      active,
      enrolled,
      noClass,
      primaryLinks,
    };
  }, [filteredChildren]);

  const classBreakdown = useMemo<Breakdown[]>(() => {
    const map = new Map<string, Breakdown>();

    filteredChildren.forEach((child) => {
      const key = child.className || "No class assigned";
      const existing = map.get(key) || { name: key, count: 0 };
      existing.count += 1;
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filteredChildren]);

  const statusBreakdown = useMemo<Breakdown[]>(() => {
    const map = new Map<string, Breakdown>();

    filteredChildren.forEach((child) => {
      const key = child.student.status || "active";
      const existing = map.get(key) || { name: key, count: 0 };
      existing.count += 1;
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filteredChildren]);

  const relationshipBreakdown = useMemo<Breakdown[]>(() => {
    const map = new Map<string, Breakdown>();

    filteredChildren.forEach((child) => {
      const key = child.relationship || "Guardian";
      const existing = map.get(key) || { name: key, count: 0 };
      existing.count += 1;
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filteredChildren]);

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="pch-page" style={{ "--pch-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="pch-state-card">
          <div className="pch-spinner" />
          <h2>Opening children...</h2>
          <p>Checking parent profile, linked children, classes and enrollment records.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="pch-page" style={{ "--pch-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="pch-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before viewing your children.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="pch-page" style={{ "--pch-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="pch-state-card">
          <h2>Assigned school branch required</h2>
          <p>Your parent portal must be linked to a school branch before children can be shown.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="pch-page" style={{ "--pch-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="pch-hero">
        <div className="pch-hero-left">
          <div className="pch-hero-icon">🧒</div>
          <div className="pch-title-wrap">
            <p>Parent Workspace</p>
            <h2>My Children</h2>
            <span>
              {activeSchool?.name || "School"} · {activeBranch?.name || "Branch"}
            </span>
          </div>
        </div>

        <div className="pch-hero-actions">
          <button type="button" className="pch-ghost-btn" onClick={load}>
            Refresh
          </button>
        </div>
      </section>

      <section className="pch-context-grid">
        <article>
          <div className="pch-context-icon">👨‍👩‍👧</div>
          <div>
            <span>Linked Children</span>
            <strong>{children.length}</strong>
            <p>Only students linked to your parent profile appear here.</p>
          </div>
        </article>

        <article>
          <div className="pch-context-icon">🏫</div>
          <div>
            <span>School Branch</span>
            <strong>{activeBranch?.name || "Assigned branch"}</strong>
            <p>This portal is locked to your child’s assigned branch.</p>
          </div>
        </article>
      </section>

      <section className="pch-summary-grid" aria-label="Children summary">
        <SummaryCard label="Children" value={summary.total} icon="🧒" />
        <SummaryCard label="Active" value={summary.active} icon="✅" positive />
        <SummaryCard label="Enrolled" value={summary.enrolled} icon="📚" />
        <SummaryCard label="No Class" value={summary.noClass} icon="⚠️" warning={summary.noClass > 0} />
        <SummaryCard label="Primary Links" value={summary.primaryLinks} icon="⭐" />
      </section>

      <section className="pch-toolbar">
        <div className="pch-view-tabs">
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>
            Cards
          </button>
          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
            Table
          </button>
          <button type="button" className={viewMode === "analytics" ? "active" : ""} onClick={() => setViewMode("analytics")}>
            Analytics
          </button>
        </div>

        <Chip tone="gray">{filteredChildren.length} child(ren)</Chip>
      </section>

      <section className="pch-filter-card">
        <input
          placeholder="Search child, admission number, class, relationship..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={statusFilter || "all"} onChange={(event) => setStatusFilter(event.target.value as any)}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="graduated">Graduated</option>
          <option value="transferred">Transferred</option>
          <option value="withdrawn">Withdrawn</option>
        </select>

        <select value={classFilter} onChange={(event) => setClassFilter(event.target.value === "all" ? "all" : Number(event.target.value))}>
          <option value="all">All Classes</option>
          {classes.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </section>

      {viewMode === "analytics" && (
        <>
          <BreakdownSection title="Class Breakdown" items={classBreakdown} tone="blue" />
          <BreakdownSection title="Status Breakdown" items={statusBreakdown} tone="green" />
          <BreakdownSection title="Relationship Breakdown" items={relationshipBreakdown} tone="purple" />
        </>
      )}

      {viewMode === "table" && (
        <section className="pch-table-card">
          <div className="pch-section-head">
            <div>
              <p>Parent Child Register</p>
              <h3>Children Table</h3>
            </div>
            <Chip tone="blue">Parent Scoped</Chip>
          </div>

          <div className="pch-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Child</th>
                  <th>Admission No.</th>
                  <th>Class</th>
                  <th>Academic Structure</th>
                  <th>Current Period</th>
                  <th>Gender</th>
                  <th>Age</th>
                  <th>Status</th>
                  <th>Relationship</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredChildren.map((child) => {
                  const age = child.student.age || ageFromDob(child.student.dateOfBirth);

                  return (
                    <tr key={child.student.id}>
                      <td>
                        <strong>{child.student.fullName}</strong>
                        <span>{child.student.parentPhone || child.student.parentEmail || "No parent contact"}</span>
                      </td>
                      <td>{textOrDash(child.student.admissionNumber)}</td>
                      <td>{child.className}</td>
                      <td>{child.academicStructureName}</td>
                      <td>{child.academicPeriodName}</td>
                      <td>{textOrDash(child.student.gender)}</td>
                      <td>{textOrDash(age)}</td>
                      <td><Chip tone={child.student.status === "withdrawn" ? "red" : "green"}>{child.student.status || "active"}</Chip></td>
                      <td>{child.relationship}</td>
                      <td>
                        <button type="button" className="pch-table-btn" onClick={() => setSelectedStudentId(child.student.id || null)}>
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!filteredChildren.length && (
                  <tr>
                    <td colSpan={10}>
                      <EmptyCard text="No linked children were found under the selected filters." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {viewMode === "cards" && (
        <section className="pch-section">
          <div className="pch-section-head">
            <div>
              <p>Parent Child Register</p>
              <h3>Linked Children</h3>
            </div>
            <Chip tone="gray">{filteredChildren.length} child(ren)</Chip>
          </div>

          <div className="pch-list">
            {filteredChildren.map((child) => {
              const age = child.student.age || ageFromDob(child.student.dateOfBirth);

              return (
                <article key={child.student.id} className="pch-card">
                  <div className="pch-card-top">
                    <div className="pch-avatar">
                      {child.student.photo ? (
                        <img src={child.student.photo} alt={child.student.fullName} />
                      ) : (
                        child.student.fullName.slice(0, 1).toUpperCase()
                      )}
                    </div>

                    <div className="pch-card-main">
                      <h3>{child.student.fullName}</h3>
                      <p>
                        {child.student.admissionNumber || "No admission number"} · {child.className}
                      </p>

                      <div className="pch-chip-row">
                        <Chip tone="blue">{child.relationship}</Chip>
                        <Chip tone={child.student.status === "withdrawn" ? "red" : "green"}>{child.student.status || "active"}</Chip>
                        <Chip tone="gray">{child.enrollmentStatus}</Chip>
                      </div>
                    </div>
                  </div>

                  <div className="pch-mini-grid">
                    <MiniStat label="Class" value={child.className} />
                    <MiniStat label="Structure" value={child.academicStructureName} />
                    <MiniStat label="Period" value={child.academicPeriodName} />
                    <MiniStat label="Age" value={textOrDash(age)} />
                  </div>

                  <div className="pch-action-row">
                    <button type="button" onClick={() => setSelectedStudentId(child.student.id || null)}>
                      View Profile
                    </button>
                  </div>
                </article>
              );
            })}

            {!filteredChildren.length && (
              <EmptyCard text="No linked children were found under the selected filters." />
            )}
          </div>
        </section>
      )}

      {selectedChild && (
        <div className="pch-drawer-layer">
          <button type="button" className="pch-drawer-overlay" aria-label="Close child profile" onClick={() => setSelectedStudentId(null)} />

          <aside className="pch-drawer">
            <div className="pch-drawer-head">
              <div>
                <p>Child Profile</p>
                <h2>{selectedChild.student.fullName}</h2>
                <span>{activeSchool?.name || "School"} · {activeBranch?.name || "Branch"}</span>
              </div>
              <button type="button" onClick={() => setSelectedStudentId(null)}>✕</button>
            </div>

            <section className="pch-profile-top">
              <div className="pch-profile-avatar">
                {selectedChild.student.photo ? (
                  <img src={selectedChild.student.photo} alt={selectedChild.student.fullName} />
                ) : (
                  selectedChild.student.fullName.slice(0, 1).toUpperCase()
                )}
              </div>

              <div>
                <h3>{selectedChild.student.fullName}</h3>
                <p>{selectedChild.student.admissionNumber || "No admission number"}</p>
                <div className="pch-chip-row">
                  <Chip tone="blue">{selectedChild.className}</Chip>
                  <Chip tone="gray">{selectedChild.relationship}</Chip>
                </div>
              </div>
            </section>

            <section className="pch-drawer-grid">
              <MiniStat label="Gender" value={textOrDash(selectedChild.student.gender)} />
              <MiniStat label="Age" value={textOrDash(selectedChild.student.age || ageFromDob(selectedChild.student.dateOfBirth))} />
              <MiniStat label="Date of Birth" value={textOrDash(selectedChild.student.dateOfBirth)} />
              <MiniStat label="Status" value={selectedChild.student.status || "active"} />
              <MiniStat label="Class" value={selectedChild.className} />
              <MiniStat label="Academic Structure" value={selectedChild.academicStructureName} />
              <MiniStat label="Academic Period" value={selectedChild.academicPeriodName} />
              <MiniStat label="Enrollment" value={selectedChild.enrollmentStatus} />
            </section>

            <section className="pch-drawer-section">
              <h3>Contact & Guardian Information</h3>
              <div className="pch-line-list">
                <div>
                  <span>Parent Name</span>
                  <strong>{selectedChild.student.parentName || parents[0]?.fullName || "-"}</strong>
                </div>
                <div>
                  <span>Phone</span>
                  <strong>{selectedChild.student.parentPhone || parents[0]?.phone || "-"}</strong>
                </div>
                <div>
                  <span>Email</span>
                  <strong>{selectedChild.student.parentEmail || parents[0]?.email || "-"}</strong>
                </div>
                <div>
                  <span>Address</span>
                  <strong>{selectedChild.student.address || parents[0]?.address || "-"}</strong>
                </div>
              </div>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({
  label,
  value,
  icon,
  positive = false,
  warning = false,
}: {
  label: string;
  value: string | number;
  icon: string;
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <article className={`pch-summary-card ${positive ? "positive" : ""} ${warning ? "warning" : ""}`}>
      <div className="pch-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function BreakdownSection({
  title,
  items,
  tone,
}: {
  title: string;
  items: Breakdown[];
  tone: "green" | "blue" | "purple" | "orange";
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="pch-section">
      <div className="pch-section-head">
        <div>
          <p>Analytical View</p>
          <h3>{title}</h3>
        </div>
        <Chip tone="gray">{items.length} group(s)</Chip>
      </div>

      <div className="pch-breakdown-grid">
        {items.map((item) => (
          <article key={item.name} className="pch-breakdown-card">
            <div className="pch-breakdown-top">
              <strong>{item.name}</strong>
              <Chip tone={tone}>{item.count}</Chip>
            </div>

            <div className="pch-bar-track">
              <div style={{ width: `${total ? Math.round((item.count / total) * 100) : 0}%` }} />
            </div>

            <div className="pch-chip-row">
              <Chip tone="gray">{item.count} child(ren)</Chip>
              <Chip tone="gray">{total ? Math.round((item.count / total) * 100) : 0}%</Chip>
            </div>
          </article>
        ))}

        {!items.length && <EmptyCard text={`No ${title.toLowerCase()} available for the selected filters.`} />}
      </div>
    </section>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`pch-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="pch-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="pch-empty-card">
      <div className="pch-empty-icon">🧒</div>
      <h3>No children found</h3>
      <p>{text}</p>
    </section>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes pchSpin { to { transform: rotate(360deg); } }

.pch-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--pch-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 16px);
  overflow-x: hidden;
}

.pch-page *,
.pch-page *::before,
.pch-page *::after { box-sizing: border-box; }

.pch-page button,
.pch-page input,
.pch-page select {
  font: inherit;
  max-width: 100%;
}

.pch-page input,
.pch-page select {
  width: 100%;
  min-height: 43px;
  border: 1px solid var(--input-border, var(--border, rgba(148,163,184,.28)));
  border-radius: 15px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #0f172a));
  outline: none;
  font-weight: 750;
}

.pch-page input:focus,
.pch-page select:focus {
  border-color: var(--pch-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--pch-primary) 12%, transparent);
}

.pch-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--card, var(--surface, #fff));
  border: 1px solid var(--border, rgba(148,163,184,.22));
  box-shadow: var(--shell-shadow, 0 24px 60px rgba(15,23,42,.08));
  text-align: center;
}

.pch-state-card h2 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.pch-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.pch-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--pch-primary) 18%, transparent);
  border-top-color: var(--pch-primary);
  animation: pchSpin .8s linear infinite;
}

.pch-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--pch-primary) 16%, transparent), transparent 20rem),
    linear-gradient(135deg, var(--card, var(--surface, #fff)), color-mix(in srgb, var(--pch-primary) 7%, var(--card, #fff)) 72%);
  border: 1px solid var(--border, rgba(148,163,184,.22));
  box-shadow: 0 18px 46px rgba(15,23,42,.07);
  overflow: hidden;
}

.pch-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.pch-hero-icon {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--pch-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--pch-primary) 28%, transparent);
  font-size: 22px;
}

.pch-title-wrap { min-width: 0; }

.pch-title-wrap p,
.pch-title-wrap h2,
.pch-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pch-title-wrap p {
  margin: 0 0 2px;
  color: var(--pch-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.pch-title-wrap h2 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: clamp(20px, 5vw, 30px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.pch-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.pch-hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.pch-ghost-btn,
.pch-table-btn,
.pch-action-row button {
  min-height: 42px;
  border-radius: 999px;
  padding: 0 14px;
  font-weight: 950;
  cursor: pointer;
  border: 1px solid var(--border, rgba(148,163,184,.24));
  background: var(--card, var(--surface, #fff));
  color: var(--text, #0f172a);
}

.pch-context-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
}

.pch-context-grid article {
  min-width: 0;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 22px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--pch-primary) 10%, var(--card, var(--surface, #fff))), var(--card, var(--surface, #fff)) 70%);
  border: 1px solid var(--border, rgba(148,163,184,.2));
  box-shadow: 0 12px 28px rgba(15,23,42,.04);
}

.pch-context-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: var(--pch-primary);
  color: #fff;
  font-size: 20px;
}

.pch-context-grid article > div:last-child { min-width: 0; }

.pch-context-grid span {
  display: block;
  color: var(--pch-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.pch-context-grid strong {
  display: block;
  margin-top: 3px;
  color: var(--text, #0f172a);
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.pch-context-grid p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.pch-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.pch-summary-card,
.pch-toolbar,
.pch-filter-card,
.pch-table-card,
.pch-breakdown-card,
.pch-card,
.pch-empty-card {
  background: var(--card, var(--surface, #fff));
  border: 1px solid var(--border, rgba(148,163,184,.2));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.pch-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  overflow: hidden;
}

.pch-summary-card.positive { background: linear-gradient(135deg, rgba(34,197,94,.10), var(--card, var(--surface, #fff))); }
.pch-summary-card.warning { background: linear-gradient(135deg, rgba(245,158,11,.10), var(--card, var(--surface, #fff))); }

.pch-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--pch-primary) 12%, var(--surface, #fff));
}

.pch-summary-card div:last-child { min-width: 0; }

.pch-summary-card strong,
.pch-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pch-summary-card strong {
  color: var(--text, #0f172a);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.pch-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.pch-toolbar,
.pch-filter-card,
.pch-table-card {
  margin-top: 10px;
  padding: 10px;
  border-radius: 24px;
}

.pch-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pch-view-tabs {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  width: min(390px, 100%);
  padding: 4px;
  border-radius: 999px;
  background: var(--shell-section-bg, color-mix(in srgb, var(--pch-primary) 7%, var(--surface, #fff)));
  border: 1px solid var(--border, rgba(148,163,184,.18));
}

.pch-view-tabs button {
  min-width: 0;
  min-height: 35px;
  border: 0;
  border-radius: 999px;
  padding: 0 9px;
  background: transparent;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.pch-view-tabs button.active {
  background: var(--pch-primary);
  color: #fff;
}

.pch-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.pch-section { margin-top: 16px; }

.pch-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.pch-section-head p {
  margin: 0;
  color: var(--pch-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.pch-section-head h3 {
  margin: 2px 0 0;
  color: var(--text, #0f172a);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.pch-list,
.pch-breakdown-grid {
  display: grid;
  gap: 10px;
}

.pch-card,
.pch-breakdown-card,
.pch-empty-card {
  min-width: 0;
  border-radius: 24px;
  padding: 13px;
  overflow: hidden;
}

.pch-card {
  background:
    linear-gradient(135deg, var(--card, var(--surface, #fff)), color-mix(in srgb, var(--pch-primary) 4%, var(--card, #fff)));
}

.pch-card-top,
.pch-profile-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.pch-avatar,
.pch-profile-avatar {
  width: 56px;
  height: 56px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 19px;
  background: var(--pch-primary);
  color: #fff;
  font-size: 22px;
  font-weight: 1000;
  box-shadow: 0 12px 24px rgba(15,23,42,.12);
  overflow: hidden;
}

.pch-profile-avatar {
  width: 72px;
  height: 72px;
  border-radius: 24px;
  font-size: 28px;
}

.pch-avatar img,
.pch-profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pch-card-main { min-width: 0; flex: 1; }

.pch-card-main h3,
.pch-profile-top h3 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.pch-profile-top h3 { font-size: 22px; }

.pch-card-main p,
.pch-profile-top p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.pch-chip-row,
.pch-action-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.pch-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
}

.pch-chip.green { background: rgba(34,197,94,.14); color: #22c55e; }
.pch-chip.red { background: rgba(239,68,68,.14); color: #ef4444; }
.pch-chip.blue { background: rgba(59,130,246,.15); color: #60a5fa; }
.pch-chip.gray { background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent); color: var(--muted, #64748b); }
.pch-chip.orange { background: rgba(245,158,11,.16); color: #f59e0b; }
.pch-chip.purple { background: rgba(147,51,234,.15); color: #a855f7; }

.pch-mini-grid,
.pch-drawer-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.pch-mini-stat {
  min-width: 0;
  padding: 9px;
  border-radius: 17px;
  background: color-mix(in srgb, var(--muted, #64748b) 9%, transparent);
  border: 1px solid var(--border, rgba(148,163,184,.13));
  overflow: hidden;
}

.pch-mini-stat strong,
.pch-mini-stat span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pch-mini-stat strong {
  color: var(--text, #0f172a);
  font-size: 13px;
  font-weight: 1000;
}

.pch-mini-stat span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 850;
}

.pch-breakdown-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.pch-breakdown-card strong {
  min-width: 0;
  display: block;
  color: var(--text, #0f172a);
  font-size: 16px;
  font-weight: 1000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pch-bar-track {
  height: 8px;
  margin-top: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent);
  overflow: hidden;
}

.pch-bar-track div {
  height: 100%;
  border-radius: inherit;
  background: var(--pch-primary);
}

.pch-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid var(--border, rgba(148,163,184,.18));
}

.pch-table-scroll table {
  width: 100%;
  min-width: 1050px;
  border-collapse: collapse;
  background: var(--card, var(--surface, #fff));
}

.pch-table-scroll th,
.pch-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid var(--border, rgba(148,163,184,.16));
  text-align: left;
  vertical-align: top;
  color: var(--text, #0f172a);
  font-size: 13px;
}

.pch-table-scroll th {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
  background: color-mix(in srgb, var(--pch-primary) 6%, var(--card, #fff));
}

.pch-table-scroll td strong,
.pch-table-scroll td span {
  display: block;
}

.pch-table-scroll td span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
}

.pch-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 190px;
  text-align: center;
  border-style: dashed;
}

.pch-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--pch-primary) 12%, var(--surface, #fff));
  font-size: 28px;
}

.pch-empty-card h3 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: 18px;
  font-weight: 1000;
}

.pch-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.pch-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
}

.pch-drawer-overlay {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(15,23,42,.52);
}

.pch-drawer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(94vw, 620px);
  max-width: 100vw;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--card, var(--surface, #fff));
  color: var(--text, #0f172a);
  padding: 14px;
  box-shadow: var(--shell-shadow, -24px 0 70px rgba(15,23,42,.22));
}

.pch-drawer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0 12px;
  background: var(--card, var(--surface, #fff));
}

.pch-drawer-head div { min-width: 0; }

.pch-drawer-head p {
  margin: 0;
  color: var(--pch-primary);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.pch-drawer-head h2,
.pch-drawer-head span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pch-drawer-head h2 {
  margin: 2px 0 0;
  color: var(--text, #0f172a);
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.pch-drawer-head span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.pch-drawer-head button {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border: 1px solid var(--border, rgba(148,163,184,.24));
  border-radius: 15px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-weight: 1000;
  cursor: pointer;
}

.pch-drawer-section { margin-top: 16px; }

.pch-drawer-section h3 {
  margin: 0 0 10px;
  color: var(--text, #0f172a);
  font-size: 16px;
  font-weight: 1000;
}

.pch-line-list {
  display: grid;
  gap: 7px;
}

.pch-line-list div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--muted, #64748b) 9%, transparent);
  border: 1px solid var(--border, rgba(148,163,184,.14));
}

.pch-line-list span {
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.pch-line-list strong {
  color: var(--text, #0f172a);
  font-size: 13px;
  font-weight: 1000;
  text-align: right;
}

@media (min-width: 680px) {
  .pch-page { padding: 12px; }
  .pch-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .pch-filter-card { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .pch-context-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .pch-page { padding: 16px; }
  .pch-summary-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .pch-list,
  .pch-breakdown-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .pch-page { padding: 6px; }
  .pch-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .pch-hero-actions { display: grid; grid-template-columns: minmax(0, 1fr); }
  .pch-ghost-btn { width: 100%; }
  .pch-summary-grid { gap: 6px; }
  .pch-summary-card { padding: 10px; border-radius: 19px; }
  .pch-summary-card strong { font-size: 16px; }
  .pch-toolbar { align-items: stretch; flex-direction: column; border-radius: 20px; }
  .pch-view-tabs { width: 100%; }
  .pch-card,
  .pch-empty-card,
  .pch-breakdown-card { border-radius: 20px; padding: 11px; }
  .pch-avatar { width: 52px; height: 52px; flex-basis: 52px; }
  .pch-mini-grid,
  .pch-drawer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pch-action-row { display: grid; grid-template-columns: minmax(0, 1fr); }
  .pch-action-row button { width: 100%; }
  .pch-drawer { width: min(96vw, 620px); padding: 12px; }
}
`;
