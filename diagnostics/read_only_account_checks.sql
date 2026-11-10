-- READ ONLY. Does not assign plans, create entitlements, or trigger payment.
-- 1. Verify published plan codes and deployment compatibility.
SELECT id, code, name, "licenseModel", "deploymentMode", "syncPolicy", active
FROM "SubscriptionPlan"
WHERE code IN ('trial','sp002','sp001','sp003','sp004')
ORDER BY code;

-- 2. Display the newest accounts without subscriptions (review IDs privately).
SELECT a.id AS "accountId", a."createdAt", s.id AS "subscriptionId",
       s.status, s."planId", e.id AS "entitlementId", e.status AS "entitlementStatus"
FROM "Account" a
LEFT JOIN "AccountSubscription" s ON s."accountId"=a.id
LEFT JOIN "AccountEntitlement" e ON e."accountId"=a.id
WHERE s.id IS NULL OR e.id IS NULL
ORDER BY a."createdAt" DESC
LIMIT 20;

-- 3. Check just one disposable test account (replace UUID; no write operation).
-- SELECT "accountId", "planId", status, "trialEndsAt", "deploymentMode", "syncPolicy"
-- FROM "AccountSubscription"
-- WHERE "accountId" = 'REPLACE-WITH-DISPOSABLE-TEST-ACCOUNT-UUID';
