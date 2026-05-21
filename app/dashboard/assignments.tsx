"use client";

/**
 * assignments.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE STAFF ASSIGNMENT & ROLE MANAGEMENT CENTER
 * ---------------------------------------------------------
 *
 * Handles three assignment layers:
 * 1. Subject Teaching Assignment
 *    DB: assignments
 *    Shape: teacherId + classId + subjectId
 *    Also updates matching ClassSubject.teacherId when possible.
 *
 * 2. Class Teacher Assignment
 *    DB: classTeachers
 *    Shape: teacherId + classId
 *
 * 3. Institutional Role Assignment
 *    DB: teachers.role
 *    Shape: teacher.role = "teacher" | "head_teacher" | "lecturer" | "principal"
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Mobile-first cards and drawer UI.
 * - Dashboard-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import {
  db,
  Assignment,
  Class,
  ClassSubject,
  ClassTeacher,
  Subject,
  Teacher,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";

// ======================================================
// TYPES
// ======================================================

type TabMode = "subject" | "classTeacher" | "roles";

type TeacherRole = "teacher" | "head_teacher" | "lecturer" | "principal";

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type SubjectAssignmentForm = {
  id?: number;
  teacherId?: number;
  classId?: number;
  subjectId?: number;
  classSubjectId?: number;
};

type ClassTeacherForm = {
  id?: number;
  teacherId?: number;
  classId?: number;
};

type RoleForm = {
  teacherId?: number;
  role: TeacherRole;
};

type SubjectAssignmentView = {
  row: Assignment;
  teacherName: string;
  teacherRole: TeacherRole | string;
  teacherPhoto?: string;
  className: string;
  subjectName: string;
  subjectCode?: string;
  classSubjectId?: number;
  classSubjectLabel: string;
};

type ClassTeacherView = {
  row: ClassTeacher;
  teacherName: string;
  teacherRole: TeacherRole | string;
  teacherPhoto?: string;
  className: string;
};

type TeacherRoleView = {
  teacher: Teacher;
  classTeacherCount: number;
  subjectAssignmentCount: number;
};

// ======================================================
// OPTIONS
// ======================================================

const roleOptions: { value: TeacherRole; label: string; description: string }[] = [
  {
    value: "teacher",
    label: "Teacher",
    description: "Regular classroom or subject teacher.",
  },
  {
    value: "head_teacher",
    label: "Head Teacher",
    description: "School academic/administrative head role.",
  },
  {
    value: "principal",
    label: "Principal",
    description: "Principal/head of institution role.",
  },
  {
    value: "lecturer",
    label: "Lecturer",
    description: "Tertiary or course delivery role.",
  },
];

// ======================================================
// COMPONENT
// ======================================================

export default function AssignmentsPage() {
  const router = useRouter();

  const {
    accountId,
    loading: accountLoading,
    authenticated,
  } = useAccount();

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabMode>("subject");

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classTeachers, setClassTeachers] = useState<ClassTeacher[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);

  const [search, setSearch] = useState("");
  const [filterTeacherId, setFilterTeacherId] = useState<number | undefined>();
  const [filterClassId, setFilterClassId] = useState<number | undefined>();
  const [filterSubjectId, setFilterSubjectId] = useState<number | undefined>();
  const [filterRole, setFilterRole] = useState<TeacherRole | "all">("all");

  const [subjectDrawerOpen, setSubjectDrawerOpen] = useState(false);
  const [classTeacherDrawerOpen, setClassTeacherDrawerOpen] = useState(false);
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);

  const [subjectEditMode, setSubjectEditMode] = useState(false);
  const [classTeacherEditMode, setClassTeacherEditMode] = useState(false);

  const [subjectForm, setSubjectForm] = useState<SubjectAssignmentForm>({
    teacherId: undefined,
    classId: undefined,
    subjectId: undefined,
    classSubjectId: undefined,
  });

  const [classTeacherForm, setClassTeacherForm] = useState<ClassTeacherForm>({
    teacherId: undefined,
    classId: undefined,
  });

  const [roleForm, setRoleForm] = useState<RoleForm>({
    teacherId: undefined,
    role: "teacher",
  });

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
      router.replace("/account");
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

  const clearData = () => {
    setAssignments([]);
    setClassTeachers([]);
    setTeachers([]);
    setClasses([]);
    setSubjects([]);
    setClassSubjects([]);
  };

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        assignmentRows,
        classTeacherRows,
        teacherRows,
        classRows,
        subjectRows,
        classSubjectRows,
      ] = await Promise.all([
        db.assignments.toArray(),
        db.classTeachers.toArray(),
        db.teachers.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.classSubjects.toArray(),
      ]);

      setAssignments(assignmentRows.filter(sameTenant));
      setClassTeachers(classTeacherRows.filter(sameTenant));
      setTeachers(
        teacherRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );
      setClasses(
        classRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setSubjects(
        subjectRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setClassSubjects(
        classSubjectRows.filter((row) => sameTenant(row) && row.active !== false)
      );
    } catch (error) {
      console.error("Failed to load assignments:", error);
      clearData();
      alert("Failed to load assignments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const teacherMap = useMemo(
    () => new Map(teachers.map((row) => [row.id, row])),
    [teachers]
  );

  const classMap = useMemo(
    () => new Map(classes.map((row) => [row.id, row])),
    [classes]
  );

  const subjectMap = useMemo(
    () => new Map(subjects.map((row) => [row.id, row])),
    [subjects]
  );

  const matchingClassSubjectMap = useMemo(() => {
    const map = new Map<string, ClassSubject>();

    classSubjects.forEach((row) => {
      map.set(`${row.classId}-${row.subjectId}`, row);
    });

    return map;
  }, [classSubjects]);

  const classTeacherByClass = useMemo(() => {
    const map = new Map<number, ClassTeacher>();

    classTeachers.forEach((row) => {
      map.set(row.classId, row);
    });

    return map;
  }, [classTeachers]);

  const subjectAssignmentCounts = useMemo(() => {
    const map = new Map<number, number>();

    assignments.forEach((row) => {
      map.set(row.teacherId, (map.get(row.teacherId) || 0) + 1);
    });

    return map;
  }, [assignments]);

  const classTeacherCounts = useMemo(() => {
    const map = new Map<number, number>();

    classTeachers.forEach((row) => {
      map.set(row.teacherId, (map.get(row.teacherId) || 0) + 1);
    });

    return map;
  }, [classTeachers]);

  // ======================================================
  // CLASS SUBJECT HELPERS
  // ======================================================

  const availableClassSubjects = useMemo(() => {
    return classSubjects
      .filter((row) => {
        if (subjectForm.classId && row.classId !== Number(subjectForm.classId)) return false;
        if (subjectForm.subjectId && row.subjectId !== Number(subjectForm.subjectId)) return false;
        return true;
      })
      .sort((a, b) => {
        const classA = classMap.get(a.classId)?.name || "";
        const classB = classMap.get(b.classId)?.name || "";
        const subjectA = subjectMap.get(a.subjectId)?.name || "";
        const subjectB = subjectMap.get(b.subjectId)?.name || "";
        return `${classA} ${subjectA}`.localeCompare(`${classB} ${subjectB}`);
      });
  }, [classSubjects, subjectForm.classId, subjectForm.subjectId, classMap, subjectMap]);

  const availableSubjectsForClass = useMemo(() => {
    if (!subjectForm.classId) return subjects;

    const subjectIds = new Set(
      classSubjects
        .filter((row) => row.classId === Number(subjectForm.classId))
        .map((row) => row.subjectId)
    );

    if (!subjectIds.size) return subjects;

    return subjects.filter((subject) => subject.id && subjectIds.has(subject.id));
  }, [subjects, classSubjects, subjectForm.classId]);

  // ======================================================
  // VIEW MODELS
  // ======================================================

  const subjectAssignmentViews = useMemo<SubjectAssignmentView[]>(() => {
    return assignments.map((row) => {
      const teacher = teacherMap.get(row.teacherId);
      const classData = classMap.get(row.classId);
      const subject = subjectMap.get(row.subjectId);
      const classSubject = matchingClassSubjectMap.get(`${row.classId}-${row.subjectId}`);

      return {
        row,
        teacherName: teacher?.fullName || "Unknown Teacher",
        teacherRole: teacher?.role || "teacher",
        teacherPhoto: teacher?.photo,
        className: classData?.name || "Unknown Class",
        subjectName: subject?.name || "Unknown Subject",
        subjectCode: subject?.code,
        classSubjectId: classSubject?.id,
        classSubjectLabel: classSubject
          ? `${classData?.name || "Class"} • ${classSubject.name || subject?.name || "Subject"}`
          : "No ClassSubject link",
      };
    });
  }, [assignments, teacherMap, classMap, subjectMap, matchingClassSubjectMap]);

  const classTeacherViews = useMemo<ClassTeacherView[]>(() => {
    return classTeachers.map((row) => {
      const teacher = teacherMap.get(row.teacherId);
      const classData = classMap.get(row.classId);

      return {
        row,
        teacherName: teacher?.fullName || "Unknown Teacher",
        teacherRole: teacher?.role || "teacher",
        teacherPhoto: teacher?.photo,
        className: classData?.name || "Unknown Class",
      };
    });
  }, [classTeachers, teacherMap, classMap]);

  const teacherRoleViews = useMemo<TeacherRoleView[]>(() => {
    return teachers.map((teacher) => ({
      teacher,
      classTeacherCount: teacher.id ? classTeacherCounts.get(teacher.id) || 0 : 0,
      subjectAssignmentCount: teacher.id ? subjectAssignmentCounts.get(teacher.id) || 0 : 0,
    }));
  }, [teachers, classTeacherCounts, subjectAssignmentCounts]);

  const filteredSubjectAssignments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return subjectAssignmentViews
      .filter((item) => {
        const row = item.row;

        if (filterTeacherId && row.teacherId !== filterTeacherId) return false;
        if (filterClassId && row.classId !== filterClassId) return false;
        if (filterSubjectId && row.subjectId !== filterSubjectId) return false;
        if (filterRole !== "all" && item.teacherRole !== filterRole) return false;

        if (!query) return true;

        return `
          ${item.teacherName}
          ${item.teacherRole}
          ${item.className}
          ${item.subjectName}
          ${item.subjectCode || ""}
          ${item.classSubjectLabel}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const teacherCompare = a.teacherName.localeCompare(b.teacherName);
        if (teacherCompare !== 0) return teacherCompare;
        return `${a.className} ${a.subjectName}`.localeCompare(`${b.className} ${b.subjectName}`);
      });
  }, [subjectAssignmentViews, search, filterTeacherId, filterClassId, filterSubjectId, filterRole]);

  const filteredClassTeachers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return classTeacherViews
      .filter((item) => {
        const row = item.row;

        if (filterTeacherId && row.teacherId !== filterTeacherId) return false;
        if (filterClassId && row.classId !== filterClassId) return false;
        if (filterRole !== "all" && item.teacherRole !== filterRole) return false;

        if (!query) return true;

        return `
          ${item.teacherName}
          ${item.teacherRole}
          ${item.className}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.className.localeCompare(b.className));
  }, [classTeacherViews, search, filterTeacherId, filterClassId, filterRole]);

  const filteredTeacherRoles = useMemo(() => {
    const query = search.trim().toLowerCase();

    return teacherRoleViews
      .filter((item) => {
        const teacher = item.teacher;

        if (filterTeacherId && teacher.id !== filterTeacherId) return false;
        if (filterRole !== "all" && teacher.role !== filterRole) return false;

        if (!query) return true;

        return `
          ${teacher.fullName}
          ${teacher.role}
          ${teacher.email || ""}
          ${teacher.phone || ""}
          ${teacher.qualification || ""}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.teacher.fullName.localeCompare(b.teacher.fullName));
  }, [teacherRoleViews, search, filterTeacherId, filterRole]);

  // ======================================================
  // SUMMARY
  // ======================================================

  const summary = useMemo(() => {
    return {
      subjectAssignments: assignments.length,
      classTeachers: classTeachers.length,
      teachers: teachers.length,
      teachersAssignedToSubjects: new Set(assignments.map((row) => row.teacherId)).size,
      classesWithClassTeachers: new Set(classTeachers.map((row) => row.classId)).size,
      headTeachers: teachers.filter((row) => row.role === "head_teacher").length,
      principals: teachers.filter((row) => row.role === "principal").length,
      lecturers: teachers.filter((row) => row.role === "lecturer").length,
    };
  }, [assignments, classTeachers, teachers]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateSubjectForm = (patch: Partial<SubjectAssignmentForm>) => {
    setSubjectForm((prev) => ({ ...prev, ...patch }));
  };

  const updateClassTeacherForm = (patch: Partial<ClassTeacherForm>) => {
    setClassTeacherForm((prev) => ({ ...prev, ...patch }));
  };

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      alert("Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  const openCreateSubjectAssignment = () => {
    if (!requireTenant()) return;

    setSubjectEditMode(false);
    setSubjectForm({
      teacherId: undefined,
      classId: undefined,
      subjectId: undefined,
      classSubjectId: undefined,
    });
    setSubjectDrawerOpen(true);
  };

  const openEditSubjectAssignment = (row: Assignment) => {
    setSubjectEditMode(true);

    const classSubject = matchingClassSubjectMap.get(`${row.classId}-${row.subjectId}`);

    setSubjectForm({
      id: row.id,
      teacherId: row.teacherId,
      classId: row.classId,
      subjectId: row.subjectId,
      classSubjectId: classSubject?.id,
    });

    setSubjectDrawerOpen(true);
  };

  const openCreateClassTeacher = () => {
    if (!requireTenant()) return;

    setClassTeacherEditMode(false);
    setClassTeacherForm({ teacherId: undefined, classId: undefined });
    setClassTeacherDrawerOpen(true);
  };

  const openEditClassTeacher = (row: ClassTeacher) => {
    setClassTeacherEditMode(true);
    setClassTeacherForm({
      id: row.id,
      teacherId: row.teacherId,
      classId: row.classId,
    });
    setClassTeacherDrawerOpen(true);
  };

  const openRoleDrawer = (teacher?: Teacher) => {
    if (!requireTenant()) return;

    setRoleForm({
      teacherId: teacher?.id,
      role: teacher?.role || "teacher",
    });
    setRoleDrawerOpen(true);
  };

  const assignFromClassSubject = (classSubjectId: number) => {
    const classSubject = classSubjects.find((row) => row.id === classSubjectId);
    if (!classSubject) return;

    updateSubjectForm({
      classSubjectId,
      classId: classSubject.classId,
      subjectId: classSubject.subjectId,
      teacherId: classSubject.teacherId || subjectForm.teacherId,
    });
  };

  // ======================================================
  // VALIDATION + SAVE SUBJECT ASSIGNMENT
  // ======================================================

  const validateSubjectAssignment = () => {
    if (!authenticated || !accountId) return "Sign in first";
    if (!schoolId || !branchId) return "Select a branch first";
    if (!subjectForm.teacherId) return "Select a teacher";
    if (!subjectForm.classId) return "Select a class";
    if (!subjectForm.subjectId) return "Select a subject";

    const duplicate = assignments.find((row) => {
      if (subjectEditMode && row.id === subjectForm.id) return false;

      return (
        row.teacherId === Number(subjectForm.teacherId) &&
        row.classId === Number(subjectForm.classId) &&
        row.subjectId === Number(subjectForm.subjectId) &&
        !row.isDeleted
      );
    });

    if (duplicate) return "This teacher is already assigned to this class and subject";
    return null;
  };

  const saveSubjectAssignment = async () => {
    const error = validateSubjectAssignment();
    if (error) return alert(error);

    try {
      setSaving(true);

      const payload = prepareSyncData({
        accountId,
        schoolId,
        branchId,
        teacherId: Number(subjectForm.teacherId),
        classId: Number(subjectForm.classId),
        subjectId: Number(subjectForm.subjectId),
      }) as Assignment;

      if (subjectEditMode && subjectForm.id) {
        await db.assignments.update(subjectForm.id, {
          accountId: payload.accountId,
          schoolId: payload.schoolId,
          branchId: payload.branchId,
          teacherId: payload.teacherId,
          classId: payload.classId,
          subjectId: payload.subjectId,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        });
      } else {
        await db.assignments.add(payload);
      }

      const matchedClassSubject =
        (subjectForm.classSubjectId
          ? classSubjects.find((row) => row.id === Number(subjectForm.classSubjectId))
          : undefined) ||
        matchingClassSubjectMap.get(`${Number(subjectForm.classId)}-${Number(subjectForm.subjectId)}`);

      if (matchedClassSubject?.id) {
        await db.classSubjects.update(matchedClassSubject.id, {
          teacherId: Number(subjectForm.teacherId),
          updatedAt: Date.now(),
        });
      }

      setSubjectDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save subject assignment:", error);
      alert("Failed to save subject assignment");
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // VALIDATION + SAVE CLASS TEACHER
  // ======================================================

  const validateClassTeacher = () => {
    if (!authenticated || !accountId) return "Sign in first";
    if (!schoolId || !branchId) return "Select a branch first";
    if (!classTeacherForm.teacherId) return "Select a teacher";
    if (!classTeacherForm.classId) return "Select a class";

    const existingForClass = classTeachers.find((row) => {
      if (classTeacherEditMode && row.id === classTeacherForm.id) return false;
      return row.classId === Number(classTeacherForm.classId) && !row.isDeleted;
    });

    if (existingForClass) {
      return "This class already has a class teacher. Edit the existing class teacher instead.";
    }

    return null;
  };

  const saveClassTeacher = async () => {
    const error = validateClassTeacher();
    if (error) return alert(error);

    try {
      setSaving(true);

      const payload = prepareSyncData({
        accountId,
        schoolId,
        branchId,
        teacherId: Number(classTeacherForm.teacherId),
        classId: Number(classTeacherForm.classId),
      }) as ClassTeacher;

      if (classTeacherEditMode && classTeacherForm.id) {
        await db.classTeachers.update(classTeacherForm.id, {
          accountId: payload.accountId,
          schoolId: payload.schoolId,
          branchId: payload.branchId,
          teacherId: payload.teacherId,
          classId: payload.classId,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        });
      } else {
        await db.classTeachers.add(payload);
      }

      setClassTeacherDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save class teacher:", error);
      alert("Failed to save class teacher");
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // SAVE ROLE
  // ======================================================

  const saveRole = async () => {
    if (!requireTenant()) return;
    if (!roleForm.teacherId) return alert("Select a teacher");
    if (!roleForm.role) return alert("Select a role");

    const teacher = teachers.find((row) => row.id === roleForm.teacherId);
    if (!teacher) return alert("Teacher not found in this branch");

    try {
      setSaving(true);

      await db.teachers.update(roleForm.teacherId, {
        role: roleForm.role,
        updatedAt: Date.now(),
      });

      setRoleDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save teacher role:", error);
      alert("Failed to save teacher role");
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // DELETE ACTIONS
  // ======================================================

  const removeSubjectAssignment = async (id?: number) => {
    if (!id) return;
    if (!confirm("Delete this subject assignment?")) return;

    await db.assignments.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const removeClassTeacher = async (id?: number) => {
    if (!id) return;
    if (!confirm("Remove this class teacher assignment?")) return;

    await db.classTeachers.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const roleBadgeTone = (role?: string): "green" | "blue" | "purple" | "orange" | "gray" => {
    if (role === "principal") return "purple";
    if (role === "head_teacher") return "orange";
    if (role === "lecturer") return "blue";
    if (role === "teacher") return "green";
    return "gray";
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="as-page" style={{ "--as-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="as-state-card">
          <div className="as-spinner" />
          <h2>Opening assignments...</h2>
          <p>Checking account, school, branch, teachers, classes, and subjects.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="as-page" style={{ "--as-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="as-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing assignments.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="as-page" style={{ "--as-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="as-state-card">
          <h2>Select a branch first</h2>
          <p>Assignments belong to one active school branch.</p>
          <button type="button" className="as-primary-btn" onClick={() => router.push("/account")}>
            Go to Account Setup
          </button>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="as-page" style={{ "--as-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="as-hero">
        <div className="as-hero-left">
          <div className="as-hero-icon">🧩</div>
          <div className="as-title-wrap">
            <p>Staff Workload</p>
            <h2>Assignments</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <div className="as-hero-actions">
          {tab === "subject" && (
            <button type="button" onClick={openCreateSubjectAssignment} className="as-primary-btn">
              + Subject Assignment
            </button>
          )}
          {tab === "classTeacher" && (
            <button type="button" onClick={openCreateClassTeacher} className="as-primary-btn">
              + Class Teacher
            </button>
          )}
          {tab === "roles" && (
            <button type="button" onClick={() => openRoleDrawer()} className="as-primary-btn">
              + Assign Role
            </button>
          )}
        </div>
      </section>

      <section className="as-tabs" aria-label="Assignment sections">
        <button type="button" onClick={() => setTab("subject")} className={tab === "subject" ? "active" : ""}>
          Subject Teachers
        </button>
        <button type="button" onClick={() => setTab("classTeacher")} className={tab === "classTeacher" ? "active" : ""}>
          Class Teachers
        </button>
        <button type="button" onClick={() => setTab("roles")} className={tab === "roles" ? "active" : ""}>
          Roles
        </button>
      </section>

      <section className="as-summary-grid" aria-label="Assignment summary">
        <SummaryCard label="Subject Assignments" value={summary.subjectAssignments} icon="📚" />
        <SummaryCard label="Class Teachers" value={summary.classTeachers} icon="🏷" />
        <SummaryCard label="Teachers" value={summary.teachers} icon="👨‍🏫" />
        <SummaryCard label="Head Teachers" value={summary.headTeachers} icon="⭐" />
        <SummaryCard label="Principals" value={summary.principals} icon="🏛" />
      </section>

      <section className="as-filter-card">
        <input
          placeholder="Search teacher, class, subject, role..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          value={filterTeacherId || ""}
          onChange={(event) => setFilterTeacherId(Number(event.target.value) || undefined)}
        >
          <option value="">All Teachers</option>
          {teachers.map((row) => (
            <option key={row.id} value={row.id}>{row.fullName}</option>
          ))}
        </select>

        {tab !== "roles" && (
          <select
            value={filterClassId || ""}
            onChange={(event) => setFilterClassId(Number(event.target.value) || undefined)}
          >
            <option value="">All Classes</option>
            {classes.map((row) => (
              <option key={row.id} value={row.id}>{row.name}</option>
            ))}
          </select>
        )}

        {tab === "subject" && (
          <select
            value={filterSubjectId || ""}
            onChange={(event) => setFilterSubjectId(Number(event.target.value) || undefined)}
          >
            <option value="">All Subjects</option>
            {subjects.map((row) => (
              <option key={row.id} value={row.id}>{row.name}</option>
            ))}
          </select>
        )}

        <select
          value={filterRole}
          onChange={(event) => setFilterRole(event.target.value as TeacherRole | "all")}
        >
          <option value="all">All Roles</option>
          {roleOptions.map((role) => (
            <option key={role.value} value={role.value}>{role.label}</option>
          ))}
        </select>
      </section>

      {tab === "subject" && (
        <section className="as-list">
          {filteredSubjectAssignments.map((item) => (
            <article key={item.row.id} className="as-entity-card">
              <div className="as-card-top">
                <Avatar name={item.teacherName} photo={item.teacherPhoto} primary={primary} />

                <div className="as-card-main">
                  <h3>{item.teacherName}</h3>
                  <p>{item.classSubjectLabel}</p>
                  <div className="as-chip-row">
                    <Chip tone={roleBadgeTone(item.teacherRole)}>{String(item.teacherRole).replace("_", " ")}</Chip>
                    <Chip tone="blue">{item.className}</Chip>
                    <Chip tone="purple">{item.subjectName}</Chip>
                    {item.subjectCode && <Chip tone="gray">{item.subjectCode}</Chip>}
                  </div>
                </div>
              </div>

              <div className="as-action-row">
                <button type="button" onClick={() => openEditSubjectAssignment(item.row)}>Edit</button>
                <button type="button" className="danger" onClick={() => removeSubjectAssignment(item.row.id)}>Delete</button>
              </div>
            </article>
          ))}

          {!filteredSubjectAssignments.length && <EmptyCard text="No subject teacher assignments found." />}
        </section>
      )}

      {tab === "classTeacher" && (
        <section className="as-list">
          {filteredClassTeachers.map((item) => (
            <article key={item.row.id} className="as-entity-card">
              <div className="as-card-top">
                <Avatar name={item.teacherName} photo={item.teacherPhoto} primary={primary} />

                <div className="as-card-main">
                  <h3>{item.teacherName}</h3>
                  <p>Responsible class teacher for {item.className}.</p>
                  <div className="as-chip-row">
                    <Chip tone={roleBadgeTone(item.teacherRole)}>{String(item.teacherRole).replace("_", " ")}</Chip>
                    <Chip tone="blue">{item.className}</Chip>
                    <Chip tone="green">Class Teacher</Chip>
                  </div>
                </div>
              </div>

              <div className="as-action-row">
                <button type="button" onClick={() => openEditClassTeacher(item.row)}>Edit</button>
                <button type="button" className="danger" onClick={() => removeClassTeacher(item.row.id)}>Remove</button>
              </div>
            </article>
          ))}

          {!filteredClassTeachers.length && <EmptyCard text="No class teacher assignments found." />}
        </section>
      )}

      {tab === "roles" && (
        <section className="as-list">
          {filteredTeacherRoles.map((item) => (
            <article key={item.teacher.id} className="as-entity-card">
              <div className="as-card-top">
                <Avatar name={item.teacher.fullName} photo={item.teacher.photo} primary={primary} />

                <div className="as-card-main">
                  <h3>{item.teacher.fullName}</h3>
                  <p>{item.teacher.email || item.teacher.phone || item.teacher.qualification || "No contact details"}</p>
                  <div className="as-chip-row">
                    <Chip tone={roleBadgeTone(item.teacher.role)}>{item.teacher.role.replace("_", " ")}</Chip>
                    <Chip tone="blue">{item.subjectAssignmentCount} subject assignment(s)</Chip>
                    <Chip tone="green">{item.classTeacherCount} class teacher role(s)</Chip>
                    {item.teacher.qualification && <Chip tone="gray">{item.teacher.qualification}</Chip>}
                  </div>
                </div>
              </div>

              <div className="as-action-row">
                <button type="button" onClick={() => openRoleDrawer(item.teacher)}>Change Role</button>
              </div>
            </article>
          ))}

          {!filteredTeacherRoles.length && <EmptyCard text="No teachers found for the selected filters." />}
        </section>
      )}

      {subjectDrawerOpen && (
        <Drawer
          title={subjectEditMode ? "Edit Subject Assignment" : "Create Subject Assignment"}
          subtitle="Assign a teacher to a class and subject. This also updates ClassSubject.teacherId where possible."
          onClose={() => setSubjectDrawerOpen(false)}
        >
          <div className="as-form-grid">
            <Field label="Class Subject Context">
              <select value={subjectForm.classSubjectId || ""} onChange={(event) => assignFromClassSubject(Number(event.target.value))}>
                <option value="">Optional: Select ClassSubject</option>
                {availableClassSubjects.map((row) => {
                  const className = classMap.get(row.classId)?.name || "Class";
                  const subjectName = row.name || subjectMap.get(row.subjectId)?.name || "Subject";
                  const currentTeacher = row.teacherId ? teacherMap.get(row.teacherId)?.fullName : undefined;
                  return (
                    <option key={row.id} value={row.id}>
                      {className} • {subjectName} {currentTeacher ? `• ${currentTeacher}` : ""}
                    </option>
                  );
                })}
              </select>
            </Field>

            <Field label="Teacher">
              <select value={subjectForm.teacherId || ""} onChange={(event) => updateSubjectForm({ teacherId: Number(event.target.value) || undefined })}>
                <option value="">Select Teacher</option>
                {teachers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.fullName} • {row.role.replace("_", " ")} • {subjectAssignmentCounts.get(row.id || 0) || 0} load(s)
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Class">
              <select
                value={subjectForm.classId || ""}
                onChange={(event) => updateSubjectForm({ classId: Number(event.target.value) || undefined, subjectId: undefined, classSubjectId: undefined })}
              >
                <option value="">Select Class</option>
                {classes.map((row) => (
                  <option key={row.id} value={row.id}>{row.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Subject">
              <select
                value={subjectForm.subjectId || ""}
                onChange={(event) => updateSubjectForm({ subjectId: Number(event.target.value) || undefined, classSubjectId: undefined })}
              >
                <option value="">Select Subject</option>
                {availableSubjectsForClass.map((row) => (
                  <option key={row.id} value={row.id}>{row.name} {row.code ? `• ${row.code}` : ""}</option>
                ))}
              </select>
            </Field>

            <button type="button" onClick={saveSubjectAssignment} disabled={saving} className="as-save-btn">
              {saving ? "Saving..." : subjectEditMode ? "Save Changes" : "Create Subject Assignment"}
            </button>
          </div>
        </Drawer>
      )}

      {classTeacherDrawerOpen && (
        <Drawer
          title={classTeacherEditMode ? "Edit Class Teacher" : "Assign Class Teacher"}
          subtitle="Assign the teacher responsible for a class. This uses the ClassTeacher table."
          onClose={() => setClassTeacherDrawerOpen(false)}
        >
          <div className="as-form-grid">
            <Field label="Teacher">
              <select value={classTeacherForm.teacherId || ""} onChange={(event) => updateClassTeacherForm({ teacherId: Number(event.target.value) || undefined })}>
                <option value="">Select Teacher</option>
                {teachers.map((row) => (
                  <option key={row.id} value={row.id}>{row.fullName} • {row.role.replace("_", " ")}</option>
                ))}
              </select>
            </Field>

            <Field label="Class">
              <select value={classTeacherForm.classId || ""} onChange={(event) => updateClassTeacherForm({ classId: Number(event.target.value) || undefined })}>
                <option value="">Select Class</option>
                {classes.map((row) => {
                  const existing = row.id ? classTeacherByClass.get(row.id) : undefined;
                  const existingTeacher = existing ? teacherMap.get(existing.teacherId)?.fullName : undefined;
                  return (
                    <option key={row.id} value={row.id}>
                      {row.name} {existingTeacher && existing?.id !== classTeacherForm.id ? `• already: ${existingTeacher}` : ""}
                    </option>
                  );
                })}
              </select>
            </Field>

            <button type="button" onClick={saveClassTeacher} disabled={saving} className="as-save-btn">
              {saving ? "Saving..." : classTeacherEditMode ? "Save Changes" : "Assign Class Teacher"}
            </button>
          </div>
        </Drawer>
      )}

      {roleDrawerOpen && (
        <Drawer
          title="Assign Institutional Role"
          subtitle="This updates the teacher's role field. Use this for principal, head teacher, lecturer, or regular teacher role."
          onClose={() => setRoleDrawerOpen(false)}
        >
          <div className="as-form-grid">
            <Field label="Teacher">
              <select
                value={roleForm.teacherId || ""}
                onChange={(event) => {
                  const teacherId = Number(event.target.value) || undefined;
                  const teacher = teachers.find((row) => row.id === teacherId);
                  setRoleForm({ teacherId, role: teacher?.role || "teacher" });
                }}
              >
                <option value="">Select Teacher</option>
                {teachers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.fullName} • current: {row.role.replace("_", " ")}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Role">
              <select value={roleForm.role} onChange={(event) => setRoleForm((prev) => ({ ...prev, role: event.target.value as TeacherRole }))}>
                {roleOptions.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </Field>

            <section className="as-info-card">
              {roleOptions.find((role) => role.value === roleForm.role)?.description}
            </section>

            <button type="button" onClick={saveRole} disabled={saving} className="as-save-btn">
              {saving ? "Saving..." : "Save Role"}
            </button>
          </div>
        </Drawer>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="as-summary-card">
      <div className="as-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Avatar({ name, photo, primary }: { name: string; photo?: string; primary: string }) {
  return (
    <div
      className="as-avatar"
      style={{
        background: photo ? `url(${photo}) center/cover` : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))`,
      }}
    >
      {!photo && name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`as-chip ${tone}`}>{children}</span>;
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="as-empty-card">
      <div className="as-empty-icon">🔎</div>
      <h3>No records found</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="as-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Drawer({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="as-drawer-layer">
      <button type="button" className="as-drawer-overlay" aria-label="Close drawer" onClick={onClose} />
      <aside className="as-drawer">
        <div className="as-drawer-head">
          <div>
            <p>Assignment Setup</p>
            <h2>{title}</h2>
            <span>{subtitle}</span>
          </div>
          <button type="button" onClick={onClose}>✕</button>
        </div>
        {children}
      </aside>
    </div>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes asSpin {
  to { transform: rotate(360deg); }
}

.as-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background: var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}

.as-page *,
.as-page *::before,
.as-page *::after {
  box-sizing: border-box;
}

.as-page button,
.as-page input,
.as-page select,
.as-page textarea {
  font: inherit;
  max-width: 100%;
}

.as-page input,
.as-page select {
  width: 100%;
  min-height: 43px;
  border: 1px solid rgba(148, 163, 184, .28);
  border-radius: 15px;
  padding: 0 12px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  outline: none;
  font-weight: 750;
}

.as-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}

.as-state-card h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.as-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.as-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--as-primary) 18%, transparent);
  border-top-color: var(--as-primary);
  animation: asSpin .8s linear infinite;
}

.as-primary-btn,
.as-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--as-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

.as-primary-btn:disabled,
.as-save-btn:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.as-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--as-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}

.as-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.as-hero-icon {
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--as-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--as-primary) 28%, transparent);
  font-size: 22px;
}

.as-title-wrap {
  min-width: 0;
}

.as-title-wrap p,
.as-title-wrap h2,
.as-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.as-title-wrap p {
  margin: 0 0 2px;
  color: var(--as-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.as-title-wrap h2 {
  margin: 0;
  font-size: clamp(19px, 5vw, 28px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.as-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.as-hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.as-tabs {
  position: sticky;
  top: 50px;
  z-index: 10;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-top: 8px;
  padding: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg, #f8fafc) 88%, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  backdrop-filter: blur(12px);
}

.as-tabs button {
  min-height: 38px;
  min-width: 0;
  border: 0;
  border-radius: 999px;
  padding: 0 8px;
  background: transparent;
  color: #334155;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.as-tabs button.active {
  background: var(--as-primary);
  color: #fff;
}

.as-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.as-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .04);
  overflow: hidden;
}

.as-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--as-primary) 12%, #fff);
}

.as-summary-card div:last-child {
  min-width: 0;
}

.as-summary-card strong,
.as-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.as-summary-card strong {
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.as-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.as-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
  padding: 10px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 16px 40px rgba(15, 23, 42, .055);
}

.as-list {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.as-entity-card,
.as-empty-card,
.as-info-card {
  min-width: 0;
  border-radius: 24px;
  background: linear-gradient(135deg, #fff, #f8fafc);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
}

.as-entity-card {
  padding: 13px;
}

.as-card-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.as-avatar {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  color: #fff;
  font-weight: 1000;
  box-shadow: 0 12px 24px rgba(15, 23, 42, .12);
}

.as-card-main {
  min-width: 0;
  flex: 1;
}

.as-card-main h3,
.as-card-main p {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.as-card-main h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: -.035em;
}

.as-card-main p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.as-chip-row,
.as-action-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.as-chip {
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
}

.as-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.as-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.as-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.as-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.as-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.as-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

.as-action-row button {
  min-height: 40px;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 999px;
  padding: 0 13px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.as-action-row button.danger {
  color: #dc2626;
  background: rgba(239, 68, 68, .08);
  border-color: rgba(239, 68, 68, .12);
}

.as-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 210px;
  padding: 22px;
  text-align: center;
  border-style: dashed;
}

.as-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--as-primary) 12%, #fff);
  font-size: 28px;
}

.as-empty-card h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}

.as-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.as-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
}

.as-drawer-overlay {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(15, 23, 42, .52);
}

.as-drawer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(94vw, 560px);
  max-width: 100vw;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  padding: 14px;
  box-shadow: -24px 0 70px rgba(15, 23, 42, .22);
}

.as-drawer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0 12px;
  background: var(--surface, #fff);
}

.as-drawer-head div {
  min-width: 0;
}

.as-drawer-head p {
  margin: 0;
  color: var(--as-primary);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.as-drawer-head h2,
.as-drawer-head span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.as-drawer-head h2 {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.as-drawer-head span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.45;
}

.as-drawer-head button {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 15px;
  background: #fff;
  font-weight: 1000;
  cursor: pointer;
}

.as-form-grid {
  display: grid;
  gap: 12px;
}

.as-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.as-field > span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.as-info-card {
  padding: 12px;
  border-radius: 18px;
  background: rgba(148, 163, 184, .09);
  box-shadow: none;
  color: var(--muted, #64748b);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.55;
}

.as-save-btn {
  width: 100%;
}

@media (min-width: 680px) {
  .as-page {
    padding: 12px;
  }

  .as-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .as-filter-card {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .as-page {
    padding: 16px;
  }

  .as-tabs {
    position: static;
    width: min(620px, 100%);
  }

  .as-summary-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .as-filter-card {
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  }

  .as-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .as-page {
    padding: 6px;
  }

  .as-hero {
    flex-direction: column;
    border-radius: 22px;
    padding: 10px;
  }

  .as-hero-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .as-primary-btn {
    width: 100%;
  }

  .as-tabs {
    top: 46px;
    border-radius: 22px;
  }

  .as-tabs button {
    min-height: 36px;
    font-size: 11px;
  }

  .as-summary-grid {
    gap: 6px;
  }

  .as-summary-card {
    padding: 10px;
    border-radius: 19px;
  }

  .as-entity-card,
  .as-empty-card {
    border-radius: 20px;
    padding: 11px;
  }

  .as-action-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .as-action-row button {
    width: 100%;
    padding: 0 8px;
  }

  .as-drawer {
    width: min(96vw, 560px);
    padding: 12px;
  }
}
`;
