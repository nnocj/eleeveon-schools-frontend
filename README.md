Core File Map
Backend — modify
prisma/schema.prisma
prisma/seed.ts
kk
src/app.module.ts
src/auth/auth.service.ts

src/billing/billing.module.ts
src/billing/billing.controller.ts
src/billing/billing.service.ts
src/billing/dto/billing.dto.ts

src/sync/sync.service.ts
src/sync/sync.controller.ts
src/sync/dto/sync.dto.ts
Backend — create
src/billing/subscription-calculator.service.ts
src/billing/subscription-period.service.ts
src/billing/subscription-change.service.ts
src/billing/pricing-resolution.service.ts
src/billing/private-offers.service.ts
src/billing/private-offers.controller.ts
src/billing/pricing-overrides.service.ts
src/billing/pricing-overrides.controller.ts
src/billing/subscription-jobs.service.ts
src/billing/subscription-reconciliation.service.ts

src/billing/dto/subscription-quote.dto.ts
src/billing/dto/subscription-change.dto.ts
src/billing/dto/private-offer.dto.ts
src/billing/dto/pricing-override.dto.ts

src/billing/types/subscription.types.ts
src/billing/types/proration.types.ts

src/entitlements/entitlements.module.ts
src/entitlements/entitlements.controller.ts
src/entitlements/entitlements.service.ts
src/entitlements/entitlement-resolver.service.ts
src/entitlements/entitlement-policy.service.ts
src/entitlements/usage.service.ts
src/entitlements/usage-reconciliation.service.ts
src/entitlements/entitlement.guard.ts
src/entitlements/resource-limit.guard.ts
src/entitlements/require-feature.decorator.ts
src/entitlements/require-resource.decorator.ts
src/entitlements/quota-exception.ts
src/entitlements/developer-entitlements.controller.ts
src/entitlements/developer-entitlements.service.ts
src/entitlements/types/entitlement-snapshot.ts

src/sync/subscription-sync-policy.service.ts
Frontend — modify
app/providers.tsx
app/page.tsx

app/lib/db.ts
app/lib/db-version.ts
app/lib/db-migrations.ts

app/lib/sync/runSync.ts
app/lib/sync/syncHttp.ts
app/lib/sync/workspaceBootstrap.ts
app/lib/sync/platformCache.ts
app/lib/sync/syncRegistry.ts

app/owner/subscription.tsx
app/components/payments/PaymentCheckout.tsx

app/developer/modules/DeveloperPlans.tsx
Frontend — create
app/context/subscription-context.tsx

app/lib/subscription/types.ts
app/lib/subscription/subscriptionApi.ts
app/lib/subscription/entitlementCache.ts
app/lib/subscription/subscriptionAccess.ts
app/lib/subscription/resourceMap.ts
app/lib/subscription/mutationGuard.ts
app/lib/subscription/subscriptionErrors.ts

app/components/subscription/SubscriptionBootstrap.tsx
app/components/subscription/SubscriptionSummaryCard.tsx
app/components/subscription/SubscriptionUsageGrid.tsx
app/components/subscription/ResourceUsageBar.tsx
app/components/subscription/UpgradeQuoteSheet.tsx
app/components/subscription/RenewalChoiceSheet.tsx
app/components/subscription/ScheduledChangeCard.tsx
app/components/subscription/ProrationBreakdown.tsx
app/components/subscription/ExpiryBanner.tsx
app/components/subscription/GracePeriodBanner.tsx
app/components/subscription/QuotaReachedDialog.tsx
app/components/subscription/SubscriptionExpiredDialog.tsx
app/components/subscription/FeatureUnavailableDialog.tsx

app/developer/modules/DeveloperPrivateOffers.tsx
app/developer/modules/DeveloperAccountEntitlements.tsx
app/developer/modules/DeveloperPricingOverrides.tsx
app/developer/modules/DeveloperSubscriptionChanges.tsx
app/developer/modules/DeveloperUsageAudit.tsx
