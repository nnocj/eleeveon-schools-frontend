"use client";

/**
 * AcademicSubjectContext.tsx
 * ---------------------------------------------------------
 * NEXT-GEN ACADEMIC CONFIGURATION ENGINE (STABLE REWRITE)
 * ---------------------------------------------------------
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  AcademicSubjectContext,
  CurriculumSubject,
  Curriculum,
  Subject,
  Class,
  AcademicPeriod,
  Organization,
  AssessmentStructure,
  GradingSystem,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";

// ======================================================

type FormState = {
  id?: number;
  organizationId?: number;
  curriculumSubjectId?: number;
  assessmentStructureId?: number;
  gradingSystemId?: number;
  active: boolean;
};

// ======================================================

export default function AcademicSubjectContextPage() {
  const { settings } = useSettings();

  const branchId = settings?.branchId || 1;
  const primary = settings?.primaryColor || "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);

  const [contexts, setContexts] = useState<AcademicSubjectContext[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [structures, setStructures] = useState<AssessmentStructure[]>([]);
  const [gradings, setGradings] = useState<GradingSystem[]>([]);

  const [search, setSearch] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState<FormState>({
    organizationId: undefined,
    curriculumSubjectId: undefined,
    assessmentStructureId: undefined,
    gradingSystemId: undefined,
    active: true,
  });

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    setLoading(true);

    const [
      ctx,
      cs,
      c,
      s,
      cl,
      p,
      o,
      st,
      g,
    ] = await Promise.all([
      db.academicSubjectContexts.toArray(),
      db.curriculumSubjects.toArray(),
      db.curriculums.toArray(),
      db.subjects.toArray(),
      db.classes.toArray(),
      db.academicPeriods.toArray(),
      db.organizations.toArray(),
      db.assessmentStructures.toArray(),
      db.gradingSystems.toArray(),
    ]);

    setContexts(ctx.filter(x => x.branchId === branchId && !x.isDeleted));
    setCurriculumSubjects(cs.filter(x => x.branchId === branchId));
    setCurriculums(c.filter(x => x.branchId === branchId));
    setSubjects(s.filter(x => x.branchId === branchId));
    setClasses(cl.filter(x => x.branchId === branchId));
    setPeriods(p.filter(x => x.branchId === branchId));
    setOrgs(o.filter(x => x.branchId === branchId));
    setStructures(st.filter(x => x.branchId === branchId));
    setGradings(g.filter(x => x.branchId === branchId));

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // LOOKUPS (SAFE)
  // ======================================================

  const mapCS = useMemo(() => {
    const map = new Map<number, any>();

    curriculumSubjects.forEach(cs => {
      map.set(cs.id!, {
        subject: subjects.find(s => s.id === cs.subjectId)?.name,
        curriculum: curriculums.find(c => c.id === cs.curriculumId)?.name,
        class: classes.find(c => c.id === cs.classId)?.name || "All",
        period: periods.find(p => p.id === cs.academicPeriodId)?.name || "All",
      });
    });

    return map;
  }, [curriculumSubjects, subjects, curriculums, classes, periods]);

  const mapStructure = useMemo(
    () => new Map(structures.map(s => [s.id, s.name])),
    [structures]
  );

  const mapGrading = useMemo(
    () => new Map(gradings.map(g => [g.id, g.name])),
    [gradings]
  );

  // ======================================================
  // SMART SUGGESTIONS (STABLE)
  // ======================================================

  const suggestions = useMemo(() => {
    if (!form.curriculumSubjectId) return null;

    const cs = curriculumSubjects.find(x => x.id === form.curriculumSubjectId);
    if (!cs) return null;

    return {
      organizationId: cs.organizationId,
      assessmentStructureId: structures[0]?.id,
      gradingSystemId: gradings[0]?.id,
    };
  }, [form.curriculumSubjectId, curriculumSubjects, structures, gradings]);

  useEffect(() => {
    if (!suggestions) return;

    setForm(prev => ({
      ...prev,
      organizationId: suggestions.organizationId,
      assessmentStructureId: suggestions.assessmentStructureId,
      gradingSystemId: suggestions.gradingSystemId,
    }));
  }, [suggestions]);

  // ======================================================
  // CREATE OPEN (FIXED)
  // ======================================================

  const openCreate = () => {
    setEditMode(false);

    setForm({
      organizationId: undefined,
      curriculumSubjectId: undefined,
      assessmentStructureId: undefined,
      gradingSystemId: undefined,
      active: true,
    });

    setDrawerOpen(true);
  };

  // ======================================================
  // SAVE
  // ======================================================

  const save = async () => {
    if (!form.curriculumSubjectId || !form.assessmentStructureId) {
      alert("Fill required fields");
      return;
    }

    const payload = prepareSyncData({
      branchId,
      organizationId: form.organizationId,
      curriculumSubjectId: form.curriculumSubjectId,
      assessmentStructureId: form.assessmentStructureId,
      gradingSystemId: form.gradingSystemId,
      active: form.active,
    });

    if (editMode && form.id) {
      await db.academicSubjectContexts.update(form.id, payload);
    } else {
      await db.academicSubjectContexts.add(payload);
    }

    setDrawerOpen(false);
    load();
  };

  // ======================================================
  // EDIT
  // ======================================================

  const edit = (row: AcademicSubjectContext) => {
    setEditMode(true);

    setForm({
      id: row.id,
      organizationId: row.organizationId,
      curriculumSubjectId: row.curriculumSubjectId,
      assessmentStructureId: row.assessmentStructureId,
      gradingSystemId: row.gradingSystemId,
      active: row.active,
    });

    setDrawerOpen(true);
  };

  // ======================================================
  // DELETE
  // ======================================================

  const remove = async (id?: number) => {
    if (!id) return;
    if (!confirm("Delete context?")) return;

    await db.academicSubjectContexts.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    load();
  };

  // ======================================================
  // FILTER
  // ======================================================

  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    return contexts.filter(ctx => {
      const cs = mapCS.get(ctx.curriculumSubjectId);

      return `
        ${cs?.subject}
        ${cs?.curriculum}
        ${cs?.class}
        ${cs?.period}
        ${mapStructure.get(ctx.assessmentStructureId)}
        ${mapGrading.get(ctx.gradingSystemId || 0)}
      `.toLowerCase().includes(q);
    });
  }, [contexts, search, mapCS, mapStructure, mapGrading]);

  // ======================================================
  // LOADING
  // ======================================================

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={{ padding: 20, color: "var(--text)" }}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>Academic Subject Context Engine</h2>

        <button
          onClick={openCreate}
          style={{ background: primary, color: "#fff", padding: 10 }}
        >
          + Create Context
        </button>
      </div>

      {/* SEARCH */}
      <input
        placeholder="Search..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginTop: 10, padding: 10, width: 300 }}
      />

      {/* LIST */}
      <div style={{ marginTop: 20 }}>
        {filtered.map(ctx => {
          const cs = mapCS.get(ctx.curriculumSubjectId);

          return (
            <div key={ctx.id} style={{ border: "1px solid #ddd", padding: 10, marginBottom: 10 }}>
              <b>{cs?.subject}</b>
              <div style={{ fontSize: 12 }}>
                {cs?.curriculum} → {cs?.class} → {cs?.period}
              </div>

              <div style={{ fontSize: 12 }}>
                {mapStructure.get(ctx.assessmentStructureId)} | {mapGrading.get(ctx.gradingSystemId || 0)}
              </div>

              <button onClick={() => edit(ctx)}>Edit</button>
              <button onClick={() => remove(ctx.id)}>Delete</button>
            </div>
          );
        })}
      </div>

      {/* DRAWER */}
      {drawerOpen && (
        <div style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: 420,
          height: "100vh",
          background: "#fff",
          boxShadow: "-10px 0 30px rgba(0,0,0,0.15)",
          padding: 20,
          zIndex: 9999,
        }}>

          <h3>{editMode ? "Edit Context" : "Create Context"}</h3>

          <select
            value={form.curriculumSubjectId || ""}
            onChange={e =>
              setForm({ ...form, curriculumSubjectId: Number(e.target.value) })
            }
            style={{ width: "100%", padding: 10, marginBottom: 10 }}
          >
            <option value="">Select Curriculum Subject</option>
            {curriculumSubjects.map(cs => (
              <option key={cs.id} value={cs.id!}>
                {subjects.find(s => s.id === cs.subjectId)?.name}
              </option>
            ))}
          </select>

          <select
            value={form.assessmentStructureId || ""}
            onChange={e =>
              setForm({ ...form, assessmentStructureId: Number(e.target.value) })
            }
            style={{ width: "100%", padding: 10, marginBottom: 10 }}
          >
            <option value="">Assessment Structure</option>
            {structures.map(s => (
              <option key={s.id} value={s.id!}>{s.name}</option>
            ))}
          </select>

          <select
            value={form.gradingSystemId || ""}
            onChange={e =>
              setForm({ ...form, gradingSystemId: Number(e.target.value) })
            }
            style={{ width: "100%", padding: 10, marginBottom: 10 }}
          >
            <option value="">Grading System</option>
            {gradings.map(g => (
              <option key={g.id} value={g.id!}>{g.name}</option>
            ))}
          </select>

          <button onClick={save} style={{ background: primary, color: "#fff", padding: 10 }}>
            Save
          </button>

          <button onClick={() => setDrawerOpen(false)} style={{ marginLeft: 10 }}>
            Cancel
          </button>
        </div>
      )}

    </div>
  );
}