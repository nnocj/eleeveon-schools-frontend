"use client";

import { DexieCrudPage, type CrudField } from "../../components/role-portals/CrudToolkit";

const fields: CrudField[] = [
    { key: "classId", label: "Class ID", type: "number" },
    { key: "academicStructureId", label: "Academic Structure ID", type: "number" },
    { key: "academicPeriodId", label: "Academic Period ID", type: "number" },
    { key: "items", label: "Items JSON", type: "textarea" }
  ];

export default function Fees() {
  return (
    <DexieCrudPage
      title="Fee Structures"
      subtitle="Create and update fee structures."
      entityName="fee structure"
      fields={fields}
      tableName="feeStructures"
      primaryField="classId"
      badgeField="active"
      schoolScoped={true}
      branchScoped={true}
      allowCreate={true}
      allowUpdate={true}
      allowDelete={true}
    />
  );
}
