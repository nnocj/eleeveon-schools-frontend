"use client";

/**
 * assignments.tsx
 * ---------------------------------------------------------
 * STAFF ASSIGNMENT & ROLE MANAGEMENT CENTER
 * ---------------------------------------------------------
 *
 * DB-safe rewrite for current db.ts.
 *
 * This page now handles THREE real assignment layers:
 *
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
 * Context-aware:
 * Active School -> Active Branch -> Staff Assignments
 */

import React, { useEffect, useMemo, useState } from "react";

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
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type TabMode = "subject" | "classTeacher" | "roles";

type TeacherRole = "teacher" | "head_teacher" | "lecturer" | "principal";

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
  const { settings } = useSettings();
  const {
    activeSchool,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const branchId = activeBranchId || settings?.branchId || 1;
  const primary = settings?.primaryColor || "var(--primary-color)";

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
  // LOAD DATA
  // ======================================================

  const load = async () => {
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

      setAssignments(
        assignmentRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );

      setClassTeachers(
        classTeacherRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );

      setTeachers(
        teacherRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.active !== false
        )
      );

      setClasses(
        classRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.active !== false
        )
      );

      setSubjects(
        subjectRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.active !== false
        )
      );

      setClassSubjects(
        classSubjectRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.active !== false
        )
      );
    } catch (error) {
      console.error("Failed to load assignments:", error);
      alert("Failed to load assignments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const teacherMap = useMemo(
    () => new Map(teachers.map(row => [row.id, row])),
    [teachers]
  );

  const classMap = useMemo(
    () => new Map(classes.map(row => [row.id, row])),
    [classes]
  );

  const subjectMap = useMemo(
    () => new Map(subjects.map(row => [row.id, row])),
    [subjects]
  );

  const matchingClassSubjectMap = useMemo(() => {
    const map = new Map<string, ClassSubject>();

    classSubjects.forEach(row => {
      map.set(`${row.classId}-${row.subjectId}`, row);
    });

    return map;
  }, [classSubjects]);

  const classTeacherByClass = useMemo(() => {
    const map = new Map<number, ClassTeacher>();

    classTeachers.forEach(row => {
      map.set(row.classId, row);
    });

    return map;
  }, [classTeachers]);

  const subjectAssignmentCounts = useMemo(() => {
    const map = new Map<number, number>();

    assignments.forEach(row => {
      map.set(row.teacherId, (map.get(row.teacherId) || 0) + 1);
    });

    return map;
  }, [assignments]);

  const classTeacherCounts = useMemo(() => {
    const map = new Map<number, number>();

    classTeachers.forEach(row => {
      map.set(row.teacherId, (map.get(row.teacherId) || 0) + 1);
    });

    return map;
  }, [classTeachers]);

  // ======================================================
  // CLASS SUBJECT HELPERS
  // ======================================================

  const availableClassSubjects = useMemo(() => {
    return classSubjects
      .filter(row => {
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
        .filter(row => row.classId === Number(subjectForm.classId))
        .map(row => row.subjectId)
    );

    if (!subjectIds.size) return subjects;

    return subjects.filter(subject => subject.id && subjectIds.has(subject.id));
  }, [subjects, classSubjects, subjectForm.classId]);

  // ======================================================
  // VIEW MODELS
  // ======================================================

  const subjectAssignmentViews = useMemo<SubjectAssignmentView[]>(() => {
    return assignments.map(row => {
      const teacher = teacherMap.get(row.teacherId);
      const classData = classMap.get(row.classId);
      const subject = subjectMap.get(row.subjectId);
      const classSubject = matchingClassSubjectMap.get(`${row.classId}-${row.subjectId}`);

      return {
        row,
        teacherName: teacher?.fullName || "Unknown Teacher",
        teacherRole: teacher?.role || "teacher",
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
    return classTeachers.map(row => {
      const teacher = teacherMap.get(row.teacherId);
      const classData = classMap.get(row.classId);

      return {
        row,
        teacherName: teacher?.fullName || "Unknown Teacher",
        teacherRole: teacher?.role || "teacher",
        className: classData?.name || "Unknown Class",
      };
    });
  }, [classTeachers, teacherMap, classMap]);

  const teacherRoleViews = useMemo<TeacherRoleView[]>(() => {
    return teachers.map(teacher => ({
      teacher,
      classTeacherCount: teacher.id ? classTeacherCounts.get(teacher.id) || 0 : 0,
      subjectAssignmentCount: teacher.id ? subjectAssignmentCounts.get(teacher.id) || 0 : 0,
    }));
  }, [teachers, classTeacherCounts, subjectAssignmentCounts]);

  const filteredSubjectAssignments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return subjectAssignmentViews
      .filter(item => {
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
        return `${a.className} ${a.subjectName}`.localeCompare(
          `${b.className} ${b.subjectName}`
        );
      });
  }, [
    subjectAssignmentViews,
    search,
    filterTeacherId,
    filterClassId,
    filterSubjectId,
    filterRole,
  ]);

  const filteredClassTeachers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return classTeacherViews
      .filter(item => {
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
      .filter(item => {
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
      teachersAssignedToSubjects: new Set(assignments.map(row => row.teacherId)).size,
      classesWithClassTeachers: new Set(classTeachers.map(row => row.classId)).size,
      headTeachers: teachers.filter(row => row.role === "head_teacher").length,
      principals: teachers.filter(row => row.role === "principal").length,
      lecturers: teachers.filter(row => row.role === "lecturer").length,
    };
  }, [assignments, classTeachers, teachers]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateSubjectForm = (patch: Partial<SubjectAssignmentForm>) => {
    setSubjectForm(prev => ({ ...prev, ...patch }));
  };

  const updateClassTeacherForm = (patch: Partial<ClassTeacherForm>) => {
    setClassTeacherForm(prev => ({ ...prev, ...patch }));
  };

  const openCreateSubjectAssignment = () => {
    if (!activeBranchId) {
      alert("Select a branch first before creating an assignment.");
      return;
    }

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
    if (!activeBranchId) {
      alert("Select a branch first before assigning a class teacher.");
      return;
    }

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
    setRoleForm({
      teacherId: teacher?.id,
      role: teacher?.role || "teacher",
    });
    setRoleDrawerOpen(true);
  };

  const assignFromClassSubject = (classSubjectId: number) => {
    const classSubject = classSubjects.find(row => row.id === classSubjectId);
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
    if (!activeBranchId) return "Select a branch first";
    if (!subjectForm.teacherId) return "Select a teacher";
    if (!subjectForm.classId) return "Select a class";
    if (!subjectForm.subjectId) return "Select a subject";

    const duplicate = assignments.find(row => {
      if (subjectEditMode && row.id === subjectForm.id) return false;

      return (
        row.teacherId === Number(subjectForm.teacherId) &&
        row.classId === Number(subjectForm.classId) &&
        row.subjectId === Number(subjectForm.subjectId) &&
        !row.isDeleted
      );
    });

    if (duplicate) {
      return "This teacher is already assigned to this class and subject";
    }

    return null;
  };

  const saveSubjectAssignment = async () => {
    const error = validateSubjectAssignment();
    if (error) return alert(error);

    try {
      setSaving(true);

      const payload = prepareSyncData({
        branchId,
        teacherId: Number(subjectForm.teacherId),
        classId: Number(subjectForm.classId),
        subjectId: Number(subjectForm.subjectId),
      }) as Assignment;

      if (subjectEditMode && subjectForm.id) {
        await db.assignments.update(subjectForm.id, {
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
          ? classSubjects.find(row => row.id === Number(subjectForm.classSubjectId))
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
    if (!activeBranchId) return "Select a branch first";
    if (!classTeacherForm.teacherId) return "Select a teacher";
    if (!classTeacherForm.classId) return "Select a class";

    const existingForClass = classTeachers.find(row => {
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
        branchId,
        teacherId: Number(classTeacherForm.teacherId),
        classId: Number(classTeacherForm.classId),
      }) as ClassTeacher;

      if (classTeacherEditMode && classTeacherForm.id) {
        await db.classTeachers.update(classTeacherForm.id, {
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
    if (!roleForm.teacherId) return alert("Select a teacher");
    if (!roleForm.role) return alert("Select a role");

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

  // ======================================================
  // STYLES
  // ======================================================

  const card: React.CSSProperties = {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 13px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "var(--surface)",
    color: "var(--text)",
    outline: "none",
    fontWeight: 650,
    boxSizing: "border-box",
  };

  const label: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    fontSize: 12,
    opacity: 0.72,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  };

  const button: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 14,
    border: "none",
    background: primary,
    color: "#fff",
    fontWeight: 850,
    cursor: "pointer",
  };

  const ghostButton: React.CSSProperties = {
    padding: "10px 13px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "var(--surface)",
    color: "var(--text)",
    fontWeight: 750,
    cursor: "pointer",
  };

  const tabButton = (active: boolean): React.CSSProperties => ({
    padding: "11px 14px",
    borderRadius: 14,
    border: active ? `2px solid ${primary}` : "1px solid rgba(0,0,0,0.10)",
    background: active ? "rgba(47,111,237,0.10)" : "var(--surface)",
    color: active ? primary : "var(--text)",
    fontWeight: 900,
    cursor: "pointer",
  });

  const badge = (
    tone: "green" | "red" | "blue" | "gray" | "orange" | "purple"
  ): React.CSSProperties => {
    const tones = {
      green: { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
      red: { bg: "rgba(239,68,68,0.12)", color: "#dc2626" },
      blue: { bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
      gray: { bg: "rgba(107,114,128,0.12)", color: "#4b5563" },
      orange: { bg: "rgba(245,158,11,0.14)", color: "#b45309" },
      purple: { bg: "rgba(147,51,234,0.12)", color: "#7e22ce" },
    }[tone];

    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "5px 9px",
      borderRadius: 999,
      background: tones.bg,
      color: tones.color,
      fontSize: 11,
      fontWeight: 850,
    };
  };

  const roleBadgeTone = (role?: string): "green" | "blue" | "purple" | "orange" | "gray" => {
    if (role === "principal") return "purple";
    if (role === "head_teacher") return "orange";
    if (role === "lecturer") return "blue";
    if (role === "teacher") return "green";
    return "gray";
  };

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading assignments...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Assignments belong to a branch. Select a school and branch from the sidebar before assigning staff.
          </p>
        </div>
      </div>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={{ padding: 20, color: "var(--text)" }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Assignments</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Managing staff assignments in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {tab === "subject" && (
            <button onClick={openCreateSubjectAssignment} style={button}>
              + Subject Assignment
            </button>
          )}
          {tab === "classTeacher" && (
            <button onClick={openCreateClassTeacher} style={button}>
              + Class Teacher
            </button>
          )}
          {tab === "roles" && (
            <button onClick={() => openRoleDrawer()} style={button}>
              + Assign Role
            </button>
          )}
        </div>
      </div>

      {/* TABS */}
      <div style={{ ...card, marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setTab("subject")} style={tabButton(tab === "subject")}>
          Subject Teachers
        </button>
        <button type="button" onClick={() => setTab("classTeacher")} style={tabButton(tab === "classTeacher")}>
          Class Teachers
        </button>
        <button type="button" onClick={() => setTab("roles")} style={tabButton(tab === "roles")}>
          Institutional Roles
        </button>
      </div>

      {/* ANALYTICS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Subject Assignments</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.subjectAssignments}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Class Teachers</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.classTeachers}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Head Teachers</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.headTeachers}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Principals</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.principals}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Teachers</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.teachers}</div>
        </div>
      </div>

      {/* FILTERS */}
      <div
        style={{
          ...card,
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
          gap: 12,
        }}
      >
        <input
          placeholder="Search teacher, class, subject, role..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={input}
        />

        <select
          value={filterTeacherId || ""}
          onChange={e => setFilterTeacherId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Teachers</option>
          {teachers.map(row => (
            <option key={row.id} value={row.id}>
              {row.fullName}
            </option>
          ))}
        </select>

        {tab !== "roles" && (
          <select
            value={filterClassId || ""}
            onChange={e => setFilterClassId(Number(e.target.value) || undefined)}
            style={input}
          >
            <option value="">All Classes</option>
            {classes.map(row => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        )}

        {tab === "subject" && (
          <select
            value={filterSubjectId || ""}
            onChange={e => setFilterSubjectId(Number(e.target.value) || undefined)}
            style={input}
          >
            <option value="">All Subjects</option>
            {subjects.map(row => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value as TeacherRole | "all")}
          style={input}
        >
          <option value="all">All Roles</option>
          {roleOptions.map(role => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </div>

      {/* SUBJECT ASSIGNMENTS */}
      {tab === "subject" && (
        <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
          {filteredSubjectAssignments.map(item => (
            <div key={item.row.id} style={card}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <strong style={{ fontSize: 18 }}>{item.teacherName}</strong>
                    <span style={badge(roleBadgeTone(item.teacherRole))}>{String(item.teacherRole).replace("_", " ")}</span>
                    <span style={badge("blue")}>{item.className}</span>
                    <span style={badge("purple")}>{item.subjectName}</span>
                    {item.subjectCode && <span style={badge("gray")}>{item.subjectCode}</span>}
                  </div>
                  <div style={{ marginTop: 8, opacity: 0.68, fontSize: 13 }}>
                    {item.classSubjectLabel}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button style={ghostButton} onClick={() => openEditSubjectAssignment(item.row)}>
                    Edit
                  </button>
                  <button style={{ ...ghostButton, color: "#dc2626" }} onClick={() => removeSubjectAssignment(item.row.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}

          {!filteredSubjectAssignments.length && (
            <div style={{ ...card, textAlign: "center", padding: 30 }}>
              No subject teacher assignments found.
            </div>
          )}
        </div>
      )}

      {/* CLASS TEACHERS */}
      {tab === "classTeacher" && (
        <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
          {filteredClassTeachers.map(item => (
            <div key={item.row.id} style={card}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <strong style={{ fontSize: 18 }}>{item.teacherName}</strong>
                    <span style={badge(roleBadgeTone(item.teacherRole))}>{String(item.teacherRole).replace("_", " ")}</span>
                    <span style={badge("blue")}>{item.className}</span>
                    <span style={badge("green")}>Class Teacher</span>
                  </div>
                  <div style={{ marginTop: 8, opacity: 0.68, fontSize: 13 }}>
                    Responsible class teacher for {item.className}.
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button style={ghostButton} onClick={() => openEditClassTeacher(item.row)}>
                    Edit
                  </button>
                  <button style={{ ...ghostButton, color: "#dc2626" }} onClick={() => removeClassTeacher(item.row.id)}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}

          {!filteredClassTeachers.length && (
            <div style={{ ...card, textAlign: "center", padding: 30 }}>
              No class teacher assignments found.
            </div>
          )}
        </div>
      )}

      {/* ROLES */}
      {tab === "roles" && (
        <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
          {filteredTeacherRoles.map(item => (
            <div key={item.teacher.id} style={card}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 16,
                      background: item.teacher.photo
                        ? `url(${item.teacher.photo}) center/cover`
                        : `linear-gradient(135deg, ${primary}, rgba(255,255,255,0.2))`,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 950,
                      flex: "0 0 46px",
                    }}
                  >
                    {!item.teacher.photo && item.teacher.fullName.slice(0, 1).toUpperCase()}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{item.teacher.fullName}</div>
                    <div style={{ marginTop: 5, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={badge(roleBadgeTone(item.teacher.role))}>{item.teacher.role.replace("_", " ")}</span>
                      <span style={badge("blue")}>{item.subjectAssignmentCount} subject assignment(s)</span>
                      <span style={badge("green")}>{item.classTeacherCount} class teacher role(s)</span>
                      {item.teacher.qualification && <span style={badge("gray")}>{item.teacher.qualification}</span>}
                    </div>
                  </div>
                </div>

                <button style={ghostButton} onClick={() => openRoleDrawer(item.teacher)}>
                  Change Role
                </button>
              </div>
            </div>
          ))}

          {!filteredTeacherRoles.length && (
            <div style={{ ...card, textAlign: "center", padding: 30 }}>
              No teachers found for the selected filters.
            </div>
          )}
        </div>
      )}

      {/* SUBJECT ASSIGNMENT DRAWER */}
      {subjectDrawerOpen && (
        <div style={drawerOverlay} onClick={() => setSubjectDrawerOpen(false)}>
          <div style={drawerPanel} onClick={e => e.stopPropagation()}>
            <DrawerHeader
              title={subjectEditMode ? "Edit Subject Assignment" : "Create Subject Assignment"}
              subtitle="Assign a teacher to a class and subject. This also updates ClassSubject.teacherId where possible."
              onClose={() => setSubjectDrawerOpen(false)}
              ghostButton={ghostButton}
            />

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Class Subject Context</label>
                <select
                  value={subjectForm.classSubjectId || ""}
                  onChange={e => assignFromClassSubject(Number(e.target.value))}
                  style={input}
                >
                  <option value="">Optional: Select ClassSubject</option>
                  {availableClassSubjects.map(row => {
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
              </div>

              <div>
                <label style={label}>Teacher</label>
                <select
                  value={subjectForm.teacherId || ""}
                  onChange={e => updateSubjectForm({ teacherId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">Select Teacher</option>
                  {teachers.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.fullName} • {row.role.replace("_", " ")} • {subjectAssignmentCounts.get(row.id || 0) || 0} load(s)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Class</label>
                <select
                  value={subjectForm.classId || ""}
                  onChange={e => updateSubjectForm({ classId: Number(e.target.value) || undefined, subjectId: undefined, classSubjectId: undefined })}
                  style={input}
                >
                  <option value="">Select Class</option>
                  {classes.map(row => (
                    <option key={row.id} value={row.id}>{row.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Subject</label>
                <select
                  value={subjectForm.subjectId || ""}
                  onChange={e => updateSubjectForm({ subjectId: Number(e.target.value) || undefined, classSubjectId: undefined })}
                  style={input}
                >
                  <option value="">Select Subject</option>
                  {availableSubjectsForClass.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.name} {row.code ? `• ${row.code}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <button onClick={saveSubjectAssignment} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : subjectEditMode ? "Save Changes" : "Create Subject Assignment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLASS TEACHER DRAWER */}
      {classTeacherDrawerOpen && (
        <div style={drawerOverlay} onClick={() => setClassTeacherDrawerOpen(false)}>
          <div style={drawerPanel} onClick={e => e.stopPropagation()}>
            <DrawerHeader
              title={classTeacherEditMode ? "Edit Class Teacher" : "Assign Class Teacher"}
              subtitle="Assign the teacher responsible for a class. This uses the ClassTeacher table."
              onClose={() => setClassTeacherDrawerOpen(false)}
              ghostButton={ghostButton}
            />

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Teacher</label>
                <select
                  value={classTeacherForm.teacherId || ""}
                  onChange={e => updateClassTeacherForm({ teacherId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">Select Teacher</option>
                  {teachers.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.fullName} • {row.role.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Class</label>
                <select
                  value={classTeacherForm.classId || ""}
                  onChange={e => updateClassTeacherForm({ classId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">Select Class</option>
                  {classes.map(row => {
                    const existing = row.id ? classTeacherByClass.get(row.id) : undefined;
                    const existingTeacher = existing ? teacherMap.get(existing.teacherId)?.fullName : undefined;
                    return (
                      <option key={row.id} value={row.id}>
                        {row.name} {existingTeacher && existing?.id !== classTeacherForm.id ? `• already: ${existingTeacher}` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              <button onClick={saveClassTeacher} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : classTeacherEditMode ? "Save Changes" : "Assign Class Teacher"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ROLE DRAWER */}
      {roleDrawerOpen && (
        <div style={drawerOverlay} onClick={() => setRoleDrawerOpen(false)}>
          <div style={drawerPanel} onClick={e => e.stopPropagation()}>
            <DrawerHeader
              title="Assign Institutional Role"
              subtitle="This updates the teacher's role field. Use this for principal, head teacher, lecturer, or regular teacher role."
              onClose={() => setRoleDrawerOpen(false)}
              ghostButton={ghostButton}
            />

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Teacher</label>
                <select
                  value={roleForm.teacherId || ""}
                  onChange={e => {
                    const teacherId = Number(e.target.value) || undefined;
                    const teacher = teachers.find(row => row.id === teacherId);
                    setRoleForm({ teacherId, role: teacher?.role || "teacher" });
                  }}
                  style={input}
                >
                  <option value="">Select Teacher</option>
                  {teachers.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.fullName} • current: {row.role.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Role</label>
                <select
                  value={roleForm.role}
                  onChange={e => setRoleForm(prev => ({ ...prev, role: e.target.value as TeacherRole }))}
                  style={input}
                >
                  {roleOptions.map(role => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                {roleOptions.find(role => role.value === roleForm.role)?.description}
              </div>

              <button onClick={saveRole} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : "Save Role"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================================================
// DRAWER HELPERS
// ======================================================

function DrawerHeader({
  title,
  subtitle,
  onClose,
  ghostButton,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  ghostButton: React.CSSProperties;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 12 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>{title}</h3>
        <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>{subtitle}</div>
      </div>
      <button type="button" style={ghostButton} onClick={onClose}>Close</button>
    </div>
  );
}

const drawerOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  display: "flex",
  justifyContent: "flex-end",
  background: "rgba(15,23,42,0.45)",
  backdropFilter: "blur(4px)",
};

const drawerPanel: React.CSSProperties = {
  width: "min(650px, 100vw)",
  height: "100vh",
  background: "var(--surface)",
  color: "var(--text)",
  boxShadow: "-20px 0 50px rgba(0,0,0,0.25)",
  padding: 22,
  overflowY: "auto",
};
