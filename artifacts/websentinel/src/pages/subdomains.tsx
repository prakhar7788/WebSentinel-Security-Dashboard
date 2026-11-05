import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  Globe2, Search, Radar, Zap, ChevronDown, ChevronRight, Check,
  AlertCircle, Loader2, Network, Lock, LockKeyhole,
  ExternalLink, X, Clock3, List, Database,
  Activity, Info, Download, Shield, CheckCircle2, XCircle,
  AlertTriangle, Wrench, Layers,
} from 'lucide-react';
import { useAuth, apiFetch } from '@/lib/auth';
import { useScanStore, type SubdomainSource, type SourceSummary } from '@/lib/scans';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubdomainEntry {
  subdomain: string;
  fqdn: string;
  resolved: boolean;
  ipAddresses: string[];
  source: SubdomainSource;
  sources?: SubdomainSource[];
  httpStatus?: number;
  httpsAvailable?: boolean;
  responseTime?: number;
  cnames?: string[];
}

interface EnumerationResponse {
  domain: string;
  mode: string;
  totalFound: number;
  resolvedCount: number;
  elapsedMs: number;
  sourceSummaries?: SourceSummary[];
  subdomains: SubdomainEntry[];
}

// ── Source metadata ───────────────────────────────────────────────────────────

type SourceMeta = { label: string; color: string; type: 'api' | 'tool' | 'builtin' };

const SOURCE_META: Record<string, SourceMeta> = {
  // API-based passive sources
  'crt.sh':       { label: 'crt.sh',         color: 'text-violet-300  bg-violet-400/10  border-violet-300/20',  type: 'api'     },
  'hackertarget': { label: 'HackerTarget',   color: 'text-blue-300    bg-blue-400/10    border-blue-300/20',    type: 'api'     },
  'rapiddns':     { label: 'RapidDNS',       color: 'text-cyan-300    bg-cyan-400/10    border-cyan-300/20',    type: 'api'     },
  'alienvault':   { label: 'AlienVault OTX', color: 'text-red-300     bg-red-400/10     border-red-300/20',     type: 'api'     },
  'threatcrowd':  { label: 'ThreatCrowd',    color: 'text-orange-300  bg-orange-400/10  border-orange-300/20',  type: 'api'     },
  'virustotal':   { label: 'VirusTotal',     color: 'text-blue-300    bg-blue-400/10    border-blue-300/20',    type: 'api'     },
  'urlscan':      { label: 'URLScan.io',     color: 'text-teal-300    bg-teal-400/10    border-teal-300/20',    type: 'api'     },
  'anubis':       { label: 'Anubis-DB',      color: 'text-purple-300  bg-purple-400/10  border-purple-300/20',  type: 'api'     },
  // Tool runners
  'subfinder':         { label: 'Subfinder',   color: 'text-emerald-300 bg-emerald-400/10 border-emerald-300/20', type: 'tool'    },
  'amass':             { label: 'Amass',        color: 'text-green-300   bg-green-400/10   border-green-300/20',   type: 'tool'    },
  'sublist3r':         { label: 'Sublist3r',    color: 'text-lime-300    bg-lime-400/10    border-lime-300/20',    type: 'tool'    },
  // Built-in
  'dns-brute':         { label: 'DNS Brute-force', color: 'text-amber-300  bg-amber-400/10  border-amber-300/20', type: 'builtin' },
  'passive':           { label: 'Passive DNS',     color: 'text-sky-300    bg-sky-400/10    border-sky-300/20',    type: 'builtin' },
  'cert-transparency': { label: 'Cert Transparency', color: 'text-violet-300 bg-violet-400/10 border-violet-300/20', type: 'api' },
  'active':            { label: 'Active Probe',    color: 'text-green-300  bg-green-400/10  border-green-300/20',  type: 'builtin' },
};

function getSourceMeta(source: string): SourceMeta {
  return SOURCE_META[source] ?? { label: source, color: 'text-slate-300 bg-slate-400/10 border-slate-300/20', type: 'api' };
}

