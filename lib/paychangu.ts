import crypto from "crypto";

const PAYCHANGU_BASE_URL = "https://api.paychangu.com";

function secretKey(): string {
  const key = process.env.PAYCHANGU_SECRET_KEY;
  if (!key) throw new Error("PAYCHANGU_SECRET_KEY is not set");
  return key;
}

export interface InitiateCheckoutParams {
  txRef: string;
  amount: number; // whole MWK
  email: string;
  firstName: string;
  lastName: string;
  callbackUrl: string;
  returnUrl: string;
  title: string;
  description: string;
}

export interface InitiateCheckoutResult {
  checkoutUrl: string;
  txRef: string;
}

/**
 * Creates a PayChangu Standard Checkout session.
 * Docs: https://developer.paychangu.com/docs/standard-checkout
 */
export async function initiateCheckout(
  params: InitiateCheckoutParams
): Promise<InitiateCheckoutResult> {
  const res = await fetch(`${PAYCHANGU_BASE_URL}/payment`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${secretKey()}`,
    },
    body: JSON.stringify({
      amount: params.amount,
      currency: "MWK",
      email: params.email,
      first_name: params.firstName,
      last_name: params.lastName,
      callback_url: params.callbackUrl,
      return_url: params.returnUrl,
      tx_ref: params.txRef,
      customization: {
        title: params.title,
        description: params.description,
      },
    }),
  });

  const json = await res.json();

  if (!res.ok || json.status !== "success") {
    throw new Error(
      `PayChangu initiate failed: ${json.message ?? res.statusText}`
    );
  }

  const checkoutUrl: string | undefined = json.data?.checkout_url;
  if (!checkoutUrl) {
    throw new Error("PayChangu response did not include a checkout_url");
  }

  return { checkoutUrl, txRef: params.txRef };
}

export interface VerifyTransactionResult {
  txRef: string;
  status: string; // "success" | "pending" | "failed" | ...
  amount: number;
  currency: string;
  reference: string;
}

/**
 * Re-queries PayChangu for the authoritative status of a transaction.
 * PayChangu's own docs recommend always doing this rather than trusting
 * webhook payload contents alone.
 * Docs: https://developer.paychangu.com/docs/transaction-verification
 */
export async function verifyTransaction(
  txRef: string
): Promise<VerifyTransactionResult> {
  const res = await fetch(
    `${PAYCHANGU_BASE_URL}/verify-payment/${encodeURIComponent(txRef)}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${secretKey()}`,
      },
    }
  );

  const json = await res.json();

  if (!res.ok || json.status !== "success") {
    throw new Error(
      `PayChangu verify failed: ${json.message ?? res.statusText}`
    );
  }

  const data = json.data;
  return {
    txRef: data.tx_ref,
    status: data.status,
    amount: data.amount,
    currency: data.currency,
    reference: data.reference,
  };
}

/**
 * Verifies the "Signature" header PayChangu sends with every webhook
 * request: SHA-256 HMAC of the raw request body, keyed with the webhook
 * secret from the PayChangu dashboard.
 * Docs: https://developer.paychangu.com/docs/webhooks
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const webhookSecret = process.env.PAYCHANGU_WEBHOOK_SECRET;
  if (!webhookSecret || !signatureHeader) return false;

  const computed = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  // timingSafeEqual requires equal-length buffers
  const a = Buffer.from(computed);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

/**
 * Trade IDs in this app are UUIDs (no underscores), so embedding the trade
 * ID in the tx_ref lets the webhook recover it without a separate Firestore
 * lookup collection.
 */
export function buildTxRef(tradeId: string): string {
  return `trade_${tradeId}_${Date.now()}`;
}

export function tradeIdFromTxRef(txRef: string): string | null {
  const match = /^trade_(.+)_\d+$/.exec(txRef);
  return match ? match[1] : null;
}
