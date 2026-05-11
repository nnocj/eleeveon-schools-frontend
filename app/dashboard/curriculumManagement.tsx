"use client";

/**
 * CurriculumManagement.tsx
 * ---------------------------------------------------------
 * UNIFIED CURRICULUM FOUNDATION ENGINE
 * ---------------------------------------------------------
 * PURPOSE
 * ---------------------------------------------------------
 * This module manages:
 *
 * ✅ Curriculum root definitions
 * ✅ Academic structure ownership
 * ✅ Organization ownership
 * ✅ Program linkage
 * ✅ Curriculum lifecycle
 * ✅ Active / Locked state
 *
 * THIS DOES NOT:
 * ❌ map subjects
 * ❌ assign classes
 * ❌ create assessment rules
 *
 * CurriculumSubject + AcademicSubjectContext
 * handle the operational academic intelligence.
 * ---------------------------------------------------------
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Curriculum,
  AcademicStructure,
  Organization,
  Program,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

// ======================================================
// FORM TYPES
// ======================================================

type FormState = {
  id?: number;

  name: string;
  code: string;

  curriculumVersion: string;
  description: string;

  academicStructureId: string;
  organizationId: string;
  programId: string;

  durationPeriods: string;
  totalCredits: string;

  effectiveFrom: string;
  effectiveTo: string;

  active: boolean;
  locked: boolean;
};

// ======================================================
// COMPONENT
// ======================================================

export default function CurriculumManagement() {
  const { settings } = useSettings();

  // ======================================================
  // CONTEXT
  // ======================================================

  const branchId = settings?.branchId || 1;

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);

  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [structures, setStructures] = useState<AcademicStructure[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);

  // ======================================================
  // UI STATE
  // ======================================================

  const [showForm, setShowForm] = useState(false);

  const [search, setSearch] = useState("");
  const [structureFilter, setStructureFilter] = useState("");
  const [organizationFilter, setOrganizationFilter] = useState("");

  // ======================================================
  // FORM STATE
  // ======================================================

  const [form, setForm] = useState<FormState>({
    name: "",
    code: "",

    curriculumVersion: "",
    description: "",

    academicStructureId: "",
    organizationId: "",
    programId: "",

    durationPeriods: "",
    totalCredits: "",

    effectiveFrom: "",
    effectiveTo: "",

    active: true,
    locked: false,
  });

  // ======================================================
  // LOAD
  // ======================================================

  const load = async () => {
    setLoading(true);

    const [
      curriculumData,
      structureData,
      organizationData,
      programData,
    ] = await Promise.all([
      db.curriculums.toArray(),
      db.academicStructures.toArray(),
      db.organizations.toArray(),
      db.programs.toArray(),
    ]);

    setCurriculums(
      curriculumData.filter(
        (x) =>
          !x.isDeleted &&
          x.branchId === branchId
      )
    );

    setStructures(
      structureData.filter(
        (x) =>
          !x.isDeleted &&
          x.branchId === branchId
      )
    );

    setOrganizations(
      organizationData.filter(
        (x) =>
          !x.isDeleted &&
          x.branchId === branchId
      )
    );

    setPrograms(
      programData.filter(
        (x) =>
          !x.isDeleted &&
          x.branchId === branchId
      )
    );

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const structureMap = useMemo(
    () =>
      new Map(
        structures.map((x) => [x.id, x.name])
      ),
    [structures]
  );

  const organizationMap = useMemo(
    () =>
      new Map(
        organizations.map((x) => [x.id, x.name])
      ),
    [organizations]
  );

  const programMap = useMemo(
    () =>
      new Map(
        programs.map((x) => [x.id, x.name])
      ),
    [programs]
  );

  // ======================================================
  // FILTERED
  // ======================================================

  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    return curriculums.filter((c) => {
      const matchesSearch =
        c.name?.toLowerCase().includes(q) ||
        c.code?.toLowerCase().includes(q) ||
        c.curriculumVersion
          ?.toLowerCase()
          .includes(q);

      const matchesStructure =
        !structureFilter ||
        c.academicStructureId ===
          Number(structureFilter);

      const matchesOrganization =
        !organizationFilter ||
        c.organizationId ===
          Number(organizationFilter);

      return (
        matchesSearch &&
        matchesStructure &&
        matchesOrganization
      );
    });
  }, [
    curriculums,
    search,
    structureFilter,
    organizationFilter,
  ]);

  // ======================================================
  // RESET
  // ======================================================

  const reset = () => {
    setForm({
      name: "",
      code: "",

      curriculumVersion: "",
      description: "",

      academicStructureId: "",
      organizationId: "",
      programId: "",

      durationPeriods: "",
      totalCredits: "",

      effectiveFrom: "",
      effectiveTo: "",

      active: true,
      locked: false,
    });

    setShowForm(false);
  };

  // ======================================================
  // SAVE
  // ======================================================

  const save = async () => {
    if (!form.name.trim()) {
      alert("Curriculum name is required");
      return;
    }

    if (!form.academicStructureId) {
      alert("Academic structure is required");
      return;
    }

    const payload = prepareSyncData({
      branchId,

      organizationId: form.organizationId
        ? Number(form.organizationId)
        : undefined,

      programId: form.programId
        ? Number(form.programId)
        : undefined,

      academicStructureId: Number(
        form.academicStructureId
      ),

      name: form.name.trim(),
      code: form.code.trim(),

      curriculumVersion:
        form.curriculumVersion.trim(),

      description:
        form.description.trim(),

      durationPeriods:
        form.durationPeriods
          ? Number(form.durationPeriods)
          : undefined,

      totalCredits:
        form.totalCredits
          ? Number(form.totalCredits)
          : undefined,

      effectiveFrom:
        form.effectiveFrom || undefined,

      effectiveTo:
        form.effectiveTo || undefined,

      active: form.active,
      locked: form.locked,
    });

    if (form.id) {
      await db.curriculums.update(
        form.id,
        payload
      );
    } else {
      await db.curriculums.add(payload);
    }

    reset();
    load();
  };

  // ======================================================
  // EDIT
  // ======================================================

  const edit = (c: Curriculum) => {
    setForm({
      id: c.id,

      name: c.name || "",
      code: c.code || "",

      curriculumVersion:
        c.curriculumVersion || "",

      description:
        c.description || "",

      academicStructureId:
        c.academicStructureId
          ? String(c.academicStructureId)
          : "",

      organizationId:
        c.organizationId
          ? String(c.organizationId)
          : "",

      programId:
        c.programId
          ? String(c.programId)
          : "",

      durationPeriods:
        c.durationPeriods
          ? String(c.durationPeriods)
          : "",

      totalCredits:
        c.totalCredits
          ? String(c.totalCredits)
          : "",

      effectiveFrom:
        c.effectiveFrom || "",

      effectiveTo:
        c.effectiveTo || "",

      active:
        c.active !== false,

      locked:
        !!c.locked,
    });

    setShowForm(true);
  };

  // ======================================================
  // DELETE
  // ======================================================

  const remove = async (
    id?: number
  ) => {
    if (!id) return;

    const usage =
      await db.curriculumSubjects
        .where("curriculumId")
        .equals(id)
        .count();

    if (usage > 0) {
      alert(
        "Cannot delete curriculum already linked to curriculum subjects"
      );
      return;
    }

    if (
      !confirm(
        "Delete curriculum?"
      )
    ) {
      return;
    }

    await db.curriculums.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    load();
  };

  // ======================================================
  // STYLES
  // ======================================================

  const container: React.CSSProperties = {
    padding: 20,
    color: "var(--text)",
  };

  const card: React.CSSProperties = {
    border:
      "1px solid rgba(0,0,0,0.08)",
    borderRadius: 12,
    padding: 14,
    background:
      "var(--surface)",
    marginBottom: 12,
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: 10,
    borderRadius: 8,
    border:
      "1px solid rgba(0,0,0,0.15)",
    background:
      "var(--surface)",
    color: "var(--text)",
  };

  const button: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 8,
    cursor: "pointer",
    border:
      "1px solid rgba(0,0,0,0.1)",
    background:
      "var(--surface)",
    color: "var(--text)",
  };

  const primary: React.CSSProperties = {
    padding: "8px 14px",
    borderRadius: 8,
    cursor: "pointer",
    border: "none",
    background:
      "var(--primary-color)",
    color: "#fff",
    fontWeight: 600,
  };

  // ======================================================
  // UI
  // ======================================================

  if (loading) {
    return (
      <div style={container}>
        Loading curriculums...
      </div>
    );
  }

  return (
    <div style={container}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>
            Curriculum Management
          </h2>

          <p
            style={{
              marginTop: 4,
              opacity: 0.6,
            }}
          >
            Root academic blueprint
            management
          </p>
        </div>

        <button
          style={primary}
          onClick={() =>
            setShowForm(
              !showForm
            )
          }
        >
          {showForm
            ? "Close"
            : "+ Add Curriculum"}
        </button>
      </div>

      {/* FILTERS */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginTop: 16,
        }}
      >
        <input
          style={{
            ...input,
            width: 260,
          }}
          placeholder="Search curriculum..."
          value={search}
          onChange={(e) =>
            setSearch(
              e.target.value
            )
          }
        />

        <select
          style={input}
          value={
            structureFilter
          }
          onChange={(e) =>
            setStructureFilter(
              e.target.value
            )
          }
        >
          <option value="">
            All Structures
          </option>

          {structures.map(
            (s) => (
              <option
                key={s.id}
                value={String(
                  s.id
                )}
              >
                {s.name}
              </option>
            )
          )}
        </select>

        <select
          style={input}
          value={
            organizationFilter
          }
          onChange={(e) =>
            setOrganizationFilter(
              e.target.value
            )
          }
        >
          <option value="">
            All Organizations
          </option>

          {organizations.map(
            (o) => (
              <option
                key={o.id}
                value={String(
                  o.id
                )}
              >
                {o.name}
              </option>
            )
          )}
        </select>
      </div>

      {/* FORM */}
      {showForm && (
        <div
          style={{
            ...card,
            marginTop: 20,
            maxWidth: 700,
          }}
        >
          <h3>
            {form.id
              ? "Edit Curriculum"
              : "Create Curriculum"}
          </h3>

          <div
            style={{
              display: "grid",
              gap: 12,
            }}
          >
            <input
              style={input}
              placeholder="Curriculum Name"
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name:
                    e.target
                      .value,
                })
              }
            />

            <input
              style={input}
              placeholder="Code"
              value={form.code}
              onChange={(e) =>
                setForm({
                  ...form,
                  code:
                    e.target
                      .value,
                })
              }
            />

            <input
              style={input}
              placeholder="Version"
              value={
                form.curriculumVersion
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  curriculumVersion:
                    e.target
                      .value,
                })
              }
            />

            <textarea
              style={{
                ...input,
                height: 90,
              }}
              placeholder="Description"
              value={
                form.description
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  description:
                    e.target
                      .value,
                })
              }
            />

            <select
              style={input}
              value={
                form.academicStructureId
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  academicStructureId:
                    e.target
                      .value,
                })
              }
            >
              <option value="">
                Academic Structure
              </option>

              {structures.map(
                (s) => (
                  <option
                    key={s.id}
                    value={String(
                      s.id
                    )}
                  >
                    {s.name}
                  </option>
                )
              )}
            </select>

            <select
              style={input}
              value={
                form.organizationId
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  organizationId:
                    e.target
                      .value,
                })
              }
            >
              <option value="">
                Organization
              </option>

              {organizations.map(
                (o) => (
                  <option
                    key={o.id}
                    value={String(
                      o.id
                    )}
                  >
                    {o.name}
                  </option>
                )
              )}
            </select>

            <select
              style={input}
              value={
                form.programId
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  programId:
                    e.target
                      .value,
                })
              }
            >
              <option value="">
                Program
              </option>

              {programs.map(
                (p) => (
                  <option
                    key={p.id}
                    value={String(
                      p.id
                    )}
                  >
                    {p.name}
                  </option>
                )
              )}
            </select>

            <input
              style={input}
              placeholder="Duration Periods"
              value={
                form.durationPeriods
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  durationPeriods:
                    e.target
                      .value,
                })
              }
            />

            <input
              style={input}
              placeholder="Total Credits"
              value={
                form.totalCredits
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  totalCredits:
                    e.target
                      .value,
                })
              }
            />

            <input
              type="date"
              style={input}
              value={
                form.effectiveFrom
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  effectiveFrom:
                    e.target
                      .value,
                })
              }
            />

            <input
              type="date"
              style={input}
              value={
                form.effectiveTo
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  effectiveTo:
                    e.target
                      .value,
                })
              }
            />

            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems:
                  "center",
              }}
            >
              <input
                type="checkbox"
                checked={
                  form.active
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    active:
                      e.target
                        .checked,
                  })
                }
              />
              Active
            </label>

            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems:
                  "center",
              }}
            >
              <input
                type="checkbox"
                checked={
                  form.locked
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    locked:
                      e.target
                        .checked,
                  })
                }
              />
              Locked Curriculum
            </label>

            <div
              style={{
                display: "flex",
                gap: 10,
              }}
            >
              <button
                style={primary}
                onClick={save}
              >
                {form.id
                  ? "Update"
                  : "Save"}
              </button>

              <button
                style={button}
                onClick={reset}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIST */}
      <div
        style={{
          marginTop: 20,
        }}
      >
        {filtered.length ===
          0 && (
          <div
            style={{
              opacity: 0.6,
            }}
          >
            No curriculums found
          </div>
        )}

        {filtered.map((c) => (
          <div
            key={c.id}
            style={card}
          >
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "flex-start",
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 16,
                  }}
                >
                  {c.name}

                  {c.curriculumVersion &&
                    ` (${c.curriculumVersion})`}
                </div>

                <div
                  style={{
                    marginTop: 6,
                    fontSize: 13,
                    opacity: 0.7,
                    lineHeight: 1.6,
                  }}
                >
                  Structure:{" "}
                  {structureMap.get(
                    c.academicStructureId
                  ) || "-"}
                  <br />

                  Organization:{" "}
                  {organizationMap.get(
                    c.organizationId ||
                      0
                  ) || "None"}
                  <br />

                  Program:{" "}
                  {programMap.get(
                    c.programId || 0
                  ) || "None"}
                  <br />

                  Duration:{" "}
                  {c.durationPeriods ||
                    "-"}{" "}
                  periods
                  <br />

                  Credits:{" "}
                  {c.totalCredits ||
                    "-"}
                  <br />

                  Status:{" "}
                  {c.locked
                    ? "Locked"
                    : c.active ===
                      false
                    ? "Inactive"
                    : "Active"}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                }}
              >
                <button
                  style={button}
                  onClick={() =>
                    edit(c)
                  }
                >
                  Edit
                </button>

                <button
                  style={button}
                  onClick={() =>
                    remove(c.id)
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