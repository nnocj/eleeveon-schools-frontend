"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

export default function Subjects() {
  const { settings } = useSettings();

  // ======================================================
  // ORGANIZATION CONTEXT
  // ======================================================
  const organizationId = settings?.organizationId;
  const branchId = settings?.branchId || 1;

  // ======================================================
  // DATA
  // ======================================================
  const [subjects, setSubjects] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  // ======================================================
  // UI STATE
  // ======================================================
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // ======================================================
  // FORM
  // ======================================================
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [allowedClasses, setAllowedClasses] = useState<number[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<
    number | ""
  >(organizationId || "");

  // ======================================================
  // FILTERS
  // ======================================================
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<number | "">("");
  const [structureFilter, setStructureFilter] = useState<number | "">("");
  const [organizationFilter, setOrganizationFilter] = useState<number | "">(
    organizationId || ""
  );

  // ======================================================
  // LOAD
  // ======================================================
  const load = async () => {
    try {
      setLoading(true);

      const [s, c, st, orgs] = await Promise.all([
        db.subjects.toArray(),
        db.classes.toArray(),
        db.academicStructures.toArray(),
        db.organizations?.toArray?.() || [],
      ]);

      setSubjects(s.filter((x: any) => !x.isDeleted));
      setClasses(c);
      setStructures(st);
      setOrganizations(orgs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // ======================================================
  // FAST LOOKUPS
  // ======================================================
  const classMap = useMemo(
    () => new Map(classes.map((c) => [c.id, c.name])),
    [classes]
  );

  const orgMap = useMemo(
    () => new Map(organizations.map((o) => [o.id, o.name])),
    [organizations]
  );

  // ======================================================
  // RESET
  // ======================================================
  const reset = () => {
    setName("");
    setCode("");
    setAllowedClasses([]);
    setEditingId(null);

    setSelectedOrganizationId(organizationId || "");

    setShowForm(false);
  };

  // ======================================================
  // SAVE
  // ======================================================
  const save = async () => {
    if (!name.trim()) {
      alert("Subject name required");
      return;
    }

    const payload = prepareSyncData({
      branchId,
      organizationId:
        Number(selectedOrganizationId) || organizationId || undefined,

      name: name.trim(),
      code: code.trim(),

      classIds: allowedClasses,

      active: true,
    });

    if (editingId) {
      await db.subjects.update(editingId, payload);
    } else {
      await db.subjects.add(payload);
    }

    reset();
    load();
  };

  // ======================================================
  // EDIT
  // ======================================================
  const edit = (s: any) => {
    setEditingId(s.id);

    setName(s.name || "");
    setCode(s.code || "");
    setAllowedClasses(s.classIds || []);

    setSelectedOrganizationId(s.organizationId || "");

    setShowForm(true);
  };

  // ======================================================
  // DELETE (SAFE)
  // ======================================================
  const remove = async (id: number) => {
    const scoreCount = await db.scores
      .where("subjectId")
      .equals(id)
      .count();

    const assignCount = await db.assignments
      .where("subjectId")
      .equals(id)
      .count();

    if (scoreCount || assignCount) {
      alert("Cannot delete subject with academic records");
      return;
    }

    if (!confirm("Delete subject?")) return;

    await db.subjects.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    load();
  };

  // ======================================================
  // FILTERING
  // ======================================================
  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    return subjects.filter((s) => {
      const matchText =
        s.name?.toLowerCase().includes(q) ||
        s.code?.toLowerCase().includes(q);

      const matchClass =
        classFilter === "" ||
        (s.classIds || []).includes(classFilter as number);

      const matchOrganization =
        organizationFilter === "" ||
        s.organizationId === Number(organizationFilter);

      return matchText && matchClass && matchOrganization;
    });
  }, [subjects, search, classFilter, organizationFilter]);

  // ======================================================
  // STYLES (UNCHANGED CLEAN STYLE)
  // ======================================================
  const container: React.CSSProperties = {
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

  const button: React.CSSProperties = {
    padding: "7px 10px",
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid var(--primary-color)",
    background: "var(--surface)",
    color: "var(--text)",
  };

  const primary: React.CSSProperties = {
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
    width: "100%",
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.2)",
    background: "var(--surface)",
    color: "var(--text)",
  };

  const chip: React.CSSProperties = {
    padding: "5px 8px",
    borderRadius: 999,
    fontSize: 12,
    border: "1px solid rgba(0,0,0,0.2)",
    cursor: "pointer",
  };

  // ======================================================
  // UI
  // ======================================================
  if (loading) {
    return <div style={container}>Loading subjects...</div>;
  }

  return (
    <div style={container}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Subjects</h2>

          <p style={{ margin: 0, opacity: 0.6, fontSize: 13 }}>
            Curriculum subject management
          </p>
        </div>

        <button style={primary} onClick={() => setShowForm(!showForm)}>
          {showForm ? "Close" : "+ Add Subject"}
        </button>
      </div>

      {/* FILTERS */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >

        <input
          placeholder="Search subject..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            ...input,
            width: 220,
          }}
        />

        <select
          style={button}
          value={classFilter}
          onChange={(e) => setClassFilter(Number(e.target.value) || "")}
        >
          <option value="">All Classes</option>

          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          style={button}
          value={organizationFilter}
          onChange={(e) =>
            setOrganizationFilter(Number(e.target.value) || "")
          }
        >
          <option value="">All Organizations</option>

          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>

        <select style={button} disabled>
          <option>Structure filter (future)</option>
        </select>
      </div>

      {/* FORM */}
      {showForm && (
        <div style={{ ...card, maxWidth: 500, marginTop: 15 }}>
          <h3>
            {editingId ? "Edit Subject" : "Create Subject"}
          </h3>

          <input
            placeholder="Subject name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              ...input,
              marginBottom: 10,
            }}
          />

          <input
            placeholder="Subject code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{
              ...input,
              marginBottom: 10,
            }}
          />

          {/* ORGANIZATION */}
          <select
            style={{
              ...input,
              marginBottom: 10,
            }}
            value={selectedOrganizationId}
            onChange={(e) =>
              setSelectedOrganizationId(
                Number(e.target.value) || ""
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

          {/* CLASS CHIPS */}
          <div>
            <small>Allowed Classes</small>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 6,
              }}
            >
              {classes.map((c) => {
                const active = allowedClasses.includes(c.id);

                return (
                  <div
                    key={c.id}
                    onClick={() =>
                      setAllowedClasses((prev) =>
                        active
                          ? prev.filter((id) => id !== c.id)
                          : [...prev, c.id]
                      )
                    }
                    style={{
                      ...chip,
                      background: active
                        ? "var(--primary-color)"
                        : "transparent",

                      color: active
                        ? "#fff"
                        : "var(--text)",
                    }}
                  >
                    {c.name}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ACTIONS */}
          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 10,
            }}
          >
            <button style={primary} onClick={save}>
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
            No subjects found
          </p>
        )}

        {filtered.map((s) => (
          <div key={s.id} style={card}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <div>
                <b>{s.name}</b>

                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.6,
                    marginTop: 4,
                  }}
                >
                  Code: {s.code || "-"}
                  <br />

                  Organization:{" "}
                  {orgMap.get(s.organizationId) || "None"}

                  <br />

                  Classes:{" "}
                  {(s.classIds || [])
                    .map((id: number) => classMap.get(id))
                    .filter(Boolean)
                    .join(", ") || "None"}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={button}
                  onClick={() => edit(s)}
                >
                  Edit
                </button>

                <button
                  style={button}
                  onClick={() => remove(s.id)}
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