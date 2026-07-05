// Server-only CinetPay client. Never import from client/route/component modules.
// The `.server.ts` suffix is blocked from client bundles.

const CINETPAY_BASE = "https://api-checkout.cinetpay.com/v2";

export interface CinetpayConfig {
  apiKey: string;
  siteId: string;
}

export function getCinetpayConfig(): CinetpayConfig {
  const apiKey = process.env.CINETPAY_API_KEY;
  const siteId = process.env.CINETPAY_SITE_ID;
  if (!apiKey || !siteId) {
    throw new Error(
      "CinetPay non configuré. Ajoutez CINETPAY_API_KEY et CINETPAY_SITE_ID.",
    );
  }
  return { apiKey, siteId };
}

export interface InitPaymentInput {
  transactionId: string;
  amount: number; // XOF, multiple of 5 required by CinetPay
  description: string;
  customerName: string;
  customerSurname: string;
  customerPhone: string;
  customerEmail?: string;
  notifyUrl: string;
  returnUrl: string;
  metadata?: string;
}

export interface InitPaymentResult {
  paymentUrl: string;
  paymentToken: string;
}

export async function initPayment(input: InitPaymentInput): Promise<InitPaymentResult> {
  const { apiKey, siteId } = getCinetpayConfig();

  // CinetPay exige des montants multiples de 5.
  const amount = Math.ceil(input.amount / 5) * 5;

  const body = {
    apikey: apiKey,
    site_id: siteId,
    transaction_id: input.transactionId,
    amount,
    currency: "XOF",
    description: input.description,
    customer_name: input.customerName,
    customer_surname: input.customerSurname,
    customer_phone_number: input.customerPhone,
    customer_email: input.customerEmail ?? "",
    customer_address: "Bobo-Dioulasso",
    customer_city: "Bobo-Dioulasso",
    customer_country: "BF",
    customer_state: "BF",
    customer_zip_code: "01",
    notify_url: input.notifyUrl,
    return_url: input.returnUrl,
    channels: "ALL", // Orange Money, Moov, cartes
    lang: "fr",
    metadata: input.metadata ?? "",
  };

  const res = await fetch(`${CINETPAY_BASE}/payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    code?: string;
    message?: string;
    description?: string;
    data?: { payment_token?: string; payment_url?: string };
  };

  if (!res.ok || json.code !== "201" || !json.data?.payment_url) {
    throw new Error(
      `CinetPay init a échoué: ${json.code ?? res.status} ${json.message ?? ""} ${json.description ?? ""}`,
    );
  }

  return {
    paymentUrl: json.data.payment_url,
    paymentToken: json.data.payment_token ?? "",
  };
}

export interface CheckPaymentResult {
  status: "ACCEPTED" | "REFUSED" | "PENDING" | "CANCELLED" | "UNKNOWN";
  amount: number;
  currency: string;
  paymentMethod?: string;
  operatorId?: string;
  raw: unknown;
}

export async function checkPayment(transactionId: string): Promise<CheckPaymentResult> {
  const { apiKey, siteId } = getCinetpayConfig();

  const res = await fetch(`${CINETPAY_BASE}/payment/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey: apiKey,
      site_id: siteId,
      transaction_id: transactionId,
    }),
  });

  const json = (await res.json()) as {
    code?: string;
    message?: string;
    data?: {
      amount?: number | string;
      currency?: string;
      status?: string;
      payment_method?: string;
      operator_id?: string;
    };
  };

  const rawStatus = (json.data?.status ?? json.message ?? "").toUpperCase();
  let status: CheckPaymentResult["status"] = "UNKNOWN";
  if (json.code === "00" || rawStatus === "ACCEPTED") status = "ACCEPTED";
  else if (rawStatus === "REFUSED") status = "REFUSED";
  else if (rawStatus === "CANCELLED") status = "CANCELLED";
  else if (json.code === "662" || rawStatus === "WAITING_CUSTOMER_PAYMENT") status = "PENDING";

  return {
    status,
    amount: Number(json.data?.amount ?? 0),
    currency: json.data?.currency ?? "XOF",
    paymentMethod: json.data?.payment_method,
    operatorId: json.data?.operator_id,
    raw: json,
  };
}
