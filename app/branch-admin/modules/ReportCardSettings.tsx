"use client";
/**
 * app/branch-admin/modules/ReportCardSettings.tsx
 * Uses the report-only view of Branchsettings. All report templates, media,
 * actions and fullscreen modal overlays are managed by that same editor.
 */
import React from "react";
import { BranchSettingsWorkspace } from "./Branchsettings";

export default function ReportCardSettings() {
  return <BranchSettingsWorkspace view="reports" />;
}
