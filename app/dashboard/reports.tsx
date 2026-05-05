"use client";

import React, { useEffect, useMemo, useState } from "react";
import { db, TermType } from "../lib/db";
import { getRemark } from "../lib/calculations/grading";
import { useSettings } from "../context/settings-context";

const TERMS: TermType[] = ["Term 1", "Term 2", "Term 3"];

type TabType = "student" | "class" | "subject";

const Reports: React.FC = () => {
  const { settings } = useSettings();

  const currentYear = settings?.academicYear || "";
  const currentTerm = settings?.currentTerm;

  const [tab, setTab] = useState<TabType>("student");

  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [reportItems, setReportItems] = useState<any[]>([]);
  const [classTeachers, setClassTeachers] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [years, setYears] = useState<string[]>([]);

  // ================= FILTERS =================
  const [studentId, setStudentId] = useState<number | null>(null);
  const [classId, setClassId] = useState<number | null>(null);
  const [year, setYear] = useState<string>("");
  const [term, setTerm] = useState<TermType | "">("");
  const [subjectId, setSubjectId] = useState<number | null>(null);

  // ================= LOAD =================
  const loadData = async () => {
    const [st, cl, sb, items, ct, te] = await Promise.all([
      db.students.toArray(),
      db.classes.toArray(),
      db.subjects.toArray(),
      db.reportCardItems.toArray(),
      db.classTeachers.toArray(),
      db.teachers.toArray(),
    ]);

    setStudents(st);
    setClasses(cl);
    setSubjects(sb);
    setReportItems(items);
    setClassTeachers(ct);
    setTeachers(te);

    // 🔥 IMPORTANT: ALWAYS INCLUDE CURRENT YEAR EVEN IF EMPTY IN ITEMS
    const itemYears = items.map((r) => r.academicYear).filter(Boolean);

    const mergedYears = Array.from(
      new Set([currentYear, ...itemYears])
    ).filter(Boolean);

    setYears(mergedYears);
  };

  useEffect(() => {
    loadData();
  }, [currentYear]);

  // ================= HELPERS =================
  const getClassTeacher = (classId: number) => {
    const ct = classTeachers.find((c) => c.classId === classId);
    if (!ct) return "N/A";
    return teachers.find((t) => t.id === ct.teacherId)?.fullName || "N/A";
  };

  // ================= STUDENT VIEW =================
  const renderStudent = () => {
    if (!studentId) return null;

    const student = students.find((s) => s.id === studentId);

    const grouped: Record<string, any> = {};

    const studentItems = reportItems.filter((r) => r.studentId === studentId);

    // 🔥 ENSURE ITEMS NEVER DROP WITHOUT YEAR
    studentItems.forEach((r) => {
      const y = r.academicYear || currentYear || "Unknown Year";

      if (!grouped[y]) grouped[y] = {};
      if (!grouped[y][r.classId]) grouped[y][r.classId] = {};
      if (!grouped[y][r.classId][r.term]) grouped[y][r.classId][r.term] = [];

      grouped[y][r.classId][r.term].push(r);
    });

    return (
      <div>
        <h2>{student?.fullName}</h2>

        {Object.keys(grouped).map((y) => (
          <div key={y} style={{ marginBottom: 30 }}>
            <h3>📘 Academic Year: {y}</h3>

            {Object.keys(grouped[y]).map((cId) => {
              const className =
                classes.find((c) => c.id === Number(cId))?.name ||
                "Unknown Class";

              return (
                <div key={cId} style={{ marginBottom: 20 }}>
                  <h4>
                    🏫 {className}
                  </h4>

                  <p>
                    <strong>Head Teacher:</strong>{" "}
                    {getClassTeacher(Number(cId))}
                  </p>

                  {TERMS.map((t) => {
                    const items = grouped[y][cId][t];
                    if (!items) return null;

                    return (
                      <div key={t} style={{ marginBottom: 15 }}>
                        <h5>📄 {t}</h5>

                        <table border={1} cellPadding={6} width="100%">
                          <thead>
                            <tr>
                              <th>Subject</th>
                              <th>Teacher</th>
                              <th>CT</th>
                              <th>Proj</th>
                              <th>CA</th>
                              <th>Exam</th>
                              <th>Total</th>
                              <th>Grade</th>
                              <th>Remark</th>
                            </tr>
                          </thead>

                          <tbody>
                            {items.map((r: any) => (
                              <tr key={r.id}>
                                <td>{r.subjectName}</td>
                                <td>{r.teacherName || "N/A"}</td>
                                <td>{r.classTest}</td>
                                <td>{r.project}</td>
                                <td>{r.ca}</td>
                                <td>{r.exam}</td>
                                <td>{r.total}</td>
                                <td>{r.grade}</td>
                                <td>{getRemark(r.grade)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  // ================= CLASS VIEW =================
  const renderClass = () => {
    if (!classId || !year || !term) return null;

    const classStudents = students.filter((s) => s.classId === classId);

    return (
      <div>
        <h2>
          {classes.find((c) => c.id === classId)?.name} | {year} ({term})
        </h2>

        <p>
          <strong>Head Teacher:</strong> {getClassTeacher(classId)}
        </p>

        {classStudents.map((s) => {
          const items = reportItems.filter(
            (r) =>
              r.studentId === s.id &&
              r.classId === classId &&
              (r.academicYear || currentYear) === year &&
              r.term === term
          );

          if (!items.length) return null;

          return (
            <div key={s.id} style={{ marginBottom: 20 }}>
              <h4>{s.fullName}</h4>

              <table border={1} cellPadding={6} width="100%">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Total</th>
                    <th>Grade</th>
                    <th>Remark</th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((r) => (
                    <tr key={r.id}>
                      <td>{r.subjectName}</td>
                      <td>{r.total}</td>
                      <td>{r.grade}</td>
                      <td>{getRemark(r.grade)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    );
  };

  // ================= SUBJECT VIEW =================
  const renderSubject = () => {
    if (!classId || !year || !term || !subjectId) return null;

    const classStudents = students.filter((s) => s.classId === classId);

    return (
      <div>
        <h2>
          {subjects.find((s) => s.id === subjectId)?.name} | {year} ({term})
        </h2>

        <table border={1} cellPadding={6} width="100%">
          <thead>
            <tr>
              <th>Student</th>
              <th>Total</th>
              <th>Grade</th>
            </tr>
          </thead>

          <tbody>
            {classStudents.map((s) => {
              const item = reportItems.find(
                (r) =>
                  r.studentId === s.id &&
                  r.classId === classId &&
                  r.subjectId === subjectId &&
                  (r.academicYear || currentYear) === year &&
                  r.term === term
              );

              return (
                <tr key={s.id}>
                  <td>{s.fullName}</td>
                  <td>{item?.total || "-"}</td>
                  <td>{item?.grade || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // ================= UI =================
  return (
    <div style={{ padding: 20 }}>
      <h1>Reports Dashboard</h1>

      <div style={{ marginBottom: 15 }}>
        <button onClick={() => setTab("student")}>Student</button>
        <button onClick={() => setTab("class")}>Class</button>
        <button onClick={() => setTab("subject")}>Subject</button>
      </div>

      {tab === "student" && (
        <>
          <select onChange={(e) => setStudentId(Number(e.target.value))}>
            <option value="">Select Student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </select>

          {renderStudent()}
        </>
      )}

      {tab === "class" && (
        <>
          <select onChange={(e) => setClassId(Number(e.target.value))}>
            <option value="">Class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select onChange={(e) => setYear(e.target.value)}>
            <option value="">Year</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>

          <select onChange={(e) => setTerm(e.target.value as TermType)}>
            <option value="">Term</option>
            {TERMS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>

          {renderClass()}
        </>
      )}

      {tab === "subject" && (
        <>
          <select onChange={(e) => setClassId(Number(e.target.value))}>
            <option value="">Class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select onChange={(e) => setYear(e.target.value)}>
            <option value="">Year</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>

          <select onChange={(e) => setTerm(e.target.value as TermType)}>
            <option value="">Term</option>
            {TERMS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>

          <select onChange={(e) => setSubjectId(Number(e.target.value))}>
            <option value="">Subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {renderSubject()}
        </>
      )}
    </div>
  );
};

export default Reports;