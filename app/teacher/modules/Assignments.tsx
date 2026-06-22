"use client";

import { DexieCrudPage, type CrudField } from "../../components/role-portals/CrudToolkit";

const fields: CrudField[] = [
    { key: "teacherId", label: "Teacher ID", type: "number", required: true },
    { key: "classId", label: "Class ID", type: "number", required: true },
    { key: "subjectId", label: "Subject ID", type: "number", required: true }
  ];

export default function Assignments() {
  return (
    <DexieCrudPage
      title="Assignments"
      subtitle="Create and update teacher assignment records."
      entityName="assignment"
      fields={fields}
      tableName="assignments"
      primaryField="teacherId"
      badgeField="active"
      schoolScoped={true}
      branchScoped={true}
      allowCreate={true}
      allowUpdate={true}
      allowDelete={true}
    />
  );
}
