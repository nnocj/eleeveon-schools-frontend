
"use client";

/**
 * app/branch-admin/modules/Transactions.tsx
 *
 * Unified Finance Transactions.
 *
 * Existing income/expense CRUD remains in its original modules.
 * The combined All ledger is read-only until a transaction type
 * is selected for editing.
 *
 * No database schema changes.
 * Both original sync tables are retained.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import Expenses from "./Expenses";
import Incomes from "./Incomes";

import FinanceOperationsExcel from "../../components/excel/FinanceOperationsExcel";

import { listActiveLocal } from "../../lib/sync/syncUtils";

import { useBranchWorkspaceScope } from "../../hooks/useBranchWorkspaceScope";

import { useBranchTableRevision } from "../../hooks/useBranchTableRevision";

type Row = Record<string, any>;

type TransactionRow = Row & {
  transactionType: "incomes" | "expenses";
};

type TypeFilter = "all" | "incomes" | "expenses";

const display = (value: unknown) =>
  String(value ?? "").trim();

const currencyAmount = (
  value: unknown,
  code: string,
) => {
  const n = Number(value ?? 0);

  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: /^[A-Z]{3}$/.test(code) ? code : "GHS",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
};

export default function Transactions() {
  const { accountId, schoolId, branchId } =
    useBranchWorkspaceScope();

  const revision = useBranchTableRevision([
    "incomes",
    "expenses",
  ]);

  const [type, setType] =
    useState<TypeFilter>("all");

  const [income, setIncome] =
    useState<Row[]>([]);

  const [expenses, setExpenses] =
    useState<Row[]>([]);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [more, setMore] = useState(false);
  const [choice, setChoice] = useState(false);

  const [excel, setExcel] = useState<
    "incomes" | "expenses" | null
  >(null);

  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!accountId || !schoolId || !branchId) {
      setIncome([]);
      setExpenses([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [incomeRows, expenseRows] =
        await Promise.all([
          listActiveLocal<Row>("incomes"),
          listActiveLocal<Row>("expenses"),
        ]);

      const scoped = (row: Row) =>
        !row.isDeleted &&
        row.active !== false &&
        (!row.accountId ||
          String(row.accountId) ===
            String(accountId)) &&
        String(row.schoolId) ===
          String(schoolId) &&
        String(row.branchId) ===
          String(branchId);

      setIncome((incomeRows || []).filter(scoped));
      setExpenses((expenseRows || []).filter(scoped));

      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load transactions",
      );
    } finally {
      setLoading(false);
    }
  }, [accountId, schoolId, branchId]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  /**
   * IMPORTANT TYPESCRIPT FIX
   *
   * The combined records are explicitly typed
   * before map/filter/sort operations.
   *
   * This prevents TypeScript from inferring rows
   * as objects containing only transactionType.
   */
  const records = useMemo<TransactionRow[]>(() => {
    const combined: TransactionRow[] = [
      ...income.map(
        (row): TransactionRow => ({
          ...row,
          transactionType: "incomes",
        }),
      ),

      ...expenses.map(
        (row): TransactionRow => ({
          ...row,
          transactionType: "expenses",
        }),
      ),
    ];

    const search = query.trim().toLowerCase();

    return combined
      .filter(
        (row) =>
          type === "all" ||
          row.transactionType === type,
      )
      .filter(
        (row) =>
          !search ||
          [
            row.title,
            row.description,
            row.referenceNumber,
            row.receiptNumber,
            row.paidTo,
            row.receivedBy,
          ]
            .join(" ")
            .toLowerCase()
            .includes(search),
      )
      .sort(
        (a, b) =>
          new Date(
            b.date || b.createdAt || 0,
          ).getTime() -
          new Date(
            a.date || a.createdAt || 0,
          ).getTime(),
      );
  }, [income, expenses, type, query]);

  const totals = (rows: Row[]) => {
    const amounts = new Map<string, number>();

    rows.forEach((row) => {
      const currency =
        display(row.currencyCode).toUpperCase() ||
        "GHS";

      amounts.set(
        currency,
        (amounts.get(currency) || 0) +
          Math.max(0, Number(row.amount) || 0),
      );
    });

    return (
      [...amounts]
        .map(([currency, amount]) =>
          currencyAmount(amount, currency),
        )
        .join(" · ") || "—"
    );
  };

  return (
    <main className="tx-page">
      <style>{`
        .tx-page {
          color: var(--text, #182235);
          padding: 5px 5px 24px;
          font: 13px/1.5 system-ui, sans-serif;
        }

        .tx-page * {
          box-sizing: border-box;
        }

        .tx-bar {
          display: flex;
          gap: 6px;
          align-items: center;
          margin: 8px 0 12px;
          flex-wrap: wrap;
        }

        .tx-bar input {
          flex: 1 1 200px;
          min-width: 0;
          height: 37px;
          border: 1px solid var(--border, #d4dae3);
          border-radius: 9px;
          padding: 8px;
          background: var(--surface, #fff);
          color: inherit;
        }

        .tx-page button {
          border: 1px solid var(--border, #d4dae3);
          border-radius: 9px;
          padding: 9px 12px;
          background: var(--surface, #fff);
          color: inherit;
          font-weight: 720;
          cursor: pointer;
        }

        .tx-page button.active {
          background: color-mix(
            in srgb,
            var(--primary-color, #2563eb) 12%,
            var(--surface, #fff)
          );
          border-color: var(--primary-color, #2563eb);
        }

        .tx-main-action {
          background: var(--primary-color, #2563eb) !important;
          color: white !important;
          border-color: var(--primary-color, #2563eb) !important;
        }

        .tx-summary {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 9px;
          margin: 10px 0;
        }

        .tx-summary article,
        .tx-record,
        .tx-empty {
          border: 1px solid var(--border, #d4dae3);
          background: color-mix(
            in srgb,
            var(--card-bg, var(--surface, #fff)) 94%,
            var(--text, #182235) 6%
          );
          border-radius: 11px;
          padding: 12px;
        }

        .tx-summary small,
        .tx-record small {
          display: block;
          color: var(--muted, #64748b);
          font-size: 11px;
        }

        .tx-summary strong {
          display: block;
          margin-top: 4px;
          font-size: clamp(13px, 1.5vw, 18px);
          overflow-wrap: anywhere;
        }

        .tx-items {
          display: grid;
          gap: 7px;
        }

        .tx-record {
          display: flex;
          align-items: center;
          gap: 11px;
          cursor: default;
        }

        .tx-record .tx-symbol {
          border-radius: 10px;
          padding: 9px;
          background: color-mix(
            in srgb,
            var(--primary-color, #2563eb) 10%,
            var(--surface, #fff)
          );
        }

        .tx-record .tx-main {
          flex: 1;
          min-width: 0;
        }

        .tx-record b {
          overflow-wrap: anywhere;
        }

        .tx-record .tx-amount {
          white-space: nowrap;
          font-weight: 800;
        }

        .tx-overlay {
          position: fixed;
          inset: 0;
          z-index: 60010;
          background: #0f172a99;
          display: grid;
          place-items: center;
          padding: 12px;
        }

        .tx-sheet {
          width: min(450px, 100%);
          background: var(--card-bg, var(--surface, #fff));
          border-radius: 15px;
          padding: 17px;
          display: grid;
          gap: 10px;
        }

        .tx-sheet h2 {
          margin: 0;
          font-size: 18px;
        }

        .tx-sheet button {
          text-align: left;
        }

        .tx-sheet .tx-close {
          text-align: right;
          border: 0;
        }

        .tx-back {
          margin: 5px 0 10px;
        }

        .tx-type-label {
          font-size: 12px;
          color: var(--muted, #64748b);
        }

        @media (max-width: 640px) {
          .tx-summary {
            grid-template-columns: 1fr;
          }

          .tx-record {
            align-items: start;
          }

          .tx-record .tx-amount {
            white-space: normal;
            text-align: right;
          }

          .tx-overlay {
            padding: 0;
            place-items: end;
          }

          .tx-sheet {
            width: 100%;
            border-radius: 17px 17px 0 0;
            padding: 18px 14px 25px;
          }
        }
      `}</style>

      <div className="tx-bar">
        <input
          value={query}
          onChange={(event) =>
            setQuery(event.target.value)
          }
          placeholder="Search income and expenses"
          aria-label="Search transactions"
        />

        <button
          className="tx-main-action"
          onClick={() => setChoice(true)}
        >
          ＋ Add
        </button>

        <button onClick={() => setMore(true)}>
          ⋮ More
        </button>
      </div>

      <div
        className="tx-bar"
        role="group"
        aria-label="Transaction filters"
      >
        <button
          className={type === "all" ? "active" : ""}
          onClick={() => setType("all")}
        >
          All
        </button>

        <button
          className={
            type === "incomes" ? "active" : ""
          }
          onClick={() => setType("incomes")}
        >
          Income
        </button>

        <button
          className={
            type === "expenses" ? "active" : ""
          }
          onClick={() => setType("expenses")}
        >
          Expenses
        </button>
      </div>

      {type === "all" ? (
        <>
          <div className="tx-summary">
            <article>
              <small>Total income (all recorded)</small>
              <strong>{totals(income)}</strong>
            </article>

            <article>
              <small>Total expenses (all recorded)</small>
              <strong>{totals(expenses)}</strong>
            </article>
          </div>

          {loading ? (
            <p>Loading transactions…</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : (
            <div className="tx-items">
              {records.length ? (
                records.map((row, index) => (
                  <article
                    className="tx-record"
                    key={`${
                      row.transactionType
                    }:${row.id || index}`}
                  >
                    <span className="tx-symbol">
                      {row.transactionType ===
                      "incomes"
                        ? "↙"
                        : "↗"}
                    </span>

                    <div className="tx-main">
                      <b>
                        {display(row.title) ||
                          "Untitled transaction"}
                      </b>

                      <small>
                        {row.transactionType ===
                        "incomes"
                          ? "Income"
                          : "Expense"}
                        {" · "}
                        {display(row.date) ||
                          "No date"}
                        {" · "}
                        {display(
                          row.paymentMethod,
                        ) || "Unspecified method"}
                      </small>

                      <small>
                        {display(row.description)}
                      </small>
                    </div>

                    <span className="tx-amount">
                      {row.transactionType ===
                      "incomes"
                        ? "+"
                        : "−"}

                      {currencyAmount(
                        row.amount,
                        display(
                          row.currencyCode,
                        ) || "GHS",
                      )}
                    </span>
                  </article>
                ))
              ) : (
                <div className="tx-empty">
                  No transactions match your
                  search. Use Add to record
                  income or expenses.
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div>
          <p className="tx-type-label">
            {type === "incomes"
              ? "Income records"
              : "Expense records"}
            {" · "}
            Add, edit, filter and export using
            the controls in this workspace.
          </p>

          {type === "incomes" ? (
            <Incomes />
          ) : (
            <Expenses />
          )}
        </div>
      )}

      {choice && (
        <div
          className="tx-overlay"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget
            ) {
              setChoice(false);
            }
          }}
        >
          <section
            className="tx-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Choose transaction type"
          >
            <h2>Record a transaction</h2>

            <button
              onClick={() => {
                setType("incomes");
                setChoice(false);
              }}
            >
              ↙ Record Income
            </button>

            <button
              onClick={() => {
                setType("expenses");
                setChoice(false);
              }}
            >
              ↗ Record Expense
            </button>

            <button
              className="tx-close"
              onClick={() => setChoice(false)}
            >
              Cancel
            </button>

            <small>
              Choose a type, then use + Add
              in its editor.
            </small>
          </section>
        </div>
      )}

      {more && (
        <div
          className="tx-overlay"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget
            ) {
              setMore(false);
            }
          }}
        >
          <section
            className="tx-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Transaction actions"
          >
            <h2>More</h2>

            <button
              onClick={() => {
                setMore(false);
                setExcel("incomes");
              }}
            >
              ▤ Import / export income Excel
            </button>

            <button
              onClick={() => {
                setMore(false);
                setExcel("expenses");
              }}
            >
              ▤ Import / export expense Excel
            </button>

            <button
              onClick={() => {
                setMore(false);

                window.dispatchEvent(
                  new Event(
                    "eleeveon:finance-historical-review",
                  ),
                );
              }}
            >
              ◷ Historical Review
            </button>

            <button
              onClick={() => {
                setMore(false);
                void load();
              }}
            >
              ↻ Refresh records
            </button>

            <button
              className="tx-close"
              onClick={() => setMore(false)}
            >
              Close
            </button>
          </section>
        </div>
      )}

      {excel &&
        accountId &&
        schoolId &&
        branchId && (
          <FinanceOperationsExcel
            kind={excel}
            accountId={String(accountId)}
            schoolId={String(schoolId)}
            branchId={String(branchId)}
            existing={
              excel === "incomes"
                ? income
                : expenses
            }
            onComplete={load}
            open={true}
            onClose={() => setExcel(null)}
          />
        )}
    </main>
  );
}
