"use client";

/**
 * StudentRegistration.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL STUDENT REGISTRATION WORKFLOW
 * ---------------------------------------------------------
 *
 * DB tables touched:
 * - students
 * - parents
 * - studentParents
 * - studentEnrollments
 * - studentCurriculums
 *
 * Supporting tables:
 * - classes
 * - academicPeriods
 * - curriculums
 * - curriculumPathways
 * - organizations
 *
 * ARCHITECTURE
 * ---------------------------------------------------------
 * Active School -> Active Branch -> Student Registration
 *
 * This page is a guided registration flow for creating a student
 * and immediately connecting the student to:
 * - parent/guardian
 * - class enrollment
 * - optional curriculum/pathway placement
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  AcademicPeriod,
  Class,
  Curriculum,
  CurriculumPathway,
  Organization,
  Parent,
  Student,
  StudentCurriculum,
  StudentEnrollment,
  StudentParent,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type StudentStatus = "active" | "graduated" | "transferred" | "withdrawn";
type EnrollmentStatus = "active" | "completed" | "transferred" | "withdrawn";
type CurriculumStatus = "active" | "completed" | "withdrawn";
type ParentRelationship = "father" | "mother" | "guardian" | "other";

type RegistrationForm = {
  admissionNumber?: string;
  fullName: string;
  gender?: string;
  age?: number;
  dateOfBirth?: string;
  photo?: string;
  coverPhoto?: string;
  address?: string;
  organizationId?: number;
  status: StudentStatus;

  parentFullName?: string;
  parentPhone?: string;
  parentEmail?: string;
  parentAddress?: string;
  parentOccupation?: string;
  parentEmergencyContact?: string;
  parentRelationship: ParentRelationship;
  parentPhoto?: string;
  makePrimaryParent: boolean;

  classId?: number;
  academicPeriodId?: number;
  enrollmentStatus: EnrollmentStatus;
  enrollmentActive: boolean;

  curriculumId?: number;
  pathwayId?: number;
  curriculumStatus: CurriculumStatus;
  curriculumActive: boolean;
};

type RegistrationView = {
  student: Student;
  className: string;
  curriculumName: string;
  parentNames: string[];
  enrollmentCount: number;
  curriculumCount: number;
};

// ======================================================
// COMPONENT
// ======================================================

export default function StudentRegistration() {
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
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [studentParents, setStudentParents] = useState<StudentParent[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [studentCurriculums, setStudentCurriculums] = useState<StudentCurriculum[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  const [search, setSearch] = useState("");

  const [form, setForm] = useState<RegistrationForm>({
    admissionNumber: "",
    fullName: "",
    gender: "",
    age: undefined,
    dateOfBirth: "",
    photo: "",
    coverPhoto: "",
    address: "",
    organizationId: undefined,
    status: "active",

    parentFullName: "",
    parentPhone: "",
    parentEmail: "",
    parentAddress: "",
    parentOccupation: "",
    parentEmergencyContact: "",
    parentRelationship: "guardian",
    parentPhoto: "",
    makePrimaryParent: true,

    classId: undefined,
    academicPeriodId: settings?.currentAcademicPeriodId,
    enrollmentStatus: "active",
    enrollmentActive: true,

    curriculumId: undefined,
    pathwayId: undefined,
    curriculumStatus: "active",
    curriculumActive: true,
  });

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

      const [
        studentRows,
        parentRows,
        studentParentRows,
        enrollmentRows,
        studentCurriculumRows,
        classRows,
        periodRows,
        curriculumRows,
        pathwayRows,
        organizationRows,
      ] = await Promise.all([
        db.students.toArray(),
        db.parents.toArray(),
        db.studentParents.toArray(),
        db.studentEnrollments.toArray(),
        db.studentCurriculums.toArray(),
        db.classes.toArray(),
        db.academicPeriods.toArray(),
        db.curriculums.toArray(),
        db.curriculumPathways.toArray(),
        db.organizations.toArray(),
      ]);

      setStudents(studentRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setParents(parentRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setStudentParents(studentParentRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setEnrollments(enrollmentRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setStudentCurriculums(studentCurriculumRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setClasses(classRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false));
      setPeriods(
        periodRows
          .filter(row => row.branchId === branchId && !row.isDeleted)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );
      setCurriculums(curriculumRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false));
      setPathways(pathwayRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false));
      setOrganizations(organizationRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false));
    } catch (error) {
      console.error("Failed to load registration data:", error);
      alert("Failed to load registration data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // LOOKUPS / VIEW MODEL
  // ======================================================

  const classMap = useMemo(() => new Map(classes.map(row => [row.id, row])), [classes]);
  const curriculumMap = useMemo(() => new Map(curriculums.map(row => [row.id, row])), [curriculums]);
  const parentMap = useMemo(() => new Map(parents.map(row => [row.id, row])), [parents]);

  const filteredPathways = useMemo(() => {
    if (!form.curriculumId) return pathways;
    return pathways.filter(row => row.curriculumId === form.curriculumId);
  }, [pathways, form.curriculumId]);

  const recentRegistrations = useMemo<RegistrationView[]>(() => {
    return students
      .slice()
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, 12)
      .map(student => {
        const studentEnrollmentRows = enrollments.filter(row => row.studentId === student.id);
        const activeEnrollment = studentEnrollmentRows.find(row => row.status === "active") || studentEnrollmentRows[0];
        const studentCurriculumRows = studentCurriculums.filter(row => row.studentId === student.id);
        const activeCurriculum = studentCurriculumRows.find(row => row.status === "active") || studentCurriculumRows[0];
        const links = studentParents.filter(row => row.studentId === student.id);

        return {
          student,
          className: activeEnrollment?.classId ? classMap.get(activeEnrollment.classId)?.name || "Unknown class" : "No class",
          curriculumName: activeCurriculum?.curriculumId ? curriculumMap.get(activeCurriculum.curriculumId)?.name || "Unknown curriculum" : "No curriculum",
          parentNames: links
            .map(link => parentMap.get(link.parentId)?.fullName)
            .filter(Boolean) as string[],
          enrollmentCount: studentEnrollmentRows.length,
          curriculumCount: studentCurriculumRows.length,
        };
      });
  }, [students, enrollments, studentCurriculums, studentParents, classMap, curriculumMap, parentMap]);

  const filteredRecentRegistrations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return recentRegistrations;

    return recentRegistrations.filter(item =>
      `
        ${item.student.fullName}
        ${item.student.admissionNumber || ""}
        ${item.className}
        ${item.curriculumName}
        ${item.parentNames.join(" ")}
      `
        .toLowerCase()
        .includes(query)
    );
  }, [recentRegistrations, search]);

  const summary = useMemo(() => {
    return {
      students: students.length,
      activeStudents: students.filter(row => row.status === "active" || !row.status).length,
      withClass: new Set(enrollments.filter(row => row.status === "active").map(row => row.studentId)).size,
      withCurriculum: new Set(studentCurriculums.filter(row => row.status === "active").map(row => row.studentId)).size,
      parents: parents.length,
    };
  }, [students, enrollments, studentCurriculums, parents]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateForm = (patch: Partial<RegistrationForm>) => {
    setForm(prev => ({ ...prev, ...patch }));
  };

  const fileToBase64 = (file: File) => {
    return new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (
    field: "photo" | "coverPhoto" | "parentPhoto",
    file?: File
  ) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateForm({ [field]: value });
  };

  const resetForm = () => {
    setStep(1);
    setForm({
      admissionNumber: "",
      fullName: "",
      gender: "",
      age: undefined,
      dateOfBirth: "",
      photo: "",
      coverPhoto: "",
      address: "",
      organizationId: undefined,
      status: "active",

      parentFullName: "",
      parentPhone: "",
      parentEmail: "",
      parentAddress: "",
      parentOccupation: "",
      parentEmergencyContact: "",
      parentRelationship: "guardian",
      parentPhoto: "",
      makePrimaryParent: true,

      classId: undefined,
      academicPeriodId: settings?.currentAcademicPeriodId,
      enrollmentStatus: "active",
      enrollmentActive: true,

      curriculumId: undefined,
      pathwayId: undefined,
      curriculumStatus: "active",
      curriculumActive: true,
    });
  };

  // ======================================================
  // VALIDATION
  // ======================================================

  const validateStudent = () => {
    if (!branchId) return "Select a branch first";
    if (!form.fullName.trim()) return "Enter student full name";

    const duplicateAdmission = students.find(row => {
      return (
        form.admissionNumber?.trim() &&
        row.admissionNumber?.trim().toLowerCase() === form.admissionNumber.trim().toLowerCase() &&
        !row.isDeleted
      );
    });

    if (duplicateAdmission) return "A student with this admission number already exists in this branch";
    return null;
  };

  const validateParent = () => {
    if (!form.parentFullName?.trim() && !form.parentPhone?.trim()) return null;
    if (!form.parentFullName?.trim()) return "Enter parent/guardian name or leave parent section empty";
    if (!form.parentPhone?.trim()) return "Enter parent/guardian phone number or leave parent section empty";
    return null;
  };

  const validateEnrollment = () => {
    if (form.classId && !form.academicPeriodId) return "Select academic period for class enrollment";
    return null;
  };

  const validateCurriculum = () => {
    if (form.pathwayId) {
      const pathway = pathways.find(row => row.id === form.pathwayId);
      if (pathway && pathway.curriculumId !== form.curriculumId) {
        return "Selected pathway does not belong to the selected curriculum";
      }
    }
    return null;
  };

  const validateAll = () => {
    return validateStudent() || validateParent() || validateEnrollment() || validateCurriculum();
  };

  // ======================================================
  // SAVE REGISTRATION
  // ======================================================

  const saveRegistration = async () => {
    const error = validateAll();

    if (error) {
      alert(error);
      return;
    }

    try {
      setSaving(true);

      const studentPayload = prepareSyncData({
        branchId,
        organizationId: form.organizationId ? Number(form.organizationId) : undefined,
        admissionNumber: form.admissionNumber?.trim() || undefined,
        fullName: form.fullName.trim(),
        gender: form.gender?.trim() || undefined,
        age: form.age == null ? undefined : Number(form.age),
        dateOfBirth: form.dateOfBirth || undefined,
        photo: form.photo || undefined,
        coverPhoto: form.coverPhoto || undefined,
        parentName: form.parentFullName?.trim() || undefined,
        parentPhone: form.parentPhone?.trim() || undefined,
        parentEmail: form.parentEmail?.trim() || undefined,
        address: form.address?.trim() || undefined,
        currentClassId: form.classId ? Number(form.classId) : undefined,
        status: form.status,
      }) as Student;

      const studentId = Number(await db.students.add(studentPayload));

      if (form.parentFullName?.trim() && form.parentPhone?.trim()) {
        const existingParent = parents.find(
          row => row.phone.trim().toLowerCase() === form.parentPhone?.trim().toLowerCase()
        );

        let parentId = existingParent?.id;

        if (!parentId) {
          const parentPayload = prepareSyncData({
            branchId,
            fullName: form.parentFullName.trim(),
            phone: form.parentPhone.trim(),
            photo: form.parentPhoto || undefined,
            email: form.parentEmail?.trim() || undefined,
            address: form.parentAddress?.trim() || form.address?.trim() || undefined,
            occupation: form.parentOccupation?.trim() || undefined,
            emergencyContact: form.parentEmergencyContact?.trim() || undefined,
            relationship:
              form.parentRelationship === "other" ? "guardian" : form.parentRelationship,
          }) as Parent;

          parentId = Number(await db.parents.add(parentPayload));
        }

        if (parentId) {
          const linkPayload = prepareSyncData({
            branchId,
            parentId,
            studentId,
            relationship: form.parentRelationship,
            isPrimary: form.makePrimaryParent,
          }) as StudentParent;

          await db.studentParents.add(linkPayload);
        }
      }

      if (form.classId) {
        const enrollmentPayload = prepareSyncData({
          branchId,
          studentId,
          classId: Number(form.classId),
          academicPeriodId: Number(form.academicPeriodId),
          status: form.enrollmentStatus,
          active: form.enrollmentActive,
        }) as StudentEnrollment;

        await db.studentEnrollments.add(enrollmentPayload);
      }

      if (form.curriculumId) {
        const curriculumPayload = prepareSyncData({
          branchId,
          studentId,
          curriculumId: Number(form.curriculumId),
          pathwayId: form.pathwayId ? Number(form.pathwayId) : undefined,
          startAcademicPeriodId: form.academicPeriodId ? Number(form.academicPeriodId) : undefined,
          status: form.curriculumStatus,
          active: form.curriculumActive,
        }) as StudentCurriculum;

        await db.studentCurriculums.add(curriculumPayload);
      }

      alert("Student registered successfully");
      resetForm();
      await load();
    } catch (error) {
      console.error("Failed to register student:", error);
      alert("Failed to register student");
    } finally {
      setSaving(false);
    }
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

  const badge = (tone: "green" | "red" | "blue" | "gray" | "orange" | "purple"): React.CSSProperties => {
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

  const stepButton = (target: 1 | 2 | 3 | 4): React.CSSProperties => ({
    padding: "12px 14px",
    borderRadius: 16,
    border: step === target ? `2px solid ${primary}` : "1px solid rgba(0,0,0,0.10)",
    background: step === target ? "rgba(59,130,246,0.08)" : "var(--surface)",
    color: "var(--text)",
    fontWeight: 900,
    cursor: "pointer",
    textAlign: "left",
  });

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading student registration...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Student registration belongs to a branch. Select a school and branch first.
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
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Student Registration</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Registering students in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button type="button" onClick={resetForm} style={ghostButton}>
          Clear Form
        </button>
      </div>

      {/* ANALYTICS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Students</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.students}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Active Students</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.activeStudents}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>With Active Class</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.withClass}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>With Curriculum</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.withCurriculum}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Parents</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.parents}</div>
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "minmax(320px, 1.3fr) minmax(280px, 0.8fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* REGISTRATION WORKFLOW */}
        <div style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 10 }}>
            <button type="button" onClick={() => setStep(1)} style={stepButton(1)}>
              1. Student
            </button>
            <button type="button" onClick={() => setStep(2)} style={stepButton(2)}>
              2. Parent
            </button>
            <button type="button" onClick={() => setStep(3)} style={stepButton(3)}>
              3. Enrollment
            </button>
            <button type="button" onClick={() => setStep(4)} style={stepButton(4)}>
              4. Review
            </button>
          </div>

          <div style={{ marginTop: 20 }}>
            {step === 1 && (
              <div style={{ display: "grid", gap: 14 }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Student Profile</h3>

                <div>
                  <label style={label}>Full Name</label>
                  <input
                    value={form.fullName}
                    onChange={e => updateForm({ fullName: e.target.value })}
                    placeholder="Student full name"
                    style={input}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                  <div>
                    <label style={label}>Admission Number</label>
                    <input
                      value={form.admissionNumber || ""}
                      onChange={e => updateForm({ admissionNumber: e.target.value })}
                      placeholder="Admission number"
                      style={input}
                    />
                  </div>

                  <div>
                    <label style={label}>Gender</label>
                    <select
                      value={form.gender || ""}
                      onChange={e => updateForm({ gender: e.target.value || undefined })}
                      style={input}
                    >
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                  <div>
                    <label style={label}>Date of Birth</label>
                    <input
                      type="date"
                      value={form.dateOfBirth || ""}
                      onChange={e => updateForm({ dateOfBirth: e.target.value })}
                      style={input}
                    />
                  </div>

                  <div>
                    <label style={label}>Age</label>
                    <input
                      type="number"
                      value={form.age ?? ""}
                      onChange={e => updateForm({ age: e.target.value === "" ? undefined : Number(e.target.value) })}
                      placeholder="Age"
                      style={input}
                    />
                  </div>
                </div>

                <div>
                  <label style={label}>Organization / House / Department</label>
                  <select
                    value={form.organizationId || ""}
                    onChange={e => updateForm({ organizationId: Number(e.target.value) || undefined })}
                    style={input}
                  >
                    <option value="">No organization</option>
                    {organizations.map(row => (
                      <option key={row.id} value={row.id}>
                        {row.name} • {row.type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={label}>Address</label>
                  <textarea
                    value={form.address || ""}
                    onChange={e => updateForm({ address: e.target.value })}
                    placeholder="Student address"
                    rows={3}
                    style={{ ...input, resize: "vertical" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
                  <div>
                    <label style={label}>Student Photo</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleImageUpload("photo", e.target.files?.[0])}
                      style={input}
                    />
                    {form.photo && <img src={form.photo} alt="Student" style={{ height: 84, borderRadius: 14, marginTop: 8, objectFit: "cover" }} />}
                  </div>

                  <div>
                    <label style={label}>Cover Photo</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleImageUpload("coverPhoto", e.target.files?.[0])}
                      style={input}
                    />
                    {form.coverPhoto && <img src={form.coverPhoto} alt="Cover" style={{ height: 84, width: "100%", borderRadius: 14, marginTop: 8, objectFit: "cover" }} />}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div style={{ display: "grid", gap: 14 }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Parent / Guardian</h3>
                <p style={{ margin: 0, opacity: 0.68, fontSize: 13 }}>
                  This section is optional, but recommended for professional school records.
                </p>

                <div>
                  <label style={label}>Parent / Guardian Name</label>
                  <input
                    value={form.parentFullName || ""}
                    onChange={e => updateForm({ parentFullName: e.target.value })}
                    placeholder="Parent or guardian full name"
                    style={input}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                  <div>
                    <label style={label}>Phone</label>
                    <input
                      value={form.parentPhone || ""}
                      onChange={e => updateForm({ parentPhone: e.target.value })}
                      placeholder="Phone number"
                      style={input}
                    />
                  </div>
                  <div>
                    <label style={label}>Email</label>
                    <input
                      value={form.parentEmail || ""}
                      onChange={e => updateForm({ parentEmail: e.target.value })}
                      placeholder="Email address"
                      style={input}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                  <div>
                    <label style={label}>Relationship</label>
                    <select
                      value={form.parentRelationship}
                      onChange={e => updateForm({ parentRelationship: e.target.value as ParentRelationship })}
                      style={input}
                    >
                      <option value="father">Father</option>
                      <option value="mother">Mother</option>
                      <option value="guardian">Guardian</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={label}>Occupation</label>
                    <input
                      value={form.parentOccupation || ""}
                      onChange={e => updateForm({ parentOccupation: e.target.value })}
                      placeholder="Occupation"
                      style={input}
                    />
                  </div>
                </div>

                <div>
                  <label style={label}>Emergency Contact</label>
                  <input
                    value={form.parentEmergencyContact || ""}
                    onChange={e => updateForm({ parentEmergencyContact: e.target.value })}
                    placeholder="Emergency contact"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Parent Address</label>
                  <textarea
                    value={form.parentAddress || ""}
                    onChange={e => updateForm({ parentAddress: e.target.value })}
                    placeholder="Leave blank to use student address"
                    rows={3}
                    style={{ ...input, resize: "vertical" }}
                  />
                </div>

                <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                  <input
                    type="checkbox"
                    checked={form.makePrimaryParent}
                    onChange={e => updateForm({ makePrimaryParent: e.target.checked })}
                  />
                  Mark as primary parent/guardian
                </label>

                <div>
                  <label style={label}>Parent Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => handleImageUpload("parentPhoto", e.target.files?.[0])}
                    style={input}
                  />
                  {form.parentPhoto && <img src={form.parentPhoto} alt="Parent" style={{ height: 84, borderRadius: 14, marginTop: 8, objectFit: "cover" }} />}
                </div>
              </div>
            )}

            {step === 3 && (
              <div style={{ display: "grid", gap: 14 }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Class & Curriculum Placement</h3>

                <div>
                  <label style={label}>Class</label>
                  <select
                    value={form.classId || ""}
                    onChange={e => updateForm({ classId: Number(e.target.value) || undefined })}
                    style={input}
                  >
                    <option value="">No class yet</option>
                    {classes.map(row => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={label}>Academic Period</label>
                  <select
                    value={form.academicPeriodId || ""}
                    onChange={e => updateForm({ academicPeriodId: Number(e.target.value) || undefined })}
                    style={input}
                  >
                    <option value="">Select Academic Period</option>
                    {periods.map(row => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={label}>Curriculum</label>
                  <select
                    value={form.curriculumId || ""}
                    onChange={e => updateForm({ curriculumId: Number(e.target.value) || undefined, pathwayId: undefined })}
                    style={input}
                  >
                    <option value="">No curriculum yet</option>
                    {curriculums.map(row => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={label}>Pathway</label>
                  <select
                    value={form.pathwayId || ""}
                    onChange={e => updateForm({ pathwayId: Number(e.target.value) || undefined })}
                    style={input}
                  >
                    <option value="">No pathway</option>
                    {filteredPathways.map(row => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {step === 4 && (
              <div style={{ display: "grid", gap: 14 }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Review & Submit</h3>

                <div style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                  <div style={{ fontWeight: 900 }}>{form.fullName || "Unnamed Student"}</div>
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={badge("gray")}>Admission: {form.admissionNumber || "-"}</span>
                    <span style={badge("blue")}>Gender: {form.gender || "-"}</span>
                    <span style={badge("green")}>Status: {form.status}</span>
                  </div>
                </div>

                <div style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                  <div style={{ fontWeight: 900 }}>Guardian</div>
                  <div style={{ marginTop: 8, opacity: 0.72 }}>
                    {form.parentFullName || "No guardian entered"} {form.parentPhone ? `• ${form.parentPhone}` : ""}
                  </div>
                </div>

                <div style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                  <div style={{ fontWeight: 900 }}>Placement</div>
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={badge("blue")}>
                      Class: {classes.find(row => row.id === form.classId)?.name || "-"}
                    </span>
                    <span style={badge("purple")}>
                      Curriculum: {curriculums.find(row => row.id === form.curriculumId)?.name || "-"}
                    </span>
                    <span style={badge("gray")}>
                      Period: {periods.find(row => row.id === form.academicPeriodId)?.name || "-"}
                    </span>
                  </div>
                </div>

                <button onClick={saveRegistration} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Registering..." : "Complete Registration"}
                </button>
              </div>
            )}
          </div>

          <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setStep(prev => (prev > 1 ? ((prev - 1) as 1 | 2 | 3 | 4) : prev))}
              style={ghostButton}
            >
              Back
            </button>
            {step < 4 && (
              <button
                type="button"
                onClick={() => {
                  const error = step === 1 ? validateStudent() : step === 2 ? validateParent() : validateEnrollment() || validateCurriculum();
                  if (error) {
                    alert(error);
                    return;
                  }
                  setStep(prev => ((prev + 1) as 1 | 2 | 3 | 4));
                }}
                style={button}
              >
                Continue
              </button>
            )}
          </div>
        </div>

        {/* RECENT REGISTRATIONS */}
        <div style={card}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Recent Registrations</h3>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search recent students..."
            style={{ ...input, marginTop: 12 }}
          />

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {filteredRecentRegistrations.map(item => (
              <div key={item.student.id} style={{ ...card, boxShadow: "none", borderRadius: 16, padding: 14 }}>
                <div style={{ fontWeight: 900 }}>{item.student.fullName}</div>
                <div style={{ marginTop: 5, opacity: 0.68, fontSize: 13 }}>
                  {item.student.admissionNumber || "No admission no."} • {item.className}
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={badge("purple")}>{item.curriculumName}</span>
                  <span style={badge("gray")}>{item.parentNames.length} parent link(s)</span>
                </div>
              </div>
            ))}

            {!filteredRecentRegistrations.length && (
              <div style={{ textAlign: "center", padding: 18, opacity: 0.68 }}>
                No recent registrations found.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
