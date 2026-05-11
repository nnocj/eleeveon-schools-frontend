/** 3. Data Layer (AssessmentEntry)
Actual student scores
Tied to:
student
class
subject
structure item

👉 This is your raw performance data


*/



"use client";

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  db,
  Student,
  Class,
  Subject,
  AssessmentStructureItem,
  AssessmentEntry,
  AssessmentComponent,
  StudentEnrollment,
} from "../lib/db";

import { prepareSyncData, } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";
import { SyncStatus } from "../lib/constants/syncStatus";

// ======================================================
// TYPES
// ======================================================

type ScoreMap = Record<string, number>;

// ======================================================
// COMPONENT
// ======================================================

export default function AssessmentEntriesPage() {
  const { settings } = useSettings();

  const branchId = settings?.branchId ?? 1;
  const organizationId = settings?.organizationId;

  const primary =
    settings?.primaryColor || "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);

  // ======================================================
  // DATA
  // ======================================================

  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [items, setItems] = useState<AssessmentStructureItem[]>([]);
  const [entries, setEntries] = useState<AssessmentEntry[]>([]);
  const [components, setComponents] = useState<AssessmentComponent[]>([]);

  // ======================================================
  // FILTERS
  // ======================================================

  const [classId, setClassId] = useState<number>(0);
  const [subjectId, setSubjectId] = useState<number>(0);

  // ======================================================
  // GRID STATE
  // ======================================================

  const [scores, setScores] = useState<ScoreMap>({});

  // ======================================================
  // STYLES
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
    outline: "none",
  };

  const button: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 12,
    border: "none",
    background: primary,
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  };

  // ======================================================
  // LOAD
  // ======================================================

  const load = async () => {
    setLoading(true);

    try {
      const [st, cl, sb, it, en, comp, enr] = await Promise.all([
        db.students.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.assessmentStructureItems.toArray(),
        db.assessmentEntries.toArray(),
        db.assessmentComponents.toArray(),
        db.studentEnrollments.toArray(),
      ]);

      setStudents(st.filter(x => !x.isDeleted));

      setClasses(cl.filter(x => x.branchId === branchId && !x.isDeleted));
      setSubjects(sb.filter(x => x.branchId === branchId && !x.isDeleted));
      setItems(it.filter(x => x.branchId === branchId && !x.isDeleted));
      setEntries(en.filter(x => x.branchId === branchId && !x.isDeleted));
      setComponents(comp.filter(x => x.branchId === branchId && !x.isDeleted));
      setEnrollments(enr.filter(x => x.branchId === branchId && !x.isDeleted));

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // STRUCTURE
  // ======================================================

  const matchingComponent = useMemo(() => {
    return components.find(
      c =>
        Number(c.classId) === Number(classId) &&
        Number(c.subjectId) === Number(subjectId) &&
        c.active
    );
  }, [components, classId, subjectId]);

  const structureId =
    matchingComponent?.assessmentStructureId || 0;

  const filteredItems = useMemo(() => {
    if (!structureId) return [];

    return items.filter(
      i =>
        Number(i.assessmentStructureId) === Number(structureId)
    );
  }, [items, structureId]);

  // ======================================================
  // STUDENTS FILTER
  // ======================================================

  const filteredStudents = useMemo(() => {
    if (!classId) return [];

    const selectedClassId = Number(classId);

    return students.filter(student => {
      const studentClassId = Number(student.currentClassId ?? 0);
      return studentClassId === selectedClassId;
    });
  }, [students, classId]);

  // ======================================================
  // ENTRY TRACKING
  // ======================================================

  const studentEntryCount = useMemo(() => {
    const map: Record<number, number> = {};

    for (const s of filteredStudents) {
      let count = 0;

      for (const i of filteredItems) {
        const key = `${s.id}-${i.id}`;
        if (scores[key] != null && scores[key] !== 0) {
          count++;
        }
      }

      map[s.id!] = count;
    }

    return map;
  }, [filteredStudents, filteredItems, scores]);

  // ======================================================
  // ANALYTICS
  // ======================================================

  const totalStudents = filteredStudents.length;
  const totalItems = filteredItems.length;

  const totalEntries = entries.filter(
    e =>
      Number(e.classId) === Number(classId) &&
      Number(e.subjectId) === Number(subjectId) &&
      Number(e.assessmentStructureId) === Number(structureId)
  ).length;

  const totalWeight = filteredItems.reduce(
    (sum, item) => sum + Number(item.weight || 0),
    0
  );

  // ======================================================
  // SESSION
  // ======================================================

  useEffect(() => {
    setSessionStarted(!!classId);
  }, [classId]);

  const startSession = () => {
    if (!classId || !subjectId) {
      alert("Select class and subject");
      return;
    }

    if (!matchingComponent) {
      alert("No assessment component configured");
      return;
    }

    setSessionStarted(true);
  };

  // ======================================================
  // UPDATE
  // ======================================================

  const updateScore = (studentId: number, item: any, value: string) => {
    const num = Number(value);

    setScores(prev => ({
      ...prev,
      [`${studentId}-${item.id}`]:
        num > item.maxScore ? item.maxScore : num,
    }));
  };

  // ======================================================
  // SAVE
  // ======================================================

  const saveAll = async () => {
    setSaving(true);

    try {
      if (!structureId) {
        alert("No assessment structure selected");
        return;
      }

      if (!matchingComponent) {
        alert("No assessment component configured");
        return;
      }

      const academicPeriodId = matchingComponent.academicPeriodId;
      const now = Date.now();

      const payload: AssessmentEntry[] = [];

      for (const student of filteredStudents) {
        for (const item of filteredItems) {
          const key = `${student.id}-${item.id}`;
          const score = scores[key];

          if (score == null) continue;

          payload.push(
            prepareSyncData({
              branchId,
              organizationId,
              schoolId: undefined,

              academicStructureId: undefined,
              academicPeriodId,

              gradingSystemId: matchingComponent.gradingSystemId,
              assessmentStructureId: structureId,
              assessmentStructureItemId: item.id!,

              studentId: student.id!,
              classId,
              subjectId,

              score,

              grade: undefined,
              remark: undefined,

              published: false,
              locked: false,
              active: true,

              updatedAt: now,
              createdAt: now,
              version: 1,
              deviceId: "local-device",
              synced: SyncStatus.PENDING,
              isDeleted: false,
            })
          );
        }
      }

      for (const entry of payload) {
        const existing = await db.assessmentEntries
          .where({
            studentId: entry.studentId,
            assessmentStructureItemId: entry.assessmentStructureItemId,
            classId: entry.classId,
            subjectId: entry.subjectId,
            assessmentStructureId: entry.assessmentStructureId,
          })
          .first();

        if (existing?.id) {
          await db.assessmentEntries.update(existing.id, {
            score: entry.score,
            updatedAt: now,
            synced: SyncStatus.PENDING,
          });
        } else {
          await db.assessmentEntries.add(entry);
        }
      }

      await load();
      alert("Saved successfully");

    } catch (err) {
      console.error(err);
      alert("Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // UI
  // ======================================================

  if (loading) {
    return <div style={{ padding: 20 }}>Loading...</div>;
  }

  return (
    <div style={{ padding: 20, color: "var(--text)" }}>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>Assessment Entries</h2>

        <button style={button} onClick={startSession}>
          {sessionStarted ? "Session Active" : "Start Session"}
        </button>
      </div>

      <div style={{ ...card, marginTop: 20, display: "grid", gap: 12 }}>
        <select
          style={input}
          value={String(classId || "")}
          onChange={e => setClassId(Number(e.target.value || 0))}
        >
          <option value={0}>Select Class</option>
          {classes.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          style={input}
          value={subjectId || ""}
          onChange={e => setSubjectId(Number(e.target.value))}
        >
          <option value={0}>Select Subject</option>
          {subjects.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginTop: 20 }}>
        <div style={card}>Students: {totalStudents}</div>
        <div style={card}>Items: {totalItems}</div>
        <div style={card}>Entries: {totalEntries}</div>
        <div style={card}>Weight: {totalWeight}%</div>
      </div>

      {sessionStarted && (
        <div style={{ ...card, marginTop: 20, overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 900 }}>
            <thead>
              <tr>
                <th>Student</th>

                {filteredItems.map(i => (
                  <th key={i.id}>
                    {i.name}
                    <div style={{ fontSize: 10, opacity: 0.6 }}>
                      (Max: {i.maxScore})
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredStudents.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.fullName}</td>

                  {filteredItems.map(i => {
                    const key = `${s.id}-${i.id}`;

                    return (
                      <td key={key}>
                        <input
                          type="number"
                          style={input}
                          placeholder={`Enter / ${i.maxScore}`}
                          value={scores[key] ?? ""}
                          onChange={e =>
                            updateScore(s.id!, i, e.target.value)
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <button style={button} disabled={saving} onClick={saveAll}>
              {saving ? "Saving..." : "Save All"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}