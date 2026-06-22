# Layout import guide

## TeacherLayout

Replace:

```ts
import StudentAttendance from "../../dashboard/studentAttendance";
import AssessmentEntriesPage from "../../dashboard/assessmentEntry";
import CourseOutline from "../../dashboard/courseOutline";
import ReportRemarks from "../../dashboard/reportRemarks";
```

With:

```ts
import TeacherStudentAttendance from "../../teacher/modules/TeacherStudentAttendance";
import TeacherAssessmentEntry from "../../teacher/modules/TeacherAssessmentEntry";
import TeacherCourseOutline from "../../teacher/modules/TeacherCourseOutline";
import TeacherReportRemarks from "../../teacher/modules/TeacherReportRemarks";
```

Then use:

```tsx
if (tab === "studentAttendance") return <TeacherStudentAttendance />;
if (tab === "assessmentEntry") return <TeacherAssessmentEntry />;
if (tab === "courseOutline") return <TeacherCourseOutline />;
if (tab === "reportRemarks") return <TeacherReportRemarks />;
```

## AccountantLayout

Use imports from:

```ts
../../accountant/modules
```

## SchoolAdminLayout

Use imports from:

```ts
../../school-admin/modules
```

## BranchAdminLayout

Use imports from:

```ts
../../branch-admin/modules
```

## StudentLayout

Use imports from:

```ts
../../student/modules
```

## ParentLayout

Use imports from:

```ts
../../parent/modules
```
