"use client";

import { DexieCrudPage, type CrudField } from "../../components/role-portals/CrudToolkit";

const fields: CrudField[] = [
    { key: "studentId", label: "Student ID", type: "number", required: true },
    { key: "classId", label: "Class ID", type: "number", required: true },
    { key: "academicStructureId", label: "Academic Structure ID", type: "number" },
    { key: "academicPeriodId", label: "Academic Period ID", type: "number" },
    { key: "date", label: "Date", type: "date", required: true },
    { key: "status", label: "Status", type: "select", required: true, options: [{ label: "Present", value: "present" }, { label: "Absent", value: "absent" }, { label: "Late", value: "late" }] }
  ];

export default function Attendance() {
  return (
    <DexieCrudPage
      title="Class Attendance"
      subtitle="Record and update student attendance."
      entityName="attendance"
      fields={fields}
      tableName="attendance"
      primaryField="date"
      badgeField="status"
      schoolScoped={true}
      branchScoped={true}
      allowCreate={true}
      allowUpdate={true}
      allowDelete={true}
    />
  );
}
