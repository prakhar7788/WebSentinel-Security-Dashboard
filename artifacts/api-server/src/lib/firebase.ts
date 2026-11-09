/**
 * firebase.ts — Firebase Admin SDK initialization with graceful fallback.
 *
 * If FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY are
 * set in the environment, initializes the Admin SDK and exports the Firestore
 * `db` instance. Otherwise exports `db = null` — callers check for null and
 * fall back to in-memory storage.
 *
 * This allows the app to run without Firebase credentials (prototype mode)
 * and switch to Firestore by simply adding the env vars.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "./logger.js";

export const isFirebaseEnabled = !!(
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY
);

export const db: FirebaseFirestore.Firestore | null = (() => {
  if (!isFirebaseEnabled) {
    logger.info("Firebase not configured — using in-memory storage");
    return null;
  }

  try {
    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId:   process.env.FIREBASE_PROJECT_ID!,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
          privateKey:  process.env.FIREBASE_PRIVATE_KEY!
            .replace(/\\n/g, "\n"),
        }),
      });
    }
    const firestore = getFirestore();
    firestore.settings({ ignoreUndefinedProperties: true });
    logger.info({ projectId: process.env.FIREBASE_PROJECT_ID }, "Firebase initialized");
    return firestore;
  } catch (err: any) {
    logger.error({ err: err.message }, "Firebase init failed — falling back to in-memory");
    return null;
  }
})();

// Keep admin export for anything that needs it elsewhere
export { cert as adminCert };
