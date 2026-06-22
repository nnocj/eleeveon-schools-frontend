"use client";

import { DexieCrudPage, type CrudField } from "../../components/role-portals/CrudToolkit";

const fields: CrudField[] = [
    { key: "schoolId", label: "School ID", type: "number" },
    { key: "branchId", label: "Branch ID", type: "number" },
    { key: "academicYear", label: "Academic Year", type: "text" },
    { key: "currentTerm", label: "Current Term", type: "text" },
    { key: "currentAcademicStructureId", label: "Current Structure ID", type: "number" },
    { key: "currentAcademicPeriodId", label: "Current Period ID", type: "number" },
    { key: "primaryColor", label: "Primary Color", type: "text" },
    { key: "theme", label: "Theme", type: "select", options: [{ label: "Light", value: "light" }, { label: "Dark", value: "dark" }] }
  ];

export default function Schoolsettings() {
  return (
    <DexieCrudPage
      title="School Settings"
      subtitle="Configure branch/school academic, theme and report settings."
      entityName="setting"
      fields={fields}
      tableName="schoolBranchSettings"
      primaryField="academicYear"
      badgeField="active"
      schoolScoped={true}
      branchScoped={false}
      allowCreate={true}
      allowUpdate={true}
      allowDelete={true}
    />
  );
}
