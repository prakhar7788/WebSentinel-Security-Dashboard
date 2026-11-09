/**
 * passive-sources.ts
 *
 * Pure-Node passive subdomain discovery integrations — no external binaries
 * required. Each source is an independent async function that always resolves
 * (never rejects). Failed sources return an empty array so the pipeline can
 * continue with whatever is available.
 *
 * Sources implemented:
 *   1. crt.sh          — Certificate Transparency (already in the route; moved here)
 *   2. HackerTarget    — free API, no key required
 *   3. RapidDNS        — free scrape, no key required
 *   4. AlienVault OTX  — free passive DNS API, no key required
 *   5. ThreatCrowd     — free passive DNS API, no key required
 *   6. VirusTotal      — free tier with optional API key (env: VT_API_KEY)
 *   7. URLScan.io      — free search API, no key required
 *   8. Anubis-DB       — free public API, no key required
 */

import { logger } from "./logger.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface PassiveSourceResult {
  source: PassiveSourceName;
  subdomains: string[];   // bare FQDNs, lowercased, deduped
  elapsedMs: number;
  error?: string;
}

export type PassiveSourceName =
  | "crt.sh"
  | "hackertarget"
  | "rapiddns"
  | "alienvault"
  | "threatcrowd"
  | "virustotal"
  | "urlscan"
  | "anubis";

// ── Shared helpers ─────────────────────────────────────────────────────────

const DEFAULT_HEADERS = {
  "User-Agent": "WebSentinel-Security-Scanner/1.0",
  "Accept": "application/json",
};

/** Fetch with an AbortController timeout. Returns null on any error. */
async function safeFetch(url: string, timeoutMs: number, extraHeaders: Record<string, string> = {}): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { ...DEFAULT_HEADERS, ...extraHeaders },
    });
    clearTimeout(timer);
    return res;
  } catch (err: any) {
    clearTimeout(timer);
    return null;
  }
}

/** Deduplicate and filter to names that belong to baseDomain. */
function filterAndDedupe(names: string[], baseDomain: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const fqdn = raw.toLowerCase().trim().replace(/^\*\./, "");
    if (!fqdn) continue;
    if (fqdn !== baseDomain && !fqdn.endsWith(`.${baseDomain}`)) continue;
    if (seen.has(fqdn)) continue;
    seen.add(fqdn);
    result.push(fqdn);
  }
  return result;
}

// ── 1. crt.sh ─────────────────────────────────────────────────────────────
// https://crt.sh/?q=%.example.com&output=json
// Returns JSON array of certificate records, each with name_value and common_name.

export async function queryCrtSh(domain: string): Promise<PassiveSourceResult> {
  const source: PassiveSourceName = "crt.sh";
  const start = Date.now();
  const url = `https://crt.sh/?q=%.${domain}&output=json`;

  const res = await safeFetch(url, 12_000);
  if (!res?.ok) {
    const error = res ? `HTTP ${res.status}` : "fetch failed / timeout";
    logger.warn({ source, domain, error }, "passive-source: failed");
    return { source, subdomains: [], elapsedMs: Date.now() - start, error };
  }

  try {
    const data = await res.json() as Array<{ name_value: string; common_name: string }>;
    const raw: string[] = [];
    for (const entry of data) {
      raw.push(...entry.name_value.split("\n"));
      raw.push(entry.common_name);
    }
    const subdomains = filterAndDedupe(raw, domain);
    logger.info({ source, domain, count: subdomains.length }, "passive-source: ok");
    return { source, subdomains, elapsedMs: Date.now() - start };
  } catch (err: any) {
    return { source, subdomains: [], elapsedMs: Date.now() - start, error: err.message };
  }
}

// ── 2. HackerTarget ───────────────────────────────────────────────────────
// https://api.hackertarget.com/hostsearch/?q=example.com
// Returns plain text: "subdomain.example.com,1.2.3.4" one per line.
// Free tier: 100 queries/day, no key needed.

export async function queryHackerTarget(domain: string): Promise<PassiveSourceResult> {
  const source: PassiveSourceName = "hackertarget";
  const start = Date.now();
  const url = `https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(domain)}`;

  const res = await safeFetch(url, 10_000, { "Accept": "text/plain" });
  if (!res?.ok) {
    const error = res ? `HTTP ${res.status}` : "fetch failed / timeout";
    logger.warn({ source, domain, error }, "passive-source: failed");
    return { source, subdomains: [], elapsedMs: Date.now() - start, error };
  }

  try {
    const text = await res.text();
    // Guard against rate-limit HTML responses
    if (text.startsWith("<") || text.includes("API count exceeded")) {
      return { source, subdomains: [], elapsedMs: Date.now() - start, error: "Rate limited" };
    }
    const raw = text
      .split("\n")
      .map(line => line.split(",")[0]?.trim())
      .filter(Boolean) as string[];
    const subdomains = filterAndDedupe(raw, domain);
    logger.info({ source, domain, count: subdomains.length }, "passive-source: ok");
    return { source, subdomains, elapsedMs: Date.now() - start };
  } catch (err: any) {
    return { source, subdomains: [], elapsedMs: Date.now() - start, error: err.message };
  }
}

