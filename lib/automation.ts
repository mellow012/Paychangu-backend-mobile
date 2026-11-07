import { adminDb, Timestamp } from "./firebaseAdmin";
import type { Transaction } from "firebase-admin/firestore";

/**
 * Escrow automation rules. Run on demand (the /automation page or a curl
 * call) and on a schedule (GitHub Actions) via POST /api/automation/run.
 *
 * Rules (timeouts are in MINUTES so they can be shortened for a live demo):
 *   EXPIRE_PENDING  PENDING trade, seller never responded        → REJECTED
 *   CANCEL_UNPAID   ACTIVE trade, buyer never paid               → REJECTED + stock back
 *   AUTO_REFUND     paid, seller never marked delivered          → REFUNDED + stock back
 *   AUTO_RELEASE    delivered, buyer never confirmed             → COMPLETED
 *
 * Trades with disputeOpen === true (or a non PENDING/ACTIVE status such as
 * DISPUTED) are never touched — automation pauses while a dispute is open.
 *
 * Release/refund are SIMULATED, exactly like the Android app: only
 * Firestore is updated, no real payout call.
 */

export type AutomationAction =
  | "EXPIRE_PENDING"
  | "CANCEL_UNPAID"
  | "AUTO_REFUND"
  | "AUTO_RELEASE";

export type AutomationConfig = {
  pendingMin: number;
  unpaidMin: number;
  undeliveredMin: number;
  confirmMin: number;
};

export type AutomationResult = {
  tradeId: string;
  action: AutomationAction;
  applied: boolean;
  note?: string;
};

type TradeDoc = {
  status?: string;
  createdAt?: Timestamp;
  acceptedAt?: Timestamp;
  paidAt?: Timestamp;
  deliveredAt?: Timestamp;
  txHash?: string;
  listingId?: string;
  quantity?: number;
  buyerUid?: string;
  sellerUid?: string;
  buyerName?: string;
  sellerName?: string;
  itemDescription?: string;
  disputeOpen?: boolean;
};

function minutesFromEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Every timeout defaults to 2 minutes (demo mode); override via env vars. */
export function getConfig(): AutomationConfig {
  return {
    pendingMin: minutesFromEnv("PENDING_TIMEOUT_MINUTES", 2),
    unpaidMin: minutesFromEnv("UNPAID_TIMEOUT_MINUTES", 2),
    undeliveredMin: minutesFromEnv("UNDELIVERED_TIMEOUT_MINUTES", 2),
    confirmMin: minutesFromEnv("CONFIRM_WINDOW_MINUTES", 2),
  };
}

function classify(t: TradeDoc, now: number, cfg: AutomationConfig): AutomationAction | null {
  if (t.disputeOpen) return null;

  const olderThan = (ts: Timestamp | undefined, minutes: number) =>
    ts !== undefined && now - ts.toMillis() >= minutes * 60_000;

  if (t.status === "PENDING") {
    return olderThan(t.createdAt, cfg.pendingMin) ? "EXPIRE_PENDING" : null;
  }

  if (t.status === "ACTIVE") {
    if (!t.txHash) {
      return olderThan(t.acceptedAt, cfg.unpaidMin) ? "CANCEL_UNPAID" : null;
    }
    if (t.deliveredAt) {
      return olderThan(t.deliveredAt, cfg.confirmMin) ? "AUTO_RELEASE" : null;
    }
    return olderThan(t.paidAt, cfg.undeliveredMin) ? "AUTO_REFUND" : null;
  }

  return null;
}

function notify(
  tx: Transaction,
  recipientUid: string | undefined,
  title: string,
  message: string,
  type: string,
  tradeId: string
) {
  if (!recipientUid) return;
  const ref = adminDb().collection("notifications").doc();
  tx.set(ref, {
    id: ref.id,
    recipientUid,
    title,
    message,
    type,
    tradeId,
    isRead: false,
    createdAt: Timestamp.now(),
  });
}

