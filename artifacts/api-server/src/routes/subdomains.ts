import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import dns from "node:dns/promises";
import https from "node:https";
import http from "node:http";
import tls from "node:tls";
import { activeSessions } from "./auth.js";

const router: IRouter = Router();

// ----- Auth middleware -----
function requireAuth(req: Request, res: Response, next: () => void) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);
  if (!activeSessions.has(token)) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  next();
}

// ----- Helpers -----

// Well-known subdomain wordlist for active enumeration
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

// Passive sources simulate cert transparency / DNS aggregation
// In a real tool these would call crt.sh, SecurityTrails, Shodan etc.
const PASSIVE_COMMON_PREFIXES = [
  "www", "mail", "api", "app", "dev", "staging", "cdn", "static",
  "auth", "admin", "docs", "blog", "shop", "portal",
];

interface SubdomainResult {
  subdomain: string;
  fqdn: string;
  resolved: boolean;
  ipAddresses: string[];
  source: "active" | "passive" | "cert-transparency" | "dns-brute";
  httpStatus?: number;
  httpsAvailable?: boolean;
  responseTime?: number;
  cnames?: string[];
}

async function resolveSubdomain(fqdn: string): Promise<{ resolved: boolean; ips: string[]; cnames: string[] }> {
  try {
    const [addressResult, cnameResult] = await Promise.allSettled([
      dns.resolve4(fqdn).catch(() => dns.resolve6(fqdn).then(ips => ips)),
      dns.resolveCname(fqdn).catch(() => []),
    ]);

    const ips = addressResult.status === "fulfilled" ? addressResult.value as string[] : [];
    const cnames = cnameResult.status === "fulfilled" ? cnameResult.value as string[] : [];

    return { resolved: ips.length > 0 || cnames.length > 0, ips, cnames };
  } catch {
    return { resolved: false, ips: [], cnames: [] };
  }
}

async function checkHttp(fqdn: string, timeoutMs = 4000): Promise<{ status?: number; httpsAvailable: boolean; responseTimeMs?: number }> {
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
      // Fall back to HTTP
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

// Validate and parse the target domain
const EnumerateSchema = z.object({
  domain: z.string()
    .min(3)
    .max(253)
    .regex(/^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)+$/, "Invalid domain format"),
  mode: z.enum(["passive", "active", "both"]).default("passive"),
  checkHttp: z.boolean().default(false),
  wordlistSize: z.enum(["small", "medium", "full"]).default("small"),
});

