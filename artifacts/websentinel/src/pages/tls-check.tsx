import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  Globe2, Shield, ShieldCheck, ShieldAlert, ShieldX, LockKeyhole, Lock,
  AlertTriangle, AlertCircle, Check, X, ChevronDown, ChevronRight, Loader2,
  Clock3, Calendar, Info, ExternalLink, Activity, Server, Fingerprint,
  ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import { useAuth, apiFetch } from '@/lib/auth';
import { useScanStore } from '@/lib/scans';

// ── Types ─────────────────────────────────────────────────────────────────────
interface TlsCertInfo {
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
interface SecurityHeaderInfo {
  header: string;
  present: boolean;
  value?: string;
  recommendation: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
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
  tlsSupport: { tls10: boolean; tls11: boolean; tls12: boolean; tls13: boolean };
  cert: TlsCertInfo | null;
  securityHeaders: SecurityHeaderInfo[];
  httpsRedirect: HttpsRedirectInfo;
  overallGrade: string;
  findings: Array<{ severity: 'critical' | 'high' | 'medium' | 'low' | 'info'; title: string; detail: string }>;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-[#202a3c] bg-[#111827]/90 ${className}`}>{children}</section>;
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[10px] font-bold uppercase tracking-[.17em] text-[#75829b]">{children}</div>;
}

const severityStyles = {
  critical: { bg: 'bg-red-400/10 border-red-400/25',    text: 'text-red-300',    icon: ShieldX,     dot: 'bg-red-400' },
  high:     { bg: 'bg-amber-400/10 border-amber-400/25', text: 'text-amber-300',  icon: ShieldAlert, dot: 'bg-amber-400' },
  medium:   { bg: 'bg-violet-400/10 border-violet-400/25',text: 'text-violet-300',icon: Shield,      dot: 'bg-violet-400' },
  low:      { bg: 'bg-blue-400/10 border-blue-400/25',   text: 'text-blue-300',   icon: ShieldCheck, dot: 'bg-blue-400' },
  info:     { bg: 'bg-slate-400/10 border-slate-400/20', text: 'text-slate-400',  icon: Info,        dot: 'bg-slate-400' },
};

const gradeStyles: Record<string, { color: string; bg: string; description: string }> = {
  'A+': { color: 'text-emerald-300', bg: 'bg-emerald-400/10 border-emerald-400/25', description: 'Exceptional — modern TLS, strong security headers, HSTS with preload' },
  'A':  { color: 'text-emerald-300', bg: 'bg-emerald-400/10 border-emerald-400/25', description: 'Strong — modern TLS, valid certificate, most security headers present' },
  'B':  { color: 'text-blue-300',    bg: 'bg-blue-400/10 border-blue-400/25',       description: 'Good — mostly secure, a few headers missing or HSTS suboptimal' },
  'C':  { color: 'text-amber-300',   bg: 'bg-amber-400/10 border-amber-400/25',     description: 'Fair — some security gaps; deprecated TLS versions may be present' },
  'D':  { color: 'text-orange-300',  bg: 'bg-orange-400/10 border-orange-400/25',   description: 'Poor — multiple significant security issues found' },
  'F':  { color: 'text-red-300',     bg: 'bg-red-400/10 border-red-400/25',         description: 'Failing — certificate expired or TLS not functional' },
  'T':  { color: 'text-red-300',     bg: 'bg-red-400/10 border-red-400/25',         description: 'Trust issue — certificate is not trusted by browsers' },
  'N/A':{ color: 'text-slate-400',   bg: 'bg-slate-400/10 border-slate-400/20',     description: 'Not available — could not establish TLS connection' },
};

function TlsVersionBadge({ supported, version }: { supported: boolean; version: string }) {
  const deprecated = version === 'TLS 1.0' || version === 'TLS 1.1';
  if (!supported) return (
    <div className="flex items-center gap-2 rounded-lg border border-[#242d40] bg-[#0d1521] px-3 py-2.5">
      <Minus size={12} className="text-[#455269]" />
      <span className="text-[10px] font-semibold text-[#5a6a80]">{version}</span>
      <span className="ml-auto text-[8px] text-[#455269]">disabled</span>
    </div>
  );
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 ${deprecated ? 'border-amber-400/25 bg-amber-400/[.06]' : 'border-emerald-400/25 bg-emerald-400/[.06]'}`}>
      {deprecated ? <AlertTriangle size={12} className="text-amber-300" /> : <Check size={12} className="text-emerald-300" />}
      <span className={`text-[10px] font-semibold ${deprecated ? 'text-amber-200' : 'text-emerald-200'}`}>{version}</span>
      <span className={`ml-auto text-[8px] ${deprecated ? 'text-amber-400/70' : 'text-emerald-400/70'}`}>
        {deprecated ? 'deprecated' : 'supported'}
      </span>
    </div>
  );
}

function CollapsibleSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition hover:bg-white/[.02]"
      >
        <span className="text-[11px] font-bold text-[#c4cfdf]">{title}</span>
        <ChevronDown size={14} className={`text-[#68758b] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-[#202a3b] px-5 py-4">{children}</div>}
    </div>
  );
}

export default function TlsCheck() {
  const { token } = useAuth();
  const { addTlsScan } = useScanStore();
  const [, navigate] = useLocation();

  const [host, setHost] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('host') ?? ''; } catch { return ''; }
  });
  const [port, setPort] = useState('443');
  const [checkHeaders, setCheckHeaders] = useState(true);
  const [checkVersions, setCheckVersions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TlsCheckResult | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const h = host.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const p = parseInt(port, 10);
    if (!h) { setError('Enter a hostname.'); return; }
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)+$/.test(h)) {
      setError('Enter a valid hostname (e.g. example.com).'); return;
    }
    if (isNaN(p) || p < 1 || p > 65535) { setError('Port must be between 1 and 65535.'); return; }

    setError('');
    setResult(null);
    setSavedId(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/tls/check', token, {
        method: 'POST',
        body: JSON.stringify({ host: h, port: p, checkHeaders, checkTlsVersions: checkVersions }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error (${res.status})`);
      }
      const data: TlsCheckResult = await res.json();
      setResult(data);
      // Save to store
      const record = addTlsScan(data);
      setSavedId(record.id);
    } catch (err: any) {
      setError(err.message ?? 'TLS check failed.');
    } finally {
      setLoading(false);
    }
  }

  const grade = result ? (gradeStyles[result.overallGrade] ?? gradeStyles['N/A']) : null;
  const criticalCount  = result?.findings.filter(f => f.severity === 'critical').length ?? 0;
  const highCount      = result?.findings.filter(f => f.severity === 'high').length ?? 0;
  const mediumCount    = result?.findings.filter(f => f.severity === 'medium').length ?? 0;

  return (
    <div className="fade-up">
      <div className="mb-6">
        <Eyebrow>Assessment / transport security</Eyebrow>
        <h1 className="text-[26px] font-bold tracking-[-.04em] text-[#edf3ff] md:text-[30px]">TLS & certificate check</h1>
        <p className="mt-1.5 max-w-2xl text-[12px] leading-5 text-[#8793a9]">
          Inspect TLS configuration, certificate validity, security headers, and HSTS. Real connections are made to the target.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        {/* ── Config ───────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <Card className="p-5">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Eyebrow>Target</Eyebrow>
                <label htmlFor="tls-host" className="mb-2 block text-[11px] font-bold text-[#dce6f5]">Hostname</label>
                <div className="flex items-center gap-2 rounded-lg border border-[#2b3850] bg-[#0d1420] px-3 focus-within:border-[#5e9aff]">
                  <Globe2 size={14} className="shrink-0 text-[#71809a]" />
                  <input
                    id="tls-host"
                    value={host}
                    onChange={e => { setHost(e.target.value); setError(''); }}
                    placeholder="example.com"
                    className="h-10 w-full bg-transparent text-[12px] text-[#dce6f5] outline-none placeholder:text-[#546179]"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="tls-port" className="mb-2 block text-[11px] font-bold text-[#dce6f5]">Port</label>
                <div className="flex items-center gap-2 rounded-lg border border-[#2b3850] bg-[#0d1420] px-3 focus-within:border-[#5e9aff]">
                  <Server size={14} className="shrink-0 text-[#71809a]" />
                  <input
                    id="tls-port"
                    type="number"
                    min="1" max="65535"
                    value={port}
                    onChange={e => { setPort(e.target.value); setError(''); }}
                    className="h-10 w-full bg-transparent text-[12px] text-[#dce6f5] outline-none"
                  />
                </div>
              </div>

              {/* Options */}
              <div className="space-y-2">
                <Eyebrow>Checks</Eyebrow>
                {[
                  { key: 'headers', label: 'Security headers', desc: 'Check CSP, HSTS, X-Frame-Options, etc.', checked: checkHeaders, set: setCheckHeaders },
                  { key: 'versions', label: 'TLS version probing', desc: 'Probe TLS 1.0 / 1.1 / 1.2 / 1.3 support', checked: checkVersions, set: setCheckVersions },
                ].map(opt => (
                  <label key={opt.key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#222d40] bg-[#0f1725] px-3.5 py-3 hover:border-[#354461]">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#1b2a41] text-[#83aff1]">
                      <LockKeyhole size={13} />
                    </span>
                    <span className="flex-1">
                      <span className="block text-[10px] font-semibold text-[#cbd6e7]">{opt.label}</span>
                      <span className="mt-0.5 block text-[8px] text-[#75839a]">{opt.desc}</span>
                    </span>
                    <input type="checkbox" checked={opt.checked} onChange={e => opt.set(e.target.checked)} className="h-4 w-4 accent-[#629dff]" aria-label={opt.label} />
                  </label>
                ))}
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/[.07] px-3 py-2.5 text-[10px] text-red-300">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />{error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#438cff] px-4 py-3 text-[11px] font-bold text-[#08111f] shadow-[0_6px_24px_rgba(55,129,255,.18)] transition hover:bg-[#64a1ff] disabled:cursor-not-allowed disabled:opacity-50">
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> Checking…</>
                  : <><ShieldCheck size={14} /> Run TLS check</>}
              </button>
            </form>
          </Card>

          <Card className="p-4">
            <div className="flex gap-2.5">
              <Info size={14} className="mt-0.5 shrink-0 text-[#7199cc]" />
              <div>
                <div className="text-[10px] font-semibold text-[#c4cfdf]">What is checked</div>
                <ul className="mt-2 space-y-1 text-[9px] leading-4 text-[#75839a]">
                  <li><span className="text-[#9ab2cc]">Certificate:</span> validity, expiry, issuer, SANs, self-signed, wildcard</li>
                  <li><span className="text-[#9ab2cc]">TLS versions:</span> TLS 1.0/1.1 (deprecated), 1.2/1.3 (modern)</li>
                  <li><span className="text-[#9ab2cc]">Security headers:</span> HSTS, CSP, X-Frame-Options, etc.</li>
                  <li><span className="text-[#9ab2cc]">HTTP redirect:</span> whether HTTP redirects to HTTPS</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Results ──────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {loading && (
            <Card className="flex flex-col items-center justify-center gap-4 py-20">
              <div className="relative">
                <Loader2 size={36} className="animate-spin text-[#438cff]" />
                <div className="absolute inset-0 rounded-full bg-blue-400/10 blur-xl" />
              </div>
              <div className="text-center">
                <div className="text-[13px] font-bold text-[#dce6f5]">Running TLS checks…</div>
                <p className="mt-1 text-[10px] text-[#75839a]">Connecting to {host || 'target'} and inspecting certificate &amp; headers.</p>
              </div>
            </Card>
          )}

          {!loading && !result && (
            <Card className="flex flex-col items-center justify-center gap-4 py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2b3954] bg-[#162135] text-[#78aaff]">
                <LockKeyhole size={26} />
              </div>
              <div>
                <div className="text-[13px] font-bold text-[#dce6f5]">No check run yet</div>
                <p className="mt-1 text-[10px] text-[#75839a]">Enter a hostname and run a TLS check to see the analysis here.</p>
              </div>
            </Card>
          )}

          {!loading && result && (
            <>
              {/* Saved banner */}
              {savedId && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[.06] px-4 py-3">
                  <div className="flex items-center gap-2 text-[10px] text-emerald-300">
                    <Check size={13} className="shrink-0" />
                    <span>Scan saved as <span className="mono font-bold">{savedId}</span> — visible in Overview &amp; History.</span>
                  </div>
                  <button
                    onClick={() => navigate(`/scans/${savedId}`)}
                    className="flex items-center gap-1.5 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1.5 text-[9px] font-bold text-emerald-300 transition hover:bg-emerald-400/15"
                  >
                    View report <ChevronRight size={11} />
                  </button>
                </div>
              )}
              {/* Grade + overview */}
              <Card className="p-5">
                <div className="flex flex-wrap items-center gap-5">
                  {/* Grade bubble */}
                  <div className={`flex h-20 w-20 flex-col items-center justify-center rounded-2xl border-2 ${grade?.bg}`}>
                    <span className={`text-[32px] font-extrabold tracking-[-.05em] leading-none ${grade?.color}`}>
                      {result.overallGrade}
                    </span>
                    <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[.12em] text-[#68758b]">grade</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="mono text-[14px] font-bold text-[#dce6f5]">{result.host}</div>
                      {result.port !== 443 && <span className="mono text-[11px] text-[#68758b]">:{result.port}</span>}
                      <a href={`https://${result.host}`} target="_blank" rel="noopener noreferrer"
                        className="text-[#7199cc] hover:text-white">
                        <ExternalLink size={13} />
                      </a>
                    </div>
                    <p className="mt-1 text-[10px] text-[#8493aa]">{grade?.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {result.cert && !result.cert.isExpired && (
                        <span className="flex items-center gap-1 rounded-full border border-emerald-300/15 bg-emerald-400/10 px-2 py-1 text-[9px] font-semibold text-emerald-300">
                          <Check size={10} /> Valid certificate
                        </span>
                      )}
                      {result.cert?.isExpired && (
                        <span className="flex items-center gap-1 rounded-full border border-red-300/15 bg-red-400/10 px-2 py-1 text-[9px] font-semibold text-red-300">
                          <X size={10} /> Certificate expired
                        </span>
                      )}
                      {result.tlsSupport.tls13 && (
                        <span className="flex items-center gap-1 rounded-full border border-emerald-300/15 bg-emerald-400/10 px-2 py-1 text-[9px] font-semibold text-emerald-300">
                          <Check size={10} /> TLS 1.3
                        </span>
                      )}
                      {result.httpsRedirect.hstsPresent && (
                        <span className="flex items-center gap-1 rounded-full border border-blue-300/15 bg-blue-400/10 px-2 py-1 text-[9px] font-semibold text-blue-300">
                          <Lock size={10} /> HSTS
                        </span>
                      )}
                      {result.tlsSupport.tls10 && (
                        <span className="flex items-center gap-1 rounded-full border border-amber-300/15 bg-amber-400/10 px-2 py-1 text-[9px] font-semibold text-amber-300">
                          <AlertTriangle size={10} /> TLS 1.0 enabled
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-[#68758b]">Scanned</div>
                    <div className="mono mt-0.5 text-[10px] text-[#8da0bd]">{new Date(result.scanTime).toLocaleTimeString()}</div>
                    <div className="mt-1 text-[9px] text-[#68758b]">{(result.elapsedMs / 1000).toFixed(1)}s elapsed</div>
                  </div>
                </div>
              </Card>

              {/* Findings */}
              {result.findings.length > 0 && (
                <Card className="overflow-hidden">
                  <div className="flex items-center justify-between border-b border-[#202a3c] px-5 py-4">
                    <div>
                      <Eyebrow>Issues found</Eyebrow>
                      <h2 className="text-[13px] font-bold text-[#dce6f5]">Security findings</h2>
                    </div>
                    <div className="flex gap-2">
                      {criticalCount > 0 && <span className="rounded-md border border-red-400/20 bg-red-400/10 px-2 py-1 text-[9px] font-bold text-red-300">{criticalCount} critical</span>}
                      {highCount > 0     && <span className="rounded-md border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[9px] font-bold text-amber-300">{highCount} high</span>}
                      {mediumCount > 0   && <span className="rounded-md border border-violet-400/20 bg-violet-400/10 px-2 py-1 text-[9px] font-bold text-violet-300">{mediumCount} medium</span>}
                    </div>
                  </div>
                  <div className="divide-y divide-[#202a3b]">
                    {result.findings.map((f, i) => {
                      const s = severityStyles[f.severity];
                      const Icon = s.icon;
                      return (
                        <div key={i} className="flex items-start gap-3 px-5 py-4">
                          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${s.bg} ${s.text}`}>
                            <Icon size={14} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-bold text-[#d3deed]">{f.title}</span>
                              <span className={`rounded border px-1.5 py-0.5 text-[7px] font-bold capitalize ${s.bg} ${s.text}`}>{f.severity}</span>
                            </div>
                            <p className="mt-1 text-[9px] leading-4 text-[#78869d]">{f.detail}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Certificate details */}
              {result.cert && (
                <Card className="overflow-hidden divide-y divide-[#202a3b]">
                  <div className="px-5 py-4">
                    <Eyebrow>Certificate</Eyebrow>
                    <h2 className="text-[13px] font-bold text-[#dce6f5]">Certificate details</h2>
                  </div>

                  <CollapsibleSection title="Identity & validity" defaultOpen>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        { label: 'Common Name', value: result.cert.subject?.CN ?? '—' },
                        { label: 'Organization', value: result.cert.subject?.O ?? '—' },
                        { label: 'Issuer', value: result.cert.issuer?.CN ?? result.cert.issuer?.O ?? '—' },
                        { label: 'Issuer Org', value: result.cert.issuer?.O ?? '—' },
                        { label: 'Valid from', value: new Date(result.cert.validFrom).toLocaleDateString() },
                        { label: 'Valid to', value: new Date(result.cert.validTo).toLocaleDateString() },
                        { label: 'Days until expiry', value: result.cert.isExpired ? 'EXPIRED' : `${result.cert.daysUntilExpiry} days` },
                        { label: 'Self-signed', value: result.cert.isSelfSigned ? 'Yes' : 'No' },
                        { label: 'Wildcard', value: result.cert.isWildcard ? 'Yes' : 'No' },
                        { label: 'TLS version', value: result.cert.tlsVersion },
                        { label: 'Cipher suite', value: result.cert.cipherSuite },
                        { label: 'Signature algorithm', value: result.cert.signatureAlgorithm || '—' },
                        ...(result.cert.keyBits ? [{ label: 'Key size', value: `${result.cert.keyBits} bits` }] : []),
                      ].map(({ label, value }) => (
                        <div key={label} className="rounded-lg border border-[#263348] bg-[#0d1521] p-2.5">
                          <div className="text-[8px] uppercase tracking-[.1em] text-[#64738a]">{label}</div>
                          <div className={`mono mt-1 text-[10px] font-semibold ${
                            value === 'EXPIRED' ? 'text-red-300' :
                            value === 'Yes' && label === 'Self-signed' ? 'text-amber-300' :
                            'text-[#c4cfdf]'
                          }`}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title={`Subject Alt Names (${result.cert.sanCount})`}>
                    <div className="flex flex-wrap gap-1.5">
                      {result.cert.subjectAltNames.slice(0, 40).map(san => (
                        <span key={san} className="mono rounded-md border border-[#2a3850] bg-[#0d1521] px-2 py-1 text-[9px] text-[#8da0bd]">{san}</span>
                      ))}
                      {result.cert.subjectAltNames.length > 40 && (
                        <span className="rounded-md border border-[#2a3850] bg-[#0d1521] px-2 py-1 text-[9px] text-[#586477]">
                          +{result.cert.subjectAltNames.length - 40} more
                        </span>
                      )}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Fingerprints">
                    <div className="space-y-3">
                      <div>
                        <div className="text-[8px] uppercase tracking-[.1em] text-[#64738a]">SHA-1</div>
                        <div className="mono mt-1 break-all text-[9px] text-[#8da0bd]">{result.cert.fingerprint || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[8px] uppercase tracking-[.1em] text-[#64738a]">SHA-256</div>
                        <div className="mono mt-1 break-all text-[9px] text-[#8da0bd]">{result.cert.fingerprint256 || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[8px] uppercase tracking-[.1em] text-[#64738a]">Serial number</div>
                        <div className="mono mt-1 break-all text-[9px] text-[#8da0bd]">{result.cert.serialNumber || '—'}</div>
                      </div>
                    </div>
                  </CollapsibleSection>
                </Card>
              )}

              {/* TLS versions */}
              <Card className="p-5">
                <Eyebrow>Protocol support</Eyebrow>
                <h2 className="mb-4 text-[13px] font-bold text-[#dce6f5]">TLS version support</h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <TlsVersionBadge supported={result.tlsSupport.tls10} version="TLS 1.0" />
                  <TlsVersionBadge supported={result.tlsSupport.tls11} version="TLS 1.1" />
                  <TlsVersionBadge supported={result.tlsSupport.tls12} version="TLS 1.2" />
                  <TlsVersionBadge supported={result.tlsSupport.tls13} version="TLS 1.3" />
                </div>
                <p className="mt-3 text-[9px] text-[#68758b]">TLS 1.0 and 1.1 are deprecated per RFC 8996. Only 1.2 and 1.3 should be enabled.</p>
              </Card>

              {/* Security headers */}
              <Card className="overflow-hidden">
                <div className="border-b border-[#202a3c] px-5 py-4">
                  <Eyebrow>HTTP response</Eyebrow>
                  <h2 className="text-[13px] font-bold text-[#dce6f5]">Security headers</h2>
                </div>
                <div className="divide-y divide-[#202a3b]">
                  {result.securityHeaders.map(h => (
                    <div key={h.header} className="flex items-start gap-3 px-5 py-3.5">
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${h.present ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'}`}>
                        {h.present ? <Check size={10} /> : <X size={10} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="mono text-[10px] font-semibold text-[#c4cfdf]">{h.header}</span>
                          {!h.present && (
                            <span className={`rounded border px-1.5 py-0.5 text-[7px] font-bold capitalize ${severityStyles[h.severity].bg} ${severityStyles[h.severity].text}`}>
                              {h.severity}
                            </span>
                          )}
                        </div>
                        {h.present && h.value && (
                          <div className="mono mt-1 truncate text-[9px] text-[#75839a]">{h.value}</div>
                        )}
                        {!h.present && (
                          <p className="mt-1 text-[9px] text-[#68758b]">{h.recommendation}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* HTTPS redirect & HSTS */}
              <Card className="p-5">
                <Eyebrow>Transport enforcement</Eyebrow>
                <h2 className="mb-4 text-[13px] font-bold text-[#dce6f5]">HTTPS redirect &amp; HSTS</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { label: 'HTTP available', value: result.httpsRedirect.httpAvailable ? 'Yes' : 'No', ok: !result.httpsRedirect.httpAvailable },
                    { label: 'HTTPS available', value: result.httpsRedirect.httpsAvailable ? 'Yes' : 'No', ok: result.httpsRedirect.httpsAvailable },
                    { label: 'HTTP → HTTPS redirect', value: result.httpsRedirect.redirectsToHttps ? 'Yes' : 'No', ok: result.httpsRedirect.redirectsToHttps },
                    { label: 'HSTS header', value: result.httpsRedirect.hstsPresent ? 'Present' : 'Missing', ok: result.httpsRedirect.hstsPresent },
                    { label: 'HSTS max-age', value: result.httpsRedirect.hstsMaxAge != null ? `${result.httpsRedirect.hstsMaxAge}s` : '—', ok: (result.httpsRedirect.hstsMaxAge ?? 0) >= 31536000 },
                    { label: 'HSTS includeSubDomains', value: result.httpsRedirect.hstsIncludeSubdomains ? 'Yes' : 'No', ok: result.httpsRedirect.hstsIncludeSubdomains },
                    { label: 'HSTS preload', value: result.httpsRedirect.hstsPreload ? 'Yes' : 'No', ok: result.httpsRedirect.hstsPreload },
                  ].map(({ label, value, ok }) => (
                    <div key={label} className="flex items-center justify-between rounded-lg border border-[#263348] bg-[#0d1521] px-3 py-2.5">
                      <span className="text-[9px] text-[#8a9ab5]">{label}</span>
                      <span className={`mono text-[9px] font-semibold ${ok ? 'text-emerald-300' : 'text-[#8da0bd]'}`}>{value}</span>
                    </div>
                  ))}
                </div>
                {result.httpsRedirect.redirectChain.length > 0 && (
                  <div className="mt-3 rounded-lg border border-[#263348] bg-[#0d1521] p-3">
                    <div className="mb-2 text-[8px] uppercase tracking-[.1em] text-[#64738a]">Redirect chain</div>
                    {result.httpsRedirect.redirectChain.map(step => (
                      <div key={step} className="mono text-[9px] text-[#8da0bd]">{step}</div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
