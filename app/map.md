Eleeveon Schools — Complete Commercial & Deployment Roadmap
Our goal is to build one configurable Eleeveon Schools application that can support different deployment options, payment arrangements, paid modules, special school packages, upgrades, and additional services.

I've reviewed the uploaded Prisma schema, backend structure, frontend contexts, payment components, database files, and synchronization infrastructure.

The new plan will reuse these foundations rather than create separate applications for every package.
The structure we are building
Eleeveon Schools

Shared software, data models and reporting engine


Deployment options


Payment arrangements


Optional paid modules


Custom feature bundles


Upgrades and versions


Installation and services




School-specific licences and commercial packages


The commercial possibilities
Revenue opportunity	Examples
Subscriptions	Cloud, termly or annual
Outright sales	Independent Essentials or Multi-device
Flexible ownership	Installments leading to a perpetual licence
Module sales	Identity cards, QR access, transport, websites, advanced analytics
Bundle sales	Custom combinations of modules
Edition upgrades	Essentials to Multi-device
Version upgrades	Paid major releases where applicable
Services	Installation, data migration, training, support
Future deployments	School-hosted servers or managed private infrastructure

These are possible income sources, not all features we must develop immediately.

The most important design decision: deployment, payment arrangement, and feature entitlement must be separate concepts. A school should be able to purchase a module without unnecessarily changing how its entire application is deployed.
The complete numbered implementation plan
All paths below are based on your existing project structure. Backend files are under src/; frontend files are under app/. Files marked CREATE are proposed new files.
1. Define the universal commercial rules
This is the foundation for every future package, module and deployment option.

UPDATE — Backend
- src/entitlements/types/entitlement.types.ts
- src/entitlements/types/entitlement.constants.ts
- src/licenses/types/license.types.ts
UPDATE — Frontend
- app/lib/subscription/types.ts
- app/lib/db/access/commercial-access.types.ts
CREATE — Backend
- src/commercial/commercial.constants.ts
- src/commercial/commercial.types.ts
- src/commercial/feature-catalog.ts
- src/commercial/deployment-policy.ts
CREATE — Frontend
- app/lib/commercial/types.ts
- app/lib/commercial/featureRegistry.ts
- app/lib/commercial/deploymentRules.ts
Result: One consistent definition of editions, deployment modes, purchasing methods, module keys, resource limits, add-ons and upgrades.

We won't hardcode five commercial packages into application logic.
2. Secure all commercial management endpoints
UPDATE — Backend
- src/licenses/licenses.controller.ts
- src/licenses/license-activation.service.ts
- src/billing/billing.controller.ts
- src/billing/private-offers.controller.ts
- src/billing/pricing-overrides.controller.ts
- src/billing/billing.service.ts
REUSE
- src/common/roles.guard.ts
- src/common/roles.decorator.ts
Result: Only authorized Eleeveon administrators can create prices, confirm manual commercial payments, issue licences, grant paid modules or revoke access. School owners can purchase packages but cannot issue their own entitlements.
3. Extend Prisma for separately purchased modules
Your existing SubscriptionPlan, AccountFeatureFlag, PrivateOffer, AccountEntitlement and licensing models already provide the base. Pasted text.txt


The missing concept is an independently purchased module with its own payment history, validity period, activation rights and upgrade conditions.

UPDATE — Backend
- prisma/schema.prisma
- src/entitlements/entitlement-resolver.service.ts
CREATE — Backend
- src/commercial/commercial.module.ts
- src/commercial/module-catalog.service.ts
- src/commercial/module-grants.service.ts
- src/commercial/dto/module-purchase.dto.ts
Proposed Prisma additions, only where necessary after reconciliation:
- CommercialModule — identifies independently sellable modules.
- AccountModuleGrant — records a school's permanent or time-limited module rights.
- CommercialOrderItem — links purchased modules/services to existing invoices and payments.
Result: A school can retain its base package and independently purchase Identity & Access, transport or other compatible modules.
4. Build the flexible pricing and quotation engine
UPDATE — Backend
- src/billing/pricing-resolution.service.ts
- src/billing/private-offers.service.ts
- src/billing/pricing-overrides.service.ts
- src/billing/billing.service.ts
CREATE — Backend
- src/commercial/commercial-quote.service.ts
- src/commercial/commercial-quote.controller.ts
- src/commercial/bundle-pricing.service.ts
CREATE — Frontend
- app/lib/commercial/catalogApi.ts
- app/lib/commercial/quoteApi.ts
- app/components/commercial/PackageSelector.tsx
- app/components/commercial/PackageConfigurator.tsx
- app/components/commercial/QuotationSummary.tsx
Result: Eleeveon can generate public prices, private offers, volume discounts, special founding-school prices, installment prices, bundled module prices and upgrade quotations.

