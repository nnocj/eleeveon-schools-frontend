// ======================================================
// FILE 3: app/lib/billing/subscriptionAccess.ts
// ======================================================

export type PlanFeature =
  | "offlineSync"
  | "cloudBackup"
  | "reports"
  | "finance"
  | "parentPortal"
  | "studentPortal"
  | "teacherPortal"
  | "advancedAnalytics"
  | "apiAccess";

export type SubscriptionPlanDTO = {
  id: string;
  name: string;
  code: string;
  currency: string;
  priceMonthly: number;
  priceYearly: number;
  maxSchools?: number | null;
  maxBranches?: number | null;
  maxUsers?: number | null;
  maxStudents?: number | null;
  maxTeachers?: number | null;
  maxStorageMb?: number | null;
  offlineSync: boolean;
  cloudBackup: boolean;
  reports: boolean;
  finance: boolean;
  parentPortal: boolean;
  studentPortal: boolean;
  teacherPortal: boolean;
  advancedAnalytics: boolean;
  apiAccess: boolean;
};

export type AccountSubscriptionDTO = {
  id: string;
  status: string;
  billingCycle: string;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  nextBillingDate?: string | null;
  plan: SubscriptionPlanDTO;
};

export function isSubscriptionUsable(subscription?: AccountSubscriptionDTO | null) {
  if (!subscription) return false;

  if (["active", "trial"].includes(subscription.status)) {
    const endDate = subscription.currentPeriodEnd || subscription.trialEndsAt;
    if (!endDate) return true;
    return new Date(endDate).getTime() >= Date.now();
  }

  return false;
}

export function hasFeature(subscription: AccountSubscriptionDTO | null | undefined, feature: PlanFeature) {
  if (!isSubscriptionUsable(subscription)) return false;
  return !!subscription?.plan?.[feature];
}

export function limitReached(current: number, max?: number | null) {
  if (max == null) return false;
  return current >= max;
}

export function formatMoney(value: number, currency = "GHS") {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);
}
