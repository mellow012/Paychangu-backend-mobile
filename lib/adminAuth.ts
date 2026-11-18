import { createHmac, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

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

/**
 * In-app moderators: the Android app sends the signed-in user's Firebase ID token
 * as "Authorization: Bearer <token>". It is accepted only if the token is valid AND
 * the account's verified email is listed in MODERATOR_EMAILS (comma-separated, set
 * in Vercel). The list lives on the server, so a user can't make themselves a moderator.
 */
async function moderatorFromBearer(): Promise<string | null> {
  const allowed = (process.env.MODERATOR_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return null;

  const header = (await headers()).get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(header.slice(7));
    const email = decoded.email?.toLowerCase();
    if (email && decoded.email_verified && allowed.includes(email)) return email;
  } catch {
    // invalid or expired token
  }
  return null;
}

/**
 * Returns the moderator's email, or null when not signed in. Accepts either the web
 * console cookie or an in-app Firebase token. Use in every admin page and route.
 */
export async function currentAdmin(): Promise<string | null> {
  const jar = await cookies();
  const fromCookie = verifySessionToken(jar.get(ADMIN_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  return moderatorFromBearer();
}

/**
 * True when the moderator is one of the users involved (their account email matches).
 * Used to stop people deciding their own disputes or verifying themselves.
 * For demos where one person owns every test account, set ALLOW_SELF_MODERATION=1 in Vercel.
 */
export async function isPartyTo(moderatorEmail: string, uids: string[]): Promise<boolean> {
  if (process.env.ALLOW_SELF_MODERATION === "1") return false;
  const db = adminDb();
  const docs = await Promise.all(uids.filter(Boolean).map((u) => db.collection("users").doc(u).get()));
  const me = moderatorEmail.trim().toLowerCase();
  return docs.some((d) => String(d.get("email") ?? "").trim().toLowerCase() === me);
}

export const SELF_MODERATION_ERROR =
  "You are one of the people involved, so another moderator has to decide this.";
