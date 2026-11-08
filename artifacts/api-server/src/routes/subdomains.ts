/**
 * subdomains.ts — POST /api/subdomains/enumerate
 *
 * Pipeline (all stages run in parallel where possible):
 *
 *  Passive stage:
 *    • 8 passive API sources (crt.sh, HackerTarget, RapidDNS, AlienVault OTX,
 *      ThreatCrowd, VirusTotal, URLScan, Anubis) — lib/passive-sources.ts
 *    • Common-prefix DNS guessing (built-in, always runs)
 *
 *  Tool stage (parallel with passive):
 *    • subfinder, amass, sublist3r — lib/tool-runner.ts
 *    • Each tool is skipped gracefully if the binary is not installed.
 *
 *  Active stage (DNS brute-force, only when mode = "active" | "both"):
 *    • Wordlist sliced by wordlistSize, processed in batches of 15.
 *
 *  Post-processing:
 *    • All found FQDNs are deduplicated across sources.
 *    • Each result is tagged with the source(s) that found it.
 *    • Optional HTTP/HTTPS probing on resolved hosts.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import dns from "node:dns/promises";
import https from "node:https";
import http from "node:http";
import { activeSessions, isValidToken } from "./auth.js";
import { runAllPassiveSources, type PassiveSourceName } from "../lib/passive-sources.js";
import { runAllTools } from "../lib/tool-runner.js";

const router: IRouter = Router();

// ── Auth middleware ────────────────────────────────────────────────────────

function requireAuth(req: Request, res: Response, next: () => void) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);
  if (!isValidToken(token)) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  next();
}

// ── Source type union ──────────────────────────────────────────────────────
// Extends the original 4 values with every new source name so the frontend
// can render a distinct badge for each.

export type SubdomainSource =
  // API-based passive sources
  | "crt.sh"
  | "hackertarget"
  | "rapiddns"
  | "alienvault"
  | "threatcrowd"
  | "virustotal"
  | "urlscan"
  | "anubis"
  // External tool output
  | "subfinder"
  | "amass"
  | "sublist3r"
  // Built-in methods (unchanged from original)
  | "dns-brute"
  | "passive"       // common-prefix DNS guessing
  | "active"        // legacy label kept for compatibility
  | "cert-transparency"; // kept as alias for crt.sh in legacy records

// ── Subdomain result shape ─────────────────────────────────────────────────

export interface SubdomainResult {
  subdomain: string;
  fqdn: string;
  resolved: boolean;
  ipAddresses: string[];
  /** Primary source that first discovered this FQDN */
  source: SubdomainSource;
  /** Every source that returned this FQDN (may be several) */
  sources: SubdomainSource[];
  httpStatus?: number;
  httpsAvailable?: boolean;
  responseTime?: number;
  cnames?: string[];
}

// ── Tool / source run summary (returned in the response) ─────────────────

export interface SourceSummary {
  name: string;
  type: "api" | "tool" | "builtin";
  ran: boolean;
  found: number;
  elapsedMs: number;
  error?: string;
}

// ── Wordlists ─────────────────────────────────────────────────────────────

const ACTIVE_WORDLIST = [
  "www", "mail", "smtp", "pop", "imap", "ftp", "sftp", "vpn", "remote",
  "api", "api2", "v1", "v2", "v3",
  "app", "app2", "apps", "web", "web2",
  "admin", "administrator", "portal", "dashboard", "panel", "manage", "manager", "cp", "cpanel",
  "dev", "dev2", "development", "staging", "stage", "stg", "qa", "test", "testing", "beta", "alpha",
  "cdn", "static", "assets", "media", "images", "img", "files", "uploads", "download",
  "blog", "shop", "store", "docs", "documentation", "help", "support", "kb", "wiki",
  "login", "auth", "sso", "account", "accounts", "id",
  "status", "monitor", "metrics", "grafana", "kibana", "logs",
  "git", "gitlab", "github", "bitbucket", "svn", "jenkins", "ci", "cd", "build",
  "jira", "confluence", "slack", "teams",
  "db", "database", "mysql", "postgres", "redis", "mongo",
  "ns1", "ns2", "ns3", "mx", "mx1", "mx2",
  "m", "mobile", "wap",
  "old", "legacy", "archive", "backup", "bak",
  "secure", "ssl", "tls",
  "internal", "intranet", "corp", "office",
  "api-docs", "swagger", "graphql",
  "chat", "forum", "community",
  "pay", "payment", "billing", "invoice",
  "search", "analytics", "tracking", "stats",
];

