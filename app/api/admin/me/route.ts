import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/** Lets the app ask "am I a moderator?" so it knows whether to show the console. */
export async function GET() {
  const email = await currentAdmin();
  return NextResponse.json({ moderator: !!email });
}
