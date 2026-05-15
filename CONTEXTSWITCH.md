Each page must;
Include


1. active school/branch-aware loading
2. organization/department link
3. active status
4. duplicate protection
5. soft delete
6. professional drawer create/edit flow.



Its purpose should be:
Institution Command Center
Meaning it answers:
For the selected School + Branch, what is happening right now?
So:
schools.tsx = create/manage school identity
branches.tsx = create/manage campuses
dashboardHome.tsx = operate the selected school branch daily
Best dashboard purpose:


Current Context


active school


active branch


current academic structure


current academic period


online/offline sync state




Readiness Monitor


school profile exists


branch exists


classes exist


subjects exist


class subjects exist


assessment applicability exists


scores entered


reports ready




Daily Operations


students


teachers


attendance today


assessment entries


recent payments


recent students




Academic Publishing Focus


report cards ready


subjects configured


class subjects configured


assessment entries entered


missing assessment setup warnings




Action Shortcuts


enter scores


take attendance


generate reports


manage class subjects


collect fees




So the dashboard becomes the daily headmaster/admin overview, not the place for editing school or branch details.
I would slightly reposition it like this:
DashboardHome│├── Welcome / active school + branch context├── Operational cards│   ├── Students│   ├── Teachers│   ├── Classes│   ├── Class Subjects│   ├── Attendance Today│   └── Reports Ready│├── Academic Publishing Readiness│   ├── Curriculum setup│   ├── ClassSubject setup│   ├── Assessment applicability│   ├── Assessment entries│   └── Report generation│├── Today’s Work│   ├── Take attendance│   ├── Enter scores│   ├── Generate reports│   └── Review finance│├── Recent Activity│   ├── recent students│   ├── recent payments│   └── recent assessment entries│└── Finance snapshot
So yes, after having schools.tsx and branches.tsx, the dashboard should become less about setup and more about running the selected branch professionally.



I even think this way is easier for page authorization settings. To say that if your role is the head teacher 
of a branch, then your page is automatically set to your context.

Therefore the authorization structure:

1. So for each branch of a school headmaster/teacher = schoolid + bracnchid context.
2. For each teacher of a school branch = schoolid + bracnchid context (same as headteacher/master)
   + Denied pages/ and not showing in UI eg. Fees, Configuration etc.
   + Preselected filters eg. teacherid + classSubjectId