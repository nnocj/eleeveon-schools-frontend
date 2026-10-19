"use client";

/**
 * app/branch-admin/modules/Assessmentstructure.tsx
 * --------------------------------------------------------------------------
 * Eleeveon Assessment System Tree Editor.
 *
 * - branch-scoped and offline-first;
 * - old flat structures remain valid root-item trees;
 * - tree navigation/validation comes from app/lib/assessments;
 * - subtree mutation commands are transaction-backed;
 * - drag-and-drop can be added later by calling the same movement commands.
 * V36: shared Setup toolbar, 900px responsive records, viewport dialogs,
 *      compact Students-style textures, tree mutations unchanged.
 */

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useRegisterBranchWorkspaceToolbar } from "../../components/role-portals/shell/BranchWorkspaceToolbar";
import BranchViewportPortal from "../../components/role-portals/shell/BranchViewportPortal";

import {
  db,
  type AcademicStructure,
  type AssessmentEntry,
  type AssessmentStructure,
  type AssessmentStructureItem,
  type Organization,
} from "../../lib/db/db";
import {
  createLocal,
  listActiveLocal,
  updateLocal,
} from "../../lib/sync/syncUtils";
import {
  buildAssessmentTree,
  validateAssessmentTree,
  type AssessmentTreeNode,
} from "../../lib/assessments";
import {
  createChildItem,
  createRootItem,
  deleteAssessmentStructureTree,
  deleteItemSubtree,
  indentItem,
  moveItemAfter,
  moveItemBefore,
  moveItemToParent,
  outdentItem,
} from "../../lib/assessments/assessmentTreeMutations";

import {
  useBranchWorkspaceScope,
} from "../../hooks/useBranchWorkspaceScope";
import {
  useBranchTableRevision,
} from "../../hooks/useBranchTableRevision";

import {
  AssessmentItemEditorSheet,
} from "./assessments/AssessmentItemEditorSheet";
import {
  AssessmentStructureEditorSheet,
} from "./assessments/AssessmentStructureEditorSheet";
import {
  AssessmentTreeEditor,
} from "./assessments/AssessmentTreeEditor";
import {
  AssessmentTreePreview,
} from "./assessments/AssessmentTreePreview";
import {
  AssessmentValidationPanel,
} from "./assessments/AssessmentValidationPanel";
import type {
  AssessmentItemDraft,
  AssessmentStructureDraft,
  AssessmentTreeEditorModel,
  ToastTone,
} from "./assessments/assessment-editor.types";

type ViewMode =
  | "editor"
  | "preview"
  | "validation";

type StatusFilter =
  | "all"
  | "active"
  | "inactive";

const emptyStructureDraft =
  (): AssessmentStructureDraft => ({
    organizationId: "",
    academicStructureId: "",
    name: "",
    description: "",
    totalScore: "100",
    active: true,
    locked: false,
  });

const emptyItemDraft = (
  assessmentStructureId = "",
  parentItemId = "",
): AssessmentItemDraft => ({
  assessmentStructureId,
  parentItemId,
  name: "",
  itemType: "scored_item",
  entryMode: "direct",
  aggregationMode: "sum",
  maxScore: "100",
  weight: "0",
  contributionWeight: "0",
  bestNCount: "",
  calculationPrecision: "2",
  normalizeChildrenToParentWeight: true,
  minimumRequiredChildren: "",
  order: "1",
  compulsory: true,
  allowChildEntry: false,
  allowManualOverride: false,
  showParentOnReport: true,
  showChildrenOnReport: false,
  reportVisibility: "show",
  active: true,
});

function idOf(value: unknown): string {
  return value == null
    ? ""
    : String(value).trim();
}

function activeRow(row: {
  isDeleted?: boolean;
  active?: boolean;
}) {
  return (
    row.isDeleted !== true &&
    row.active !== false
  );
}

/**
 * Root items contribute directly to the assessment-system total.
 * Keep the compatibility contribution field aligned during validation so
 * older validation logic cannot treat a valid root weight as zero.
 */
function itemsForValidation(
  items: AssessmentStructureItem[],
): AssessmentStructureItem[] {
  return items.map((item) => {
    if (idOf(item.parentItemId)) {
      return item;
    }

    const rootWeight = Math.max(
      0,
      Number(item.weight ?? 0),
    );

    return {
      ...item,
      contributionWeight: rootWeight,
    };
  });
}

function sameTenant(
  row: {
    accountId?: string | null;
    schoolId?: string | null;
    branchId?: string | null;
  },
  scope: {
    accountId: string;
    schoolId: string;
    branchId: string;
  },
) {
  return (
    row.accountId === scope.accountId &&
    row.schoolId === scope.schoolId &&
    row.branchId === scope.branchId
  );
}