// ── Small shared components ───────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-[#202a3c] bg-[#111827]/90 ${className}`}>{children}</section>;
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[10px] font-bold uppercase tracking-[.17em] text-[#75829b]">{children}</div>;
}

function SourceBadge({ source }: { source: string }) {
  const m = getSourceMeta(source);
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[8px] font-semibold ${m.color}`}>
      {m.label}
    </span>
  );
}

function HttpStatusBadge({ status }: { status?: number }) {
  if (!status) return <span className="text-[9px] text-[#55637a]">—</span>;
  const color = status < 300 ? 'text-emerald-300' : status < 400 ? 'text-amber-300' : 'text-red-300';
  return <span className={`mono text-[9px] font-bold ${color}`}>{status}</span>;
}

// ── Source status panel ───────────────────────────────────────────────────────

function SourceStatusPanel({ summaries }: { summaries: SourceSummary[] }) {
  const apis   = summaries.filter(s => s.type === 'api');
  const tools  = summaries.filter(s => s.type === 'tool');
  const builtin = summaries.filter(s => s.type === 'builtin');

  function Section({ title, items }: { title: string; items: SourceSummary[] }) {
    if (items.length === 0) return null;
    return (
      <div className="mb-3 last:mb-0">
        <div className="mb-1.5 px-1 text-[8px] font-bold uppercase tracking-[.14em] text-[#55627a]">{title}</div>
        <div className="space-y-1">
          {items.map(s => {
            const meta = getSourceMeta(s.name);
            const notInstalled = s.type === 'tool' && !s.ran;
            const hasError     = !!s.error && s.ran;
            const ok           = s.ran && !s.error;
            return (
              <div key={s.name}
                className="flex items-center gap-2 rounded-lg border border-[#1e2a3a] bg-[#0d1420] px-2.5 py-2">
                {/* Status dot */}
                <span className="shrink-0">
                  {notInstalled
                    ? <XCircle   size={12} className="text-[#455269]" />
                    : hasError
                    ? <AlertTriangle size={12} className="text-amber-400" />
                    : <CheckCircle2  size={12} className="text-emerald-400" />}
                </span>

                {/* Label */}
                <span className={`flex-1 text-[9px] font-semibold truncate ${notInstalled ? 'text-[#55637a]' : 'text-[#c4cfdf]'}`}>
                  {meta.label}
                </span>

                {/* Found count */}
                {s.ran && !s.error && (
                  <span className="mono text-[9px] text-[#6d7f96]">{s.found}</span>
                )}

                {/* Elapsed */}
                {s.ran && s.elapsedMs > 0 && (
                  <span className="mono text-[8px] text-[#4f5e72]">
                    {s.elapsedMs < 1000 ? `${s.elapsedMs}ms` : `${(s.elapsedMs / 1000).toFixed(1)}s`}
                  </span>
                )}

                {/* Not installed pill */}
                {notInstalled && (
                  <span className="rounded border border-[#2b3850] bg-[#111f30] px-1.5 py-0.5 text-[7px] font-bold text-[#455269]">
                    not installed
                  </span>
                )}

                {/* Error tooltip */}
                {hasError && (
                  <span className="max-w-[100px] truncate rounded border border-amber-400/20 bg-amber-400/[.07] px-1.5 py-0.5 text-[7px] text-amber-300"
                    title={s.error}>
                    {s.error}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Layers size={13} className="text-[#6a84a8]" />
        <Eyebrow>Source breakdown</Eyebrow>
      </div>
      <Section title="Passive APIs" items={apis} />
      <Section title="Tool runners" items={tools} />
      <Section title="Built-in"    items={builtin} />
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Subdomains() {
  const { token } = useAuth();
  const { addSubdomainScan } = useScanStore();
  const [, navigate] = useLocation();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [domain, setDomain] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('domain') ?? ''; } catch { return ''; }
  });
  const [mode, setMode]           = useState<'passive' | 'active' | 'both'>('passive');
  const [wordlistSize, setWL]     = useState<'small' | 'medium' | 'full'>('small');
  const [checkHttp, setCheckHttp] = useState(false);

  // Tool toggles
  const [useSubfinder, setUseSubfinder] = useState(true);
  const [useAmass,     setUseAmass]     = useState(true);
  const [useSublist3r, setUseSublist3r] = useState(true);

  // Passive source toggles
  type PSKey = 'crt.sh'|'hackertarget'|'rapiddns'|'alienvault'|'threatcrowd'|'virustotal'|'urlscan'|'anubis';
  const [psSources, setPsSources] = useState<Record<PSKey, boolean>>({
    'crt.sh': true, 'hackertarget': true, 'rapiddns': true, 'alienvault': true,
    'threatcrowd': true, 'virustotal': true, 'urlscan': true, 'anubis': true,
  });

  // ── Result state ────────────────────────────────────────────────────────────
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [result,      setResult]      = useState<EnumerationResponse | null>(null);
  const [savedId,     setSavedId]     = useState<string | null>(null);

  // ── Filter/search state ─────────────────────────────────────────────────────
  const [query,       setQuery]       = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!d) { setError('Enter a domain name.'); return; }
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)+$/.test(d)) {
      setError('Enter a valid domain (e.g. example.com).');
      return;
    }

    const tools = [
      useSubfinder && 'subfinder',
      useAmass     && 'amass',
      useSublist3r && 'sublist3r',
    ].filter(Boolean) as string[];

    const passiveSources = (Object.keys(psSources) as PSKey[]).filter(k => psSources[k]);

    setError(''); setResult(null); setSavedId(null); setLoading(true);
    setQuery(''); setSourceFilter('all');

    try {
      const res = await apiFetch('/api/subdomains/enumerate', token, {
        method: 'POST',
        body: JSON.stringify({ domain: d, mode, checkHttp, wordlistSize, tools, passiveSources }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `Server error (${res.status})`);
      }
      const data: EnumerationResponse = await res.json();
      setResult(data);
      const record = addSubdomainScan(data as any);
      setSavedId(record.id);
    } catch (err: any) {
      setError(err.message ?? 'Enumeration failed.');
    } finally {
      setLoading(false);
    }
  }

  // ── Derived filter data ─────────────────────────────────────────────────────
  const filtered = (result?.subdomains ?? []).filter(s => {
    const matchQ = `${s.fqdn} ${s.ipAddresses.join(' ')}`.toLowerCase().includes(query.toLowerCase());
    const matchS = sourceFilter === 'all' || s.source === sourceFilter ||
                   (s.sources ?? []).includes(sourceFilter as SubdomainSource);
    return matchQ && matchS;
  });

  // All distinct primary sources that appeared in results
  const allSources = [...new Set(result?.subdomains.map(s => s.source) ?? [])];

  // ── CSV export ──────────────────────────────────────────────────────────────
  function exportCsv() {
    if (!result) return;
    const header = 'fqdn,subdomain,resolved,ip_addresses,primary_source,all_sources,https,http_status,response_time_ms,cnames\n';
    const rows = result.subdomains.map(s =>
      [s.fqdn, s.subdomain, s.resolved, s.ipAddresses.join(';'), s.source,
       (s.sources ?? [s.source]).join(';'),
       s.httpsAvailable ?? '', s.httpStatus ?? '', s.responseTime ?? '',
       (s.cnames ?? []).join(';')].join(','),
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${result.domain}-subdomains.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fade-up">
      {/* Heading */}
      <div className="mb-6">
        <Eyebrow>Assessment / attack surface</Eyebrow>
        <h1 className="text-[26px] font-bold tracking-[-.04em] text-[#edf3ff] md:text-[30px]">Subdomain enumeration</h1>
        <p className="mt-1.5 max-w-2xl text-[12px] leading-5 text-[#8793a9]">
          Discovers subdomains through passive API sources (crt.sh, HackerTarget, AlienVault OTX and more),
          external tool runners (Subfinder, Amass, Sublist3r when installed), and active DNS brute-force.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        {/* ── Config column ──────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <Card className="p-5">
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Target */}
              <div>
                <Eyebrow>01 — Target</Eyebrow>
                <label htmlFor="sub-domain" className="mb-2 block text-[11px] font-bold text-[#dce6f5]">Domain</label>
                <div className="flex items-center gap-2 rounded-lg border border-[#2b3850] bg-[#0d1420] px-3 focus-within:border-[#5e9aff]">
                  <Globe2 size={14} className="shrink-0 text-[#71809a]" />
                  <input
                    id="sub-domain"
                    value={domain}
                    onChange={e => { setDomain(e.target.value); setError(''); }}
                    placeholder="example.com"
                    className="h-10 w-full bg-transparent text-[12px] text-[#dce6f5] outline-none placeholder:text-[#546179]"
                  />
                  {domain && (
                    <button type="button" onClick={() => setDomain('')} className="text-[#71809a] hover:text-white">
                      <X size={13} />
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-[9px] text-[#6f7d94]">Only enumerate domains you own or have permission to test.</p>
              </div>

              {/* Mode */}
              <div>
                <Eyebrow>02 — Mode</Eyebrow>
                <div className="space-y-2">
                  {([
                    ['passive', 'Passive only',       'API sources + tool runners (no DNS noise)',    Radar],
                    ['active',  'Active only',         'DNS brute-force with wordlist',                Zap],
                    ['both',    'Passive + Active',    'Full enumeration — most thorough (slower)',    Network],
                  ] as const).map(([val, label, desc, Icon]) => (
                    <label key={val}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 transition
                        ${mode === val ? 'border-blue-400/30 bg-blue-400/[.06]' : 'border-[#222d40] bg-[#0f1725] hover:border-[#354461]'}`}>
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
                        ${mode === val ? 'bg-blue-400/15 text-blue-300' : 'bg-[#1b2a41] text-[#83aff1]'}`}>
                        <Icon size={14} />
                      </span>
                      <span className="flex-1">
                        <span className="block text-[10px] font-semibold text-[#cbd6e7]">{label}</span>
                        <span className="mt-0.5 block text-[8px] text-[#75839a]">{desc}</span>
                      </span>
                      <input type="radio" name="mode" value={val} checked={mode === val}
                        onChange={() => setMode(val)} className="accent-[#629dff]" aria-label={label} />
                    </label>
                  ))}
                </div>
              </div>

              {/* Tool runners */}
              {mode !== 'active' && (
                <div>
                  <Eyebrow>03 — Tool runners</Eyebrow>
                  <p className="mb-2 text-[9px] text-[#6f7d94]">Automatically skipped if not installed on the server.</p>
                  <div className="space-y-1.5">
                    {([
                      ['subfinder', 'Subfinder',  'go install github.com/projectdiscovery/subfinder/v2/...', useSubfinder, setUseSubfinder],
                      ['amass',     'Amass',       'go install github.com/owasp-amass/amass/v4/...',          useAmass,     setUseAmass],
                      ['sublist3r', 'Sublist3r',   'pip install sublist3r',                                   useSublist3r, setUseSublist3r],
                    ] as const).map(([key, label, install, checked, setter]) => (
                      <label key={key}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition
                          ${checked ? 'border-emerald-400/25 bg-emerald-400/[.04]' : 'border-[#222d40] bg-[#0f1725] hover:border-[#354461]'}`}>
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg
                          ${checked ? 'bg-emerald-400/10 text-emerald-300' : 'bg-[#1b2a41] text-[#83aff1]'}`}>
                          <Wrench size={12} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[10px] font-semibold text-[#cbd6e7]">{label}</span>
                          <span className="mono mt-0.5 block truncate text-[7px] text-[#4f5e72]">{install}</span>
                        </span>
                        <input type="checkbox" checked={checked}
                          onChange={e => setter(e.target.checked as any)}
                          className="h-3.5 w-3.5 accent-[#4ade80]" aria-label={`Enable ${label}`} />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Passive API sources */}
              {mode !== 'active' && (
                <div>
                  <Eyebrow>04 — Passive sources</Eyebrow>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(psSources) as PSKey[]).map(key => {
                      const meta = getSourceMeta(key);
                      const on = psSources[key];
                      return (
                        <label key={key}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition
                            ${on ? 'border-[#2b3f58] bg-[#0f1e30]' : 'border-[#1e2838] bg-[#0b1018] opacity-50'}`}>
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? 'bg-[#438cff]' : 'bg-[#3a4558]'}`} />
                          <span className="flex-1 truncate text-[9px] font-semibold text-[#b4c0d4]">{meta.label}</span>
                          <input type="checkbox" checked={on}
                            onChange={e => setPsSources(prev => ({ ...prev, [key]: e.target.checked }))}
                            className="h-3 w-3 accent-[#629dff]" aria-label={`Enable ${meta.label}`} />
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Wordlist size (active modes only) */}
              {(mode === 'active' || mode === 'both') && (
                <div>
                  <Eyebrow>05 — Wordlist</Eyebrow>
                  <div className="flex rounded-lg border border-[#253248] bg-[#0b121d] p-0.5">
                    {(['small', 'medium', 'full'] as const).map(size => (
                      <button key={size} type="button" onClick={() => setWL(size)}
                        className={`flex-1 rounded-md px-2 py-2 text-[9px] font-bold capitalize transition
                          ${wordlistSize === size ? 'bg-[#263956] text-[#c8ddff]' : 'text-[#75849a] hover:text-[#d7e1ef]'}`}>
                        {size}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[9px] text-[#6f7d94]">Small: ~40 · Medium: ~80 · Full: ~100+</p>
                </div>
              )}

              {/* HTTP probe */}
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#222d40] bg-[#0f1725] px-3.5 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1b2a41] text-[#83aff1]">
                  <LockKeyhole size={14} />
                </span>
                <span className="flex-1">
                  <span className="block text-[10px] font-semibold text-[#cbd6e7]">Probe HTTP/HTTPS</span>
                  <span className="mt-0.5 block text-[8px] text-[#75839a]">Check status + HTTPS on every resolved host</span>
                </span>
                <input type="checkbox" checked={checkHttp} onChange={e => setCheckHttp(e.target.checked)}
                  className="h-4 w-4 accent-[#629dff]" aria-label="Probe HTTP/HTTPS" />
              </label>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/[.07] px-3 py-2.5 text-[10px] text-red-300">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />{error}
                </div>
              )}

              {/* Submit */}
              <button type="submit" disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#438cff] px-4 py-3 text-[11px] font-bold text-[#08111f] shadow-[0_6px_24px_rgba(55,129,255,.18)] transition hover:bg-[#64a1ff] disabled:cursor-not-allowed disabled:opacity-50">
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> Enumerating…</>
                  : <><Radar size={14} /> Start enumeration</>}
              </button>
            </form>
          </Card>

          {/* Info card */}
          <Card className="p-4">
            <div className="flex gap-2.5">
              <Info size={14} className="mt-0.5 shrink-0 text-[#7199cc]" />
              <div>
                <div className="text-[10px] font-semibold text-[#c4cfdf]">How it works</div>
                <ul className="mt-2 space-y-1.5 text-[9px] leading-4 text-[#75839a]">
                  <li><strong className="text-[#9ab2cc]">Passive APIs:</strong> 8 sources queried simultaneously — crt.sh, HackerTarget, RapidDNS, AlienVault OTX, ThreatCrowd, VirusTotal, URLScan.io and Anubis-DB.</li>
                  <li><strong className="text-[#9ab2cc]">Tool runners:</strong> Spawns Subfinder, Amass, Sublist3r if installed on the server. Each is skipped gracefully when absent.</li>
                  <li><strong className="text-[#9ab2cc]">Active DNS:</strong> Brute-forces the wordlist in batches of 15 parallel DNS queries.</li>
                  <li><strong className="text-[#9ab2cc]">Deduplication:</strong> FQDNs found by multiple sources are merged — each result shows all sources that discovered it.</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Results column ─────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Loading */}
          {loading && (
            <Card className="flex flex-col items-center justify-center gap-4 py-20">
              <div className="relative">
                <Loader2 size={36} className="animate-spin text-[#438cff]" />
                <div className="absolute inset-0 rounded-full bg-blue-400/10 blur-xl" />
              </div>
              <div className="text-center">
                <div className="text-[13px] font-bold text-[#dce6f5]">Enumerating subdomains…</div>
                <p className="mt-1 text-[10px] text-[#75839a]">
                  {mode === 'passive' && 'Querying passive APIs and running tool runners…'}
                  {mode === 'active'  && 'Running DNS brute-force against wordlist…'}
                  {mode === 'both'    && 'Running passive sources + active DNS enumeration…'}
                </p>
              </div>
            </Card>
          )}

          {/* Empty state */}
          {!loading && !result && (
            <Card className="flex flex-col items-center justify-center gap-4 py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2b3954] bg-[#162135] text-[#78aaff]">
                <Network size={26} />
              </div>
              <div>
                <div className="text-[13px] font-bold text-[#dce6f5]">No enumeration run yet</div>
                <p className="mt-1 text-[10px] text-[#75839a]">Configure a target domain and start an enumeration to see results here.</p>
              </div>
            </Card>
          )}

          {/* Results */}
          {!loading && result && (
            <>
              {/* Saved banner */}
              {savedId && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[.06] px-4 py-3">
                  <div className="flex items-center gap-2 text-[10px] text-emerald-300">
                    <Check size={13} className="shrink-0" />
                    <span>Saved as <span className="mono font-bold">{savedId}</span> — visible in Overview &amp; History.</span>
                  </div>
                  <button onClick={() => navigate(`/scans/${savedId}`)}
                    className="flex items-center gap-1.5 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1.5 text-[9px] font-bold text-emerald-300 transition hover:bg-emerald-400/15">
                    View report <ChevronRight size={11} />
                  </button>
                </div>
              )}

              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { icon: Network,  label: 'Found',    value: result.totalFound },
                  { icon: Check,    label: 'Resolved', value: result.resolvedCount },
                  { icon: Clock3,   label: 'Elapsed',  value: `${(result.elapsedMs / 1000).toFixed(1)}s` },
                  { icon: Database, label: 'Sources',  value: allSources.length },
                ].map(({ icon: Icon, label, value }) => (
                  <Card key={label} className="relative overflow-hidden p-3.5">
                    <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-blue-400/[.035] blur-xl" />
                    <div className="flex justify-between">
                      <span className="text-[9px] text-[#77859c]">{label}</span>
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-400/10 text-blue-300"><Icon size={12} /></span>
                    </div>
                    <div className="mt-1.5 text-[22px] font-bold tracking-[-.04em] text-[#e1eafa]">{value}</div>
                  </Card>
                ))}
              </div>

              {/* Source status panel */}
              {result.sourceSummaries && result.sourceSummaries.length > 0 && (
                <SourceStatusPanel summaries={result.sourceSummaries} />
              )}

              {/* Results table */}
              <Card className="overflow-hidden">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#242d40] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-400/10 text-blue-300">
                      <List size={14} />
                    </div>
                    <div>
                      <div className="text-[11px] font-bold text-[#dce6f5]">{result.domain}</div>
                      <div className="text-[9px] text-[#74839a]">{filtered.length} shown · {result.resolvedCount} resolved</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Source filter */}
                    <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
                      aria-label="Filter by source"
                      className="rounded-lg border border-[#29354a] bg-[#0e1522] px-2.5 py-1.5 text-[9px] text-[#b7c3d6] outline-none">
                      <option value="all">All sources</option>
                      <optgroup label="API Sources">
                        {allSources.filter(s => getSourceMeta(s).type === 'api').map(s => (
                          <option key={s} value={s}>{getSourceMeta(s).label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Tool Runners">
                        {allSources.filter(s => getSourceMeta(s).type === 'tool').map(s => (
                          <option key={s} value={s}>{getSourceMeta(s).label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Built-in">
                        {allSources.filter(s => getSourceMeta(s).type === 'builtin').map(s => (
                          <option key={s} value={s}>{getSourceMeta(s).label}</option>
                        ))}
                      </optgroup>
                    </select>
                    {/* Search */}
                    <div className="flex items-center gap-2 rounded-lg border border-[#29354a] bg-[#0e1522] px-2.5 py-1.5">
                      <Search size={12} className="text-[#71809a]" />
                      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter…"
                        className="w-28 bg-transparent text-[9px] text-[#d9e4f3] outline-none placeholder:text-[#59667d]" />
                      {query && <button onClick={() => setQuery('')} className="text-[#71809a] hover:text-white"><X size={11} /></button>}
                    </div>
                    {/* CSV export */}
                    <button onClick={exportCsv} title="Export CSV"
                      className="flex items-center gap-1.5 rounded-lg border border-[#29354a] bg-[#0e1522] px-2.5 py-1.5 text-[9px] font-semibold text-[#8a9ab5] transition hover:border-[#354461] hover:text-[#c4cfdf]">
                      <Download size={12} /> CSV
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left">
                    <thead className="bg-[#0e1522] text-[9px] uppercase tracking-[.12em] text-[#68758b]">
                      <tr>
                        {['Subdomain / FQDN', 'IP Addresses', 'Primary source', 'All sources', ...(checkHttp ? ['HTTPS', 'Status', 'RTT'] : []), 'CNAMEs'].map(h => (
                          <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(sub => (
                        <>
                          <tr key={sub.fqdn}
                            onClick={() => setExpandedRow(expandedRow === sub.fqdn ? null : sub.fqdn)}
                            className={`cursor-pointer border-t border-[#202a3b] text-[10px] transition hover:bg-white/[.018]
                              ${expandedRow === sub.fqdn ? 'bg-[#1a2b43]/50' : ''}`}>
                            {/* FQDN */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${sub.resolved ? 'bg-emerald-400' : 'bg-[#455269]'}`} />
                                <div>
                                  <div className="mono text-[10px] font-semibold text-[#c8d8ee]">{sub.fqdn}</div>
                                  {sub.subdomain !== '@' && <div className="mt-0.5 text-[8px] text-[#68758b]">{sub.subdomain}</div>}
                                </div>
                              </div>
                            </td>
                            {/* IPs */}
                            <td className="px-4 py-3">
                              {sub.ipAddresses.length > 0 ? (
                                <div className="space-y-0.5">
                                  {sub.ipAddresses.slice(0, 2).map(ip => (
                                    <div key={ip} className="mono text-[9px] text-[#8da0bd]">{ip}</div>
                                  ))}
                                  {sub.ipAddresses.length > 2 && (
                                    <div className="text-[8px] text-[#586477]">+{sub.ipAddresses.length - 2} more</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[9px] text-[#55637a]">{sub.resolved ? 'CNAME only' : 'Unresolved'}</span>
                              )}
                            </td>
                            {/* Primary source */}
                            <td className="px-4 py-3"><SourceBadge source={sub.source} /></td>
                            {/* All sources */}
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {(sub.sources ?? [sub.source]).slice(0, 3).map(s => (
                                  <SourceBadge key={s} source={s} />
                                ))}
                                {(sub.sources ?? []).length > 3 && (
                                  <span className="inline-flex items-center rounded-full border border-[#2b3850] bg-[#111f30] px-2 py-0.5 text-[8px] text-[#68758b]">
                                    +{(sub.sources ?? []).length - 3}
                                  </span>
                                )}
                              </div>
                            </td>
                            {/* HTTP columns */}
                            {checkHttp && (
                              <>
                                <td className="px-4 py-3">
                                  {sub.httpsAvailable
                                    ? <span className="flex items-center gap-1 text-[9px] font-semibold text-emerald-300"><Lock size={10} />Yes</span>
                                    : <span className="text-[9px] text-[#55637a]">No</span>}
                                </td>
                                <td className="px-4 py-3"><HttpStatusBadge status={sub.httpStatus} /></td>
                                <td className="px-4 py-3">
                                  {sub.responseTime != null
                                    ? <span className="mono text-[9px] text-[#8da0bd]">{sub.responseTime}ms</span>
                                    : <span className="text-[9px] text-[#55637a]">—</span>}
                                </td>
                              </>
                            )}
                            {/* CNAMEs */}
                            <td className="px-4 py-3">
                              {(sub.cnames?.length ?? 0) > 0
                                ? <span className="mono text-[8px] text-[#7c8fa8]">{sub.cnames![0]}</span>
                                : <span className="text-[9px] text-[#55637a]">—</span>}
                            </td>
                          </tr>

                          {/* Expanded detail row */}
                          {expandedRow === sub.fqdn && (
                            <tr className="border-t border-[#202a3b] bg-[#0d1521]">
                              <td colSpan={checkHttp ? 8 : 5} className="px-4 py-4">
                                <div className="grid gap-4 sm:grid-cols-3">
                                  <div>
                                    <div className="mb-1.5 text-[8px] uppercase tracking-[.12em] text-[#5d6d82]">Full FQDN</div>
                                    <div className="mono text-[10px] text-[#a5b8d0]">{sub.fqdn}</div>
                                  </div>
                                  <div>
                                    <div className="mb-1.5 text-[8px] uppercase tracking-[.12em] text-[#5d6d82]">All IP addresses</div>
                                    {sub.ipAddresses.length > 0
                                      ? sub.ipAddresses.map(ip => <div key={ip} className="mono text-[10px] text-[#a5b8d0]">{ip}</div>)
                                      : <div className="text-[9px] text-[#55637a]">None resolved</div>}
                                  </div>
                                  <div>
                                    <div className="mb-1.5 text-[8px] uppercase tracking-[.12em] text-[#5d6d82]">CNAME chain</div>
                                    {(sub.cnames?.length ?? 0) > 0
                                      ? sub.cnames!.map(c => <div key={c} className="mono text-[10px] text-[#a5b8d0]">{c}</div>)
                                      : <div className="text-[9px] text-[#55637a]">No CNAMEs</div>}
                                  </div>
                                </div>
                                {/* All sources for this entry */}
                                {(sub.sources ?? []).length > 1 && (
                                  <div className="mt-3">
                                    <div className="mb-1.5 text-[8px] uppercase tracking-[.12em] text-[#5d6d82]">Discovered by</div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {(sub.sources ?? [sub.source]).map(s => <SourceBadge key={s} source={s} />)}
                                    </div>
                                  </div>
                                )}
                                <div className="mt-3 flex gap-2">
                                  <a href={`https://${sub.fqdn}`} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-md border border-[#2b3850] bg-[#131d2c] px-2.5 py-1.5 text-[9px] font-semibold text-[#8a9ab5] transition hover:text-[#c4cfdf]">
                                    <ExternalLink size={11} /> Open in browser
                                  </a>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>

                  {filtered.length === 0 && (
                    <div className="py-14 text-center">
                      <Search size={20} className="mx-auto text-[#53617a]" />
                      <div className="mt-3 text-[10px] font-bold text-[#bdc8d8]">No matches</div>
                      <button onClick={() => { setQuery(''); setSourceFilter('all'); }}
                        className="mt-2 text-[9px] font-bold text-[#8bb9ff] hover:text-white">
                        Clear filters
                      </button>
                    </div>
                  )}
                </div>

                <div className="border-t border-[#202a3b] px-4 py-2.5 text-[9px] text-[#65748a]">
                  Mode: <span className="font-semibold capitalize text-[#8da0bd]">{result.mode}</span>
                  <span className="mx-2 text-[#3f4b60]">·</span>
                  Elapsed: <span className="mono text-[#8da0bd]">{(result.elapsedMs / 1000).toFixed(2)}s</span>
                  <span className="mx-2 text-[#3f4b60]">·</span>
                  {result.totalFound} found, {result.resolvedCount} resolved
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
