import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/adminAuth";
import { adminDb, Timestamp } from "@/lib/firebaseAdmin";
import { analyzeDispute } from "@/lib/disputeAi";

export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ tradeId: string }> }) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { tradeId } = await params;

  const db = adminDb();
  const [dSnap, tSnap] = await Promise.all([
    db.collection("disputes").doc(tradeId).get(),
    db.collection("trades").doc(tradeId).get(),
  ]);
  if (!dSnap.exists || !tSnap.exists) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  const d = dSnap.data()!;
  const t = tSnap.data()!;

  try {
    const proposal = await analyzeDispute({
      itemDescription: t.itemDescription ?? "",
      amountMwk: t.amount ?? 0,
      status: t.status ?? "",
      delivered: !!t.deliveredAt,
      buyerName: t.buyerName ?? "Buyer",
      sellerName: t.sellerName ?? "Seller",
      openedByRole: d.openedByRole === "seller" ? "seller" : "buyer",
      buyerStatement: d.buyerStatement ?? "",
      sellerStatement: d.sellerStatement ?? "",
      buyerEvidence: d.buyerEvidence ?? [],
      sellerEvidence: d.sellerEvidence ?? [],
    });
    await dSnap.ref.update({ aiProposal: proposal, aiAnalyzedAt: Timestamp.now(), aiError: "" });
    return NextResponse.json({ ok: true, proposal });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await dSnap.ref.update({ aiError: message.slice(0, 300) });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