// POST /api/subdomains/enumerate
router.post("/subdomains/enumerate", requireAuth, async (req: Request, res: Response) => {
  const parsed = EnumerateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const { domain, mode, checkHttp: doHttpCheck, wordlistSize } = parsed.data;

  // Normalize domain
  const baseDomain = domain.toLowerCase().replace(/^www\./, "");

  const startTime = Date.now();
  const results: SubdomainResult[] = new Map<string, SubdomainResult>().values().next().value ? [] : [];
  const seen = new Set<string>();

  function addResult(r: SubdomainResult) {
    if (!seen.has(r.fqdn)) {
      seen.add(r.fqdn);
      results.push(r);
    }
  }

  // --- Passive enumeration ---
  if (mode === "passive" || mode === "both") {
    // 1. Try crt.sh certificate transparency (real network call)
    try {
      const crtShUrl = `https://crt.sh/?q=%.${baseDomain}&output=json`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const crtRes = await fetch(crtShUrl, {
        signal: controller.signal,
        headers: { "Accept": "application/json", "User-Agent": "WebSentinel-Security-Scanner/1.0" },
      });
      clearTimeout(timeout);

      if (crtRes.ok) {
        const crtData = await crtRes.json() as Array<{ name_value: string; common_name: string }>;
        const certNames = new Set<string>();

        for (const entry of crtData) {
          const names = [entry.name_value, entry.common_name]
            .flatMap(n => n.split("\n"))
            .map(n => n.toLowerCase().trim().replace(/^\*\./, ""));

          for (const name of names) {
            if (name.endsWith(`.${baseDomain}`) || name === baseDomain) {
              certNames.add(name);
            }
          }
        }

        for (const fqdn of certNames) {
          const subdomain = fqdn === baseDomain ? "@" : fqdn.replace(`.${baseDomain}`, "");
          const { resolved, ips, cnames } = await resolveSubdomain(fqdn);
          let httpInfo = { httpsAvailable: false, status: undefined as number | undefined, responseTimeMs: undefined as number | undefined };
          if (doHttpCheck && resolved) {
            const res2 = await checkHttp(fqdn);
            httpInfo = { httpsAvailable: res2.httpsAvailable, status: res2.status, responseTimeMs: res2.responseTimeMs };
          }

          addResult({
            subdomain,
            fqdn,
            resolved,
            ipAddresses: ips,
            cnames,
            source: "cert-transparency",
            httpsAvailable: httpInfo.httpsAvailable,
            httpStatus: httpInfo.status,
            responseTime: httpInfo.responseTimeMs,
          });
        }
      }
    } catch {
      // crt.sh unavailable — continue with other methods
    }

    // 2. Common prefix passive guesses
    const passiveList = wordlistSize === "small" ? PASSIVE_COMMON_PREFIXES : ACTIVE_WORDLIST.slice(0, 30);
    const passivePromises = passiveList.map(async (prefix) => {
      const fqdn = `${prefix}.${baseDomain}`;
      if (seen.has(fqdn)) return;
      const { resolved, ips, cnames } = await resolveSubdomain(fqdn);
      if (resolved) {
        let httpInfo = { httpsAvailable: false, status: undefined as number | undefined, responseTimeMs: undefined as number | undefined };
        if (doHttpCheck) {
          const res2 = await checkHttp(fqdn);
          httpInfo = { httpsAvailable: res2.httpsAvailable, status: res2.status, responseTimeMs: res2.responseTimeMs };
        }
        addResult({
          subdomain: prefix,
          fqdn,
          resolved: true,
          ipAddresses: ips,
          cnames,
          source: "passive",
          httpsAvailable: httpInfo.httpsAvailable,
          httpStatus: httpInfo.status,
          responseTime: httpInfo.responseTimeMs,
        });
      }
    });
    await Promise.allSettled(passivePromises);
  }

  // --- Active enumeration (DNS brute-force) ---
  if (mode === "active" || mode === "both") {
    const wordlist =
      wordlistSize === "small" ? ACTIVE_WORDLIST.slice(0, 40) :
      wordlistSize === "medium" ? ACTIVE_WORDLIST.slice(0, 80) :
      ACTIVE_WORDLIST;

    // Process in batches to avoid overwhelming DNS
    const BATCH_SIZE = 15;
    for (let i = 0; i < wordlist.length; i += BATCH_SIZE) {
      const batch = wordlist.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (word) => {
          const fqdn = `${word}.${baseDomain}`;
          if (seen.has(fqdn)) return;
          const { resolved, ips, cnames } = await resolveSubdomain(fqdn);
          if (resolved) {
            let httpInfo = { httpsAvailable: false, status: undefined as number | undefined, responseTimeMs: undefined as number | undefined };
            if (doHttpCheck) {
              const res2 = await checkHttp(fqdn);
              httpInfo = { httpsAvailable: res2.httpsAvailable, status: res2.status, responseTimeMs: res2.responseTimeMs };
            }
            addResult({
              subdomain: word,
              fqdn,
              resolved: true,
              ipAddresses: ips,
              cnames,
              source: "dns-brute",
              httpsAvailable: httpInfo.httpsAvailable,
              httpStatus: httpInfo.status,
              responseTime: httpInfo.responseTimeMs,
            });
          }
        }),
      );
    }
  }

  const elapsed = Date.now() - startTime;

  res.json({
    domain: baseDomain,
    mode,
    totalFound: results.length,
    resolvedCount: results.filter(r => r.resolved).length,
    elapsedMs: elapsed,
    subdomains: results.sort((a, b) => {
      // Sort: resolved first, then alphabetically
      if (a.resolved !== b.resolved) return a.resolved ? -1 : 1;
      return a.fqdn.localeCompare(b.fqdn);
    }),
  });
});

export default router;
