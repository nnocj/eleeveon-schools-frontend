"use client";

/**
 * StudentRegistration.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE STUDENT REGISTRATION WORKFLOW
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
 * - academicStructures
 * - academicPeriods
 * - curriculums
 * - curriculumPathways
 * - organizations
 *
 * Architecture:
 * Active Account -> Active School -> Active Branch -> Student Registration
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - StudentEnrollment uses the real DB model:
 *   schoolId, branchId, studentId, classId, academicStructureId,
 *   academicPeriodId, startDate, endDate, status.
 * - There is NO active field on StudentEnrollment.
 * - StudentEnrollment status uses promoted, NOT transferred.
 * - Mobile-first layout with no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
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

// ======================================================
// TYPES
// ======================================================

type StudentStatus = "active" | "graduated" | "transferred" | "withdrawn";
type EnrollmentStatus = "active" | "completed" | "promoted" | "withdrawn";
type CurriculumStatus = "active" | "completed" | "withdrawn";
type ParentRelationship = "father" | "mother" | "guardian" | "other";

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

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
  academicStructureId?: number;
  academicPeriodId?: number;
  enrollmentStatus: EnrollmentStatus;

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
// HELPERS
// ======================================================

const todayISO = () => new Date().toISOString().slice(0, 10);

function statusTone(status?: string): "green" | "red" | "blue" | "gray" | "orange" | "purple" {
  if (status === "active") return "green";
  if (status === "completed") return "blue";
  if (status === "promoted") return "orange";
  if (status === "withdrawn" || status === "transferred") return "red";
  if (status === "graduated") return "purple";
  return "gray";
}

function labelize(value?: string) {
  if (!value) return "None";
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

// ======================================================
// COMPONENT
// ======================================================

export default function StudentRegistration() {
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

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

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
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  const [search, setSearch] = useState("");

  const blankForm = (): RegistrationForm => {
    const currentPeriod = settings?.currentAcademicPeriodId
      ? periods.find((row) => row.id === settings.currentAcademicPeriodId)
      : undefined;

    return {
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
      academicStructureId: currentPeriod?.academicStructureId || settings?.currentAcademicStructureId,
      academicPeriodId: settings?.currentAcademicPeriodId,
      enrollmentStatus: "active",

      curriculumId: undefined,
      pathwayId: undefined,
      curriculumStatus: "active",
      curriculumActive: true,
    };
  };

  const [form, setForm] = useState<RegistrationForm>(() => blankForm());

  // ======================================================
  // AUTH + CONTEXT PROTECTION
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

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const clearData = () => {
    setStudents([]);
    setParents([]);
    setStudentParents([]);
    setEnrollments([]);
    setStudentCurriculums([]);
    setClasses([]);
    setAcademicStructures([]);
    setPeriods([]);
    setCurriculums([]);
    setPathways([]);
    setOrganizations([]);
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
        studentRows,
        parentRows,
        studentParentRows,
        enrollmentRows,
        studentCurriculumRows,
        classRows,
        structureRows,
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
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.curriculums.toArray(),
        db.curriculumPathways.toArray(),
        db.organizations.toArray(),
      ]);

      setStudents(
        studentRows
          .filter(sameTenant)
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );

      setParents(
        parentRows
          .filter(sameTenant)
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );

      setStudentParents(studentParentRows.filter(sameTenant));
      setEnrollments(enrollmentRows.filter(sameTenant));
      setStudentCurriculums(studentCurriculumRows.filter(sameTenant));

      setClasses(
        classRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setAcademicStructures(
        structureRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setPeriods(
        periodRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );

      setCurriculums(
        curriculumRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setPathways(
        pathwayRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setOrganizations(
        organizationRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (error) {
      console.error("Failed to load registration data:", error);
      clearData();
      alert("Failed to load registration data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

  // ======================================================
  // LOOKUPS / VIEW MODEL
  // ======================================================

  const classMap = useMemo(() => new Map(classes.map((row) => [row.id, row])), [classes]);
  const structureMap = useMemo(() => new Map(academicStructures.map((row) => [row.id, row])), [academicStructures]);
  const periodMap = useMemo(() => new Map(periods.map((row) => [row.id, row])), [periods]);
  const curriculumMap = useMemo(() => new Map(curriculums.map((row) => [row.id, row])), [curriculums]);
  const parentMap = useMemo(() => new Map(parents.map((row) => [row.id, row])), [parents]);

  const filteredPeriodsForForm = useMemo(() => {
    if (!form.academicStructureId) return periods;
    return periods.filter((row) => row.academicStructureId === form.academicStructureId);
  }, [periods, form.academicStructureId]);

  const filteredPathways = useMemo(() => {
    if (!form.curriculumId) return pathways;
    return pathways.filter((row) => row.curriculumId === form.curriculumId);
  }, [pathways, form.curriculumId]);

  const recentRegistrations = useMemo<RegistrationView[]>(() => {
    return students
      .slice()
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, 12)
      .map((student) => {
        const studentEnrollmentRows = enrollments.filter((row) => row.studentId === student.id);
        const activeEnrollment = studentEnrollmentRows.find((row) => row.status === "active") || studentEnrollmentRows[0];
        const studentCurriculumRows = studentCurriculums.filter((row) => row.studentId === student.id);
        const activeCurriculum = studentCurriculumRows.find((row) => row.status === "active") || studentCurriculumRows[0];
        const links = studentParents.filter((row) => row.studentId === student.id);

        return {
          student,
          className: activeEnrollment?.classId ? classMap.get(activeEnrollment.classId)?.name || "Unknown class" : "No class",
          curriculumName: activeCurriculum?.curriculumId ? curriculumMap.get(activeCurriculum.curriculumId)?.name || "Unknown curriculum" : "No curriculum",
          parentNames: links
            .map((link) => parentMap.get(link.parentId)?.fullName)
            .filter(Boolean) as string[],
          enrollmentCount: studentEnrollmentRows.length,
          curriculumCount: studentCurriculumRows.length,
        };
      });
  }, [students, enrollments, studentCurriculums, studentParents, classMap, curriculumMap, parentMap]);

  const filteredRecentRegistrations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return recentRegistrations;

    return recentRegistrations.filter((item) =>
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
      activeStudents: students.filter((row) => row.status === "active" || !row.status).length,
      withClass: new Set(enrollments.filter((row) => row.status === "active").map((row) => row.studentId)).size,
      withCurriculum: new Set(studentCurriculums.filter((row) => row.status === "active").map((row) => row.studentId)).size,
      parents: parents.length,
      structures: academicStructures.length,
    };
  }, [students, enrollments, studentCurriculums, parents, academicStructures]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateForm = (patch: Partial<RegistrationForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const fileToBase64 = (file: File) => {
    return new Promise<string>((resolve) => {
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
    setForm(blankForm());
  };

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      alert("Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  // ======================================================
  // VALIDATION
  // ======================================================

  const validateStudent = () => {
    if (!authenticated || !accountId) return "Sign in first";
    if (!schoolId) return "Select a school first";
    if (!branchId) return "Select a branch first";
    if (!form.fullName.trim()) return "Enter student full name";

    const duplicateAdmission = students.find((row) => {
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
    if (!form.classId) return null;
    if (!form.academicStructureId) return "Select academic structure for class enrollment";
    if (!form.academicPeriodId) return "Select academic period for class enrollment";

    const selectedClass = classMap.get(form.classId);
    if (!selectedClass) return "Selected class is not in this branch";

    const selectedStructure = structureMap.get(form.academicStructureId);
    if (!selectedStructure) return "Selected academic structure is not in this branch";

    const selectedPeriod = periodMap.get(form.academicPeriodId);
    if (!selectedPeriod) return "Selected academic period is not in this branch";

    if (selectedPeriod.academicStructureId !== Number(form.academicStructureId)) {
      return "Selected academic period does not belong to the selected academic structure";
    }

    return null;
  };

  const validateCurriculum = () => {
    if (form.pathwayId) {
      const pathway = pathways.find((row) => row.id === form.pathwayId);
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
    if (!requireTenant()) return;

    const error = validateAll();

    if (error) {
      alert(error);
      return;
    }

    try {
      setSaving(true);

      const studentPayload = prepareSyncData({
        accountId,
        schoolId: Number(schoolId),
        branchId: Number(branchId),
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
          (row) => row.phone.trim().toLowerCase() === form.parentPhone?.trim().toLowerCase()
        );

        let parentId = existingParent?.id;

        if (!parentId) {
          const parentPayload = prepareSyncData({
            accountId,
            schoolId: Number(schoolId),
            branchId: Number(branchId),
            fullName: form.parentFullName.trim(),
            phone: form.parentPhone.trim(),
            photo: form.parentPhoto || undefined,
            email: form.parentEmail?.trim() || undefined,
            address: form.parentAddress?.trim() || form.address?.trim() || undefined,
            occupation: form.parentOccupation?.trim() || undefined,
            emergencyContact: form.parentEmergencyContact?.trim() || undefined,
            relationship: form.parentRelationship === "other" ? "guardian" : form.parentRelationship,
          }) as Parent;

          parentId = Number(await db.parents.add(parentPayload));
        }

        if (parentId) {
          const linkPayload = prepareSyncData({
            accountId,
            schoolId: Number(schoolId),
            branchId: Number(branchId),
            parentId,
            studentId,
            relationship: form.parentRelationship,
            isPrimary: form.makePrimaryParent,
          }) as StudentParent;

          await db.studentParents.add(linkPayload);
        }
      }

      if (form.classId) {
        const selectedPeriod = periodMap.get(Number(form.academicPeriodId));

        const enrollmentPayload = prepareSyncData({
          accountId,
          schoolId: Number(schoolId),
          branchId: Number(branchId),
          studentId,
          classId: Number(form.classId),
          academicStructureId: Number(form.academicStructureId || selectedPeriod?.academicStructureId),
          academicPeriodId: Number(form.academicPeriodId),
          startDate: selectedPeriod?.startDate || todayISO(),
          endDate: undefined,
          status: form.enrollmentStatus,
        }) as StudentEnrollment;

        await db.studentEnrollments.add(enrollmentPayload);
      }

      if (form.curriculumId) {
        const curriculumPayload = prepareSyncData({
          accountId,
          schoolId: Number(schoolId),
          branchId: Number(branchId),
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
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="sreg-page" style={{ "--sreg-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sreg-state-card">
          <div className="sreg-spinner" />
          <h2>Opening student registration...</h2>
          <p>Checking account, branch, classes, academic structures, periods, parents, and curriculum records.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="sreg-page" style={{ "--sreg-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sreg-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before registering students.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="sreg-page" style={{ "--sreg-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sreg-state-card">
          <h2>Select a branch first</h2>
          <p>Student registration belongs to one active school branch.</p>
          <button type="button" className="sreg-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="sreg-page" style={{ "--sreg-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="sreg-hero">
        <div className="sreg-hero-left">
          <div className="sreg-hero-icon">🎓</div>
          <div className="sreg-title-wrap">
            <p>Student Intake</p>
            <h2>Student Registration</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" className="sreg-ghost-btn" onClick={resetForm}>
          Clear Form
        </button>
      </section>

      <section className="sreg-context-card">
        <div>
          <p>Registration Scope</p>
          <h3>{summary.activeStudents} active student(s)</h3>
          <span>{summary.students} total student record(s) in this branch</span>
        </div>
        <div className="sreg-pill-row">
          <Chip tone="blue">Same Tenant</Chip>
          <Chip tone="green">Branch Scoped</Chip>
          <Chip tone="purple">Guided Workflow</Chip>
        </div>
      </section>

      <section className="sreg-summary-grid" aria-label="Student registration summary">
        <SummaryCard label="Students" value={summary.students} icon="👥" />
        <SummaryCard label="Active Students" value={summary.activeStudents} icon="✅" />
        <SummaryCard label="With Active Class" value={summary.withClass} icon="🏫" />
        <SummaryCard label="With Curriculum" value={summary.withCurriculum} icon="📚" />
        <SummaryCard label="Parents" value={summary.parents} icon="👨‍👩‍👧" />
        <SummaryCard label="Structures" value={summary.structures} icon="🧩" />
      </section>

      <section className="sreg-shell">
        <article className="sreg-workflow-card">
          <div className="sreg-step-grid">
            <StepButton step={1} activeStep={step} setStep={setStep} title="Student" subtitle="Profile" />
            <StepButton step={2} activeStep={step} setStep={setStep} title="Parent" subtitle="Guardian" />
            <StepButton step={3} activeStep={step} setStep={setStep} title="Enrollment" subtitle="Placement" />
            <StepButton step={4} activeStep={step} setStep={setStep} title="Review" subtitle="Submit" />
          </div>

          <div className="sreg-step-body">
            {step === 1 && (
              <div className="sreg-form-section">
                <SectionTitle title="Student Profile" text="Capture the learner's identity and school profile." />

                <Field label="Full Name">
                  <input
                    value={form.fullName}
                    onChange={(event) => updateForm({ fullName: event.target.value })}
                    placeholder="Student full name"
                  />
                </Field>

                <div className="sreg-form-two">
                  <Field label="Admission Number">
                    <input
                      value={form.admissionNumber || ""}
                      onChange={(event) => updateForm({ admissionNumber: event.target.value })}
                      placeholder="Admission number"
                    />
                  </Field>

                  <Field label="Gender">
                    <select
                      value={form.gender || ""}
                      onChange={(event) => updateForm({ gender: event.target.value || undefined })}
                    >
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </Field>
                </div>

                <div className="sreg-form-two">
                  <Field label="Date of Birth">
                    <input
                      type="date"
                      value={form.dateOfBirth || ""}
                      onChange={(event) => updateForm({ dateOfBirth: event.target.value })}
                    />
                  </Field>

                  <Field label="Age">
                    <input
                      type="number"
                      value={form.age ?? ""}
                      onChange={(event) => updateForm({ age: event.target.value === "" ? undefined : Number(event.target.value) })}
                      placeholder="Age"
                    />
                  </Field>
                </div>

                <Field label="Organization / House / Department">
                  <select
                    value={form.organizationId || ""}
                    onChange={(event) => updateForm({ organizationId: Number(event.target.value) || undefined })}
                  >
                    <option value="">No organization</option>
                    {organizations.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} · {row.type}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Student Status">
                  <select
                    value={form.status}
                    onChange={(event) => updateForm({ status: event.target.value as StudentStatus })}
                  >
                    <option value="active">Active</option>
                    <option value="graduated">Graduated</option>
                    <option value="transferred">Transferred</option>
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                </Field>

                <Field label="Address">
                  <textarea
                    value={form.address || ""}
                    onChange={(event) => updateForm({ address: event.target.value })}
                    placeholder="Student address"
                    rows={3}
                  />
                </Field>

                <div className="sreg-form-two">
                  <FileField
                    label="Student Photo"
                    value={form.photo}
                    alt="Student"
                    onChange={(file) => handleImageUpload("photo", file)}
                  />

                  <FileField
                    label="Cover Photo"
                    value={form.coverPhoto}
                    alt="Cover"
                    wide
                    onChange={(file) => handleImageUpload("coverPhoto", file)}
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="sreg-form-section">
                <SectionTitle title="Parent / Guardian" text="Optional, but recommended for professional school records." />

                <Field label="Parent / Guardian Name">
                  <input
                    value={form.parentFullName || ""}
                    onChange={(event) => updateForm({ parentFullName: event.target.value })}
                    placeholder="Parent or guardian full name"
                  />
                </Field>

                <div className="sreg-form-two">
                  <Field label="Phone">
                    <input
                      value={form.parentPhone || ""}
                      onChange={(event) => updateForm({ parentPhone: event.target.value })}
                      placeholder="Phone number"
                    />
                  </Field>

                  <Field label="Email">
                    <input
                      value={form.parentEmail || ""}
                      onChange={(event) => updateForm({ parentEmail: event.target.value })}
                      placeholder="Email address"
                    />
                  </Field>
                </div>

                <div className="sreg-form-two">
                  <Field label="Relationship">
                    <select
                      value={form.parentRelationship}
                      onChange={(event) => updateForm({ parentRelationship: event.target.value as ParentRelationship })}
                    >
                      <option value="father">Father</option>
                      <option value="mother">Mother</option>
                      <option value="guardian">Guardian</option>
                      <option value="other">Other</option>
                    </select>
                  </Field>

                  <Field label="Occupation">
                    <input
                      value={form.parentOccupation || ""}
                      onChange={(event) => updateForm({ parentOccupation: event.target.value })}
                      placeholder="Occupation"
                    />
                  </Field>
                </div>

                <Field label="Emergency Contact">
                  <input
                    value={form.parentEmergencyContact || ""}
                    onChange={(event) => updateForm({ parentEmergencyContact: event.target.value })}
                    placeholder="Emergency contact"
                  />
                </Field>

                <Field label="Parent Address">
                  <textarea
                    value={form.parentAddress || ""}
                    onChange={(event) => updateForm({ parentAddress: event.target.value })}
                    placeholder="Leave blank to use student address"
                    rows={3}
                  />
                </Field>

                <label className="sreg-check">
                  <input
                    type="checkbox"
                    checked={form.makePrimaryParent}
                    onChange={(event) => updateForm({ makePrimaryParent: event.target.checked })}
                  />
                  <span>Mark as primary parent/guardian</span>
                </label>

                <FileField
                  label="Parent Photo"
                  value={form.parentPhoto}
                  alt="Parent"
                  onChange={(file) => handleImageUpload("parentPhoto", file)}
                />
              </div>
            )}

            {step === 3 && (
              <div className="sreg-form-section">
                <SectionTitle title="Class & Curriculum Placement" text="Connect the student to a class, academic period, and optional curriculum pathway." />

                <Field label="Class">
                  <select
                    value={form.classId || ""}
                    onChange={(event) => updateForm({ classId: Number(event.target.value) || undefined })}
                  >
                    <option value="">No class yet</option>
                    {classes.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Academic Structure">
                  <select
                    value={form.academicStructureId || ""}
                    onChange={(event) => updateForm({ academicStructureId: Number(event.target.value) || undefined, academicPeriodId: undefined })}
                  >
                    <option value="">Select Academic Structure</option>
                    {academicStructures.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} · {row.level}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Academic Period">
                  <select
                    value={form.academicPeriodId || ""}
                    onChange={(event) => {
                      const periodId = Number(event.target.value) || undefined;
                      const period = periodId ? periodMap.get(periodId) : undefined;
                      updateForm({
                        academicPeriodId: periodId,
                        academicStructureId: period?.academicStructureId || form.academicStructureId,
                      });
                    }}
                  >
                    <option value="">Select Academic Period</option>
                    {filteredPeriodsForForm.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Enrollment Status">
                  <select
                    value={form.enrollmentStatus}
                    onChange={(event) => updateForm({ enrollmentStatus: event.target.value as EnrollmentStatus })}
                  >
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="promoted">Promoted</option>
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                </Field>

                <Field label="Curriculum">
                  <select
                    value={form.curriculumId || ""}
                    onChange={(event) => updateForm({ curriculumId: Number(event.target.value) || undefined, pathwayId: undefined })}
                  >
                    <option value="">No curriculum yet</option>
                    {curriculums.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Pathway">
                  <select
                    value={form.pathwayId || ""}
                    onChange={(event) => updateForm({ pathwayId: Number(event.target.value) || undefined })}
                  >
                    <option value="">No pathway</option>
                    {filteredPathways.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Curriculum Status">
                  <select
                    value={form.curriculumStatus}
                    onChange={(event) => updateForm({ curriculumStatus: event.target.value as CurriculumStatus })}
                  >
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                </Field>

                <label className="sreg-check">
                  <input
                    type="checkbox"
                    checked={form.curriculumActive}
                    onChange={(event) => updateForm({ curriculumActive: event.target.checked })}
                  />
                  <span>Mark curriculum placement as active</span>
                </label>
              </div>
            )}

            {step === 4 && (
              <div className="sreg-form-section">
                <SectionTitle title="Review & Submit" text="Confirm the student, guardian, enrollment, and curriculum details before saving." />

                <ReviewCard title={form.fullName || "Unnamed Student"}>
                  <Chip tone="gray">Admission: {form.admissionNumber || "-"}</Chip>
                  <Chip tone="blue">Gender: {form.gender || "-"}</Chip>
                  <Chip tone={statusTone(form.status)}>Status: {labelize(form.status)}</Chip>
                </ReviewCard>

                <ReviewCard title="Guardian">
                  <Chip tone="gray">{form.parentFullName || "No guardian entered"}</Chip>
                  {form.parentPhone && <Chip tone="blue">{form.parentPhone}</Chip>}
                  <Chip tone="green">{labelize(form.parentRelationship)}</Chip>
                </ReviewCard>

                <ReviewCard title="Placement">
                  <Chip tone="blue">Class: {classes.find((row) => row.id === form.classId)?.name || "-"}</Chip>
                  <Chip tone="orange">Structure: {structureMap.get(form.academicStructureId)?.name || "-"}</Chip>
                  <Chip tone="gray">Period: {periodMap.get(form.academicPeriodId)?.name || "-"}</Chip>
                  <Chip tone="purple">Curriculum: {curriculumMap.get(form.curriculumId)?.name || "-"}</Chip>
                </ReviewCard>

                <button type="button" onClick={saveRegistration} disabled={saving} className="sreg-save-btn">
                  {saving ? "Registering..." : "Complete Registration"}
                </button>
              </div>
            )}
          </div>

          <div className="sreg-nav-row">
            <button
              type="button"
              onClick={() => setStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3 | 4) : prev))}
              className="sreg-ghost-btn"
            >
              Back
            </button>

            {step < 4 && (
              <button
                type="button"
                onClick={() => {
                  const error =
                    step === 1
                      ? validateStudent()
                      : step === 2
                        ? validateParent()
                        : validateEnrollment() || validateCurriculum();

                  if (error) {
                    alert(error);
                    return;
                  }

                  setStep((prev) => ((prev + 1) as 1 | 2 | 3 | 4));
                }}
                className="sreg-primary-btn"
              >
                Continue
              </button>
            )}
          </div>
        </article>

        <aside className="sreg-recent-card">
          <div className="sreg-aside-head">
            <div>
              <p>Recent Intake</p>
              <h3>Recent Registrations</h3>
            </div>
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search recent students..."
          />

          <div className="sreg-recent-list">
            {filteredRecentRegistrations.map((item) => (
              <article key={item.student.id} className="sreg-student-card">
                <div
                  className="sreg-avatar"
                  style={{
                    background: item.student.photo
                      ? `url(${item.student.photo}) center/cover`
                      : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))`,
                  }}
                >
                  {!item.student.photo && item.student.fullName.slice(0, 1).toUpperCase()}
                </div>

                <div className="sreg-student-main">
                  <h4>{item.student.fullName}</h4>
                  <p>{item.student.admissionNumber || "No admission no."} · {item.className}</p>
                  <div className="sreg-chip-row">
                    <Chip tone="purple">{item.curriculumName}</Chip>
                    <Chip tone="gray">{item.parentNames.length} parent link(s)</Chip>
                    <Chip tone="blue">{item.enrollmentCount} enrollment(s)</Chip>
                  </div>
                </div>
              </article>
            ))}

            {!filteredRecentRegistrations.length && (
              <section className="sreg-empty-card">
                <div className="sreg-empty-icon">🎓</div>
                <h3>No recent registrations</h3>
                <p>No student registration records match your search in this branch.</p>
              </section>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="sreg-summary-card">
      <div className="sreg-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`sreg-chip ${tone}`}>{children}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="sreg-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SectionTitle({ title, text }: { title: string; text: string }) {
  return (
    <div className="sreg-section-title">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function StepButton({
  step,
  activeStep,
  setStep,
  title,
  subtitle,
}: {
  step: 1 | 2 | 3 | 4;
  activeStep: 1 | 2 | 3 | 4;
  setStep: React.Dispatch<React.SetStateAction<1 | 2 | 3 | 4>>;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={() => setStep(step)}
      className={`sreg-step-btn ${activeStep === step ? "active" : ""}`}
    >
      <strong>{step}. {title}</strong>
      <span>{subtitle}</span>
    </button>
  );
}

function FileField({
  label,
  value,
  alt,
  wide,
  onChange,
}: {
  label: string;
  value?: string;
  alt: string;
  wide?: boolean;
  onChange: (file?: File) => void;
}) {
  return (
    <Field label={label}>
      <input type="file" accept="image/*" onChange={(event) => onChange(event.target.files?.[0])} />
      {value && (
        <img
          src={value}
          alt={alt}
          className={wide ? "sreg-preview wide" : "sreg-preview"}
        />
      )}
    </Field>
  );
}

function ReviewCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="sreg-review-card">
      <h4>{title}</h4>
      <div className="sreg-chip-row">{children}</div>
    </article>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes sregSpin { to { transform: rotate(360deg); } }

.sreg-page {
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
.sreg-page *, .sreg-page *::before, .sreg-page *::after { box-sizing: border-box; }
.sreg-page button, .sreg-page input, .sreg-page select, .sreg-page textarea { font: inherit; max-width: 100%; }
.sreg-page img { max-width: 100%; }
.sreg-page input,
.sreg-page select,
.sreg-page textarea {
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
.sreg-page textarea {
  min-height: 92px;
  padding: 12px;
  resize: vertical;
}
.sreg-page input[type="file"] {
  padding: 10px;
  font-size: 12px;
}

.sreg-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(480px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}
.sreg-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.sreg-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.sreg-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--sreg-primary) 18%, transparent); border-top-color: var(--sreg-primary); animation: sregSpin .8s linear infinite; }

.sreg-primary-btn,
.sreg-save-btn,
.sreg-ghost-btn {
  min-height: 46px;
  border-radius: 999px;
  padding: 0 18px;
  font-weight: 950;
  cursor: pointer;
}
.sreg-primary-btn,
.sreg-save-btn {
  border: 0;
  background: var(--sreg-primary);
  color: #fff;
}
.sreg-save-btn { width: 100%; }
.sreg-ghost-btn {
  border: 1px solid rgba(148, 163, 184, .28);
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
}
.sreg-primary-btn:disabled,
.sreg-save-btn:disabled { opacity: .55; cursor: not-allowed; }

.sreg-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--sreg-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.sreg-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.sreg-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--sreg-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--sreg-primary) 28%, transparent); font-size: 22px; }
.sreg-title-wrap { min-width: 0; }
.sreg-title-wrap p, .sreg-title-wrap h2, .sreg-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sreg-title-wrap p { margin: 0 0 2px; color: var(--sreg-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.sreg-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.sreg-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.sreg-context-card,
.sreg-workflow-card,
.sreg-recent-card,
.sreg-empty-card {
  min-width: 0;
  margin-top: 10px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
  padding: 13px;
}
.sreg-context-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: linear-gradient(135deg, color-mix(in srgb, var(--sreg-primary) 10%, #fff), #fff 68%);
}
.sreg-context-card p { margin: 0; color: var(--sreg-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.sreg-context-card h3 { margin: 4px 0 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.05em; }
.sreg-context-card span { display: block; margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.sreg-pill-row { display: flex; flex-wrap: wrap; gap: 7px; }

.sreg-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.sreg-summary-card {
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
.sreg-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--sreg-primary) 12%, #fff); }
.sreg-summary-card div:last-child { min-width: 0; }
.sreg-summary-card strong, .sreg-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sreg-summary-card strong { font-size: 20px; font-weight: 1000; letter-spacing: -.05em; }
.sreg-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.sreg-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}
.sreg-workflow-card,
.sreg-recent-card { background: linear-gradient(135deg, #fff, #f8fafc); }
.sreg-step-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.sreg-step-btn {
  min-width: 0;
  min-height: 62px;
  text-align: left;
  border-radius: 18px;
  padding: 10px;
  border: 1px solid rgba(148, 163, 184, .25);
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  cursor: pointer;
}
.sreg-step-btn.active {
  border-color: color-mix(in srgb, var(--sreg-primary) 48%, transparent);
  background: color-mix(in srgb, var(--sreg-primary) 9%, #fff);
  box-shadow: 0 12px 26px color-mix(in srgb, var(--sreg-primary) 10%, transparent);
}
.sreg-step-btn strong,
.sreg-step-btn span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sreg-step-btn strong { font-size: 13px; font-weight: 1000; }
.sreg-step-btn span { margin-top: 3px; color: var(--muted, #64748b); font-size: 11px; font-weight: 800; }
.sreg-step-body { margin-top: 16px; }
.sreg-form-section { display: grid; gap: 12px; }
.sreg-section-title h3 { margin: 0; font-size: 20px; font-weight: 1000; letter-spacing: -.04em; }
.sreg-section-title p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.5; font-weight: 650; }
.sreg-form-two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.sreg-field { display: grid; gap: 6px; min-width: 0; }
.sreg-field > span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.sreg-check {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 12px;
  border-radius: 18px;
  background: rgba(148, 163, 184, .08);
  border: 1px solid rgba(148, 163, 184, .14);
  font-size: 13px;
  font-weight: 850;
}
.sreg-check input { width: 18px; min-height: 18px; flex: 0 0 auto; }
.sreg-preview { width: 92px; height: 84px; border-radius: 16px; margin-top: 8px; object-fit: cover; display: block; border: 1px solid rgba(148, 163, 184, .24); }
.sreg-preview.wide { width: 100%; max-width: 260px; }
.sreg-review-card {
  padding: 12px;
  border-radius: 18px;
  background: rgba(148, 163, 184, .08);
  border: 1px solid rgba(148, 163, 184, .14);
}
.sreg-review-card h4 { margin: 0 0 10px; font-size: 15px; font-weight: 1000; }
.sreg-chip-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; min-width: 0; }
.sreg-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sreg-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.sreg-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.sreg-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.sreg-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.sreg-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.sreg-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.sreg-nav-row { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
.sreg-nav-row button { flex: 1 1 140px; }

.sreg-aside-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.sreg-aside-head p { margin: 0; color: var(--sreg-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.sreg-aside-head h3 { margin: 3px 0 0; font-size: 19px; font-weight: 1000; letter-spacing: -.04em; }
.sreg-recent-list { display: grid; gap: 9px; margin-top: 10px; }
.sreg-student-card {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px;
  border-radius: 19px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .18);
}
.sreg-avatar { width: 48px; height: 48px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 17px; color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15, 23, 42, .12); }
.sreg-student-main { min-width: 0; flex: 1; }
.sreg-student-main h4,
.sreg-student-main p { display: block; overflow: hidden; text-overflow: ellipsis; }
.sreg-student-main h4 { margin: 0; font-size: 15px; font-weight: 1000; letter-spacing: -.03em; }
.sreg-student-main p { margin: 4px 0 9px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.sreg-empty-card { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; text-align: center; border-style: dashed; }
.sreg-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--sreg-primary) 12%, #fff); font-size: 28px; }
.sreg-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.sreg-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

@media (max-width: 390px) {
  .sreg-page { padding: 6px; }
  .sreg-hero { padding: 10px; border-radius: 24px; }
  .sreg-hero-icon { width: 42px; height: 42px; border-radius: 16px; }
  .sreg-hero .sreg-ghost-btn { width: 100%; }
  .sreg-hero { flex-wrap: wrap; }
  .sreg-summary-grid { grid-template-columns: minmax(0, 1fr); }
  .sreg-step-grid { grid-template-columns: minmax(0, 1fr); }
  .sreg-student-card { flex-direction: column; }
}

@media (min-width: 560px) {
  .sreg-page { padding: 14px; }
  .sreg-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sreg-form-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 980px) {
  .sreg-page { padding: 18px; }
  .sreg-summary-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .sreg-shell { grid-template-columns: minmax(0, 1.35fr) minmax(320px, .75fr); gap: 14px; }
  .sreg-step-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .sreg-workflow-card,
  .sreg-recent-card { padding: 16px; }
}
`;
