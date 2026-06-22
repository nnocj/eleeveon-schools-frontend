"use client";

import { DexieCrudPage, type CrudField } from "../../components/role-portals/CrudToolkit";

const fields: CrudField[] = [
    { key: "studentId", label: "Student ID", type: "number", required: true },
    { key: "amount", label: "Amount", type: "number", required: true },
    { key: "method", label: "Method", type: "select", options: [{ label: "Cash", value: "cash" }, { label: "Momo", value: "momo" }, { label: "Bank", value: "bank" }, { label: "Card", value: "card" }] },
    { key: "date", label: "Date", type: "date", required: true },
    { key: "receiptNumber", label: "Receipt Number", type: "text" },
    { key: "note", label: "Note", type: "textarea" }
  ];

export default function Payments() {
  return (
    <DexieCrudPage
      title="Student Payments"
      subtitle="Create, update and correct student payment records."
      entityName="payment"
      fields={fields}
      tableName="payments"
      primaryField="receiptNumber"
      badgeField="active"
      schoolScoped={true}
      branchScoped={true}
      allowCreate={true}
      allowUpdate={true}
      allowDelete={true}
    />
  );
}
