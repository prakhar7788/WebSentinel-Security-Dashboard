import { useState } from 'react';
import {
  Globe2, Search, Radar, Zap, ChevronDown, ChevronRight, Check,
  AlertCircle, Loader2, Network, Shield, Lock, LockKeyhole,
  ArrowUpRight, ExternalLink, Filter, X, Clock3, List, Database,
  Activity, Info, Download,
} from 'lucide-react';
import { useAuth, apiFetch } from '@/lib/auth';

// ── Types ─────────────────────────────────────────────────────────────────────
interface SubdomainResult {
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

interface EnumerationResponse {
  domain: string;
  mode: string;
  totalFound: number;
  resolvedCount: number;
  elapsedMs: number;
  subdomains: SubdomainResult[];
}

// ── Small components ──────────────────────────────────────────────────────────
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-[#202a3c] bg-[#111827]/90 ${className}`}>{children}</section>;
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[10px] font-bold uppercase tracking-[.17em] text-[#75829b]">{children}</div>;
}

const sourceStyles: Record<string, { label: string; color: string }> = {
  'cert-transparency': { label: 'Cert Transparency', color: 'text-violet-300 bg-violet-400/10 border-violet-300/20' },
  passive:             { label: 'Passive DNS',        color: 'text-blue-300    bg-blue-400/10    border-blue-300/20'   },
  'dns-brute':         { label: 'DNS Brute-force',    color: 'text-amber-300  bg-amber-400/10  border-amber-300/20'  },
  active:              { label: 'Active Probe',       color: 'text-green-300  bg-green-400/10  border-green-300/20'  },
};

function SourceBadge({ source }: { source: string }) {
  const s = sourceStyles[source] ?? { label: source, color: 'text-slate-300 bg-slate-400/10 border-slate-300/20' };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[8px] font-semibold ${s.color}`}>
      {s.label}
    </span>
  );
}

function HttpStatusBadge({ status }: { status?: number }) {
  if (!status) return <span className="text-[9px] text-[#55637a]">—</span>;
  const color = status < 300 ? 'text-emerald-300' : status < 400 ? 'text-amber-300' : 'text-red-300';
  return <span className={`mono text-[9px] font-bold ${color}`}>{status}</span>;
}

export default function Subdomains() {
  const { token } = useAuth();

  const [domain, setDomain] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('domain') ?? ''; } catch { return ''; }
  });
  const [mode, setMode] = useState<'passive' | 'active' | 'both'>('passive');
  const [wordlistSize, setWordlistSize] = useState<'small' | 'medium' | 'full'>('small');
  const [checkHttp, setCheckHttp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<EnumerationResponse | null>(null);
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!d) { setError('Enter a domain name.'); return; }
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)+$/.test(d)) {
      setError('Enter a valid domain (e.g. example.com).');
      return;
    }
    setError('');
    setResult(null);
    setLoading(true);
    setQuery('');
    setSourceFilter('all');

    try {
      const res = await apiFetch('/api/subdomains/enumerate', token, {
        method: 'POST',
        body: JSON.stringify({ domain: d, mode, checkHttp, wordlistSize }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error (${res.status})`);
      }
      setResult(await res.json());
    } catch (err: any) {
      setError(err.message ?? 'Enumeration failed.');
    } finally {
      setLoading(false);
    }
  }

  const filtered = (result?.subdomains ?? []).filter(s => {
    const matchQuery = `${s.fqdn} ${s.ipAddresses.join(' ')}`.toLowerCase().includes(query.toLowerCase());
    const matchSource = sourceFilter === 'all' || s.source === sourceFilter;
    return matchQuery && matchSource;
  });

  const sources = [...new Set(result?.subdomains.map(s => s.source) ?? [])];

  function exportCsv() {
    if (!result) return;
    const header = 'fqdn,subdomain,resolved,ip_addresses,source,https,http_status,response_time_ms,cnames\n';
    const rows = result.subdomains.map(s =>
      [s.fqdn, s.subdomain, s.resolved, s.ipAddresses.join(';'), s.source,
       s.httpsAvailable ?? '', s.httpStatus ?? '', s.responseTime ?? '', (s.cnames ?? []).join(';')].join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${result.domain}-subdomains.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fade-up">
      {/* Heading */}
      <div className="mb-6">
        <Eyebrow>Assessment / attack surface</Eyebrow>
        <h1 className="text-[26px] font-bold tracking-[-.04em] text-[#edf3ff] md:text-[30px]">Subdomain enumeration</h1>
        <p className="mt-1.5 max-w-2xl text-[12px] leading-5 text-[#8793a9]">
          Discover subdomains via certificate transparency logs (passive) and DNS brute-force (active). Real network requests are made.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        {/* ── Config panel ─────────────────────────────────────────────────── */}
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
                    ['passive', 'Passive only', 'crt.sh cert transparency + common DNS', Radar],
                    ['active',  'Active only',  'DNS brute-force with wordlist',           Zap],
                    ['both',    'Passive + Active', 'Full enumeration (slower)',            Network],
                  ] as const).map(([val, label, desc, Icon]) => (
                    <label key={val} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 transition ${mode === val ? 'border-blue-400/30 bg-blue-400/[.06]' : 'border-[#222d40] bg-[#0f1725] hover:border-[#354461]'}`}>
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${mode === val ? 'bg-blue-400/15 text-blue-300' : 'bg-[#1b2a41] text-[#83aff1]'}`}>
                        <Icon size={14} />
                      </span>
                      <span className="flex-1">
                        <span className="block text-[10px] font-semibold text-[#cbd6e7]">{label}</span>
                        <span className="mt-0.5 block text-[8px] text-[#75839a]">{desc}</span>
                      </span>
                      <input type="radio" name="mode" value={val} checked={mode === val} onChange={() => setMode(val)} className="accent-[#629dff]" aria-label={label} />
                    </label>
                  ))}
                </div>
              </div>

              {/* Wordlist size (only when active) */}
              {(mode === 'active' || mode === 'both') && (
                <div>
                  <Eyebrow>03 — Wordlist</Eyebrow>
                  <div className="flex rounded-lg border border-[#253248] bg-[#0b121d] p-0.5">
                    {(['small', 'medium', 'full'] as const).map(size => (
                      <button key={size} type="button" onClick={() => setWordlistSize(size)}
                        className={`flex-1 rounded-md px-2 py-2 text-[9px] font-bold capitalize transition ${wordlistSize === size ? 'bg-[#263956] text-[#c8ddff]' : 'text-[#75849a] hover:text-[#d7e1ef]'}`}>
                        {size}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[9px] text-[#6f7d94]">Small: ~40 words · Medium: ~80 · Full: ~100+</p>
                </div>
              )}

              {/* HTTP check toggle */}
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#222d40] bg-[#0f1725] px-3.5 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1b2a41] text-[#83aff1]">
                  <LockKeyhole size={14} />
                </span>
                <span className="flex-1">
                  <span className="block text-[10px] font-semibold text-[#cbd6e7]">Probe HTTP/HTTPS</span>
                  <span className="mt-0.5 block text-[8px] text-[#75839a]">Check HTTP status and HTTPS availability on resolved hosts</span>
                </span>
                <input type="checkbox" checked={checkHttp} onChange={e => setCheckHttp(e.target.checked)} className="h-4 w-4 accent-[#629dff]" aria-label="Probe HTTP/HTTPS" />
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
                <p className="mt-1.5 text-[9px] leading-4 text-[#75839a]">
                  <strong className="text-[#9ab2cc]">Passive:</strong> Queries crt.sh for certificate transparency records and resolves common prefixes via DNS — no direct contact with the target.<br /><br />
                  <strong className="text-[#9ab2cc]">Active:</strong> Performs DNS lookups for a curated wordlist of subdomain names. No HTTP requests unless "Probe HTTP/HTTPS" is enabled.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Results panel ────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Loading state */}
          {loading && (
            <Card className="flex flex-col items-center justify-center gap-4 py-20">
              <div className="relative">
                <Loader2 size={36} className="animate-spin text-[#438cff]" />
                <div className="absolute inset-0 rounded-full bg-blue-400/10 blur-xl" />
              </div>
              <div className="text-center">
                <div className="text-[13px] font-bold text-[#dce6f5]">Enumerating subdomains…</div>
                <p className="mt-1 text-[10px] text-[#75839a]">
                  {mode === 'passive' && 'Querying certificate transparency and resolving DNS…'}
                  {mode === 'active' && 'Running DNS brute-force against wordlist…'}
                  {mode === 'both' && 'Running passive + active enumeration…'}
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
                <p className="mt-1 text-[10px] text-[#75839a]">Configure a target domain and run an enumeration to see results here.</p>
              </div>
            </Card>
          )}

          {/* Results */}
          {!loading && result && (
            <>
              {/* Summary bar */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { icon: Network,   label: 'Subdomains found', value: result.totalFound },
                  { icon: Check,     label: 'Resolved',         value: result.resolvedCount },
                  { icon: Clock3,    label: 'Elapsed',          value: `${(result.elapsedMs / 1000).toFixed(1)}s` },
                  { icon: Database,  label: 'Sources',          value: sources.length },
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

              {/* Table card */}
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
                  <div className="flex items-center gap-2">
                    {/* Source filter */}
                    <select
                      value={sourceFilter}
                      onChange={e => setSourceFilter(e.target.value)}
                      aria-label="Filter by source"
                      className="rounded-lg border border-[#29354a] bg-[#0e1522] px-2.5 py-1.5 text-[9px] text-[#b7c3d6] outline-none"
                    >
                      <option value="all">All sources</option>
                      {sources.map(s => <option key={s} value={s}>{sourceStyles[s]?.label ?? s}</option>)}
                    </select>
                    {/* Search */}
                    <div className="flex items-center gap-2 rounded-lg border border-[#29354a] bg-[#0e1522] px-2.5 py-1.5">
                      <Search size={12} className="text-[#71809a]" />
                      <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Filter…"
                        className="w-28 bg-transparent text-[9px] text-[#d9e4f3] outline-none placeholder:text-[#59667d]"
                      />
                      {query && <button onClick={() => setQuery('')} className="text-[#71809a] hover:text-white"><X size={11} /></button>}
                    </div>
                    {/* Export */}
                    <button
                      onClick={exportCsv}
                      title="Export CSV"
                      className="flex items-center gap-1.5 rounded-lg border border-[#29354a] bg-[#0e1522] px-2.5 py-1.5 text-[9px] font-semibold text-[#8a9ab5] transition hover:border-[#354461] hover:text-[#c4cfdf]"
                    >
                      <Download size={12} /> CSV
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left">
                    <thead className="bg-[#0e1522] text-[9px] uppercase tracking-[.12em] text-[#68758b]">
                      <tr>
                        {['Subdomain / FQDN', 'IP Addresses', 'Source', ...(checkHttp ? ['HTTPS', 'Status', 'RTT'] : []), 'CNAMEs'].map(h => (
                          <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(sub => (
                        <>
                          <tr
                            key={sub.fqdn}
                            onClick={() => setExpandedRow(expandedRow === sub.fqdn ? null : sub.fqdn)}
                            className={`cursor-pointer border-t border-[#202a3b] text-[10px] transition hover:bg-white/[.018] ${expandedRow === sub.fqdn ? 'bg-[#1a2b43]/50' : ''}`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${sub.resolved ? 'bg-emerald-400' : 'bg-[#455269]'}`} />
                                <div>
                                  <div className="mono text-[10px] font-semibold text-[#c8d8ee]">{sub.fqdn}</div>
                                  {sub.subdomain !== '@' && <div className="mt-0.5 text-[8px] text-[#68758b]">{sub.subdomain}</div>}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {sub.ipAddresses.length > 0 ? (
                                <div className="space-y-0.5">
                                  {sub.ipAddresses.slice(0, 2).map(ip => (
                                    <div key={ip} className="mono text-[9px] text-[#8da0bd]">{ip}</div>
                                  ))}
                                  {sub.ipAddresses.length > 2 && <div className="text-[8px] text-[#586477]">+{sub.ipAddresses.length - 2} more</div>}
                                </div>
                              ) : (
                                <span className="text-[9px] text-[#55637a]">{sub.resolved ? 'CNAME only' : 'Unresolved'}</span>
                              )}
                            </td>
                            <td className="px-4 py-3"><SourceBadge source={sub.source} /></td>
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
                            <td className="px-4 py-3">
                              {(sub.cnames?.length ?? 0) > 0
                                ? <span className="mono text-[8px] text-[#7c8fa8]">{sub.cnames![0]}</span>
                                : <span className="text-[9px] text-[#55637a]">—</span>}
                            </td>
                          </tr>
                          {/* Expanded row */}
                          {expandedRow === sub.fqdn && (
                            <tr className="border-t border-[#202a3b] bg-[#0d1521]">
                              <td colSpan={checkHttp ? 7 : 4} className="px-4 py-4">
                                <div className="grid gap-3 sm:grid-cols-3">
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
                                <div className="mt-3 flex gap-2">
                                  <a
                                    href={`https://${sub.fqdn}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-md border border-[#2b3850] bg-[#131d2c] px-2.5 py-1.5 text-[9px] font-semibold text-[#8a9ab5] transition hover:text-[#c4cfdf]"
                                  >
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
                      <button onClick={() => { setQuery(''); setSourceFilter('all'); }} className="mt-2 text-[9px] font-bold text-[#8bb9ff] hover:text-white">Clear filters</button>
                    </div>
                  )}
                </div>
                <div className="border-t border-[#202a3b] px-4 py-2.5 text-[9px] text-[#65748a]">
                  Mode: <span className="text-[#8da0bd] font-semibold capitalize">{result.mode}</span>
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
