"use client";

import { DexieCrudPage, type CrudField } from "../../components/role-portals/CrudToolkit";

const fields: CrudField[] = [
    { key: "curriculumSubjectId", label: "Curriculum Subject ID", type: "number" },
    { key: "classSubjectId", label: "Class Subject ID", type: "number" },
    { key: "subjectId", label: "Subject ID", type: "number", required: true },
    { key: "classId", label: "Class ID", type: "number" },
    { key: "academicPeriodId", label: "Academic Period ID", type: "number" },
    { key: "teacherId", label: "Teacher ID", type: "number" },
    { key: "room", label: "Room", type: "text" },
    { key: "deliveryMode", label: "Delivery Mode", type: "select", options: [{ label: "Physical", value: "physical" }, { label: "Online", value: "online" }, { label: "Hybrid", value: "hybrid" }] },
    { key: "capacity", label: "Capacity", type: "number" },
    { key: "compulsory", label: "Compulsory", type: "checkbox" },
    { key: "active", label: "Active", type: "checkbox" }
  ];

export default function Courseoutline() {
  return (
    <DexieCrudPage
      title="Course Outline"
      subtitle="Manage subject offerings and delivery context."
      entityName="subject offering"
      fields={fields}
      tableName="subjectOfferings"
      primaryField="subjectId"
      badgeField="active"
      schoolScoped={true}
      branchScoped={true}
      allowCreate={true}
      allowUpdate={true}
      allowDelete={true}
    />
  );
}
