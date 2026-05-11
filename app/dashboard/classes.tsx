"use client";

import { useEffect, useMemo, useState } from "react";
import { db, Class, Organization, AcademicStructure, AssessmentEntry, StudentEnrollment } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";

// ======================================================
// TYPES
// ======================================================

type Filters = {
  search: string;
  organizationId: number | "";
  level: string;
};

// ======================================================
// PAGE
// ======================================================

export default function Classes() {
  // ================= DATA STATE =================
  const [classes, setClasses] = useState<Class[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [settings, setSettings] = useState<any>(null);

  const [loading, setLoading] = useState(true);

  // ================= UI STATE =================
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // ================= FILTER STATE =================
  const [filters, setFilters] = useState<Filters>({
    search: "",
    organizationId: "",
    level: "",
  });

  // ================= FORM STATE =================
  const [name, setName] = useState("");
  const [level, setLevel] = useState<string>("Primary");
  const [organizationId, setOrganizationId] = useState<number | "">("");

  // ======================================================
  // LOAD DATA (CONTEXT-AWARE)
  // ======================================================

  const load = async () => {
    const [cls, orgs, settingsData] = await Promise.all([
      db.classes.toArray(),
      db.organizations.toArray(),
      db.settings.toArray(),
    ]);

    const activeSettings = settingsData[0] || null;
    const currentStructureId = activeSettings?.currentAcademicStructureId;

    const filteredClasses = currentStructureId
      ? cls.filter(c => c.academicStructureId === currentStructureId && !c.isDeleted)
      : cls.filter(c => !c.isDeleted);

    setClasses(filteredClasses);
    setOrganizations(orgs);
    setSettings(activeSettings);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // ======================================================
  // MAPS
  // ======================================================

  const orgMap = useMemo(
    () => new Map(organizations.map(o => [o.id, o.name])),
    [organizations]
  );

  const getOrg = (id?: number) => (id ? orgMap.get(id) ?? "-" : "-");

  // ======================================================
  // FILTERING
  // ======================================================

  const filtered = useMemo(() => {
    const s = filters.search.toLowerCase();

    return classes.filter((c) => {
      return (
        c.name.toLowerCase().includes(s) &&
        (filters.organizationId === "" || c.organizationId === filters.organizationId) &&
        (!filters.level || c.level === filters.level)
      );
    });
  }, [classes, filters]);

  const updateFilter = (key: keyof Filters, value: any) => {
    setFilters((p) => ({ ...p, [key]: value }));
  };

  // ======================================================
  // RESET FORM
  // ======================================================

  const reset = () => {
    setName("");
    setLevel("Primary");
    setOrganizationId("");
    setEditingId(null);
    setShowForm(false);
  };

  // ======================================================
  // SAVE
  // ======================================================

  const save = async () => {
    if (!name.trim()) return alert("Class name required");

    const payload = prepareSyncData({
      branchId: settings?.branchId || 1,
      academicStructureId: settings?.currentAcademicStructureId || 1,
      organizationId: organizationId || undefined,
      name: name.trim(),
      level,
      active: true,
    });

    if (editingId) {
      await db.classes.update(editingId, payload);
    } else {
      await db.classes.add(payload);
    }

    reset();
    load();
  };

  // ======================================================
  // EDIT
  // ======================================================

  const edit = (c: Class) => {
    setEditingId(c.id || null);
    setName(c.name);
    setLevel(c.level || "Primary");
    setOrganizationId(c.organizationId || "");
    setShowForm(true);
  };

  // ======================================================
  // DELETE (UPDATED TO NEW ARCHITECTURE)
  // ======================================================

  const remove = async (id?: number) => {
    if (!id) return;

    // ✅ structural safety check
    const enrollmentCount = await db.studentEnrollments.where("classId").equals(id).count();
    if (enrollmentCount > 0) {
      return alert(`Cannot delete: ${enrollmentCount} students enrolled`);
    }

    // ✅ academic integrity check (replaces OLD scores table)
    const entryCount = await db.assessmentEntries.where("classId").equals(id).count();
    if (entryCount > 0) {
      return alert("Cannot delete: assessment records exist");
    }

    if (!confirm("Delete this class?")) return;

    await db.classes.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    load();
  };

  if (loading) return <div className="p-6">Loading...</div>;

  // ======================================================
  // STYLES (UNCHANGED)
  // ======================================================

  const card: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 12,
    padding: 14,
    background: "var(--surface)",
  };

  const input: React.CSSProperties = {
    padding: 10,
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.2)",
  };

  const btn: React.CSSProperties = {
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid var(--primary-color)",
    background: "var(--surface)",
    cursor: "pointer",
  };

  const primary: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    background: "var(--primary-color)",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  };

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Classes</h2>
          <p style={{ margin: 0, opacity: 0.6 }}>Manage academic classes</p>
        </div>

        <button style={primary} onClick={() => setShowForm(!showForm)}>
          {showForm ? "Close" : "+ Add Class"}
        </button>
      </div>

      {/* FILTERS */}
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(3, 1fr)" }}>
        <input
          placeholder="Search..."
          value={filters.search}
          onChange={(e) => updateFilter("search", e.target.value)}
          style={input}
        />

        <select
          value={filters.organizationId}
          onChange={(e) => updateFilter("organizationId", Number(e.target.value) || "")}
          style={input}
        >
          <option value="">All Organizations</option>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>

        <select
          value={filters.level}
          onChange={(e) => updateFilter("level", e.target.value)}
          style={input}
        >
          <option value="">All Levels</option>
          <option value="Primary">Primary</option>
          <option value="JHS">JHS</option>
          <option value="SHS">SHS</option>
          <option value="Tertiary">Tertiary</option>
        </select>
      </div>

      {/* FORM */}
      {showForm && (
        <div style={card}>
          <h3>{editingId ? "Edit Class" : "Create Class"}</h3>

          <input
            placeholder="Class name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ ...input, width: "100%", marginBottom: 10 }}
          />

          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            style={{ ...input, width: "100%", marginBottom: 10 }}
          >
            <option value="Primary">Primary</option>
            <option value="JHS">JHS</option>
            <option value="SHS">SHS</option>
            <option value="Tertiary">Tertiary</option>
          </select>

          <select
            value={organizationId}
            onChange={(e) => setOrganizationId(Number(e.target.value) || "")}
            style={{ ...input, width: "100%" }}
          >
            <option value="">No Organization</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button style={primary} onClick={save}>
              {editingId ? "Update" : "Save"}
            </button>
            <button style={btn} onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

      {/* LIST */}
      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((c) => (
          <div key={c.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <b>{c.name}</b>
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  {c.level || "Primary"} • {getOrg(c.organizationId)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button style={btn} onClick={() => edit(c)}>Edit</button>
                <button style={btn} onClick={() => remove(c.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}