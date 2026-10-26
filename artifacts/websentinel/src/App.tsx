import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Login from '@/pages/login';
import Profile from '@/pages/profile';
import Subdomains from '@/pages/subdomains';
import TlsCheck from '@/pages/tls-check';
import { Route, Switch, useLocation, Router as WouterRouter, Link } from 'wouter';
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, BarChart3,
  Bell, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp,
  Clock3, Code2, Download, ExternalLink, FileText, Filter, Globe2,
  History, LockKeyhole, Menu, MoreHorizontal, Network, Plus, Radar,
  Search, Settings2, Shield, ShieldAlert, ShieldCheck, SlidersHorizontal,
  Sparkles, X, Zap, User, LogOut, Loader2,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip,
  XAxis, YAxis,
} from 'recharts';
import { AuthProvider, useAuth } from '@/lib/auth';

const queryClient = new QueryClient();

// ── Nav groups ────────────────────────────────────────────────────────────────
const navGroups = [
  { title: 'Workspace', items: [
    { label: 'Overview',   href: '/overview',   icon: BarChart3 },
    { label: 'New scan',   href: '/scans/new',  icon: Plus },
  ]},
  { title: 'Recon', items: [
    { label: 'Subdomains', href: '/subdomains', icon: Network },
    { label: 'TLS / certs', href: '/tls',       icon: LockKeyhole },
  ]},
  { title: 'Assessment', items: [
    { label: 'Findings',       href: '/findings',      icon: ShieldAlert, badge: '12' },
    { label: 'DOM inspector',  href: '/dom-inspector', icon: Code2 },
    { label: 'Assets',         href: '/assets',        icon: Globe2 },
  ]},
  { title: 'Records', items: [
    { label: 'Scan history', href: '/history', icon: History },
    { label: 'Reports',      href: '/reports', icon: FileText },
  ]},
];

// ── Sample data ───────────────────────────────────────────────────────────────
const sampleFindings = [
  { id:'F-0184', title:'Missing Content-Security-Policy header', asset:'app.northstar-labs.test', severity:'High',     category:'Security headers', age:'2h ago',  detail:'A Content-Security-Policy header was not observed in the illustrative response profile.' },
  { id:'F-0183', title:'Third-party script without integrity attribute', asset:'app.northstar-labs.test', severity:'Medium', category:'Supply chain',     age:'2h ago',  detail:'An external script reference is shown without a matching integrity attribute.' },
  { id:'F-0182', title:'Cookie missing SameSite directive', asset:'auth.northstar-labs.test', severity:'Medium', category:'Cookie configuration', age:'1d ago',  detail:'The sample cookie configuration does not include a SameSite directive.' },
  { id:'F-0181', title:'Verbose server banner disclosed', asset:'api.northstar-labs.test', severity:'Low',    category:'Information disclosure', age:'1d ago',  detail:'A server banner is included in the sample response metadata.' },
  { id:'F-0180', title:'Potential DOM XSS pattern', asset:'app.northstar-labs.test', severity:'Critical', category:'Client-side',           age:'3d ago',  detail:'Illustrative source-to-sink pattern only; no site was inspected.' },
  { id:'F-0179', title:'HSTS max-age below recommended baseline', asset:'docs.northstar-labs.test', severity:'Low', category:'TLS & transport', age:'3d ago', detail:'The example HSTS value is shorter than the configured sample baseline.' },
];
const sampleScans = [
  { id:'WS-2048', domain:'northstar-labs.test', time:'Today, 09:42',     status:'Complete', score:78, assets:8, findings:12, severity:'2 high' },
  { id:'WS-2047', domain:'northstar-labs.test', time:'Yesterday, 16:18', status:'Complete', score:74, assets:7, findings:15, severity:'3 high' },
  { id:'WS-2042', domain:'copperfield.dev',     time:'Jun 12, 11:06',    status:'Complete', score:86, assets:4, findings:6,  severity:'1 high' },
];
const trend = [
  { day:'Jun 04', score:65 }, { day:'Jun 06', score:68 }, { day:'Jun 08', score:66 },
  { day:'Jun 10', score:72 }, { day:'Jun 12', score:70 }, { day:'Jun 14', score:76 },
  { day:'Jun 16', score:74 }, { day:'Jun 18', score:78 },
];
const assetRows = [
  { host:'app.northstar-labs.test',    kind:'Web application',  status:'HTTPS', last:'Today, 09:42',     findings:7 },
  { host:'api.northstar-labs.test',    kind:'API endpoint',     status:'HTTPS', last:'Today, 09:42',     findings:3 },
  { host:'auth.northstar-labs.test',   kind:'Authentication',   status:'HTTPS', last:'Today, 09:42',     findings:2 },
  { host:'docs.northstar-labs.test',   kind:'Documentation',    status:'HTTPS', last:'Today, 09:42',     findings:1 },
  { host:'status.northstar-labs.test', kind:'Status page',      status:'HTTPS', last:'Yesterday, 16:18', findings:0 },
];

