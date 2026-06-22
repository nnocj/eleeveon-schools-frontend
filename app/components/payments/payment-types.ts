export type PaymentChannel = "momo" | "card" | "bank" | "cash" | "manual";

export type PaymentProviderName = "paystack" | "manual";

export type MomoNetwork = "mtn" | "telecel" | "airteltigo";

export type PaymentCheckoutValue = {
  method: PaymentChannel;
  provider: PaymentProviderName;
  momoNetwork?: MomoNetwork;
  payerName?: string;
  payerPhone?: string;
  payerEmail?: string;
};

export type PaymentCheckoutResult = {
  subscription?: any;
  invoice?: any;
  payment?: any;
  providerResponse?: {
    authorizationUrl?: string;
    providerReference?: string;
    status?: string;
    message?: string;
  };
  authorizationUrl?: string;
  requiresPayment?: boolean;
  message?: string;
};