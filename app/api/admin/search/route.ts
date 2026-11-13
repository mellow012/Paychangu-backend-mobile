import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const SCAN = 500;

/**
 * Quick search for the header. Firestore has no "contains" query, so we scan the
 * newest records and filter here: fine at demo scale.
 * Returns users (name/email/phone) and disputes (item/party names/statements).
 */
export async function GET(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ users: [], disputes: [] });

  const db = adminDb();
  const [userSnap, disputeSnap] = await Promise.all([
    db.collection("users").orderBy("createdAt", "desc").select("name", "email", "phone").limit(SCAN).get(),
    db.collection("disputes").orderBy("createdAt", "desc").limit(100).get(),
  ]);

  const users = userSnap.docs
    .map((d) => ({ uid: d.id, name: d.get("name") ?? "", email: d.get("email") ?? "", phone: d.get("phone") ?? "" }))
    .filter((u) => [u.name, u.email, u.phone].some((f: string) => f.toLowerCase().includes(q)))
    .slice(0, 5);

  // Join trades for item/party names
  const tradeDocs = await Promise.all(disputeSnap.docs.map((d) => db.collection("trades").doc(d.id).get()));
  const disputes = disputeSnap.docs
    .map((d, i) => {
      const t = tradeDocs[i].data() ?? {};
      const dd = d.data();
      return {
        tradeId: d.id,
        item: String(t.itemDescription ?? "").trim(),
        buyer: String(t.buyerName ?? "").trim(),
        seller: String(t.sellerName ?? "").trim(),
        status: String(dd.status ?? ""),
        text: `${dd.buyerStatement ?? ""} ${dd.sellerStatement ?? ""}`,
      };
    })
    .filter((x) => [x.item, x.buyer, x.seller, x.text].some((f) => f.toLowerCase().includes(q)))
    .slice(0, 5)
    .map(({ text, ...rest }) => { void text; return rest; });

  return NextResponse.json({ users, disputes });
}
