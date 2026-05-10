"use client";

import { useEffect, useMemo, useState } from "react";
import { db, Teacher } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

export default function Teachers() {
  const { settings } = useSettings();

  const primary = settings?.primaryColor || "var(--primary-color)";
  const currentOrganizationId = settings?.organizationId;
  const currentBranchId = settings?.branchId ?? 1;

  // ================= DATA =================
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  // ================= UI =================
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // ================= FILTERS =================
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState<number | "">("");
  const [organizationFilter, setOrganizationFilter] = useState<number | "">(
    currentOrganizationId || ""
  );

  // ================= FORM =================
  const emptyForm: Partial<Teacher> = {
    fullName: "",
    age: undefined,
    email: "",
    phone: "",
    relativePhone: "",
    employmentDate: "",
    salary: undefined,
    role: "teacher",
    signature: "",

    // organization aware
    organizationId: currentOrganizationId,
    branchId: currentBranchId,
  };

  const [form, setForm] = useState<Partial<Teacher>>(emptyForm);

  // ================= LOAD =================
  const load = async () => {
    try {
      setLoading(true);

      const [t, orgs, brs] = await Promise.all([
        db.teachers.toArray(),
        db.organizations?.toArray?.() || [],
        db.branches?.toArray?.() || [],
      ]);

      setTeachers(
        t.filter((x: any) => {
          if (currentOrganizationId) {
            return x.organizationId === currentOrganizationId;
          }

          return true;
        })
      );

      setOrganizations(orgs);
      setBranches(brs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // ================= LOOKUPS =================
  const organizationMap = useMemo(
    () => new Map(organizations.map((o) => [o.id, o.name])),
    [organizations]
  );

  const branchMap = useMemo(
    () => new Map(branches.map((b) => [b.id, b.name])),
    [branches]
  );

  // ================= RESET =================
  const reset = () => {
    setForm({
      ...emptyForm,
      organizationId: currentOrganizationId,
      branchId: currentBranchId,
    });

    setEditingId(null);
    setShowForm(false);
  };

  // ================= SAVE =================
  const save = async () => {
    if (!form.fullName?.trim()) {
      alert("Teacher full name is required");
      return;
    }

    if (!form.email?.trim()) {
      alert("Teacher email is required");
      return;
    }

    // ================= HEAD TEACHER VALIDATION =================
    if (form.role === "head_teacher") {
      const existing = await db.teachers
        .where({
          role: "head_teacher",
          branchId: Number(form.branchId),
        })
        .first();

      if (existing && existing.id !== editingId) {
        alert("A Head Teacher already exists in this branch");
        return;
      }
    }

    const payload = prepareSyncData({
      ...form,

      age: Number(form.age || 0),
      salary: Number(form.salary || 0),

      organizationId:
        Number(form.organizationId) || currentOrganizationId,

      branchId:
        Number(form.branchId) || currentBranchId,
    });

    if (editingId) {
      await db.teachers.update(editingId, payload);
    } else {
      await db.teachers.add(payload);
    }

    reset();
    load();
  };

  // ================= EDIT =================
  const edit = (teacher: Teacher) => {
    setEditingId(teacher.id || null);

    setForm({
      ...teacher,
    });

    setShowForm(true);
  };

  // ================= DELETE =================
  const remove = async (id: number) => {
    const ok = confirm(
      "Delete teacher?\n\nAssignments and class leadership records linked to this teacher will also be removed."
    );

    if (!ok) return;

    await db.transaction(
      "rw",
      db.teachers,
      db.assignments,
      db.classTeachers,
      async () => {
        await db.teachers.delete(id);

        await db.assignments.where("teacherId").equals(id).delete();

        await db.classTeachers
          .where("teacherId")
          .equals(id)
          .delete();
      }
    );

    load();
  };

  // ================= FILTERED =================
  const filtered = useMemo(() => {
    return teachers.filter((t: any) => {
      const q = search.toLowerCase();

      const matchSearch =
        t.fullName?.toLowerCase().includes(q) ||
        t.email?.toLowerCase().includes(q) ||
        t.phone?.toLowerCase().includes(q);

      const matchRole = roleFilter
        ? t.role === roleFilter
        : true;

      const matchBranch = branchFilter
        ? t.branchId === Number(branchFilter)
        : true;

      const matchOrganization = organizationFilter
        ? t.organizationId === Number(organizationFilter)
        : true;

      return (
        matchSearch &&
        matchRole &&
        matchBranch &&
        matchOrganization
      );
    });
  }, [
    teachers,
    search,
    roleFilter,
    branchFilter,
    organizationFilter,
  ]);

  // ================= STYLES =================
  const page: React.CSSProperties = {
    padding: 20,
    color: "var(--text)",
  };

  const card: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.08)",
    background: "var(--surface)",
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
  };

  const input: React.CSSProperties = {
    padding: 10,
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.2)",
    background: "var(--surface)",
    color: "var(--text)",
    width: "100%",
  };

  const button: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 8,
    cursor: "pointer",
    border: `1px solid ${primary}`,
    background: "transparent",
    color: "var(--text)",
  };

  const primaryButton: React.CSSProperties = {
    padding: "9px 14px",
    borderRadius: 8,
    cursor: "pointer",
    border: "none",
    background: primary,
    color: "#fff",
    fontWeight: 600,
  };

  if (loading) {
    return <div style={page}>Loading teachers...</div>;
  }

  // ================= UI =================
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
          <h2 style={{ margin: 0 }}>Teachers</h2>

          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Organizational teacher management
          </div>
        </div>

        <button
          style={primaryButton}
          onClick={() => setShowForm((p) => !p)}
        >
          {showForm ? "Close" : "+ Add Teacher"}
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
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All Roles</option>
          <option value="teacher">Teacher</option>
          <option value="head_teacher">
            Head Teacher
          </option>
          <option value="lecturer">Lecturer</option>
          <option value="principal">Principal</option>
        </select>

        <select
          style={input}
          value={organizationFilter}
          onChange={(e) =>
            setOrganizationFilter(
              Number(e.target.value) || ""
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
          value={branchFilter}
          onChange={(e) =>
            setBranchFilter(
              Number(e.target.value) || ""
            )
          }
        >
          <option value="">All Branches</option>

          {branches
            .filter((b) =>
              organizationFilter
                ? b.organizationId ===
                  Number(organizationFilter)
                : true
            )
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </select>
      </div>

      {/* FORM */}
      {showForm && (
        <div
          style={{
            ...card,
            marginTop: 18,
            maxWidth: 700,
          }}
        >
          <h3 style={{ marginTop: 0 }}>
            {editingId
              ? "Edit Teacher"
              : "Create Teacher"}
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(220px,1fr))",
              gap: 10,
            }}
          >
            <input
              style={input}
              placeholder="Full Name"
              value={form.fullName || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  fullName: e.target.value,
                })
              }
            />

            <input
              style={input}
              placeholder="Age"
              type="number"
              value={form.age || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  age: Number(e.target.value),
                })
              }
            />

            <input
              style={input}
              placeholder="Email"
              value={form.email || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  email: e.target.value,
                })
              }
            />

            <input
              style={input}
              placeholder="Phone"
              value={form.phone || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  phone: e.target.value,
                })
              }
            />

            <input
              style={input}
              placeholder="Relative Phone"
              value={form.relativePhone || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  relativePhone: e.target.value,
                })
              }
            />

            <input
              style={input}
              type="date"
              value={form.employmentDate || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  employmentDate:
                    e.target.value,
                })
              }
            />

            <input
              style={input}
              placeholder="Salary"
              type="number"
              value={form.salary || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  salary: Number(e.target.value),
                })
              }
            />

            <select
              style={input}
              value={form.role || "teacher"}
              onChange={(e) =>
                setForm({
                  ...form,
                  role: e.target
                    .value as Teacher["role"],
                })
              }
            >
              <option value="teacher">
                Teacher
              </option>

              <option value="head_teacher">
                Head Teacher
              </option>

              <option value="lecturer">
                Lecturer
              </option>

              <option value="principal">
                Principal
              </option>
            </select>

            {/* ORGANIZATION */}
            <select
              style={input}
              value={form.organizationId || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  organizationId:
                    Number(e.target.value),
                })
              }
            >
              <option value="">
                Select Organization
              </option>

              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>

            {/* BRANCH */}
            <select
              style={input}
              value={form.branchId || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  branchId: Number(
                    e.target.value
                  ),
                })
              }
            >
              <option value="">
                Select Branch
              </option>

              {branches
                .filter((b) =>
                  form.organizationId
                    ? b.organizationId ===
                      form.organizationId
                    : true
                )
                .map((b) => (
                  <option
                    key={b.id}
                    value={b.id}
                  >
                    {b.name}
                  </option>
                ))}
            </select>
          </div>

          {/* SIGNATURE */}
          <div style={{ marginTop: 12 }}>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file =
                  e.target.files?.[0];

                if (!file) return;

                const reader =
                  new FileReader();

                reader.onloadend = () =>
                  setForm({
                    ...form,
                    signature:
                      reader.result as string,
                  });

                reader.readAsDataURL(file);
              }}
            />
          </div>

          {form.signature && (
            <div style={{ marginTop: 10 }}>
              <img
                src={form.signature}
                alt="signature"
                style={{
                  height: 70,
                  objectFit: "contain",
                  border:
                    "1px solid rgba(0,0,0,0.1)",
                  padding: 6,
                  borderRadius: 8,
                }}
              />
            </div>
          )}

          {/* ACTIONS */}
          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 15,
            }}
          >
            <button
              style={primaryButton}
              onClick={save}
            >
              {editingId ? "Update" : "Save"}
            </button>

            <button
              style={button}
              onClick={reset}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* LIST */}
      <div style={{ marginTop: 20 }}>
        {filtered.length === 0 && (
          <div style={{ opacity: 0.6 }}>
            No teachers found
          </div>
        )}

        {filtered.map((t: any) => (
          <div key={t.id} style={card}>
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <b>{t.fullName}</b>

                  <span
                    style={{
                      fontSize: 11,
                      padding:
                        "3px 8px",
                      borderRadius: 999,
                      background:
                        "rgba(0,0,0,0.06)",
                    }}
                  >
                    {t.role}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: 13,
                    opacity: 0.7,
                    marginTop: 4,
                  }}
                >
                  {t.email || "No Email"} •{" "}
                  {t.phone || "No Phone"}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.6,
                    marginTop: 4,
                  }}
                >
                  Organization:{" "}
                  {organizationMap.get(
                    t.organizationId
                  ) || "-"}
                  <br />
                  Branch:{" "}
                  {branchMap.get(
                    t.branchId
                  ) || "-"}
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
                  style={button}
                  onClick={() => edit(t)}
                >
                  Edit
                </button>

                <button
                  style={button}
                  onClick={() =>
                    remove(t.id!)
                  }
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