For example, Bethesda's earlier GH₵750-per-term proposal can be represented as a school-specific agreement rather than altering the public price for every school.
5. Implement one entitlement system for every product feature
This is one of the most important steps.

UPDATE — Backend
- src/entitlements/entitlement-resolver.service.ts
- src/entitlements/entitlement-policy.service.ts
- src/entitlements/entitlements.service.ts
- src/entitlements/feature.guard.ts
UPDATE — Frontend
- app/context/subscription-context.tsx
- app/lib/subscription/entitlementCache.ts
- app/lib/db/access/effective-access.ts
- app/components/subscription/AccessGate.tsx
- app/components/subscription/SubscriptionBootstrap.tsx
- app/hooks/useSubscriptionGuard.ts
- app/providers.tsx
CREATE — Frontend
- app/lib/commercial/effectiveEntitlement.ts
- app/lib/commercial/featureAccess.ts
- app/hooks/useCommercialAccess.ts
- app/components/commercial/FeatureAccessGate.tsx
Result: One system combines base-package rights, purchased modules, valid special offers, deployment restrictions, device limits and version rights.

The backend must enforce commercial permissions as well as the frontend. Hidden buttons alone are not sufficient.
6. Connect all commercial purchases and payments
UPDATE — Backend
- src/billing/billing.service.ts
- src/billing/payment-providers/payment-provider.service.ts
- src/billing/payment-providers/providers/paystack.provider.ts
- src/billing/payment-providers/providers/manual.provider.ts
- src/licenses/perpetual-license.service.ts
UPDATE — Frontend
- app/components/payments/PaymentCheckout.tsx
- app/components/payments/payment-types.ts
- app/components/payments/payment-utils.ts
CREATE — Backend
- src/commercial/commercial-purchase.service.ts
- src/commercial/commercial-purchase.controller.ts
- src/commercial/payment-fulfillment.service.ts
CREATE — Frontend
- app/lib/commercial/purchaseApi.ts
- app/components/commercial/CommercialCheckout.tsx
- app/components/commercial/PurchaseHistory.tsx
Result: Schools can purchase subscriptions, perpetual licences, add-ons and upgrades. The backend verifies payment and grants the corresponding rights only once.

Keep school fee payments separate from Eleeveon's own commercial sales ledger, even if they reuse payment UI components.
7. Implement flexible ownership and installment payments
UPDATE — Backend
- src/licenses/perpetual-license.service.ts
- src/licenses/licenses.module.ts
- src/billing/billing.service.ts
CREATE — Backend
- src/licenses/license-agreement.service.ts
- src/licenses/license-installment.service.ts
- src/licenses/license-installment.controller.ts
CREATE — Frontend
- app/lib/commercial/installmentApi.ts
- app/components/commercial/InstallmentSchedule.tsx
- app/components/commercial/InstallmentPayment.tsx
- app/components/commercial/OwnershipProgress.tsx
Result: Both Essentials and Multi-device can support outright purchases or Flex ownership.

Each verified installment updates the balance. Completion produces permanent licence rights. Overdue-payment rules must be explicit, with continued access to exporting the school's data.
8. Implement permanent and temporary offline licences
Your existing backend already has activation, validation and licence-policy services. We should extend them, not replace them.

