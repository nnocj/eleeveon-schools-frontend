"use client";

import { DexieCrudPage, type CrudField } from "../../components/role-portals/CrudToolkit";

const fields: CrudField[] = [
    { key: "studentId", label: "Student ID", type: "number" },
    { key: "classId", label: "Class ID", type: "number" },
    { key: "subjectId", label: "Subject ID", type: "number" },
    { key: "total", label: "Total", type: "number" },
    { key: "average", label: "Average", type: "number" },
    { key: "grade", label: "Grade", type: "text" },
    { key: "remark", label: "Remark", type: "textarea" },
    { key: "position", label: "Position", type: "number" }
  ];

export default function Myresults() {
  return (
    <DexieCrudPage
      title="My Results"
      subtitle="Computed results visible to the student."
      entityName="result"
      fields={fields}
      tableName="computedResults"
      primaryField="subjectId"
      badgeField="grade"
      schoolScoped={true}
      branchScoped={true}
      allowCreate={false}
      allowUpdate={false}
      allowDelete={false}
    />
  );
}
