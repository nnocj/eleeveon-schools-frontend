import { CSSProperties } from "react";

export const reportStyles: Record<string, CSSProperties> = {
  page: {
    padding: 12,
  },

  controls: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 10,
  },

  select: {
    width: "100%",
    padding: 10,
    marginBottom: 10,
  },

  reportCard: {
    background: "#fff",
    border: "1px solid #ddd",
    padding: 16,
    marginBottom: 20,
    maxWidth: 900,
    marginInline: "auto",
  },

  title: {
    textAlign: "center",
    fontSize: 18,
    marginBottom: 10,
  },

  headerInfo: {
    display: "grid",
    gap: 4,
    fontSize: 14,
  },

  tableWrapper: {
    overflowX: "auto",
    marginTop: 10,
  },

  table: {
    width: "100%",
    minWidth: 700,
    borderCollapse: "collapse",
    fontSize: 12,
  },

  summary: {
    marginTop: 10,
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    fontSize: 14,
  },

  remarks: {
    marginTop: 10,
    display: "grid",
    gap: 10,
    fontSize: 14,
  },
};