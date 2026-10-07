import { NextRequest, NextResponse } from "next/server";
import { verifyTransaction, tradeIdFromTxRef } from "@/lib/paychangu";
import { markFundsLocked } from "@/lib/tradeSync";

/**
 * GET /api/paychangu/status?txRef=trade_xxx_123456
 *
 * Lets the Android app do a manual "refresh status" check after returning
 * from the PayChangu checkout page, in case the webhook is delayed or the
 * demo network drops it. Safe to call repeatedly — markFundsLocked is
 * idempotent.
 */
export async function GET(req: NextRequest) {
  const txRef = req.nextUrl.searchParams.get("txRef");
  if (!txRef) {
    return NextResponse.json({ error: "txRef query param is required" }, { status: 400 });
  }

  try {
    const verified = await verifyTransaction(txRef);

    if (verified.status === "success") {
      const tradeId = tradeIdFromTxRef(verified.txRef);
      if (tradeId) {
        await markFundsLocked(tradeId, verified.reference);
      }
    }

    return NextResponse.json({ status: verified.status, txRef: verified.txRef });
  } catch (err) {
    console.error("status check error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
