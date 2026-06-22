Eleeveon Fees Workflow Fix

Files included:
- Fees.tsx -> app/branch-admin/modules/Fees.tsx
- StudentFees.tsx -> app/student/modules/StudentFees.tsx

Fix purpose:
- Branch Admin fee structures remain templates.
- Branch Admin can generate invoices for one student, a selected class, or all matching students.
- Generated invoices are saved into studentFeeInvoices and items into studentFeeInvoiceItems.
- Student Fees reads generated invoices for the resolved logged-in student.

Important test flow:
1. Create/save fee structure for Basic 1 + Term 2.
2. Click Invoice on that fee structure.
3. Choose target: Selected class or All matching students.
4. Generate invoices.
5. Open StudentFees.tsx as Jonathan's linked student login.
6. Use More to confirm the resolved student ID if nothing appears.
