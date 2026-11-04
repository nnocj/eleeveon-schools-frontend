Eleeveon Schools — Revised Stage 0 Audit and Commercial Rollout Plan
Date: 2026-11-04
Status: Static code review / implementation plan. No live database edits or deployments performed.
Guiding principle
Distinguish (1) self-service public free trial, (2) account-specific protected pilot/complimentary access, and (3) paid commercial purchases. Commercial acquisition, deployment, feature rights, and payment arrangements remain separate dimensions of one application.
Confirmed existing foundation
- prisma/schema.prisma: SubscriptionPlan has maxStudents, maxUsers, maxTeachers, feature flags, deployment and licensing properties. AccountSubscription has status (default trial), trialStartedAt, trialEndsAt, currentPeriodEnd, graceEndsAt, plan linkage. AccountEntitlement has source, validUntil, status, feature flags, maximum students and other limits, overrides, and access mode.
- src/auth/auth.service.ts: registration looks up SubscriptionPlan.code = "trial" and only if found creates a trial AccountSubscription with a fixed 14-day duration. It does not prove a trial plan is actually present in the deployed DB.
- src/entitlements/entitlement-resolver.service.ts: recognizes trial, combines plan feature and limit data, and maps dates into an effective entitlement.
- src/entitlements/usage.service.ts and resource-limit.guard.ts: count records and check resource limits. The reviewed backend showed no application of @RequireResource to student-creation endpoints; this is not proof the live endpoints are safe from over-limit writes.
- src/billing/subscription-reconciliation.service.ts: reconciles expiry based on currentPeriodEnd; we need immediate date-aware authorization at write time, not dependence solely on reconciliation.
- app/lib/billing/subscriptionAccess.ts: recognizes trial and checks expiry on frontend, but frontend alone is not authoritative.
Important code-level risks to address first
- src/billing/billing.service.ts: customer-scoped confirmPayment can call markPaymentPaid / activation without independent proof of payment; secure before introducing paid onboarding.
- Admin offer, price, and licence endpoints lack visibly complete platform-role authorization; add controller AND service enforcement before exposing new purchase paths.
- src/licenses/licenses.module.ts exists but is not imported into the supplied src/app.module.ts. Register only after security hardening.
- Paystack signature should be verified over raw request bytes, and amount/currency/reference checked before exactly-once fulfillment.
- src/sync/subscription-sync-policy.service.ts has a full-sync legacy fallback for accounts with no entitlement snapshot unless strict enforcement is enabled. NEVER flip this switch globally until each pilot's entitlements are verified and a staged rollout is tested.
- Existing AccountEntitlement appears singular per account: design explicit resolution priority rather than using overlapping and conflicting grants. Preserve paid rights when a trial expires.
Public trial: proposed starting defaults (business choices, NOT yet implemented)
- 14 days (matches current auth implementation).
- Up to 30 active students per school account, 1 school, 1 branch, 2-3 staff users; exact values are adjustable.
- Enable basic assessment entry, student profiles, report preview/print and Excel import; restrict commercial add-ons and exceptional storage usage per policy.
- No payment card required at registration; verified email and anti-abuse checks before high-cost use.
- Trial expiration is the earlier of duration ending or a hard quota hitting a prohibited new mutation. Hitting student quota should block additional student admissions, not prematurely disable viewing current reports.
- Prompts: explain trial limits at onboarding, warn before expiry, and show available paid packages as expiration approaches.
- On expiry: preserve data and allow login, viewing, data export and purchase; block premium or new mutations as permitted by a clear per-action policy. Never delete data due to trial expiry.
- Trial -> paid Cloud: retain same account/school/branch/students; verified payment triggers active paid subscription and rebuilds entitlement atomically/idempotently.
- Trial -> Independent: require a supported migration/backup/import path, correct licences, and installation verification; do not imply instant conversion exists already.
- Anti-abuse: control repeated trials by account/business identity and verified owner; do not solely trust browser storage; staff memberships do not create new school trials.
Protected pilot accounts: Joeracle Montessori School and United Star of Hope
- Both existing school accounts continue operating with no automatic commercial cutover during the current pilot.
- Identify each by canonical Account.id and any relevant school/branch IDs before writing policy. Never match by school display-name substring.
- Audit live current subscription, entitlement, plan, deployment/sync policies, counts, and snapshots without editing them.
- Introduce an Eleeveon-admin-controlled pilot or complimentary access designation with explicit allowed features/limits and a review date. Do not make a public trial the source of their permissions.
- Preserve current effective feature access and limits during transition; do not lower maxStudents, revoke existing entitlements, or reset current periods in a global seed.
- Pilot review date is NOT an automatic hard-lock date. After review, Eleeveon can extend, invite purchase, or arrange a manual transition. Keep existing school records and safe read/export access.
- Introduce pilot changes behind explicit account IDs and shadow-mode policy comparisons; log and verify with the existing workflow before switching enforcement.
- No student/payment real data or actual DB IDs are contained in this roadmap. Do not pretend the DB has been changed or pilots activated.
Revised implementation sequence
Stage 0 — Audit & freeze (CURRENT)
1. Inspect schema, authentication trial bootstrap, entitlement and resource checks, billing security, licence module registration, synchronization policies.
2. Record pilot exemption strategy and migration/rollback plan.
3. Audit live pilot records read-only before any production edit (remaining runtime task).
4. Verify seeded trial plan, student creation/import/sync paths, exact entitlement resolution/expiry behavior (remaining integration task).
   Deliverable: this audited plan; no code changes.
