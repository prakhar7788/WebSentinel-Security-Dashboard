import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Login from '@/pages/login';
import Signup from '@/pages/signup';
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
import {
  ScanStoreProvider, useScanStore,
  type ScanRecord, type SubdomainScanRecord, type TlsScanRecord,
  scoreFromTlsScan, elapsedLabel, relativeTime,
} from '@/lib/scans';
import { WorkspaceProvider, useWorkspace } from '@/lib/workspaces';

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
    { label: 'Findings',       href: '/findings',      icon: ShieldAlert },
    { label: 'DOM inspector',  href: '/dom-inspector', icon: Code2 },
    { label: 'Assets',         href: '/assets',        icon: Globe2 },
  ]},
  { title: 'Records', items: [
    { label: 'Scan history', href: '/history', icon: History },
    { label: 'Reports',      href: '/reports', icon: FileText },
  ]},
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

function WorkspaceSwitcher({ close }: { close: () => void }) {
  const { workspaces, active, activeId, setActive, createWorkspace, renameWorkspace, deleteWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    createWorkspace(newName.trim());
    setNewName(''); setCreating(false); setOpen(false); close();
  }
  function handleRename(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (renameValue.trim()) renameWorkspace(id, renameValue.trim());
    setRenamingId(null);
  }
  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="px-4 pt-5 relative">
      <button onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg border border-[#273248] bg-[#121a29] px-3 py-2.5 text-[11px] text-[#b5c0d3] transition hover:border-[#354461]">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#263958] text-[9px] font-bold text-blue-200">{initials(active.name)}</span>
        <span className="flex-1 min-w-0 text-left">
          <span className="block truncate font-semibold text-[#dce5f3]">{active.name}</span>
          <span className="block text-[9px] text-[#738099]">{workspaces.length > 1 ? `${workspaces.length} workspaces` : 'Personal workspace'}</span>
        </span>
        <ChevronDown size={13} className={`shrink-0 text-[#68758b] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-4 right-4 z-50 mt-1 overflow-hidden rounded-xl border border-[#273248] bg-[#0e1722] shadow-[0_12px_40px_rgba(0,0,0,.5)]">
          <div className="max-h-[220px] overflow-y-auto">
            {workspaces.map(ws => (
              <div key={ws.id} className={`flex items-center gap-2 px-3 py-2.5 ${ws.id === activeId ? 'bg-[#1b2b43]' : 'hover:bg-white/[.04]'}`}>
                {renamingId === ws.id ? (
                  <form onSubmit={e => handleRename(e, ws.id)} className="flex flex-1 items-center gap-1.5">
                    <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                      className="flex-1 rounded border border-[#354461] bg-[#121a29] px-2 py-1 text-[10px] text-[#dce6f5] outline-none" />
                    <button type="submit" className="text-emerald-300 hover:text-emerald-200"><Check size={12}/></button>
                    <button type="button" onClick={() => setRenamingId(null)} className="text-[#68758b] hover:text-white"><X size={12}/></button>
                  </form>
                ) : (
                  <>
                    <button onClick={() => { setActive(ws.id); setOpen(false); close(); }} className="flex flex-1 items-center gap-2 text-left">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#263958] text-[8px] font-bold text-blue-200">{initials(ws.name)}</span>
                      <span className={`flex-1 truncate text-[10px] font-semibold ${ws.id === activeId ? 'text-[#8dbbff]' : 'text-[#c4cfdf]'}`}>{ws.name}</span>
                      {ws.id === activeId && <Check size={11} className="text-[#5498ff] shrink-0"/>}
                    </button>
                    <button onClick={() => { setRenamingId(ws.id); setRenameValue(ws.name); }} aria-label="Rename" className="rounded p-1 text-[#586477] hover:text-[#a0aec0]"><Settings2 size={11}/></button>
                    {workspaces.length > 1 && (
                      <button onClick={() => deleteWorkspace(ws.id)} aria-label="Delete" className="rounded p-1 text-[#586477] hover:text-red-300"><X size={11}/></button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-[#202a3c]">
            {creating ? (
              <form onSubmit={handleCreate} className="flex items-center gap-2 px-3 py-2.5">
                <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="Workspace name…" maxLength={40}
                  className="flex-1 rounded border border-[#354461] bg-[#121a29] px-2 py-1.5 text-[10px] text-[#dce6f5] outline-none placeholder:text-[#546179]" />
                <button type="submit" className="rounded-md bg-[#438cff] px-2 py-1.5 text-[9px] font-bold text-[#08111f] hover:bg-[#64a1ff]">Create</button>
                <button type="button" onClick={() => setCreating(false)} className="text-[#68758b] hover:text-white"><X size={13}/></button>
              </form>
            ) : (
              <button onClick={() => setCreating(true)} className="flex w-full items-center gap-2 px-3 py-2.5 text-[10px] font-semibold text-[#7899c7] hover:bg-white/[.04]">
                <Plus size={13}/> New workspace
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Sidebar({ mobileOpen, close }: { mobileOpen: boolean; close: () => void }) {
  const [loc] = useLocation();
  const { user, logout } = useAuth();
  const { allFindings } = useScanStore();
  const { active } = useWorkspace();
  const [loggingOut, setLoggingOut] = useState(false);
  const openFindingsCount = allFindings.length;

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

        {/* Workspace switcher */}
        <WorkspaceSwitcher close={close} />

        {/* Nav */}
        <nav className="nav-scroll flex-1 overflow-y-auto px-3 pt-6">
          {navGroups.map(group => (
            <div key={group.title} className="mb-6">
              <div className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[.16em] text-[#55627a]">{group.title}</div>
              {group.items.map(item => {
                const isActive = loc === item.href || (item.href !== '/overview' && loc.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} onClick={close}
                    className={`group mb-1 flex items-center gap-3 rounded-lg px-3 py-[10px] text-[11px] font-semibold transition-colors ${isActive ? 'bg-[#1b2b43] text-[#8dbbff] shadow-[inset_2px_0_0_#5498ff]' : 'text-[#8591a7] hover:bg-white/[.04] hover:text-[#d5dfef]'}`}
                  >
                    <Icon size={16} strokeWidth={1.8} />
                    <span className="flex-1">{item.label}</span>
                    {item.href === '/findings' && openFindingsCount > 0 && (
                      <span className="rounded-md bg-[#242e41] px-1.5 py-0.5 text-[9px] text-[#9baac2]">{openFindingsCount}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom: settings + user */}
        <div className="border-t border-[#202a3c] p-3 space-y-1">
          <Link href="/settings" onClick={close}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[11px] font-semibold ${loc === '/settings' ? 'bg-[#1b2b43] text-[#8dbbff]' : 'text-[#8591a7] hover:bg-white/[.04]'}`}>
            <Settings2 size={16} /> Settings
          </Link>
          {user && (
            <div className="mt-1 flex items-center gap-2.5 rounded-lg border border-[#202a3c] bg-[#111827] px-3 py-2.5">
              <Link href="/profile" onClick={close} className="flex flex-1 items-center gap-2.5 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#33415c] bg-[#1a263a] text-[9px] font-bold text-[#b4ccf4]">{user.avatar}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[10px] font-semibold text-[#c4cfdf]">{user.name}</div>
                  <div className="text-[8px] text-[#68758b]">{user.role}</div>
                </div>
              </Link>
              <button onClick={async () => { setLoggingOut(true); await logout(); }} disabled={loggingOut} aria-label="Sign out"
                className="shrink-0 rounded-md p-1.5 text-[#68758b] transition hover:bg-white/[.06] hover:text-red-300 disabled:opacity-40">
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
  const { active: activeWorkspace } = useWorkspace();
  const [loc] = useLocation();

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
              <span>{activeWorkspace.name}</span>
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

function RecentScans() {
  const { scans } = useScanStore();
  const recent = scans.slice(0, 6);

  if (recent.length === 0) {
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#242d40] px-4 py-4 md:px-5">
          <div><Eyebrow>Workspace activity</Eyebrow><h2 className="text-[14px] font-bold text-[#dce6f5]">Recent scans</h2></div>
          <Link href="/scans/new" className="text-[10px] font-semibold text-[#80b3ff] hover:text-white">New scan <ArrowRight size={12} className="inline" /></Link>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#2b3954] bg-[#162135] text-[#78aaff]"><Radar size={20}/></div>
          <div className="text-[11px] font-bold text-[#dce6f5]">No scans yet</div>
          <p className="text-[9px] text-[#75839a]">Run a subdomain enumeration or TLS check to see results here.</p>
          <div className="flex gap-2 mt-1">
            <Link href="/subdomains" className="inline-flex items-center gap-1.5 rounded-lg bg-[#438cff] px-3 py-2 text-[9px] font-bold text-[#08111f] hover:bg-[#64a1ff]"><Network size={12}/>Subdomains</Link>
            <Link href="/tls" className="inline-flex items-center gap-1.5 rounded-lg border border-[#273249] bg-[#151c2b] px-3 py-2 text-[9px] font-semibold text-[#dce4f1] hover:bg-[#1b2537]"><LockKeyhole size={12}/>TLS check</Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#242d40] px-4 py-4 md:px-5">
        <div><Eyebrow>Workspace activity</Eyebrow><h2 className="text-[14px] font-bold text-[#dce6f5]">Recent scans</h2></div>
        <Link href="/history" className="text-[10px] font-semibold text-[#80b3ff] hover:text-white">View all <ArrowRight size={12} className="inline" /></Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left">
          <thead className="bg-[#0e1522] text-[9px] uppercase tracking-[.12em] text-[#68758b]">
            <tr>{['Scan ID','Target','Type','Status','Score / Info','',''].map(x=><th key={x} className="px-4 py-3 font-semibold md:px-5">{x}</th>)}</tr>
          </thead>
          <tbody>
            {recent.map(scan => {
              const isTls = scan.type === 'tls';
              const tls = isTls ? (scan as TlsScanRecord) : null;
              const score = tls ? scoreFromTlsScan(tls) : null;
              const info = isTls
                ? `Grade ${tls!.grade} · ${tls!.findingsCount.critical + tls!.findingsCount.high} high`
                : `${(scan as SubdomainScanRecord).data.resolvedCount} resolved`;
              return (
                <tr key={scan.id} className="border-t border-[#202a3b] text-[10px] hover:bg-white/[.018]">
                  <td className="mono px-4 py-3.5 text-[#8da0bd] md:px-5">{scan.id}</td>
                  <td className="font-semibold text-[#cdd8e9]">{scan.domain}<div className="mt-1 font-normal text-[#6d7b93]">{relativeTime(scan.scannedAt)}</div></td>
                  <td><StatusPill tone={isTls ? 'violet' : 'blue'}>{isTls ? 'TLS check' : 'Subdomains'}</StatusPill></td>
                  <td><StatusPill tone="green"><Check size={10}/>Complete</StatusPill></td>
                  <td className="mono text-[#d3deed]">{score != null ? <>{score}<span className="text-[#67748b]">/100</span></> : <span className="text-[#8da0bd]">{info}</span>}</td>
                  <td className="text-[#9eabc0] text-[9px]">{info}</td>
                  <td className="pr-4 text-right"><Link href={`/scans/${scan.id}`} className="text-[#83b3ff] hover:text-white">Details <ChevronRight size={12} className="inline"/></Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-[#202a3b] px-4 py-2.5 text-[9px] text-[#6f7c93] md:px-5">{scans.length} total scan{scans.length !== 1 ? 's' : ''} stored · persisted in browser</div>
    </Card>
  );
}

function Overview() {
  const { scans, allFindings } = useScanStore();
  const tlsScans = scans.filter((s): s is TlsScanRecord => s.type === 'tls');
  const subScans = scans.filter((s): s is SubdomainScanRecord => s.type === 'subdomain');

  // Metrics derived from real data
  const latestScore = tlsScans.length > 0 ? scoreFromTlsScan(tlsScans[0]) : null;
  const totalSubdomains = subScans.reduce((n, s) => n + s.data.resolvedCount, 0);
  const totalFindings = allFindings.length;
  const criticalHigh = allFindings.filter(f => f.severity === 'Critical' || f.severity === 'High').length;

  // Score trend: last 8 TLS scans in chronological order
  const scoreTrend = [...tlsScans].reverse().slice(-8).map(s => ({
    day: new Date(s.scannedAt).toLocaleDateString(undefined, { month:'short', day:'numeric' }),
    score: scoreFromTlsScan(s),
  }));

  // Findings by severity counts
  const bySeverity = {
    Critical: allFindings.filter(f => f.severity === 'Critical').length,
    High:     allFindings.filter(f => f.severity === 'High').length,
    Medium:   allFindings.filter(f => f.severity === 'Medium').length,
    Low:      allFindings.filter(f => f.severity === 'Low').length,
  };
  const maxSev = Math.max(...Object.values(bySeverity), 1);

  const hasAnyData = scans.length > 0;

  return (
    <div className="fade-up">
      <PageHeading
        kicker="Workspace / overview"
        title="Security overview"
        description={hasAnyData ? `Based on ${scans.length} scan${scans.length !== 1 ? 's' : ''} stored in this browser.` : 'Run your first scan to populate this dashboard.'}
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
        <Card className="relative overflow-hidden p-4">
          <div className="absolute -right-5 -top-7 h-24 w-24 rounded-full bg-blue-400/[.035] blur-xl" />
          <div className="relative flex justify-between">
            <div><Eyebrow>TLS score</Eyebrow>
              <div className="flex items-baseline gap-2">
                <span className="text-[28px] font-bold tracking-[-.05em] text-[#e1eafa]">{latestScore ?? '—'}</span>
                <span className="text-[10px] text-[#748198]">{latestScore != null ? '/ 100' : 'no data'}</span>
              </div>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-300 bg-emerald-300/10"><ShieldCheck size={16}/></span>
          </div>
          <div className="mt-3 text-[9px] text-[#8390a6]">{tlsScans.length > 0 ? `Latest: ${tlsScans[0].domain}` : 'Run a TLS check to see score'}</div>
        </Card>
        <Card className="relative overflow-hidden p-4">
          <div className="absolute -right-5 -top-7 h-24 w-24 rounded-full bg-blue-400/[.035] blur-xl" />
          <div className="relative flex justify-between">
            <div><Eyebrow>Total scans</Eyebrow>
              <div className="flex items-baseline gap-2">
                <span className="text-[28px] font-bold tracking-[-.05em] text-[#e1eafa]">{scans.length}</span>
                <span className="text-[10px] text-[#748198]">total</span>
              </div>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg text-blue-300 bg-blue-300/10"><Radar size={16}/></span>
          </div>
          <div className="mt-3 text-[9px] text-[#8390a6]">{subScans.length} subdomain · {tlsScans.length} TLS</div>
        </Card>
        <Card className="relative overflow-hidden p-4">
          <div className="absolute -right-5 -top-7 h-24 w-24 rounded-full bg-blue-400/[.035] blur-xl" />
          <div className="relative flex justify-between">
            <div><Eyebrow>Subdomains found</Eyebrow>
              <div className="flex items-baseline gap-2">
                <span className="text-[28px] font-bold tracking-[-.05em] text-[#e1eafa]">{totalSubdomains}</span>
                <span className="text-[10px] text-[#748198]">resolved</span>
              </div>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg text-violet-300 bg-violet-300/10"><Globe2 size={16}/></span>
          </div>
          <div className="mt-3 text-[9px] text-[#8390a6]">across {subScans.length} enumeration{subScans.length !== 1 ? 's' : ''}</div>
        </Card>
        <Card className="relative overflow-hidden p-4">
          <div className="absolute -right-5 -top-7 h-24 w-24 rounded-full bg-blue-400/[.035] blur-xl" />
          <div className="relative flex justify-between">
            <div><Eyebrow>Open findings</Eyebrow>
              <div className="flex items-baseline gap-2">
                <span className="text-[28px] font-bold tracking-[-.05em] text-[#e1eafa]">{totalFindings}</span>
                <span className="text-[10px] text-[#748198]">issues</span>
              </div>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-300 bg-amber-300/10"><AlertTriangle size={16}/></span>
          </div>
          <div className="mt-3 text-[9px] text-[#8390a6]">{criticalHigh > 0 ? <span className="text-amber-300">{criticalHigh} critical/high</span> : 'from TLS checks'}</div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_.85fr]">
        <Card className="p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div><Eyebrow>TLS score trend</Eyebrow><h2 className="text-[14px] font-bold text-[#dce6f5]">Score over time</h2></div>
          </div>
          {scoreTrend.length >= 2 ? (
            <div className="h-[230px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={scoreTrend} margin={{ top:5, right:8, left:-25, bottom:0 }}>
                  <defs><linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5798ff" stopOpacity={0.28}/><stop offset="95%" stopColor="#5798ff" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid stroke="#202a3b" vertical={false}/>
                  <XAxis dataKey="day" tick={{ fill:'#68758c', fontSize:9 }} axisLine={false} tickLine={false} dy={8}/>
                  <YAxis domain={[0,100]} tick={{ fill:'#68758c', fontSize:9 }} axisLine={false} tickLine={false}/>
                  <ChartTooltip contentStyle={{ background:'#151e2e', border:'1px solid #2b3850', borderRadius:8, fontSize:10, color:'#dce6f5' }}/>
                  <Area type="monotone" dataKey="score" stroke="#71aaff" strokeWidth={2} fill="url(#scoreFill)" activeDot={{ r:4, fill:'#9bc5ff', stroke:'#12203a' }}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[230px] flex-col items-center justify-center gap-3 text-center">
              <LockKeyhole size={22} className="text-[#435268]"/>
              <div className="text-[11px] font-semibold text-[#68758b]">Run 2+ TLS checks to see the trend</div>
              <Link href="/tls" className="text-[9px] font-bold text-[#5e9aff]">Run TLS check →</Link>
            </div>
          )}
        </Card>
        <Card className="p-4 md:p-5">
          <div className="flex items-start justify-between">
            <div><Eyebrow>From TLS scans</Eyebrow><h2 className="text-[14px] font-bold text-[#dce6f5]">Findings by severity</h2></div>
            <Link href="/findings" className="text-[10px] font-semibold text-[#80b3ff] hover:text-white">View all <ArrowRight size={12} className="inline"/></Link>
          </div>
          {totalFindings > 0 ? (
            <div className="mt-5 space-y-4">
              {([['Critical','#ed747d'],['High','#efab65'],['Medium','#a187f4'],['Low','#5a9df4']] as [string,string][]).map(([label,color]) => {
                const count = bySeverity[label as keyof typeof bySeverity];
                return (
                  <div key={label}>
                    <div className="mb-1.5 flex justify-between text-[10px]"><span className="text-[#abb7ca]">{label}</span><span className="mono text-[#cbd5e4]">{count}</span></div>
                    <div className="h-[6px] rounded-full bg-[#222b3c]"><div className="h-full rounded-full" style={{ width:`${Math.round((count/maxSev)*100)}%`, background:color }}/></div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 flex flex-col items-center gap-2 py-6 text-center">
              <ShieldCheck size={20} className="text-[#435268]"/>
              <div className="text-[10px] text-[#68758b]">No findings yet — run a TLS check</div>
            </div>
          )}
        </Card>
      </div>

      {/* Quick launch cards */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card className="p-5 transition hover:border-blue-400/25">
          <Link href="/subdomains" className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-400/10 text-blue-300"><Network size={20}/></span>
            <div>
              <div className="text-[12px] font-bold text-[#dce6f5]">Subdomain enumeration</div>
              <p className="mt-1 text-[10px] leading-4 text-[#8190a8]">Discover subdomains via cert transparency and DNS brute-force.</p>
              <div className="mt-2 text-[9px] font-semibold text-[#5e9aff]">Launch →</div>
            </div>
          </Link>
        </Card>
        <Card className="p-5 transition hover:border-violet-400/25">
          <Link href="/tls" className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-400/10 text-violet-300"><LockKeyhole size={20}/></span>
            <div>
              <div className="text-[12px] font-bold text-[#dce6f5]">TLS & certificate check</div>
              <p className="mt-1 text-[10px] leading-4 text-[#8190a8]">Certificate validity, TLS versions, security headers, HSTS.</p>
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
  const { allFindings } = useScanStore();
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('All severities');

  const list = allFindings.filter(f =>
    (severity === 'All severities' || f.severity === severity) &&
    `${f.title} ${f.domain} ${f.category} ${f.id}`.toLowerCase().includes(query.toLowerCase())
  );
  const tone: Record<string, string> = { Critical:'red', High:'amber', Medium:'violet', Low:'blue', Info:'muted' };
  const counts = { Critical: allFindings.filter(f=>f.severity==='Critical').length, High: allFindings.filter(f=>f.severity==='High').length, Medium: allFindings.filter(f=>f.severity==='Medium').length, Low: allFindings.filter(f=>f.severity==='Low').length };

  if (allFindings.length === 0) {
    return (
      <div className="fade-up">
        <PageHeading kicker="Assessment / findings" title="Findings" description="Security issues found across all TLS checks."/>
        <Card className="p-10 text-center">
          <ShieldAlert size={22} className="mx-auto text-[#435268]"/>
          <div className="mt-3 text-[12px] font-semibold text-[#dce6f5]">No findings yet</div>
          <p className="mt-2 text-[10px] text-[#75839a]">Findings are generated from TLS checks. Run a TLS check to see security issues here.</p>
          <Link href="/tls" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-4 py-2.5 text-[11px] font-bold text-[#08111f] hover:bg-[#64a1ff]"><LockKeyhole size={14}/>Run TLS check</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="fade-up">
      <PageHeading kicker="Assessment / findings" title="Findings" description="Security issues found across all your TLS checks." action={<button onClick={()=>{setQuery('');setSeverity('All severities')}} className="inline-flex items-center gap-2 rounded-lg border border-[#273249] bg-[#151c2b] px-3.5 py-2.5 text-[11px] font-semibold text-[#dce4f1] hover:bg-[#1b2537]"><Filter size={14}/>Reset</button>}/>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {(['Critical','High','Medium','Low'] as const).map(sev => (
          <Card key={sev} className="flex items-center justify-between px-4 py-3">
            <div><div className="text-[9px] text-[#77859c]">{sev}</div><div className="mt-1 text-[19px] font-bold text-[#dbe5f3]">{counts[sev]}</div></div>
            <StatusPill tone={tone[sev]}>{sev}</StatusPill>
          </Card>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-[#242d40] p-4">
          <div className="flex min-w-[210px] flex-1 items-center gap-2 rounded-lg border border-[#29354a] bg-[#0e1522] px-3">
            <Search size={14} className="text-[#71809a]"/>
            <input aria-label="Search findings" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search title, domain, category…" className="h-9 w-full bg-transparent text-[10px] outline-none placeholder:text-[#59667d]"/>
          </div>
          <select aria-label="Filter by severity" value={severity} onChange={e=>setSeverity(e.target.value)} className="rounded-lg border border-[#29354a] bg-[#0e1522] px-3 text-[10px] text-[#b7c3d6] outline-none">
            <option>All severities</option>
            {['Critical','High','Medium','Low'].map(x=><option key={x}>{x}</option>)}
          </select>
        </div>
        <div className="divide-y divide-[#202a3b]">
          {list.map(f => (
            <div key={f.id} className="grid gap-3 px-4 py-4 transition hover:bg-white/[.018] md:grid-cols-[75px_1fr_160px_130px] md:items-center md:px-5">
              <div className="mono text-[9px] text-[#73829b]">{f.id}<div className="mt-1 text-[#57657d]">{relativeTime(f.scannedAt)}</div></div>
              <div>
                <div className="text-[11px] font-semibold text-[#d3deed]">{f.title}</div>
                <div className="mt-1.5 text-[9px] text-[#75839a]">{f.category} <span className="px-1 text-[#3e4b61]">·</span> <span className="mono">{f.domain}</span></div>
                <p className="mt-2 max-w-[760px] text-[9px] leading-4 text-[#78869d]">{f.detail}</p>
              </div>
              <StatusPill tone={tone[f.severity] ?? 'muted'}>{f.severity} severity</StatusPill>
              <Link href={`/scans/${f.scanId}`} className="text-[9px] font-semibold text-[#86b4ff] hover:text-white">View scan <ChevronRight size={12} className="inline"/></Link>
            </div>
          ))}
          {!list.length && <div className="px-6 py-16 text-center"><Search size={22} className="mx-auto text-[#53617a]"/><div className="mt-3 text-[12px] font-semibold text-[#c9d5e6]">No matching findings</div></div>}
        </div>
        <div className="border-t border-[#202a3b] px-4 py-3 text-[9px] text-[#69778e]">Showing {list.length} of {allFindings.length} findings from TLS checks</div>
      </Card>
    </div>
  );
}

function ScanDetails() {
  const [loc] = useLocation();
  const { scans } = useScanStore();
  // Extract id from path /scans/WS-XXXX
  const id = loc.split('/').pop() ?? '';
  const scan = scans.find(s => s.id === id);

  if (!scan) {
    return (
      <div className="fade-up">
        <PageHeading kicker="Assessment / scan details" title="Scan not found" description={`No scan record with ID "${id}" found in this browser.`} action={<Link href="/history" className="inline-flex items-center gap-2 rounded-lg border border-[#29354a] bg-[#151c2b] px-3 py-2.5 text-[10px] font-semibold text-[#b9c5d8]"><History size={14}/>Scan history</Link>}/>
        <Card className="p-10 text-center">
          <History size={22} className="mx-auto text-[#435268]"/>
          <div className="mt-3 text-[12px] font-semibold text-[#dce6f5]">Scan data not found</div>
          <p className="mt-2 text-[10px] text-[#75839a]">Scan results are stored per-browser. If you cleared your browser data or opened a new browser, past scans won't be available.</p>
          <div className="mt-5 flex justify-center gap-3">
            <Link href="/subdomains" className="inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-4 py-2.5 text-[11px] font-bold text-[#08111f] hover:bg-[#64a1ff]"><Network size={14}/>New subdomain scan</Link>
            <Link href="/tls" className="inline-flex items-center gap-2 rounded-lg border border-[#273249] bg-[#151c2b] px-4 py-2.5 text-[11px] font-semibold text-[#dce4f1] hover:bg-[#1b2537]"><LockKeyhole size={14}/>New TLS check</Link>
          </div>
        </Card>
      </div>
    );
  }

  const isTls = scan.type === 'tls';
  const tls = isTls ? (scan as TlsScanRecord) : null;
  const sub = !isTls ? (scan as SubdomainScanRecord) : null;
  const score = tls ? scoreFromTlsScan(tls) : null;

  return (
    <div className="fade-up">
      <PageHeading
        kicker="Assessment / scan details"
        title={scan.domain}
        description={`${scan.id} · ${isTls ? 'TLS & certificate check' : 'Subdomain enumeration'} · ${new Date(scan.scannedAt).toLocaleString()}`}
        action={<Link href="/history" className="inline-flex items-center gap-2 rounded-lg border border-[#29354a] bg-[#151c2b] px-3 py-2.5 text-[10px] font-semibold text-[#b9c5d8]"><History size={14}/>Scan history</Link>}
      />

      {/* Summary card */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#252f43] px-4 py-4 md:px-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300"><CheckCircle2 size={18}/></span>
            <div>
              <div className="text-[12px] font-bold text-[#dce6f5]">Scan complete</div>
              <div className="mono mt-1 text-[9px] text-[#748199]">{scan.id} · {new Date(scan.scannedAt).toLocaleString()}</div>
            </div>
          </div>
          <StatusPill tone={isTls ? 'violet' : 'blue'}>{isTls ? 'TLS check' : 'Subdomain enumeration'}</StatusPill>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-4 md:p-5">
          {isTls && tls ? [
            ['TLS grade',   tls.grade],
            ['Score',       `${score} / 100`],
            ['Findings',    `${tls.findingsCount.critical + tls.findingsCount.high + tls.findingsCount.medium + tls.findingsCount.low}`],
            ['Duration',    elapsedLabel(tls.elapsedMs)],
          ].map(([l,v]) => (
            <div key={l}><div className="text-[9px] text-[#748199]">{l}</div><div className="mt-1.5 text-[14px] font-bold text-[#d8e2f0]">{v}</div></div>
          )) : sub ? [
            ['Subdomains found', sub.data.totalFound],
            ['Resolved',         sub.data.resolvedCount],
            ['Mode',             sub.data.mode],
            ['Duration',         elapsedLabel(sub.elapsedMs)],
          ].map(([l,v]) => (
            <div key={String(l)}><div className="text-[9px] text-[#748199]">{l}</div><div className="mt-1.5 text-[14px] font-bold text-[#d8e2f0]">{v}</div></div>
          )) : null}
        </div>
      </Card>

      {/* TLS findings */}
      {isTls && tls && tls.data.findings.length > 0 && (
        <Card className="mb-4 overflow-hidden">
          <div className="border-b border-[#252f43] px-5 py-4">
            <Eyebrow>Security findings</Eyebrow>
            <h2 className="text-[13px] font-bold text-[#dce6f5]">Issues found ({tls.data.findings.length})</h2>
          </div>
          <div className="divide-y divide-[#202a3b]">
            {tls.data.findings.map((f, i) => {
              const colors: Record<string, string> = { critical:'text-red-300 bg-red-400/10 border-red-400/20', high:'text-amber-300 bg-amber-400/10 border-amber-400/20', medium:'text-violet-300 bg-violet-400/10 border-violet-400/20', low:'text-blue-300 bg-blue-400/10 border-blue-400/20', info:'text-slate-400 bg-slate-400/10 border-slate-400/20' };
              const c = colors[f.severity] ?? colors.info;
              return (
                <div key={i} className="flex items-start gap-3 px-5 py-4">
                  <span className={`mt-0.5 rounded border px-1.5 py-0.5 text-[7px] font-bold capitalize shrink-0 ${c}`}>{f.severity}</span>
                  <div>
                    <div className="text-[10px] font-semibold text-[#d3deed]">{f.title}</div>
                    <p className="mt-1 text-[9px] leading-4 text-[#78869d]">{f.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* TLS cert summary */}
      {isTls && tls?.data.cert && (
        <Card className="mb-4 p-5">
          <Eyebrow>Certificate</Eyebrow>
          <h2 className="mb-4 text-[13px] font-bold text-[#dce6f5]">Certificate details</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Common Name',   value: tls.data.cert.subject?.CN ?? '—' },
              { label: 'Issuer',        value: tls.data.cert.issuer?.CN ?? tls.data.cert.issuer?.O ?? '—' },
              { label: 'Valid to',      value: new Date(tls.data.cert.validTo).toLocaleDateString() },
              { label: 'Days left',     value: tls.data.cert.isExpired ? 'EXPIRED' : `${tls.data.cert.daysUntilExpiry} days` },
              { label: 'TLS version',   value: tls.data.cert.tlsVersion },
              { label: 'Cipher',        value: tls.data.cert.cipherSuite },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-[#263348] bg-[#0d1521] p-2.5">
                <div className="text-[8px] uppercase tracking-[.1em] text-[#64738a]">{label}</div>
                <div className={`mono mt-1 text-[10px] font-semibold ${value === 'EXPIRED' ? 'text-red-300' : 'text-[#c4cfdf]'}`}>{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Link href="/tls" className="text-[9px] font-semibold text-[#80b3ff]">Run another TLS check →</Link>
          </div>
        </Card>
      )}

      {/* Subdomain results summary */}
      {!isTls && sub && (
        <Card className="overflow-hidden">
          <div className="border-b border-[#252f43] px-5 py-4">
            <Eyebrow>Discovered subdomains</Eyebrow>
            <h2 className="text-[13px] font-bold text-[#dce6f5]">{sub.data.resolvedCount} resolved of {sub.data.totalFound} found</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-left">
              <thead className="bg-[#0e1522] text-[9px] uppercase tracking-[.12em] text-[#68758b]">
                <tr>{['FQDN','IP Addresses','Source'].map(h=><th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {sub.data.subdomains.filter(s => s.resolved).slice(0, 30).map(s => (
                  <tr key={s.fqdn} className="border-t border-[#202a3b] text-[10px] hover:bg-white/[.018]">
                    <td className="mono px-4 py-3 text-[#c8d8ee]">{s.fqdn}</td>
                    <td className="px-4 py-3 text-[#8da0bd] mono text-[9px]">{s.ipAddresses.slice(0,2).join(', ')}{s.ipAddresses.length > 2 ? ` +${s.ipAddresses.length-2}` : ''}</td>
                    <td className="px-4 py-3"><span className="rounded-full border border-blue-300/15 bg-blue-400/10 px-2 py-0.5 text-[8px] font-semibold text-blue-300">{s.source}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sub.data.subdomains.filter(s => s.resolved).length > 30 && (
            <div className="border-t border-[#202a3b] px-4 py-2.5 text-[9px] text-[#69778e]">Showing 30 of {sub.data.resolvedCount} resolved — export CSV from the Subdomains page for the full list.</div>
          )}
        </Card>
      )}
    </div>
  );
}

function Assets() {
  const { scans } = useScanStore();
  const [query, setQuery] = useState('');

  // Build asset list from all scans — one row per unique domain/fqdn
  const assetMap = new Map<string, { host: string; kind: string; httpsAvailable: boolean; lastSeen: string; findingsCount: number; scanId: string }>();

  for (const scan of scans) {
    if (scan.type === 'tls') {
      const t = scan as TlsScanRecord;
      const existing = assetMap.get(t.domain);
      if (!existing || new Date(t.scannedAt) > new Date(existing.lastSeen)) {
        assetMap.set(t.domain, {
          host: t.domain,
          kind: 'TLS checked host',
          httpsAvailable: t.data.httpsRedirect?.httpsAvailable ?? false,
          lastSeen: t.scannedAt,
          findingsCount: t.findingsCount.critical + t.findingsCount.high + t.findingsCount.medium + t.findingsCount.low,
          scanId: t.id,
        });
      }
    } else {
      const s = scan as SubdomainScanRecord;
      for (const sub of s.data.subdomains.filter(x => x.resolved)) {
        if (!assetMap.has(sub.fqdn)) {
          assetMap.set(sub.fqdn, {
            host: sub.fqdn,
            kind: 'Subdomain',
            httpsAvailable: sub.httpsAvailable ?? false,
            lastSeen: s.scannedAt,
            findingsCount: 0,
            scanId: s.id,
          });
        }
      }
    }
  }

  const rows = [...assetMap.values()]
    .filter(a => a.host.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());

  const httpsCount = rows.filter(r => r.httpsAvailable).length;

  if (scans.length === 0) {
    return (
      <div className="fade-up">
        <PageHeading kicker="Assessment / attack surface" title="Assets" description="Hosts discovered across all your scans."/>
        <Card className="p-10 text-center">
          <Globe2 size={22} className="mx-auto text-[#435268]"/>
          <div className="mt-3 text-[12px] font-semibold text-[#dce6f5]">No assets yet</div>
          <p className="mt-2 text-[10px] text-[#75839a]">Run a subdomain enumeration to populate this page.</p>
          <Link href="/subdomains" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-4 py-2.5 text-[11px] font-bold text-[#08111f] hover:bg-[#64a1ff]"><Network size={14}/>Run enumeration</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="fade-up">
      <PageHeading kicker="Assessment / attack surface" title="Assets" description={`${rows.length} hosts discovered across ${scans.length} scan${scans.length !== 1 ? 's' : ''}.`}/>
      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <Card className="relative overflow-hidden p-4"><div className="absolute -right-5 -top-7 h-24 w-24 rounded-full bg-blue-400/[.035] blur-xl"/><div className="relative flex justify-between"><div><Eyebrow>Total hosts</Eyebrow><div className="text-[28px] font-bold tracking-[-.05em] text-[#e1eafa]">{rows.length}</div></div><span className="flex h-8 w-8 items-center justify-center rounded-lg text-blue-300 bg-blue-300/10"><Globe2 size={16}/></span></div></Card>
        <Card className="relative overflow-hidden p-4"><div className="absolute -right-5 -top-7 h-24 w-24 rounded-full bg-blue-400/[.035] blur-xl"/><div className="relative flex justify-between"><div><Eyebrow>HTTPS enabled</Eyebrow><div className="text-[28px] font-bold tracking-[-.05em] text-[#e1eafa]">{httpsCount}</div></div><span className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-300 bg-emerald-300/10"><LockKeyhole size={16}/></span></div></Card>
        <Card className="relative overflow-hidden p-4"><div className="absolute -right-5 -top-7 h-24 w-24 rounded-full bg-blue-400/[.035] blur-xl"/><div className="relative flex justify-between"><div><Eyebrow>With findings</Eyebrow><div className="text-[28px] font-bold tracking-[-.05em] text-[#e1eafa]">{rows.filter(r=>r.findingsCount>0).length}</div></div><span className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-300 bg-amber-300/10"><ShieldAlert size={16}/></span></div></Card>
      </div>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#242d40] p-4">
          <h2 className="text-[13px] font-bold text-[#dce6f5]">Discovered hosts</h2>
          <div className="flex items-center gap-2 rounded-lg border border-[#29354a] bg-[#0e1522] px-3">
            <Search size={13} className="text-[#71809a]"/>
            <input aria-label="Search assets" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filter hosts…" className="h-9 w-[180px] bg-transparent text-[10px] outline-none placeholder:text-[#59667d]"/>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead className="bg-[#0e1522] text-[9px] uppercase tracking-[.12em] text-[#68758b]">
              <tr>{['Host','Type','HTTPS','Last seen','Findings',''].map(x=><th key={x} className="px-4 py-3 font-semibold">{x}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.host} className="border-t border-[#202a3b] text-[10px] hover:bg-white/[.018]">
                  <td className="px-4 py-3.5"><div className="flex items-center gap-2.5"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#1b2a41] text-[#87b7ff]"><Globe2 size={13}/></span><span className="mono text-[#cbd7e8]">{a.host}</span></div></td>
                  <td className="text-[#93a0b5]">{a.kind}</td>
                  <td>{a.httpsAvailable ? <StatusPill tone="green"><LockKeyhole size={10}/>HTTPS</StatusPill> : <span className="text-[9px] text-[#55637a]">Unknown</span>}</td>
                  <td className="text-[#8794aa]">{relativeTime(a.lastSeen)}</td>
                  <td className="text-[#aab6c8]">{a.findingsCount > 0 ? <span className="text-amber-300">{a.findingsCount}</span> : <span className="text-[#55637a]">0</span>}</td>
                  <td className="pr-4 text-right"><Link href={`/scans/${a.scanId}`} className="text-[#83b3ff] hover:text-white">Scan <ChevronRight size={12} className="inline"/></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="py-10 text-center text-[10px] text-[#78869d]">No matching hosts.</div>}
        </div>
        <div className="border-t border-[#202a3b] px-4 py-3 text-[9px] text-[#69778e]">{rows.length} hosts · built from {scans.length} scan{scans.length !== 1 ? 's' : ''}</div>
      </Card>
    </div>
  );
}

function HistoryPage() {
  const { scans, deleteScan, clearAll } = useScanStore();
  const [typeFilter, setTypeFilter] = useState<'all' | 'tls' | 'subdomain'>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  const filtered = scans.filter(s => typeFilter === 'all' || s.type === typeFilter);

  if (scans.length === 0) {
    return (
      <div className="fade-up">
        <PageHeading kicker="Records / history" title="Scan history" description="All scans from this browser session, persisted across refreshes." action={<Link href="/scans/new" className="inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-3.5 py-2.5 text-[10px] font-bold text-[#08111f]"><Plus size={14}/>New scan</Link>}/>
        <Card className="p-10 text-center">
          <History size={22} className="mx-auto text-[#435268]"/>
          <div className="mt-3 text-[12px] font-semibold text-[#dce6f5]">No scan history yet</div>
          <p className="mt-2 text-[10px] text-[#75839a]">Every subdomain enumeration and TLS check you run will appear here and persist across page refreshes.</p>
          <div className="mt-5 flex justify-center gap-3">
            <Link href="/subdomains" className="inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-4 py-2.5 text-[11px] font-bold text-[#08111f] hover:bg-[#64a1ff]"><Network size={14}/>Subdomain scan</Link>
            <Link href="/tls" className="inline-flex items-center gap-2 rounded-lg border border-[#273249] bg-[#151c2b] px-4 py-2.5 text-[11px] font-semibold text-[#dce4f1] hover:bg-[#1b2537]"><LockKeyhole size={14}/>TLS check</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="fade-up">
      <PageHeading
        kicker="Records / history"
        title="Scan history"
        description={`${scans.length} scan${scans.length !== 1 ? 's' : ''} stored in this browser — persists across page refreshes.`}
        action={<Link href="/scans/new" className="inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-3.5 py-2.5 text-[10px] font-bold text-[#08111f]"><Plus size={14}/>New scan</Link>}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-[#253248] bg-[#0b121d] p-0.5">
          {(['all','tls','subdomain'] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`rounded-md px-3 py-1.5 text-[9px] font-bold capitalize transition ${typeFilter===t ? 'bg-[#263956] text-[#c8ddff]' : 'text-[#75849a] hover:text-[#d7e1ef]'}`}>
              {t === 'all' ? 'All' : t === 'tls' ? 'TLS checks' : 'Subdomains'}
            </button>
          ))}
        </div>
        {!confirmClear ? (
          <button onClick={() => setConfirmClear(true)} className="rounded-lg border border-red-400/20 bg-red-400/[.07] px-3 py-1.5 text-[9px] font-semibold text-red-300 hover:bg-red-400/[.12]">Clear all history</button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[#a0aec0]">Are you sure?</span>
            <button onClick={() => { clearAll(); setConfirmClear(false); }} className="rounded-md bg-red-500/80 px-2.5 py-1.5 text-[9px] font-bold text-white hover:bg-red-500">Yes, clear</button>
            <button onClick={() => setConfirmClear(false)} className="rounded-md border border-[#29354a] px-2.5 py-1.5 text-[9px] text-[#8a9ab5] hover:text-white">Cancel</button>
          </div>
        )}
      </div>

      <Card>
        <div className="divide-y divide-[#202a3b]">
          {filtered.map(scan => {
            const isTls = scan.type === 'tls';
            const tls = isTls ? (scan as TlsScanRecord) : null;
            const sub = !isTls ? (scan as SubdomainScanRecord) : null;
            const score = tls ? scoreFromTlsScan(tls) : null;
            return (
              <div key={scan.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_130px_140px_110px_auto_36px] md:items-center md:px-5">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isTls ? 'bg-violet-400/10 text-violet-300' : 'bg-blue-400/10 text-blue-300'}`}>
                    {isTls ? <LockKeyhole size={16}/> : <Network size={16}/>}
                  </div>
                  <div>
                    <div className="mono text-[10px] font-semibold text-[#d3deed]">{scan.domain}</div>
                    <div className="mt-1 text-[9px] text-[#77849a]"><span className="mono">{scan.id}</span> · {relativeTime(scan.scannedAt)}</div>
                  </div>
                </div>
                <StatusPill tone={isTls ? 'violet' : 'blue'}>{isTls ? 'TLS check' : 'Subdomains'}</StatusPill>
                <div>
                  {isTls && score != null ? (
                    <div className="text-[10px]"><span className="mono font-bold text-[#d3deed]">{score}</span><span className="text-[#68758b]">/100</span> · Grade <span className="font-bold text-[#d3deed]">{tls!.grade}</span></div>
                  ) : sub ? (
                    <div className="text-[10px] text-[#b7c3d5]">{sub.data.resolvedCount} resolved <span className="text-[#748199]">of {sub.data.totalFound}</span></div>
                  ) : null}
                </div>
                <StatusPill tone="green"><Check size={10}/>Complete</StatusPill>
                <Link href={`/scans/${scan.id}`} className="text-[9px] font-semibold text-[#81b1ff]">Details <ChevronRight size={12} className="inline"/></Link>
                <button onClick={() => deleteScan(scan.id)} aria-label="Delete scan" className="rounded-md p-1.5 text-[#586477] hover:bg-white/[.05] hover:text-red-300 transition">
                  <X size={13}/>
                </button>
              </div>
            );
          })}
        </div>
        {filtered.length === 0 && <div className="py-12 text-center text-[10px] text-[#78869d]">No scans match this filter.</div>}
        <div className="border-t border-[#202a3b] px-4 py-3 text-[9px] text-[#69778e]">{filtered.length} of {scans.length} scans · persisted in browser localStorage</div>
      </Card>
    </div>
  );
}

function Reports() {
  const { scans, allFindings } = useScanStore();
  const tlsScans  = scans.filter((s): s is TlsScanRecord => s.type === 'tls');
  const subScans  = scans.filter((s): s is SubdomainScanRecord => s.type === 'subdomain');
  const latestTls = tlsScans[0];
  const latestScore = latestTls ? scoreFromTlsScan(latestTls) : null;

  // ── report config state ────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [genError,   setGenError]   = useState('');
  const [domain,     setDomain]     = useState(() => scans[0]?.domain ?? '');
  const [assessor,   setAssessor]   = useState('WebSentinel Scanner');
  const [org,        setOrg]        = useState('WebSentinel Security');
  const [classif,    setClassif]    = useState<'Confidential'|'Internal'|'Public'>('Confidential');
  const [rawData,    setRawData]    = useState(true);

  const [sections, setSections] = useState({
    executiveSummary:     true,
    subdomainEnumeration: true,
    certTransparency:     true,
    dnsAnalysis:          true,
    tlsAssessment:        true,
    securityHeaders:      true,
    findings:             true,
    riskAssessment:       true,
    mitigation:           true,
    analytics:            true,
    historicalComparison: true,
    appendices:           true,
  });

  const sectionLabels: Record<keyof typeof sections, string> = {
    executiveSummary:     'Executive Summary',
    subdomainEnumeration: 'Subdomain Enumeration',
    certTransparency:     'Certificate Transparency',
    dnsAnalysis:          'DNS Analysis',
    tlsAssessment:        'HTTPS / TLS Assessment',
    securityHeaders:      'Security Headers',
    findings:             'Security Findings',
    riskAssessment:       'Risk Assessment',
    mitigation:           'Risk Mitigation',
    analytics:            'Analytics & Statistics',
    historicalComparison: 'Historical Comparison',
    appendices:           'Technical Appendices',
  };

  async function handleGenerate() {
    if (scans.length === 0) return;
    setGenerating(true);
    setGenError('');
    try {
      const { generateSecurityReport } = await import('@/lib/report-engine');
      await generateSecurityReport(scans, allFindings, {
        sections,
        targetDomain: domain || scans[0]?.domain || '',
        assessorName: assessor,
        organizationName: org,
        reportClassification: classif,
        includeRawData: rawData,
      });
    } catch (e: any) {
      setGenError(e?.message ?? 'Report generation failed.');
    } finally {
      setGenerating(false);
    }
  }

  const allOn  = Object.values(sections).every(Boolean);
  const allOff = Object.values(sections).every(v => !v);

  function toggleAll(on: boolean) {
    setSections(Object.fromEntries(Object.keys(sections).map(k => [k, on])) as typeof sections);
  }

  // ── stat helpers ───────────────────────────────────────────────────────────
  const totalSubs    = subScans.reduce((n, s) => n + s.data.totalFound, 0);
  const critCount    = allFindings.filter(f => f.severity === 'Critical').length;
  const highCount    = allFindings.filter(f => f.severity === 'High').length;

  return (
    <div className="fade-up">
      <PageHeading
        kicker="Records / reporting"
        title="Security Reports"
        description="Generate a comprehensive, professional-grade PDF security assessment report from your scan data."
        action={
          <Button
            onClick={handleGenerate}
            disabled={generating || scans.length === 0}
            className="gap-2"
          >
            {generating
              ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
              : <><Download size={14} /> Generate PDF</>}
          </Button>
        }
      />

      {scans.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2b3954] bg-[#162135] text-[#78aaff]">
            <FileText size={26} />
          </div>
          <div className="mt-4 text-[13px] font-bold text-[#dce6f5]">No scan data yet</div>
          <p className="mt-2 text-[10px] text-[#75839a]">Run subdomain or TLS scans to generate a report.</p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/subdomains" className="inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-4 py-2.5 text-[11px] font-bold text-[#08111f] hover:bg-[#64a1ff]">
              <Network size={14} /> Subdomains
            </Link>
            <Link href="/tls" className="inline-flex items-center gap-2 rounded-lg border border-[#273249] bg-[#151c2b] px-3.5 py-2.5 text-[11px] font-semibold text-[#dce4f1] hover:bg-[#1b2537]">
              <LockKeyhole size={14} /> TLS Check
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">

          {/* ── Left: data snapshot + section config ─────────────────────── */}
          <div className="space-y-4">

            {/* Data snapshot */}
            <Card className="overflow-hidden">
              <div className="border-b border-[#202a3c] px-5 py-4">
                <Eyebrow>Data snapshot</Eyebrow>
                <h2 className="text-[14px] font-bold text-[#dce6f5]">What's in this report</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
                {[
                  { label: 'TLS Score',         value: latestScore != null ? `${latestScore}/100` : '—', color: 'text-blue-300'    },
                  { label: 'Total Scans',        value: String(scans.length),                             color: 'text-violet-300'  },
                  { label: 'Subdomains Found',   value: String(totalSubs),                                color: 'text-sky-300'     },
                  { label: 'Open Findings',      value: String(allFindings.length),                       color: critCount > 0 ? 'text-red-300' : highCount > 0 ? 'text-amber-300' : 'text-emerald-300' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-lg border border-[#202a3c] bg-[#0d1521] p-3 text-center">
                    <div className={`text-[22px] font-bold tracking-[-.04em] ${color}`}>{value}</div>
                    <div className="mt-1 text-[9px] text-[#68758b]">{label}</div>
                  </div>
                ))}
              </div>

              {/* Scan list */}
              <div className="border-t border-[#202a3c] px-5 pb-5">
                <div className="mb-3 mt-4 text-[10px] font-bold text-[#dce6f5]">Scans included ({scans.length})</div>
                <div className="max-h-[160px] overflow-y-auto space-y-1.5">
                  {scans.map(s => {
                    const isTls = s.type === 'tls';
                    const tls = isTls ? (s as TlsScanRecord) : null;
                    return (
                      <div key={s.id} className="flex items-center gap-3 rounded-lg border border-[#1e2a3a] bg-[#0c1420] px-3 py-2">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${isTls ? 'bg-violet-400/10 text-violet-300' : 'bg-blue-400/10 text-blue-300'}`}>
                          {isTls ? <LockKeyhole size={11} /> : <Network size={11} />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="mono truncate text-[10px] font-semibold text-[#c4cfdf]">{s.id} · {s.domain}</div>
                          <div className="text-[8px] text-[#68758b]">{relativeTime(s.scannedAt)} · {isTls ? `Grade ${tls!.grade}` : `${(s as SubdomainScanRecord).data.totalFound} subdomains`}</div>
                        </div>
                        <StatusPill tone={isTls ? 'violet' : 'blue'}>{isTls ? 'TLS' : 'Sub'}</StatusPill>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>

            {/* Section toggles */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#202a3c] px-5 py-4">
                <div>
                  <Eyebrow>Report sections</Eyebrow>
                  <h2 className="text-[14px] font-bold text-[#dce6f5]">Choose what to include</h2>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleAll(true)}
                    disabled={allOn}
                    className="rounded-md border border-[#273249] bg-[#151c2b] px-2.5 py-1.5 text-[9px] font-semibold text-[#8da0bd] transition hover:border-[#354461] disabled:opacity-40"
                  >All on</button>
                  <button
                    onClick={() => toggleAll(false)}
                    disabled={allOff}
                    className="rounded-md border border-[#273249] bg-[#151c2b] px-2.5 py-1.5 text-[9px] font-semibold text-[#8da0bd] transition hover:border-[#354461] disabled:opacity-40"
                  >All off</button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-0 divide-y divide-[#1a2335] p-0 sm:grid-cols-2 sm:divide-y-0">
                {(Object.keys(sections) as Array<keyof typeof sections>).map((key, i) => {
                  const on = sections[key];
                  const sectionIcons: Record<string, any> = {
                    executiveSummary: BarChart3, subdomainEnumeration: Network,
                    certTransparency: ShieldCheck, dnsAnalysis: Globe2,
                    tlsAssessment: LockKeyhole, securityHeaders: Shield,
                    findings: ShieldAlert, riskAssessment: AlertTriangle,
                    mitigation: Zap, analytics: Activity,
                    historicalComparison: History, appendices: FileText,
                  };
                  const Icon = sectionIcons[key] ?? FileText;
                  return (
                    <label key={key}
                      className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition ${i % 2 === 0 ? 'sm:border-r sm:border-[#1a2335]' : ''} ${on ? 'bg-[#0d1a2b]' : 'opacity-60'}`}>
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${on ? 'bg-blue-400/10 text-blue-300' : 'bg-[#1a2537] text-[#455269]'}`}>
                        <Icon size={13} />
                      </span>
                      <span className="flex-1 text-[10px] font-semibold text-[#c4cfdf]">{sectionLabels[key]}</span>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={e => setSections(prev => ({ ...prev, [key]: e.target.checked }))}
                        className="h-3.5 w-3.5 accent-[#438cff]"
                        aria-label={sectionLabels[key]}
                      />
                    </label>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* ── Right: report config + generate ──────────────────────────── */}
          <div className="space-y-4">

            {/* Report metadata */}
            <Card className="p-5">
              <Eyebrow>Report configuration</Eyebrow>
              <h2 className="text-[13px] font-bold text-[#dce6f5] mb-4">Metadata</h2>
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-[9px] font-semibold text-[#8a9ab5]">Target domain</label>
                  <div className="flex items-center gap-2 rounded-lg border border-[#2b3850] bg-[#0d1420] px-3 focus-within:border-[#5e9aff]">
                    <Globe2 size={12} className="text-[#71809a]" />
                    <input
                      value={domain}
                      onChange={e => setDomain(e.target.value)}
                      placeholder="example.com"
                      className="h-9 w-full bg-transparent text-[11px] text-[#dce6f5] outline-none placeholder:text-[#546179]"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[9px] font-semibold text-[#8a9ab5]">Assessor name</label>
                  <input
                    value={assessor}
                    onChange={e => setAssessor(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#2b3850] bg-[#0d1420] px-3 text-[11px] text-[#dce6f5] outline-none focus:border-[#5e9aff]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[9px] font-semibold text-[#8a9ab5]">Organization</label>
                  <input
                    value={org}
                    onChange={e => setOrg(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#2b3850] bg-[#0d1420] px-3 text-[11px] text-[#dce6f5] outline-none focus:border-[#5e9aff]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[9px] font-semibold text-[#8a9ab5]">Classification</label>
                  <select
                    value={classif}
                    onChange={e => setClassif(e.target.value as typeof classif)}
                    className="h-9 w-full rounded-lg border border-[#2b3850] bg-[#0d1420] px-3 text-[11px] text-[#dce6f5] outline-none focus:border-[#5e9aff]"
                  >
                    <option value="Confidential">🔴 Confidential</option>
                    <option value="Internal">🟡 Internal</option>
                    <option value="Public">🟢 Public</option>
                  </select>
                </div>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#222d40] bg-[#0f1725] px-3.5 py-3">
                  <span className="flex-1 text-[10px] font-semibold text-[#cbd6e7]">Include raw scan metadata</span>
                  <input type="checkbox" checked={rawData} onChange={e => setRawData(e.target.checked)} className="h-3.5 w-3.5 accent-[#438cff]" />
                </label>
              </div>
            </Card>

            {/* What's included summary */}
            <Card className="p-4">
              <Eyebrow>Report will include</Eyebrow>
              <div className="mt-2 space-y-1.5">
                {[
                  { label: `${scans.length} scan${scans.length !== 1 ? 's' : ''}`, on: true },
                  { label: `${allFindings.length} security finding${allFindings.length !== 1 ? 's' : ''}`, on: allFindings.length > 0 },
                  { label: `${totalSubs} subdomain${totalSubs !== 1 ? 's' : ''}`, on: totalSubs > 0 },
                  { label: latestTls ? `TLS grade ${latestTls.grade} · score ${latestScore}/100` : 'No TLS data', on: !!latestTls },
                  { label: `${Object.values(sections).filter(Boolean).length}/12 sections`, on: true },
                ].map(({ label, on }) => (
                  <div key={label} className="flex items-center gap-2 text-[10px] text-[#9ab0c9]">
                    <Check size={12} className={on ? 'text-[#62c99a]' : 'text-[#455269]'} />
                    {label}
                  </div>
                ))}
              </div>
            </Card>

            {/* Generate button */}
            <Card className="p-5">
              <div className="mb-3 text-[10px] leading-5 text-[#8190a8]">
                Generates a multi-page PDF with all selected sections. The file downloads directly — no server upload.
              </div>

              {genError && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/[.07] px-3 py-2.5 text-[10px] text-red-300">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {genError}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={generating || scans.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#438cff] px-4 py-3.5 text-[12px] font-bold text-[#08111f] shadow-[0_6px_24px_rgba(55,129,255,.2)] transition hover:bg-[#64a1ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating
                  ? <><Loader2 size={15} className="animate-spin" /> Building PDF…</>
                  : <><Download size={15} /> Generate Security Report</>}
              </button>

              {generating && (
                <p className="mt-2.5 text-center text-[9px] text-[#68758b]">
                  Processing {scans.length} scan{scans.length !== 1 ? 's' : ''} — this may take a few seconds for large datasets…
                </p>
              )}
            </Card>

            {/* Format info */}
            <Card className="p-4">
              <Eyebrow>Report format</Eyebrow>
              <div className="mt-2 space-y-1.5 text-[9px] text-[#7a8899]">
                {[
                  'A4 portrait, professionally styled',
                  'Cover page with classification banner',
                  'Detailed findings with severity badges',
                  'Data tables for all scan results',
                  'Risk scoring and remediation guidance',
                  'Historical comparison across scans',
                  'Technical appendices with full metadata',
                ].map(l => (
                  <div key={l} className="flex items-center gap-2">
                    <span className="h-1 w-1 shrink-0 rounded-full bg-[#438cff]" />
                    {l}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
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
  const { active, renameWorkspace } = useWorkspace();
  const [wsName, setWsName] = useState(active.name);

  function handleSave() {
    renameWorkspace(active.id, wsName);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }
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
              <label className="text-[9px] text-[#77859c]">Workspace name
                <input value={wsName} onChange={e => setWsName(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[#2a354a] bg-[#0d1420] px-3 text-[10px] text-[#dce6f5] outline-none focus:border-[#5e9aff]"/>
              </label>
              <label className="text-[9px] text-[#77859c]">API base URL<input defaultValue={import.meta.env.VITE_API_URL ?? 'http://localhost:3000'} className="mono mt-2 h-10 w-full rounded-lg border border-[#2a354a] bg-[#0d1420] px-3 text-[10px] text-[#dce6f5] outline-none focus:border-[#5e9aff]"/></label>
            </div>
          </Card>
          <div className="flex justify-end">
            <Button onClick={handleSave}><Check size={14}/>Save preferences</Button>
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
  if (loc === '/signup') return <Signup />;

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
          <WorkspaceProvider>
            <ScanStoreProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                <RoutedErrorBoundary>
                  <DashboardRoutes />
                </RoutedErrorBoundary>
              </WouterRouter>
            </ScanStoreProvider>
          </WorkspaceProvider>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
