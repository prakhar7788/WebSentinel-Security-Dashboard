/**
 * scans.ts — Scan history API endpoints backed by Firestore.
 *
 * Endpoints:
 *   POST   /api/scans          — save a scan record
 *   GET    /api/scans          — list all scans for the authenticated user
 *   GET    /api/scans/:id      — get a specific scan
 *   DELETE /api/scans/:id      — delete a scan
 *
 * When Firebase is configured, scans are stored in the `scans` Firestore
 * collection. When Firebase is not available, scans are stored in an
 * in-memory Map (lost on server restart).
 *
 * Each scan is associated with the authenticated user via session.userId.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { getSession, isValidToken, activeSessions } from "./auth.js";
import { db } from "../lib/firebase.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const SCANS_COLLECTION = "scans";

// ── In-memory fallback store ────────────────────────────────────────────────
const memScans = new Map<string, { userId: string; data: any }>();

// ── Auth middleware (same pattern as subdomains/tls) ────────────────────────
function requireAuth(req: Request, res: Response, next: () => void) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = auth.slice(7);
  if (!isValidToken(token)) { res.status(401).json({ error: "Invalid or expired token" }); return; }
  next();
}

// ── Helper: get userId from Bearer token ────────────────────────────────────
function getUserId(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const session = getSession(auth.slice(7));
  return session?.userId ?? null;
}

// ── Zod schema for scan save ─────────────────────────────────────────────────
const SaveScanSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["subdomain", "tls"]),
  domain: z.string().min(1),
  data: z.record(z.any()),
  scannedAt: z.string().optional(),
});

// ── POST /api/scans — save a scan ───────────────────────────────────────────
router.post("/scans", requireAuth, async (req: Request, res: Response) => {
  const parsed = SaveScanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid scan data", details: parsed.error.flatten() });
    return;
  }

  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Session expired" }); return; }

  const scan = {
    ...parsed.data,
    userId,
    scannedAt: parsed.data.scannedAt ?? new Date().toISOString(),
  };

  // Store in memory
  memScans.set(scan.id, { userId, data: scan });

  // Store in Firestore
  if (db) {
    try {
      await db.collection(SCANS_COLLECTION).doc(scan.id).set(scan);
      logger.info({ scanId: scan.id, userId, type: scan.type }, "scan saved to Firestore");
    } catch (err: any) {
      logger.error({ err: err.message, scanId: scan.id }, "Firestore scan save failed");
    }
  } else {
    logger.info({ scanId: scan.id, userId, type: scan.type }, "scan saved (in-memory)");
  }

  res.status(201).json({ ok: true, id: scan.id });
});

// ── GET /api/scans — list all scans for the user ────────────────────────────
router.get("/scans", requireAuth, async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Session expired" }); return; }

  if (db) {
    try {
      const snapshot = await db.collection(SCANS_COLLECTION)
        .where("userId", "==", userId)
        .orderBy("scannedAt", "desc")
        .limit(50)
        .get();

      const scans = snapshot.docs.map(d => d.data());
      res.json({ scans });
      return;
    } catch (err: any) {
      logger.error({ err: err.message }, "Firestore scan list failed — falling back to in-memory");
    }
  }

  // In-memory fallback
  const scans = [...memScans.values()]
    .filter(s => s.userId === userId)
    .map(s => s.data)
    .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())
    .slice(0, 50);

  res.json({ scans });
});

// ── GET /api/scans/:id — get a specific scan ────────────────────────────────
router.get("/scans/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Session expired" }); return; }
  const scanId = req.params.id;

  if (db) {
    try {
      const doc = await db.collection(SCANS_COLLECTION).doc(scanId).get();
      if (doc.exists) {
        const scan = doc.data();
        if (scan?.userId !== userId) {
          res.status(403).json({ error: "Not authorized to view this scan" });
          return;
        }
        res.json(scan);
        return;
      }
    } catch (err: any) {
      logger.error({ err: err.message, scanId }, "Firestore scan get failed");
    }
  }

  // In-memory fallback
  const record = memScans.get(scanId);
  if (!record || record.userId !== userId) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }
  res.json(record.data);
});

// ── DELETE /api/scans/:id — delete a scan ────────────────────────────────────
router.delete("/scans/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Session expired" }); return; }
  const scanId = req.params.id;

  // Delete from in-memory
  const record = memScans.get(scanId);
  if (record && record.userId !== userId) {
    res.status(403).json({ error: "Not authorized to delete this scan" });
    return;
  }
  memScans.delete(scanId);

  // Delete from Firestore
  if (db) {
    try {
      const doc = await db.collection(SCANS_COLLECTION).doc(scanId).get();
      if (doc.exists && doc.data()?.userId !== userId) {
        res.status(403).json({ error: "Not authorized to delete this scan" });
        return;
      }
      await db.collection(SCANS_COLLECTION).doc(scanId).delete();
    } catch (err: any) {
      logger.error({ err: err.message, scanId }, "Firestore scan delete failed");
    }
  }

  res.json({ ok: true });
});

export default router;
