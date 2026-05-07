import { CSSProperties } from "react";

export const reportStyles: Record<string, CSSProperties> = {
  // ================= PAGE =================
  page: {
    padding: 20,
    minHeight: "100vh",

    // 🔥 GLOBAL FONT (DB CONTROLLED + PRINT SAFE)
    fontFamily: "var(--font-family, Arial, sans-serif)",

    background: "var(--bg)",
    color: "var(--text)",

    // 🔥 IMPORTANT FOR PDF/PRINT CONSISTENCY
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
  },

  // ================= TITLE =================
  title: {
    fontSize: 28,
    fontWeight: 800,
    marginBottom: 18,
    color: "var(--text)",

    fontFamily: "inherit",
  },

  // ================= TABS =================
  tabs: {
    display: "flex",
    gap: 10,
    marginBottom: 15,

    fontFamily: "inherit",
  },

  tabBtn: {
    padding: "10px 14px",
    border: "1px solid rgba(0,0,0,0.12)",
    background: "var(--surface)",
    color: "var(--text)",
    cursor: "pointer",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,

    fontFamily: "inherit",
  },

  activeTab: {
    padding: "10px 14px",
    border: "1px solid var(--primary-color)",
    background: "var(--primary-color)",
    color: "#fff",
    cursor: "pointer",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,

    fontFamily: "inherit",
  },

  // ================= EXPORT BUTTON =================
  exportBtn: {
    padding: "10px 16px",
    border: "none",
    background: "var(--primary-color)",
    color: "#fff",
    cursor: "pointer",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 15,

    fontFamily: "inherit",
  },

  // ================= FILTERS =================
  filters: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 15,
    padding: 12,
    background: "var(--surface)",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.08)",

    fontFamily: "inherit",
  },

  select: {
    padding: 10,
    minWidth: 180,
    borderRadius: 6,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "var(--surface)",
    color: "var(--text)",
    fontSize: 13,

    fontFamily: "inherit",
  },

  // ================= SCHOOL HEADER =================
  schoolHeader: {
    textAlign: "center",
    marginBottom: 15,
    paddingBottom: 10,
    borderBottom: "1px solid rgba(0,0,0,0.08)",

    fontFamily: "inherit",
  },

  schoolName: {
    fontSize: 22,
    fontWeight: 800,
    color: "var(--text)",

    fontFamily: "inherit",
  },

  motto: {
    fontStyle: "italic",
    fontSize: 13,
    opacity: 0.7,

    fontFamily: "inherit",
  },

  logo: {
    height: 60,
    width: 60,
    objectFit: "cover",
    borderRadius: 10,
    marginBottom: 8,
  },

  // ================= REPORT CARD =================
  reportCard: {
    background: "var(--surface)",
    color: "var(--text)",
    padding: 22,
    marginBottom: 30,
    border: "2px solid rgba(0,0,0,0.08)",
    borderRadius: 10,
    boxShadow: "0 3px 10px rgba(0,0,0,0.06)",
    maxWidth: 950,
    marginInline: "auto",
    pageBreakInside: "avoid",

    fontFamily: "inherit",

    // 🔥 IMPORTANT FOR PDF EXPORT
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
  },

  // ================= META =================
  metaRow: {
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    fontSize: 13,
    marginBottom: 12,
    paddingBottom: 6,
    borderBottom: "1px dashed rgba(0,0,0,0.15)",

    fontFamily: "inherit",
  },

  // ================= TABLE =================
  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 10,
    fontSize: 13,

    fontFamily: "inherit",
  },

  th: {
    border: "1px solid rgba(0,0,0,0.20)",
    padding: 10,
    background: "var(--primary-color)",
    color: "#fff",
    textAlign: "center",
    fontWeight: 700,

    fontFamily: "inherit",
  },

  td: {
    border: "1px solid rgba(0,0,0,0.15)",
    padding: 9,
    textAlign: "center",
    background: "var(--surface)",
    color: "var(--text)",

    fontFamily: "inherit",
  },

  // ================= SUMMARY GRID =================
  summaryGrid: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 12,

    fontFamily: "inherit",
  },

  summaryCard: {
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 6,
    padding: "10px 12px",
    background: "rgba(0,0,0,0.02)",
    display: "flex",
    flexDirection: "column",
    gap: 10,

    fontFamily: "inherit",
  },

  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "4px 0",
    borderBottom: "1px dashed rgba(0,0,0,0.12)",

    fontFamily: "inherit",
  },

  summaryRowLast: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "4px 0",

    fontFamily: "inherit",
  },

  summaryLabel: {
    fontWeight: 700,
    fontSize: 12,

    fontFamily: "inherit",
  },

  summaryValue: {
    fontSize: 15,
    fontWeight: 800,

    fontFamily: "inherit",
  },

  // ================= REMARKS =================
  remarkBox: {
    marginTop: 15,
    padding: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    borderRadius: 6,
    fontSize: 13,
    background: "rgba(0,0,0,0.02)",

    fontFamily: "inherit",
  },

  // ================= SIGNATURE =================
  signatureBox: {
    marginTop: 18,
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    fontSize: 13,
    paddingTop: 10,
    borderTop: "1px solid rgba(0,0,0,0.10)",

    fontFamily: "inherit",
  },

  // ================= EMPTY STATE =================
  emptyState: {
    padding: 30,
    borderRadius: 10,
    textAlign: "center",
    background: "var(--surface)",
    border: "1px dashed rgba(0,0,0,0.12)",

    fontFamily: "inherit",
  },

  // ================= PRINT =================
  printArea: {
    width: "100%",

    fontFamily: "inherit",

    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
  },

  reportPage: {
    pageBreakAfter: "always",
    breakAfter: "page",
  },
};