const PASSIVE_COMMON_PREFIXES = [
  "www", "mail", "api", "app", "dev", "staging", "cdn", "static",
  "auth", "admin", "docs", "blog", "shop", "portal",
];

// ── DNS helpers ────────────────────────────────────────────────────────────

async function resolveSubdomain(fqdn: string): Promise<{ resolved: boolean; ips: string[]; cnames: string[] }> {
  try {
    const [addressResult, cnameResult] = await Promise.allSettled([
      dns.resolve4(fqdn).catch(() => dns.resolve6(fqdn).then(ips => ips)),
      dns.resolveCname(fqdn).catch(() => []),
    ]);
    const ips = addressResult.status === "fulfilled" ? (addressResult.value as string[]) : [];
    const cnames = cnameResult.status === "fulfilled" ? (cnameResult.value as string[]) : [];
    return { resolved: ips.length > 0 || cnames.length > 0, ips, cnames };
  } catch {
    return { resolved: false, ips: [], cnames: [] };
  }
}

async function checkHttpProbe(fqdn: string, timeoutMs = 4000): Promise<{ status?: number; httpsAvailable: boolean; responseTimeMs?: number }> {
  const start = Date.now();
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ httpsAvailable: false }), timeoutMs);

    const req = https.request(
      { hostname: fqdn, port: 443, path: "/", method: "HEAD", rejectUnauthorized: false, timeout: timeoutMs },
      (res) => {
        clearTimeout(timer);
        resolve({ status: res.statusCode, httpsAvailable: true, responseTimeMs: Date.now() - start });
        res.destroy();
      },
    );
    req.on("error", () => {
      clearTimeout(timer);
      const httpReq = http.request(
        { hostname: fqdn, port: 80, path: "/", method: "HEAD", timeout: timeoutMs },
        (res) => resolve({ status: res.statusCode, httpsAvailable: false, responseTimeMs: Date.now() - start }),
      );
      httpReq.on("error", () => resolve({ httpsAvailable: false }));
      httpReq.on("timeout", () => { httpReq.destroy(); resolve({ httpsAvailable: false }); });
      httpReq.end();
    });
    req.on("timeout", () => { req.destroy(); });
    req.end();
  });
}

// ── Input schema ──────────────────────────────────────────────────────────

const EnumerateSchema = z.object({
  domain: z.string()
    .min(3).max(253)
    .regex(
      /^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)+$/,
      "Invalid domain format",
    ),
  mode: z.enum(["passive", "active", "both"]).default("passive"),
  checkHttp: z.boolean().default(false),
  wordlistSize: z.enum(["small", "medium", "full"]).default("small"),
  /** Which tool runners to attempt (all attempted by default) */
  tools: z.array(z.enum(["subfinder", "amass", "sublist3r"])).default(["subfinder", "amass", "sublist3r"]),
  /** Which passive API sources to query (all by default) */
  passiveSources: z.array(
    z.enum(["crt.sh", "hackertarget", "rapiddns", "alienvault", "threatcrowd", "virustotal", "urlscan", "anubis"])
  ).default(["crt.sh", "hackertarget", "rapiddns", "alienvault", "threatcrowd", "virustotal", "urlscan", "anubis"]),
});

// ── Route ─────────────────────────────────────────────────────────────────

