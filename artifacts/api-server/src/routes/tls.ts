import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import tls from "node:tls";
import https from "node:https";
import http from "node:http";
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

// ----- TLS Check helpers -----

interface TlsCertInfo {
  subject: Record<string, string>;
  issuer: Record<string, string>;
  validFrom: string;
  validTo: string;
  daysUntilExpiry: number;
  isExpired: boolean;
  isExpiringSoon: boolean; // < 30 days
  serialNumber: string;
  fingerprint: string;
  fingerprint256: string;
  subjectAltNames: string[];
  signatureAlgorithm: string;
  keyBits?: number;
  version: number;
  tlsVersion: string;
  cipherSuite: string;
  isWildcard: boolean;
  isSelfSigned: boolean;
  sanCount: number;
  rawCert?: string;
}

interface SecurityHeaderInfo {
  header: string;
  present: boolean;
  value?: string;
  recommendation: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
}

interface HttpsRedirectInfo {
  httpAvailable: boolean;
  httpsAvailable: boolean;
  redirectsToHttps: boolean;
  redirectChain: string[];
  hstsPresent: boolean;
  hstsMaxAge?: number;
  hstsIncludeSubdomains: boolean;
  hstsPreload: boolean;
}

interface TlsCheckResult {
  host: string;
  port: number;
  scanTime: string;
  elapsedMs: number;
  tlsSupport: {
    tls10: boolean;
    tls11: boolean;
    tls12: boolean;
    tls13: boolean;
  };
  cert: TlsCertInfo | null;
  securityHeaders: SecurityHeaderInfo[];
  httpsRedirect: HttpsRedirectInfo;
  overallGrade: "A+" | "A" | "B" | "C" | "D" | "F" | "T" | "N/A";
  findings: Array<{ severity: "critical" | "high" | "medium" | "low" | "info"; title: string; detail: string }>;
  error?: string;
}

const SECURITY_HEADERS_CHECK = [
  { name: "strict-transport-security", recommendation: "Add HSTS with max-age >= 31536000, includeSubDomains, preload", severity: "high" as const },
  { name: "content-security-policy", recommendation: "Define a strict CSP to prevent XSS and data injection", severity: "high" as const },
  { name: "x-content-type-options", recommendation: "Set to 'nosniff' to prevent MIME-type sniffing", severity: "medium" as const },
  { name: "x-frame-options", recommendation: "Set to DENY or SAMEORIGIN to prevent clickjacking", severity: "medium" as const },
  { name: "referrer-policy", recommendation: "Set to 'strict-origin-when-cross-origin' or stricter", severity: "low" as const },
  { name: "permissions-policy", recommendation: "Restrict browser feature access with Permissions-Policy header", severity: "low" as const },
  { name: "x-xss-protection", recommendation: "Legacy header: set to '1; mode=block' or '0' (CSP preferred)", severity: "info" as const },
  { name: "cache-control", recommendation: "For sensitive responses, use 'no-store, no-cache'", severity: "info" as const },
];

