import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/adminAuth";
import { adminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

/** Identity verification requests, newest first. */
export async function GET() {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const snap = await adminDb().collection("verifications").orderBy("submittedAt", "desc").limit(100).get();
  const items = snap.docs.map((d) => {
    const v = d.data();
    return {
      uid: d.id,
      name: v.name ?? "",
      status: v.status ?? "",
      idImageUrl: v.idImageUrl ?? "",
      selfieUrl: v.selfieUrl ?? "",
      rejectReason: v.rejectReason ?? "",
      submittedAt: v.submittedAt?.toMillis?.() ?? null,
      reviewedAt: v.reviewedAt?.toMillis?.() ?? null,
    };
  });
  return NextResponse.json({ items });
}