UPDATE — Backend
- src/licenses/license-crypto.service.ts
- src/licenses/license-activation.service.ts
- src/licenses/license-validation.service.ts
- src/licenses/license-policy.service.ts
- src/licenses/types/license.types.ts
CREATE — Backend
- src/licenses/license-token.service.ts
- src/licenses/license-renewal.service.ts
UPDATE — Frontend
- app/lib/db/modules/commercial-access.tables.ts
- app/lib/db/access/commercial-access.types.ts
CREATE — Frontend
- app/lib/licenses/licenseVerifier.ts
- app/lib/licenses/licenseStorage.ts
- app/lib/licenses/deviceIdentity.ts
- app/components/commercial/LicenseActivation.tsx
- app/components/commercial/LicenseStatus.tsx
Result: A school can activate an installation, operate offline within its rights, receive temporary Flex renewals, and obtain a permanent licence after completing payment.

We should replace offline-dependent HMAC verification with a signing design where Eleeveon holds the private key and installations verify using a public key.
9. Complete native and desktop deployment preparation
UPDATE — Frontend project configuration
- capacitor.config.ts — after verifying the installed configuration.
- next.config.ts — after checking compatibility with the native build.
- package.json — build scripts and native dependencies.
- app/components/AppUpdateManager.tsx
- app/components/DatabaseBootstrap.tsx
CREATE — Frontend
- app/lib/native/platformCapabilities.ts
- app/lib/native/storageBridge.ts
- app/lib/native/installationIdentity.ts
- app/lib/native/nativeUpdatePolicy.ts
Result: We establish working packaging and persistent storage for supported native devices.

Capacitor covers Android/iOS. A Windows Independent installation requires a separate supported desktop strategy; we should verify that before selecting the final installer architecture.
10. Build Independent Essentials offline operation
UPDATE — Frontend
- app/lib/offline/launchResolver.ts
- app/lib/sync/runSync.ts
- app/lib/sync/resolveSyncPolicy.ts
- app/lib/sync/syncScheduler.ts
- app/components/SyncBootstrap.tsx
- app/context/active-membership-context.tsx
- app/components/role-portals/RolePortalShell.tsx
CREATE — Frontend
- app/lib/independent/independentRuntime.ts
- app/lib/independent/localAuth.ts
- app/lib/independent/localMembership.ts
- app/lib/independent/installationSettings.ts
- app/components/commercial/IndependentSetup.tsx
Result: One administrative installation can run the included modules without contacting Eleeveon's servers for routine operations.

Initial Essentials should support Owner and Branch Admin, assessment/report generation, attendance, Excel imports and the included financial operations.
11. Implement complete backups, restore and migration
UPDATE — Frontend
- app/lib/db/db-backup.ts
- app/lib/db/db.ts
- app/lib/db/db-migrations.ts
- app/components/DatabaseBootstrap.tsx
CREATE — Frontend
- app/lib/independent/backupService.ts
- app/lib/independent/restoreService.ts
- app/lib/independent/backupEncryption.ts
- app/lib/independent/backupManifest.ts
- app/lib/independent/cloudMigration.ts
- app/components/commercial/BackupSettings.tsx
- app/components/commercial/RestoreBackup.tsx
Result: Schools can create encrypted, verified backups, including media, restore on another device, and migrate from Cloud to Independent.

School-controlled folder synchronization can transport the backup files without integrating directly with Google Drive's API.
12. Build the optional-module purchasing system
This turns features you've already developed into additional commercial opportunities.

UPDATE — Backend
- src/commercial/module-catalog.service.ts
- src/commercial/module-grants.service.ts
- src/entitlements/entitlement-resolver.service.ts
- src/identity/identity.controller.ts — where Identity & Access features require paid entitlement enforcement.
UPDATE — Frontend
- app/lib/subscription/types.ts
- app/components/subscription/AccessGate.tsx
- app/components/role-portals/RolePortalShell.tsx
CREATE — Backend
- src/commercial/module-purchase.service.ts
- src/commercial/module-bundle.service.ts
CREATE — Frontend
- app/components/commercial/ModuleCatalog.tsx
- app/components/commercial/ModuleDetails.tsx
- app/components/commercial/ModuleCheckout.tsx
- app/components/commercial/MyModules.tsx
- app/lib/commercial/moduleApi.ts
Result: Schools can purchase eligible additional modules separately, through bundles or as part of a special package.

