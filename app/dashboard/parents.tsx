"use client";

import { useEffect, useMemo, useState } from "react";
import { db, Parent } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

export default function Parents() {
  const { settings } = useSettings();

  const branchId = settings?.branchId ?? 1;
  const activeOrganizationId = settings?.organizationId;

  // ================= DATA =================
  const [parents, setParents] = useState<Parent[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  // ================= UI =================
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // ================= FILTERS =================
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<number | "">("");
  const [organizationFilter, setOrganizationFilter] = useState<
    number | ""
  >(activeOrganizationId || "");

  // ================= FORM =================
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const [studentIds, setStudentIds] = useState<number[]>([]);
  const [organizationId, setOrganizationId] = useState<number | "">(
    activeOrganizationId || ""
  );

  // ======================================================
  // LOAD
  // ======================================================
  const load = async () => {
    setLoading(true);

    try {
      const [p, s, c, o] = await Promise.all([
        db.parents.toArray(),
        db.students.toArray(),
        db.classes.toArray(),
        db.organizations?.toArray?.() || [],
      ]);

      setParents(
        p.filter((x: any) => {
          if (x.isDeleted) return false;

          if (activeOrganizationId) {
            return x.organizationId === activeOrganizationId;
          }

          return true;
        })
      );

      setStudents(
        s.filter((x: any) => {
          if (x.isDeleted) return false;

          if (activeOrganizationId) {
            return x.organizationId === activeOrganizationId;
          }

          return true;
        })
      );

      setClasses(
        c.filter((x: any) => {
          if (activeOrganizationId) {
            return x.organizationId === activeOrganizationId;
          }

          return true;
        })
      );

      setOrganizations(o || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // ======================================================
  // LOOKUPS
  // ======================================================
  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students]
  );

  const classMap = useMemo(
    () => new Map(classes.map((c) => [c.id, c.name])),
    [classes]
  );

  const organizationMap = useMemo(
    () => new Map(organizations.map((o) => [o.id, o.name])),
    [organizations]
  );

  // ======================================================
  // RESET
  // ======================================================
  const reset = () => {
    setFullName("");
    setPhone("");
    setEmail("");
    setAddress("");

    setStudentIds([]);

    setOrganizationId(activeOrganizationId || "");

    setEditingId(null);
    setShowForm(false);
  };

  // ======================================================
  // SAVE
  // ======================================================
  const save = async () => {
    if (!fullName.trim()) {
      alert("Parent full name required");
      return;
    }

    if (!phone.trim()) {
      alert("Phone number required");
      return;
    }

    const payload = prepareSyncData({
      branchId,
      organizationId:
        organizationId === "" ? undefined : Number(organizationId),

      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),

      studentIds,

      active: true,
    });

    if (editingId) {
      await db.parents.update(editingId, payload);
    } else {
      await db.parents.add(payload);
    }

    reset();
    load();
  };

  // ======================================================
  // EDIT
  // ======================================================
  const edit = (p: any) => {
    setEditingId(p.id);

    setFullName(p.fullName || "");
    setPhone(p.phone || "");
    setEmail(p.email || "");
    setAddress(p.address || "");

    setStudentIds(p.studentIds || []);

    setOrganizationId(p.organizationId || "");

    setShowForm(true);
  };

  // ======================================================
  // DELETE
  // ======================================================
  const remove = async (id: number) => {
    if (!confirm("Delete parent?")) return;

    await db.parents.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    load();
  };

  // ======================================================
  // HELPERS
  // ======================================================
  const getStudentNames = (ids?: number[]) => {
    if (!ids?.length) return "No linked students";

    return ids
      .map((id) => studentMap.get(id)?.fullName)
      .filter(Boolean)
      .join(", ");
  };

  const getStudentClasses = (ids?: number[]) => {
    if (!ids?.length) return "No Classes";

    const names = ids
      .map((id) => {
        const student = studentMap.get(id);

        if (!student?.currentClassId) return null;

        return classMap.get(student.currentClassId);
      })
      .filter(Boolean);

    return [...new Set(names)].join(", ");
  };

  // ======================================================
  // FILTERED
  // ======================================================
  const filtered = useMemo(() => {
    return parents.filter((p: any) => {
      const q = search.toLowerCase();

      const matchSearch =
        p.fullName?.toLowerCase().includes(q) ||
        p.phone?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q);

      const matchOrganization =
        organizationFilter === ""
          ? true
          : p.organizationId === organizationFilter;

      const matchClass =
        classFilter === ""
          ? true
          : (p.studentIds || []).some((studentId: number) => {
              const student = studentMap.get(studentId);

              return student?.currentClassId === classFilter;
            });

      return matchSearch && matchOrganization && matchClass;
    });
  }, [
    parents,
    search,
    organizationFilter,
    classFilter,
    studentMap,
  ]);

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
    fontWeight: 600,
  };

  const input: React.CSSProperties = {
    padding: 10,
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.2)",
    background: "var(--surface)",
    color: "var(--text)",
  };

  if (loading) {
    return <div style={page}>Loading parents...</div>;
  }

  // ======================================================
  // UI
  // ======================================================
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
          <h2 style={{ margin: 0 }}>Parents</h2>

          <p style={{ margin: 0, opacity: 0.6, fontSize: 13 }}>
            Parent & guardian relationship management
          </p>
        </div>

        <button
          style={primaryButton}
          onClick={() => setShowForm((p) => !p)}
        >
          {showForm ? "Close" : "+ Add Parent"}
        </button>
      </div>

      {/* FILTERS */}
      <div
        style={{
          marginTop: 15,
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr",
          gap: 10,
        }}
      >
        <input
          style={input}
          placeholder="Search parent, phone or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          style={input}
          value={organizationFilter}
          onChange={(e) =>
            setOrganizationFilter(
              e.target.value ? Number(e.target.value) : ""
            )
          }
        >
          <option value="">All Organizations</option>

          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>

        <select
          style={input}
          value={classFilter}
          onChange={(e) =>
            setClassFilter(
              e.target.value ? Number(e.target.value) : ""
            )
          }
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
            maxWidth: 500,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <h3 style={{ margin: 0 }}>
            {editingId ? "Edit Parent" : "Create Parent"}
          </h3>

          {/* ORGANIZATION */}
          <select
            style={input}
            value={organizationId}
            onChange={(e) =>
              setOrganizationId(
                e.target.value ? Number(e.target.value) : ""
              )
            }
          >
            <option value="">Select Organization</option>

            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>

          <input
            style={input}
            placeholder="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />

          <input
            style={input}
            placeholder="Phone Number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <input
            style={input}
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            style={input}
            placeholder="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          {/* STUDENTS */}
          <div>
            <small style={{ opacity: 0.7 }}>
              Linked Students
            </small>

            <select
              multiple
              style={{
                ...input,
                width: "100%",
                height: 150,
                marginTop: 5,
              }}
              value={studentIds.map(String)}
              onChange={(e) => {
                const values = Array.from(
                  e.target.selectedOptions
                ).map((o) => Number(o.value));

                setStudentIds(values);
              }}
            >
              {students
                .filter((s) => {
                  if (!organizationId) return true;

                  return s.organizationId === organizationId;
                })
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                    {" • "}
                    {classMap.get(s.currentClassId) || "No Class"}
                  </option>
                ))}
            </select>
          </div>

          {/* ACTIONS */}
          <div style={{ display: "flex", gap: 10 }}>
            <button style={primaryButton} onClick={save}>
              {editingId ? "Update" : "Save"}
            </button>

            <button style={button} onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* LIST */}
      <div style={{ marginTop: 20 }}>
        {filtered.length === 0 && (
          <p style={{ opacity: 0.6 }}>
            No parents found
          </p>
        )}

        {filtered.map((p: any) => (
          <div key={p.id} style={card}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div>
                <b>{p.fullName}</b>

                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.7,
                    marginTop: 4,
                  }}
                >
                  📞 {p.phone}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.7,
                  }}
                >
                  ✉️ {p.email || "No Email"}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.7,
                  }}
                >
                  🏫{" "}
                  {organizationMap.get(p.organizationId) ||
                    "No Organization"}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.7,
                  }}
                >
                  🎓 {getStudentClasses(p.studentIds)}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.7,
                    marginTop: 4,
                  }}
                >
                  Students: {getStudentNames(p.studentIds)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={button}
                  onClick={() => edit(p)}
                >
                  Edit
                </button>

                <button
                  style={button}
                  onClick={() => remove(p.id)}
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