Stage 1 — Commercial security & pilot safety
1. Fix customer payment confirmation vulnerability and trusted platform operator privileges.
2. Restrict private offers, overrides, licence issuance and cross-account operations at controller and service layers.
3. Fix verified Paystack webhook, amount and currency verification, and idempotent fulfillment.
4. Create pilot protection/reconciliation policy and account-scoped migration for Joeracle and United Star of Hope. Confirm read-only audit snapshots, rollback, and account-level tests first.
5. Register the Licences module after permissions are secured.
Stage 2 — Canonical entitlements & access modes
1. Establish acquisition state (trial, pilot/complimentary, paid, perpetual) separately from deployment and payment arrangement.
2. Define explicit precedence for active paid licences, pilot grants, and public trial; avoid one account's expired trial overriding stronger rights.
3. Implement effective-access decision as date-aware and action-specific (read, write, export, billing, offline sync), with account and branch checks.
4. Reconcile legacy snapshots and test all schools before enabling strict sync access. Put enforcement behind feature flags per account/environment.
Stage 3 — Self-service trial enrollment
1. Ensure seeded trial plan exists and make trial duration/limits server-configurable, not hardcoded in auth service.
2. Guarantee atomic idempotent initial subscription and entitlement creation on registration.
3. Limit repeat trials, verify ownership and establish onboarding success path.
4. Introduce status/usage endpoints and visible trial counter (days and students remaining).
Stage 4 — Resource enforcement at every entry point
1. Cover direct admissions, Excel imports, bulk creation, local-first sync push, and potential API paths.
2. Count active unique students consistently, handle soft deletion/reuse, and ensure atomic concurrent caps where needed.
3. Enforce resource quotas on server; frontend previews and local caching mirror authoritative caps.
4. Allow edits, report view, export, and safe recovery while at quota; block only defined quota-increasing operations.
Stage 5 — Trial expiry and paid conversion
1. Expiry warnings, package chooser and checkout; no destructive downgrade.
2. Trial-to-Cloud subscription transition with original school data preserved.
3. Guarded conversion into Independent editions only after supported backup, activation and migration.
4. Reminder messaging only with appropriate consent and frequency.
Stage 6 — Pilot-to-commercial transitions
1. Individually review Joeracle and United Star of Hope, their readiness, custom price and agreed start date.
2. No automated billing/policy switch simply because a review date passes.
3. Preserve data, configured school setup and existing offline records after transition.
Stage 7 — Payments, licences, installations, standalone modes and modules
Continue existing ordered deployment roadmap: purchase/fulfillment, signed offline licences, Independent Essentials, backup/restore, add-ons and bundles, Independent Multi-device, upgrades and management UI. Run security and no-regression tests at every step.
Suggested phased rollout
- Phase A: secure code and prove existing pilot behavior; freeze pilots' current rights.
- Phase B: launch new trial flow to internal test accounts only; test quotas/expiry, reports, sync, and paid conversion.
- Phase C: enable public trials selectively behind a rollout flag; monitor usage and cost.
- Phase D: allow independent pilot transitions after school-specific readiness review.
Stage 0 completion definition
Static architecture review updated for trials/pilots: YES.
Production school entitlement/plan records verified: NO.
Trial plan seeded in live database verified: NO.
Cross-path quota enforcement verified: NO.
Pilot protected entitlements written: NO.
Immediate next code work
Begin Stage 1 security patches, but concurrently prepare read-only pilot account SQL/report and an account-level protection policy. Do not deploy a global trial-enforcement default or reset pilot subscriptions. Include tests showing both pilots still admit students, import data, sync, and generate reports exactly as before.