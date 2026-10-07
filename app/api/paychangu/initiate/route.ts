import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { initiateCheckout, buildTxRef } from "@/lib/paychangu";

/**
 * POST /api/paychangu/initiate
 * Body: { tradeId: string, buyerEmail: string, buyerName: string }
 *
 * The trade amount is read from Firestore, not taken from the request body —
 * the Android app sends tradeId/buyer info only, so a tampered client can't
 * change how much the buyer is charged.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tradeId, buyerEmail, buyerName } = body ?? {};

    if (!tradeId || typeof tradeId !== "string") {
      return NextResponse.json({ error: "tradeId is required" }, { status: 400 });
    }
    if (!buyerEmail || typeof buyerEmail !== "string") {
      return NextResponse.json({ error: "buyerEmail is required" }, { status: 400 });
    }

    const db = adminDb();
    const tradeSnap = await db.collection("trades").doc(tradeId).get();
    if (!tradeSnap.exists) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }
    const trade = tradeSnap.data() as {
      amount?: number;
      itemDescription?: string;
      status?: string;
    };

    if (trade.status !== "ACTIVE") {
      return NextResponse.json(
        { error: `Trade is not ready for payment (status: ${trade.status})` },
        { status: 409 }
      );
    }

    const amount = Math.round(trade.amount ?? 0);
    if (amount <= 0) {
      return NextResponse.json({ error: "Trade has no valid amount" }, { status: 400 });
    }

    const baseUrl = process.env.APP_BASE_URL;
    if (!baseUrl) {
      return NextResponse.json(
        { error: "Server misconfigured: APP_BASE_URL is not set" },
        { status: 500 }
      );
    }

    const txRef = buildTxRef(tradeId);
    const [firstName, ...rest] = (buyerName || "Buyer").trim().split(" ");

    const result = await initiateCheckout({
      txRef,
      amount,
      email: buyerEmail,
      firstName: firstName || "Buyer",
      lastName: rest.join(" ") || "-",
      callbackUrl: `${baseUrl}/api/paychangu/webhook`,
      returnUrl: `${baseUrl}/checkout/complete`,
      title: "Escrow Payment",
      description: trade.itemDescription ?? "Escrow trade payment",
    });

    return NextResponse.json({ checkoutUrl: result.checkoutUrl, txRef: result.txRef });
  } catch (err) {
    console.error("initiate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
