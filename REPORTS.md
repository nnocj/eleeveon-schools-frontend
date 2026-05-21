reports/
│
├── Report.tsx
│
├── engine/
│   ├── report-engine.ts
│   └── report-types.ts
│
├── components/
│   ├── ReportFilters.tsx
│   ├── StudentReportCard.tsx
│   ├── SubjectBroadsheet.tsx
│   ├── ClassBroadsheet.tsx
│   ├── ReportHeader.tsx
│   ├── ReportAnalytics.tsx
│   └── ReportExportTools.tsx


reportRemarks.tsx saves remarks this will save the class and headteachers remarks into each report card.
↓
report-engine.ts reads remarks
↓
StudentReportCard.tsx displays remarks


That is enough because:

reportRemarks.tsx saves remarks into db.reportCards
Report.tsx already loads reportCards
report-engine.ts now injects remarks
StudentReportCard.tsx already renders report.classTeacherRemark and report.headTeacherRemark



We should build one helper engine first:
app/dashboard/reports/engine/cumulative-report-engine.ts
Why
Your current Reports.tsx works because it has this flow:
DB tables
↓
report-engine.ts
↓
StudentReportCard / SubjectBroadsheet / ClassBroadsheet↓ReportAnalytics / Print tools


For cumulative records, we need a similar flow:
studentReportSnapshots
↓
cumulative-report-engine.ts this will align the data from thesnapshot to what the templates need to generaate reports.
↓
StudentReportCard / SubjectBroadsheet / ClassBroadsheet↓ReportAnalytics / Print tools


as a paired system: the engine converts archived studentReportSnapshots into report-template datasets, and the page lets you preview/print cumulative student reports, class broadsheets, subject broadsheets, and analytics.

What the new engine will do
FunctionPurposebuildCumulativeStudentReport()Convert one snapshot into StudentReportCardDatasetbuildCumulativeClassBroadsheet()Combine many snapshots into class broadsheet formatbuildCumulativeSubjectBroadsheet()Extract subject records across archived snapshotsbuildCumulativeAnalytics()Students, subjects, class average, highest, lowestbuildCumulativeReportOutput()Main orchestrator, like buildReportEngineOutput()
Then cumulativeRecords.tsx becomes powerful
It will allow:
ModeUsesStudent Report CardStudentReportCardClass BroadsheetClassBroadsheetSubject BroadsheetSubjectBroadsheetAnalyticsReportAnalyticsPrint / Exportsame print section style from Reports.tsx
So yes, before rewriting cumulativeRecords.tsx, the right next file is:
app/dashboard/reports/engine/cumulative-report-engine.ts
Then we rewrite:
app/dashboard/cumulativeRecords.tsx
That is the clean professional architecture.