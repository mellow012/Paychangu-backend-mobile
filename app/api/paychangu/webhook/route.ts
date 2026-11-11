import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhookSignature,
  verifyTransaction,
  tradeIdFromTxRef,
} from "@/lib/paychangu";
import { markFundsLocked } from "@/lib/tradeSync";

/**
 * POST /api/paychangu/webhook
 *
 * NOTE ON WEBHOOK PAYLOAD SHAPE: PayChangu's own docs show slightly different
 * example payloads for direct-charge vs standard-checkout events, and it's
 * not 100% certain from the docs alone which field carries the tx_ref for a
 * Standard Checkout payment. Rather than guess, this handler pulls whatever
 * reference-like field it can find, then calls PayChangu's own
 * verify-payment endpoint to get the *authoritative* tx_ref + status — this
 * matches PayChangu's documented "Always Re-query" recommendation anyway,
 * so it's not just a hedge, it's the correct pattern regardless.
 *
 * If you test this with PayChangu's sandbox and see the raw payload differs
 * from what's expected, check the console.log below — the field to adjust
 * is `candidateTxRef`.
 */
/**
 * GET /api/paychangu/webhook
 *
 * PayChangu redirects the buyer's BROWSER to callback_url (a GET with
 * ?tx_ref=...) after checkout, in addition to any POST webhook. Without this
 * handler that redirect returned 405 and the payment was never recorded.
 * We hand off to the return page, which verifies the payment and locks funds.
 */
export async function GET(req: NextRequest) {
  const txRef = req.nextUrl.searchParams.get("tx_ref");
  const status = req.nextUrl.searchParams.get("status");
  const dest = new URL("/checkout/complete", req.nextUrl.origin);
  if (txRef) dest.searchParams.set("tx_ref", txRef);
  if (status) dest.searchParams.set("status", status);
  return NextResponse.redirect(dest, 302);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("Webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("PayChangu webhook payload:", JSON.stringify(payload));

  const candidateTxRef: string | undefined =
    payload?.tx_ref ?? payload?.data?.tx_ref ?? payload?.reference;

  if (!candidateTxRef) {
    console.warn("Webhook payload had no recognizable tx_ref/reference field");
    // Still 200 — PayChangu retries on non-200, and there's nothing useful
    // to retry here without a reference to look up.
    return NextResponse.json({ received: true });
  }

  try {
    // Re-query PayChangu directly rather than trusting the webhook body.
    const verified = await verifyTransaction(candidateTxRef);

    if (verified.status !== "success") {
      console.log(`Transaction ${candidateTxRef} status: ${verified.status} — no action taken`);
      return NextResponse.json({ received: true });
    }

    const tradeId = tradeIdFromTxRef(verified.txRef);
    if (!tradeId) {
      console.warn(`Could not extract tradeId from tx_ref: ${verified.txRef}`);
      return NextResponse.json({ received: true });
    }

    const result = await markFundsLocked(tradeId, verified.reference);
    console.log(`markFundsLocked(${tradeId}):`, result);

    return NextResponse.json({ received: true, updated: result.updated });
  } catch (err) {
    console.error("Webhook processing error:", err);
    // Return 200 anyway once signature is valid — PayChangu will retry on
    // non-200, and a transient error here shouldn't cause repeated retries
    // for something the /status polling fallback can also catch.
    return NextResponse.json({ received: true, error: "processing failed" });
  }
}