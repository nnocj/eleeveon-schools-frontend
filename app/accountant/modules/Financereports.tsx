"use client";

import { DexieCrudPage, type CrudField } from "../../components/role-portals/CrudToolkit";

const fields: CrudField[] = [
    { key: "studentId", label: "Student ID", type: "number" },
    { key: "amount", label: "Amount", type: "number" },
    { key: "method", label: "Method", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "receiptNumber", label: "Receipt Number", type: "text" },
    { key: "note", label: "Note", type: "textarea" }
  ];

export default function Financereports() {
  return (
    <DexieCrudPage
      title="Finance Reports"
      subtitle="Review finance records prepared for reporting."
      entityName="finance report item"
      fields={fields}
      tableName="payments"
      primaryField="receiptNumber"
      badgeField="active"
      schoolScoped={true}
      branchScoped={true}
      allowCreate={false}
      allowUpdate={true}
      allowDelete={false}
    />
  );
}
