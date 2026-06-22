"use client";

import { DexieCrudPage, type CrudField } from "../../components/role-portals/CrudToolkit";

const fields: CrudField[] = [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea" },
    { key: "amount", label: "Amount", type: "number", required: true },
    { key: "paymentMethod", label: "Payment Method", type: "select", options: [{ label: "Cash", value: "cash" }, { label: "Momo", value: "momo" }, { label: "Bank", value: "bank" }, { label: "Card", value: "card" }] },
    { key: "date", label: "Date", type: "date", required: true },
    { key: "source", label: "Source", type: "text" },
    { key: "receivedBy", label: "Received By", type: "text" },
    { key: "referenceNumber", label: "Reference Number", type: "text" },
    { key: "receiptNumber", label: "Receipt Number", type: "text" }
  ];

export default function Income() {
  return (
    <DexieCrudPage
      title="Income"
      subtitle="Create and update income records."
      entityName="income"
      fields={fields}
      tableName="incomes"
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
