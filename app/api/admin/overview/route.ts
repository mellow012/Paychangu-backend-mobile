import { NextResponse } from "next/server";
import { AggregateField } from "firebase-admin/firestore";
import { currentAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";
import { arbiterInfo } from "@/lib/arbiter";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const STATUSES = ["PENDING", "ACTIVE", "COMPLETED", "REFUNDED", "REJECTED", "DISPUTED"] as const;

export async function GET() {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = adminDb();

  const [statusCounts, volume, users, activeListings, openDisputes, recent, arbiter] = await Promise.all([
    Promise.all(
      STATUSES.map(async (s) => [s, (await db.collection("trades").where("status", "==", s).count().get()).data().count] as const)
    ),
    db.collection("trades").where("status", "==", "COMPLETED")
      .aggregate({ total: AggregateField.sum("amount") }).get(),
    db.collection("users").count().get(),
    db.collection("listings").where("status", "==", "ACTIVE").count().get(),
    db.collection("disputes").where("status", "==", "open").count().get(),
    db.collection("trades").orderBy("updatedAt", "desc").limit(8).get(),
    arbiterInfo().catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
  ]);

  return NextResponse.json({
    statusCounts: Object.fromEntries(statusCounts),
    completedVolume: volume.data().total ?? 0,
    users: users.data().count,
    activeListings: activeListings.data().count,
    openDisputes: openDisputes.data().count,
    arbiter,
    recent: recent.docs.map((d) => {
      const t = d.data();
      return {
        id: d.id,
        itemDescription: t.itemDescription ?? "",
        amount: t.amount ?? 0,
        status: t.status ?? "",
        buyerName: t.buyerName ?? "",
        sellerName: t.sellerName ?? "",
        updatedAt: t.updatedAt?.toMillis?.() ?? null,
      };
    }),
  });
}