async function getCertificate(host: string, port = 443): Promise<{ cert: TlsCertInfo | null; tlsVersion: string; cipher: string; error?: string }> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host, port, rejectUnauthorized: false, timeout: 8000, servername: host },
      () => {
        const peer = socket.getPeerCertificate(true);
        const cipher = socket.getCipher();
        const protocol = socket.getProtocol() ?? "unknown";

        if (!peer || !peer.subject) {
          socket.destroy();
          resolve({ cert: null, tlsVersion: protocol, cipher: cipher?.name ?? "unknown", error: "No certificate returned" });
          return;
        }

        const now = new Date();
        const validTo = new Date(peer.valid_to);
        const validFrom = new Date(peer.valid_from);
        const daysUntilExpiry = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        // Extract Subject Alt Names
        const sanExtension = (peer as any).subjectaltname ?? "";
        const subjectAltNames = sanExtension
          .split(",")
          .map((s: string) => s.trim().replace(/^DNS:/, ""))
          .filter(Boolean);

        const subjectCN = peer.subject?.CN ?? "";
        const issuerCN = peer.issuer?.CN ?? "";
        const isSelfSigned = subjectCN === issuerCN || peer.subject?.O === peer.issuer?.O;
        const isWildcard = subjectAltNames.some((s: string) => s.startsWith("*.")) || (typeof subjectCN === "string" && subjectCN.startsWith("*."));

        const certInfo: TlsCertInfo = {
          subject: peer.subject as Record<string, string>,
          issuer: peer.issuer as Record<string, string>,
          validFrom: validFrom.toISOString(),
          validTo: validTo.toISOString(),
          daysUntilExpiry,
          isExpired: daysUntilExpiry < 0,
          isExpiringSoon: daysUntilExpiry >= 0 && daysUntilExpiry < 30,
          serialNumber: peer.serialNumber ?? "",
          fingerprint: peer.fingerprint ?? "",
          fingerprint256: peer.fingerprint256 ?? "",
          subjectAltNames,
          sanCount: subjectAltNames.length,
          signatureAlgorithm: (peer as any).sigalg ?? "",
          keyBits: (peer as any).bits ?? undefined,
          version: (peer as any).version ?? 3,
          tlsVersion: protocol,
          cipherSuite: cipher?.name ?? "unknown",
          isWildcard,
          isSelfSigned,
        };

        socket.destroy();
        resolve({ cert: certInfo, tlsVersion: protocol, cipher: cipher?.name ?? "unknown" });
      },
    );

    socket.on("error", (err) => {
      resolve({ cert: null, tlsVersion: "none", cipher: "none", error: err.message });
    });

    socket.setTimeout(8000, () => {
      socket.destroy();
      resolve({ cert: null, tlsVersion: "none", cipher: "none", error: "Connection timed out" });
    });
  });
}

async function checkTlsVersion(host: string, version: "TLSv1" | "TLSv1.1" | "TLSv1.2" | "TLSv1.3"): Promise<boolean> {
  const versionMap: Record<string, string> = {
    "TLSv1": "TLSv1",
    "TLSv1.1": "TLSv1.1",
    "TLSv1.2": "TLSv1.2",
    "TLSv1.3": "TLSv1.3",
  };

  return new Promise((resolve) => {
    try {
      const socket = tls.connect(
        {
          host,
          port: 443,
          rejectUnauthorized: false,
          timeout: 5000,
          servername: host,
          minVersion: versionMap[version] as tls.SecureVersion,
          maxVersion: versionMap[version] as tls.SecureVersion,
        },
        () => { socket.destroy(); resolve(true); },
      );
      socket.on("error", () => resolve(false));
      socket.setTimeout(5000, () => { socket.destroy(); resolve(false); });
    } catch {
      resolve(false);
    }
  });
}

async function getSecurityHeaders(host: string, port = 443): Promise<{ headers: SecurityHeaderInfo[]; httpRedirect: HttpsRedirectInfo }> {
  const headersPresent: Record<string, string> = {};
  const redirectChain: string[] = [];
  let httpAvailable = false;
  let httpsAvailable = false;
  let redirectsToHttps = false;
  let hstsMaxAge: number | undefined;
  let hstsIncludeSubdomains = false;
  let hstsPreload = false;

  // Check HTTPS headers
  await new Promise<void>((resolve) => {
    const req = https.request(
      { hostname: host, port, path: "/", method: "GET", rejectUnauthorized: false, timeout: 7000 },
      (res) => {
        httpsAvailable = true;
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === "string") headersPresent[k.toLowerCase()] = v;
          else if (Array.isArray(v)) headersPresent[k.toLowerCase()] = v.join(", ");
        }

        // Parse HSTS
        const hsts = headersPresent["strict-transport-security"];
        if (hsts) {
          const maxAgeMatch = /max-age=(\d+)/i.exec(hsts);
          if (maxAgeMatch) hstsMaxAge = parseInt(maxAgeMatch[1], 10);
          hstsIncludeSubdomains = /includeSubDomains/i.test(hsts);
          hstsPreload = /preload/i.test(hsts);
        }
        res.destroy();
        resolve();
      },
    );
    req.on("error", () => resolve());
    req.on("timeout", () => { req.destroy(); resolve(); });
    req.end();
  });

  // Check HTTP redirect
  await new Promise<void>((resolve) => {
    const req = http.request(
      { hostname: host, port: 80, path: "/", method: "HEAD", timeout: 5000 },
      (res) => {
        httpAvailable = true;
        const location = res.headers.location ?? "";
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          redirectChain.push(`HTTP → ${location}`);
          if (location.startsWith("https://")) redirectsToHttps = true;
        }
        res.destroy();
        resolve();
      },
    );
    req.on("error", () => resolve());
    req.on("timeout", () => { req.destroy(); resolve(); });
    req.end();
  });

  const securityHeaders: SecurityHeaderInfo[] = SECURITY_HEADERS_CHECK.map(({ name, recommendation, severity }) => ({
    header: name,
    present: name in headersPresent,
    value: headersPresent[name],
    recommendation,
    severity,
  }));

  return {
    headers: securityHeaders,
    httpRedirect: {
      httpAvailable,
      httpsAvailable,
      redirectsToHttps,
      redirectChain,
      hstsPresent: "strict-transport-security" in headersPresent,
      hstsMaxAge,
      hstsIncludeSubdomains,
      hstsPreload,
    },
  };
}

