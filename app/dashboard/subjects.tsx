"use client";

/**
 * Subjects.tsx
 * --------------------------------------------
 * Master Academic Subject Registry.
 * This file manages ONLY subject metadata:
 * name, code, credits, department, description.
 * NO curriculum logic, NO class assignment logic.
 * --------------------------------------------
 * This is a stable, production-ready UI module.
 */

import React, { useEffect, useMemo, useState } from "react";

import { db, Subject, Organization } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

// ======================================================
// SUBJECTS (MASTER ACADEMIC CATALOG)
// ======================================================

export default function Subjects() {
  const { settings } = useSettings();

  // ======================================================
  // CONTEXT
  // ======================================================
  const branchId = settings?.branchId || 1;
  const organizationId = settings?.organizationId;

  // ======================================================
  // STATE
  // ======================================================
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  // ======================================================
  // UI STATE
  // ======================================================
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // ======================================================
  // FORM STATE (STRING-FIRST SAFE MODEL)
  // ======================================================
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [credits, setCredits] = useState<string>("");

  const [selectedOrg, setSelectedOrg] = useState<string>(
    organizationId ? String(organizationId) : ""
  );

  // ======================================================
  // FILTERS
  // ======================================================
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>(
    organizationId ? String(organizationId) : ""
  );

  // ======================================================
  // LOAD DATA
  // ======================================================
  const load = async () => {
    setLoading(true);

    const [s, orgs] = await Promise.all([
      db.subjects.toArray(),
      db.organizations.toArray(),
    ]);

    setSubjects(s.filter((x) => !x.isDeleted));
    setOrganizations(orgs);

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // ======================================================
  // LOOKUPS
  // ======================================================
  const orgMap = useMemo(() => {
    return new Map(organizations.map((o) => [o.id, o.name]));
  }, [organizations]);

  // ======================================================
  // RESET FORM
  // ======================================================
  const reset = () => {
    setName("");
    setCode("");
    setDescription("");
    setCredits("");
    setSelectedOrg(organizationId ? String(organizationId) : "");
    setEditingId(null);
    setShowForm(false);
  };

  // ======================================================
  // SAVE
  // ======================================================
  const save = async () => {
    if (!name.trim()) return alert("Subject name is required");

    const payload = prepareSyncData({
      branchId,

      organizationId: selectedOrg ? Number(selectedOrg) : undefined,

      name: name.trim(),
      code: code.trim(),
      description: description.trim(),
      credits: credits ? Number(credits) : undefined,

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
  const edit = (s: Subject) => {
    setEditingId(s.id ?? null);

    setName(s.name || "");
    setCode(s.code || "");
    setDescription(s.description || "");
    setCredits(s.credits !== undefined ? String(s.credits) : "");
    setSelectedOrg(s.organizationId ? String(s.organizationId) : "");
    setShowForm(true);
  };

  // ======================================================
  // DELETE
  // ======================================================
  const remove = async (id: number) => {
    const usage = await db.assignments.where("subjectId").equals(id).count();

    if (usage > 0) {
      alert("Cannot delete subject in use");
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
  // FILTERED LIST
  // ======================================================
  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    return subjects.filter((s) => {
      const matchText =
        s.name?.toLowerCase().includes(q) ||
        s.code?.toLowerCase().includes(q);

      const matchOrg =
        orgFilter === "" ||
        s.organizationId === Number(orgFilter);

      return matchText && matchOrg;
    });
  }, [subjects, search, orgFilter]);

  // ======================================================
  // STYLES (CONSISTENT SYSTEM UI)
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

  const input: React.CSSProperties = {
    padding: 10,
    width: "100%",
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.2)",
    background: "var(--surface)",
    color: "var(--text)",
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

  // ======================================================
  // UI
  // ======================================================
  if (loading) return <div style={container}>Loading subjects...</div>;

  return (
    <div style={container}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Subjects</h2>
          <p style={{ margin: 0, opacity: 0.6 }}>
            Master academic subject registry
          </p>
        </div>

        <button style={primary} onClick={() => setShowForm(!showForm)}>
          {showForm ? "Close" : "+ Add Subject"}
        </button>
      </div>

      {/* FILTERS */}
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <input
          style={{ ...input, width: 220 }}
          placeholder="Search subject..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          style={button}
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
        >
          <option value="">All Departments</option>
          {organizations.map((o) => (
            <option key={o.id} value={String(o.id)}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      {/* FORM */}
      {showForm && (
        <div style={{ ...card, maxWidth: 500, marginTop: 15 }}>
          <h3>{editingId ? "Edit Subject" : "Create Subject"}</h3>

          <input
            style={input}
            placeholder="Subject name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            style={{ ...input, marginTop: 10 }}
            placeholder="Subject code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />

          <input
            style={{ ...input, marginTop: 10 }}
            placeholder="Credits (optional)"
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
          />

          <textarea
            style={{ ...input, marginTop: 10, height: 80 }}
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <select
            style={{ ...input, marginTop: 10 }}
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
          >
            <option value="">Select Department</option>
            {organizations.map((o) => (
              <option key={o.id} value={String(o.id)}>
                {o.name}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
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
          <p style={{ opacity: 0.6 }}>No subjects found</p>
        )}

        {filtered.map((s) => (
          <div key={s.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <b>{s.name}</b>

                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  Code: {s.code || "-"} <br />
                  Credits: {s.credits ?? "-"} <br />
                  Department:{" "}
                  {orgMap.get(s.organizationId || 0) || "None"}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button style={button} onClick={() => edit(s)}>
                  Edit
                </button>

                <button style={button} onClick={() => remove(s.id!)}>
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