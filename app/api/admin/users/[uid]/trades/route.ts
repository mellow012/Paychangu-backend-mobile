import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

/** All trades a user took part in (as buyer or seller), newest first. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { uid } = await params;
  const db = adminDb();

  // Two equality queries (no composite index needed); merged and sorted here.
  const [asBuyer, asSeller] = await Promise.all([
    db.collection("trades").where("buyerUid", "==", uid).limit(100).get(),
    db.collection("trades").where("sellerUid", "==", uid).limit(100).get(),
  ]);

  const rows = [
    ...asBuyer.docs.map((d) => ({ d, role: "buyer" as const })),
    ...asSeller.docs.map((d) => ({ d, role: "seller" as const })),
  ].map(({ d, role }) => {
    const t = d.data();
    return {
      id: d.id,
      role,
      itemDescription: String(t.itemDescription ?? "").trim(),
      amount: Number(t.amount ?? 0),
      status: String(t.status ?? ""),
      counterparty: String((role === "buyer" ? t.sellerName : t.buyerName) ?? "").trim(),
      createdAt: t.createdAt?.toMillis?.() ?? null,
      updatedAt: t.updatedAt?.toMillis?.() ?? t.createdAt?.toMillis?.() ?? null,
      chainTxHash: String(t.chainTxHash ?? ""),
      hasDispute: t.status === "DISPUTED" || !!t.disputeOpenedBy,
    };
  }).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  const sum = (role: "buyer" | "seller", status?: string) =>
    rows.filter((r) => r.role === role && (!status || r.status === status)).reduce((n, r) => n + r.amount, 0);

  return NextResponse.json({
    trades: rows,
    totals: {
      asBuyer: asBuyer.size,
      asSeller: asSeller.size,
      spent: sum("buyer", "COMPLETED"),
      earned: sum("seller", "COMPLETED"),
      truncated: asBuyer.size >= 100 || asSeller.size >= 100,
    },
  });
}