// ── 3. RapidDNS ──────────────────────────────────────────────────────────
// https://rapiddns.io/subdomain/example.com?full=1
// Returns HTML — we extract hostnames from the table via a regex.
// No key, no rate-limit header required.

export async function queryRapidDNS(domain: string): Promise<PassiveSourceResult> {
  const source: PassiveSourceName = "rapiddns";
  const start = Date.now();
  const url = `https://rapiddns.io/subdomain/${encodeURIComponent(domain)}?full=1`;

  const res = await safeFetch(url, 10_000, { "Accept": "text/html" });
  if (!res?.ok) {
    const error = res ? `HTTP ${res.status}` : "fetch failed / timeout";
    logger.warn({ source, domain, error }, "passive-source: failed");
    return { source, subdomains: [], elapsedMs: Date.now() - start, error };
  }

  try {
    const html = await res.text();
    // Table cells containing FQDNs look like: <td>sub.example.com</td>
    const fqdnRe = /<td>([a-z0-9][a-z0-9\-\.]*\.[a-z]{2,})<\/td>/gi;
    const raw: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = fqdnRe.exec(html)) !== null) {
      raw.push(m[1]);
    }
    const subdomains = filterAndDedupe(raw, domain);
    logger.info({ source, domain, count: subdomains.length }, "passive-source: ok");
    return { source, subdomains, elapsedMs: Date.now() - start };
  } catch (err: any) {
    return { source, subdomains: [], elapsedMs: Date.now() - start, error: err.message };
  }
}

// ── 4. AlienVault OTX ────────────────────────────────────────────────────
// https://otx.alienvault.com/api/v1/indicators/domain/{domain}/passive_dns
// Returns JSON with "passive_dns" array, each entry has "hostname".
// No key required for this endpoint (public tier).

export async function queryAlienVault(domain: string): Promise<PassiveSourceResult> {
  const source: PassiveSourceName = "alienvault";
  const start = Date.now();
  const url = `https://otx.alienvault.com/api/v1/indicators/domain/${encodeURIComponent(domain)}/passive_dns`;

  const res = await safeFetch(url, 12_000);
  if (!res?.ok) {
    const error = res ? `HTTP ${res.status}` : "fetch failed / timeout";
    logger.warn({ source, domain, error }, "passive-source: failed");
    return { source, subdomains: [], elapsedMs: Date.now() - start, error };
  }

  try {
    const data = await res.json() as { passive_dns?: Array<{ hostname: string }> };
    const raw = (data.passive_dns ?? []).map(e => e.hostname);
    const subdomains = filterAndDedupe(raw, domain);
    logger.info({ source, domain, count: subdomains.length }, "passive-source: ok");
    return { source, subdomains, elapsedMs: Date.now() - start };
  } catch (err: any) {
    return { source, subdomains: [], elapsedMs: Date.now() - start, error: err.message };
  }
}

// ── 5. ThreatCrowd ────────────────────────────────────────────────────────
// https://www.threatcrowd.org/searchApi/v2/domain/report/?domain=example.com
// Returns JSON with "subdomains" array of strings.
// Free, no key required. Rate-limited to ~1 req/10s per IP.

export async function queryThreatCrowd(domain: string): Promise<PassiveSourceResult> {
  const source: PassiveSourceName = "threatcrowd";
  const start = Date.now();
  const url = `https://www.threatcrowd.org/searchApi/v2/domain/report/?domain=${encodeURIComponent(domain)}`;

  const res = await safeFetch(url, 10_000);
  if (!res?.ok) {
    const error = res ? `HTTP ${res.status}` : "fetch failed / timeout";
    logger.warn({ source, domain, error }, "passive-source: failed");
    return { source, subdomains: [], elapsedMs: Date.now() - start, error };
  }

  try {
    const data = await res.json() as { subdomains?: string[]; response_code?: string };
    // response_code "0" means no results / not found
    if (data.response_code === "0") {
      return { source, subdomains: [], elapsedMs: Date.now() - start };
    }
    const subdomains = filterAndDedupe(data.subdomains ?? [], domain);
    logger.info({ source, domain, count: subdomains.length }, "passive-source: ok");
    return { source, subdomains, elapsedMs: Date.now() - start };
  } catch (err: any) {
    return { source, subdomains: [], elapsedMs: Date.now() - start, error: err.message };
  }
}

// ── 6. VirusTotal ─────────────────────────────────────────────────────────
// https://www.virustotal.com/vtapi/v2/domain/report?apikey=KEY&domain=example.com
// With key: returns full report including subdomains array.
// Without key (env VT_API_KEY not set): skipped gracefully.
// Free tier: 4 req/min, 500 req/day.

