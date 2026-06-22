Owner
├── CalendarOverview.tsx          view only across owned schools
└── Messages.tsx                  optional owner communication
School Admin
├── Calendar.tsx                  school-wide events
├── BranchCalendar.tsx            monitor branch calendars
├── BranchTimetableOverview.tsx   view branch/class/teacher timetable summaries
├── Announcements.tsx
└── Messages.tsx
Branch Admin
├── Calendar.tsx                  branch events
├── BranchTimetable.tsx           whole branch schedule
├── ClassTimetable.tsx            create/manage class timetable
├── TeacherTimetable.tsx          teacher workload/conflict view
├── ExamTimetable.tsx             exam/assessment schedule
├── ResourceTimetable.tsx         rooms/resources
├── Announcements.tsx
└── Messages.tsx
Teacher
├── Calendar.tsx                  personal/class events
├── MyTimetable.tsx               their teaching timetable
├── ClassTimetable.tsx            view assigned class timetable
├── Announcements.tsx
└── Messages.tsx
Parent
├── Calendar.tsx                  child events, meetings, fee deadlines
├── ChildTimetable.tsx            child class timetable
├── Announcements.tsx             receive only
└── Messages.tsx
Student
├── Calendar.tsx                  exams, class events, deadlines
├── MyTimetable.tsx               class/student timetable
├── Announcements.tsx             receive only
└── Messages.tsx                  if school allows
Accountant
├── Calendar.tsx                  fee/payroll/deadline events
├── Announcements.tsx             receive finance/admin notices
└── Messages.tsx

The real creation power should stay mainly here:

Branch Admin = create/manage real operational timetables
School Admin = school-wide calendar + monitoring
Teacher/Parent/Student = mostly view/respond
Owner = high-level overview

That keeps the hierarchy clean and prevents users from changing schedules outside their role.

Yes, I see it.
Your new sync system expects normal school operational tables to use:
prepareSyncData, synced: "pending", deviceId, version, updatedAt.
But your syncTables.ts intentionally excludes:
appUsers, userMemberships, permissionRules
because they are auth/permission context tables, not normal school data sync tables.
So for Schoolusers.tsx, the file I wrote is okay for the ID issue, but it should not blindly use normal prepareSyncData unless we decide to make userMemberships part of the local-first SyncRecord engine. Your sync file clearly says those tables stay backend-driven/excluded.
So the correct rule is:
Students/teachers/classes/assessmentApplicability/etc. → use prepareSyncData.
appUsers/userMemberships/permissionRules → use auth-aware save logic, backend/API later, not normal sync push.
That means I should refine Schoolusers.tsx around your new sync architecture, not treat it like old local CRUD.

Eleeveon Platform
│
├── Schools
├── Learn
├── Business
├── Sites
├── Billing
├── Identity
├── Messaging
└── Analytics

schoolname.eleeveon.site
schoolname.com

I think you're thinking in the right direction.

The biggest companies are often not built by doing work repeatedly for individual clients. They build a system once and then let thousands of customers use it.

Look at:

Shopify
Wix
WordPress.com
Canvas LMS
HubSpot

They are essentially doing what you're describing:

Build once → onboard many customers → maintain one platform → continuously improve it.

What I Like About sites.eleeveon.com

Instead of:

School Management
Learning Platform
Business Platform
Website Builder
all separate

you create:

Eleeveon Platform
│
├── Schools
├── Learn
├── Business
├── Sites
├── Billing
├── Identity
├── Messaging
└── Analytics

Now every customer gets one ecosystem.

Example 1: School Customer

A school signs up for:

schools.eleeveon.com

They automatically get:

schoolname.eleeveon.site

or

schoolname.com

connected.

The website automatically shows:

School logo
About page
Admission page
Contact page
Gallery
News
Announcements
Academic calendar
Results portal
Fee payment portal

without building a website from scratch.

Example 2: Teacher

A teacher creates:

nicholas.eleeveon.site

Connected to Learn.

The website automatically displays:

Courses
Certificates
Biography
Course sales
Blog
Videos

When a student buys a course:

Website
↓
Payment
↓
Eleeveon Learn
↓
Enrollment

All connected.

Example 3: Business

A business signs up for:

business.eleeveon.site

and gets:

Inventory
Products
Services
Bookings
Payments
CRM
Website

all connected.

The Bigger Opportunity

What excites me more is not websites.

It's Identity + Data Reuse.

Imagine:

Nicholas logs in once.

He can access:

Schools
Learn
Business
Sites

using one account.

Then:

School data
↓
feeds
↓
Website

No duplication.

For example:

School updates logo.

The website updates automatically.

School publishes announcement.

The website updates automatically.

School changes contact information.

The website updates automatically.

That's powerful.

If I Were Designing Eleeveon Long-Term

I would eventually have:

accounts.eleeveon.com

Identity Platform

schools.eleeveon.com

School OS

learn.eleeveon.com

Learning OS

business.eleeveon.com

Business OS

sites.eleeveon.com

Website OS

payments.eleeveon.com

Billing Platform

api.eleeveon.com

Developer Platform

One Caution

I would not build Sites next.

If August 2026 is your target:

Finish Schools.
Finish Learn.
Finish Business.
Get customers.
Then build Sites.

Why?

Because Sites becomes much easier after the other three exist.

The Sites product can simply expose existing data:

Schools data → website
Learn data → course website
Business data → business website

Instead of creating everything from scratch.

That's how you get the leverage you're looking for:

One platform, one codebase ecosystem, many customers, many revenue streams, and every improvement benefits everyone using Eleeveon.