function computeGrade(cert: TlsCertInfo | null, headers: SecurityHeaderInfo[], httpsRedirect: HttpsRedirectInfo, tlsSupport: { tls10: boolean; tls11: boolean; tls12: boolean; tls13: boolean }): TlsCheckResult["overallGrade"] {
  if (!cert || cert.isExpired) return "F";
  if (httpsRedirect.httpsAvailable === false) return "N/A";

  let score = 100;

  if (cert.isExpiringSoon) score -= 20;
  if (cert.isSelfSigned) score -= 30;
  if (tlsSupport.tls10) score -= 20;
  if (tlsSupport.tls11) score -= 10;
  if (!tlsSupport.tls12 && !tlsSupport.tls13) score -= 40;

  const missingCritical = headers.filter(h => !h.present && (h.severity === "critical" || h.severity === "high")).length;
  score -= missingCritical * 5;

  if (!httpsRedirect.redirectsToHttps && httpsRedirect.httpAvailable) score -= 10;
  if (!httpsRedirect.hstsPresent) score -= 10;
  if (httpsRedirect.hstsPresent && httpsRedirect.hstsMaxAge && httpsRedirect.hstsMaxAge < 31536000) score -= 5;

  if (score >= 95) return "A+";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

function buildFindings(
  cert: TlsCertInfo | null,
  headers: SecurityHeaderInfo[],
  httpsRedirect: HttpsRedirectInfo,
  tlsSupport: { tls10: boolean; tls11: boolean; tls12: boolean; tls13: boolean },
): TlsCheckResult["findings"] {
  const findings: TlsCheckResult["findings"] = [];

  if (!cert) {
    findings.push({ severity: "critical", title: "No TLS certificate found", detail: "The server did not present a valid TLS certificate. HTTPS is not functioning." });
    return findings;
  }
  if (cert.isExpired) findings.push({ severity: "critical", title: "Certificate has expired", detail: `Certificate expired on ${new Date(cert.validTo).toLocaleDateString()}. Browsers will show a security warning.` });
  else if (cert.isExpiringSoon) findings.push({ severity: "high", title: `Certificate expires in ${cert.daysUntilExpiry} days`, detail: `Certificate valid to ${new Date(cert.validTo).toLocaleDateString()}. Renew before expiry to avoid disruption.` });

  if (cert.isSelfSigned) findings.push({ severity: "high", title: "Certificate is self-signed", detail: "Self-signed certificates are not trusted by browsers and will display a security warning to users." });

  if (tlsSupport.tls10) findings.push({ severity: "high", title: "TLS 1.0 is enabled", detail: "TLS 1.0 is deprecated (RFC 8996) and has known weaknesses including BEAST. Disable in server configuration." });
  if (tlsSupport.tls11) findings.push({ severity: "medium", title: "TLS 1.1 is enabled", detail: "TLS 1.1 is deprecated. Only TLS 1.2+ should be supported." });
  if (!tlsSupport.tls12 && !tlsSupport.tls13) findings.push({ severity: "critical", title: "Neither TLS 1.2 nor TLS 1.3 supported", detail: "Modern clients require TLS 1.2 or higher. This server may be unreachable to most browsers." });

  if (!httpsRedirect.redirectsToHttps && httpsRedirect.httpAvailable) findings.push({ severity: "medium", title: "HTTP does not redirect to HTTPS", detail: "Port 80 (HTTP) is open but does not redirect to HTTPS, allowing plain-text connections." });

  if (!httpsRedirect.hstsPresent) {
    findings.push({ severity: "high", title: "HSTS header is missing", detail: "Strict-Transport-Security is absent. Without HSTS, users can be downgraded to HTTP by attackers." });
  } else if (httpsRedirect.hstsMaxAge !== undefined && httpsRedirect.hstsMaxAge < 31536000) {
    findings.push({ severity: "low", title: `HSTS max-age too short (${httpsRedirect.hstsMaxAge}s)`, detail: `HSTS max-age should be at least 31536000 (1 year). Current value: ${httpsRedirect.hstsMaxAge}.` });
  }

  for (const h of headers) {
    if (!h.present && (h.severity === "high" || h.severity === "critical")) {
      findings.push({ severity: h.severity, title: `Missing header: ${h.header}`, detail: h.recommendation });
    }
    if (!h.present && h.severity === "medium") {
      findings.push({ severity: "medium", title: `Missing header: ${h.header}`, detail: h.recommendation });
    }
  }

  return findings;
}

const TlsCheckSchema = z.object({
  host: z.string()
    .min(3)
    .max(253)
    .regex(/^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)+$/, "Invalid hostname"),
  port: z.number().int().min(1).max(65535).default(443),
  checkHeaders: z.boolean().default(true),
  checkTlsVersions: z.boolean().default(true),
});

