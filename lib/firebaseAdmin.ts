import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";

/**
 * Lazily initializes the Firebase Admin app so importing this file never
 * throws at build time (Next.js can import route files during `next build`
 * even before env vars are configured on the hosting platform).
 */
function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Vercel env vars can't contain real newlines cleanly, so the private key
  // is stored with literal "\n" and unescaped here.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY."
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export function adminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export { Timestamp };
