/**
 * Scan store — persists all completed scans to localStorage.
 * Every page reads from this context instead of hardcoded sample arrays.
 *
 * A "scan record" is the unified shape stored after any live check:
 *   type: 'subdomain' | 'tls'
 *   The raw API response is embedded so detail pages can show full data.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useWorkspace } from '@/lib/workspaces';

// ── Subdomain result types (mirrors API) ──────────────────────────────────────
export interface SubdomainEntry {
  subdomain: string;
  fqdn: string;
  resolved: boolean;
  ipAddresses: string[];
  source: 'active' | 'passive' | 'cert-transparency' | 'dns-brute';
  httpStatus?: number;
  httpsAvailable?: boolean;
  responseTime?: number;
  cnames?: string[];
}
export interface SubdomainScanData {
  domain: string;
  mode: string;
  totalFound: number;
  resolvedCount: number;
  elapsedMs: number;
  subdomains: SubdomainEntry[];
}

// ── TLS result types (mirrors API) ────────────────────────────────────────────
export interface TlsCertInfo {
  subject: Record<string, string>;
  issuer: Record<string, string>;
  validFrom: string;
  validTo: string;
  daysUntilExpiry: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
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
}
export interface SecurityHeaderInfo {
  header: string;
  present: boolean;
  value?: string;
  recommendation: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
}
export interface HttpsRedirectInfo {
  httpAvailable: boolean;
  httpsAvailable: boolean;
  redirectsToHttps: boolean;
  redirectChain: string[];
  hstsPresent: boolean;
  hstsMaxAge?: number;
  hstsIncludeSubdomains: boolean;
  hstsPreload: boolean;
}
export interface TlsScanData {
  host: string;
  port: number;
  scanTime: string;
  elapsedMs: number;
  tlsSupport: { tls10: boolean; tls11: boolean; tls12: boolean; tls13: boolean };
  cert: TlsCertInfo | null;
  securityHeaders: SecurityHeaderInfo[];
  httpsRedirect: HttpsRedirectInfo;
  overallGrade: string;
  findings: Array<{ severity: 'critical' | 'high' | 'medium' | 'low' | 'info'; title: string; detail: string }>;
  error?: string;
}

// ── Unified scan record ───────────────────────────────────────────────────────
export type ScanType = 'subdomain' | 'tls';

interface ScanRecordBase {
  id: string;           // WS-XXXX
  scannedAt: string;    // ISO date string
  type: ScanType;
  domain: string;       // bare domain (e.g. example.com)
  status: 'complete' | 'error';
  elapsedMs: number;
}
export interface SubdomainScanRecord extends ScanRecordBase {
  type: 'subdomain';
  data: SubdomainScanData;
}
export interface TlsScanRecord extends ScanRecordBase {
  type: 'tls';
  data: TlsScanData;
  grade: string;
  findingsCount: { critical: number; high: number; medium: number; low: number };
}
export type ScanRecord = SubdomainScanRecord | TlsScanRecord;

// ── Findings shape (derived from TLS scans) ───────────────────────────────────
export interface Finding {
  id: string;
  scanId: string;
  domain: string;
  title: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  category: string;
  detail: string;
  scannedAt: string;
}

// ── Store ─────────────────────────────────────────────────────────────────────
const BASE_KEY = 'ws_scan_history';
const MAX_RECORDS = 50;

function storageKey(workspaceId: string) {
  return workspaceId === 'ws_default' ? BASE_KEY : `${BASE_KEY}_${workspaceId}`;
}

function nextId(existing: ScanRecord[]): string {
  const nums = existing
    .map(r => parseInt(r.id.replace('WS-', ''), 10))
    .filter(n => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1001;
  return `WS-${next}`;
}

function load(workspaceId: string): ScanRecord[] {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId));
    return raw ? (JSON.parse(raw) as ScanRecord[]) : [];
  } catch {
    return [];
  }
}
function save(workspaceId: string, records: ScanRecord[]) {
  try { localStorage.setItem(storageKey(workspaceId), JSON.stringify(records)); } catch { /* quota */ }
}

interface ScanStoreValue {
  scans: ScanRecord[];
  addSubdomainScan: (data: SubdomainScanData) => ScanRecord;
  addTlsScan:       (data: TlsScanData)       => ScanRecord;
  deleteScan:       (id: string) => void;
  clearAll:         () => void;
  /** All TLS findings across scans, most recent first */
  allFindings:      Finding[];
  /** Most recent scan for a given domain (any type) */
  latestScanFor:    (domain: string) => ScanRecord | undefined;
}

const ScanStoreContext = createContext<ScanStoreValue | null>(null);

