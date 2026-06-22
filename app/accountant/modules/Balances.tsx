"use client";

import { DexieCrudPage, type CrudField } from "../../components/role-portals/CrudToolkit";

const fields: CrudField[] = [
    { key: "title", label: "Title", type: "text" },
    { key: "amount", label: "Amount", type: "number" },
    { key: "date", label: "Date", type: "date" },
    { key: "source", label: "Source", type: "text" }
  ];

export default function Balances() {
  return (
    <DexieCrudPage
      title="Balances"
      subtitle="Review balances through income, expense and payment records."
      entityName="balance note"
      fields={fields}
      tableName="incomes"
      primaryField="title"
      badgeField="active"
      schoolScoped={true}
      branchScoped={true}
      allowCreate={false}
      allowUpdate={false}
      allowDelete={false}
    />
  );
}
