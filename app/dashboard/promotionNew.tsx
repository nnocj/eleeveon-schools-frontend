/*"use client";

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Student,
  Class,
  StudentEnrollment,
  AssessmentEntry,
  AcademicPeriod,
  Subject,
} from "../lib/db";

import { useSettings } from "../context/settings-context";

// ======================================================
// TYPES
// ======================================================

type StudentResult = {
  studentId: number;
  studentName: string;
  classId: number;
  total: number;
  average: number;
  eligible: boolean;
  recommendation: "PROMOTE" | "REPEAT";
};

// ======================================================
// PROPS (IMPORTANT FOR DASHBOARD TABS)
// ======================================================

type Props = {
  navigate?: (key: string) => void;
};

// ======================================================
// COMPONENT
// ======================================================

export default function PromotionPage({ navigate }: Props) {
  const { settings } = useSettings();

  const primary =
    settings?.primaryColor || "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [entries, setEntries] = useState<AssessmentEntry[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [selectedClass, setSelectedClass] = useState<number>(0);

  // ======================================================
  // NAVIGATION (TAB SYSTEM STYLE)
  // ======================================================

  const goToGraduationAudit = () => {
    if (navigate) {
      navigate("graduationAudit");
    } else {
      // fallback (only if used outside dashboard)
      console.warn("Navigate function not provided");
    }
  };

  // ======================================================
  // LOAD
  // ======================================================

  const load = async () => {
    setLoading(true);

    try {
      const [st, cl, en, ae, pr, sb] = await Promise.all([
        db.students.toArray(),
        db.classes.toArray(),
        db.studentEnrollments.toArray(),
        db.assessmentEntries.toArray(),
        db.academicPeriods.toArray(),
        db.subjects.toArray(),
      ]);

      setStudents(st.filter(x => !x.isDeleted));
      setClasses(cl.filter(x => !x.isDeleted));
      setEnrollments(en.filter(x => !x.isDeleted));
      setEntries(ae.filter(x => !x.isDeleted));
      setPeriods(pr.filter(x => !x.isDeleted));
      setSubjects(sb.filter(x => !x.isDeleted));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // ======================================================
  // FILTER STUDENTS
  // ======================================================

  const classStudents = useMemo(() => {
    if (!selectedClass) return [];

    return students.filter(
      s => Number(s.currentClassId) === Number(selectedClass)
    );
  }, [students, selectedClass]);

  // ======================================================
  // RESULTS
  // ======================================================

  const results: StudentResult[] = useMemo(() => {
    return classStudents.map(student => {
      const studentEntries = entries.filter(
        e => e.studentId === student.id
      );

      const total = studentEntries.reduce(
        (sum, e) => sum + Number(e.score || 0),
        0
      );

      const count = studentEntries.length || 1;

      const average = total / count;

      const eligible = average >= 50;

      return {
        studentId: student.id!,
        studentName: student.fullName,
        classId: selectedClass,
        total,
        average,
        eligible,
        recommendation: eligible ? "PROMOTE" : "REPEAT",
      };
    });
  }, [classStudents, entries, selectedClass]);

  // ======================================================
  // PROMOTION ACTION
  // ======================================================

  const promoteStudents = async () => {
    if (!selectedClass) {
      alert("Select a class first");
      return;
    }

    try {
      const now = Date.now();

      for (const r of results) {
        if (!r.eligible) continue;

        const student = students.find(s => s.id === r.studentId);
        if (!student) continue;

        const nextClass = classes.find(
          c => Number(c.id) > Number(selectedClass)
        );

        if (!nextClass) continue;

        await db.students.update(student.id!, {
          currentClassId: nextClass.id,
          updatedAt: now,
        });

        const activeEnrollment = enrollments.find(
          e => e.studentId === student.id && e.classId === selectedClass
        );

        if (activeEnrollment?.id) {
          await db.studentEnrollments.update(activeEnrollment.id, {
            status: "completed",
            endDate: new Date().toISOString(),
            updatedAt: now,
          });
        }

        await db.studentEnrollments.add({
          branchId: student.branchId,
          studentId: student.id!,
          classId: nextClass.id!,
          academicStructureId: activeEnrollment?.academicStructureId || 0,
          academicPeriodId: activeEnrollment?.academicPeriodId || 0,
          startDate: new Date().toISOString(),
          status: "active",
          updatedAt: now,
          version: 1,
          deviceId: "local",
          synced: "pending" as any,
          isDeleted: false,
        });
      }

      alert("Promotion completed");
      load();

    } catch (err) {
      console.error(err);
      alert("Promotion failed");
    }
  };

  // ======================================================
  // UI
  // ======================================================

  if (loading) {
    return <div style={{ padding: 20 }}>Loading promotion engine...</div>;
  }

  return (
    <div style={{ padding: 20, color: "var(--text)" }}>

      {/* HEADER *//*}
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h2>Student Promotion Engine</h2>

        {/* TAB-STYLE NAV BUTTON *//*}
        <button
          onClick={goToGraduationAudit}
          style={{
            padding: "10px 14px",
            background: "transparent",
            border: `1px solid ${primary}`,
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 700,
            color: "var(--text)",
          }}
        >
          Graduation Audit
        </button>
      </div>

      {/* CLASS SELECT *//*}
      <div style={{ marginTop: 20 }}>
        <select
          value={selectedClass}
          onChange={e => setSelectedClass(Number(e.target.value))}
        >
          <option value={0}>Select Class</option>

          {classes.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <button
          style={{
            marginLeft: 10,
            padding: "10px 14px",
            background: primary,
            color: "#fff",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
          }}
          onClick={promoteStudents}
        >
          Promote Eligible Students
        </button>
      </div>

      {/* TABLE *//*}
      <div style={{ marginTop: 20, overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 700 }}>
          <thead>
            <tr>
              <th>Student</th>
              <th>Total Score</th>
              <th>Average</th>
              <th>Status</th>
              <th>Recommendation</th>
            </tr>
          </thead>

          <tbody>
            {results.map(r => (
              <tr key={r.studentId}>
                <td>{r.studentName}</td>
                <td>{r.total.toFixed(2)}</td>
                <td>{r.average.toFixed(2)}</td>
                <td>{r.eligible ? "Eligible" : "Not Eligible"}</td>
                <td style={{ fontWeight: 700 }}>
                  {r.recommendation}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}*/

export default function PromotionNew(){
  <div>Promotion New</div>
}