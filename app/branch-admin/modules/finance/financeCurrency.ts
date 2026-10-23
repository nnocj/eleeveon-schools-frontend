/** Shared display-only currency configuration. No conversion or exchange rates. */
export const FINANCE_CURRENCIES = [
  { code: "GHS", name: "Ghanaian Cedi", symbol: "GH₵" },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
  { code: "USD", name: "US Dollar", symbol: "US$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "XOF", name: "West African CFA Franc", symbol: "CFA" },
  { code: "XAF", name: "Central African CFA Franc", symbol: "FCFA" },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
] as const;

export function getFinanceCurrency(code?: string | null) {
  const normalized = (code || "GHS").toUpperCase().trim();
  return FINANCE_CURRENCIES.find((item) => item.code === normalized) ||
    { code: normalized || "GHS", name: normalized || "Ghanaian Cedi", symbol: normalized || "GH₵" };
}

export function formatFinanceMoney(value: unknown, code = "GHS") {
  const amount = Number(value);
  const safe = Number.isFinite(amount) ? amount : 0;
  const currency = getFinanceCurrency(code);
  return `${currency.symbol} ${new Intl.NumberFormat("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe)}`;
}
