"use client";

/** Eleeveon assessment-import action preview. No database writes. */
import React, { useMemo, useState } from "react";
import type { AssessmentExcelValidationResult } from "./assessmentExcelTypes";

export type AssessmentPreviewAction = "create" | "update" | "unchanged" | "clear" | "blocked" | "skip";
export function classifyAssessmentExcelRow(
  row: AssessmentExcelValidationResult["rows"][number],
  controlledWorkbook: boolean,
): AssessmentPreviewAction {
  if (!row.valid || row.locked) return "blocked";
  const existing = row.existingEntry;
  if (row.data.blank) return existing && controlledWorkbook ? "clear" : "skip";
  if (!existing) return "create";
  if (Number(existing.score) === Number(row.data.score)) return "unchanged";
  return "update";
}

export function assessmentExcelPreviewSummary(validation: AssessmentExcelValidationResult, controlledWorkbook: boolean) {
  const counts = { create: 0, update: 0, unchanged: 0, clear: 0, blocked: 0, skip: 0 };
  for (const row of validation.rows) counts[classifyAssessmentExcelRow(row, controlledWorkbook)]++;
  const fatal = validation.issues.filter((issue) => issue.severity === "error" && (
    issue.code.startsWith("assessment.metadata_") ||
    ["assessment.unsupported_template_version", "assessment.missing_controlled_metadata", "assessment.missing_assessment_columns", "assessment.changed_assessment_metadata", "assessment.changed_assessment_structure"].includes(issue.code)
  ));
  return { ...counts, totalChanges: counts.create + counts.update + counts.clear, fatal };
}

type Props = {
  validation: AssessmentExcelValidationResult;
  controlledWorkbook: boolean;
};

const definitions: Array<{ key: AssessmentPreviewAction; name: string; bg: string; fg: string }> = [
  { key: "create", name: "New marks", bg: "#e4f5e9", fg: "#166534" },
  { key: "update", name: "Changed marks", bg: "#e7efff", fg: "#1d4ed8" },
  { key: "unchanged", name: "Unchanged", bg: "#edf1f5", fg: "#475569" },
  { key: "clear", name: "Will clear", bg: "#fff0d0", fg: "#92400e" },
  { key: "blocked", name: "Blocked", bg: "#fee8e8", fg: "#991b1b" },
  { key: "skip", name: "Empty / skipped", bg: "#f3f4f6", fg: "#4b5563" },
];

export default function AssessmentExcelChangePreview({ validation, controlledWorkbook }: Props) {
  const summary = useMemo(() => assessmentExcelPreviewSummary(validation, controlledWorkbook), [validation, controlledWorkbook]);
  const [filter, setFilter] = useState<AssessmentPreviewAction | "all">("all");
  const rows = useMemo(() => validation.rows.filter((row) => filter === "all" || classifyAssessmentExcelRow(row, controlledWorkbook) === filter).slice(0, 100), [validation, controlledWorkbook, filter]);
  return (
    <section style={{ display: "grid", gap: 12, fontSize: 13 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {definitions.map((item) => (
          <button key={item.key} type="button" onClick={() => setFilter((previous) => previous === item.key ? "all" : item.key)}
            aria-pressed={filter === item.key}
            style={{ border: filter === item.key ? `2px solid ${item.fg}` : "1px solid #9ca3af70", borderRadius: 10, padding: "9px 12px", background: item.bg, color: item.fg, cursor: "pointer", textAlign: "left" }}>
            <strong>{summary[item.key]}</strong> {item.name}
          </button>
        ))}
        {filter !== "all" && <button type="button" onClick={() => setFilter("all")}>Show all</button>}
      </div>
      {summary.fatal.length > 0 && <div role="alert" style={{ background: "#fee8e8", color: "#991b1b", padding: 12, borderRadius: 8 }}>
        <strong>Workbook cannot be imported.</strong> {summary.fatal.map((i) => i.message).join(" ")}
      </div>}
      {summary.clear > 0 && <div role="note" style={{ background: "#fff0d0", color: "#92400e", padding: 12, borderRadius: 8 }}>
        <strong>Review required:</strong> {summary.clear} existing score{summary.clear === 1 ? "" : "s"} will be cleared because the controlled workbook contains blank cells. Uncheck the clearance approval to prevent this action.
      </div>}
      <div style={{ overflowX: "auto", maxHeight: 390, overflowY: "auto", border: "1px solid var(--border, #d1d5db)", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
          <thead><tr style={{ background: "var(--surface-2, #f1f5f9)", color: "var(--text, #111827)" }}>
            {["Excel row", "Student", "Assessment", "Existing", "Import", "Action / issues"].map((h) => <th key={h} style={{ textAlign: "left", padding: 9, position: "sticky", top: 0, background: "var(--surface-2, #f1f5f9)" }}>{h}</th>)}
          </tr></thead>
          <tbody>{rows.map((row, index) => {
            const action = classifyAssessmentExcelRow(row, controlledWorkbook);
            const style = definitions.find((item) => item.key === action)!;
            return <tr key={`${row.rowNumber}-${row.data.studentId}-${row.data.assessmentStructureItemId}-${index}`} style={{ borderTop: "1px solid var(--border, #d1d5db)" }}>
              <td style={{ padding: 9 }}>{row.rowNumber}</td>
              <td style={{ padding: 9 }}>{row.data.studentName || "—"}</td>
              <td style={{ padding: 9 }}>{row.data.assessmentLabel || "—"}</td>
              <td style={{ padding: 9 }}>{row.existingEntry?.score ?? "—"}</td>
              <td style={{ padding: 9 }}>{row.data.blank ? "Blank" : `${row.data.score} / ${row.data.maxScore}`}</td>
              <td style={{ padding: 9 }}><span style={{ background: style.bg, color: style.fg, padding: "3px 7px", borderRadius: 6, fontWeight: 600 }}>{style.name}</span>{row.issues.length > 0 && <div style={{ marginTop: 4 }}>{row.issues.map((issue) => issue.message).join(" · ")}</div>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <small style={{ opacity: 0.75 }}>Showing up to 100 rows for the selected filter. Counts cover the entire worksheet. Protected workbook identity and score limits are still validated before saving.</small>
    </section>
  );
}
