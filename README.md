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