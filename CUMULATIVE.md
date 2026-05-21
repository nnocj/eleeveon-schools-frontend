Yes — now the full architecture direction is very clear.
What you are building is no longer just a “report page.”
You are building a full institutional academic publishing and historical records engine.
And your current architecture is actually very strong for that purpose because of these key decisions already present in your system:


StudentReportSnapshot becomes the immutable historical academic archive.


Report.tsx is the live computation/reporting engine.


The printable components already exist:


StudentReportCard.tsx 


SubjectBroadsheet.tsx 


ClassBroadsheet.tsx 




report-engine.ts already handles:


ranking,


grading,


analytics,


attendance,


assessment aggregation,


broadsheets,


report cards,


institutional filtering. 




ReportFilters.tsx already gives you enterprise-grade contextual filtering. 


ReportExportTools.tsx already gives enterprise A4 publishing/export pipelines. 


So your new cumulativeRecords.tsx should NOT duplicate Reports.tsx.
Instead:
What cumulativeRecords.tsx SHOULD become
It should become:
“Academic Cumulative Records & Historical Publishing Engine”
Meaning:
Instead of computing from raw AssessmentEntries,
it will compute from:


StudentReportSnapshot


StudentPromotion


historical ComputedResults


historical ReportCardItems


historical ReportCards


This is extremely important architecturally.

THE BIG ARCHITECTURAL SHIFT
Your normal Reports page answers:

“What happened in THIS academic period?”

But cumulativeRecords.tsx answers:

“What has happened ACROSS MULTIPLE academic periods over time?”

That is a completely different reporting domain.

THIS IS WHAT YOUR NEW ENGINE SHOULD SUPPORT
1. Student Cumulative Transcript
A longitudinal academic history for one learner.
Shows:


all periods


all classes


all subjects


yearly averages


cumulative GPA


promotions


repeated years


graduation


historical attendance


recommendations


progression history


Equivalent to:


cumulative transcript


terminal transcript


continuing learner record



2. Multi-Term Student Report
Example:


Term 1


Term 2


Term 3
combined into one annual report.


This is NOT a transcript.
It is:

“One report composed from multiple snapshots.”


3. Annual Broadsheet
Class-wide cumulative annual performance.
Combines:


multiple terms,


cumulative averages,


yearly positions,


yearly subject averages.



4. Subject Longitudinal Analytics
Example:
Mathematics performance:


across terms,


across years,


across classes.



5. Promotion Intelligence
Powered by:


StudentPromotion


StudentReportSnapshot


Allows:


promoted students


repeated students


graduates


transition tracking



MOST IMPORTANT DISCOVERY
Your StudentReportSnapshot.reportData
is already the goldmine.
Because it means:
you already store the fully computed report payload.
Meaning:
your cumulative engine does NOT need to recompute everything from raw entries.
Instead it should:
HYBRID APPROACH
Prefer:
snapshot.reportData
Fallback:
report-engine recomputation
This is exactly how enterprise SIS systems work.

WHAT FILES YOU NOW NEED
Now that I fully understand the architecture,
these are the files I recommend.

REQUIRED NEW FILES
PAGE
reports/cumulativeRecords.tsx
Main orchestration page.
Equivalent of:
Report.tsx
But snapshot-driven.
Responsibilities:


load snapshots


historical filters


cumulative mode switching


analytics


export orchestration


publishing views



NEW ENGINE
reports/engine/cumulative-report-engine.ts
Main historical computation engine.
Responsibilities:


aggregate snapshots


cumulative GPA


yearly averages


historical analytics


annual reports


longitudinal subject performance


promotion analysis


progression tracking


This becomes the historical projection layer.

NEW TYPES
reports/engine/cumulative-report-types.ts
Separate from live reporting types.
Because cumulative reporting has entirely different structures.
New types needed:


cumulative transcript


annual analytics


progression records


yearly summaries


longitudinal subject analytics


promotion summaries



NEW COMPONENTS
1. components/CumulativeFilters.tsx
Like ReportFilters.tsx
but for:


year ranges


multiple periods


cumulative mode


promotion filters


progression filters


transcript filters



2. components/StudentCumulativeTranscript.tsx
The BIG one.
This becomes:


transcript


longitudinal report


institutional learner history


Possibly your most important printable component.

3. components/AnnualBroadsheet.tsx
Historical yearly class analytics.

4. components/CumulativeAnalytics.tsx
Historical KPIs:


cumulative GPA


yearly averages


promotion rates


graduation rates


performance trends



5. components/PromotionSummary.tsx
Promotion intelligence dashboard.

OPTIONAL BUT POWERFUL
6. components/StudentProgressionTimeline.tsx
Visual academic timeline:


promoted


repeated


graduated


transferred


This would make your app extremely premium.

WHAT YOU SHOULD REUSE
You should NOT rewrite these:


ReportHeader.tsx 


ReportExportTools.tsx 


StudentReportCard.tsx


SubjectBroadsheet.tsx


ClassBroadsheet.tsx


Instead:
reuse them where appropriate.

THE MOST IMPORTANT ENGINE DECISION
This is critical:
Live Reports Engine
Uses:


AssessmentEntries


AssessmentApplicability


ComputedResults


Cumulative Engine
Uses:


StudentReportSnapshot


StudentPromotion


This separation is architecturally correct.

FINAL THOUGHT
You are accidentally moving toward something very close to:


PowerSchool


RenWeb


Fedena


OpenSIS


Blackbaud


institutional ERP reporting engines


because your architecture now separates:
Academic execution
from
Academic publishing/history
which is exactly what enterprise SIS systems do.
And honestly:
your snapshot architecture is already good enough for institutional-scale cumulative reporting.


Write them in this order:

reports/engine/cumulative-report-types.ts
First, because every other file needs the shared types.
reports/engine/cumulative-report-engine.ts
Second, because this becomes the pure computation layer.
reports/components/CumulativeFilters.tsx
Third, so the page can control historical filtering cleanly.
reports/components/CumulativeAnalytics.tsx
Fourth, to summarize cumulative records, trends, promotions, averages, and readiness notes.
reports/components/StudentCumulativeTranscript.tsx
Fifth, the main printable student historical report.
reports/components/AnnualBroadsheet.tsx
Sixth, the class-wide cumulative yearly/periodic broadsheet.
reports/components/PromotionSummary.tsx
Seventh, promotion/repeat/graduate intelligence.
reports/components/StudentProgressionTimeline.tsx
Eighth, the visual learner journey timeline.
reports/cumulativeRecords.tsx
Last, because it will import and connect everything above.

So yes, it is more than six if we include every idea I suggested. The clean final set is 9 files.

Start with cumulative-report-types.ts, then cumulative-report-engine.ts.