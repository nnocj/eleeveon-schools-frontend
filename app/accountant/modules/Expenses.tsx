"use client";

import { DexieCrudPage, type CrudField } from "../../components/role-portals/CrudToolkit";

const fields: CrudField[] = [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea" },
    { key: "amount", label: "Amount", type: "number", required: true },
    { key: "paymentMethod", label: "Payment Method", type: "select", options: [{ label: "Cash", value: "cash" }, { label: "Momo", value: "momo" }, { label: "Bank", value: "bank" }, { label: "Card", value: "card" }] },
    { key: "expenseSourceType", label: "Expense Type", type: "select", options: [{ label: "Utilities", value: "utilities" }, { label: "Salary", value: "salary" }, { label: "Transport", value: "transport" }, { label: "Feeding", value: "feeding" }, { label: "Maintenance", value: "maintenance" }, { label: "Procurement", value: "procurement" }, { label: "Academic", value: "academic" }, { label: "Administration", value: "administration" }, { label: "Technology", value: "technology" }, { label: "Other", value: "other" }] },
    { key: "date", label: "Date", type: "date", required: true },
    { key: "paidTo", label: "Paid To", type: "text" },
    { key: "approvedBy", label: "Approved By", type: "text" },
    { key: "receiptNumber", label: "Receipt Number", type: "text" },
    { key: "referenceNumber", label: "Reference Number", type: "text" }
  ];

export default function Expenses() {
  return (
    <DexieCrudPage
      title="Expenses"
      subtitle="Create and update expense records."
      entityName="expense"
      fields={fields}
      tableName="expenses"
      primaryField="title"
      badgeField="active"
      schoolScoped={true}
      branchScoped={true}
      allowCreate={true}
      allowUpdate={true}
      allowDelete={true}
    />
  );
}