router.post("/subdomains/enumerate", requireAuth, async (req: Request, res: Response) => {
  const parsed = EnumerateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const { domain, mode, checkHttp: doHttpCheck, wordlistSize, tools: requestedTools, passiveSources: requestedSources } = parsed.data;
  const baseDomain = domain.toLowerCase().replace(/^www\./, "");
  const startTime = Date.now();

  // ── Deduplication state ──────────────────────────────────────────────────
  // fqdn → mutable result object so we can accumulate sources
  const resultMap = new Map<string, SubdomainResult>();

  function upsert(fqdn: string, source: SubdomainSource) {
    const existing = resultMap.get(fqdn);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
    } else {
      const subdomain = fqdn === baseDomain ? "@" : fqdn.replace(`.${baseDomain}`, "");
      resultMap.set(fqdn, {
        subdomain,
        fqdn,
        resolved: false,
        ipAddresses: [],
        source,          // first source wins as the primary label
        sources: [source],
        cnames: [],
      });
    }
  }

  const sourceSummaries: SourceSummary[] = [];

  // ── Stage 1 & 2: passive API sources + tool runners (parallel) ───────────

  const [passiveResults, toolResults] = await Promise.all([
    // Passive API sources (only when mode !== "active")
    mode !== "active"
      ? runAllPassiveSources(baseDomain)
      : Promise.resolve([]),
    // Tool runners (passive/both run tools; active skips passive tools)
    mode !== "active"
      ? runAllTools(baseDomain)
      : Promise.resolve([]),
  ]);

  // Ingest passive API source results
  for (const pr of passiveResults) {
    if (!requestedSources.includes(pr.source as any)) continue;

    sourceSummaries.push({
      name: pr.source,
      type: "api",
      ran: !pr.error || pr.subdomains.length > 0,
      found: pr.subdomains.length,
      elapsedMs: pr.elapsedMs,
      error: pr.error,
    });

    for (const fqdn of pr.subdomains) {
      upsert(fqdn, pr.source as SubdomainSource);
    }
  }

  // Ingest tool runner results
  for (const tr of toolResults) {
    if (!requestedTools.includes(tr.tool as any)) continue;

    sourceSummaries.push({
      name: tr.tool,
      type: "tool",
      ran: tr.available,
      found: tr.subdomains.length,
      elapsedMs: tr.elapsedMs,
      error: tr.available ? tr.error : "binary not installed",
    });

    for (const fqdn of tr.subdomains) {
      upsert(fqdn, tr.tool as SubdomainSource);
    }
  }

  // ── Stage 3: common-prefix passive guessing (built-in) ───────────────────
  if (mode === "passive" || mode === "both") {
    const prefixList = wordlistSize === "small" ? PASSIVE_COMMON_PREFIXES : ACTIVE_WORDLIST.slice(0, 30);
    const prefixStart = Date.now();
    let prefixFound = 0;

    await Promise.allSettled(
      prefixList.map(async (prefix) => {
        const fqdn = `${prefix}.${baseDomain}`;
        if (resultMap.has(fqdn)) return; // already found by a passive source
        const { resolved } = await resolveSubdomain(fqdn);
        if (resolved) { upsert(fqdn, "passive"); prefixFound++; }
      }),
    );

    sourceSummaries.push({
      name: "dns-prefix-guess",
      type: "builtin",
      ran: true,
      found: prefixFound,
      elapsedMs: Date.now() - prefixStart,
    });
  }

  // ── Stage 4: DNS brute-force (active) ────────────────────────────────────
  if (mode === "active" || mode === "both") {
    const wordlist =
      wordlistSize === "small"  ? ACTIVE_WORDLIST.slice(0, 40)  :
      wordlistSize === "medium" ? ACTIVE_WORDLIST.slice(0, 80)  :
      ACTIVE_WORDLIST;

    const bruteStart = Date.now();
    let bruteFound = 0;
    const BATCH_SIZE = 15;

    for (let i = 0; i < wordlist.length; i += BATCH_SIZE) {
      const batch = wordlist.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (word) => {
          const fqdn = `${word}.${baseDomain}`;
          if (resultMap.has(fqdn)) return;
          const { resolved } = await resolveSubdomain(fqdn);
          if (resolved) { upsert(fqdn, "dns-brute"); bruteFound++; }
        }),
      );
    }

    sourceSummaries.push({
      name: "dns-brute",
      type: "builtin",
      ran: true,
      found: bruteFound,
      elapsedMs: Date.now() - bruteStart,
    });
  }

  // ── Stage 5: DNS resolve + optional HTTP probe for every found FQDN ───────
  const allFqdns = [...resultMap.keys()];

  await Promise.allSettled(
    allFqdns.map(async (fqdn) => {
      const entry = resultMap.get(fqdn)!;
      const { resolved, ips, cnames } = await resolveSubdomain(fqdn);
      entry.resolved = resolved;
      entry.ipAddresses = ips;
      entry.cnames = cnames;

      if (doHttpCheck && resolved) {
        const probe = await checkHttpProbe(fqdn);
        entry.httpsAvailable = probe.httpsAvailable;
        entry.httpStatus     = probe.status;
        entry.responseTime   = probe.responseTimeMs;
      }
    }),
  );

  // ── Build and return response ─────────────────────────────────────────────
  const results = [...resultMap.values()].sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? -1 : 1;
    return a.fqdn.localeCompare(b.fqdn);
  });

  res.json({
    domain: baseDomain,
    mode,
    totalFound: results.length,
    resolvedCount: results.filter(r => r.resolved).length,
    elapsedMs: Date.now() - startTime,
    sourceSummaries,   // NEW: per-source breakdown for the UI panel
    subdomains: results,
  });
});

export default router;
