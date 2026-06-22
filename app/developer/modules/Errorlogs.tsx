"use client";

/**
 * app/developer/modules/Errorlogs.tsx
 * ---------------------------------------------------------
 * LEGACY ROUTE-COMPATIBLE WRAPPER
 * ---------------------------------------------------------
 * Purpose: Runtime error reports and issue triage.
 *
 * This file is intentionally kept as a full component wrapper so old
 * imports keep working while the real upgraded screen lives in
 * DeveloperErrorReports.tsx.
 */

import React from "react";
import DeveloperErrorReports from "./DeveloperErrorReports";

type Props = {
  navigate?: (key: string) => void;
};

export default function Errorlogs(props: Props) {
  return <DeveloperErrorReports {...props} />;
}