async function applyAction(
  tradeId: string,
  expected: AutomationAction,
  cfg: AutomationConfig
): Promise<AutomationResult> {
  const db = adminDb();
  const tradeRef = db.collection("trades").doc(tradeId);

  return db.runTransaction(async (tx) => {
    // ── reads first ──
    const snap = await tx.get(tradeRef);
    if (!snap.exists) return { tradeId, action: expected, applied: false, note: "trade not found" };
    const t = snap.data() as TradeDoc;

    // Re-check inside the transaction: the trade may have changed since the query
    const action = classify(t, Date.now(), cfg);
    if (action !== expected) {
      return { tradeId, action: expected, applied: false, note: "trade changed, skipped" };
    }

    const restoresStock = action === "CANCEL_UNPAID" || action === "AUTO_REFUND";
    const listingRef =
      restoresStock && t.listingId ? db.collection("listings").doc(t.listingId) : null;
    const listingSnap = listingRef ? await tx.get(listingRef) : null;

    // ── writes ──
    const item = t.itemDescription ?? "the item";
    const buyer = t.buyerName ?? "the buyer";
    const seller = t.sellerName ?? "the seller";
    const now = Timestamp.now();

    if (listingRef && listingSnap && listingSnap.exists) {
      const stock = Number(listingSnap.get("quantity") ?? 0);
      const updates: Record<string, string | number | Timestamp> = {
        quantity: stock + Math.max(t.quantity ?? 1, 1),
        updatedAt: now,
      };
      if (listingSnap.get("status") === "SOLD") updates.status = "ACTIVE";
      tx.update(listingRef, updates);
    }

    switch (action) {
      case "EXPIRE_PENDING":
        tx.update(tradeRef, { status: "REJECTED", updatedAt: now });
        notify(tx, t.buyerUid, "Trade Expired",
          `${seller} didn't respond in time, so your request for ${item} expired.`,
          "TRADE_REJECTED", tradeId);
        notify(tx, t.sellerUid, "Trade Request Expired",
          `The request from ${buyer} for ${item} expired because it wasn't answered in time.`,
          "SYSTEM", tradeId);
        break;

      case "CANCEL_UNPAID":
        tx.update(tradeRef, { status: "REJECTED", updatedAt: now });
        notify(tx, t.buyerUid, "Trade Cancelled",
          `The trade for ${item} was cancelled because payment wasn't made in time.`,
          "TRADE_REJECTED", tradeId);
        notify(tx, t.sellerUid, "Trade Cancelled",
          `${buyer} didn't pay in time, so the trade for ${item} was cancelled and the item is back in stock.`,
          "SYSTEM", tradeId);
        break;

      case "AUTO_REFUND":
        tx.update(tradeRef, { status: "REFUNDED", txHash: "SIMULATED_REFUND", updatedAt: now });
        notify(tx, t.buyerUid, "Automatic Refund",
          `${seller} didn't deliver ${item} in time, so you were refunded automatically.`,
          "TRADE_REFUNDED", tradeId);
        notify(tx, t.sellerUid, "Trade Refunded",
          `The trade for ${item} was refunded to ${buyer} because it wasn't marked delivered in time.`,
          "TRADE_REFUNDED", tradeId);
        break;

      case "AUTO_RELEASE":
        tx.update(tradeRef, { status: "COMPLETED", txHash: "SIMULATED_RELEASE", updatedAt: now });
        notify(tx, t.sellerUid, "Payment Released",
          `${buyer} didn't respond after delivery, so funds for ${item} were released to you automatically.`,
          "TRADE_COMPLETED", tradeId);
        notify(tx, t.buyerUid, "Funds Released Automatically",
          `You didn't confirm receipt of ${item} in time, so the funds were released to ${seller}.`,
          "TRADE_COMPLETED", tradeId);
        break;
    }

    // Audit log
    tx.set(db.collection("automation_logs").doc(), {
      tradeId,
      action,
      itemDescription: item,
      buyerUid: t.buyerUid ?? null,
      sellerUid: t.sellerUid ?? null,
      config: cfg,
      createdAt: now,
    });

    return { tradeId, action, applied: true };
  });
}

export async function runAutomation(opts: { dryRun?: boolean } = {}) {
  const cfg = getConfig();
  const now = Date.now();

  const snap = await adminDb()
    .collection("trades")
    .where("status", "in", ["PENDING", "ACTIVE"])
    .get();

  const results: AutomationResult[] = [];

  for (const doc of snap.docs) {
    const action = classify(doc.data() as TradeDoc, now, cfg);
    if (!action) continue;

    if (opts.dryRun) {
      results.push({ tradeId: doc.id, action, applied: false, note: "dry run" });
      continue;
    }

    try {
      results.push(await applyAction(doc.id, action, cfg));
    } catch (err) {
      console.error(`Automation failed for ${doc.id}:`, err);
      results.push({
        tradeId: doc.id,
        action,
        applied: false,
        note: err instanceof Error ? err.message : "error",
      });
    }
  }

  return {
    ranAt: new Date(now).toISOString(),
    dryRun: !!opts.dryRun,
    config: cfg,
    checked: snap.size,
    applied: results.filter((r) => r.applied).length,
    results,
  };
}
