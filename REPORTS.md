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