// POST /api/tls/check
router.post("/tls/check", requireAuth, async (req: Request, res: Response) => {
  const parsed = TlsCheckSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const { host, port, checkHeaders, checkTlsVersions } = parsed.data;
  const startTime = Date.now();

  // Run checks in parallel where possible
  const [certResult, headerResult, tlsVersions] = await Promise.allSettled([
    getCertificate(host, port),
    checkHeaders ? getSecurityHeaders(host, port) : Promise.resolve(null),
    checkTlsVersions
      ? Promise.all([
          checkTlsVersion(host, "TLSv1"),
          checkTlsVersion(host, "TLSv1.1"),
          checkTlsVersion(host, "TLSv1.2"),
          checkTlsVersion(host, "TLSv1.3"),
        ])
      : Promise.resolve([false, false, false, false]),
  ]);

  const certData = certResult.status === "fulfilled" ? certResult.value : { cert: null, tlsVersion: "unknown", cipher: "unknown", error: "Certificate check failed" };
  const headerData = headerResult.status === "fulfilled" ? headerResult.value : null;
  const versions = tlsVersions.status === "fulfilled" ? tlsVersions.value as boolean[] : [false, false, false, false];

  const tlsSupport = {
    tls10: versions[0],
    tls11: versions[1],
    tls12: versions[2],
    tls13: versions[3],
  };

  const securityHeaders = headerData?.headers ?? SECURITY_HEADERS_CHECK.map(h => ({ header: h.name, present: false, recommendation: h.recommendation, severity: h.severity }));
  const httpsRedirect = headerData?.httpRedirect ?? {
    httpAvailable: false,
    httpsAvailable: certData.error == null,
    redirectsToHttps: false,
    redirectChain: [],
    hstsPresent: false,
    hstsIncludeSubdomains: false,
    hstsPreload: false,
  };

  const findings = buildFindings(certData.cert, securityHeaders, httpsRedirect, tlsSupport);
  const grade = computeGrade(certData.cert, securityHeaders, httpsRedirect, tlsSupport);

  const result: TlsCheckResult = {
    host,
    port,
    scanTime: new Date().toISOString(),
    elapsedMs: Date.now() - startTime,
    tlsSupport,
    cert: certData.cert,
    securityHeaders,
    httpsRedirect,
    overallGrade: grade,
    findings,
    error: certData.error,
  };

  res.json(result);
});

export default router;