export default function AssessmentSystems() {
  const router = useRouter();
  const workspace =
    useBranchWorkspaceScope();
  const revision =
    useBranchTableRevision([
      "assessmentStructures",
      "assessmentStructureItems",
      "assessmentEntries",
      "academicStructures",
      "organizations",
    ]);

  const {
    accountId,
    schoolId,
    branchId,
    authenticated,
    restoring,
    branchLoading,
    ready,
    error: workspaceError,
  } = workspace;

  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);

  const [structures, setStructures] =
    useState<AssessmentStructure[]>([]);
  const [items, setItems] = useState<
    AssessmentStructureItem[]
  >([]);
  const [entries, setEntries] =
    useState<AssessmentEntry[]>([]);
  const [
    academicStructures,
    setAcademicStructures,
  ] = useState<AcademicStructure[]>(
    [],
  );
  const [
    organizations,
    setOrganizations,
  ] = useState<Organization[]>([]);

  const [
    selectedStructureId,
    setSelectedStructureId,
  ] = useState("");
  const [search, setSearch] =
    useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("active");
  const [viewMode, setViewMode] =
    useState<ViewMode>("editor");
  const [structureListView, setStructureListView] = useState<"cards" | "table">("cards");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setStructureListView(window.matchMedia("(min-width: 900px)").matches ? "table" : "cards");
  }, []);


  const [
    structureSheetOpen,
    setStructureSheetOpen,
  ] = useState(false);
  const [structureDraft, setStructureDraft] =
    useState<AssessmentStructureDraft>(
      emptyStructureDraft(),
    );

  const [itemSheetOpen, setItemSheetOpen] =
    useState(false);
  const [itemDraft, setItemDraft] =
    useState<AssessmentItemDraft>(
      emptyItemDraft(),
    );

  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);

  const scope = useMemo(() => {
    if (
      !accountId ||
      !schoolId ||
      !branchId
    ) {
      return null;
    }

    return {
      accountId,
      schoolId,
      branchId,
    };
  }, [
    accountId,
    schoolId,
    branchId,
  ]);

  const showToast = (
    tone: ToastTone,
    message: string,
  ) => {
    setToast({ tone, message });

    window.setTimeout(() => {
      setToast((current) =>
        current?.message === message
          ? null
          : current,
      );
    }, 4200);
  };

  useEffect(() => {
    if (
      restoring ||
      branchLoading
    ) {
      return;
    }

    if (
      !authenticated ||
      !accountId
    ) {
      router.replace("/login");
    }
  }, [
    restoring,
    branchLoading,
    authenticated,
    accountId,
    router,
  ]);

  const load = async () => {
    if (!scope || !ready) {
      setStructures([]);
      setItems([]);
      setEntries([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        structureRows,
        itemRows,
        entryRows,
        academicRows,
        organizationRows,
      ] = await Promise.all([
        db.assessmentStructures.toArray(),
        db.assessmentStructureItems.toArray(),
        db.assessmentEntries.toArray(),
        listActiveLocal(
          "academicStructures",
          scope,
        ),
        listActiveLocal(
          "organizations",
          scope,
        ),
      ]);

      const nextStructures =
        structureRows
          .filter(
            (row) =>
              sameTenant(row, scope) &&
              row.isDeleted !== true,
          )
          .sort((left, right) =>
            left.name.localeCompare(
              right.name,
            ),
          );

      setStructures(nextStructures);
      setItems(
        itemRows
          .filter(
            (row) =>
              sameTenant(row, scope) &&
              row.isDeleted !== true,
          )
          .sort(
            (left, right) =>
              Number(left.order || 0) -
              Number(right.order || 0),
          ),
      );
      setEntries(
        entryRows.filter(
          (row) =>
            sameTenant(row, scope) &&
            row.isDeleted !== true,
        ),
      );
      setAcademicStructures(
        (
          academicRows as AcademicStructure[]
        ).sort((left, right) =>
          left.name.localeCompare(
            right.name,
          ),
        ),
      );
      setOrganizations(
        (
          organizationRows as Organization[]
        ).sort((left, right) =>
          left.name.localeCompare(
            right.name,
          ),
        ),
      );

      setSelectedStructureId(
        (current) =>
          nextStructures.some(
            (row) =>
              idOf(row.id) === current,
          )
            ? current
            : idOf(
                nextStructures[0]?.id,
              ),
      );
    } catch (error) {
      console.error(
        "Failed to load assessment hierarchy:",
        error,
      );
      showToast(
        "error",
        "Failed to load assessment systems.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready,
    accountId,
    schoolId,
    branchId,
    revision,
  ]);

  const entryCountByStructure =
    useMemo(() => {
      const map = new Map<
        string,
        number
      >();

      for (const entry of entries) {
        const structureId = idOf(
          entry.assessmentStructureId,
        );

        if (!structureId) continue;

        map.set(
          structureId,
          (map.get(structureId) ||
            0) + 1,
        );
      }

      return map;
    }, [entries]);

  const models = useMemo<
    AssessmentTreeEditorModel[]
  >(() => {
    return structures.map(
      (structure) => {
        const structureId =
          idOf(structure.id);
        const structureItems =
          items.filter(
            (item) =>
              idOf(
                item.assessmentStructureId,
              ) === structureId,
          );
        const tree =
          buildAssessmentTree(
            structureItems,
          );
        const issues =
          validateAssessmentTree(
            itemsForValidation(
              structureItems,
            ),
            structure,
          );

        return {
          structure,
          items: structureItems,
          tree,
          issues,
          entryCount:
            entryCountByStructure.get(
              structureId,
            ) || 0,
        };
      },
    );
  }, [
    structures,
    items,
    entryCountByStructure,
  ]);

  const filteredModels = useMemo(() => {
    const term =
      search.trim().toLowerCase();

    return models.filter((model) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active"
          ? activeRow(model.structure)
          : !activeRow(
              model.structure,
            ));

      if (!matchesStatus) {
        return false;
      }

      if (!term) return true;

      const itemNames =
        model.items
          .map((item) => item.name)
          .join(" ");

      return `${model.structure.name} ${model.structure.description ?? ""} ${itemNames}`
        .toLowerCase()
        .includes(term);
    });
  }, [
    models,
    search,
    statusFilter,
  ]);

  const selectedModel = useMemo(
    () =>
      filteredModels.find(
        (model) =>
          idOf(model.structure.id) ===
          selectedStructureId,
      ) ??
      models.find(
        (model) =>
          idOf(model.structure.id) ===
          selectedStructureId,
      ) ??
      filteredModels[0] ??
      models[0] ??
      null,
    [
      filteredModels,
      models,
      selectedStructureId,
    ],
  );

  const requireScope = () => {
    if (!scope) {
      showToast(
        "error",
        "Select a school branch first.",
      );
      return null;
    }

    return scope;
  };

  const openNewStructure = () => {
    if (!requireScope()) return;

    setStructureDraft(
      emptyStructureDraft(),
    );
    setStructureSheetOpen(true);
  };

  const openEditStructure = (
    structure: AssessmentStructure,
  ) => {
    setStructureDraft({
      id: idOf(structure.id),
      organizationId:
        idOf(
          structure.organizationId,
        ),
      academicStructureId:
        idOf(
          structure.academicStructureId,
        ),
      name: structure.name,
      description:
        structure.description ?? "",
      totalScore: String(
        structure.totalScore ?? 100,
      ),
      active:
        structure.active !== false,
      locked:
        structure.locked === true,
    });
    setStructureSheetOpen(true);
  };

  const saveStructure = async () => {
    const currentScope =
      requireScope();

    if (!currentScope) return;

    if (
      !structureDraft.name.trim() ||
      !structureDraft
        .academicStructureId
    ) {
      showToast(
        "error",
        "Name and academic structure are required.",
      );
      return;
    }

    try {
      setSaving(true);

      const payload = {
        ...currentScope,
        organizationId:
          structureDraft
            .organizationId ||
          undefined,
        academicStructureId:
          structureDraft
            .academicStructureId,
        name:
          structureDraft.name.trim(),
        description:
          structureDraft.description
            .trim() || undefined,
        totalScore: Math.max(
          1,
          Number(
            structureDraft.totalScore,
          ) || 100,
        ),
        active:
          structureDraft.active,
        locked:
          structureDraft.locked,
        isDeleted: false,
      };

      const saved =
        structureDraft.id
          ? await updateLocal(
              "assessmentStructures",
              structureDraft.id,
              payload,
            )
          : await createLocal(
              "assessmentStructures",
              payload as AssessmentStructure,
            );

      const savedId = idOf(
        (saved as AssessmentStructure)
          .id ??
          structureDraft.id,
      );

      setStructureSheetOpen(false);
      setSelectedStructureId(
        savedId,
      );
      showToast(
        "success",
        "Assessment system saved.",
      );
      await load();
    } catch (error) {
      showToast(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to save assessment system.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openNewRootItem = () => {
    const model = selectedModel;

    if (!model) {
      showToast(
        "error",
        "Create or select an assessment system first.",
      );
      return;
    }

    setItemDraft(
      emptyItemDraft(
        idOf(model.structure.id),
      ),
    );
    setItemSheetOpen(true);
  };

  const openNewChildItem = (
    node: AssessmentTreeNode,
  ) => {
    setItemDraft(
      emptyItemDraft(
        idOf(
          node.item
            .assessmentStructureId,
        ),
        idOf(node.item.id),
      ),
    );
    setItemSheetOpen(true);
  };

  const openEditItem = (
    node: AssessmentTreeNode,
  ) => {
    const item = node.item;

    setItemDraft({
      id: idOf(item.id),
      assessmentStructureId:
        idOf(
          item.assessmentStructureId,
        ),
      parentItemId:
        idOf(item.parentItemId),
      name: item.name,
      itemType:
        item.itemType ??
        (node.children.length
          ? "group"
          : "scored_item"),
      entryMode:
        item.entryMode ??
        (node.children.length
          ? "from_children"
          : "direct"),
      aggregationMode:
        item.aggregationMode ??
        "sum",
      maxScore: String(
        item.maxScore ?? 100,
      ),
      weight: String(
        item.weight ?? 0,
      ),
      contributionWeight:
        String(
          item.contributionWeight ??
            item.weight ??
            0,
        ),
      bestNCount:
        item.bestNCount == null
          ? ""
          : String(
              item.bestNCount,
            ),
      calculationPrecision:
        String(
          item.calculationPrecision ?? 2,
        ),
      normalizeChildrenToParentWeight:
        item.normalizeChildrenToParentWeight !== false,
      minimumRequiredChildren:
        item.minimumRequiredChildren == null
          ? ""
          : String(
              item.minimumRequiredChildren,
            ),
      order: String(
        item.order ?? 1,
      ),
      compulsory:
        item.compulsory !== false,
      allowChildEntry:
        item.allowChildEntry === true,
      allowManualOverride:
        item.allowManualOverride ===
        true,
      showParentOnReport:
        item.showParentOnReport !==
        false,
      showChildrenOnReport:
        item.showChildrenOnReport ===
        true,
      reportVisibility:
        item.reportVisibility ??
        "show",
      active:
        item.active !== false,
    });

    setItemSheetOpen(true);
  };

  const saveItem = async () => {
    const currentScope =
      requireScope();

    if (!currentScope) return;

    if (!itemDraft.name.trim()) {
      showToast(
        "error",
        "Assessment item name is required.",
      );
      return;
    }

    try {
      setSaving(true);

      const itemWeight = Math.max(
        0,
        Number(itemDraft.weight) || 0,
      );

      const isRootItem =
        !idOf(itemDraft.parentItemId);

      const contributionWeight =
        isRootItem
          ? itemWeight
          : Math.max(
              0,
              Number(
                itemDraft
                  .contributionWeight,
              ) || itemWeight,
            );

      const common = {
        ...currentScope,
        assessmentStructureId:
          itemDraft.assessmentStructureId,
        name: itemDraft.name.trim(),
        itemType:
          itemDraft.itemType,
        entryMode:
          itemDraft.entryMode,
        aggregationMode:
          itemDraft.aggregationMode,
        maxScore: Math.max(
          0.01,
          Number(itemDraft.maxScore) ||
            100,
        ),
        weight: itemWeight,
        contributionWeight,
        bestNCount:
          itemDraft
            .aggregationMode ===
            "best_n"
            ? Math.max(
                1,
                Number(
                  itemDraft
                    .bestNCount,
                ) || 1,
              )
            : null,
        calculationPrecision:
          Math.min(
            6,
            Math.max(
              0,
              Number(
                itemDraft
                  .calculationPrecision,
              ) || 0,
            ),
          ),
        normalizeChildrenToParentWeight:
          itemDraft
            .normalizeChildrenToParentWeight,
        minimumRequiredChildren:
          itemDraft
            .minimumRequiredChildren
            ? Math.max(
                0,
                Number(
                  itemDraft
                    .minimumRequiredChildren,
                ) || 0,
              )
            : null,
        compulsory:
          itemDraft.compulsory,
        allowChildEntry:
          itemDraft.allowChildEntry,
        allowManualOverride:
          itemDraft
            .allowManualOverride,
        showParentOnReport:
          itemDraft
            .showParentOnReport,
        showChildrenOnReport:
          itemDraft
            .showChildrenOnReport,
        reportVisibility:
          itemDraft.reportVisibility,
        active: itemDraft.active,
        isDeleted: false,
      };

      if (itemDraft.id) {
        const existing =
          await db
            .assessmentStructureItems
            .get(itemDraft.id);

        if (!existing) {
          throw new Error(
            "Assessment item was not found.",
          );
        }

        await updateLocal(
          "assessmentStructureItems",
          itemDraft.id,
          common,
        );

        if (
          idOf(
            existing.parentItemId,
          ) !==
          idOf(
            itemDraft.parentItemId,
          )
        ) {
          await moveItemToParent(
            itemDraft.id,
            itemDraft.parentItemId ||
              null,
          );
        }
      } else if (
        itemDraft.parentItemId
      ) {
        await createChildItem(
          itemDraft.parentItemId,
          common,
        );
      } else {
        await createRootItem(
          common,
        );
      }

      setItemSheetOpen(false);
      showToast(
        "success",
        "Assessment item saved.",
      );
      await load();
    } catch (error) {
      showToast(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to save assessment item.",
      );
    } finally {
      setSaving(false);
    }
  };

  const runMutation = async (
    action: () => Promise<void>,
    message: string,
  ) => {
    try {
      setSaving(true);
      await action();
      showToast(
        "success",
        message,
      );
      await load();
    } catch (error) {
      showToast(
        "error",
        error instanceof Error
          ? error.message
          : "Assessment hierarchy update failed.",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteStructure = async () => {
    if (!selectedModel) return;

    if (
      !window.confirm(
        `Delete "${selectedModel.structure.name}" and all its assessment items?`,
      )
    ) {
      return;
    }

    try {
      setSaving(true);

      await deleteAssessmentStructureTree(
        idOf(
          selectedModel.structure.id,
        ),
      );

      setSelectedStructureId("");
      showToast(
        "success",
        "Assessment system deleted.",
      );
      await load();
    } catch (error) {
      showToast(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to delete assessment system.",
      );
    } finally {
      setSaving(false);
    }
  };

  // Shared Setup toolbar owns Add/Search/Filter/More; the tree retains its
  // independent edit, preview and validation controls.
  useRegisterBranchWorkspaceToolbar("setupWorkspace", {
    add: openNewStructure,
    search: setSearch,
    filter: () => setFilterOpen(true),
    more: () => setMoreOpen(true),
  });
  useRegisterBranchWorkspaceToolbar("assessmentSystems", {
    add: openNewStructure,
    search: setSearch,
    filter: () => setFilterOpen(true),
    more: () => setMoreOpen(true),
  });

  if (
    restoring ||
    branchLoading ||
    loading
  ) {
    return (
      <section className="ae-page">
        <div className="ae-empty">
          Loading assessment hierarchy…
        </div>
        <EditorStyles />
      </section>
    );
  }

  if (workspaceError || !scope) {
    return (
      <section className="ae-page">
        <div className="ae-empty">
          <strong>
            Assessment workspace unavailable
          </strong>
          <p>
            {workspaceError ??
              "Select a valid school branch."}
          </p>
        </div>
        <EditorStyles />
      </section>
    );
  }

  return (
    <section className="ae-page">


      <div className="ae-layout">
        <aside className="ae-structures">
          <div className="ae-section-title">
            <span>
              Systems (
              {filteredModels.length})
            </span>
          </div>

          {structureListView === "table" ? (
            <div className="ae-table-wrap" role="region" aria-label="Assessment systems table">
              <table>
                <thead><tr><th>Systems ({filteredModels.length})</th><th>Items</th><th>Issues</th></tr></thead>
                <tbody>{filteredModels.map(model => {
                  const sid=idOf(model.structure.id);
                  const errors=model.issues.filter(issue=>issue.severity === "error").length;
                  return <tr key={sid} className={sid === idOf(selectedModel?.structure.id) ? "selected" : ""}>
                    <td><button type="button" className="ae-table-choice" aria-pressed={sid===idOf(selectedModel?.structure.id)} onClick={()=>setSelectedStructureId(sid)}>{model.structure.name}</button></td>
                    <td>{model.items.length}</td>
                    <td>{errors ? `${errors} errors` : "Ready"}</td>
                  </tr>;
                })}</tbody>
              </table>
              {!filteredModels.length && <div className="ae-empty compact">No matching structures.</div>}
            </div>
          ) : (
          <div className="ae-structure-list">
          {filteredModels.length ? (
            filteredModels.map(
              (model) => {
                const id = idOf(
                  model.structure.id,
                );
                const errors =
                  model.issues.filter(
                    (issue) =>
                      issue.severity ===
                      "error",
                  ).length;

                return (
                  <button
                    type="button"
                    key={id}
                    className={`ae-structure-card ${
                      selectedModel &&
                      idOf(
                        selectedModel
                          .structure.id,
                      ) === id
                        ? "selected"
                        : ""
                    }`}
                    onClick={() =>
                      setSelectedStructureId(
                        id,
                      )
                    }
                  >
                    <strong>
                      {
                        model.structure
                          .name
                      }
                    </strong>
                    <span>
                      {model.items.length}{" "}
                      items ·{" "}
                      {
                        model.entryCount
                      }{" "}
                      entries
                    </span>
                    <small>
                      {errors
                        ? `${errors} errors`
                        : "Ready for review"}
                    </small>
                  </button>
                );
              },
            )
          ) : (
            <div className="ae-empty compact">
              No matching structures.
            </div>
          )}
          </div>
          )}
        </aside>

        <main className="ae-workspace">
          {selectedModel ? (
            <>
              <header className="ae-workspace-header">
                <div>
                  <small>
                    Assessment system
                  </small>
                  <h2>
                    {
                      selectedModel
                        .structure.name
                    }
                  </h2>
                  <p>
                    {
                      selectedModel
                        .items.length
                    }{" "}
                    items · Total{" "}
                    {Number(
                      selectedModel
                        .structure
                        .totalScore ??
                        100,
                    )}
                  </p>
                </div>

                <div className="ae-actions">
                  <button
                    type="button"
                    onClick={() =>
                      openEditStructure(
                        selectedModel
                          .structure,
                      )
                    }
                  >
                    Edit structure
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={
                      openNewRootItem
                    }
                  >
                    + Root item
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() =>
                      void deleteStructure()
                    }
                  >
                    Delete
                  </button>
                </div>
              </header>

              <nav className="ae-tabs">
                {(
                  [
                    "editor",
                    "preview",
                    "validation",
                  ] as ViewMode[]
                ).map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    className={
                      viewMode === mode
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setViewMode(mode)
                    }
                  >
                    {mode === "editor"
                      ? "Tree editor"
                      : mode ===
                          "preview"
                        ? "Preview"
                        : `Validation (${selectedModel.issues.length})`}
                  </button>
                ))}
              </nav>

              {viewMode ===
              "editor" ? (
                <AssessmentTreeEditor
                  tree={
                    selectedModel.tree
                  }
                  issues={
                    selectedModel.issues
                  }
                  onEdit={
                    openEditItem
                  }
                  onAddChild={
                    openNewChildItem
                  }
                  onMoveBefore={(
                    itemId,
                    targetId,
                  ) =>
                    runMutation(
                      () =>
                        moveItemBefore(
                          itemId,
                          targetId,
                        ),
                      "Item moved.",
                    )
                  }
                  onMoveAfter={(
                    itemId,
                    targetId,
                  ) =>
                    runMutation(
                      () =>
                        moveItemAfter(
                          itemId,
                          targetId,
                        ),
                      "Item moved.",
                    )
                  }
                  onIndent={(
                    itemId,
                  ) =>
                    runMutation(
                      () =>
                        indentItem(
                          itemId,
                        ),
                      "Item indented.",
                    )
                  }
                  onOutdent={(
                    itemId,
                  ) =>
                    runMutation(
                      () =>
                        outdentItem(
                          itemId,
                        ),
                      "Item outdented.",
                    )
                  }
                  onDelete={(
                    itemId,
                  ) => {
                    if (
                      !window.confirm(
                        "Delete this item and every child beneath it?",
                      )
                    ) {
                      return;
                    }

                    return runMutation(
                      () =>
                        deleteItemSubtree(
                          itemId,
                        ),
                      "Assessment subtree deleted.",
                    );
                  }}
                />
              ) : null}

              {viewMode ===
              "preview" ? (
                <AssessmentTreePreview
                  roots={
                    selectedModel.tree
                      .roots
                  }
                />
              ) : null}

              {viewMode ===
              "validation" ? (
                <AssessmentValidationPanel
                  issues={
                    selectedModel.issues
                  }
                />
              ) : null}
            </>
          ) : (
            <div className="ae-empty">
              <strong>
                Create an assessment
                structure
              </strong>
              <p>
                Then add root items and
                child assessment items.
              </p>
              <button
                type="button"
                className="ae-primary-action"
                onClick={
                  openNewStructure
                }
              >
                Create structure
              </button>
            </div>
          )}
        </main>
      </div>

      {filterOpen && (
        <BranchViewportPortal themeSourceClass=".ae-page" onEscape={() => setFilterOpen(false)}>
          <div className="ae-overlay ae-setup-modal" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setFilterOpen(false);}}>
            <section className="ae-setup-sheet" role="dialog" aria-modal="true" aria-label="Assessment filters">
              <header><h2>Filters</h2><button type="button" onClick={()=>setFilterOpen(false)} aria-label="Close filters">✕</button></header>
              <div className="ae-setup-fields">
                <label><span>Search systems or items</span><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search assessments" /></label>
                <label><span>Status</span><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value as StatusFilter)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></select></label>
              </div>
              <footer><button type="button" onClick={()=>{setSearch("");setStatusFilter("active");}}>Clear</button><button type="button" className="primary" onClick={()=>setFilterOpen(false)}>Apply</button></footer>
            </section>
          </div>
        </BranchViewportPortal>
      )}
      {moreOpen && (
        <BranchViewportPortal themeSourceClass=".ae-page" onEscape={() => setMoreOpen(false)}>
          <div className="ae-overlay ae-setup-modal" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setMoreOpen(false);}}>
            <section className="ae-setup-sheet small" role="dialog" aria-modal="true" aria-label="More assessment actions">
              <header><h2>More</h2><button type="button" onClick={()=>setMoreOpen(false)} aria-label="Close menu">✕</button></header>
              <nav className="ae-setup-menu">
                <button type="button" onClick={()=>{setStructureListView("cards");setMoreOpen(false);}}>Cards</button>
                <button type="button" onClick={()=>{setStructureListView("table");setMoreOpen(false);}}>Table</button>
                <button type="button" onClick={()=>{setViewMode("editor");setMoreOpen(false);}}>Tree editor</button>
                <button type="button" onClick={()=>{setViewMode("preview");setMoreOpen(false);}}>Preview</button>
                <button type="button" onClick={()=>{setViewMode("validation");setMoreOpen(false);}}>Validation</button>
                <button type="button" onClick={()=>{setMoreOpen(false);void load();}}>Refresh</button>
              </nav>
            </section>
          </div>
        </BranchViewportPortal>
      )}

      {structureSheetOpen && <BranchViewportPortal themeSourceClass=".ae-page" onEscape={() => setStructureSheetOpen(false)}>
      <AssessmentStructureEditorSheet
        open={structureSheetOpen}
        draft={structureDraft}
        academicStructures={
          academicStructures
        }
        organizations={organizations}
        saving={saving}
        onChange={(patch) =>
          setStructureDraft(
            (current) => ({
              ...current,
              ...patch,
            }),
          )
        }
        onClose={() =>
          setStructureSheetOpen(false)
        }
        onSave={saveStructure}
      />
      </BranchViewportPortal>}

      {itemSheetOpen && <BranchViewportPortal themeSourceClass=".ae-page" onEscape={() => setItemSheetOpen(false)}>
      <AssessmentItemEditorSheet
        open={itemSheetOpen}
        draft={itemDraft}
        items={
          selectedModel?.items ?? []
        }
        saving={saving}
        onChange={(patch) =>
          setItemDraft(
            (current) => ({
              ...current,
              ...patch,
            }),
          )
        }
        onClose={() =>
          setItemSheetOpen(false)
        }
        onSave={saveItem}
      />
      </BranchViewportPortal>}

      {toast ? (
        <div
          className={`ae-toast ${toast.tone}`}
        >
          {toast.message}
        </div>
      ) : null}

      <EditorStyles />
    </section>
  );
}