// ── Shared primitives ─────────────────────────────────────────────────────────
function Button({ children, className='', variant='primary', ...props }: any) {
  const styles = variant === 'primary'
    ? 'bg-[#438cff] text-[#08111f] hover:bg-[#64a1ff] border border-[#438cff]/70 font-bold shadow-[0_6px_24px_rgba(55,129,255,.13)]'
    : variant === 'quiet'  ? 'bg-transparent border border-transparent text-[#a4aec2] hover:bg-white/[.05] hover:text-white'
    : variant === 'danger' ? 'bg-red-400/10 border border-red-400/20 text-red-300 hover:bg-red-400/15'
    : 'bg-[#151c2b] border border-[#273249] text-[#dce4f1] hover:bg-[#1b2537]';
  return (
    <button {...props} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2.5 text-[12px] transition-all duration-200 disabled:opacity-45 disabled:cursor-not-allowed ${styles} ${className}`}>
      {children}
    </button>
  );
}
function Card({ children, className='' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-[#202a3c] bg-[#111827]/90 ${className}`}>{children}</section>;
}
function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#75829b]">{children}</div>;
}
function StatusPill({ children, tone='blue' }: { children: ReactNode; tone?: string }) {
  const map: any = {
    blue:   'border-blue-300/15 bg-blue-400/10 text-blue-300',
    green:  'border-emerald-300/15 bg-emerald-400/10 text-emerald-300',
    red:    'border-red-300/15 bg-red-400/10 text-red-300',
    amber:  'border-amber-300/15 bg-amber-400/10 text-amber-300',
    violet: 'border-violet-300/15 bg-violet-400/10 text-violet-300',
    muted:  'border-slate-300/10 bg-slate-300/[.06] text-slate-400',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${map[tone] ?? map.blue}`}>
      {children}
    </span>
  );
}
function PrototypeBanner({ compact=false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2 border border-[#745bea]/25 bg-[#6850dc]/[.09] text-[#c4b9ff] ${compact ? 'rounded-md px-2.5 py-1.5 text-[9px]' : 'rounded-lg px-3 py-2 text-[10px] mb-5'}`}>
      <Sparkles size={13} className="shrink-0" />
      <span><b className="font-bold">PROTOTYPE DATA</b>{!compact && <span className="ml-1.5 text-[#a39acb]">Illustrative records only — not the result of a live assessment.</span>}</span>
    </div>
  );
}
function PageHeading({ kicker, title, description, action }: any) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <Eyebrow>{kicker}</Eyebrow>
        <h1 className="text-[26px] font-bold tracking-[-.04em] text-[#edf3ff] md:text-[30px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[12px] leading-5 text-[#8793a9]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ mobileOpen, close }: { mobileOpen: boolean; close: () => void }) {
  const [loc] = useLocation();
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  return (
    <>
      {mobileOpen && <button aria-label="Close navigation overlay" onClick={close} className="fixed inset-0 z-40 bg-black/65 md:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[246px] flex-col border-r border-[#202a3c] bg-[#0c111c] transition-transform duration-300 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className="flex h-[70px] items-center justify-between border-b border-[#202a3c] px-5">
          <Link href="/overview" onClick={close} className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-blue-300/20 bg-gradient-to-br from-blue-500/20 to-violet-500/20 text-blue-300">
              <Shield size={19} />
              <span className="absolute right-[6px] top-[7px] h-1 w-1 rounded-full bg-violet-300" />
            </div>
            <div>
              <div className="text-[14px] font-extrabold tracking-[-.04em] text-[#edf3ff]">web<span className="text-[#62a1ff]">sentinel</span></div>
              <div className="mono text-[8px] uppercase tracking-[.18em] text-[#61708a]">security workspace</div>
            </div>
          </Link>
          <button onClick={close} className="rounded p-1 text-slate-500 md:hidden" aria-label="Close menu"><X size={18} /></button>
        </div>

        {/* Workspace selector */}
        <div className="px-4 pt-5">
          <div className="flex w-full items-center gap-2.5 rounded-lg border border-[#273248] bg-[#121a29] px-3 py-2.5 text-[11px] text-[#b5c0d3]">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#263958] text-[10px] font-bold text-blue-200">N</span>
            <span className="flex-1">
              <span className="block font-semibold text-[#dce5f3]">Northstar Lab</span>
              <span className="block text-[9px] text-[#738099]">Personal workspace</span>
            </span>
            <ChevronDown size={13} className="text-[#68758b]" />
          </div>
        </div>

        {/* Nav */}
        <nav className="nav-scroll flex-1 overflow-y-auto px-3 pt-6">
          {navGroups.map(group => (
            <div key={group.title} className="mb-6">
              <div className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[.16em] text-[#55627a]">{group.title}</div>
              {group.items.map(item => {
                const active = loc === item.href || (item.href !== '/overview' && loc.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    className={`group mb-1 flex items-center gap-3 rounded-lg px-3 py-[10px] text-[11px] font-semibold transition-colors ${active ? 'bg-[#1b2b43] text-[#8dbbff] shadow-[inset_2px_0_0_#5498ff]' : 'text-[#8591a7] hover:bg-white/[.04] hover:text-[#d5dfef]'}`}
                  >
                    <Icon size={16} strokeWidth={1.8} />
                    <span className="flex-1">{item.label}</span>
                    {(item as any).badge && (
                      <span className="rounded-md bg-[#242e41] px-1.5 py-0.5 text-[9px] text-[#9baac2]">{(item as any).badge}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom: settings + user */}
        <div className="border-t border-[#202a3c] p-3 space-y-1">
          <Link
            href="/settings"
            onClick={close}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[11px] font-semibold ${loc === '/settings' ? 'bg-[#1b2b43] text-[#8dbbff]' : 'text-[#8591a7] hover:bg-white/[.04]'}`}
          >
            <Settings2 size={16} /> Settings
          </Link>

          {/* User row */}
          {user && (
            <div className="mt-1 flex items-center gap-2.5 rounded-lg border border-[#202a3c] bg-[#111827] px-3 py-2.5">
              <Link
                href="/profile"
                onClick={close}
                className="flex flex-1 items-center gap-2.5 min-w-0"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#33415c] bg-[#1a263a] text-[9px] font-bold text-[#b4ccf4]">
                  {user.avatar}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[10px] font-semibold text-[#c4cfdf]">{user.name}</div>
                  <div className="text-[8px] text-[#68758b]">{user.role}</div>
                </div>
              </Link>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                aria-label="Sign out"
                className="shrink-0 rounded-md p-1.5 text-[#68758b] transition hover:bg-white/[.06] hover:text-red-300 disabled:opacity-40"
              >
                {loggingOut ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
              </button>
            </div>
          )}

          <div className="rounded-lg border border-[#202a3c] bg-[#111827] p-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#64d8a3] shadow-[0_0_12px_#64d8a355]" />
              <span className="text-[10px] font-semibold text-[#c4cfdf]">Live scan engine</span>
            </div>
            <p className="mt-1.5 pl-4 text-[9px] leading-4 text-[#69758b]">Subdomain + TLS checks make real network requests.</p>
          </div>
        </div>
      </aside>
    </>
  );
}

// ── App shell ─────────────────────────────────────────────────────────────────
function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const [loc] = useLocation();

  // Build breadcrumb from location
  const crumbs: Record<string, string> = {
    '/overview': 'Security overview', '/scans/new': 'New scan', '/findings': 'Findings',
    '/dom-inspector': 'DOM inspector', '/assets': 'Assets', '/history': 'Scan history',
    '/reports': 'Reports', '/settings': 'Settings', '/subdomains': 'Subdomain enumeration',
    '/tls': 'TLS & certificate check', '/profile': 'Profile',
  };
  const pageLabel = crumbs[loc] ?? 'Workspace';

  return (
    <div className="app-bg min-h-[100dvh]">
      <Sidebar mobileOpen={open} close={() => setOpen(false)} />
      <div className="min-h-[100dvh] md:pl-[246px]">
        <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-[#202a3c]/90 bg-[#0c111c]/90 px-4 backdrop-blur-xl md:px-7">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} aria-label="Open navigation" className="rounded-md p-2 text-[#9aa8be] hover:bg-white/5 md:hidden">
              <Menu size={18} />
            </button>
            <div className="hidden items-center gap-2 text-[10px] text-[#68758c] sm:flex">
              <span>Northstar Lab</span>
              <ChevronRight size={12} />
              <span className="text-[#b4c0d2]">{pageLabel}</span>
            </div>
            <div className="sm:hidden text-[11px] font-semibold text-[#dce5f3]">WebSentinel</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-md border border-[#202a3c] bg-[#111827] px-2.5 py-1.5 text-[9px] text-[#8995aa] sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#67d5a0]" /> Live prototype
            </div>
            <div className="relative rounded-lg p-2 text-[#8591a7]" aria-label="Notifications">
              <Bell size={16} />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#8b79f6]" />
            </div>
            {user && (
              <Link href="/profile" aria-label="Your profile" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#33415c] bg-[#1a263a] text-[10px] font-bold text-[#b4ccf4] transition hover:border-[#5498ff]/40">
                {user.avatar}
              </Link>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-7 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

// ── Auth guard ────────────────────────────────────────────────────────────────
function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [loc] = useLocation();

  if (loading) {
    return (
      <div className="app-bg flex min-h-[100dvh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-300/20 bg-gradient-to-br from-blue-500/20 to-violet-500/20 text-blue-300">
            <Shield size={22} />
          </div>
          <Loader2 size={20} className="animate-spin text-[#438cff]" />
          <p className="text-[10px] text-[#68758b]">Loading workspace…</p>
        </div>
      </div>
    );
  }

  if (!user && loc !== '/login') {
    // redirect to login
    window.location.replace('/login');
    return null;
  }

  return <>{children}</>;
}

// ── Pages ─────────────────────────────────────────────────────────────────────
function Metric({ icon: Icon, label, value, suffix, trend, tone }: any) {
  const colors: any = {
    green:  'text-emerald-300 bg-emerald-300/10',
    blue:   'text-blue-300 bg-blue-300/10',
    violet: 'text-violet-300 bg-violet-300/10',
    amber:  'text-amber-300 bg-amber-300/10',
  };
  return (
    <Card className="relative overflow-hidden p-4">
      <div className="absolute -right-5 -top-7 h-24 w-24 rounded-full bg-blue-400/[.035] blur-xl" />
      <div className="relative flex justify-between">
        <div>
          <Eyebrow>{label}</Eyebrow>
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] font-bold tracking-[-.05em] text-[#e1eafa]">{value}</span>
            <span className="text-[10px] text-[#748198]">{suffix}</span>
          </div>
        </div>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors[tone]}`}><Icon size={16} /></span>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[9px] text-[#8390a6]">
        <span className={tone === 'amber' ? 'text-amber-300' : 'text-emerald-300'}>{trend}</span>
        <span>·</span><span>sample</span>
      </div>
    </Card>
  );
}

function RecentScans() {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#242d40] px-4 py-4 md:px-5">
        <div><Eyebrow>Workspace activity</Eyebrow><h2 className="text-[14px] font-bold text-[#dce6f5]">Recent scans</h2></div>
        <Link href="/history" className="text-[10px] font-semibold text-[#80b3ff] hover:text-white">View scan history <ArrowRight size={12} className="inline" /></Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left">
          <thead className="bg-[#0e1522] text-[9px] uppercase tracking-[.12em] text-[#68758b]">
            <tr>{['Scan ID', 'Target', 'Status', 'Score', 'Assets', 'Findings', ''].map(x => <th key={x} className="px-4 py-3 font-semibold md:px-5">{x}</th>)}</tr>
          </thead>
          <tbody>
            {sampleScans.map(row => (
              <tr key={row.id} className="border-t border-[#202a3b] text-[10px] hover:bg-white/[.018]">
                <td className="mono px-4 py-3.5 text-[#8da0bd] md:px-5">{row.id}</td>
                <td className="font-semibold text-[#cdd8e9]">{row.domain}<div className="mt-1 font-normal text-[#6d7b93]">{row.time}</div></td>
                <td><StatusPill tone="green"><Check size={10} />{row.status}</StatusPill></td>
                <td className="mono text-[#d3deed]">{row.score}<span className="text-[#67748b]">/100</span></td>
                <td className="text-[#9eabc0]">{row.assets}</td>
                <td className="text-[#9eabc0]">{row.findings} <span className="text-[#65728a]">· {row.severity}</span></td>
                <td className="pr-4 text-right"><Link href={`/scans/${row.id}`} className="text-[#83b3ff] hover:text-white">Details <ChevronRight size={12} className="inline" /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-[#202a3b] px-4 py-2.5 text-[9px] text-[#6f7c93] md:px-5">All scan records are illustrative sample data.</div>
    </Card>
  );
}

function Overview() {
  return (
    <div className="fade-up">
      <PrototypeBanner />
      <PageHeading
        kicker="Workspace / overview"
        title="Security overview"
        description="Quick read on your workspace assessment posture."
        action={
          <div className="flex gap-2">
            <Link href="/subdomains" className="inline-flex items-center gap-2 rounded-lg border border-[#273249] bg-[#151c2b] px-3.5 py-2.5 text-[11px] font-semibold text-[#dce4f1] hover:bg-[#1b2537]">
              <Network size={14} /> Subdomains
            </Link>
            <Link href="/tls" className="inline-flex items-center gap-2 rounded-lg border border-[#273249] bg-[#151c2b] px-3.5 py-2.5 text-[11px] font-semibold text-[#dce4f1] hover:bg-[#1b2537]">
              <LockKeyhole size={14} /> TLS check
            </Link>
            <Link href="/scans/new" className="inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-4 py-2.5 text-[11px] font-bold text-[#08111f] hover:bg-[#64a1ff]">
              <Plus size={15} />New scan
            </Link>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ShieldCheck} label="Security score"     value="78" suffix="/ 100"    trend="+4 pts"         tone="green"  />
        <Metric icon={Radar}       label="Sample scans"       value="14" suffix="total"     trend="2 this week"    tone="blue"   />
        <Metric icon={Globe2}      label="Discovered assets"  value="23" suffix="hosts"     trend="+3 this month"  tone="violet" />
        <Metric icon={AlertTriangle} label="Open findings"    value="12" suffix="issues"    trend="2 high severity" tone="amber" />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_.85fr]">
        <Card className="p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div><Eyebrow>Posture trend</Eyebrow><h2 className="text-[14px] font-bold text-[#dce6f5]">Security score over time</h2></div>
            <span className="rounded-md border border-[#2a354a] px-2 py-1 text-[9px] text-[#9ba7bb]">Last 14 days</span>
          </div>
          <div className="h-[230px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top:5, right:8, left:-25, bottom:0 }}>
                <defs><linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5798ff" stopOpacity={0.28}/><stop offset="95%" stopColor="#5798ff" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid stroke="#202a3b" vertical={false}/>
                <XAxis dataKey="day" tick={{ fill:'#68758c', fontSize:9 }} axisLine={false} tickLine={false} dy={8}/>
                <YAxis domain={[55,90]} tick={{ fill:'#68758c', fontSize:9 }} axisLine={false} tickLine={false}/>
                <ChartTooltip contentStyle={{ background:'#151e2e', border:'1px solid #2b3850', borderRadius:8, fontSize:10, color:'#dce6f5' }}/>
                <Area type="monotone" dataKey="score" stroke="#71aaff" strokeWidth={2} fill="url(#scoreFill)" activeDot={{ r:4, fill:'#9bc5ff', stroke:'#12203a' }}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4 md:p-5">
          <div className="flex items-start justify-between">
            <div><Eyebrow>Current sample</Eyebrow><h2 className="text-[14px] font-bold text-[#dce6f5]">Findings by severity</h2></div>
            <Link href="/findings" className="text-[10px] font-semibold text-[#80b3ff] hover:text-white">View all <ArrowRight size={12} className="inline"/></Link>
          </div>
          <div className="mt-5 space-y-4">
            {([['Critical',1,'#ed747d'],['High',2,'#efab65'],['Medium',5,'#a187f4'],['Low',4,'#5a9df4']] as [string,number,string][]).map(([label,count,color]) => (
              <div key={label}>
                <div className="mb-1.5 flex justify-between text-[10px]"><span className="text-[#abb7ca]">{label}</span><span className="mono text-[#cbd5e4]">{count}</span></div>
                <div className="h-[6px] rounded-full bg-[#222b3c]"><div className="h-full rounded-full" style={{ width:`${count*13}%`, background:color }}/></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Quick links to new features */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card className="p-5 transition hover:border-blue-400/25">
          <Link href="/subdomains" className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-400/10 text-blue-300"><Network size={20}/></span>
            <div>
              <div className="text-[12px] font-bold text-[#dce6f5]">Subdomain enumeration</div>
              <p className="mt-1 text-[10px] leading-4 text-[#8190a8]">Discover subdomains via certificate transparency and DNS brute-force. Real network requests.</p>
              <div className="mt-2 text-[9px] font-semibold text-[#5e9aff]">Launch →</div>
            </div>
          </Link>
        </Card>
        <Card className="p-5 transition hover:border-violet-400/25">
          <Link href="/tls" className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-400/10 text-violet-300"><LockKeyhole size={20}/></span>
            <div>
              <div className="text-[12px] font-bold text-[#dce6f5]">TLS & certificate check</div>
              <p className="mt-1 text-[10px] leading-4 text-[#8190a8]">Inspect certificate validity, TLS versions, security headers, and HSTS configuration.</p>
              <div className="mt-2 text-[9px] font-semibold text-[#9a85ff]">Launch →</div>
            </div>
          </Link>
        </Card>
      </div>

      <div className="mt-4"><RecentScans /></div>
    </div>
  );
}

function NewScan() {
  const [, navigate] = useLocation();
  const [url, setUrl] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState('');
  const [toggles, setToggles] = useState({ subdomains: true, tls: true, headers: true, dom: false });

  const options: [string, string, string, any][] = [
    ['subdomains', 'Subdomain enumeration',  'Discover subdomains via cert transparency + DNS brute-force.', Network],
    ['tls',        'TLS / certificate check', 'Inspect certificate validity, cipher, HSTS and security headers.', LockKeyhole],
    ['headers',    'Security headers',        'Check CSP, X-Frame-Options, Referrer-Policy and more.', ShieldCheck],
    ['dom',        'DOM analysis',            'Client-side source-to-sink patterns (coming soon).', Code2],
  ];

  // Extract bare domain from any URL input
  function parseDomain(raw: string) {
    try { return new URL(raw).hostname; } catch { return raw.replace(/^https?:\/\//, '').split('/')[0]; }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const raw = url.trim();
    if (!raw) { setError('Enter a website URL or domain.'); return; }
    const domain = parseDomain(raw);
    if (!domain || !/^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)+$/.test(domain)) {
      setError('Enter a valid domain such as example.com or https://example.com'); return;
    }
    if (!authorized) { setError('Confirm you are authorized to assess this website.'); return; }

    // Navigate to the first enabled live tool, passing the domain as a query param
    if (toggles.subdomains) { navigate(`/subdomains?domain=${encodeURIComponent(domain)}`); return; }
    if (toggles.tls)        { navigate(`/tls?host=${encodeURIComponent(domain)}`); return; }
    navigate('/overview');
  }

  return (
    <div className="fade-up">
      <PageHeading
        kicker="Assessment / setup"
        title="New scan"
        description="Configure your target and select which live checks to run."
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_310px]">
        <Card className="p-5 md:p-7">
          <form onSubmit={submit}>
            {/* Target */}
            <div>
              <Eyebrow>01 — Target</Eyebrow>
              <label htmlFor="target-url" className="mb-2 block text-[12px] font-bold text-[#dce6f5]">Website URL or domain</label>
              <div className="flex items-center gap-2 rounded-lg border border-[#2b3850] bg-[#0d1420] px-3 focus-within:border-[#5e9aff]">
                <Globe2 size={15} className="text-[#71809a]" />
                <input
                  id="target-url"
                  value={url}
                  onChange={e => { setUrl(e.target.value); setError(''); }}
                  placeholder="https://example.com"
                  className="h-11 w-full bg-transparent text-[12px] text-[#dce6f5] outline-none placeholder:text-[#546179]"
                />
              </div>
              <p className="mt-2 text-[9px] text-[#6f7d94]">Only assess domains you own or have explicit permission to test.</p>
            </div>

            <div className="my-6 border-t border-[#222d41]" />

            {/* Checks */}
            <div>
              <Eyebrow>02 — Checks</Eyebrow>
              <div className="mb-3 text-[12px] font-bold text-[#dce6f5]">Select modules</div>
              <div className="space-y-2">
                {options.map(([key, title, desc, Icon]) => {
                  const live = key !== 'dom';
                  return (
                    <label key={key} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 transition ${toggles[key as keyof typeof toggles] ? 'border-blue-400/30 bg-blue-400/[.05]' : 'border-[#222d40] bg-[#0f1725] hover:border-[#354461]'}`}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1b2a41] text-[#83aff1]"><Icon size={15} /></span>
                      <span className="flex-1">
                        <span className="flex items-center gap-2 text-[10px] font-semibold text-[#cbd6e7]">
                          {title}
                          {live
                            ? <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[7px] font-bold text-emerald-300">LIVE</span>
                            : <span className="rounded-full border border-slate-400/15 bg-slate-400/10 px-1.5 py-0.5 text-[7px] font-bold text-slate-400">SOON</span>}
                        </span>
                        <span className="mt-0.5 block text-[9px] text-[#75839a]">{desc}</span>
                      </span>
                      <input
                        aria-label={title}
                        type="checkbox"
                        disabled={!live}
                        checked={toggles[key as keyof typeof toggles]}
                        onChange={e => setToggles({ ...toggles, [key]: e.target.checked })}
                        className="h-4 w-4 accent-[#629dff] disabled:opacity-30"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="my-6 border-t border-[#222d41]" />

            {/* Auth checkbox */}
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#725fe2]/25 bg-[#6552d1]/[.07] p-4">
              <input
                type="checkbox"
                checked={authorized}
                onChange={e => { setAuthorized(e.target.checked); setError(''); }}
                className="mt-0.5 h-4 w-4 accent-[#927dff]"
              />
              <span>
                <span className="block text-[10px] font-bold text-[#d0c8ff]">I confirm I am authorized to assess this website.</span>
                <span className="mt-1 block text-[9px] leading-4 text-[#8f89b5]">Only test systems you own or have explicit written permission to assess.</span>
              </span>
            </label>

            {error && (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300/20 bg-amber-300/[.06] px-3.5 py-3 text-[10px] text-amber-200">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />{error}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[9px] text-[#67758d]">Submitting will launch the first selected live tool.</span>
              <Button type="submit" disabled={!authorized || (!toggles.subdomains && !toggles.tls)}>
                <Zap size={14} /> Launch scan
              </Button>
            </div>
          </form>
        </Card>

        {/* Right panel */}
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="border-b border-[#202a3c] px-4 py-3">
              <Eyebrow>Live tools</Eyebrow>
            </div>
            {[
              { icon: Network,     label: 'Subdomain enumeration', href: '/subdomains', desc: 'Passive + active DNS recon', color: 'text-blue-300 bg-blue-400/10' },
              { icon: LockKeyhole, label: 'TLS / cert check',      href: '/tls',        desc: 'Certificate & security headers', color: 'text-violet-300 bg-violet-400/10' },
            ].map(({ icon: Icon, label, href, desc, color }) => (
              <Link key={href} href={href} className="flex items-center gap-3 border-b border-[#202a3c] px-4 py-3.5 last:border-0 transition hover:bg-white/[.025]">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${color}`}><Icon size={14} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold text-[#c4cfdf]">{label}</div>
                  <div className="text-[8px] text-[#68758b]">{desc}</div>
                </div>
                <ChevronRight size={12} className="text-[#68758b]" />
              </Link>
            ))}
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              <span className="text-[10px] font-semibold text-[#c4cfdf]">Scan engine connected</span>
            </div>
            <p className="text-[9px] leading-4 text-[#6f7d94]">Subdomain enumeration and TLS checks make real DNS and TLS connections to your target. DOM analysis is not yet implemented.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Findings() {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('All severities');
  const list = sampleFindings.filter(f =>
    (severity === 'All severities' || f.severity === severity) &&
    `${f.title} ${f.asset} ${f.category} ${f.id}`.toLowerCase().includes(query.toLowerCase())
  );
  const tone: any = { Critical:'red', High:'amber', Medium:'violet', Low:'blue' };
  return (
    <div className="fade-up">
      <PrototypeBanner/>
      <PageHeading kicker="Assessment / findings" title="Findings" description="Review sample issues and their associated assets." action={<Button variant="secondary" onClick={()=>{setQuery('');setSeverity('All severities')}}><Filter size={14}/>Reset filters</Button>}/>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {([['Critical','01','red'],['High','02','amber'],['Medium','05','violet'],['Low','04','blue']] as [string,string,string][]).map(([name,num,toneName]) => (
          <Card key={name} className="flex items-center justify-between px-4 py-3">
            <div><div className="text-[9px] text-[#77859c]">{name}</div><div className="mt-1 text-[19px] font-bold text-[#dbe5f3]">{num}</div></div>
            <StatusPill tone={toneName}>Sample</StatusPill>
          </Card>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-[#242d40] p-4">
          <div className="flex min-w-[210px] flex-1 items-center gap-2 rounded-lg border border-[#29354a] bg-[#0e1522] px-3">
            <Search size={14} className="text-[#71809a]"/>
            <input aria-label="Search findings" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search findings, assets, categories…" className="h-9 w-full bg-transparent text-[10px] outline-none placeholder:text-[#59667d]"/>
          </div>
          <select aria-label="Filter by severity" value={severity} onChange={e=>setSeverity(e.target.value)} className="rounded-lg border border-[#29354a] bg-[#0e1522] px-3 text-[10px] text-[#b7c3d6] outline-none">
            <option>All severities</option>
            {['Critical','High','Medium','Low'].map(x=><option key={x}>{x}</option>)}
          </select>
        </div>
        <div className="divide-y divide-[#202a3b]">
          {list.map(f => (
            <div key={f.id} className="grid gap-3 px-4 py-4 transition hover:bg-white/[.018] md:grid-cols-[75px_1fr_160px_112px] md:items-center md:px-5">
              <div className="mono text-[9px] text-[#73829b]">{f.id}<div className="mt-1 text-[#57657d]">{f.age}</div></div>
              <div>
                <div className="text-[11px] font-semibold text-[#d3deed]">{f.title}</div>
                <div className="mt-1.5 text-[9px] text-[#75839a]">{f.category} <span className="px-1 text-[#3e4b61]">·</span> <span className="mono">{f.asset}</span></div>
                <p className="mt-2 max-w-[760px] text-[9px] leading-4 text-[#78869d]">{f.detail}</p>
              </div>
              <StatusPill tone={tone[f.severity]}>{f.severity} severity</StatusPill>
            </div>
          ))}
          {!list.length && <div className="px-6 py-16 text-center"><Search size={22} className="mx-auto text-[#53617a]"/><div className="mt-3 text-[12px] font-semibold text-[#c9d5e6]">No matching findings</div></div>}
        </div>
        <div className="border-t border-[#202a3b] px-4 py-3 text-[9px] text-[#69778e]">Showing {list.length} of {sampleFindings.length} illustrative records</div>
      </Card>
    </div>
  );
}

function ScanDetails() {
  return (
    <div className="fade-up">
      <PrototypeBanner/>
      <PageHeading kicker="Assessment / scan details" title="northstar-labs.test" description="Sample scan WS-2048 · Today at 09:42" action={<Link href="/history" className="inline-flex items-center gap-2 rounded-lg border border-[#29354a] bg-[#151c2b] px-3 py-2.5 text-[10px] font-semibold text-[#b9c5d8]"><History size={14}/>Scan history</Link>}/>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#252f43] px-4 py-4 md:px-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300"><CheckCircle2 size={18}/></span>
            <div><div className="text-[12px] font-bold text-[#dce6f5]">Sample status: Complete</div><div className="mono mt-1 text-[9px] text-[#748199]">WS-2048 · ILLUSTRATIVE</div></div>
          </div>
          <StatusPill tone="violet">No live scan performed</StatusPill>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-4 md:p-5">
          {[['Sample score','78 / 100'],['Assets','8 discovered'],['Findings','12 recorded'],['Duration','2m 18s (sample)']].map(([l,v]) => (
            <div key={l}><div className="text-[9px] text-[#748199]">{l}</div><div className="mt-1.5 text-[14px] font-bold text-[#d8e2f0]">{v}</div></div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Assets() {
  const [query, setQuery] = useState('');
  const rows = assetRows.filter(a => `${a.host} ${a.kind}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="fade-up">
      <PrototypeBanner/>
      <PageHeading kicker="Assessment / attack surface" title="Assets" description="Known hosts linked to the sample workspace."/>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric icon={Globe2} label="Sample assets" value="23" suffix="hosts" trend="across 4 domains" tone="blue"/>
        <Metric icon={LockKeyhole} label="HTTPS enabled" value="21" suffix="91.3%" trend="sample record" tone="green"/>
        <Metric icon={ShieldAlert} label="With findings" value="16" suffix="hosts" trend="12 open issues" tone="amber"/>
      </div>
      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#242d40] p-4">
          <h2 className="text-[13px] font-bold text-[#dce6f5]">Discovered hosts <span className="ml-1 text-[10px] font-normal text-[#738199]">(sample)</span></h2>
          <div className="flex items-center gap-2 rounded-lg border border-[#29354a] bg-[#0e1522] px-3">
            <Search size={13} className="text-[#71809a]"/>
            <input aria-label="Search assets" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filter hosts…" className="h-9 w-[180px] bg-transparent text-[10px] outline-none placeholder:text-[#59667d]"/>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left">
            <thead className="bg-[#0e1522] text-[9px] uppercase tracking-[.12em] text-[#68758b]">
              <tr>{['Host','Asset type','Transport','Last seen','Findings'].map(x=><th key={x} className="px-4 py-3 font-semibold">{x}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.host} className="border-t border-[#202a3b] text-[10px] hover:bg-white/[.018]">
                  <td className="px-4 py-3.5"><div className="flex items-center gap-2.5"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#1b2a41] text-[#87b7ff]"><Globe2 size={13}/></span><span className="mono text-[#cbd7e8]">{a.host}</span></div></td>
                  <td className="text-[#93a0b5]">{a.kind}</td>
                  <td><StatusPill tone="green"><LockKeyhole size={10}/>{a.status}</StatusPill></td>
                  <td className="text-[#8794aa]">{a.last}</td>
                  <td className="text-[#aab6c8]">{a.findings} <span className="text-[#68758b]">sample</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[#202a3b] px-4 py-3 text-[9px] text-[#69778e]">{rows.length} of {assetRows.length} displayed records</div>
      </Card>
      <div className="mt-4"><RecentScans /></div>
    </div>
  );
}

function HistoryPage() {
  const [active, setActive] = useState('northstar-labs.test');
  return (
    <div className="fade-up">
      <PrototypeBanner/>
      <PageHeading kicker="Records / history" title="Scan history" description="Previous assessment records, populated with illustrative data." action={<Link href="/scans/new" className="inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-3.5 py-2.5 text-[10px] font-bold text-[#08111f]"><Plus size={14}/>New scan</Link>}/>
      <div className="mb-4 flex flex-wrap gap-2">
        {['northstar-labs.test','copperfield.dev'].map(d => (
          <button key={d} onClick={()=>setActive(d)} className={`rounded-lg border px-3 py-2 text-[10px] font-semibold ${active===d?'border-blue-300/25 bg-blue-400/10 text-blue-200':'border-[#29354a] bg-[#121a28] text-[#8c99ae]'}`}>{d}</button>
        ))}
      </div>
      <Card>
        <div className="divide-y divide-[#202a3b]">
          {sampleScans.filter(s=>active==='northstar-labs.test'?s.domain==='northstar-labs.test':s.domain==='copperfield.dev').map(s => (
            <div key={s.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_140px_120px_100px_auto] md:items-center md:px-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1a293f] text-[#83adf0]"><History size={16}/></div>
                <div><div className="mono text-[10px] font-semibold text-[#d3deed]">{s.id}</div><div className="mt-1 text-[9px] text-[#77849a]">{s.time}</div></div>
              </div>
              <div><div className="text-[8px] text-[#6e7b91]">Score</div><div className="mt-1 text-[12px] font-bold text-[#cbd6e7]">{s.score}<span className="font-normal text-[#68758b]">/100</span></div></div>
              <div><div className="text-[8px] text-[#6e7b91]">Findings</div><div className="mt-1 text-[10px] text-[#b7c3d5]">{s.findings} <span className="text-[#748199]">({s.severity})</span></div></div>
              <StatusPill tone="green"><Check size={10}/>{s.status}</StatusPill>
              <Link href={`/scans/${s.id}`} className="text-[9px] font-semibold text-[#81b1ff]">Details <ChevronRight size={12} className="inline"/></Link>
            </div>
          ))}
        </div>
        <div className="border-t border-[#202a3b] px-4 py-3 text-[9px] text-[#69778e]">Comparisons are static examples.</div>
      </Card>
    </div>
  );
}

function Reports() {
  return (
    <div className="fade-up">
      <PrototypeBanner/>
      <PageHeading kicker="Records / reporting" title="Reports" description="Preview a shareable report layout." action={<Button onClick={()=>window.print()}><Download size={14}/>Export / print</Button>}/>
      <Card className="p-5 md:p-8 print-area">
        <div className="flex items-center gap-2 mb-8"><Shield size={16} className="text-[#69a8ff]"/><span className="text-[14px] font-extrabold text-[#dce6f5]">WEBSENTINEL</span><PrototypeBanner compact/></div>
        <h2 className="text-[24px] font-bold text-[#edf3ff]">northstar-labs.test</h2>
        <p className="mt-2 text-[10px] text-[#8a98ae]">Report reference WS-2048 · Sample data only</p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[['Security score','78/100'],['Assets','8 sample'],['Findings','12 sample']].map(([a,b]) => (
            <div key={a}><div className="text-[9px] text-[#7b89a0]">{a}</div><div className="mt-1 text-[16px] font-bold text-[#dce6f5]">{b}</div></div>
          ))}
        </div>
        <div className="mt-6 overflow-hidden rounded-lg border border-[#273249]">
          <div className="grid grid-cols-[1fr_100px] bg-[#151f2e] px-3 py-2 text-[8px] uppercase tracking-wider text-[#77859b]"><span>Finding</span><span>Severity</span></div>
          {sampleFindings.slice(0,4).map(f => (
            <div key={f.id} className="grid grid-cols-[1fr_100px] border-t border-[#252f43] px-3 py-3 text-[9px]">
              <div className="text-[#cbd6e6]">{f.title}<div className="mt-1 mono text-[8px] text-[#728098]">{f.asset}</div></div>
              <div className="text-[#aebbd0]">{f.severity}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function DOMInspector() {
  return (
    <div className="fade-up">
      <PrototypeBanner/>
      <PageHeading kicker="Assessment / client-side" title="DOM inspector" description="Illustrative source-to-sink patterns. No real DOM analysis is implemented."/>
      <Card className="p-8 text-center">
        <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl border border-[#2b3954] bg-[#162135] text-[#78aaff]"><Code2 size={26}/></div>
        <h2 className="mt-4 text-[14px] font-bold text-[#dce6f5]">DOM analysis not yet implemented</h2>
        <p className="mt-2 text-[10px] text-[#75839a]">Subdomain enumeration and TLS checks are the live features available in this release.</p>
        <div className="mt-5 flex justify-center gap-3">
          <Link href="/subdomains" className="inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-4 py-2.5 text-[11px] font-bold text-[#08111f] hover:bg-[#64a1ff]"><Network size={14}/>Subdomain enum</Link>
          <Link href="/tls" className="inline-flex items-center gap-2 rounded-lg border border-[#273249] bg-[#151c2b] px-4 py-2.5 text-[11px] font-semibold text-[#dce4f1] hover:bg-[#1b2537]"><LockKeyhole size={14}/>TLS check</Link>
        </div>
      </Card>
    </div>
  );
}

function Settings() {
  const [saved, setSaved] = useState(false);
  return (
    <div className="fade-up">
      <PrototypeBanner/>
      <PageHeading kicker="Workspace / preferences" title="Settings" description="Workspace configuration and prototype preferences."/>
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="p-5">
            <Eyebrow>Workspace</Eyebrow>
            <h2 className="text-[13px] font-bold text-[#dce6f5]">Workspace profile</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-[9px] text-[#77859c]">Workspace name<input defaultValue="Northstar Lab" className="mt-2 h-10 w-full rounded-lg border border-[#2a354a] bg-[#0d1420] px-3 text-[10px] text-[#dce6f5] outline-none focus:border-[#5e9aff]"/></label>
              <label className="text-[9px] text-[#77859c]">API base URL<input defaultValue={import.meta.env.VITE_API_URL ?? 'http://localhost:3000'} className="mono mt-2 h-10 w-full rounded-lg border border-[#2a354a] bg-[#0d1420] px-3 text-[10px] text-[#dce6f5] outline-none focus:border-[#5e9aff]"/></label>
            </div>
          </Card>
          <div className="flex justify-end">
            <Button onClick={()=>setSaved(true)}><Check size={14}/>Save preferences</Button>
          </div>
          {saved && <p className="text-[9px] text-[#69c99a]">Settings are local to this session — not persisted.</p>}
        </div>
        <Card className="h-fit p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-300/[.08] text-violet-200"><Shield size={18}/></div>
          <h2 className="mt-4 text-[13px] font-bold text-[#dce6f5]">Live environment</h2>
          <p className="mt-2 text-[10px] leading-5 text-[#8492a8]">Subdomain enumeration and TLS checks make real network requests. Ensure you have permission to test any target.</p>
          <div className="mt-4 rounded-lg border border-[#29354a] bg-[#0d1420] p-3">
            <div className="flex items-center gap-2 text-[9px] font-semibold text-[#b5c3d8]"><Activity size={13} className="text-[#69d2a1]"/>Scan engine active</div>
            <div className="mt-2 text-[9px] leading-4 text-[#718098]">Backend API processes subdomain and TLS requests. Overview data remains sample/illustrative.</div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Landing ───────────────────────────────────────────────────────────────────
function Landing() {
  const { user } = useAuth();
  return (
    <div className="app-bg grid-texture min-h-[100dvh] overflow-hidden">
      <header className="relative z-10 mx-auto flex max-w-[1200px] items-center justify-between px-5 py-5 md:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-300/20 bg-blue-400/10 text-blue-300"><Shield size={19}/></span>
          <span className="text-[14px] font-extrabold tracking-[-.04em]">web<span className="text-[#62a1ff]">sentinel</span></span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-[#725fe2]/30 bg-[#725fe2]/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.12em] text-[#b8adff] sm:inline-flex">Live scan engine</span>
          {user ? (
            <Link href="/overview" className="inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-4 py-2.5 text-[11px] font-bold text-[#08111f] hover:bg-[#64a1ff]">Open workspace <ArrowRight size={14}/></Link>
          ) : (
            <Link href="/login" className="inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-4 py-2.5 text-[11px] font-bold text-[#08111f] hover:bg-[#64a1ff]">Sign in <ArrowRight size={14}/></Link>
          )}
        </div>
      </header>
      <section className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-5 pb-20 pt-14 md:grid-cols-[1.08fr_.92fr] md:px-8">
        <div className="absolute -left-24 top-12 h-[330px] w-[330px] rounded-full bg-blue-500/[.08] blur-[100px]"/>
        <div className="relative fade-up">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#293653] bg-[#111a2b]/85 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[.14em] text-[#93a4bf]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7e70f4]"/>Security assessment workspace
          </div>
          <h1 className="max-w-[650px] text-[42px] font-extrabold leading-[1.04] tracking-[-.065em] text-[#eef4ff] sm:text-[54px] md:text-[66px]">
            See the surface.<br/><span className="bg-gradient-to-r from-[#72b6ff] via-[#8298ff] to-[#b290ff] bg-clip-text text-transparent">Understand the risk.</span>
          </h1>
          <p className="mt-6 max-w-[480px] text-[13px] leading-6 text-[#9ba8bd]">Live subdomain enumeration, TLS certificate checks, and a security findings workspace — all in one dashboard.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={user ? '/overview' : '/login'} className="inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-5 py-3 text-[11px] font-bold text-[#08111f] shadow-[0_8px_28px_rgba(63,141,255,.2)] transition hover:-translate-y-0.5 hover:bg-[#64a1ff]">
              {user ? 'Open workspace' : 'Get started'} <ArrowRight size={15}/>
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap gap-4 text-[10px] text-[#76839a]">
            <span className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-[#68d8ac]"/>Live subdomain scan</span>
            <span className="flex items-center gap-1.5"><LockKeyhole size={13} className="text-[#68d8ac]"/>Real TLS cert checks</span>
            <span className="flex items-center gap-1.5"><Network size={13} className="text-[#68d8ac]"/>DNS brute-force</span>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-[490px] fade-up" style={{ animationDelay:'.12s' }}>
          <div className="absolute -inset-8 rounded-[40px] bg-gradient-to-br from-blue-500/10 via-transparent to-violet-500/10 blur-2xl"/>
          <div className="relative overflow-hidden rounded-2xl border border-[#34415b] bg-[#101827]/95 shadow-[0_30px_100px_rgba(0,0,0,.42)]">
            <div className="flex items-center justify-between border-b border-[#242f43] px-4 py-3">
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#66d6a2]"/><span className="text-[10px] font-semibold text-[#b8c4d7]">Feature overview</span></div>
            </div>
            <div className="p-5 space-y-3">
              {[
                { icon: Network,    label: 'Subdomain enumeration', desc: 'Passive (crt.sh) + Active (DNS brute-force)', color: 'text-blue-300 bg-blue-400/10' },
                { icon: LockKeyhole,label: 'TLS certificate check', desc: 'Grade, expiry, versions, HSTS, headers',      color: 'text-violet-300 bg-violet-400/10' },
                { icon: ShieldAlert,label: 'Findings triage',       desc: 'Severity-sorted security issues',             color: 'text-amber-300 bg-amber-400/10' },
                { icon: User,       label: 'User profiles',          desc: 'Auth, login, preferences',                   color: 'text-emerald-300 bg-emerald-400/10' },
              ].map(({ icon: Icon, label, desc, color }) => (
                <div key={label} className="flex items-center gap-3 rounded-lg border border-[#252f42] bg-[#141d2d] p-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${color}`}><Icon size={15}/></span>
                  <div><div className="text-[10px] font-semibold text-[#d9e4f4]">{label}</div><div className="mt-0.5 text-[8px] text-[#76849a]">{desc}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Router ────────────────────────────────────────────────────────────────────
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function DashboardRoutes() {
  const [loc] = useLocation();

  if (loc === '/') return <Landing />;
  if (loc === '/login') return <Login />;

  return (
    <AuthGuard>
      <Shell>
        <Switch>
          <Route path="/overview"      component={Overview} />
          <Route path="/scans/new"     component={NewScan} />
          <Route path="/scans/:id"     component={ScanDetails} />
          <Route path="/findings"      component={Findings} />
          <Route path="/dom-inspector" component={DOMInspector} />
          <Route path="/assets"        component={Assets} />
          <Route path="/history"       component={HistoryPage} />
          <Route path="/reports"       component={Reports} />
          <Route path="/settings"      component={Settings} />
          <Route path="/subdomains"    component={Subdomains} />
          <Route path="/tls"           component={TlsCheck} />
          <Route path="/profile"       component={Profile} />
          <Route component={NotFound} />
        </Switch>
      </Shell>
    </AuthGuard>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <RoutedErrorBoundary>
              <DashboardRoutes />
            </RoutedErrorBoundary>
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
