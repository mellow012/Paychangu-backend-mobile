import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { currentAdmin } from "@/lib/adminAuth";
import { adminDb, Timestamp } from "@/lib/firebaseAdmin";
import { CHAIN_STATUS, chainStatusOf, resolveOnChain } from "@/lib/arbiter";

export const maxDuration = 60;

/**
 * Moderator decision. Body: { outcome: "release" | "refund", note?: string }
 * 1. checks the dispute is open and the contract is in Disputed state,
 * 2. sends resolveDispute from the Arbiter key,
 * 3. mirrors the result in Firestore (trade status, stock restore on refund,
 *    notifications to both parties).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ tradeId: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { tradeId } = await params;

  const body = await req.json().catch(() => ({}));
  const outcome = body.outcome === "release" || body.outcome === "refund" ? body.outcome : null;
  if (!outcome) return NextResponse.json({ error: "outcome must be 'release' or 'refund'" }, { status: 400 });
  const note = String(body.note ?? "").slice(0, 500);

  const db = adminDb();
  const dRef = db.collection("disputes").doc(tradeId);
  const tRef = db.collection("trades").doc(tradeId);
  const [dSnap, tSnap] = await Promise.all([dRef.get(), tRef.get()]);
  if (!dSnap.exists || !tSnap.exists) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  const dispute = dSnap.data()!;
  const trade = tSnap.data()!;
  if (dispute.status !== "open" || trade.status !== "DISPUTED") {
    return NextResponse.json({ error: "This dispute is not open" }, { status: 409 });
  }

  // The app records openDispute on-chain in the background; make sure it landed first.
  let chainStatus: number;
  try {
    chainStatus = await chainStatusOf(trade.blockchainTradeId);
  } catch (e) {
    return NextResponse.json({ error: `Could not read the contract: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
  if (chainStatus !== CHAIN_STATUS.Disputed) {
    return NextResponse.json(
      { error: `The dispute isn't recorded on-chain yet (contract status ${chainStatus}). Wait a minute and try again.` },
      { status: 409 }
    );
  }

  let txHash: string;
  try {
    txHash = await resolveOnChain(trade.blockchainTradeId, outcome === "release");
  } catch (e) {
    return NextResponse.json({ error: `On-chain resolution failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }

  // Mirror in Firestore. Refund returns reserved stock to the listing.
  const newStatus = outcome === "release" ? "COMPLETED" : "REFUNDED";
  await db.runTransaction(async (txn) => {
    const listingRef = outcome === "refund" && trade.listingId ? db.collection("listings").doc(trade.listingId) : null;
    const listingSnap = listingRef ? await txn.get(listingRef) : null;

    txn.update(tRef, {
      status: newStatus,
      txHash: outcome === "release" ? "DISPUTE_RELEASED" : "DISPUTE_REFUNDED",
      chainTxHash: txHash,
      chainError: "",
      chainDone: FieldValue.arrayUnion("RESOLVE"),
      updatedAt: Timestamp.now(),
    });
    txn.update(dRef, {
      status: "resolved",
      resolution: outcome,
      resolvedBy: admin,
      resolvedAt: Timestamp.now(),
      resolveTxHash: txHash,
      moderatorNote: note,
    });

    if (listingRef && listingSnap?.exists) {
      const stock = Number(listingSnap.get("quantity") ?? 0);
      const updates: Record<string, string | number | Timestamp> = {
        quantity: stock + Math.max(Number(trade.quantity ?? 1), 1),
        updatedAt: Timestamp.now(),
      };
      if (listingSnap.get("status") === "SOLD") updates.status = "ACTIVE";
      txn.update(listingRef, updates);
    }

    const msg =
      outcome === "release"
        ? `The moderator resolved the dispute for ${trade.itemDescription} in favour of the seller. Funds are released to the seller.`
        : `The moderator resolved the dispute for ${trade.itemDescription} in favour of the buyer. The buyer is refunded.`;
    for (const uid of [trade.buyerUid, trade.sellerUid]) {
      const id = randomUUID();
      txn.set(db.collection("notifications").doc(id), {
        id,
        recipientUid: uid,
        title: "Dispute resolved",
        message: msg + (note ? ` Moderator note: ${note}` : ""),
        type: outcome === "release" ? "TRADE_COMPLETED" : "TRADE_REFUNDED",
        tradeId,
        isRead: false,
        createdAt: Timestamp.now(),
      });
    }
  });

  return NextResponse.json({ ok: true, outcome, txHash });
}