function EditorStyles() {
  return (
    <style jsx global>{`
      .ae-page {
        --ae-border: color-mix(in srgb, currentColor 13%, transparent);
        --ae-muted: color-mix(in srgb, currentColor 62%, transparent);
        --ae-soft: color-mix(in srgb, currentColor 5%, transparent);
        min-height: 100%;
        padding: 14px;
        color: var(--text-color, inherit);
      }
      .ae-toolbar {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-bottom: 14px;
      }
      .ae-search {
        min-width: 0;
        flex: 1;
        display: flex;
        align-items: center;
        gap: 8px;
        border: 1px solid var(--ae-border);
        border-radius: 14px;
        padding: 0 12px;
        background: var(--card-bg, transparent);
      }
      .ae-search input,
      .ae-toolbar select {
        min-height: 42px;
        border: 0;
        outline: 0;
        background: transparent;
        color: inherit;
      }
      .ae-search input {
        width: 100%;
      }
      .ae-primary-action,
      .ae-actions .primary,
      .ae-sheet-footer .primary {
        border: 0;
        border-radius: 12px;
        background: var(--primary-color, #2563eb);
        color: white;
        padding: 11px 14px;
        font-weight: 700;
      }
      .ae-layout {
        display: grid;
        grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
        gap: 14px;
      }
      .ae-structures,
      .ae-workspace {
        border: 1px solid var(--ae-border);
        border-radius: 18px;
        background: var(--card-bg, transparent);
      }
      .ae-structures {
        padding: 10px;
        align-self: start;
        position: sticky;
        top: 10px;
      }
      .ae-section-title {
        padding: 8px 6px 12px;
        font-size: 13px;
        font-weight: 800;
        color: var(--ae-muted);
      }
      .ae-structure-card {
        width: 100%;
        text-align: left;
        display: grid;
        gap: 4px;
        padding: 12px;
        margin-bottom: 7px;
        border: 1px solid transparent;
        border-radius: 14px;
        background: var(--ae-soft);
        color: inherit;
      }
      .ae-structure-card.selected {
        border-color: var(--primary-color, #2563eb);
        background: color-mix(in srgb, var(--primary-color, #2563eb) 10%, transparent);
      }
      .ae-structure-card span,
      .ae-structure-card small {
        color: var(--ae-muted);
      }
      .ae-workspace {
        min-width: 0;
        padding: 16px;
      }
      .ae-workspace-header {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        align-items: flex-start;
      }
      .ae-workspace-header h2 {
        margin: 3px 0;
      }
      .ae-workspace-header p,
      .ae-workspace-header small {
        color: var(--ae-muted);
      }
      .ae-actions {
        display: flex;
        gap: 7px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .ae-actions button,
      .ae-tabs button,
      .ae-sheet-footer button {
        border: 1px solid var(--ae-border);
        border-radius: 11px;
        padding: 9px 11px;
        background: transparent;
        color: inherit;
      }
      button.danger,
      .ae-node-menu .danger {
        color: #dc2626;
      }
      .ae-tabs {
        display: flex;
        gap: 5px;
        margin: 16px 0;
        overflow-x: auto;
      }
      .ae-tabs button.active {
        border-color: var(--primary-color, #2563eb);
        color: var(--primary-color, #2563eb);
        font-weight: 800;
      }
      .ae-tree-editor {
        display: grid;
        gap: 7px;
      }
      .ae-node-card {
        position: relative;
      }
      .ae-node-main {
        display: flex;
        align-items: center;
        gap: 7px;
        min-height: 56px;
        border: 1px solid var(--ae-border);
        border-radius: 14px;
        padding: 7px;
        background: var(--ae-soft);
      }
      .ae-node-toggle,
      .ae-icon-button {
        width: 36px;
        height: 36px;
        flex: 0 0 36px;
        border: 1px solid var(--ae-border);
        border-radius: 11px;
        background: transparent;
        color: inherit;
      }
      .ae-node-content {
        min-width: 0;
        flex: 1;
        display: grid;
        gap: 3px;
        text-align: left;
        border: 0;
        background: transparent;
        color: inherit;
      }
      .ae-node-title {
        font-weight: 800;
      }
      .ae-node-meta {
        font-size: 12px;
        color: var(--ae-muted);
      }
      .ae-node-issue {
        min-width: 24px;
        height: 24px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 900;
      }
      .ae-node-issue.error {
        background: #fee2e2;
        color: #991b1b;
      }
      .ae-node-issue.warning {
        background: #fef3c7;
        color: #92400e;
      }
      .ae-node-menu {
        position: absolute;
        z-index: 20;
        right: 8px;
        top: 48px;
        min-width: 170px;
        display: grid;
        padding: 6px;
        border: 1px solid var(--ae-border);
        border-radius: 13px;
        background: var(--card-bg, #fff);
        box-shadow: 0 16px 35px rgba(0,0,0,.16);
      }
      .ae-node-menu button {
        text-align: left;
        border: 0;
        border-radius: 8px;
        background: transparent;
        padding: 9px;
        color: inherit;
      }
      .ae-node-menu button:hover {
        background: var(--ae-soft);
      }
      .ae-validation-panel,
      .ae-preview {
        display: grid;
        gap: 8px;
      }
      .ae-validation,
      .ae-preview-row {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        padding: 11px;
        border-radius: 13px;
        background: var(--ae-soft);
      }
      .ae-validation.error {
        border: 1px solid #ef4444;
      }
      .ae-validation.warning {
        border: 1px solid #f59e0b;
      }
      .ae-validation.ok {
        border: 1px solid #22c55e;
      }
      .ae-validation p {
        margin: 3px 0 0;
        color: var(--ae-muted);
      }
      .ae-preview-row small {
        margin-left: auto;
        color: var(--ae-muted);
      }
      .ae-empty {
        display: grid;
        place-items: center;
        text-align: center;
        gap: 8px;
        min-height: 220px;
        padding: 24px;
        color: var(--ae-muted);
      }
      .ae-empty.compact {
        min-height: 100px;
      }
      .ae-overlay {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: flex;
        justify-content: flex-end;
        background: rgba(0,0,0,.42);
      }
      .ae-sheet {
        width: min(560px, 100%);
        height: 100%;
        display: flex;
        flex-direction: column;
        background: var(--page-bg, #fff);
        color: var(--text-color, #111);
      }
      .ae-sheet-header,
      .ae-sheet-footer {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 16px;
        border-bottom: 1px solid var(--ae-border);
      }
      .ae-sheet-footer {
        border-top: 1px solid var(--ae-border);
        border-bottom: 0;
        justify-content: flex-end;
      }
      .ae-sheet-header h3 {
        margin: 2px 0 0;
      }
      .ae-sheet-header small {
        color: var(--ae-muted);
      }
      .ae-sheet-body {
        flex: 1;
        overflow: auto;
        padding: 16px;
      }
      .ae-form-section {
        display: grid;
        gap: 12px;
        margin-bottom: 18px;
        padding: 14px;
        border: 1px solid var(--ae-border);
        border-radius: 16px;
      }
      .ae-form-section h4 {
        margin: 0;
      }
      .ae-form-section label {
        display: grid;
        gap: 6px;
        font-size: 13px;
        font-weight: 700;
      }
      .ae-form-section input,
      .ae-form-section select,
      .ae-form-section textarea {
        width: 100%;
        border: 1px solid var(--ae-border);
        border-radius: 11px;
        background: transparent;
        color: inherit;
        padding: 10px;
        font: inherit;
      }
      .ae-form-section .ae-check {
        display: flex;
        align-items: center;
        gap: 9px;
      }
      .ae-form-section .ae-check input {
        width: auto;
      }
      .ae-grid-two {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .ae-help {
        margin: 0;
        color: var(--ae-muted);
        font-size: 12px;
      }
      .ae-inline-issues {
        display: grid;
        gap: 6px;
      }
      .ae-inline-issues p {
        margin: 0;
        padding: 9px;
        border-radius: 10px;
      }
      .ae-inline-issues .error {
        background: #fee2e2;
        color: #991b1b;
      }
      .ae-inline-issues .warning {
        background: #fef3c7;
        color: #92400e;
      }
      .ae-toast {
        position: fixed;
        z-index: 150;
        right: 16px;
        bottom: 16px;
        max-width: min(380px, calc(100vw - 32px));
        padding: 12px 14px;
        border-radius: 13px;
        color: white;
        background: #111827;
        box-shadow: 0 16px 34px rgba(0,0,0,.2);
      }
      .ae-toast.success {
        background: #166534;
      }
      .ae-toast.error {
        background: #991b1b;
      }
      @media (max-width: 860px) {
        .ae-layout {
          grid-template-columns: 1fr;
        }
        .ae-structures {
          position: static;
          display: flex;
          gap: 8px;
          overflow-x: auto;
        }
        .ae-section-title {
          display: none;
        }
        .ae-structure-card {
          min-width: 210px;
          margin: 0;
        }
        .ae-workspace-header {
          display: grid;
        }
        .ae-actions {
          justify-content: flex-start;
        }
      }
      @media (max-width: 560px) {
        .ae-page {
          padding: 9px;
        }
        .ae-toolbar {
          flex-wrap: wrap;
        }
        .ae-search {
          flex-basis: 100%;
        }
        .ae-workspace {
          padding: 11px;
        }
        .ae-grid-two {
          grid-template-columns: 1fr;
        }
        .ae-node-card {
          margin-inline-start: 0 !important;
        }
        .ae-node-main {
          border-left-width: calc(2px + var(--depth, 0px));
        }
        .ae-sheet {
          margin-top: 7vh;
          height: 93vh;
          border-radius: 20px 20px 0 0;
        }
      }
    
      /* V36 tree workspace — compact branch setup appearance */
      .ae-page { --ae-border:var(--border,rgba(15,23,42,.14));
        --ae-muted:var(--muted,#64748b);--ae-soft:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 92%,var(--text,#182235) 8%);
        min-height:0;width:100%;min-width:0;max-width:none;padding:4px 4px 18px;
        background:var(--bg,var(--background,#f2f4f7));color:var(--text,#111827);overflow:visible; }
      .ae-layout {gap:8px;grid-template-columns:minmax(220px,345px) minmax(0,1fr);}
      .ae-structures,.ae-workspace,.ae-structure-card,.ae-node-main {
        border:1px solid color-mix(in srgb,var(--border,#d4dae3) 85%,var(--text,#182235) 15%);
        border-radius:12px;background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 93%,var(--text,#182235) 7%);box-shadow:none;}
      .ae-structures {padding:5px;max-width:100%;}
      .ae-structure-card {padding:9px;margin-bottom:5px;}
      .ae-workspace {padding:9px;}
      .ae-workspace-header {align-items:center;}
      .ae-workspace-header h2 {font-size:13px;margin:0;letter-spacing:normal;}
      .ae-workspace-header small,.ae-workspace-header p {display:none;}
      .ae-actions button {min-height:32px;padding:5px 9px;border-radius:7px;font-size:11px;font-weight:750;}
      .ae-tabs {margin:8px 0;gap:4px;}
      .ae-tabs button {min-height:31px;padding:5px 9px;font-size:11px;border-radius:7px;}
      .ae-node-main {min-height:48px;border-radius:9px;padding:6px;}
      .ae-table-wrap {width:100%;overflow-x:auto;border-radius:8px;}
      .ae-table-wrap table {width:100%;border-collapse:collapse;min-width:290px;color:var(--text,#111827);}
      .ae-table-wrap th,.ae-table-wrap td {padding:8px 7px;text-align:left;font-size:10px;
        border-bottom:1px solid var(--ae-border);}
      .ae-table-wrap th {background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 85%,var(--text,#182235) 15%);font-weight:800;}
      .ae-table-wrap tr:nth-child(even) td {background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 89%,var(--text,#182235) 11%);}
      .ae-table-wrap tr.selected td:first-child{box-shadow:inset 3px 0 0 var(--primary-color,#2563eb);}
      .ae-table-choice{border:0;background:transparent;color:var(--text,#111827);font-weight:750;text-align:left;cursor:pointer;font-size:11px;}
      .ae-setup-modal {position:fixed;inset:0;z-index:12000;display:grid;place-items:center;
        padding:clamp(8px,2vw,18px);background:rgba(15,23,42,.52);backdrop-filter:blur(10px);}
      .ae-setup-sheet {width:min(590px,100%);max-height:min(84dvh,760px);overflow:auto;
        border-radius:15px;border:1px solid var(--ae-border);padding:12px;
        background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);box-shadow:0 25px 80px rgba(15,23,42,.25);}
      .ae-setup-sheet.small{max-width:420px;}
      .ae-setup-sheet header {display:flex;align-items:center;justify-content:space-between;gap:8px;}
      .ae-setup-sheet h2{font-size:15px;margin:0;}
      .ae-setup-sheet header button{width:32px;height:32px;border:1px solid var(--ae-border);border-radius:8px;
       background:var(--surface,#fff);color:var(--text,#111827);cursor:pointer;}
      .ae-setup-fields{display:grid;gap:9px;margin:11px 0;}
      .ae-setup-fields label{display:grid;gap:4px;color:var(--ae-muted);font-size:11px;font-weight:800;}
      .ae-setup-fields input,.ae-setup-fields select{width:100%;min-height:40px;padding:6px 10px;
        border:1px solid var(--ae-border);border-radius:9px;background:var(--input-bg,var(--surface,#fff));color:var(--text,#111827);}
      .ae-setup-sheet footer{display:flex;justify-content:flex-end;gap:7px;border-top:1px solid var(--ae-border);padding-top:10px;}
      .ae-setup-sheet footer button,.ae-setup-menu button{min-height:34px;padding:6px 10px;border:1px solid var(--ae-border);border-radius:8px;
        background:var(--surface,#fff);color:var(--text,#111827);font-size:11px;cursor:pointer;}
      .ae-setup-sheet footer .primary{background:var(--primary-color,#2563eb);color:#fff;border-color:transparent;}
      .ae-setup-menu{display:grid;gap:5px;margin-top:10px;}
      .ae-setup-menu button{text-align:left;}
      /* The existing assessment-editor sheets are real dialogs, not side drawers. */
      .ae-overlay {display:grid;place-items:center;padding:clamp(8px,2vw,18px);
        background:rgba(15,23,42,.54);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}
      .ae-overlay .ae-sheet {width:min(640px,100%);max-width:100%;height:auto;
        max-height:min(88dvh,780px);overflow:hidden;border-radius:15px;
        border:1px solid var(--border,rgba(15,23,42,.15));
        box-shadow:0 28px 85px rgba(15,23,42,.28);}
      .ae-overlay .ae-sheet-header,.ae-overlay .ae-sheet-footer {flex:0 0 auto;padding:12px;}
      .ae-overlay .ae-sheet-body{min-height:0;overflow-y:auto;overscroll-behavior:contain;}
      .ae-page .ae-overlay {background:rgba(15,23,42,.52);backdrop-filter:blur(10px);}
      .ae-page .ae-sheet{background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);}
      .ae-page .ae-sheet-header button{background:var(--surface,#fff);color:var(--text,#111827);border:1px solid var(--ae-border);border-radius:8px;}
      @media(max-width:860px){.ae-layout{grid-template-columns:1fr;}.ae-structures{position:static;display:block;overflow:auto;}}
      @media(max-width:639px){.ae-page{padding:3px;}.ae-workspace-header{display:grid;}.ae-structures{padding:5px;}}
      @media(prefers-reduced-motion:reduce){.ae-node-main,.ae-structure-card{transition:none;}}
`}</style>
  );
}
