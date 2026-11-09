# Stage 7 / Step 1 — Commercial Integration Acceptance Matrix

All scenarios start **NOT TESTED**. Run in a separate test backend and disposable PostgreSQL database with Paystack test keys, no production customer records. Capture request IDs, sanitized logs, and observed results. Do not publish JWTs, Paystack secrets or customer data.

| # | Scenario / action | Required outcome | Status |
|---|---|---|---|
| 01 | `npx prisma generate && npm run build` in backend | Successful compile | NOT TESTED |
| 02 | `npm run build` in frontend | Successful compile | NOT TESTED |
| 03 | `node tests/stage7-commercial-check.cjs` | 9/9 source checks | PASSED (isolated) |
| 04 | New trial account created | Correct start/end; no premature expiration | NOT TESTED |
| 05 | Trial expired in test account | Restricts only entitled mutations; existing data readable | NOT TESTED |
| 06 | 59/60 students then admit 60th | 60th succeeds with correct admission identity | NOT TESTED |
| 07 | Attempt 61st student | Rejected by backend when enforcement enabled in test | NOT TESTED |
| 08 | Two simultaneous adds at capacity boundary | At most one succeeds; no sequence collision | NOT TESTED |
| 09 | Server quote for tiered student plan | Correct unique active student count and configured amount | NOT TESTED |
| 10 | Change student count before paying an old quote | Checkout rejects stale quote, does not charge | NOT TESTED |
| 11 | Verified Paystack test payment | Paid only after amount, currency, account and reference checks | NOT TESTED |
| 12 | Repeated success webhook and verify callback | One paid state, one activation and one subscription period | NOT TESTED |
| 13 | Failure webhook after successful payment | Paid transaction is not overwritten by late failure | NOT TESTED |
| 14 | Browser close after checkout initialization | Existing quote recoverable without creating another payment | NOT TESTED |
| 15 | Process crash after order applied, before entitlement rebuild | Repair eventually restores correct effective entitlement | NOT TESTED |
| 16 | Apply older order after switching to newer plan | Repair does not regress plan to superseded order | NOT TESTED |
| 17 | Two test tenant accounts; access other's quote | 403/404; no foreign billing data leaked | NOT TESTED |
| 18 | Scheduler triggered twice for the same renewal period | No competing duplicate payable renewal orders | NOT TESTED |
| 19 | Independent/perpetual plan | Never charged or expired as a recurring cloud subscription | NOT TESTED |
| 20 | Refresh Owner Billing after payment return | Subscription and entitlement state agree; no false success message | NOT TESTED |
| 21 | Review full production npm audit report | Critical/high findings triaged; actionable upgrades planned/tested | NOT TESTED |
| 22 | Backups, rollback and job configuration review | Restore practice documented; new jobs remain observe until verified | NOT TESTED |

## Exit rules

- **Do not enable live payments** until all payment, tenancy, crash recovery, and duplicate-processing scenarios pass in test.
- **Do not enable expiration/quota enforcement** until a disposable school passes the corresponding tests and pilot exemptions are verified.
- `observe` modes are not proof that mutation behavior works; test enforcement in non-production with isolated settings.
- A simulated static test or mock is not a Paystack settlement test, a database isolation test, or proof of Render deployment.
- Any failure blocks corresponding production switch and requires fix + rerun.
