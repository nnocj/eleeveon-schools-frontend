/lib
  db.ts        → offline database (IndexedDB)
  sync.ts      → sync engine (offline → server)

  models/
    student.ts
    teacher.ts
    class.ts
    subject.ts
    score.ts
    assignment.ts

  calculations/
    grading.ts
    scoring.ts

ClassTeacher table = responsibility
Teacher.role = identity

Dashboard (UI only)
   ↓
Modules (Students, Teachers, Fees, Attendance, Promotion)
   ↓
Shared Database (Dexie)
   ↓
Shared “Academic State”
   - term
   - academicYear
   - classId
   - attendance
   - payments
   - scores


WHERE EACH MODULE ACTUALLY CONNECTS

Let’s map it properly:

👨‍🎓 STUDENTS (your current base)

✔ Core entity

Used by:

attendance
fees
promotion
scores

👉 This is your ROOT TABLE

📊 SCORES

Connects to:

promotion.tsx (decision engine)
reports.tsx (report cards)

👉 Drives academic decisions

💰 FEES (VERY IMPORTANT)

Connects to:

students (classId → fee structure)
receipts
arrears system

👉 Financial layer

🕒 STUDENT ATTENDANCE

Connects to:

reports (attendance summary on report cards)
promotion (optional future rule)
parents dashboard (future)

👉 Academic discipline tracking

👨‍🏫 TEACHER ATTENDANCE

Connects to:

payroll (future upgrade)
admin monitoring
HR system

👉 Staff accountability layer

🔁 PROMOTION ENGINE

Connects to EVERYTHING:

students (class movement)
scores (performance)
academicHistory (audit trail)
classes (nextClassMap)

👉 This is your SYSTEM ENGINE

npm install html2pdf.js

Academic Configuration
↓
Assessment Components
↓
Assessments
↓
Results Computation Engine
↓
Computed Results
↓
Reports
↓
Promotion




RESULT EXECUTION LAYER

Meaning:

Define HOW marks are entered
Define HOW marks are computed
Define HOW reports are generated
Define HOW promotion works
Define HOW transcripts/history work

Since you already built the foundation, this is what should come next in order:

1. Assessment Components (NEXT)

This is the most important next step.

Right now you only have:

Assessment Structures
Assessment Items

But you still do NOT have the actual link between:

Class
Subject
Academic Period
Assessment Structure

You need something like:

AssessmentComponent

Example:

Class	Subject	Structure
Basic 5	English	Continuous Assessment
Basic 5	Maths	CA + Exams
SHS 1	Physics	Exams Only

This becomes the live academic setup.

WHY THIS IS IMPORTANT

Because your computation engine cannot compute scores until it knows:

WHICH STRUCTURE APPLIES
TO WHICH CLASS + SUBJECT

Without this:

reports break
assessments break
promotion breaks
ranking breaks
2. Assessment Entries

AFTER components.

This is where teachers enter marks.

Example:

Student	Subject	Class Test	Exam
John	Maths	18	72

This feeds your engine.

3. Results Computation Engine

Then your engine becomes ACTIVE.

It will:

fetch component
fetch structure
fetch items
fetch entries
compute weighted totals
compute grade
compute GPA
compute remarks
compute aggregates
compute ranking
4. Report Generation Engine

This powers:

terminal reports
cumulative reports
transcripts
promotion reports
5. Promotion Engine

This uses results.

Example:

Average >= 50
AND no failed core subjects
→ promote
6. Ranking Engine

Then:

class position
subject position
overall ranking



What I wrote describes a full orchestration engine, not just a calculator.

So your resultsEngine.ts is essentially becoming the brain of the academic results system.

It is coordinating the entire results workflow.

Meaning this single engine is responsible for:

1. Loading academic configuration
2. Loading assessment setup
3. Loading student scores
4. Validating records
5. Computing weighted totals
6. Resolving grades
7. Computing GPA
8. Ranking students
9. Saving computed results
10. Preparing report data
11. Locking/publishing results


Academic Configuration
        ↓
Subject Offering
        ↓
Assessment Applicability
        ↓
Assessment Component
        ↓
Assessment Entry
        ↓
Results Engine
        ↓
Report Engine
        ↓
Promotion Engine
        ↓
Transcript Engine
        ↓
Analytics Engine


The rewrite I’ll produce will therefore include:

proper institutional awareness
organizationId support
academicStructureId awareness
branch-safe filtering
deleted-record protection
responsive academic-config UI styling
summary analytics cards
graceful empty states
session-based entry workflow
safer score validation
structured assessment session loading
stable memoized filtering
proper active entity filtering
scroll-safe assessment grids
expandable/clean table UX
consistent buttons/cards/badges/inputs
resilient no-data rendering
reusable style architecture matching Academic Configuration exactly



Great — the actual issue was the branchId filter removing all students before the class matching logic even ran.
Now the page correctly:


Reads all students from Dexie


Matches student.currentClassId


Updates the visual student count immediately


Shows student names immediately after class selection


Keeps your UI/layout/design unchanged


Still supports subject-based assessment items separately


Your Anthony Asa record now appears because the student is no longer filtered out prematurely.









🧠 SYSTEM CONTRACT (Your Academic Engine Rules)

This is the non-negotiable architecture agreement your whole system must follow.

