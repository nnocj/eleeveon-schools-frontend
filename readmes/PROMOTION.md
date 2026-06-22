This is a major workflow, so I’ll separate it into architecture first, then the exact files/tables needed before writing promotion.tsx. Your idea is correct: promotion should also archive the report snapshot, not just move students.

Thought for 7s

Yes — your thinking is correct.

You need two connected systems:

Module	Purpose
promotion.tsx	Move students from one class/period to another
cumulativeRecords.tsx	View archived report snapshots over years/terms/semesters
What should happen during promotion
Select class + academic period
↓
System calculates student performance
↓
Shows recommendation:
Promote / Repeat / Graduate
↓
Admin can override
↓
Click Promote
↓
System creates historical report snapshot
↓
System creates new StudentEnrollment for next period/class
↓
Old enrollment is marked completed/promoted