"use client";

import React, { useEffect, useState } from "react";
import { db } from "../lib/db";
import { runAcademicEngine } from "../lib/engine/academicEngine";
import { getAverage } from "../lib/calculations/promotion";

type Decision = "promote" | "repeat" | "graduate";

interface StudentRow {
  id: number;
  name: string;
  classId: number;
  className: string;
  term: string;
  avg: number;
  autoDecision: Decision;
}

const PASS_MARK = 50;

const TERMS = ["Term 1", "Term 2", "Term 3"] as const;

// ================= NEXT TERM CALC =================
const getNextTerm = (term: string) => {
  const index = TERMS.indexOf(term as any);
  return TERMS[index + 1] || null;
};

const Promotion: React.FC = () => {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);

  // 🔥 NEW: CLASS FILTER
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const [overrides, setOverrides] = useState<
    Record<number, Decision>
  >({});

  const [classSelections, setClassSelections] = useState<
    Record<number, number>
  >({});

  // ================= LOAD =================
  const loadData = async () => {
    const [allStudents, scores, settingsData, classList] =
      await Promise.all([
        db.students.toArray(),
        db.scores.toArray(),
        db.settings.toArray(),
        db.classes.toArray(),
      ]);

    const current = settingsData[0];
    setSettings(current);
    setClasses(classList);

    const classMap = new Map(classList.map((c) => [c.id, c.name]));

    const data: StudentRow[] = allStudents.map((s) => {
      const studentScores = scores.filter(
        (sc) =>
          sc.studentId === s.id &&
          sc.academicYear === current.academicYear &&
          sc.term === current.currentTerm
      );

      const avg = getAverage(studentScores);

      const decision: Decision =
        avg < PASS_MARK ? "repeat" : "promote";

      return {
        id: s.id!,
        name: s.fullName,
        classId: s.classId,
        className: classMap.get(s.classId) || "Unknown",
        term: s.term,
        avg,
        autoDecision: decision,
      };
    });

    setStudents(data);
  };

  useEffect(() => {
    loadData();
  }, []);

  // ================= ACTIONS =================
  const handleOverride = (id: number, value: Decision) => {
    setOverrides((prev) => ({ ...prev, [id]: value }));
  };

  const handleClassSelect = (id: number, classId: number) => {
    setClassSelections((prev) => ({
      ...prev,
      [id]: classId,
    }));
  };

  const handlePromote = async () => {
    await runAcademicEngine(overrides, classSelections);

    alert("Promotion completed successfully");

    setOverrides({});
    setClassSelections({});
    loadData();
  };

  // ================= FILTERED STUDENTS =================
  const filteredStudents = selectedClassId
    ? students.filter(
        (s) => Number(s.classId) === Number(selectedClassId)
      )
    : students;

  // ================= UI =================
  return (
    <div style={{ padding: 20 }}>
      <h2>Student Promotion Panel</h2>

      {/* 🔥 CLASS FILTER (NEW) */}
      <div style={{ marginBottom: 15 }}>
        <select
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(e.target.value)}
        >
          <option value="">-- Select Class (All Students) --</option>

          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <table border={1} cellPadding={8} width="100%">
        <thead>
          <tr>
            <th>Name</th>
            <th>Current Status</th>
            <th>Average</th>
            <th>Decision</th>
            <th>Override</th>
            <th>Promotion Path</th>
          </tr>
        </thead>

        <tbody>
          {filteredStudents.map((s) => {
            const finalDecision =
              overrides[s.id] || s.autoDecision;

            const nextTerm = getNextTerm(s.term);

            const selectedClass =
              classSelections[s.id] !== undefined
                ? classes.find(
                    (c) => c.id === classSelections[s.id]
                  )?.name
                : s.className;

            return (
              <tr key={s.id}>
                <td>{s.name}</td>

                {/* CURRENT */}
                <td>
                  {s.className} {s.term}
                </td>

                <td>{s.avg.toFixed(2)}</td>

                <td>{s.autoDecision}</td>

                {/* OVERRIDE */}
                <td>
                  <select
                    value={finalDecision}
                    onChange={(e) =>
                      handleOverride(
                        s.id,
                        e.target.value as Decision
                      )
                    }
                  >
                    <option value="promote">Promote</option>
                    <option value="repeat">Repeat</option>
                    <option value="graduate">Graduate</option>
                  </select>
                </td>

                {/* PROMOTION PATH (UNCHANGED) */}
                <td>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div>
                      <b>
                        {s.className} {s.term}
                      </b>{" "}
                      →{" "}
                      <b>
                        {selectedClass}{" "}
                        {finalDecision === "promote"
                          ? nextTerm || "Term 1"
                          : s.term}
                      </b>
                    </div>

                    <select
                      value={
                        classSelections[s.id] || s.classId
                      }
                      onChange={(e) =>
                        handleClassSelect(
                          s.id,
                          Number(e.target.value)
                        )
                      }
                    >
                      <option value="">Keep Same Class</option>

                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <button
        onClick={handlePromote}
        style={{ marginTop: 20 }}
      >
        Run Promotion
      </button>
    </div>
  );
};

export default Promotion;