export type StudentPricing = {
  mode: "fixed" | "per_student" | "tiered";
  billingPeriod?: "monthly" | "termly" | "yearly";
  perStudentRate?: number;
  minimumAmount?: number;
  tiers?: { upTo: number | null; unitPrice: number }[];
};

export function calculateStudentPrice(pricing: StudentPricing, count: number): number | null {
  if (!Number.isSafeInteger(count) || count < 1 || pricing.mode === "fixed") return null;
  let amount = 0;
  if (pricing.mode === "per_student") amount = count * (pricing.perStudentRate || 0);
  if (pricing.mode === "tiered") {
    let previous = 0;
    for (const tier of pricing.tiers || []) {
      const target = tier.upTo == null ? count : Math.min(tier.upTo, count);
      amount += Math.max(0, target - previous) * tier.unitPrice;
      previous = target;
      if (previous >= count) break;
    }
    if (previous < count) return null;
  }
  return Math.round(Math.max(amount, pricing.minimumAmount || 0) * 100) / 100;
}