export async function queryVirusTotal(domain: string): Promise<PassiveSourceResult> {
  const source: PassiveSourceName = "virustotal";
  const start = Date.now();
  const apiKey = process.env["VT_API_KEY"];

  if (!apiKey) {
    // Skip silently — not an error, just not configured
    return { source, subdomains: [], elapsedMs: 0, error: "VT_API_KEY not set" };
  }

  const url = `https://www.virustotal.com/vtapi/v2/domain/report?apikey=${encodeURIComponent(apiKey)}&domain=${encodeURIComponent(domain)}`;

  const res = await safeFetch(url, 15_000);
  if (!res?.ok) {
    const error = res ? `HTTP ${res.status}` : "fetch failed / timeout";
    logger.warn({ source, domain, error }, "passive-source: failed");
    return { source, subdomains: [], elapsedMs: Date.now() - start, error };
  }

  try {
    const data = await res.json() as { subdomains?: string[]; response_code?: number };
    if (data.response_code !== 1) {
      return { source, subdomains: [], elapsedMs: Date.now() - start };
    }
    const subdomains = filterAndDedupe(data.subdomains ?? [], domain);
    logger.info({ source, domain, count: subdomains.length }, "passive-source: ok");
    return { source, subdomains, elapsedMs: Date.now() - start };
  } catch (err: any) {
    return { source, subdomains: [], elapsedMs: Date.now() - start, error: err.message };
  }
}

// ── 7. URLScan.io ─────────────────────────────────────────────────────────
// https://urlscan.io/api/v1/search/?q=domain:example.com&size=200
// Returns JSON with "results" array, each entry has "page.domain".
// No key required for search (public results only).

export async function queryURLScan(domain: string): Promise<PassiveSourceResult> {
  const source: PassiveSourceName = "urlscan";
  const start = Date.now();
  const url = `https://urlscan.io/api/v1/search/?q=domain%3A${encodeURIComponent(domain)}&size=200`;

  const res = await safeFetch(url, 12_000);
  if (!res?.ok) {
    const error = res ? `HTTP ${res.status}` : "fetch failed / timeout";
    logger.warn({ source, domain, error }, "passive-source: failed");
    return { source, subdomains: [], elapsedMs: Date.now() - start, error };
  }

  try {
    const data = await res.json() as { results?: Array<{ page?: { domain?: string } }> };
    const raw = (data.results ?? []).map(r => r.page?.domain ?? "");
    const subdomains = filterAndDedupe(raw, domain);
    logger.info({ source, domain, count: subdomains.length }, "passive-source: ok");
    return { source, subdomains, elapsedMs: Date.now() - start };
  } catch (err: any) {
    return { source, subdomains: [], elapsedMs: Date.now() - start, error: err.message };
  }
}

// ── 8. Anubis-DB ──────────────────────────────────────────────────────────
// https://jldc.me/anubis/subdomains/example.com
// Returns a raw JSON array of FQDN strings. Free, no key.

export async function queryAnubis(domain: string): Promise<PassiveSourceResult> {
  const source: PassiveSourceName = "anubis";
  const start = Date.now();
  const url = `https://jldc.me/anubis/subdomains/${encodeURIComponent(domain)}`;

  const res = await safeFetch(url, 10_000);
  if (!res?.ok) {
    const error = res ? `HTTP ${res.status}` : "fetch failed / timeout";
    logger.warn({ source, domain, error }, "passive-source: failed");
    return { source, subdomains: [], elapsedMs: Date.now() - start, error };
  }

  try {
    const data = await res.json() as string[];
    if (!Array.isArray(data)) {
      return { source, subdomains: [], elapsedMs: Date.now() - start, error: "Unexpected response shape" };
    }
    const subdomains = filterAndDedupe(data, domain);
    logger.info({ source, domain, count: subdomains.length }, "passive-source: ok");
    return { source, subdomains, elapsedMs: Date.now() - start };
  } catch (err: any) {
    return { source, subdomains: [], elapsedMs: Date.now() - start, error: err.message };
  }
}

// ── Run all passive sources in parallel ────────────────────────────────────

export async function runAllPassiveSources(domain: string): Promise<PassiveSourceResult[]> {
  const settled = await Promise.allSettled([
    queryCrtSh(domain),
    queryHackerTarget(domain),
    queryRapidDNS(domain),
    queryAlienVault(domain),
    queryThreatCrowd(domain),
    queryVirusTotal(domain),
    queryURLScan(domain),
    queryAnubis(domain),
  ]);

  return settled.map((r, i) => {
    const names: PassiveSourceName[] = [
      "crt.sh", "hackertarget", "rapiddns", "alienvault",
      "threatcrowd", "virustotal", "urlscan", "anubis",
    ];
    if (r.status === "fulfilled") return r.value;
    return { source: names[i], subdomains: [], elapsedMs: 0, error: String(r.reason) };
  });
}
