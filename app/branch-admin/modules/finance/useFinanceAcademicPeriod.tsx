"use client";

/**
 * Shared, presentation-only academic date scope for branch incomes/expenses.
 * Does not write to academicPeriods, incomes, expenses, or any other table.
 * Income/expense rows have dates rather than academic period IDs: filtering
 * is therefore by the actual configured inclusive start/end dates.
 */
import React, { useEffect, useMemo, useState } from "react";
import { listActiveLocal } from "../../../lib/sync/syncUtils";

type Row = Record<string, any>;
type AcademicOption = {
  key: string;
  structure: string;
  period: string;
  startDate: string;
  endDate: string;
};

type HookArgs = {
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  settings?: Row | null;
  revision?: unknown;
};

export type FinanceAcademicScope = {
  options: AcademicOption[];
  selectedKey: string;
  setSelectedKey: (key: string) => void;
  reset: () => void;
  label: string;
  status: string;
  filterSignature: string;
  matchesDate: (date: unknown) => boolean;
};

const str = (value: unknown) => String(value ?? "").trim();
const ymd = (value: unknown) => {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }
  const text = str(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

function inBranch(row: Row, accountId: string, schoolId: string, branchId: string) {
  if (!row || row.isDeleted === true || row.active === false) return false;
  return (!row.accountId || str(row.accountId) === accountId) &&
    str(row.schoolId) === schoolId && str(row.branchId) === branchId;
}

export function useFinanceAcademicPeriod({
  accountId, schoolId, branchId, settings, revision,
}: HookArgs): FinanceAcademicScope {
  const [structures, setStructures] = useState<Row[]>([]);
  const [periods, setPeriods] = useState<Row[]>([]);
  // null means use the current period. Explicit 'all' means show all dates.
  const [choice, setChoice] = useState<string | null>(null);
  const account = str(accountId);
  const school = str(schoolId);
  const branch = str(branchId);

  useEffect(() => {
    setChoice(null);
    setStructures([]);
    setPeriods([]);
  }, [account, school, branch]);

  useEffect(() => {
    if (!account || !school || !branch) return;
    let live = true;
    void Promise.all([
      listActiveLocal<Row>("academicStructures" as any),
      listActiveLocal<Row>("academicPeriods" as any),
    ]).then(([a, b]) => {
      if (!live) return;
      setStructures((a || []).filter(row => inBranch(row, account, school, branch)));
      setPeriods((b || []).filter(row => inBranch(row, account, school, branch)));
    }).catch(error => console.error("Academic finance context could not load:", error));
    return () => { live = false; };
  }, [account, school, branch, revision]);

  const options = useMemo<AcademicOption[]>(() => {
    const byId = new Map(structures.map(row => [str(row.id), str(row.name)]));
    return periods.flatMap(row => {
      const startDate = ymd(row.startDate);
      const endDate = ymd(row.endDate);
      if (!startDate || !endDate || startDate > endDate) return [];
      return [{
        key: str(row.id),
        structure: byId.get(str(row.academicStructureId)) || "Academic structure",
        period: str(row.name) || "Academic period",
        startDate, endDate,
      }];
    }).sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [periods, structures]);

  const configuredPeriodId = str(settings?.currentAcademicPeriodId);
  const today = new Date().toISOString().slice(0, 10);
  const current = options.find(row => row.key === configuredPeriodId) ||
    options.find(row => row.startDate <= today && today <= row.endDate) || null;

  const selectedKey = choice === "all" ? "all" :
    choice && options.some(row => row.key === choice) ? choice :
    current?.key || "all";
  const selected = options.find(row => row.key === selectedKey);
  const unboundedCurrent = periods.find(row => str(row.id) === configuredPeriodId);
  const label = selected ? `${selected.structure} · ${selected.period}` : "All dates";
  const status = selectedKey === "all"
    ? (unboundedCurrent && !options.some(row => row.key === configuredPeriodId)
      ? "Period dates not configured · All records"
      : "All recorded dates")
    : (selectedKey === current?.key ? "Current term" : "Selected term");
  const filterSignature = selected
    ? `${selected.key}:${selected.startDate}:${selected.endDate}` : "all";

  return {
    options,
    selectedKey,
    setSelectedKey: setChoice,
    reset: () => setChoice(null),
    label,
    status,
    filterSignature,
    matchesDate: (value: unknown) => {
      if (!selected) return true;
      const date = ymd(value);
      return Boolean(date && selected.startDate <= date && date <= selected.endDate);
    },
  };
}

/** Slim, low-contrast context line: no added action buttons or hero panels. */
export function AcademicFinancePeriodBar({
  scope, title, hint,
}: {
  scope: FinanceAcademicScope;
  title: string;
  hint: string;
}) {
  return <div style={{
    display: "flex", alignItems: "baseline", flexWrap: "wrap",
    justifyContent: "space-between", gap: "3px 12px", padding: "4px 3px 7px",
    borderBottom: "1px solid var(--border,rgba(100,116,139,.14))",
    color: "var(--muted,#64748b)", lineHeight: 1.45,
  }}>
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px", alignItems: "baseline", minWidth: 0 }}>
      <strong style={{ fontSize: 11, color: "var(--text,#182235)" }}>{title}</strong>
      <span style={{ fontSize: 10.5, overflowWrap: "anywhere" }}>
        {scope.status} · {scope.label}
      </span>
    </div>
    <small style={{ fontSize: 10, color: "var(--muted,#64748b)" }}>{hint}</small>
  </div>;
}
