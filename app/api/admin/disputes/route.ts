import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

/** Lists disputes (newest first) with the trade details the moderator needs. */
export async function GET() {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = adminDb();
  const snap = await db.collection("disputes").orderBy("createdAt", "desc").limit(50).get();
  const items = await Promise.all(
    snap.docs.map(async (d) => {
      const dispute = d.data();
      const trade = (await db.collection("trades").doc(d.id).get()).data() ?? {};
      return {
        tradeId: d.id,
        ...dispute,
        createdAt: dispute.createdAt?.toMillis?.() ?? null,
        resolvedAt: dispute.resolvedAt?.toMillis?.() ?? null,
        aiAnalyzedAt: dispute.aiAnalyzedAt?.toMillis?.() ?? null,
        trade: {
          itemDescription: trade.itemDescription ?? "",
          amount: trade.amount ?? 0,
          buyerName: trade.buyerName ?? "",
          sellerName: trade.sellerName ?? "",
          status: trade.status ?? "",
          deliveredAt: trade.deliveredAt?.toMillis?.() ?? null,
        },
      };
    })
  );
  return NextResponse.json({ items });
}
