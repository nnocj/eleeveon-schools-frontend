/*You’ve built a 4-layer academic intelligence system:

1. Configuration Layer (Academic Config Page)

Defines:

Grading rules (A–F, GPA, etc.)
Assessment structures (weights)
Periods (term/semester)

👉 This is your RULE ENGINE */


"use client";

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  db,
  GradingSystem,
  GradeRule,
  AssessmentStructure,
  AssessmentStructureItem,
  AcademicStructure, // ✅ ADD THIS
  AcademicPeriod,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";

import { useSettings } from "../context/settings-context";

// ======================================================
// TYPES
// ======================================================

type TabType =
  
  | "academic_structures"
  | "academic_periods"
  | "assessment_structures"
  | "assessment_items"
  | "grading_systems"
  | "grade_rules";
  
  


// ======================================================
// COMPONENT
// ======================================================

export default function AcademicConfigurationPage() {
  const { settings } = useSettings();

  // ======================================================
  // CONTEXT
  // ======================================================

  const branchId =
    settings?.branchId ?? 1;

  const organizationId =
    settings?.organizationId;

  const primary =
    settings?.primaryColor ||
    "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] =
    useState(true);

  const [tab, setTab] =
    useState<TabType>(
      "academic_structures"
    );

  const [search, setSearch] =
    useState("");

  const [showForm, setShowForm] =
    useState(false);

  // ======================================================
  // DATA
  // ======================================================

  const [
    gradingSystems,
    setGradingSystems,
  ] = useState<GradingSystem[]>([]);

  const [gradeRules, setGradeRules] =
    useState<GradeRule[]>([]);

  const [
    assessmentStructures,
    setAssessmentStructures,
  ] = useState<
    AssessmentStructure[]
  >([]);

  const [
    assessmentItems,
    setAssessmentItems,
  ] = useState<
    AssessmentStructureItem[]
  >([]);

  const [academicStructures, setAcademicStructures] =
  useState<AcademicStructure[]>([]);

  const [
    academicPeriods,
    setAcademicPeriods,
  ] = useState<
    AcademicPeriod[]
  >([]);

  // ======================================================
  // EXPAND
  // ======================================================

  const [
    expandedSystems,
    setExpandedSystems,
  ] = useState<number[]>([]);

  const [
    expandedStructures,
    setExpandedStructures,
  ] = useState<number[]>([]);

  // ======================================================
  // EDITING
  // ======================================================

  const [
  editingAcademicStructureId,
  setEditingAcademicStructureId,
] = useState<number | null>(null);

  const [
    editingGradingSystemId,
    setEditingGradingSystemId,
  ] = useState<number | null>(
    null
  );

  const [
    editingGradeRuleId,
    setEditingGradeRuleId,
  ] = useState<number | null>(
    null
  );

  const [
    editingStructureId,
    setEditingStructureId,
  ] = useState<number | null>(
    null
  );

  const [
    editingItemId,
    setEditingItemId,
  ] = useState<number | null>(
    null
  );

  const [
    editingPeriodId,
    setEditingPeriodId,
  ] = useState<number | null>(
    null
  );

  // ======================================================
  // FORMS
  // ======================================================


  const [
  academicStructureName,
  setAcademicStructureName,
] = useState("");

const [
  academicStructureLevel,
  setAcademicStructureLevel,
] = useState("");

const [
  academicStructureStartDate,
  setAcademicStructureStartDate,
] = useState("");

const [
  academicStructureEndDate,
  setAcademicStructureEndDate,
] = useState("");

  const [gradingName, setGradingName] =
    useState("");

  const [
    gradingDescription,
    setGradingDescription,
  ] = useState("");

  const [gradingType, setGradingType] =
    useState<
      | "percentage"
      | "gpa"
      | "competency"
      | "custom"
    >("percentage");

  const [
    selectedGradingSystemId,
    setSelectedGradingSystemId,
  ] = useState<number>();

  const [minScore, setMinScore] =
    useState("");

  const [maxScore, setMaxScore] =
    useState("");

  const [grade, setGrade] =
    useState("");

  const [remark, setRemark] =
    useState("");

  const [gpa, setGpa] =
    useState("");

  const [
    structureName,
    setStructureName,
  ] = useState("");

  const [
    structureDescription,
    setStructureDescription,
  ] = useState("");

  const [
    structureTotal,
    setStructureTotal,
  ] = useState("100");

  const [
    assessmentStructureId,
    setAssessmentStructureId,
  ] = useState<number>();

  const [itemName, setItemName] =
    useState("");

  const [itemWeight, setItemWeight] =
    useState("");

  const [itemMaxScore, setItemMaxScore] =
    useState("");

  // ======================================================
  // ACADEMIC PERIOD FORM
  // ======================================================

  const [academicStructureId, setAcademicStructureId] =
  useState<number>();

  const [periodName, setPeriodName] =
    useState("");

  const [periodType, setPeriodType] =
    useState("");

  const [
    periodStartDate,
    setPeriodStartDate,
  ] = useState("");

  const [
    periodEndDate,
    setPeriodEndDate,
  ] = useState("");

  const [periodOrder, setPeriodOrder] =
    useState("1");

  // ======================================================
  // STYLES
  // ======================================================

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border:
      "1px solid rgba(0,0,0,0.08)",
    borderRadius: 20,
    padding: 18,
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border:
      "1px solid rgba(0,0,0,0.12)",
    background: "var(--surface)",
    color: "var(--text)",
    outline: "none",
  };

  const button: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 12,
    border: "none",
    background: primary,
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  };

  const outlineButton: React.CSSProperties =
    {
      padding: "12px 16px",
      borderRadius: 12,
      border: `1px solid ${primary}`,
      background: "transparent",
      color: "var(--text)",
      fontWeight: 700,
      cursor: "pointer",
    };

  const dangerButton: React.CSSProperties =
    {
      padding: "10px 14px",
      borderRadius: 10,
      border: "none",
      background: "#d32f2f",
      color: "#fff",
      cursor: "pointer",
      fontWeight: 700,
    };

  const badge: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    background:
      "rgba(0,0,0,0.06)",
  };

  // ======================================================
  // LOAD
  // ======================================================

  const load = async () => {
    setLoading(true);

    try {
      const [
        grading,
        rules,
        structures,
        items,
        periods,
        academicStructs, // ✅ ADD THIS

      ] = await Promise.all([
        db.gradingSystems.toArray(),
        db.gradeRules.toArray(),
        db.assessmentStructures.toArray(),
        db.assessmentStructureItems.toArray(),
        db.academicPeriods.toArray(),
        db.academicStructures.toArray(), // ✅ ADD THIS
      ]);

      setGradingSystems(
        grading.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setGradeRules(
        rules.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setAssessmentStructures(
        structures.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setAssessmentItems(
        items.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setAcademicStructures(
        academicStructs.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );

      setAcademicPeriods(
        periods.filter(
          (x) =>
            x.branchId === branchId &&
            !x.isDeleted
        )
      );
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // ANALYTICS
  // ======================================================

  const totalAcademicStructures =
  academicStructures.length;

  const totalRules =
    gradeRules.length;

  const totalStructures =
    assessmentStructures.length;

  const totalItems =
    assessmentItems.length;

  const totalSystems =
    gradingSystems.length;

  const totalPeriods =
    academicPeriods.length;

  const totalWeight =
    useMemo(() => {
      return assessmentItems.reduce(
        (sum, item) =>
          sum +
          Number(item.weight || 0),
        0
      );
    }, [assessmentItems]);

  // ======================================================
  // RESET
  // ======================================================

  const resetForms = () => {
    setEditingGradingSystemId(
      null
    );

    setEditingAcademicStructureId(null);

    setAcademicStructureName("");

    setAcademicStructureLevel("");

    setAcademicStructureStartDate("");

    setAcademicStructureEndDate("");

    setEditingGradeRuleId(null);

    setEditingStructureId(null);

    setEditingItemId(null);

    setEditingPeriodId(null);

    setGradingName("");
    setGradingDescription("");
    setGradingType("percentage");

    setSelectedGradingSystemId(
      undefined
    );

    setMinScore("");
    setMaxScore("");
    setGrade("");
    setRemark("");
    setGpa("");

    setStructureName("");
    setStructureDescription("");
    setStructureTotal("100");

    setAssessmentStructureId(
      undefined
    );

    setItemName("");
    setItemWeight("");
    setItemMaxScore("");

    setAcademicStructureId(
      undefined
    );

    setPeriodName("");
    setPeriodType("");
    setPeriodStartDate("");
    setPeriodEndDate("");
    setPeriodOrder("1");
  };

  // ======================================================
  // SAVE
  // ======================================================

  const saveGradingSystem =
    async () => {
      if (!gradingName.trim()) {
        alert("Enter name");
        return;
      }

      if (
        editingGradingSystemId
      ) {
        await db.gradingSystems.update(
          editingGradingSystemId,
          {
            name: gradingName,
            description:
              gradingDescription,
            type: gradingType,
          }
        );
      } else {
        await db.gradingSystems.add(
          prepareSyncData({
            branchId,
            organizationId,
            name: gradingName,
            description:
              gradingDescription,
            type: gradingType,
            active: true,
          })
        );
      }

      resetForms();

      setShowForm(false);

      load();
    };

  const saveGradeRule =
    async () => {
      if (
        !selectedGradingSystemId
      ) {
        alert(
          "Select grading system"
        );
        return;
      }

      const payload = {
        branchId,
        gradingSystemId:
          selectedGradingSystemId,
        minScore:
          Number(minScore),
        maxScore:
          Number(maxScore),
        grade,
        remark,
        gpa: Number(gpa || 0),
        active: true,
      };

      if (
        editingGradeRuleId
      ) {
        await db.gradeRules.update(
          editingGradeRuleId,
          payload
        );
      } else {
        await db.gradeRules.add(
          prepareSyncData(payload)
        );
      }

      resetForms();

      setShowForm(false);

      load();
    };

  const saveStructure =
    async () => {
      if (!structureName.trim()) {
        alert("Enter structure");
        return;
      }

      const payload = {
        branchId,
        organizationId,
        name: structureName,
        description:
          structureDescription,
        totalScore:
          Number(
            structureTotal
          ),
        active: true,
      };

      if (
        editingStructureId
      ) {
        await db.assessmentStructures.update(
          editingStructureId,
          payload
        );
      } else {
        await db.assessmentStructures.add(
          prepareSyncData(payload)
        );
      }

      resetForms();

      setShowForm(false);

      load();
    };

  const saveItem =
    async () => {
      if (
        !assessmentStructureId
      ) {
        alert(
          "Select structure"
        );
        return;
      }

      const payload = {
        branchId,
        assessmentStructureId,
        name: itemName,
        weight:
          Number(itemWeight),
        maxScore:
          Number(
            itemMaxScore
          ),
        compulsory: true,
        active: true,
      };

      if (editingItemId) {
        await db.assessmentStructureItems.update(
          editingItemId,
          payload
        );
      } else {
        await db.assessmentStructureItems.add(
          prepareSyncData(payload)
        );
      }

      resetForms();

      setShowForm(false);

      load();
    };

  // ======================================================
  // SAVE PERIOD
  // ======================================================

  const saveAcademicPeriod =
    async () => {
      if (
        !academicStructureId
      ) {
        alert(
          "Select academic structure"
        );
        return;
      }

      if (!periodName.trim()) {
        alert(
          "Enter period name"
        );
        return;
      }

      const payload = {
        branchId,
        academicStructureId, // ✅ FIXED LINK
        name: periodName,
        type: periodType as any,
        startDate: periodStartDate,
        endDate: periodEndDate,
        order: Number(periodOrder),
        active: true,
      };

      if (
        editingPeriodId
      ) {
        await db.academicPeriods.update(
          editingPeriodId,
          payload
        );
      } else {
        await db.academicPeriods.add(
          prepareSyncData(payload)
        );
      }

      resetForms();

      setShowForm(false);

      load();
    };

  const saveAcademicStructure =
  async () => {
    if (
      !academicStructureName.trim()
    ) {
      alert(
        "Enter academic structure name"
      );
      return;
    }

    const payload = {
      branchId,
      organizationId,
      name: academicStructureName,
      level:
        academicStructureLevel as any,
      startDate:
        academicStructureStartDate,
      endDate:
        academicStructureEndDate,
      active: true,
    };

    if (
      editingAcademicStructureId
    ) {
      await db.academicStructures.update(
        editingAcademicStructureId,
        payload
      );
    } else {
      await db.academicStructures.add(
        prepareSyncData(payload)
      );
    }

    resetForms();

    setShowForm(false);

    load();
  };

  // ======================================================
  // DELETE
  // ======================================================

  const deleteGradingSystem =
    async (id?: number) => {
      if (!id) return;

      if (
        !confirm(
          "Delete grading system?"
        )
      )
        return;

      await db.gradingSystems.update(
        id,
        {
          isDeleted: true,
        }
      );

      load();
    };

  const deleteGradeRule =
    async (id?: number) => {
      if (!id) return;

      if (
        !confirm(
          "Delete grade rule?"
        )
      )
        return;

      await db.gradeRules.update(id, {
        isDeleted: true,
      });

      load();
    };

  const deleteStructure =
    async (id?: number) => {
      if (!id) return;

      if (
        !confirm(
          "Delete structure?"
        )
      )
        return;

      await db.assessmentStructures.update(
        id,
        {
          isDeleted: true,
        }
      );

      load();
    };

  const deleteItem = async (
    id?: number
  ) => {
    if (!id) return;

    if (
      !confirm(
        "Delete assessment item?"
      )
    )
      return;

    await db.assessmentStructureItems.update(
      id,
      {
        isDeleted: true,
      }
    );

    load();
  };

  const deletePeriod =
    async (id?: number) => {
      if (!id) return;

      if (
        !confirm(
          "Delete academic period?"
        )
      )
        return;

      await db.academicPeriods.update(
        id,
        {
          isDeleted: true,
        }
      );

      load();
    };


  const deleteAcademicStructure =
  async (id?: number) => {
    if (!id) return;

    if (
      !confirm(
        "Delete academic structure?"
      )
    )
      return;

    await db.academicStructures.update(
      id,
      {
        isDeleted: true,
      }
    );

    load();
  };

  // ======================================================
  // EDIT
  // ======================================================

  

  const editGradingSystem = (
    g: GradingSystem
  ) => {
    setTab(
      "grading_systems"
    );

    setShowForm(true);

    setEditingGradingSystemId(
      g.id || null
    );

    setGradingName(g.name);

    setGradingDescription(
      g.description || ""
    );

    setGradingType(
      g.type as any
    );
  };

  const editGradeRule = (
    r: GradeRule
  ) => {
    setTab("grade_rules");

    setShowForm(true);

    setEditingGradeRuleId(
      r.id || null
    );

    setSelectedGradingSystemId(
      r.gradingSystemId
    );

    setMinScore(
      String(r.minScore)
    );

    setMaxScore(
      String(r.maxScore)
    );

    setGrade(r.grade);

    setRemark(
      r.remark || ""
    );

    setGpa(String(r.gpa || ""));
  };

  const editStructure = (
    s: AssessmentStructure
  ) => {
    setTab(
      "assessment_structures"
    );

    setShowForm(true);

    setEditingStructureId(
      s.id || null
    );

    setStructureName(s.name);

    setStructureDescription(
      s.description || ""
    );

    setStructureTotal(
      String(
        s.totalScore || 100
      )
    );
  };

  const editItem = (
    item: AssessmentStructureItem
  ) => {
    setTab(
      "assessment_items"
    );

    setShowForm(true);

    setEditingItemId(
      item.id || null
    );

    setAssessmentStructureId(
      item.assessmentStructureId
    );

    setItemName(item.name);

    setItemWeight(
      String(item.weight)
    );

    setItemMaxScore(
      String(item.maxScore)
    );
  };

  const editPeriod = (
    period: AcademicPeriod
  ) => {
    setTab(
      "academic_periods"
    );

    setShowForm(true);

    setEditingPeriodId(
      period.id || null
    );

    setAcademicStructureId(
      period.academicStructureId
    );

    setPeriodName(
      period.name
    );

    setPeriodType(
      String(
        period.type || ""
      )
    );

    setPeriodStartDate(
      period.startDate
    );

    setPeriodEndDate(
      period.endDate
    );

    setPeriodOrder(
      String(period.order)
    );
  };


  const editAcademicStructure = (
  structure: AcademicStructure
) => {
  setTab(
    "academic_structures"
  );

  setShowForm(true);

  setEditingAcademicStructureId(
    structure.id || null
  );

  setAcademicStructureName(
    structure.name
  );

  setAcademicStructureLevel(
    String(structure.level || "")
  );

  setAcademicStructureStartDate(
    structure.startDate
  );

  setAcademicStructureEndDate(
    structure.endDate
  );
};

  // ======================================================
  // HELPERS
  // ======================================================

  const toggleSystem = (
    id?: number
  ) => {
    if (!id) return;

    setExpandedSystems(
      (prev) =>
        prev.includes(id)
          ? prev.filter(
              (x) => x !== id
            )
          : [...prev, id]
    );
  };

  const toggleStructure = (
    id?: number
  ) => {
    if (!id) return;

    setExpandedStructures(
      (prev) =>
        prev.includes(id)
          ? prev.filter(
              (x) => x !== id
            )
          : [...prev, id]
    );
  };

  // ======================================================
  // FILTERED
  // ======================================================

  const filteredSystems =
    gradingSystems.filter((g) =>
      g.name
        .toLowerCase()
        .includes(
          search.toLowerCase()
        )
    );

  const filteredStructures =
    assessmentStructures.filter(
      (s) =>
        s.name
          .toLowerCase()
          .includes(
            search.toLowerCase()
          )
    );

  // ======================================================
  // LOADING
  // ======================================================

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        Loading configuration...
      </div>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div
      style={{
        padding: 20,
        color: "var(--text)",
      }}
    >
      {/* HEADER */}

      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          gap: 14,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>
            Academic Configuration
          </h2>

          <div
            style={{
              opacity: 0.7,
              marginTop: 4,
              fontSize: 13,
            }}
          >
            Configure grading,
            assessment systems,
            scoring structures and
            academic periods.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <input
            style={{
              ...input,
              width: 260,
            }}
            placeholder="Search..."
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
          />

          <button
            style={button}
            onClick={() =>
              setShowForm(
                !showForm
              )
            }
          >
            {showForm
              ? "Close Form"
              : "Add / Create"}
          </button>
        </div>
      </div>

      {/* SUMMARY */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(220px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div
            style={{
              opacity: 0.7,
              fontSize: 12,
            }}
          >
            Academic Structures
          </div>

          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              marginTop: 6,
            }}
          >
            {totalAcademicStructures}
          </div>
        </div>
         <div style={card}>
          <div
            style={{
              opacity: 0.7,
              fontSize: 12,
            }}
          >
            Academic Periods
          </div>

          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              marginTop: 6,
            }}
          >
            {totalPeriods}
          </div>
        </div>
        <div style={card}>
          <div
            style={{
              opacity: 0.7,
              fontSize: 12,
            }}
          >
            Assessment Structures
          </div>

          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              marginTop: 6,
            }}
          >
            {totalStructures}
          </div>
        </div>

        <div style={card}>
          <div
            style={{
              opacity: 0.7,
              fontSize: 12,
            }}
          >
            Grading Systems
          </div>

          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              marginTop: 6,
            }}
          >
            {totalSystems}
          </div>
        </div>

        <div style={card}>
          <div
            style={{
              opacity: 0.7,
              fontSize: 12,
            }}
          >
            Grade Rules
          </div>

          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              marginTop: 6,
            }}
          >
            {totalRules}
          </div>
        </div>

        <div style={card}>
          <div
            style={{
              opacity: 0.7,
              fontSize: 12,
            }}
          >
            Total Weight
          </div>

          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              marginTop: 6,
            }}
          >
            {totalWeight}%
          </div>
        </div>
      </div>

      {/* TABS */}

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginTop: 20,
        }}
      >
        {[
          {
            key:
              "academic_structures",
            label:
              "Academic Structures",
          },
          {
            key:
              "academic_periods",
            label:
              "Academic Periods",
          },
          {
            key:
              "assessment_structures",
            label:
              "Assessment Structures",
          },
          {
            key:
              "assessment_items",
            label:
              "Assessment Items",
          },
          {
            key:
              "grading_systems",
            label:
              "Grading Systems",
          },
          {
            key: "grade_rules",
            label:
              "Grade Rules",
          },
          
          
        ].map((t) => (
          <button
            key={t.key}
            style={
              tab === t.key
                ? button
                : outlineButton
            }
            onClick={() =>
              setTab(
                t.key as TabType
              )
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* FORM */}

      {showForm && (
        <div
          style={{
            ...card,
            marginTop: 20,
            display: "grid",
            gap: 12,
          }}
        >
          {/* Grading System */}

          {tab ===
            "grading_systems" && (
            <>
              <h3
                style={{
                  margin: 0,
                }}
              >
                {editingGradingSystemId
                  ? "Edit Grading System"
                  : "Create Grading System"}
              </h3>

              <input
                style={input}
                placeholder="System Name"
                value={
                  gradingName
                }
                onChange={(e) =>
                  setGradingName(
                    e.target.value
                  )
                }
              />

              <textarea
                style={{
                  ...input,
                  minHeight: 100,
                }}
                placeholder="Description"
                value={
                  gradingDescription
                }
                onChange={(e) =>
                  setGradingDescription(
                    e.target.value
                  )
                }
              />

              <select
                style={input}
                value={
                  gradingType
                }
                onChange={(e) =>
                  setGradingType(
                    e.target
                      .value as any
                  )
                }
              >
                <option value="percentage">
                  Percentage
                </option>

                <option value="gpa">
                  GPA
                </option>

                <option value="competency">
                  Competency
                </option>

                <option value="custom">
                  Custom
                </option>
              </select>

              <button
                style={button}
                onClick={
                  saveGradingSystem
                }
              >
                {editingGradingSystemId
                  ? "Update"
                  : "Save"}
              </button>
            </>
          )}

          {/* GRADE RULE */}

          {tab ===
            "grade_rules" && (
            <>
              <h3
                style={{
                  margin: 0,
                }}
              >
                {editingGradeRuleId
                  ? "Edit Grade Rule"
                  : "Create Grade Rule"}
              </h3>

              <select
                style={input}
                value={
                  selectedGradingSystemId
                }
                onChange={(e) =>
                  setSelectedGradingSystemId(
                    Number(
                      e.target
                        .value
                    )
                  )
                }
              >
                <option value="">
                  Select Grading
                  System
                </option>

                {gradingSystems.map(
                  (g) => (
                    <option
                      key={g.id}
                      value={g.id}
                    >
                      {g.name}
                    </option>
                  )
                )}
              </select>

              <input
                style={input}
                placeholder="Minimum Score"
                value={minScore}
                onChange={(e) =>
                  setMinScore(
                    e.target.value
                  )
                }
              />

              <input
                style={input}
                placeholder="Maximum Score"
                value={maxScore}
                onChange={(e) =>
                  setMaxScore(
                    e.target.value
                  )
                }
              />

              <input
                style={input}
                placeholder="Grade"
                value={grade}
                onChange={(e) =>
                  setGrade(
                    e.target.value
                  )
                }
              />

              <input
                style={input}
                placeholder="Remark"
                value={remark}
                onChange={(e) =>
                  setRemark(
                    e.target.value
                  )
                }
              />

              <input
                style={input}
                placeholder="GPA"
                value={gpa}
                onChange={(e) =>
                  setGpa(
                    e.target.value
                  )
                }
              />

              <button
                style={button}
                onClick={
                  saveGradeRule
                }
              >
                {editingGradeRuleId
                  ? "Update"
                  : "Save"}
              </button>
            </>
          )}

          {/* STRUCTURES */}

          {tab ===
            "assessment_structures" && (
            <>
              <h3
                style={{
                  margin: 0,
                }}
              >
                {editingStructureId
                  ? "Edit Assessment Structure"
                  : "Create Assessment Structure"}
              </h3>

              <input
                style={input}
                placeholder="Structure Name"
                value={
                  structureName
                }
                onChange={(e) =>
                  setStructureName(
                    e.target.value
                  )
                }
              />

              <textarea
                style={{
                  ...input,
                  minHeight: 100,
                }}
                placeholder="Description"
                value={
                  structureDescription
                }
                onChange={(e) =>
                  setStructureDescription(
                    e.target.value
                  )
                }
              />

              <input
                style={input}
                placeholder="Total Score"
                value={
                  structureTotal
                }
                onChange={(e) =>
                  setStructureTotal(
                    e.target.value
                  )
                }
              />

              <button
                style={button}
                onClick={
                  saveStructure
                }
              >
                {editingStructureId
                  ? "Update"
                  : "Save"}
              </button>
            </>
          )}

          {/* ITEMS */}

          {tab ===
            "assessment_items" && (
            <>
              <h3
                style={{
                  margin: 0,
                }}
              >
                {editingItemId
                  ? "Edit Assessment Item"
                  : "Create Assessment Item"}
              </h3>

              <select
                style={input}
                value={assessmentStructureId}
                onChange={(e) =>
                  setAssessmentStructureId(
                    Number(e.target.value)
                  )
                }
              >
                <option value="">
                  Select Assessment Structure
                </option>

                {assessmentStructures.map((s) => (
                  <option
                    key={s.id}
                    value={s.id}
                  >
                    {s.name}
                  </option>
                ))}
              </select>

              <input
                style={input}
                placeholder="Item Name"
                value={itemName}
                onChange={(e) =>
                  setItemName(
                    e.target.value
                  )
                }
              />

              <input
                style={input}
                placeholder="Weight %"
                value={itemWeight}
                onChange={(e) =>
                  setItemWeight(
                    e.target.value
                  )
                }
              />

              <input
                style={input}
                placeholder="Maximum Score"
                value={
                  itemMaxScore
                }
                onChange={(e) =>
                  setItemMaxScore(
                    e.target.value
                  )
                }
              />

              <button
                style={button}
                onClick={saveItem}
              >
                {editingItemId
                  ? "Update"
                  : "Save"}
              </button>
            </>
          )}

          {/**ACADEMIC STRUCTURES */}
          {tab ===
            "academic_structures" && (
            <>
              <h3
                style={{
                  margin: 0,
                }}
              >
                {editingAcademicStructureId
                  ? "Edit Academic Structure"
                  : "Create Academic Structure"}
              </h3>

              <input
                style={input}
                placeholder="Structure Name"
                value={
                  academicStructureName
                }
                onChange={(e) =>
                  setAcademicStructureName(
                    e.target.value
                  )
                }
              />

              <input
                style={input}
                placeholder="Level"
                value={
                  academicStructureLevel
                }
                onChange={(e) =>
                  setAcademicStructureLevel(
                    e.target.value
                  )
                }
              />

              <input
                type="date"
                style={input}
                value={
                  academicStructureStartDate
                }
                onChange={(e) =>
                  setAcademicStructureStartDate(
                    e.target.value
                  )
                }
              />

              <input
                type="date"
                style={input}
                value={
                  academicStructureEndDate
                }
                onChange={(e) =>
                  setAcademicStructureEndDate(
                    e.target.value
                  )
                }
              />

              <button
                style={button}
                onClick={
                  saveAcademicStructure
                }
              >
                {editingAcademicStructureId
                  ? "Update"
                  : "Save"}
              </button>
            </>
          )}
                    {/* ACADEMIC PERIODS */}

          {tab ===
            "academic_periods" && (
            <>
              <h3
                style={{
                  margin: 0,
                }}
              >
                {editingPeriodId
                  ? "Edit Academic Period"
                  : "Create Academic Period"}
              </h3>

              <select
                style={input}
                value={
                  academicStructureId
                }
                onChange={(e) =>
                  setAcademicStructureId(
                    Number(
                      e.target
                        .value
                    )
                  )
                }
              >
                <option value="">
                  Select Academic
                  Structure
                </option>

                {academicStructures.map(
                  (s) => (
                    <option
                      key={s.id}
                      value={s.id}
                    >
                      {s.name}
                    </option>
                  )
                )}
              </select>

              <input
                style={input}
                placeholder="Period Name"
                value={periodName}
                onChange={(e) =>
                  setPeriodName(
                    e.target.value
                  )
                }
              />

              <input
                style={input}
                placeholder="Type"
                value={periodType}
                onChange={(e) =>
                  setPeriodType(
                    e.target.value
                  )
                }
              />

              <input
                type="date"
                style={input}
                value={
                  periodStartDate
                }
                onChange={(e) =>
                  setPeriodStartDate(
                    e.target.value
                  )
                }
              />

              <input
                type="date"
                style={input}
                value={
                  periodEndDate
                }
                onChange={(e) =>
                  setPeriodEndDate(
                    e.target.value
                  )
                }
              />

              <input
                style={input}
                placeholder="Order"
                value={periodOrder}
                onChange={(e) =>
                  setPeriodOrder(
                    e.target.value
                  )
                }
              />

              <button
                style={button}
                onClick={
                  saveAcademicPeriod
                }
              >
                {editingPeriodId
                  ? "Update"
                  : "Save"}
              </button>
            </>
          )}
        </div>
      )}

      {/* CONTENT */}

      <div
        style={{
          display: "grid",
          gap: 14,
          marginTop: 20,
        }}
      >
        {/* GRADING SYSTEMS */}

        {tab ===
          "grading_systems" &&
          filteredSystems.map((g) => {
            const rules =
              gradeRules.filter(
                (r) =>
                  r.gradingSystemId ===
                  g.id
              );

            const expanded =
              expandedSystems.includes(
                g.id || 0
              );

            return (
              <div
                key={g.id}
                style={card}
              >
                <div
                  onClick={() =>
                    toggleSystem(
                      g.id
                    )
                  }
                  style={{
                    cursor:
                      "pointer",
                  }}
                >
                  <div
                    style={{
                      display:
                        "flex",
                      justifyContent:
                        "space-between",
                      gap: 16,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                        }}
                      >
                        {g.name}
                      </div>

                      <div
                        style={{
                          marginTop: 6,
                          opacity: 0.7,
                        }}
                      >
                        {
                          g.description
                        }
                      </div>

                      <div
                        style={{
                          marginTop: 10,
                          display:
                            "flex",
                          gap: 8,
                          flexWrap:
                            "wrap",
                        }}
                      >
                        <div
                          style={
                            badge
                          }
                        >
                          {g.type}
                        </div>

                        <div
                          style={
                            badge
                          }
                        >
                          {
                            rules.length
                          }{" "}
                          Rules
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 24,
                      }}
                    >
                      {expanded
                        ? "−"
                        : "+"}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginTop: 14,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    style={
                      outlineButton
                    }
                    onClick={() =>
                      editGradingSystem(
                        g
                      )
                    }
                  >
                    Edit
                  </button>

                  <button
                    style={
                      dangerButton
                    }
                    onClick={() =>
                      deleteGradingSystem(
                        g.id
                      )
                    }
                  >
                    Delete
                  </button>
                </div>

                {expanded && (
                  <div
                    style={{
                      marginTop: 18,
                      display:
                        "grid",
                      gap: 10,
                    }}
                  >
                    {rules.length ===
                      0 && (
                      <div
                        style={{
                          opacity: 0.6,
                        }}
                      >
                        No rules
                        mapped.
                      </div>
                    )}

                    {rules.map(
                      (r) => (
                        <div
                          key={
                            r.id
                          }
                          style={{
                            padding: 14,
                            borderRadius: 14,
                            background:
                              "rgba(0,0,0,0.04)",
                          }}
                        >
                          <div
                            style={{
                              display:
                                "flex",
                              justifyContent:
                                "space-between",
                              gap: 20,
                              flexWrap:
                                "wrap",
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontWeight: 700,
                                  fontSize: 18,
                                }}
                              >
                                {
                                  r.grade
                                }
                              </div>

                              <div
                                style={{
                                  opacity: 0.7,
                                  marginTop: 4,
                                }}
                              >
                                {
                                  r.minScore
                                }
                                % -{" "}
                                {
                                  r.maxScore
                                }
                                %
                              </div>
                            </div>

                            <div
                              style={{
                                textAlign:
                                  "right",
                              }}
                            >
                              <div>
                                GPA:{" "}
                                {
                                  r.gpa
                                }
                              </div>

                              <div
                                style={{
                                  opacity: 0.7,
                                  fontSize: 13,
                                }}
                              >
                                {
                                  r.remark
                                }
                              </div>
                            </div>
                          </div>

                          <div
                            style={{
                              display:
                                "flex",
                              gap: 10,
                              marginTop: 12,
                            }}
                          >
                            <button
                              style={
                                outlineButton
                              }
                              onClick={() =>
                                editGradeRule(
                                  r
                                )
                              }
                            >
                              Edit
                            </button>

                            <button
                              style={
                                dangerButton
                              }
                              onClick={() =>
                                deleteGradeRule(
                                  r.id
                                )
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}

        {/* STRUCTURES */}

        {tab ===
          "assessment_structures" &&
          filteredStructures.map(
            (s) => {
              const items =
                assessmentItems.filter(
                  (x) =>
                    x.assessmentStructureId ===
                    s.id
                );

              const expanded =
                expandedStructures.includes(
                  s.id || 0
                );

              const usedWeight =
                items.reduce(
                  (
                    sum,
                    item
                  ) =>
                    sum +
                    Number(
                      item.weight ||
                        0
                    ),
                  0
                );

              return (
                <div
                  key={s.id}
                  style={card}
                >
                  <div
                    onClick={() =>
                      toggleStructure(
                        s.id
                      )
                    }
                    style={{
                      cursor:
                        "pointer",
                    }}
                  >
                    <div
                      style={{
                        display:
                          "flex",
                        justifyContent:
                          "space-between",
                        gap: 16,
                        flexWrap:
                          "wrap",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 20,
                          }}
                        >
                          {s.name}
                        </div>

                        <div
                          style={{
                            opacity: 0.7,
                            marginTop: 5,
                          }}
                        >
                          {
                            s.description
                          }
                        </div>

                        <div
                          style={{
                            display:
                              "flex",
                            gap: 8,
                            flexWrap:
                              "wrap",
                            marginTop: 10,
                          }}
                        >
                          <div
                            style={
                              badge
                            }
                          >
                            {
                              items.length
                            }{" "}
                            Items
                          </div>

                          <div
                            style={
                              badge
                            }
                          >
                            Weight:{" "}
                            {
                              usedWeight
                            }
                            %
                          </div>

                          <div
                            style={
                              badge
                            }
                          >
                            Total:{" "}
                            {
                              s.totalScore
                            }
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: 24,
                        }}
                      >
                        {expanded
                          ? "−"
                          : "+"}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      marginTop: 14,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      style={
                        outlineButton
                      }
                      onClick={() =>
                        editStructure(
                          s
                        )
                      }
                    >
                      Edit
                    </button>

                    <button
                      style={
                        dangerButton
                      }
                      onClick={() =>
                        deleteStructure(
                          s.id
                        )
                      }
                    >
                      Delete
                    </button>
                  </div>

                  {expanded && (
                    <div
                      style={{
                        marginTop: 18,
                        display:
                          "grid",
                        gap: 10,
                      }}
                    >
                      {items.length ===
                        0 && (
                        <div
                          style={{
                            opacity: 0.6,
                          }}
                        >
                          No assessment
                          items mapped.
                        </div>
                      )}

                      {items.map(
                        (
                          item
                        ) => (
                          <div
                            key={
                              item.id
                            }
                            style={{
                              padding: 14,
                              borderRadius: 14,
                              background:
                                "rgba(0,0,0,0.04)",
                            }}
                          >
                            <div
                              style={{
                                display:
                                  "flex",
                                justifyContent:
                                  "space-between",
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    fontWeight: 700,
                                    fontSize: 17,
                                  }}
                                >
                                  {
                                    item.name
                                  }
                                </div>

                                <div
                                  style={{
                                    marginTop: 4,
                                    opacity: 0.7,
                                  }}
                                >
                                  Max
                                  Score:{" "}
                                  {
                                    item.maxScore
                                  }
                                </div>
                              </div>

                              <div
                                style={{
                                  textAlign:
                                    "right",
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: 700,
                                    fontSize: 20,
                                  }}
                                >
                                  {
                                    item.weight
                                  }
                                  %
                                </div>
                              </div>
                            </div>

                            <div
                              style={{
                                display:
                                  "flex",
                                gap: 10,
                                marginTop: 12,
                              }}
                            >
                              <button
                                style={
                                  outlineButton
                                }
                                onClick={() =>
                                  editItem(
                                    item
                                  )
                                }
                              >
                                Edit
                              </button>

                              <button
                                style={
                                  dangerButton
                                }
                                onClick={() =>
                                  deleteItem(
                                    item.id
                                  )
                                }
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            }
          )}

        {/* GRADE RULES */}

        {tab ===
          "grade_rules" &&
          gradeRules.map((r) => {
            const system =
              gradingSystems.find(
                (g) =>
                  g.id ===
                  r.gradingSystemId
              );

            return (
              <div
                key={r.id}
                style={card}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    gap: 14,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 20,
                      }}
                    >
                      {r.grade}
                    </div>

                    <div
                      style={{
                        opacity: 0.7,
                        marginTop: 5,
                      }}
                    >
                      {r.minScore}% -{" "}
                      {r.maxScore}%
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                      }}
                    >
                      <span
                        style={
                          badge
                        }
                      >
                        {system?.name}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      textAlign: "right",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 700,
                      }}
                    >
                      {r.gpa}
                    </div>

                    <div
                      style={{
                        opacity: 0.7,
                        marginTop: 4,
                      }}
                    >
                      {r.remark}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginTop: 14,
                  }}
                >
                  <button
                    style={
                      outlineButton
                    }
                    onClick={() =>
                      editGradeRule(
                        r
                      )
                    }
                  >
                    Edit
                  </button>

                  <button
                    style={
                      dangerButton
                    }
                    onClick={() =>
                      deleteGradeRule(
                        r.id
                      )
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}

        {/* ITEMS */}

        {tab ===
          "assessment_items" &&
          assessmentItems.map(
            (item) => {
              const structure =
                assessmentStructures.find(
                  (x) =>
                    x.id ===
                    item.assessmentStructureId
                );

              return (
                <div
                  key={item.id}
                  style={card}
                >
                  <div
                    style={{
                      display:
                        "flex",
                      justifyContent:
                        "space-between",
                      gap: 14,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 20,
                        }}
                      >
                        {item.name}
                      </div>

                      <div
                        style={{
                          opacity: 0.7,
                          marginTop: 5,
                        }}
                      >
                        Structure:{" "}
                        {
                          structure?.name
                        }
                      </div>

                      <div
                        style={{
                          marginTop: 10,
                        }}
                      >
                        <span
                          style={
                            badge
                          }
                        >
                          Max Score:{" "}
                          {
                            item.maxScore
                          }
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        textAlign:
                          "right",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 28,
                        }}
                      >
                        {
                          item.weight
                        }
                        %
                      </div>

                      <div
                        style={{
                          opacity: 0.7,
                          fontSize: 13,
                        }}
                      >
                        Weight
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      marginTop: 14,
                    }}
                  >
                    <button
                      style={
                        outlineButton
                      }
                      onClick={() =>
                        editItem(
                          item
                        )
                      }
                    >
                      Edit
                    </button>

                    <button
                      style={
                        dangerButton
                      }
                      onClick={() =>
                        deleteItem(
                          item.id
                        )
                      }
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            }
          )}
        {/* ACADEMIC STRUCTURES */}
        {tab ===
          "academic_structures" &&
          academicStructures.map(
            (structure) => {
              const periods =
                academicPeriods.filter(
                  (p) =>
                    p.academicStructureId ===
                    structure.id
                );

              return (
                <div
                  key={structure.id}
                  style={card}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      gap: 14,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 20,
                        }}
                      >
                        {structure.name}
                      </div>

                      <div
                        style={{
                          opacity: 0.7,
                          marginTop: 5,
                        }}
                      >
                        Level:{" "}
                        {structure.level}
                      </div>

                      <div
                        style={{
                          marginTop: 10,
                          display: "flex",
                          gap: 8,
                          flexWrap:
                            "wrap",
                        }}
                      >
                        <div style={badge}>
                          {
                            periods.length
                          }{" "}
                          Periods
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        textAlign: "right",
                      }}
                    >
                      <div>
                        {
                          structure.startDate
                        }
                      </div>

                      <div
                        style={{
                          opacity: 0.7,
                          marginTop: 4,
                        }}
                      >
                        {
                          structure.endDate
                        }
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      marginTop: 14,
                    }}
                  >
                    <button
                      style={
                        outlineButton
                      }
                      onClick={() =>
                        editAcademicStructure(
                          structure
                        )
                      }
                    >
                      Edit
                    </button>

                    <button
                      style={
                        dangerButton
                      }
                      onClick={() =>
                        deleteAcademicStructure(
                          structure.id
                        )
                      }
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            }
          )}

        {/* ACADEMIC PERIODS */}

        {tab ===
          "academic_periods" &&
          academicPeriods.map(
            (period) => {
              const structure =
                academicStructures.find(
                  (x) =>
                    x.id ===
                    period.academicStructureId
                );

              return (
                <div
                  key={period.id}
                  style={card}
                >
                  <div
                    style={{
                      display:
                        "flex",
                      justifyContent:
                        "space-between",
                      gap: 14,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 20,
                        }}
                      >
                        {
                          period.name
                        }
                      </div>

                      <div
                        style={{
                          opacity: 0.7,
                          marginTop: 5,
                        }}
                      >
                        Structure:{" "}
                        {
                          structure?.name
                        }
                      </div>

                      <div
                        style={{
                          marginTop: 10,
                          display:
                            "flex",
                          gap: 8,
                          flexWrap:
                            "wrap",
                        }}
                      >
                        <div
                          style={
                            badge
                          }
                        >
                          {
                            period.type
                          }
                        </div>

                        <div
                          style={
                            badge
                          }
                        >
                          Order:{" "}
                          {
                            period.order
                          }
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        textAlign:
                          "right",
                      }}
                    >
                      <div>
                        {
                          period.startDate
                        }
                      </div>

                      <div
                        style={{
                          opacity: 0.7,
                          marginTop: 4,
                        }}
                      >
                        {
                          period.endDate
                        }
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      marginTop: 14,
                    }}
                  >
                    <button
                      style={
                        outlineButton
                      }
                      onClick={() =>
                        editPeriod(
                          period
                        )
                      }
                    >
                      Edit
                    </button>

                    <button
                      style={
                        dangerButton
                      }
                      onClick={() =>
                        deletePeriod(
                          period.id
                        )
                      }
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            }
          )}
      </div>
    </div>
  );
}