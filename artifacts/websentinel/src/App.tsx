import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter, Link } from 'wouter';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3,
  Bell, BookOpen, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp,
  Clock3, Code2, Download, ExternalLink, FileCode2, FileText, Filter, Globe2,
  History, Layers3, LockKeyhole, Menu, MoreHorizontal, Network, Plus, Radar,
  Search, Settings2, Shield, ShieldAlert, ShieldCheck, SlidersHorizontal,
  Sparkles, Terminal, X, Zap,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip,
  XAxis, YAxis,
} from 'recharts';

const queryClient = new QueryClient();

const navGroups = [
  { title: 'Workspace', items: [
    { label: 'Overview', href: '/overview', icon: BarChart3 },
    { label: 'New scan', href: '/scans/new', icon: Plus },
  ]},
  { title: 'Assessment', items: [
    { label: 'Findings', href: '/findings', icon: ShieldAlert, badge: '12' },
    { label: 'DOM inspector', href: '/dom-inspector', icon: Code2 },
    { label: 'Assets', href: '/assets', icon: Network },
  ]},
  { title: 'Records', items: [
    { label: 'Scan history', href: '/history', icon: History },
    { label: 'Reports', href: '/reports', icon: FileText },
  ]},
];

const sampleFindings = [
  { id:'F-0184', title:'Missing Content-Security-Policy header', asset:'app.northstar-labs.test', severity:'High', category:'Security headers', age:'2h ago', detail:'A Content-Security-Policy header was not observed in the illustrative response profile.' },
  { id:'F-0183', title:'Third-party script without integrity attribute', asset:'app.northstar-labs.test', severity:'Medium', category:'Supply chain', age:'2h ago', detail:'An external script reference is shown without a matching integrity attribute in this sample.' },
  { id:'F-0182', title:'Cookie missing SameSite directive', asset:'auth.northstar-labs.test', severity:'Medium', category:'Cookie configuration', age:'1d ago', detail:'The sample cookie configuration does not include a SameSite directive.' },
  { id:'F-0181', title:'Verbose server banner disclosed', asset:'api.northstar-labs.test', severity:'Low', category:'Information disclosure', age:'1d ago', detail:'A server banner is included in the sample response metadata.' },
  { id:'F-0180', title:'Potential DOM XSS pattern', asset:'app.northstar-labs.test', severity:'Critical', category:'Client-side', age:'3d ago', detail:'Illustrative source-to-sink pattern only; no site was inspected.' },
  { id:'F-0179', title:'HSTS max-age below recommended baseline', asset:'docs.northstar-labs.test', severity:'Low', category:'TLS & transport', age:'3d ago', detail:'The example HSTS value is shorter than the configured sample baseline.' },
];
const sampleScans = [
  { id:'WS-2048', domain:'northstar-labs.test', time:'Today, 09:42', status:'Complete', score:78, assets:8, findings:12, severity:'2 high' },
  { id:'WS-2047', domain:'northstar-labs.test', time:'Yesterday, 16:18', status:'Complete', score:74, assets:7, findings:15, severity:'3 high' },
  { id:'WS-2042', domain:'copperfield.dev', time:'Jun 12, 11:06', status:'Complete', score:86, assets:4, findings:6, severity:'1 high' },
];
const trend = [
  { day:'Jun 04', score:65 },{ day:'Jun 06', score:68 },{ day:'Jun 08', score:66 },
  { day:'Jun 10', score:72 },{ day:'Jun 12', score:70 },{ day:'Jun 14', score:76 },
  { day:'Jun 16', score:74 },{ day:'Jun 18', score:78 },
];
const assetRows = [
  { host:'app.northstar-labs.test', kind:'Web application', status:'HTTPS', last:'Today, 09:42', findings:7 },
  { host:'api.northstar-labs.test', kind:'API endpoint', status:'HTTPS', last:'Today, 09:42', findings:3 },
  { host:'auth.northstar-labs.test', kind:'Authentication', status:'HTTPS', last:'Today, 09:42', findings:2 },
  { host:'docs.northstar-labs.test', kind:'Documentation', status:'HTTPS', last:'Today, 09:42', findings:1 },
  { host:'status.northstar-labs.test', kind:'Status page', status:'HTTPS', last:'Yesterday, 16:18', findings:0 },
];

