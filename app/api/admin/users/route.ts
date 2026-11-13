import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DAY = 24 * 60 * 60 * 1000;
const MAX_USERS = 500;
const MAX_TRADES = 3000;

/**
 * Users + usage metrics.
 * "Active" here means took part in a trade (as buyer or seller) in the period.
 * App opens aren't recorded in Firestore: for daily/monthly active users in the
 * app itself, use Firebase Analytics.
 */
export async function GET() {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = adminDb();

  const [userSnap, tradeSnap, totalUsers] = await Promise.all([
    db.collection("users").orderBy("createdAt", "desc").limit(MAX_USERS).get(),
    db.collection("trades").select("buyerUid", "sellerUid", "updatedAt", "createdAt").limit(MAX_TRADES).get(),
    db.collection("users").count().get(),
  ]);

  const now = Date.now();
  const buying = new Map<string, number>();
  const selling = new Map<string, number>();
  const lastActive = new Map<string, number>();
  for (const d of tradeSnap.docs) {
    const t = d.data();
    const ts: number = t.updatedAt?.toMillis?.() ?? t.createdAt?.toMillis?.() ?? 0;
    for (const [uid, map] of [[t.buyerUid, buying], [t.sellerUid, selling]] as const) {
      if (!uid) continue;
      map.set(uid, (map.get(uid) ?? 0) + 1);
      if (ts > (lastActive.get(uid) ?? 0)) lastActive.set(uid, ts);
    }
  }

  const users = userSnap.docs.map((d) => {
    const u = d.data();
    const id = d.id;
    return {
      uid: id,
      name: u.name ?? "",
      email: u.email ?? "",
      phone: u.phone ?? "",
      isVerified: !!u.isVerified,
      walletAddress: u.walletAddress ?? "",
      avgRating: u.avgRating ?? 0,
      ratingCount: u.ratingCount ?? 0,
      createdAt: u.createdAt?.toMillis?.() ?? null,
      tradesBuying: buying.get(id) ?? 0,
      tradesSelling: selling.get(id) ?? 0,
      lastActive: lastActive.get(id) ?? null,
    };
  });

  const activeSince = (days: number) => users.filter((u) => u.lastActive && now - u.lastActive <= days * DAY).length;
  const joinedSince = (days: number) => users.filter((u) => u.createdAt && now - u.createdAt <= days * DAY).length;

  // New sign-ups per day for the last 14 days (oldest first)
  const signupsByDay = Array.from({ length: 14 }, (_, i) => {
    const start = new Date(now - (13 - i) * DAY);
    start.setUTCHours(0, 0, 0, 0);
    const from = start.getTime();
    return {
      day: start.toISOString().slice(5, 10),
      count: users.filter((u) => u.createdAt && u.createdAt >= from && u.createdAt < from + DAY).length,
    };
  });

  return NextResponse.json({
    metrics: {
      totalUsers: totalUsers.data().count,
      joined7: joinedSince(7),
      joined30: joinedSince(30),
      active7: activeSince(7),
      active30: activeSince(30),
      everTraded: users.filter((u) => u.tradesBuying + u.tradesSelling > 0).length,
      verified: users.filter((u) => u.isVerified).length,
      withWallet: users.filter((u) => u.walletAddress).length,
      listed: users.length,
      truncated: totalUsers.data().count > users.length,
    },
    signupsByDay,
    users,
  });
}
