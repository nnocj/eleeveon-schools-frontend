"use client";

import { useEffect, useState } from "react";
import { db, Student } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";

export default function Students() {
  // ================= UI STATE =================
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState("");

  // ================= FORM =================
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [classId, setClassId] = useState("");

  // ================= LOAD =================
  const load = async () => {
    const [studentsData, classesData, attendanceData] = await Promise.all([
      db.students.toArray(),
      db.classes.toArray(),
      db.attendance.toArray(),
    ]);

    setStudents(studentsData);
    setClasses(classesData);
    setAttendance(attendanceData);
  };

  useEffect(() => {
    load();
  }, []);

  // ================= RESET =================
  const resetForm = () => {
    setFullName("");
    setAge("");
    setParentName("");
    setParentPhone("");
    setClassId("");
    setEditingId(null);
    setShowForm(false);
  };

  // ================= SAVE =================
  const saveStudent = async () => {
    if (!fullName.trim() || !classId) return;

    const sys = (await db.settings.toArray())[0];

    const payload = prepareSyncData({
      fullName,
      age: Number(age || 0),
      parentName,
      parentPhone,
      classId: Number(classId),
      academicYear: sys?.academicYear || "",
      term: sys?.currentTerm || "",
      status: "active",
    });

    if (editingId) {
      await db.students.update(editingId, payload);
    } else {
      await db.students.add(payload);
    }

    resetForm();
    load();
  };

  // ================= EDIT =================
  const editStudent = (s: Student) => {
    setEditingId(s.id || null);
    setFullName(s.fullName);
    setAge(String(s.age));
    setParentName(s.parentName);
    setParentPhone(s.parentPhone);
    setClassId(String(s.classId));
    setShowForm(true);
  };

  // ================= DELETE (SAFE + BUSINESS LOGIC) =================
  const deleteStudent = async (id: number) => {
    const confirmDelete = confirm(
      "Delete this student?\n\nAll current records (scores, attendance, payments) will be removed.\nPrevious report cards will remain."
    );

    if (!confirmDelete) return;

    await db.transaction(
      "rw",
      db.students,
      db.scores,
      db.attendance,
      db.payments,
      async () => {
        await db.students.delete(id);
        await db.scores.where("studentId").equals(id).delete();
        await db.attendance.where("studentId").equals(id).delete();
        await db.payments.where("studentId").equals(id).delete();
      }
    );

    load();
  };

  // ================= FILTER =================
  const filtered = students.filter((s) => {
    const matchSearch = s.fullName
      .toLowerCase()
      .includes(search.toLowerCase());

    const matchClass = filterClass
      ? String(s.classId) === filterClass
      : true;

    return matchSearch && matchClass;
  });

  // ================= HELPERS =================
  const getClassName = (id?: number) =>
    classes.find((c) => c.id === id)?.name || "No Class";

  const getAttendance = (id?: number) => {
    const records = attendance.filter((a) => a.studentId === id);
    const present = records.filter((r) => r.status === "present").length;
    return records.length ? `${((present / records.length) * 100).toFixed(0)}%` : "0%";
  };

  // ================= STYLES =================
  const card: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.08)",
    background: "var(--surface)",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  };

  const button: React.CSSProperties = {
    padding: "7px 10px",
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid var(--primary-color)",
    background: "var(--surface)",
    color: "var(--text)",
  };

  const primaryButton: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 8,
    cursor: "pointer",
    border: "none",
    background: "var(--primary-color)",
    color: "#fff",
  };

  const input: React.CSSProperties = {
    padding: 10,
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.2)",
    background: "var(--surface)",
    color: "var(--text)",
  };

  // ================= UI =================
  return (
    <div style={{ padding: 20 }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Students</h2>

        <button style={primaryButton} onClick={() => setShowForm(!showForm)}>
          {showForm ? "Close" : "+ Add Student"}
        </button>
      </div>

      {/* FILTERS */}
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <input
          style={input}
          placeholder="Search student..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          style={input}
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
        >
          <option value="">All Classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* FORM */}
      {showForm && (
        <div
          style={{
            marginTop: 15,
            padding: 15,
            borderRadius: 10,
            background: "var(--surface)",
            border: "1px solid rgba(0,0,0,0.1)",
            maxWidth: 350,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <input
            style={input}
            placeholder="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />

          <input
            style={input}
            placeholder="Age"
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />

          <input
            style={input}
            placeholder="Parent Name"
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
          />

          <input
            style={input}
            placeholder="Parent Phone"
            value={parentPhone}
            onChange={(e) => setParentPhone(e.target.value)}
          />

          <select
            style={input}
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">Select Class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 10 }}>
            <button style={primaryButton} onClick={saveStudent}>
              {editingId ? "Update" : "Save"}
            </button>

            <button style={button} onClick={resetForm}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* LIST */}
      <div style={{ marginTop: 20 }}>
        {filtered.map((s) => (
          <div key={s.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <b>{s.fullName}</b>
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  {getClassName(s.classId)} • Age {s.age} • Attendance{" "}
                  {getAttendance(s.id)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button style={button} onClick={() => editStudent(s)}>
                  Edit
                </button>
                <button style={button} onClick={() => deleteStudent(s.id!)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}