import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";

/** Body: { verified: boolean }. Marks a user as a verified trader (or removes it). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { uid } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.verified !== "boolean") {
    return NextResponse.json({ error: "verified must be true or false" }, { status: 400 });
  }
  const ref = adminDb().collection("users").doc(uid);
  if (!(await ref.get()).exists) return NextResponse.json({ error: "User not found" }, { status: 404 });
  await ref.update({ isVerified: body.verified });
  return NextResponse.json({ ok: true });
}
