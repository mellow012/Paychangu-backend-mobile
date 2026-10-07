import { adminDb, Timestamp } from "./firebaseAdmin";

/**
 * Mirrors the Kotlin app's TradeRepository.markFundsLocked() exactly —
 * same fields, same notification copy — so a trade funded via PayChangu
 * looks identical in Firestore to one that would have been funded on-chain.
 *
 * Idempotent: safe to call more than once for the same payment (webhook
 * retries, or the same event landing via both the webhook AND the manual
 * status-poll fallback) — skips the write if this reference was already
 * recorded.
 */
export async function markFundsLocked(
  tradeId: string,
  reference: string
): Promise<{ updated: boolean; reason?: string }> {
  const db = adminDb();
  const tradeRef = db.collection("trades").doc(tradeId);
  const tradeSnap = await tradeRef.get();

  if (!tradeSnap.exists) {
    return { updated: false, reason: `trade ${tradeId} not found` };
  }

  const trade = tradeSnap.data() as {
    txHash?: string;
    buyerName?: string;
    amount?: number;
    itemDescription?: string;
    sellerUid?: string;
  };

  if (trade.txHash === reference) {
    return { updated: false, reason: "already recorded" };
  }

  const batch = db.batch();

  batch.update(tradeRef, {
    txHash: reference,
    updatedAt: Timestamp.now(),
  });

  if (trade.sellerUid) {
    const notifRef = db.collection("notifications").doc();
    const formattedAmount = Math.round(trade.amount ?? 0).toLocaleString("en-US");
    batch.set(notifRef, {
      id: notifRef.id,
      recipientUid: trade.sellerUid,
      title: "Funds Locked",
      message: `${trade.buyerName ?? "The buyer"} has locked MWK ${formattedAmount} in escrow for ${trade.itemDescription ?? "the item"}. You can now proceed with delivery.`,
      type: "FUNDS_LOCKED",
      tradeId,
      isRead: false,
      createdAt: Timestamp.now(),
    });
  }

  await batch.commit();
  return { updated: true };
}
