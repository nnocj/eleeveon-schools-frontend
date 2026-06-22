/**
 * app/developer/modules/developerPlatformEndpoints.ts
 * ---------------------------------------------------------
 * Central endpoint map for the upgraded Eleeveon developer portal.
 * Existing modules keep their current imports; this file is added so
 * future developer screens can use one clear contract instead of
 * hard-coded paths scattered across pages.
 */

export const developerEndpoints = {
  dashboard: ["/developer/dashboard", "/platform/dashboard", "/billing/dashboard"],
  accounts: ["/developer/accounts", "/accounts"],
  plans: ["/billing/plans?includeInactive=true", "/developer/plans"],
  subscriptions: ["/billing/subscriptions", "/developer/subscriptions"],
  invoices: ["/billing/invoices", "/developer/invoices"],
  payments: ["/billing/payments", "/developer/payments"],
  featureFlags: ["/developer/feature-flags", "/feature-flags"],
  support: ["/developer/support", "/support-tickets"],
  systemHealth: ["/developer/system-health", "/health"],
  syncDiagnostics: ["/sync/diagnostics", "/developer/sync-diagnostics"],
  syncConflicts: ["/sync/conflicts", "/developer/sync-conflicts"],
  syncDevices: ["/sync/devices", "/developer/sync-devices"],
  auditLogs: ["/developer/audit-logs", "/audit-logs"],
  errorReports: ["/developer/error-reports", "/error-reports"],
  integrations: ["/developer/integrations", "/integrations"],
  apiClients: ["/developer/api-clients", "/api-clients"],
  webhooks: ["/developer/webhooks", "/webhooks"],
  backgroundJobs: ["/developer/background-jobs", "/background-jobs"],
  storageUsage: ["/developer/storage-usage", "/storage-usage"],
  backups: ["/developer/backups", "/backups"],
  releases: ["/developer/releases", "/releases"],
} as const;

export type DeveloperEndpointKey = keyof typeof developerEndpoints;