We'll first commercialize modules with completed functionality and establish compatibility rules for Cloud, Essentials and Multi-device. The existing application features remain shared rather than being duplicated.
13. Extend Independent to Multi-device
UPDATE — Frontend
- app/lib/sync/runSync.ts
- app/lib/sync/syncConfig.ts
- app/lib/sync/syncUtils.ts
- app/lib/sync/syncDevices.ts
- app/lib/sync/resolveSyncPolicy.ts
CREATE — Frontend
- app/lib/independent/fileSyncTransport.ts
- app/lib/independent/changeBatch.ts
- app/lib/independent/batchLedger.ts
- app/lib/independent/deviceCoordinator.ts
- app/lib/independent/fileSyncConflicts.ts
- app/components/commercial/IndependentDevices.tsx
- app/components/commercial/IndependentSyncStatus.tsx
Result: Authorized installations exchange changes using school-controlled storage, with conflict detection and resolution, encryption and device-specific access.

This comes after Essentials, because independent multi-writer synchronization is substantially more complex than one computer plus backups.
14. Implement upgrades, version purchases and paid services
UPDATE — Backend
- src/licenses/license-upgrade.service.ts
- src/licenses/perpetual-license.service.ts
- src/licenses/licenses.controller.ts
UPDATE — Frontend

- app/components/AppUpdateManager.tsx

CREATE — Backend
- src/commercial/service-catalog.service.ts
- src/commercial/version-upgrade.service.ts
CREATE — Frontend
- app/components/commercial/UpgradeOptions.tsx
- app/components/commercial/UpgradeCheckout.tsx
- app/components/commercial/SupportPlans.tsx
- app/lib/commercial/upgradeApi.ts
Result: Schools can purchase edition upgrades, applicable major versions, installation services, training and support without rebuilding their application or losing data.

For future self-hosted deployments, we can extend this stage using your existing EnterpriseDeployment and ProductReleaseArtifact models rather than adding that complexity to the first release.
15. Build the complete commercial management interface
UPDATE — Frontend
- app/providers.tsx
- app/components/role-portals/RolePortalShell.tsx
- app/context/subscription-context.tsx
CREATE — Frontend
- app/components/commercial/CommercialDashboard.tsx
- app/components/commercial/MyPackage.tsx
- app/components/commercial/MyLicenses.tsx
- app/components/commercial/MyInvoices.tsx
- app/components/commercial/MyPayments.tsx
- app/components/commercial/PackageManagement.tsx
- app/components/commercial/PrivateOfferManagement.tsx
Result: School owners can see what they've purchased, remaining installment balances, activated modules, licence status and available upgrades.

Eleeveon administrators can manage prices, catalog items, special offers, transactions and purchased entitlements from authorized administrative screens.

Recommended delivery priorities
Release	What we'll complete	Priority
Foundation	Numbers 1–5: rules, permissions, schema, pricing and entitlements	First
Commercial transactions	Numbers 6–8: checkout, ownership and licence verification	First
Independent Essentials	Numbers 9–11: installation, offline operation, backup and migration	First customer release
Module monetization	Number 12: separately sold modules and bundles	Next
Independent Multi-device	Number 13: distributed installations	Later
Expansion	Numbers 14–15: paid upgrades, services and complete management	Incremental

We will test each completed stage, including failed payments, duplicate webhooks, expired licence states, unauthorized feature access, offline operation and recovery of school records.
What we're deliberately keeping
We are not rebuilding your existing assessments, report templates, Dexie database, school finance engine, identity system, cloud synchronization or current Cloud subscription checkout merely because we're adding commercial packages.

The major architectural addition is a shared commercial layer that tells those existing modules which features, limits and deployments are authorized.

Your Prisma licensing, subscription and entitlement structures are already substantial. The most important gaps are securing their operations, supporting separately purchased module entitlements, connecting all the payment-to-licence transitions and implementing the native offline workflows.

We start with Number 1, then Number 2, and move through the foundation in order. This gives us the best chance of delivering Independent Essentials for your founding school without building unnecessary features, while keeping the system capable of supporting the additional income opportunities you've identified.
