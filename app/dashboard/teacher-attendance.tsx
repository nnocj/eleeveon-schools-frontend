"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../lib/db";
import type { TeacherAttendance } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

export default function TeacherAttendance() {
  const { settings } = useSettings();

  const branchId = settings?.branchId ?? 1;
  const organizationId = settings?.organizationId;

  // ================= DATA =================
  const [attendance, setAttendance] = useState<TeacherAttendance[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  // ================= UI =================
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // ================= FILTERS =================
  const [search, setSearch] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterOrganization, setFilterOrganization] = useState("");

  // ================= FORM =================
  const [teacherId, setTeacherId] = useState("");
  const [date, setDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");

  // =====================================================
  // LOAD
  // =====================================================
  const load = async () => {
    setLoading(true);

    try {
      const [a, t, orgs] = await Promise.all([
        db.teacherAttendance
          .where("branchId")
          .equals(branchId)
          .toArray(),

        db.teachers
          .where("branchId")
          .equals(branchId)
          .toArray(),

        db.organizations?.toArray?.() || [],
      ]);

      let filteredTeachers = t;

      if (organizationId) {
        filteredTeachers = t.filter(
          (x: any) => x.organizationId === organizationId
        );
      }

      const teacherIds = filteredTeachers.map((x: any) => x.id);

      let filteredAttendance = a.filter((x) =>
        teacherIds.includes(x.teacherId)
      );

      if (filterOrganization) {
        filteredAttendance = filteredAttendance.filter((x) => {
          const teacher = filteredTeachers.find(
            (t: any) => t.id === x.teacherId
          );

          return (
            String(teacher?.organizationId || "") ===
            filterOrganization
          );
        });
      }

      setAttendance(filteredAttendance);
      setTeachers(filteredTeachers);
      setOrganizations(orgs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filterOrganization]);

  // =====================================================
  // LOOKUPS
  // =====================================================
  const teacherMap = useMemo(
    () => new Map(teachers.map((t) => [t.id, t.fullName])),
    [teachers]
  );

  const teacherOrgMap = useMemo(
    () =>
      new Map(
        teachers.map((t) => [
          t.id,
          organizations.find((o: any) => o.id === t.organizationId)?.name ||
            "No Organization",
        ])
      ),
    [teachers, organizations]
  );

  const getTeacher = (id?: number) =>
    id ? teacherMap.get(id) || "Unknown Teacher" : "Unknown Teacher";

  const getOrganization = (id?: number) =>
    id ? teacherOrgMap.get(id) || "No Organization" : "No Organization";

  // =====================================================
  // RESET
  // =====================================================
  const reset = () => {
    setTeacherId("");
    setDate(new Date().toISOString().split("T")[0]);
    setClockIn("");
    setClockOut("");

    setEditingId(null);
    setShowForm(false);
  };

  // =====================================================
  // SAVE
  // =====================================================
  const save = async () => {
    if (!teacherId || !date) {
      alert("Teacher and date are required");
      return;
    }

    const payload = prepareSyncData({
      branchId,

      teacherId: Number(teacherId),

      date,
      clockIn: clockIn || undefined,
      clockOut: clockOut || undefined,
    });

    if (editingId) {
      await db.teacherAttendance.update(editingId, payload);
    } else {
      const exists = await db.teacherAttendance
        .where({
          teacherId: Number(teacherId),
          date,
        })
        .first();

      if (exists) {
        alert("Attendance already recorded for this teacher on this date");
        return;
      }

      await db.teacherAttendance.add(payload);
    }

    reset();
    load();
  };

  // =====================================================
  // EDIT
  // =====================================================
  const edit = (a: TeacherAttendance) => {
    setEditingId(a.id || null);

    setTeacherId(String(a.teacherId));
    setDate(a.date || "");

    setClockIn(a.clockIn || "");
    setClockOut(a.clockOut || "");

    setShowForm(true);
  };

  // =====================================================
  // DELETE
  // =====================================================
  const remove = async (id: number) => {
    if (!confirm("Delete attendance record?")) return;

    await db.teacherAttendance.delete(id);

    load();
  };

  // =====================================================
  // FILTERING
  // =====================================================
  const filtered = useMemo(() => {
    return attendance.filter((a) => {
      const teacher = teachers.find((t) => t.id === a.teacherId);

      const matchSearch =
        teacher?.fullName
          ?.toLowerCase()
          .includes(search.toLowerCase()) || false;

      const matchTeacher = filterTeacher
        ? String(a.teacherId) === filterTeacher
        : true;

      const matchDate = filterDate
        ? a.date === filterDate
        : true;

      return matchSearch && matchTeacher && matchDate;
    });
  }, [
    attendance,
    teachers,
    search,
    filterTeacher,
    filterDate,
  ]);

  // =====================================================
  // STYLES
  // =====================================================
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

  const primaryBtn: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    background: "var(--primary-color)",
    color: "#fff",
    fontWeight: 600,
  };

  const outlineBtn: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid var(--primary-color)",
    background: "transparent",
    cursor: "pointer",
    color: "var(--text)",
  };

  const input: React.CSSProperties = {
    padding: 10,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.2)",
    width: "100%",
    background: "transparent",
    color: "var(--text)",
  };

  if (loading) {
    return <div style={page}>Loading teacher attendance...</div>;
  }

  // =====================================================
  // UI
  // =====================================================
  return (
    <div style={page}>

      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Teacher Attendance</h2>

          <p style={{ margin: "4px 0 0", opacity: 0.6, fontSize: 13 }}>
            Teacher clock-in and clock-out management
          </p>
        </div>

        <button
          style={primaryBtn}
          onClick={() => setShowForm((p) => !p)}
        >
          {showForm ? "Close" : "+ Record Attendance"}
        </button>
      </div>

      {/* FILTERS */}
      <div
        style={{
          marginTop: 15,
          display: "grid",
          gridTemplateColumns:
            "2fr 1fr 1fr 1fr",
          gap: 10,
        }}
      >
        <input
          style={input}
          placeholder="Search teacher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          style={input}
          value={filterTeacher}
          onChange={(e) =>
            setFilterTeacher(e.target.value)
          }
        >
          <option value="">All Teachers</option>

          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.fullName}
            </option>
          ))}
        </select>

        <input
          type="date"
          style={input}
          value={filterDate}
          onChange={(e) =>
            setFilterDate(e.target.value)
          }
        />

        <select
          style={input}
          value={filterOrganization}
          onChange={(e) =>
            setFilterOrganization(e.target.value)
          }
        >
          <option value="">All Organizations</option>

          {organizations.map((o: any) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      {/* FORM */}
      {showForm && (
        <div
          style={{
            ...card,
            marginTop: 15,
            maxWidth: 500,
            display: "grid",
            gap: 10,
          }}
        >
          <select
            style={input}
            value={teacherId}
            onChange={(e) =>
              setTeacherId(e.target.value)
            }
          >
            <option value="">Select Teacher</option>

            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </select>

          <input
            type="date"
            style={input}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          <input
            type="time"
            style={input}
            value={clockIn}
            onChange={(e) =>
              setClockIn(e.target.value)
            }
          />

          <input
            type="time"
            style={input}
            value={clockOut}
            onChange={(e) =>
              setClockOut(e.target.value)
            }
          />

          <div style={{ display: "flex", gap: 10 }}>
            <button
              style={primaryBtn}
              onClick={save}
            >
              {editingId ? "Update" : "Save"}
            </button>

            <button
              style={outlineBtn}
              onClick={reset}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* LIST */}
      <div
        style={{
          marginTop: 20,
          display: "grid",
          gap: 10,
        }}
      >
        {filtered.length === 0 && (
          <div style={card}>
            <p style={{ margin: 0, opacity: 0.6 }}>
              No attendance records found
            </p>
          </div>
        )}

        {filtered.map((a) => (
          <div key={a.id} style={card}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 15,
                flexWrap: "wrap",
              }}
            >
              <div>
                <b>{getTeacher(a.teacherId)}</b>

                <div
                  style={{
                    fontSize: 13,
                    opacity: 0.7,
                    marginTop: 4,
                  }}
                >
                  🏢 {getOrganization(a.teacherId)}
                </div>

                <div
                  style={{
                    fontSize: 13,
                    opacity: 0.7,
                    marginTop: 4,
                  }}
                >
                  📅 {a.date}
                </div>

                <div
                  style={{
                    fontSize: 13,
                    opacity: 0.7,
                    marginTop: 4,
                  }}
                >
                  ⏰ In: {a.clockIn || "--"} | Out:{" "}
                  {a.clockOut || "--"}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                <button
                  style={outlineBtn}
                  onClick={() => edit(a)}
                >
                  Edit
                </button>

                <button
                  style={outlineBtn}
                  onClick={() => remove(a.id!)}
                >
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