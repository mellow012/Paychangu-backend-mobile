import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { currentAdmin } from "@/lib/adminAuth";
import { adminDb, Timestamp } from "@/lib/firebaseAdmin";

/**
 * Body: { action: "approve" | "reject", reason?: string }
 * Approve sets users/{uid}.isVerified = true; both outcomes notify the user.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { uid } = await params;

  const body = await req.json().catch(() => ({}));
  const action = body.action === "approve" || body.action === "reject" ? body.action : null;
  if (!action) return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  const reason = String(body.reason ?? "").trim().slice(0, 300);
  if (action === "reject" && !reason) {
    return NextResponse.json({ error: "Give a short reason so the user knows what to fix" }, { status: 400 });
  }

  const db = adminDb();
  const vRef = db.collection("verifications").doc(uid);
  const vSnap = await vRef.get();
  if (!vSnap.exists) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (vSnap.get("status") !== "pending") {
    return NextResponse.json({ error: "This request was already reviewed" }, { status: 409 });
  }

  const approve = action === "approve";
  const batch = db.batch();
  batch.update(vRef, {
    status: approve ? "approved" : "rejected",
    rejectReason: approve ? "" : reason,
    reviewedAt: Timestamp.now(),
    reviewedBy: admin,
  });
  if (approve) batch.set(db.collection("users").doc(uid), { isVerified: true }, { merge: true });

  const notifId = randomUUID();
  batch.set(db.collection("notifications").doc(notifId), {
    id: notifId,
    recipientUid: uid,
    title: approve ? "You're verified" : "Verification rejected",
    message: approve
      ? "Your identity was confirmed. A verified badge now shows on your profile."
      : `Your verification was rejected: ${reason} You can submit new photos from your profile.`,
    type: "SYSTEM",
    tradeId: "",
    isRead: false,
    createdAt: Timestamp.now(),
  });
  await batch.commit();

  return NextResponse.json({ ok: true });
}
