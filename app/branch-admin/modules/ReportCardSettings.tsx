"use client";
/**
 * app/branch-admin/modules/ReportCardSettings.tsx
 * Uses the shared Branch Settings report-only editor and its responsive
 * cards/table views and Setup toolbar registrations. No second data store.
 */
import React from "react";
import { BranchSettingsWorkspace } from "./Branchsettings";

export default function ReportCardSettings() {
  return <BranchSettingsWorkspace view="reports" />;
}
