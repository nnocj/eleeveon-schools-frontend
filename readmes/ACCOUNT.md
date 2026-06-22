app/account/
  billing.tsx
  accountUsers.tsx
  ownerProfile.tsx
  syncBackup.tsx
  accountSettings.tsx

prisma UserMembership model
app/lib/auth/roleRedirect.ts update
app/context/account-context.tsx update
app/context/active-membership-context.tsx
app/select-role/page.tsx
app/login/page.tsx update



Yes — this is the right time. Your account/page.tsx is already the owner setup center, and it currently includes Schools, Branches, Billing, Users, Profile, Sync, and Settings as tools. 
I would upgrade it into a real Account Control Center with these sections:
type AccountTool =  | "home"  | "schools"  | "branches"  | "billing"  | "subscription"  | "invoices"  | "payments"  | "users"  | "roles"  | "permissions"  | "profile"  | "sync"  | "settings";
Best grouping:
Institution- Schools- BranchesAccess Control- Account Users- Roles- PermissionsBilling & Subscription- Subscription- Invoices- Payments / BillingSystem- Sync & Backup- Account Settings- Owner Profile
This is better than putting everything under one “Billing” page, because later you will need:
Subscription = plan, limits, expiry, upgrade/downgradeInvoices = bills generated for the account ownerPayments = actual money receivedBilling = overview/dashboard
For permissions, I suggest:
Roles page- Super Admin- Admin- Branch Admin- Teacher- Student- Parent- AccountantPermissions page- What each role can view/create/edit/delete- Feature access by subscription plan- School/branch scope
So yes, the next upgrade should be:
app/account/subscription.tsxapp/account/invoices.tsxapp/account/payments.tsxapp/account/roles.tsxapp/account/permissions.tsx
Then update account/page.tsx to import and list them.
This will make your account area feel like a real SaaS owner dashboard, not just setup pages.