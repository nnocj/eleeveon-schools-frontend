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
    { key: "position", label: "Position", type: "number" },
    { key: "published", label: "Published", type: "checkbox" }
  ];

export default function Teacherreports() {
  return (
    <DexieCrudPage
      title="Teacher Reports"
      subtitle="Review results and report card items for subjects."
      entityName="result"
      fields={fields}
      tableName="computedResults"
      primaryField="studentId"
      badgeField="grade"
      schoolScoped={true}
      branchScoped={true}
      allowCreate={false}
      allowUpdate={true}
      allowDelete={false}
    />
  );
}
