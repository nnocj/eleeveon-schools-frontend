import type {
  MomoNetwork,
  PaymentChannel,
  PaymentProviderName,
} from "./payment-types";

export function getApiBase() {
  return (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    ""
  ).replace(/\/$/, "");
}

export function getAuthToken() {
  if (typeof window === "undefined") return null;

  return (
    localStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("eleeveon_token")
  );
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getAuthToken();

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

export async function readJson(res: Response) {
  const text = await res.text().catch(() => "");
  const json = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const message =
      json?.message ||
      json?.error ||
      text ||
      `Request failed with status ${res.status}`;

    throw new Error(Array.isArray(message) ? message.join(", ") : String(message));
  }

  return json;
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function money(amount?: number | null, currency = "GHS") {
  return `${currency} ${Number(amount || 0).toLocaleString("en-GH")}`;
}

export function providerForMethod(method: PaymentChannel): PaymentProviderName {
  if (method === "momo" || method === "card" || method === "bank") {
    return "paystack";
  }

  return "manual";
}

export function defaultMomoNetwork(): MomoNetwork {
  return "mtn";
}

export function paymentMethodLabel(method: PaymentChannel) {
  const labels: Record<PaymentChannel, string> = {
    momo: "Mobile Money",
    card: "Card",
    bank: "Bank",
    cash: "Cash",
    manual: "Manual",
  };

  return labels[method] || method;
}

export function momoNetworkLabel(network?: MomoNetwork) {
  const labels: Record<MomoNetwork, string> = {
    mtn: "MTN Mobile Money",
    telecel: "Telecel Cash",
    airteltigo: "AirtelTigo Money",
  };

  return network ? labels[network] : "";
}

export function getPaymentRedirectUrl(result: any): string | undefined {
  return (
    result?.authorizationUrl ||
    result?.providerResponse?.authorizationUrl ||
    result?.payment?.authorizationUrl ||
    result?.data?.authorizationUrl
  );
}