function Button({ children, className='', variant='primary', ...props }: any) {
  const styles = variant === 'primary'
    ? 'bg-[#438cff] text-[#08111f] hover:bg-[#64a1ff] border border-[#438cff]/70 font-bold shadow-[0_6px_24px_rgba(55,129,255,.13)]'
    : variant === 'quiet' ? 'bg-transparent border border-transparent text-[#a4aec2] hover:bg-white/[.05] hover:text-white'
      : variant === 'danger' ? 'bg-red-400/10 border border-red-400/20 text-red-300 hover:bg-red-400/15'
        : 'bg-[#151c2b] border border-[#273249] text-[#dce4f1] hover:bg-[#1b2537]';
  return <button {...props} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2.5 text-[12px] transition-all duration-200 disabled:opacity-45 disabled:cursor-not-allowed ${styles} ${className}`}>{children}</button>;
}

function Card({ children, className='' }: {children:ReactNode;className?:string}) {
  return <section className={`rounded-xl border border-[#202a3c] bg-[#111827]/90 ${className}`}>{children}</section>;
}
function Eyebrow({ children }: {children:ReactNode}) { return <div className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#75829b]">{children}</div>; }
function StatusPill({ children, tone='blue' }: {children:ReactNode;tone?:string}) {
  const map:any={blue:'border-blue-300/15 bg-blue-400/10 text-blue-300',green:'border-emerald-300/15 bg-emerald-400/10 text-emerald-300',red:'border-red-300/15 bg-red-400/10 text-red-300',amber:'border-amber-300/15 bg-amber-400/10 text-amber-300',violet:'border-violet-300/15 bg-violet-400/10 text-violet-300',muted:'border-slate-300/10 bg-slate-300/[.06] text-slate-400'};
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${map[tone]||map.blue}`}>{children}</span>;
}
function PrototypeBanner({ compact=false }: {compact?:boolean}) {
  return <div className={`flex items-center gap-2 border border-[#745bea]/25 bg-[#6850dc]/[.09] text-[#c4b9ff] ${compact?'rounded-md px-2.5 py-1.5 text-[9px]':'rounded-lg px-3 py-2 text-[10px]'}`}>
    <Sparkles size={13} className="shrink-0"/><span><b className="font-bold">PROTOTYPE DATA</b>{!compact && <span className="ml-1.5 text-[#a39acb]">Illustrative records only — not the result of a live assessment.</span>}</span>
  </div>;
}
function PageHeading({ kicker, title, description, action }: any) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div><Eyebrow>{kicker}</Eyebrow><h1 className="text-[26px] font-bold tracking-[-.04em] text-[#edf3ff] md:text-[30px]">{title}</h1>{description&&<p className="mt-1.5 max-w-2xl text-[12px] leading-5 text-[#8793a9]">{description}</p>}</div>
    {action}
  </div>;
}

function Sidebar({ mobileOpen, close }: {mobileOpen:boolean;close:()=>void}) {
  const [loc] = useLocation();
  return <>
    {mobileOpen&&<button aria-label="Close navigation overlay" onClick={close} className="fixed inset-0 z-40 bg-black/65 md:hidden"/>}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[246px] flex-col border-r border-[#202a3c] bg-[#0c111c] transition-transform duration-300 md:translate-x-0 ${mobileOpen?'translate-x-0':'-translate-x-full'}`}>
      <div className="flex h-[70px] items-center justify-between border-b border-[#202a3c] px-5">
        <Link href="/overview" onClick={close} className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-blue-300/20 bg-gradient-to-br from-blue-500/20 to-violet-500/20 text-blue-300"><Shield size={19}/><span className="absolute right-[6px] top-[7px] h-1 w-1 rounded-full bg-violet-300"/></div>
          <div><div className="text-[14px] font-extrabold tracking-[-.04em] text-[#edf3ff]">web<span className="text-[#62a1ff]">sentinel</span></div><div className="mono text-[8px] uppercase tracking-[.18em] text-[#61708a]">security workspace</div></div>
        </Link>
        <button onClick={close} className="rounded p-1 text-slate-500 md:hidden" aria-label="Close menu"><X size={18}/></button>
      </div>
      <div className="px-4 pt-5">
        <div className="flex w-full items-center gap-2.5 rounded-lg border border-[#273248] bg-[#121a29] px-3 py-2.5 text-left text-[11px] text-[#b5c0d3]" data-testid="text-current-workspace">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#263958] text-[10px] font-bold text-blue-200">N</span>
          <span className="flex-1"><span className="block font-semibold text-[#dce5f3]">Northstar Lab</span><span className="block text-[9px] text-[#738099]">Personal workspace</span></span>
          <ChevronDown size={13} className="text-[#68758b]"/>
        </div>
      </div>
      <nav className="nav-scroll flex-1 overflow-y-auto px-3 pt-6">
        {navGroups.map(group=><div key={group.title} className="mb-6">
          <div className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[.16em] text-[#55627a]">{group.title}</div>
          {group.items.map(item=>{const active=loc===item.href || (item.href==='/scans/new'&&loc.startsWith('/scans/new'));const Icon=item.icon;return <Link key={item.href} href={item.href} onClick={close} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ','-')}`} className={`group mb-1 flex items-center gap-3 rounded-lg px-3 py-[10px] text-[11px] font-semibold transition-colors ${active?'bg-[#1b2b43] text-[#8dbbff] shadow-[inset_2px_0_0_#5498ff]':'text-[#8591a7] hover:bg-white/[.04] hover:text-[#d5dfef]'}`}><Icon size={16} strokeWidth={1.8}/><span className="flex-1">{item.label}</span>{item.badge&&<span className="rounded-md bg-[#242e41] px-1.5 py-0.5 text-[9px] text-[#9baac2]">{item.badge}</span>}</Link>})}
        </div>)}
      </nav>
      <div className="border-t border-[#202a3c] p-3">
        <Link href="/settings" onClick={close} className={`mb-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[11px] font-semibold ${loc==='/settings'?'bg-[#1b2b43] text-[#8dbbff]':'text-[#8591a7] hover:bg-white/[.04]'}`}><Settings2 size={16}/>Settings</Link>
        <div className="rounded-lg border border-[#202a3c] bg-[#111827] p-3"><div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-[#64d8a3] shadow-[0_0_12px_#64d8a355]"/><span className="text-[10px] font-semibold text-[#c4cfdf]">Prototype environment</span></div><p className="mt-1.5 pl-4 text-[9px] leading-4 text-[#69758b]">No scan engine connected. No target requests are made.</p></div>
      </div>
    </aside>
  </>;
}

function Shell({ children }: {children:ReactNode}) {
  const [open,setOpen]=useState(false);
  return <div className="app-bg min-h-[100dvh]"><Sidebar mobileOpen={open} close={()=>setOpen(false)}/><div className="min-h-[100dvh] md:pl-[246px]">
    <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-[#202a3c]/90 bg-[#0c111c]/90 px-4 backdrop-blur-xl md:px-7">
      <div className="flex items-center gap-3"><button onClick={()=>setOpen(true)} aria-label="Open navigation" className="rounded-md p-2 text-[#9aa8be] hover:bg-white/5 md:hidden"><Menu size={18}/></button><div className="hidden items-center gap-2 text-[10px] text-[#68758c] sm:flex"><span>Northstar Lab</span><ChevronRight size={12}/><span className="text-[#b4c0d2]">Security overview</span></div><div className="sm:hidden text-[11px] font-semibold text-[#dce5f3]">WebSentinel</div></div>
      <div className="flex items-center gap-2"><div className="hidden items-center gap-2 rounded-md border border-[#202a3c] bg-[#111827] px-2.5 py-1.5 text-[9px] text-[#8995aa] sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#67d5a0]"/>Local prototype</div><div className="relative rounded-lg p-2 text-[#8591a7]" aria-label="Notifications"><Bell size={16}/><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#8b79f6]"/></div><div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#33415c] bg-[#1a263a] text-[10px] font-bold text-[#b4ccf4]">NS</div></div>
    </header>
    <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-7 md:py-8">{children}</main>
  </div></div>;
}

function Landing() {
  return <div className="app-bg grid-texture min-h-[100dvh] overflow-hidden">
    <header className="relative z-10 mx-auto flex max-w-[1200px] items-center justify-between px-5 py-5 md:px-8">
      <Link href="/" className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-300/20 bg-blue-400/10 text-blue-300"><Shield size={19}/></span><span className="text-[14px] font-extrabold tracking-[-.04em]">web<span className="text-[#62a1ff]">sentinel</span></span></Link>
      <div className="flex items-center gap-3"><span className="hidden rounded-full border border-[#725fe2]/30 bg-[#725fe2]/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.12em] text-[#b8adff] sm:inline-flex">Prototype environment</span><Link href="/overview" className="inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-4 py-2.5 text-[11px] font-bold text-[#08111f] hover:bg-[#64a1ff]" data-testid="link-enter-workspace">Open workspace<ArrowRight size={14}/></Link></div>
    </header>
    <section className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-5 pb-20 pt-14 md:grid-cols-[1.08fr_.92fr] md:px-8 md:pb-28 md:pt-24">
      <div className="absolute -left-24 top-12 h-[330px] w-[330px] rounded-full bg-blue-500/[.08] blur-[100px]"/>
      <div className="relative fade-up"><div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#293653] bg-[#111a2b]/85 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[.14em] text-[#93a4bf]"><span className="h-1.5 w-1.5 rounded-full bg-[#7e70f4]"/>Security assessment workspace</div>
        <h1 className="max-w-[650px] text-[42px] font-extrabold leading-[1.04] tracking-[-.065em] text-[#eef4ff] sm:text-[54px] md:text-[66px]">See the surface.<br/><span className="bg-gradient-to-r from-[#72b6ff] via-[#8298ff] to-[#b290ff] bg-clip-text text-transparent">Understand the risk.</span></h1>
        <p className="mt-6 max-w-[480px] text-[13px] leading-6 text-[#9ba8bd]">A focused workspace for exploring website security posture, organizing assets, and making findings easier to act on.</p>
        <div className="mt-8 flex flex-wrap gap-3"><Link href="/overview" className="inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-5 py-3 text-[11px] font-bold text-[#08111f] shadow-[0_8px_28px_rgba(63,141,255,.2)] transition hover:-translate-y-0.5 hover:bg-[#64a1ff]">Enter prototype <ArrowRight size={15}/></Link><Link href="/scans/new" className="inline-flex items-center gap-2 rounded-lg border border-[#2b3851] bg-[#111827] px-5 py-3 text-[11px] font-bold text-[#cbd6e6] hover:bg-[#172134]">Explore scan setup <ChevronRight size={14}/></Link></div>
        <div className="mt-8 flex items-center gap-2 text-[10px] text-[#76839a]"><ShieldCheck size={14} className="text-[#68d8ac]"/>Safe preview mode <span className="text-[#424d62]">·</span> No scans run, no target requests</div>
      </div>
      <div className="relative mx-auto w-full max-w-[490px] fade-up" style={{animationDelay:'.12s'}}>
        <div className="absolute -inset-8 rounded-[40px] bg-gradient-to-br from-blue-500/10 via-transparent to-violet-500/10 blur-2xl"/>
        <div className="relative overflow-hidden rounded-2xl border border-[#34415b] bg-[#101827]/95 shadow-[0_30px_100px_rgba(0,0,0,.42)]">
          <div className="flex items-center justify-between border-b border-[#242f43] px-4 py-3"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#66d6a2]"/><span className="text-[10px] font-semibold text-[#b8c4d7]">Assessment snapshot</span></div><StatusPill tone="violet">Illustrative</StatusPill></div>
          <div className="p-5"><div className="flex items-end justify-between"><div><Eyebrow>Security score</Eyebrow><div className="flex items-baseline gap-2"><span className="text-[52px] font-bold tracking-[-.07em] text-[#edf4ff]">78</span><span className="text-[11px] text-[#76839a]">/ 100</span></div></div><div className="mb-2 rounded-lg border border-emerald-300/15 bg-emerald-300/[.07] px-2.5 py-2 text-right"><div className="flex items-center gap-1 text-[10px] font-bold text-emerald-300"><ArrowUpRight size={13}/>+4 pts</div><span className="text-[8px] text-[#74829a]">vs. prior sample</span></div></div>
            <div className="mt-4 grid grid-cols-3 gap-2">{[['Assets','08'],['Findings','12'],['High risk','02']].map(([a,b])=><div key={a} className="rounded-lg border border-[#252f42] bg-[#141d2d] p-3"><div className="text-[9px] text-[#76839a]">{a}</div><div className="mt-1 text-[18px] font-bold text-[#d9e4f4]">{b}</div></div>)}</div>
            <div className="mt-5 rounded-xl border border-[#27334a] bg-[#0d1523] p-4"><div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-semibold text-[#c5d0e1]">Risk by severity</span><span className="mono text-[8px] text-[#65728a]">SAMPLE DATA</span></div><div className="space-y-2.5">{[['Critical',1,'#ef727a'],['High',2,'#f1a95e'],['Medium',5,'#9f83f5'],['Low',4,'#559df5']].map(([name,count,color]:any)=><div className="flex items-center gap-3" key={name}><span className="w-14 text-[9px] text-[#8793a8]">{name}</span><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#222c3d]"><div className="h-full rounded-full" style={{width:`${count*12}%`,backgroundColor:color}}/></div><span className="mono w-4 text-right text-[9px] text-[#adb8ca]">{count}</span></div>)}</div></div>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-violet-300/15 bg-violet-400/[.06] px-3 py-2.5 text-[9px] leading-4 text-[#b8addf]"><AlertTriangle size={13} className="shrink-0 text-[#a494ff]"/>Every record shown is illustrative. Assessment engine is not connected.</div>
          </div>
        </div>
      </div>
    </section>
    <section className="border-y border-[#202a3c] bg-[#0d1421]/70"><div className="mx-auto grid max-w-[1200px] gap-6 px-5 py-9 sm:grid-cols-3 md:px-8">{[[Radar,'Map the surface','Organize domains and subdomains in one place.'],[ShieldAlert,'Prioritize findings','Severity-aware views make sample issues easy to navigate.'],[FileText,'Share the context','Preview a clearly labeled report before browser-based export.']].map(([Icon,title,desc]:any)=><div key={title} className="flex gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2b3954] bg-[#162135] text-[#78aaff]"><Icon size={17}/></span><div><div className="text-[11px] font-bold text-[#d4dfef]">{title}</div><p className="mt-1 text-[10px] leading-4 text-[#78869d]">{desc}</p></div></div>)}</div></section>
    <footer className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-5 py-6 text-[9px] text-[#69758b] md:px-8"><span>WebSentinel · Security workspace prototype</span><span>Sample content only · No live assessment capability</span></footer>
  </div>;
}

function Overview() {
  return <div className="fade-up">
    <PrototypeBanner/>
    <PageHeading kicker="Workspace / overview" title="Security overview" description="A quick read on your illustrative assessment workspace." action={<Link href="/scans/new" className="inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-4 py-2.5 text-[11px] font-bold text-[#08111f] hover:bg-[#64a1ff]"><Plus size={15}/>New scan</Link>}/>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={ShieldCheck} label="Security score" value="78" suffix="/ 100" trend="+4 pts" tone="green"/>
      <Metric icon={Radar} label="Sample scans" value="14" suffix="total" trend="2 this week" tone="blue"/>
      <Metric icon={Globe2} label="Discovered assets" value="23" suffix="hosts" trend="+3 this month" tone="violet"/>
      <Metric icon={AlertTriangle} label="Open findings" value="12" suffix="issues" trend="2 high severity" tone="amber"/>
    </div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_.85fr]">
      <Card className="p-4 md:p-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><Eyebrow>Posture trend</Eyebrow><h2 className="text-[14px] font-bold text-[#dce6f5]">Security score over time</h2></div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#6ea9ff]"/><span className="text-[9px] text-[#8794aa]">Illustrative score</span><span className="ml-2 rounded-md border border-[#2a354a] px-2 py-1 text-[9px] text-[#9ba7bb]">Last 14 days <ChevronDown size={11} className="inline"/></span></div></div>
        <div className="h-[230px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{top:5,right:8,left:-25,bottom:0}}><defs><linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5798ff" stopOpacity={0.28}/><stop offset="95%" stopColor="#5798ff" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#202a3b" vertical={false}/><XAxis dataKey="day" tick={{fill:'#68758c',fontSize:9}} axisLine={false} tickLine={false} dy={8}/><YAxis domain={[55,90]} tick={{fill:'#68758c',fontSize:9}} axisLine={false} tickLine={false}/><ChartTooltip contentStyle={{background:'#151e2e',border:'1px solid #2b3850',borderRadius:8,fontSize:10,color:'#dce6f5'}}/><Area type="monotone" dataKey="score" stroke="#71aaff" strokeWidth={2} fill="url(#scoreFill)" activeDot={{r:4,fill:'#9bc5ff',stroke:'#12203a'}}/></AreaChart></ResponsiveContainer></div>
        <div className="mt-2 flex items-center gap-2 text-[9px] text-[#738099]"><Activity size={12} className="text-[#68a5ff]"/>Scores are sample records, not computed from a live scan.</div>
      </Card>
      <Card className="p-4 md:p-5"><div className="flex items-start justify-between"><div><Eyebrow>Current sample</Eyebrow><h2 className="text-[14px] font-bold text-[#dce6f5]">Findings by severity</h2></div><Link href="/findings" className="text-[10px] font-semibold text-[#80b3ff] hover:text-white">View all <ArrowRight size={12} className="inline"/></Link></div>
        <div className="mt-5 space-y-4">{[['Critical',1,'#ed747d'],['High',2,'#efab65'],['Medium',5,'#a187f4'],['Low',4,'#5a9df4']].map(([label,count,color]:any)=><div key={label}><div className="mb-1.5 flex justify-between text-[10px]"><span className="text-[#abb7ca]">{label}</span><span className="mono text-[#cbd5e4]">{count}</span></div><div className="h-[6px] rounded-full bg-[#222b3c]"><div className="h-full rounded-full" style={{width:`${count*13}%`,background:color}}/></div></div>)}</div>
        <div className="mt-6 grid grid-cols-2 gap-2 border-t border-[#242d40] pt-4"><div><span className="block text-[9px] text-[#708099]">Top category</span><span className="mt-1 block text-[10px] font-semibold text-[#cbd5e5]">Security headers</span></div><div><span className="block text-[9px] text-[#708099]">Latest sample</span><span className="mono mt-1 block text-[10px] text-[#cbd5e5]">WS-2048</span></div></div>
      </Card>
    </div>
    <div className="mt-4"><RecentScans/></div>
  </div>;
}
function Metric({icon:Icon,label,value,suffix,trend,tone}:any) {
  const colors:any={green:'text-emerald-300 bg-emerald-300/10',blue:'text-blue-300 bg-blue-300/10',violet:'text-violet-300 bg-violet-300/10',amber:'text-amber-300 bg-amber-300/10'};
  return <Card className="relative overflow-hidden p-4"><div className="absolute -right-5 -top-7 h-24 w-24 rounded-full bg-blue-400/[.035] blur-xl"/><div className="relative flex justify-between"><div><Eyebrow>{label}</Eyebrow><div className="flex items-baseline gap-2"><span className="text-[28px] font-bold tracking-[-.05em] text-[#e1eafa]">{value}</span><span className="text-[10px] text-[#748198]">{suffix}</span></div></div><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors[tone]}`}><Icon size={16}/></span></div><div className="mt-3 flex items-center gap-1.5 text-[9px] text-[#8390a6]"><span className={tone==='amber'?'text-amber-300':'text-emerald-300'}>{trend}</span><span>·</span><span>sample</span></div></Card>;
}
function RecentScans() {
  return <Card><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#242d40] px-4 py-4 md:px-5"><div><Eyebrow>Workspace activity</Eyebrow><h2 className="text-[14px] font-bold text-[#dce6f5]">Recent sample scans</h2></div><Link href="/history" className="text-[10px] font-semibold text-[#80b3ff] hover:text-white">View scan history <ArrowRight size={12} className="inline"/></Link></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead className="bg-[#0e1522] text-[9px] uppercase tracking-[.12em] text-[#68758b]"><tr>{['Scan ID','Target','Status','Score','Assets','Findings',''].map(x=><th key={x} className="px-4 py-3 font-semibold md:px-5">{x}</th>)}</tr></thead><tbody>{sampleScans.map(row=><tr key={row.id} className="border-t border-[#202a3b] text-[10px] hover:bg-white/[.018]"><td className="mono px-4 py-3.5 text-[#8da0bd] md:px-5">{row.id}</td><td className="font-semibold text-[#cdd8e9]">{row.domain}<div className="mt-1 font-normal text-[#6d7b93]">{row.time}</div></td><td><StatusPill tone="green"><Check size={10}/>{row.status}</StatusPill></td><td className="mono text-[#d3deed]">{row.score}<span className="text-[#67748b]">/100</span></td><td className="text-[#9eabc0]">{row.assets}</td><td className="text-[#9eabc0]">{row.findings} <span className="text-[#65728a]">· {row.severity}</span></td><td className="pr-4 text-right"><Link href={`/scans/${row.id}`} className="text-[#83b3ff] hover:text-white">Details <ChevronRight size={12} className="inline"/></Link></td></tr>)}</tbody></table></div><div className="border-t border-[#202a3b] px-4 py-2.5 text-[9px] text-[#6f7c93] md:px-5">All scan records above are illustrative and were not produced by scanning.</div></Card>;
}

function NewScan() {
  const [url,setUrl]=useState('');const [authorized,setAuthorized]=useState(false);const [message,setMessage]=useState('');
  const [toggles,setToggles]=useState({subdomains:true,tls:true,headers:true,zap:false,dom:true});
  const options:any=[['subdomains','Subdomain discovery','Include known subdomain candidates in the assessment scope.',Globe2],['tls','HTTPS / TLS checks','Review transport security configuration.',LockKeyhole],['headers','Security headers','Check common browser security response headers.',ShieldCheck],['zap','OWASP ZAP baseline','A non-invasive baseline profile.',Radar],['dom','JavaScript DOM analysis','Inspect client-side source and sink patterns.',Code2]];
  const submit=(e:any)=>{e.preventDefault();if(!url.trim()){setMessage('Add a website URL to continue.');return;}if(!/^https?:\/\/.+\..+/i.test(url.trim())){setMessage('Enter a valid URL beginning with https:// or http://.');return;}if(!authorized){setMessage('Confirm you are authorized to assess this website.');return;}setMessage('Prototype only — the scan engine is not connected. No scan was started and no requests were sent.');};
  return <div className="fade-up"><PrototypeBanner/><PageHeading kicker="Assessment / setup" title="Configure a new scan" description="Define an authorized assessment profile. This prototype validates the form only; it does not run scans."/>
    <div className="grid gap-4 xl:grid-cols-[1fr_330px]"><Card className="p-5 md:p-7"><form onSubmit={submit}>
      <div><Eyebrow>01 — Target</Eyebrow><label htmlFor="target-url" className="mb-2 block text-[12px] font-bold text-[#dce6f5]">Website URL</label><div className="flex items-center gap-2 rounded-lg border border-[#2b3850] bg-[#0d1420] px-3 focus-within:border-[#5e9aff]"><Globe2 size={15} className="text-[#71809a]"/><input id="target-url" data-testid="input-target-url" value={url} onChange={e=>{setUrl(e.target.value);setMessage('')}} placeholder="https://example.com" className="h-11 w-full bg-transparent text-[12px] text-[#dce6f5] outline-none placeholder:text-[#546179]"/></div><p className="mt-2 text-[9px] text-[#6f7d94]">Use a domain you own or have explicit permission to assess.</p></div>
      <div className="my-6 border-t border-[#222d41]"/>
      <div><Eyebrow>02 — Checks</Eyebrow><div className="mb-3 text-[12px] font-bold text-[#dce6f5]">Assessment modules</div><div className="space-y-2">{options.map(([key,title,desc,Icon]:any)=><label key={key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#222d40] bg-[#0f1725] px-3.5 py-3 transition hover:border-[#354461]"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1b2a41] text-[#83aff1]"><Icon size={15}/></span><span className="flex-1"><span className="block text-[10px] font-semibold text-[#cbd6e7]">{title}</span><span className="mt-1 block text-[9px] text-[#75839a]">{desc}</span></span><input aria-label={title} data-testid={`toggle-${key}`} type="checkbox" checked={toggles[key as keyof typeof toggles]} onChange={e=>setToggles({...toggles,[key]:e.target.checked})} className="h-4 w-4 accent-[#629dff]"/></label>)}</div></div>
      <div className="my-6 border-t border-[#222d41]"/>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#725fe2]/25 bg-[#6552d1]/[.07] p-4"><input type="checkbox" data-testid="checkbox-authorization" checked={authorized} onChange={e=>{setAuthorized(e.target.checked);setMessage('')}} className="mt-0.5 h-4 w-4 accent-[#927dff]"/><span><span className="block text-[10px] font-bold text-[#d0c8ff]">I confirm I am authorized to assess this website.</span><span className="mt-1 block text-[9px] leading-4 text-[#8f89b5]">Authorization is required to enable the prototype form submission. This confirmation does not initiate any network activity.</span></span></label>
      {message&&<div role="status" data-testid="status-scan-submit" className={`mt-4 rounded-lg border px-3.5 py-3 text-[10px] leading-5 ${message.startsWith('Prototype')?'border-violet-300/20 bg-violet-300/[.07] text-violet-200':'border-amber-300/20 bg-amber-300/[.06] text-amber-200'}`}><AlertTriangle size={14} className="mr-2 inline"/>{message}</div>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><span className="text-[9px] text-[#67758d]">Setup is local to this prototype session.</span><Button type="submit" data-testid="button-submit-scan" disabled={!authorized}><Radar size={14}/>Review scan setup</Button></div>
    </form></Card>
    <div className="space-y-4"><Card className="p-4"><Eyebrow>Before you continue</Eyebrow><div className="flex gap-2.5"><div className="mt-0.5 text-[#92a7c7]"><CircleHelp size={16}/></div><div><div className="text-[11px] font-bold text-[#cdd8e9]">Prototype boundary</div><p className="mt-1.5 text-[10px] leading-[1.65] text-[#8190a8]">The controls below are UI examples. No scanner, ZAP integration, target connection, or ML analysis is implemented.</p></div></div></Card><Card className="p-4"><Eyebrow>Configuration snapshot</Eyebrow><div className="space-y-3">{options.map(([key,title]:any)=><div className="flex items-center justify-between text-[10px]" key={key}><span className="text-[#8794aa]">{title}</span><span className={toggles[key as keyof typeof toggles]?'text-[#7fb0ff]':'text-[#58667d]'}>{toggles[key as keyof typeof toggles]?'Included':'Off'}</span></div>)}</div><div className="mt-4 border-t border-[#242d40] pt-3 text-[9px] text-[#67758d]">No results are generated from this configuration.</div></Card></div></div>
  </div>;
}

function Findings() {
  const [query,setQuery]=useState('');const [severity,setSeverity]=useState('All severities');
  const list=sampleFindings.filter(f=>(severity==='All severities'||f.severity===severity)&&`${f.title} ${f.asset} ${f.category} ${f.id}`.toLowerCase().includes(query.toLowerCase()));
  const tone:any={Critical:'red',High:'amber',Medium:'violet',Low:'blue'};
  return <div className="fade-up"><PrototypeBanner/><PageHeading kicker="Assessment / findings" title="Findings" description="Review sample issues and their associated assets. These are illustrative, not verified vulnerabilities." action={<Button variant="secondary" onClick={()=>{setQuery('');setSeverity('All severities')}}><Filter size={14}/>Reset filters</Button>}/>
    <div className="mb-4 grid gap-3 sm:grid-cols-4">{[['Critical','01','red'],['High','02','amber'],['Medium','05','violet'],['Low','04','blue']].map(([name,num,toneName]:any)=><Card key={name} className="flex items-center justify-between px-4 py-3"><div><div className="text-[9px] text-[#77859c]">{name}</div><div className="mt-1 text-[19px] font-bold text-[#dbe5f3]">{num}</div></div><StatusPill tone={toneName}>Sample</StatusPill></Card>)}</div>
    <Card><div className="flex flex-wrap gap-2 border-b border-[#242d40] p-4"><div className="flex min-w-[210px] flex-1 items-center gap-2 rounded-lg border border-[#29354a] bg-[#0e1522] px-3"><Search size={14} className="text-[#71809a]"/><input aria-label="Search findings" data-testid="input-findings-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search findings, assets, categories..." className="h-9 w-full bg-transparent text-[10px] outline-none placeholder:text-[#59667d]"/></div><select aria-label="Filter by severity" data-testid="select-severity-filter" value={severity} onChange={e=>setSeverity(e.target.value)} className="rounded-lg border border-[#29354a] bg-[#0e1522] px-3 text-[10px] text-[#b7c3d6] outline-none"><option>All severities</option>{['Critical','High','Medium','Low'].map(x=><option key={x}>{x}</option>)}</select></div>
      <div className="divide-y divide-[#202a3b]">{list.map(f=><div key={f.id} className="grid gap-3 px-4 py-4 transition hover:bg-white/[.018] md:grid-cols-[75px_1fr_160px_112px] md:items-center md:px-5"><div className="mono text-[9px] text-[#73829b]">{f.id}<div className="mt-1 text-[#57657d]">{f.age}</div></div><div><div className="text-[11px] font-semibold text-[#d3deed]">{f.title}</div><div className="mt-1.5 text-[9px] text-[#75839a]">{f.category} <span className="px-1 text-[#3e4b61]">·</span> <span className="mono">{f.asset}</span></div><p className="mt-2 max-w-[760px] text-[9px] leading-4 text-[#78869d]">{f.detail}</p></div><StatusPill tone={tone[f.severity]}>{f.severity} severity</StatusPill><button onClick={()=>alert(`${f.id}: Illustrative finding details only. No target assessment was performed.`)} className="justify-self-start text-[9px] font-semibold text-[#86b4ff] hover:text-white md:justify-self-end">View sample detail <ChevronRight size={12} className="inline"/></button></div>)}
      {!list.length&&<div className="px-6 py-16 text-center"><Search size={22} className="mx-auto text-[#53617a]"/><div className="mt-3 text-[12px] font-semibold text-[#c9d5e6]">No matching findings</div><p className="mt-1 text-[10px] text-[#77859c]">Try a different search or severity filter.</p></div>}</div>
      <div className="border-t border-[#202a3b] px-4 py-3 text-[9px] text-[#69778e]">Showing {list.length} of {sampleFindings.length} illustrative records</div>
    </Card>
  </div>;
}

function ScanDetails() {
  return <div className="fade-up"><PrototypeBanner/><PageHeading kicker="Assessment / scan details" title="northstar-labs.test" description="Sample scan WS-2048 · Today at 09:42" action={<Link href="/history" className="inline-flex items-center gap-2 rounded-lg border border-[#29354a] bg-[#151c2b] px-3 py-2.5 text-[10px] font-semibold text-[#b9c5d8]"><History size={14}/>Scan history</Link>}/>
    <Card className="mb-4 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#252f43] px-4 py-4 md:px-5"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300"><CheckCircle2 size={18}/></span><div><div className="text-[12px] font-bold text-[#dce6f5]">Sample status: Complete</div><div className="mono mt-1 text-[9px] text-[#748199]">WS-2048 · COMPLETED 09:44 · ILLUSTRATIVE</div></div></div><StatusPill tone="violet">No live scan performed</StatusPill></div><div className="grid gap-4 p-4 sm:grid-cols-4 md:p-5">{[['Sample score','78 / 100'],['Assets','8 discovered'],['Findings','12 recorded'],['Duration','2m 18s (sample)']].map(([l,v])=><div key={l}><div className="text-[9px] text-[#748199]">{l}</div><div className="mt-1.5 text-[14px] font-bold text-[#d8e2f0]">{v}</div></div>)}</div><div className="border-t border-[#252f43] px-4 py-3 md:px-5"><div className="mb-2 flex justify-between text-[9px] text-[#708098]"><span>Sample completion timeline</span><span>100%</span></div><div className="h-1.5 rounded-full bg-[#242f42]"><div className="h-full w-full rounded-full bg-gradient-to-r from-[#478cff] to-[#8675ef]"/></div></div></Card>
    <div className="grid gap-4 xl:grid-cols-[1fr_330px]"><Card><div className="flex items-center justify-between border-b border-[#252f43] px-4 py-4"><div><Eyebrow>Recorded output</Eyebrow><h2 className="text-[13px] font-bold text-[#dce6f5]">Sample findings</h2></div><Link href="/findings" className="text-[10px] text-[#83b3ff]">All findings <ArrowRight size={12} className="inline"/></Link></div>{sampleFindings.slice(0,4).map(f=><div key={f.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#202a3b] px-4 py-3"><div><div className="text-[10px] font-semibold text-[#cbd6e7]">{f.title}</div><div className="mt-1 mono text-[8px] text-[#718099]">{f.asset}</div></div><StatusPill tone={f.severity==='High'?'amber':f.severity==='Critical'?'red':f.severity==='Medium'?'violet':'blue'}>{f.severity}</StatusPill></div>)}<div className="p-4"><Link href="/assets" className="text-[10px] text-[#83b3ff]">Browse sample assets <ArrowRight size={12} className="inline"/></Link></div></Card>
      <Card className="p-4"><Eyebrow>Assessment profile</Eyebrow><div className="text-[12px] font-bold text-[#dce6f5]">Configured modules</div><div className="mt-4 space-y-3">{['Subdomain discovery','HTTPS / TLS checks','Security headers','JavaScript DOM analysis'].map((s,i)=><div key={s} className="flex items-center gap-2 text-[10px] text-[#9caac0]"><Check size={13} className="text-[#63c99b]"/>{s}<span className="ml-auto mono text-[8px] text-[#66748c]">SAMPLE</span></div>)}</div><div className="mt-5 rounded-lg border border-violet-300/15 bg-violet-300/[.06] p-3 text-[9px] leading-4 text-[#b8addf]">Status, timing, scores and outputs are seeded prototype content. No assessment was run.</div></Card>
    </div>
  </div>;
}

function Assets() {
  const [query,setQuery]=useState('');
  const rows=assetRows.filter(a=>`${a.host} ${a.kind}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="fade-up"><PrototypeBanner/><PageHeading kicker="Assessment / attack surface" title="Assets" description="Known hosts linked to the sample workspace. Discovery is not connected." action={<Button variant="secondary" onClick={()=>setQuery('')}><SlidersHorizontal size={14}/>Clear search</Button>}/>
    <div className="grid gap-3 sm:grid-cols-3"><Metric icon={Globe2} label="Sample assets" value="23" suffix="hosts" trend="across 4 domains" tone="blue"/><Metric icon={LockKeyhole} label="HTTPS enabled" value="21" suffix="91.3%" trend="sample record" tone="green"/><Metric icon={ShieldAlert} label="With findings" value="16" suffix="hosts" trend="12 open issues" tone="amber"/></div>
    <Card className="mt-4"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#242d40] p-4"><div><Eyebrow>Northstar Lab / northstar-labs.test</Eyebrow><h2 className="text-[13px] font-bold text-[#dce6f5]">Discovered hosts <span className="ml-1 text-[10px] font-normal text-[#738199]">(sample)</span></h2></div><div className="flex items-center gap-2 rounded-lg border border-[#29354a] bg-[#0e1522] px-3"><Search size={13} className="text-[#71809a]"/><input aria-label="Search assets" data-testid="input-assets-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filter hosts..." className="h-9 w-[180px] bg-transparent text-[10px] outline-none placeholder:text-[#59667d]"/></div></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead className="bg-[#0e1522] text-[9px] uppercase tracking-[.12em] text-[#68758b]"><tr>{['Host','Asset type','Transport','Last seen','Findings'].map(x=><th key={x} className="px-4 py-3 font-semibold">{x}</th>)}</tr></thead><tbody>{rows.map((a,i)=><tr key={a.host} className="border-t border-[#202a3b] text-[10px] hover:bg-white/[.018]"><td className="px-4 py-3.5"><div className="flex items-center gap-2.5"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#1b2a41] text-[#87b7ff]"><Globe2 size={13}/></span><span className="mono text-[#cbd7e8]">{a.host}</span></div></td><td className="text-[#93a0b5]">{a.kind}</td><td><StatusPill tone="green"><LockKeyhole size={10}/>{a.status}</StatusPill></td><td className="text-[#8794aa]">{a.last}</td><td className="text-[#aab6c8]">{a.findings} <span className="text-[#68758b]">sample</span></td></tr>)}</tbody></table>{rows.length===0&&<div className="py-12 text-center text-[10px] text-[#78869d]">No matching sample assets.</div>}</div><div className="border-t border-[#202a3b] px-4 py-3 text-[9px] text-[#69778e]">{rows.length} of {assetRows.length} displayed records · seeded example data</div></Card>
    <div className="mt-4"><RecentScans/></div>
  </div>;
}

function HistoryPage() {
  const [active,setActive]=useState('northstar-labs.test');
  return <div className="fade-up"><PrototypeBanner/><PageHeading kicker="Records / history" title="Scan history" description="Previous assessment records and comparisons, populated with illustrative data." action={<Link href="/scans/new" className="inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-3.5 py-2.5 text-[10px] font-bold text-[#08111f]"><Plus size={14}/>New scan</Link>}/>
    <div className="mb-4 flex flex-wrap gap-2">{['northstar-labs.test','copperfield.dev'].map(d=><button key={d} onClick={()=>setActive(d)} className={`rounded-lg border px-3 py-2 text-[10px] font-semibold ${active===d?'border-blue-300/25 bg-blue-400/10 text-blue-200':'border-[#29354a] bg-[#121a28] text-[#8c99ae]'}`}>{d}</button>)}</div>
    <Card><div className="grid gap-3 border-b border-[#252f43] p-4 sm:grid-cols-3"><div className="rounded-lg border border-[#263249] bg-[#0e1522] p-3"><div className="text-[9px] text-[#75839a]">Latest sample score</div><div className="mt-1 flex items-end gap-2"><span className="text-[23px] font-bold text-[#dce6f5]">{active==='northstar-labs.test'?'78':'86'}</span><span className="mb-1 flex items-center text-[9px] text-emerald-300"><ArrowUpRight size={12}/>+4 from prior</span></div></div><div className="rounded-lg border border-[#263249] bg-[#0e1522] p-3"><div className="text-[9px] text-[#75839a]">Finding count change</div><div className="mt-1 flex items-end gap-2"><span className="text-[23px] font-bold text-[#dce6f5]">−3</span><span className="mb-1 text-[9px] text-[#8491a7]">vs. previous sample</span></div></div><div className="rounded-lg border border-[#263249] bg-[#0e1522] p-3"><div className="text-[9px] text-[#75839a]">Assessment cadence</div><div className="mt-1 text-[14px] font-bold text-[#dce6f5]">Weekly</div><div className="mt-1 text-[9px] text-[#8491a7]">based on example records</div></div></div>
      <div className="divide-y divide-[#202a3b]">{sampleScans.filter(s=>active==='northstar-labs.test'?s.domain==='northstar-labs.test':s.domain==='copperfield.dev').map((s,i)=><div key={s.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_140px_120px_100px_auto] md:items-center md:px-5"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1a293f] text-[#83adf0]"><History size={16}/></div><div><div className="mono text-[10px] font-semibold text-[#d3deed]">{s.id}</div><div className="mt-1 text-[9px] text-[#77849a]">{s.time} · {s.domain}</div></div></div><div><div className="text-[8px] text-[#6e7b91]">Sample score</div><div className="mt-1 text-[12px] font-bold text-[#cbd6e7]">{s.score}<span className="font-normal text-[#68758b]"> / 100</span></div></div><div><div className="text-[8px] text-[#6e7b91]">Findings</div><div className="mt-1 text-[10px] text-[#b7c3d5]">{s.findings} <span className="text-[#748199]">({s.severity})</span></div></div><StatusPill tone="green"><Check size={10}/>{s.status}</StatusPill><Link href={`/scans/${s.id}`} className="text-[9px] font-semibold text-[#81b1ff]">Compare details <ChevronRight size={12} className="inline"/></Link></div>)}</div><div className="border-t border-[#202a3b] px-4 py-3 text-[9px] text-[#69778e]">Comparisons are static examples. No prior scans or deltas were calculated.</div></Card>
  </div>;
}

function Reports() {
  return <div className="fade-up"><PrototypeBanner/><PageHeading kicker="Records / reporting" title="Reports" description="Preview a shareable report layout. Export uses your browser’s print dialog; no report is generated from a real assessment." action={<Button onClick={()=>window.print()} data-testid="button-export-report"><Download size={14}/>Export / print</Button>}/>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="print-area overflow-hidden"><div className="border-b border-[#252f43] bg-[#131d2c] px-6 py-5 md:px-8"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-[10px] font-extrabold tracking-[-.03em] text-[#dce6f5]"><Shield size={16} className="text-[#69a8ff]"/>WEBSENTINEL</div><PrototypeBanner compact/></div><div className="mt-8"><div className="mono text-[9px] uppercase tracking-[.17em] text-[#7c8ba3]">Assessment report · sample only</div><h2 className="mt-2 text-[26px] font-bold tracking-[-.05em] text-[#edf3ff]">northstar-labs.test</h2><p className="mt-2 text-[10px] text-[#8a98ae]">Report reference WS-2048 · Example date: June 18, 2025</p></div></div>
        <div className="grid grid-cols-3 gap-3 border-b border-[#252f43] px-6 py-5 md:px-8">{[['Security score','78 / 100'],['Assets','8 sample'],['Findings','12 sample']].map(([a,b])=><div key={a}><div className="text-[9px] text-[#7b89a0]">{a}</div><div className="mt-1 text-[16px] font-bold text-[#dce6f5]">{b}</div></div>)}</div>
        <div className="px-6 py-5 md:px-8"><div className="text-[12px] font-bold text-[#dce6f5]">Executive summary</div><p className="mt-2 max-w-2xl text-[10px] leading-5 text-[#98a5b9]">This preview presents a fictional assessment snapshot for demonstration. It is not a security conclusion, does not represent a real website review, and should not be used to make operational decisions.</p>
          <div className="mt-6 text-[12px] font-bold text-[#dce6f5]">Finding summary</div><div className="mt-3 overflow-hidden rounded-lg border border-[#273249]"><div className="grid grid-cols-[1fr_100px] bg-[#151f2e] px-3 py-2 text-[8px] uppercase tracking-wider text-[#77859b]"><span>Finding</span><span>Severity</span></div>{sampleFindings.slice(0,4).map(f=><div key={f.id} className="grid grid-cols-[1fr_100px] border-t border-[#252f43] px-3 py-3 text-[9px]"><div className="text-[#cbd6e6]">{f.title}<div className="mt-1 mono text-[8px] text-[#728098]">{f.asset}</div></div><div className="text-[#aebbd0]">{f.severity}</div></div>)}</div>
          <div className="mt-6 rounded-lg border border-violet-300/15 bg-violet-300/[.05] p-3 text-[9px] leading-4 text-[#b7addc]"><AlertTriangle size={13} className="mr-1.5 inline"/>Prototype report. Sample records only; no scan engine, live assessment, or verified findings are connected.</div>
        </div>
      </Card>
      <div className="space-y-3 no-print"><Card className="p-4"><Eyebrow>Export format</Eyebrow><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-300/10 text-red-300"><FileText size={17}/></span><div><div className="text-[11px] font-bold text-[#dce6f5]">PDF via browser print</div><div className="mt-1 text-[9px] text-[#78869d]">Print or save as PDF</div></div></div><Button className="mt-4 w-full" onClick={()=>window.print()}><Download size={13}/>Open print dialog</Button><p className="mt-3 text-[9px] leading-4 text-[#68768d]">The PDF will preserve the prototype-data disclaimer.</p></Card><Card className="p-4"><Eyebrow>Report contents</Eyebrow><div className="space-y-3">{[['Scope and reference',Check],['Posture snapshot',Check],['Findings overview',Check],['Prototype disclaimer',Check]].map(([label,Icon]:any)=><div key={label} className="flex items-center gap-2 text-[10px] text-[#aab6c9]"><Icon size={13} className="text-[#62c99a]"/>{label}</div>)}</div></Card></div>
    </div></div>;
}

function DOMInspector() {
  const [selected,setSelected]=useState(0);
  const patterns=[
    {file:'src/search/QueryPreview.tsx',source:'window.location.hash',sink:'innerHTML',confidence:'0.82',type:'Potential DOM XSS',line:'42'},
    {file:'src/profile/AvatarEditor.ts',source:'postMessage event.data',sink:'insertAdjacentHTML',confidence:'0.64',type:'Untrusted HTML insertion',line:'118'},
    {file:'src/router/legacy.ts',source:'document.referrer',sink:'location.assign',confidence:'0.31',type:'Navigation flow',line:'27'},
  ];
  return <div className="fade-up"><PrototypeBanner/><PageHeading kicker="Assessment / client-side" title="DOM inspector" description="Illustrative source-to-sink patterns for interface exploration. No page source was fetched or analyzed."/>
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#745bea]/25 bg-[#6850dc]/[.08] px-3 py-2.5 text-[9px] leading-4 text-[#bdb2ef]"><Sparkles size={13} className="mt-0.5 shrink-0"/>ILLUSTRATIVE PATTERNS AND CONFIDENCE VALUES — no ML or DOM analysis is implemented. This panel is a static prototype fixture.</div>
    <div className="grid gap-4 xl:grid-cols-[290px_1fr]"><Card className="overflow-hidden"><div className="border-b border-[#252f43] px-4 py-4"><Eyebrow>Pattern list</Eyebrow><div className="text-[12px] font-bold text-[#dce6f5]">Sample detections <span className="mono ml-1 text-[9px] font-normal text-[#76849a]">03</span></div></div>{patterns.map((p,i)=><button onClick={()=>setSelected(i)} key={p.file} className={`w-full border-b border-[#202a3b] p-3.5 text-left transition ${selected===i?'bg-[#1b2b43]':'hover:bg-white/[.025]'}`}><div className="flex items-center justify-between"><StatusPill tone={i===0?'amber':'violet'}>{p.type}</StatusPill><span className="mono text-[9px] text-[#8c9bb3]">{p.confidence}</span></div><div className="mono mt-2.5 text-[9px] text-[#c1cee0]">{p.file}</div><div className="mt-1 text-[8px] text-[#708098]">source <span className="text-[#8ab6ff]">{p.source}</span></div></button>)}</Card>
      <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#252f43] px-4 py-4"><div><Eyebrow>Code context · illustrative</Eyebrow><div className="mono text-[10px] text-[#cbd7e8]">{patterns[selected].file}:{patterns[selected].line}</div></div><StatusPill tone="violet"><Sparkles size={10}/>Confidence {patterns[selected].confidence}</StatusPill></div>
        <div className="overflow-x-auto bg-[#0c121e] p-4 md:p-6"><pre className="mono min-w-[540px] text-[10px] leading-7 text-[#92a0b5]"><code>{`  38  export function renderPreview(value: string) {\n  39    const container = document.querySelector('#preview');\n  40    if (!container) return;\n  41\n  42  `}<span className="rounded bg-amber-300/10 px-1 text-amber-200">{`container.innerHTML = window.location.hash.slice(1);`}</span>{`\n  43\n  44    return container;\n  45  }`}</code></pre></div>
        <div className="grid gap-3 border-t border-[#252f43] p-4 sm:grid-cols-2"><div className="rounded-lg border border-[#28344b] bg-[#111a29] p-3"><div className="text-[8px] uppercase tracking-wider text-[#6f7d94]">Illustrative source</div><div className="mono mt-2 text-[10px] text-[#82b2ff]">{patterns[selected].source}</div></div><div className="rounded-lg border border-[#28344b] bg-[#111a29] p-3"><div className="text-[8px] uppercase tracking-wider text-[#6f7d94]">Illustrative sink</div><div className="mono mt-2 text-[10px] text-[#d3a7ff]">{patterns[selected].sink}</div></div></div>
        <div className="px-4 pb-4 text-[9px] leading-4 text-[#738198]">Code, file paths, and confidence are fictional examples for UI demonstration. Confidence is not generated by a model.</div>
      </Card></div>
  </div>;
}

function Settings() {
  const [saved,setSaved]=useState(false);const [theme,setTheme]=useState('Night');
  return <div className="fade-up"><PrototypeBanner/><PageHeading kicker="Workspace / preferences" title="Settings" description="A practical view of prototype preferences and workspace configuration."/>
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]"><div className="space-y-4"><Card className="p-5"><Eyebrow>Workspace</Eyebrow><h2 className="text-[13px] font-bold text-[#dce6f5]">Workspace profile</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-[9px] text-[#77859c]">Workspace name<input defaultValue="Northstar Lab" className="mt-2 h-10 w-full rounded-lg border border-[#2a354a] bg-[#0d1420] px-3 text-[10px] text-[#dce6f5] outline-none focus:border-[#5e9aff]"/></label><label className="text-[9px] text-[#77859c]">Workspace slug<input defaultValue="northstar-lab" className="mono mt-2 h-10 w-full rounded-lg border border-[#2a354a] bg-[#0d1420] px-3 text-[10px] text-[#dce6f5] outline-none focus:border-[#5e9aff]"/></label></div><div className="mt-4 text-[9px] text-[#69778f]">Changes are local UI state only and are not persisted.</div></Card>
      <Card className="p-5"><Eyebrow>Appearance</Eyebrow><h2 className="text-[13px] font-bold text-[#dce6f5]">Interface theme</h2><div className="mt-3 grid grid-cols-2 gap-2">{['Night','Midnight'].map(t=><button key={t} onClick={()=>{setTheme(t);setSaved(false)}} className={`rounded-lg border px-3 py-3 text-left ${theme===t?'border-blue-300/25 bg-blue-400/[.08]':'border-[#29354a] bg-[#0e1522]'}`}><div className={`mb-2 h-7 rounded ${t==='Night'?'bg-[#111827]':'bg-[#17162b]'}`}/><div className="text-[10px] font-semibold text-[#cbd6e7]">{t}</div><div className="mt-1 text-[8px] text-[#738199]">Preview option</div></button>)}</div></Card>
      <Card className="p-5"><Eyebrow>Data & privacy</Eyebrow><h2 className="text-[13px] font-bold text-[#dce6f5]">Prototype safeguards</h2><div className="mt-4 space-y-3">{[['Target requests','Disabled'],['Backend persistence','Not connected'],['ML analysis','Not implemented'],['Sample records','Enabled']].map(([label,value])=><div key={label} className="flex items-center justify-between border-b border-[#222c3e] pb-3 text-[10px] last:border-0 last:pb-0"><span className="text-[#96a3b8]">{label}</span><StatusPill tone={value==='Enabled'?'violet':'muted'}>{value}</StatusPill></div>)}</div></Card>
      <div className="flex items-center justify-between gap-3"><span role="status" className="text-[9px] text-[#69c99a]">{saved?'Demo preference acknowledged. No settings were persisted.':''}</span><Button onClick={()=>setSaved(true)}><Check size={14}/>Save demo preferences</Button></div>
    </div><Card className="h-fit p-5"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-300/[.08] text-violet-200"><Shield size={18}/></div><h2 className="mt-4 text-[13px] font-bold text-[#dce6f5]">Prototype environment</h2><p className="mt-2 text-[10px] leading-5 text-[#8492a8]">WebSentinel is a frontend-only product prototype. Settings do not configure services or change scan behavior.</p><div className="mt-4 rounded-lg border border-[#29354a] bg-[#0d1420] p-3"><div className="flex items-center gap-2 text-[9px] font-semibold text-[#b5c3d8]"><Activity size={13} className="text-[#69d2a1]"/>All systems local</div><div className="mt-2 text-[9px] leading-4 text-[#718098]">No assessment services, integrations, or persistence layer are active.</div></div><Link href="/overview" className="mt-4 inline-flex items-center gap-1 text-[10px] font-semibold text-[#84b4ff]">Back to overview <ArrowRight size={12}/></Link></Card></div>
  </div>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function DashboardRoutes() {
  const [location] = useLocation();
  if(location==='/') return <Landing/>;
  return <Shell><Switch>
    <Route path="/overview" component={Overview}/>
    <Route path="/scans/new" component={NewScan}/>
    <Route path="/scans/:id" component={ScanDetails}/>
    <Route path="/findings" component={Findings}/>
    <Route path="/dom-inspector" component={DOMInspector}/>
    <Route path="/assets" component={Assets}/>
    <Route path="/history" component={HistoryPage}/>
    <Route path="/reports" component={Reports}/>
    <Route path="/settings" component={Settings}/>
    <Route component={NotFound}/>
  </Switch></Shell>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><RoutedErrorBoundary><DashboardRoutes/></RoutedErrorBoundary></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}

export default App;