🔴 1. SINGLE SOURCE OF TRUTH RULE
✔ Contract:

computedResults is the ONLY authoritative academic performance dataset.

Meaning:
All academic performance is derived from computedResults
No other table can override academic truth
Therefore:
Data source	Role
assessmentEntries	raw input only
scores	legacy / fallback only (optional)
computedResults	✅ FINAL TRUTH
❌ Forbidden:
Analytics directly trusting scores
Reports recalculating from assessmentEntries
Transcripts mixing multiple sources unpredictably
🔵 2. COMPUTATION RESPONSIBILITY RULE
✔ Contract:

Only ResultsEngine is allowed to compute academic results.

Meaning:
Only ONE place calculates:
totals
averages
percentages
grades
GPA
positions
❌ Forbidden:
ReportEngine calculating totals
AnalyticsEngine recalculating grades
TranscriptEngine recomputing subject scores
✔ Everyone else:

They ONLY read computedResults

🟣 3. GRADE LOGIC CENTRALIZATION RULE
✔ Contract:

Grade calculation must exist in ONE reusable service.

Example:
GradingService.resolve(branchId, percentage)
Meaning:
NO inline grade logic in engines
NO duplicated grade rule filtering
NO manual min/max comparisons scattered
❌ Forbidden:
score >= 50
repeating gradeRules logic in multiple files
🟢 4. ENGINE RESPONSIBILITY SEPARATION
✔ Contract:
ResultsEngine

"Compute academic truth"

processes assessmentEntries
generates computedResults
assigns grades, GPA, totals, positions
ReportEngine

"Format + persist reports"

reads computedResults ONLY
builds report structure
stores reportCards + reportItems
never computes academic logic
AnalyticsEngine

"Read-only intelligence layer"

reads computedResults ONLY
aggregates stats (school/class/student)
NEVER writes data
TranscriptEngine

"Multi-period aggregation"

reads computedResults ONLY
aggregates across periods
produces historical academic output
🟡 5. WRITING RULE (VERY IMPORTANT)
✔ Contract:

Only 2 systems can write to DB:

ResultsEngine → computedResults
ReportEngine → reportCards, reportItems
❌ Forbidden:
AnalyticsEngine writing anything
TranscriptEngine writing computedResults
random updates to computedResults outside ResultsEngine
🔷 6. TIME / PERIOD CONSISTENCY RULE
✔ Contract:

All academic data MUST always be filtered by:

branchId
academicStructureId
academicPeriodId
classId
Meaning:

No cross-period mixing unless explicitly doing transcript aggregation.

🟠 7. RANKING RULE
✔ Contract:

Rankings are derived ONLY from computedResults

subject position → computedResults (subject scoped)
class position → computedResults (aggregate)
❌ Forbidden:
recalculating ranking in ReportEngine independently
using scores for ranking
🟤 8. IMMUTABILITY RULE (VERY IMPORTANT)
✔ Contract:

Once computedResults.locked = true, it becomes immutable

Meaning:
no overwrite
no recalculation
no report regeneration changes it
🔥 FINAL ARCHITECTURE SUMMARY

Your system becomes:

RAW INPUT
   ↓
assessmentEntries
   ↓
[ ResultsEngine ]
   ↓
computedResults   ← (TRUTH LAYER)
   ↓
────────────────────────────
   ↓        ↓          ↓
Report   Analytics   Transcript
Engine    Engine      Engine
(read)     (read)       (read)







Got it — this db.ts is very solid and already tells a lot about your system design.

Here’s what I’ve now clearly extracted from your architecture (important for the report page later):

🔥 Key architecture insights

1. Your report system is NOT standalone
It must be driven by:

AcademicStructure (school calendar / level setup)
AcademicPeriod (term/semester context)
AssessmentStructure + AssessmentStructureItems (this is your grading blueprint)
AssessmentComponent (ties class + subject + period + structure + grading system)
AssessmentEntry (raw teacher scores)
ComputedResult (final processed results)

👉 So the report page is basically a pipeline executor of rules, not just a display page.

2. Your grading logic is configuration-driven
That means:

No hardcoded “Exam = 50%, Test = 30%”
Everything must come from:
AssessmentStructureItems.weight
AssessmentStructure.totalScore
GradingSystem + GradeRule

3. Your system supports multi-view reporting
We will design report.tsx to support:

Class-wide report (all students)
Single student report
Subject-filtered view
Optional breakdown per assessment item

4. Important: This is a multi-layer join problem
A proper report will need to combine:

Students → Class → Enrollment
Class → AssessmentComponent → Structure
Structure → Items (weights)
Entries → Scores per student per item
Optional computed results override




/reports
  /engine
    classReportEngine.ts   ✅ PURE LOGIC ONLY
  /hooks
    useAcademicData.ts     ✅ DATA LOADING ONLY
  /components
    ReportTemplateRenderer.tsx  ✅ UI ORCHESTRATION
    ReportHeader.tsx
    ReportFilters.tsx
    ReportSummaryCards.tsx
    SubjectReportTable.tsx
    StudentReportCard.tsx
    StudentCumulativeReport.tsx
    ClassBroadsheet.tsx
  /types
    reportTypes.ts         ❌ MINIMAL OR OPTIONAL ONLY
  page.tsx                 ✅ ENTRY ONLY