export function ScanStoreProvider({ children }: { children: ReactNode }) {
  const { activeId } = useWorkspace();
  const [scans, setScans] = useState<ScanRecord[]>(() => load(activeId));

  // Reload when workspace switches
  const [lastWorkspaceId, setLastWorkspaceId] = useState(activeId);
  if (activeId !== lastWorkspaceId) {
    setLastWorkspaceId(activeId);
    setScans(load(activeId));
  }

  const persist = useCallback((next: ScanRecord[]) => {
    setScans(next);
    save(activeId, next);
  }, [activeId]);

  const addSubdomainScan = useCallback((data: SubdomainScanData): ScanRecord => {
    let savedRecord!: SubdomainScanRecord;
    setScans(prev => {
      savedRecord = {
        id: nextId(prev),
        scannedAt: new Date().toISOString(),
        type: 'subdomain',
        domain: data.domain,
        status: 'complete',
        elapsedMs: data.elapsedMs,
        data,
      };
      const next = [savedRecord, ...prev].slice(0, MAX_RECORDS);
      save(activeId, next);
      return next;
    });
    // Fallback for sync callers before setState resolves
    return savedRecord ?? {
      id: nextId(load(activeId)),
      scannedAt: new Date().toISOString(),
      type: 'subdomain',
      domain: data.domain,
      status: 'complete',
      elapsedMs: data.elapsedMs,
      data,
    };
  }, [activeId]);

  const addTlsScan = useCallback((data: TlsScanData): ScanRecord => {
    const findingsCount = {
      critical: data.findings.filter(f => f.severity === 'critical').length,
      high:     data.findings.filter(f => f.severity === 'high').length,
      medium:   data.findings.filter(f => f.severity === 'medium').length,
      low:      data.findings.filter(f => f.severity === 'low').length,
    };
    let savedRecord!: TlsScanRecord;
    setScans(prev => {
      savedRecord = {
        id: nextId(prev),
        scannedAt: new Date().toISOString(),
        type: 'tls',
        domain: data.host,
        status: data.error ? 'error' : 'complete',
        elapsedMs: data.elapsedMs,
        data,
        grade: data.overallGrade,
        findingsCount,
      };
      const next = [savedRecord, ...prev].slice(0, MAX_RECORDS);
      save(activeId, next);
      return next;
    });
    return savedRecord ?? {
      id: nextId(load(activeId)),
      scannedAt: new Date().toISOString(),
      type: 'tls',
      domain: data.host,
      status: data.error ? 'error' : 'complete',
      elapsedMs: data.elapsedMs,
      data,
      grade: data.overallGrade,
      findingsCount,
    };
  }, [activeId]);

  const deleteScan = useCallback((id: string) => {
    setScans(prev => { const next = prev.filter(s => s.id !== id); save(activeId, next); return next; });
  }, [activeId]);

  const clearAll = useCallback(() => {
    setScans([]); save(activeId, []);
  }, [activeId]);

  // Derive findings from TLS scans
  const allFindings: Finding[] = scans
    .filter((s): s is TlsScanRecord => s.type === 'tls')
    .flatMap(s =>
      s.data.findings.map((f, i) => ({
        id: `${s.id}-F${String(i + 1).padStart(3, '0')}`,
        scanId: s.id,
        domain: s.domain,
        title: f.title,
        severity: capitalize(f.severity) as Finding['severity'],
        category: deriveCategory(f.title),
        detail: f.detail,
        scannedAt: s.scannedAt,
      }))
    );

  const latestScanFor = useCallback((domain: string) =>
    scans.find(s => s.domain.toLowerCase() === domain.toLowerCase()),
  [scans]);

  return (
    <ScanStoreContext.Provider value={{ scans, addSubdomainScan, addTlsScan, deleteScan, clearAll, allFindings, latestScanFor }}>
      {children}
    </ScanStoreContext.Provider>
  );
}

export function useScanStore() {
  const ctx = useContext(ScanStoreContext);
  if (!ctx) throw new Error('useScanStore must be used inside ScanStoreProvider');
  return ctx;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function deriveCategory(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('hsts') || t.includes('strict-transport'))    return 'TLS & transport';
  if (t.includes('tls') || t.includes('ssl') || t.includes('cipher')) return 'TLS & transport';
  if (t.includes('certificate') || t.includes('cert'))         return 'Certificate';
  if (t.includes('header') || t.includes('csp') || t.includes('content-security')) return 'Security headers';
  if (t.includes('redirect') || t.includes('http '))           return 'HTTPS enforcement';
  if (t.includes('x-frame') || t.includes('clickjack'))        return 'Clickjacking';
  if (t.includes('referrer'))                                   return 'Information disclosure';
  if (t.includes('self-signed'))                                return 'Certificate';
  if (t.includes('expired') || t.includes('expir'))            return 'Certificate';
  return 'Security configuration';
}

// ── Derived helpers for pages ─────────────────────────────────────────────────

/** Security score out of 100 based on TLS grade + findings */
export function scoreFromTlsScan(s: TlsScanRecord): number {
  const gradeScore: Record<string, number> = {
    'A+': 97, A: 90, B: 75, C: 60, D: 40, F: 15, T: 10, 'N/A': 0,
  };
  const base = gradeScore[s.grade] ?? 50;
  const penalty = s.findingsCount.critical * 8 + s.findingsCount.high * 4 + s.findingsCount.medium * 2;
  return Math.max(0, Math.min(100, base - penalty));
}

/** Formatted elapsed time string */
export function elapsedLabel(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Relative time label */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
