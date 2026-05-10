"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

type Tab = "subject" | "class";

export default function Assignments() {
  const { settings } = useSettings();

  const primary = settings?.primaryColor || "var(--primary-color)";
  const activeOrgId = settings?.organizationId;

  // ================= UI =================
  const [tab, setTab] = useState<Tab>("subject");
  const [loading, setLoading] = useState(true);

  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [showClassForm, setShowClassForm] = useState(false);

  // ================= DATA =================
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [classTeachers, setClassTeachers] = useState<any[]>([]);

  // ================= FILTERS =================
  const [organizationFilter, setOrganizationFilter] = useState<any>(
    activeOrgId || ""
  );

  const [teacherSearch, setTeacherSearch] = useState("");

  // ================= EDIT =================
  const [editAssignmentId, setEditAssignmentId] = useState<number | null>(null);
  const [editClassTeacherId, setEditClassTeacherId] = useState<number | null>(
    null
  );

  // ================= FORM =================
  const [teacherId, setTeacherId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const [classTeacherId, setClassTeacherId] = useState("");
  const [classTeacherClassId, setClassTeacherClassId] = useState("");

  // ======================================================
  // LOAD
  // ======================================================
  const load = async () => {
    setLoading(true);

    try {
      const [orgs, t, c, s, a, ct] = await Promise.all([
        db.organizations?.toArray?.() || [],
        db.teachers.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.assignments.toArray(),
        db.classTeachers.toArray(),
      ]);

      setOrganizations(orgs || []);

      // ================= ORGANIZATION FILTERING =================
      const filteredTeachers = organizationFilter
        ? t.filter(
            (x: any) => String(x.organizationId) === String(organizationFilter)
          )
        : t;

      const filteredClasses = organizationFilter
        ? c.filter(
            (x: any) => String(x.organizationId) === String(organizationFilter)
          )
        : c;

      const filteredSubjects = organizationFilter
        ? s.filter(
            (x: any) =>
              !x.organizationId ||
              String(x.organizationId) === String(organizationFilter)
          )
        : s;

      const filteredAssignments = organizationFilter
        ? a.filter(
            (x: any) =>
              String(x.organizationId) === String(organizationFilter)
          )
        : a;

      const filteredClassTeachers = organizationFilter
        ? ct.filter(
            (x: any) =>
              String(x.organizationId) === String(organizationFilter)
          )
        : ct;

      setTeachers(filteredTeachers);
      setClasses(filteredClasses);
      setSubjects(filteredSubjects);
      setAssignments(filteredAssignments);
      setClassTeachers(filteredClassTeachers);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [organizationFilter]);

  // ======================================================
  // LOOKUPS
  // ======================================================
  const teacherMap = useMemo(
    () => new Map(teachers.map((t) => [t.id, t.fullName])),
    [teachers]
  );

  const classMap = useMemo(
    () => new Map(classes.map((c) => [c.id, c.name])),
    [classes]
  );

  const subjectMap = useMemo(
    () => new Map(subjects.map((s) => [s.id, s.name])),
    [subjects]
  );

  const orgMap = useMemo(
    () => new Map(organizations.map((o) => [o.id, o.name])),
    [organizations]
  );

  const get = (map: Map<any, any>, id?: number) =>
    id ? map.get(id) ?? "Unknown" : "Unknown";

  // ======================================================
  // FILTERED DISPLAY
  // ======================================================
  const filteredAssignments = useMemo(() => {
    return assignments.filter((a: any) => {
      const teacher = get(teacherMap, a.teacherId);

      return teacher
        .toLowerCase()
        .includes(teacherSearch.toLowerCase());
    });
  }, [assignments, teacherSearch, teacherMap]);

  const filteredClassTeachers = useMemo(() => {
    return classTeachers.filter((ct: any) => {
      const teacher = get(teacherMap, ct.teacherId);

      return teacher
        .toLowerCase()
        .includes(teacherSearch.toLowerCase());
    });
  }, [classTeachers, teacherSearch, teacherMap]);

  // ======================================================
  // RESET
  // ======================================================
  const resetSubject = () => {
    setTeacherId("");
    setClassId("");
    setSubjectId("");
    setEditAssignmentId(null);
    setShowSubjectForm(false);
  };

  const resetClassTeacher = () => {
    setClassTeacherId("");
    setClassTeacherClassId("");
    setEditClassTeacherId(null);
    setShowClassForm(false);
  };

  // ======================================================
  // SAVE SUBJECT ASSIGNMENT
  // ======================================================
  const saveSubjectAssignment = async () => {
    if (!teacherId || !classId || !subjectId) {
      alert("Select teacher, class and subject");
      return;
    }

    const payload = prepareSyncData({
      organizationId: organizationFilter || null,
      teacherId: Number(teacherId),
      classId: Number(classId),
      subjectId: Number(subjectId),
      role: "subject",
    });

    if (editAssignmentId) {
      await db.assignments.update(editAssignmentId, payload);
    } else {
      const exists = await db.assignments
        .where({
          teacherId: payload.teacherId,
          classId: payload.classId,
          subjectId: payload.subjectId,
        })
        .first();

      if (exists) {
        alert("Assignment already exists");
        return;
      }

      await db.assignments.add(payload);
    }

    resetSubject();
    load();
  };

  // ======================================================
  // SAVE CLASS TEACHER
  // ======================================================
  const saveClassTeacher = async () => {
    if (!classTeacherId || !classTeacherClassId) {
      alert("Select teacher and class");
      return;
    }

    const payload = prepareSyncData({
      organizationId: organizationFilter || null,
      teacherId: Number(classTeacherId),
      classId: Number(classTeacherClassId),
    });

    if (editClassTeacherId) {
      await db.classTeachers.update(editClassTeacherId, payload);
    } else {
      const exists = await db.classTeachers
        .where("classId")
        .equals(Number(classTeacherClassId))
        .first();

      if (exists) {
        alert("This class already has a class teacher");
        return;
      }

      await db.classTeachers.add(payload);
    }

    resetClassTeacher();
    load();
  };

  // ======================================================
  // EDIT
  // ======================================================
  const editAssignment = (a: any) => {
    setTeacherId(String(a.teacherId));
    setClassId(String(a.classId));
    setSubjectId(String(a.subjectId));

    setEditAssignmentId(a.id);
    setShowSubjectForm(true);
  };

  const editClassTeacher = (ct: any) => {
    setClassTeacherId(String(ct.teacherId));
    setClassTeacherClassId(String(ct.classId));

    setEditClassTeacherId(ct.id);
    setShowClassForm(true);
  };

  // ======================================================
  // DELETE
  // ======================================================
  const deleteAssignment = async (id: number) => {
    if (!confirm("Delete assignment?")) return;

    await db.assignments.delete(id);
    load();
  };

  const deleteClassTeacher = async (id: number) => {
    if (!confirm("Delete class teacher assignment?")) return;

    await db.classTeachers.delete(id);
    load();
  };

  // ======================================================
  // STYLES
  // ======================================================
  const page: React.CSSProperties = {
    padding: 20,
    color: "var(--text)",
  };

  const card: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.08)",
    background: "var(--surface)",
    padding: 14,
    borderRadius: 12,
  };

  const input: React.CSSProperties = {
    padding: 10,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.15)",
    background: "transparent",
    color: "var(--text)",
    width: "100%",
  };

  const primaryBtn: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    background: primary,
    color: "#fff",
    fontWeight: 600,
  };

  const outlineBtn: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 10,
    border: `1px solid ${primary}`,
    background: "transparent",
    color: "var(--text)",
    cursor: "pointer",
  };

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.1)",
    background: active ? primary : "transparent",
    color: active ? "#fff" : "var(--text)",
    fontWeight: 600,
    cursor: "pointer",
  });

  // ======================================================
  // LOADING
  // ======================================================
  if (loading) {
    return <div style={page}>Loading assignments...</div>;
  }

  // ======================================================
  // UI
  // ======================================================
  return (
    <div style={page}>

      {/* HEADER */}
      <div style={{ marginBottom: 15 }}>
        <h2 style={{ margin: 0 }}>Assignments</h2>

        <p style={{ marginTop: 4, opacity: 0.65, fontSize: 13 }}>
          Manage teacher subject allocations and class leadership
        </p>
      </div>

      {/* FILTER BAR */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 15,
        }}
      >
        <select
          style={input}
          value={organizationFilter}
          onChange={(e) => setOrganizationFilter(e.target.value)}
        >
          <option value="">All Organizations</option>

          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>

        <input
          style={input}
          placeholder="Search teacher..."
          value={teacherSearch}
          onChange={(e) => setTeacherSearch(e.target.value)}
        />
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        <button
          style={tabBtn(tab === "subject")}
          onClick={() => setTab("subject")}
        >
          Subject Teaching
        </button>

        <button
          style={tabBtn(tab === "class")}
          onClick={() => setTab("class")}
        >
          Class Leadership
        </button>
      </div>

      {/* ====================================================== */}
      {/* SUBJECT ASSIGNMENTS */}
      {/* ====================================================== */}
      {tab === "subject" && (
        <div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <h3 style={{ margin: 0 }}>Subject Assignments</h3>

            <button
              style={primaryBtn}
              onClick={() => setShowSubjectForm((p) => !p)}
            >
              {showSubjectForm ? "Close" : "+ Add Assignment"}
            </button>
          </div>

          {/* FORM */}
          {showSubjectForm && (
            <div
              style={{
                ...card,
                maxWidth: 450,
                marginBottom: 15,
              }}
            >
              <select
                style={input}
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
              >
                <option value="">Select Teacher</option>

                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>

              <div style={{ height: 10 }} />

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

              <div style={{ height: 10 }} />

              <select
                style={input}
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
              >
                <option value="">Select Subject</option>

                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <div style={{ height: 14 }} />

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  style={primaryBtn}
                  onClick={saveSubjectAssignment}
                >
                  {editAssignmentId ? "Update" : "Save"}
                </button>

                <button
                  style={outlineBtn}
                  onClick={resetSubject}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* LIST */}
          <div style={{ display: "grid", gap: 10 }}>
            {filteredAssignments.map((a: any) => (
              <div key={a.id} style={card}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <b>{get(teacherMap, a.teacherId)}</b>

                    <div style={{ fontSize: 13, opacity: 0.7 }}>
                      {get(classMap, a.classId)} →{" "}
                      {get(subjectMap, a.subjectId)}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.55 }}>
                      Organization:{" "}
                      {get(orgMap, a.organizationId)}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      style={outlineBtn}
                      onClick={() => editAssignment(a)}
                    >
                      Edit
                    </button>

                    <button
                      style={outlineBtn}
                      onClick={() => deleteAssignment(a.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ====================================================== */}
      {/* CLASS TEACHERS */}
      {/* ====================================================== */}
      {tab === "class" && (
        <div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <h3 style={{ margin: 0 }}>Class Leadership</h3>

            <button
              style={primaryBtn}
              onClick={() => setShowClassForm((p) => !p)}
            >
              {showClassForm ? "Close" : "+ Add Assignment"}
            </button>
          </div>

          {/* FORM */}
          {showClassForm && (
            <div
              style={{
                ...card,
                maxWidth: 450,
                marginBottom: 15,
              }}
            >
              <select
                style={input}
                value={classTeacherId}
                onChange={(e) => setClassTeacherId(e.target.value)}
              >
                <option value="">Select Teacher</option>

                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>

              <div style={{ height: 10 }} />

              <select
                style={input}
                value={classTeacherClassId}
                onChange={(e) =>
                  setClassTeacherClassId(e.target.value)
                }
              >
                <option value="">Select Class</option>

                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <div style={{ height: 14 }} />

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  style={primaryBtn}
                  onClick={saveClassTeacher}
                >
                  {editClassTeacherId ? "Update" : "Save"}
                </button>

                <button
                  style={outlineBtn}
                  onClick={resetClassTeacher}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* LIST */}
          <div style={{ display: "grid", gap: 10 }}>
            {filteredClassTeachers.map((ct: any) => (
              <div key={ct.id} style={card}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <b>{get(teacherMap, ct.teacherId)}</b>

                    <div style={{ fontSize: 13, opacity: 0.7 }}>
                      Class: {get(classMap, ct.classId)}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.55 }}>
                      Organization:{" "}
                      {get(orgMap, ct.organizationId)}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      style={outlineBtn}
                      onClick={() => editClassTeacher(ct)}
                    >
                      Edit
                    </button>

                    <button
                      style={outlineBtn}
                      onClick={() => deleteClassTeacher(ct.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}