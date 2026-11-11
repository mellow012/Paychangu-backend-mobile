import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/**
 * Minimal admin login for the moderator console.
 *
 * Env vars (Vercel):
 *   ADMIN_EMAIL     e.g. moderator@escrow.demo
 *   ADMIN_PASSWORD  a long random password
 *   ADMIN_SESSION_SECRET  a long random string used to sign the cookie
 *
 * Login sets an httpOnly, signed cookie valid for 8 hours. Every admin API
 * route and page calls requireAdmin() on the server.
 */
export const ADMIN_COOKIE = "admin_session";
const MAX_AGE_SECONDS = 8 * 60 * 60;

function sign(payload: string): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not set");
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkCredentials(email: string, password: string): boolean {
  const e = process.env.ADMIN_EMAIL;
  const p = process.env.ADMIN_PASSWORD;
  if (!e || !p) return false;
  // evaluate both so timing doesn't reveal which one was wrong
  const okEmail = safeEqual(email.trim().toLowerCase(), e.trim().toLowerCase());
  const okPass = safeEqual(password, p);
  return okEmail && okPass;
}

export function createSessionToken(email: string): string {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${email.toLowerCase()}|${expires}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  const payload = Buffer.from(b64, "base64url").toString();
  if (!safeEqual(sig, sign(payload))) return null;
  const [email, expires] = payload.split("|");
  if (!email || Number(expires) < Date.now()) return null;
  return email;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};

/** Returns the admin's email, or null when not signed in. Use in pages and routes. */
export async function currentAdmin(): Promise<string | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(ADMIN_COOKIE)?.value);
}
