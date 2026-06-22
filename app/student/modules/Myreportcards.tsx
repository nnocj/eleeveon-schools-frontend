"use client";

import { DexieCrudPage, type CrudField } from "../../components/role-portals/CrudToolkit";

const fields: CrudField[] = [
    { key: "studentId", label: "Student ID", type: "number" },
    { key: "classId", label: "Class ID", type: "number" },
    { key: "academicPeriodId", label: "Academic Period ID", type: "number" },
    { key: "total", label: "Total", type: "number" },
    { key: "average", label: "Average", type: "number" },
    { key: "position", label: "Position", type: "number" },
    { key: "attendancePercent", label: "Attendance %", type: "number" },
    { key: "published", label: "Published", type: "checkbox" }
  ];

export default function Myreportcards() {
  return (
    <DexieCrudPage
      title="My Report Cards"
      subtitle="Published report cards visible to the student."
      entityName="report card"
      fields={fields}
      tableName="reportCards"
      primaryField="academicPeriodId"
      badgeField="published"
      schoolScoped={true}
      branchScoped={true}
      allowCreate={false}
      allowUpdate={false}
      allowDelete={false}
    />
  );
}
