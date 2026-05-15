/*"use client";

import React, { useEffect, useMemo, useState } from "react";
import { db, Student, Class } from "../lib/db";
import { useSettings } from "../context/settings-context";

// ======================================================
// TYPES
// ======================================================

type Decision = "promote" | "repeat" | "graduate";

interface StudentRow {
  student: Student;
  className: string;
  average: number;
  autoDecision: Decision;
}

// ======================================================
// CONSTANTS
// ======================================================

const PASS_MARK = 50;

// ======================================================
// COMPONENT
// ======================================================

export default function PromotionPage() {
  const { settings } = useSettings();

  const branchId = settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [rows, setRows] = useState<StudentRow[]>([]);

  const [selectedClassId, setSelectedClassId] = useState<number>();
  const [overrides, setOverrides] = useState<Record<number, Decision>>({});
  const [targetClassMap, setTargetClassMap] = useState<Record<number, number>>({});

  const [loading, setLoading] = useState(true);

  // ======================================================
  // STYLES (CONSISTENT SYSTEM)
  // ======================================================

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 20,
    padding: 18,
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "var(--surface)",
    color: "var(--text)",
  };

  const button: React.CSSProperties = {
    padding: "12px 18px",
    borderRadius: 12,
    border: "none",
    background: primary,
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  };

  const badge: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(0,0,0,0.06)",
    fontSize: 12,
    fontWeight: 700,
  };

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    setLoading(true);

    const [studentData, classData, scores] = await Promise.all([
      db.students.toArray(),
      db.classes.toArray(),
      db.scores.toArray(),
    ]);

    const filteredStudents = studentData.filter(
      (s) => s.branchId === branchId && !s.isDeleted
    );

    const filteredClasses = classData.filter(
      (c) => c.branchId === branchId && !c.isDeleted
    );

    setStudents(filteredStudents);
    setClasses(filteredClasses);

    const classMap = new Map(filteredClasses.map((c) => [c.id!, c.name]));

    const mapped: StudentRow[] = filteredStudents.map((s) => {
      const studentScores = scores.filter(
        (sc) => sc.studentId === s.id && sc.branchId === branchId
      );

      const avg =
        studentScores.length > 0
          ? studentScores.reduce((sum, x) => sum + (x.average || x.total || 0), 0) /
            studentScores.length
          : 0;

      const decision: Decision = avg < PASS_MARK ? "repeat" : "promote";

      return {
        student: s,
        className: classMap.get(s.currentClassId || 0) || "Unknown",
        average: avg,
        autoDecision: decision,
      };
    });

    setRows(mapped);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // FILTERED
  // ======================================================

  const filteredRows = useMemo(() => {
    return selectedClassId
      ? rows.filter((r) => r.student.currentClassId === selectedClassId)
      : rows;
  }, [rows, selectedClassId]);

  // ======================================================
  // ACTIONS
  // ======================================================

  const handleDecision = (id: number, value: Decision) => {
    setOverrides((prev) => ({ ...prev, [id]: value }));
  };

  const handleClassChange = (id: number, classId: number) => {
    setTargetClassMap((prev) => ({ ...prev, [id]: classId }));
  };

  const runPromotion = async () => {
    for (const row of filteredRows) {
      const decision = overrides[row.student.id!] || row.autoDecision;

      const newClass =
        targetClassMap[row.student.id!] || row.student.currentClassId;

      let status: Student["status"] = "active";

      if (decision === "graduate") status = "graduated";
      if (decision === "repeat") status = "active";

      await db.students.update(row.student.id!, {
        currentClassId: decision === "promote" ? newClass : row.student.currentClassId,
        status,
      });
    }

    alert("Promotion completed successfully");
    setOverrides({});
    setTargetClassMap({});
    load();
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
      <div style={{ ...card }}>
        <h2>Promotion Engine</h2>

        <select
          style={input}
          value={selectedClassId || ""}
          onChange={(e) => setSelectedClassId(Number(e.target.value))}
        >
          <option value="">All Classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* TABLE *//*}
      <div style={{ ...card, marginTop: 20, overflowX: "auto" }}>
        <table style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Student</th>
              <th>Class</th>
              <th>Average</th>
              <th>Decision</th>
              <th>Override</th>
              <th>Move To</th>
            </tr>
          </thead>

          <tbody>
            {filteredRows.map((row) => {
              const finalDecision =
                overrides[row.student.id!] || row.autoDecision;

              return (
                <tr key={row.student.id}>
                  <td>{row.student.fullName}</td>
                  <td>{row.className}</td>
                  <td>{row.average.toFixed(1)}</td>
                  <td>{row.autoDecision}</td>

                  <td>
                    <select
                      style={input}
                      value={finalDecision}
                      onChange={(e) =>
                        handleDecision(row.student.id!, e.target.value as Decision)
                      }
                    >
                      <option value="promote">Promote</option>
                      <option value="repeat">Repeat</option>
                      <option value="graduate">Graduate</option>
                    </select>
                  </td>

                  <td>
                    <select
                      style={input}
                      onChange={(e) =>
                        handleClassChange(row.student.id!, Number(e.target.value))
                      }
                    >
                      <option>Keep Current</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <button style={button} onClick={runPromotion}>
          Run Promotion
        </button>
      </div>
    </div>
  );
}*/
export default function Promotion(){
  <div>Promotion</div>
}