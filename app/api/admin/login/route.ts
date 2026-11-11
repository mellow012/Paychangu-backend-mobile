import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  checkCredentials,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/adminAuth";

export async function POST(req: NextRequest) {
  const { email = "", password = "" } = await req.json().catch(() => ({}));
  if (!checkCredentials(String(email), String(password))) {
    // small delay slows down password guessing
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, createSessionToken(String(email)), sessionCookieOptions);
  return res;
}
