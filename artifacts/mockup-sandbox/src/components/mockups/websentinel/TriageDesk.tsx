import { useMemo, useState } from "react";
import {
  Activity, ArrowRight, ArrowUpRight, Bell, Check, CheckCircle2, ChevronDown,
  ChevronRight, CircleDot, Clipboard, Clock3, ExternalLink, FileText, Globe2,
  Layers3, Search, Shield, ShieldAlert, SlidersHorizontal, Sparkles, X, Zap,
} from "lucide-react";

type Finding = {
  id: string;
  title: string;
  host: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  category: string;
  age: string;
  summary: string;
  evidence: string;
  reviewed: boolean;
};

const seedFindings: Finding[] = [
  {
    id: "F-0184", title: "Content-Security-Policy is absent",
    host: "app.northstar-labs.test", severity: "High", category: "Security headers",
    age: "2h ago", summary: "The application response does not advertise a Content-Security-Policy. A policy can help limit the impact of injected content by restricting the sources a browser may load.",
    evidence: "Response profile · illustrative sample\ncontent-type: text/html\nstrict-transport-security: max-age=86400\ncontent-security-policy: —",
    reviewed: false,
  },
  {
    id: "F-0183", title: "External script has no integrity pin",
    host: "app.northstar-labs.test", severity: "Medium", category: "Supply chain",
    age: "2h ago", summary: "A third-party script reference in this sample has no integrity attribute. Confirm the vendor and consider pinning expected content.",
    evidence: "Reference · illustrative sample\n<script src=\"https://cdn.example.test/widget.js\"></script>",
    reviewed: false,
  },
  {
    id: "F-0182", title: "Session cookie omits SameSite",
    host: "auth.northstar-labs.test", severity: "Medium", category: "Cookie configuration",
    age: "1d ago", summary: "The example session cookie does not specify SameSite behavior. Review the intended cross-site flows and set an appropriate value.",
    evidence: "Set-Cookie · illustrative sample\nsession=••••••; Secure; HttpOnly",
    reviewed: false,
  },
  {
    id: "F-0180", title: "Client-side source-to-sink pattern",
    host: "app.northstar-labs.test", severity: "Critical", category: "Client-side",
    age: "3d ago", summary: "An illustrative source-to-sink pattern is flagged for review. Validate the data flow and ensure untrusted values are handled safely.",
    evidence: "DOM analysis · illustrative sample\nsource → location.search\nsink → innerHTML",
    reviewed: false,
  },
  {
    id: "F-0181", title: "Server banner reveals product detail",
    host: "api.northstar-labs.test", severity: "Low", category: "Information disclosure",
    age: "1d ago", summary: "A server banner is present in this example response. Consider using a minimal banner to reduce unnecessary implementation detail.",
    evidence: "Response profile · illustrative sample\nserver: ExampleServer/4.2",
    reviewed: false,
  },
];

const assets = [
  { host: "All surfaces", sub: "4 hosts · 12 findings", icon: Layers3 },
  { host: "app.northstar-labs.test", sub: "Web application · 7", icon: Globe2 },
  { host: "auth.northstar-labs.test", sub: "Authentication · 2", icon: Shield },
  { host: "api.northstar-labs.test", sub: "API endpoint · 3", icon: Activity },
];

const severityTone: Record<Finding["severity"], string> = {
  Critical: "text-[#ff8587] bg-[#ff8587]/[.09] border-[#ff8587]/20",
  High: "text-[#ffc078] bg-[#ffc078]/[.09] border-[#ffc078]/20",
  Medium: "text-[#b7a4ff] bg-[#b7a4ff]/[.09] border-[#b7a4ff]/20",
  Low: "text-[#86b7ff] bg-[#86b7ff]/[.09] border-[#86b7ff]/20",
};

export function TriageDesk() {
  const [findings, setFindings] = useState(seedFindings);
  const [selectedId, setSelectedId] = useState(seedFindings[0].id);
  const [activeAsset, setActiveAsset] = useState("All surfaces");
  const [filter, setFilter] = useState("Open");
  const [query, setQuery] = useState("");
  const [showEvidence, setShowEvidence] = useState(false);
  const [notice, setNotice] = useState("");
  const [showBriefing, setShowBriefing] = useState(false);

  const visibleFindings = useMemo(() => findings.filter((item) => {
    const matchesAsset = activeAsset === "All surfaces" || item.host === activeAsset;
    const matchesStatus = filter === "All" || (filter === "Open" ? !item.reviewed : item.severity === filter);
    const text = `${item.id} ${item.title} ${item.host} ${item.category}`.toLowerCase();
    return matchesAsset && matchesStatus && text.includes(query.toLowerCase());
  }), [findings, activeAsset, filter, query]);
  const selected = findings.find((item) => item.id === selectedId) ?? visibleFindings[0] ?? findings[0];
  const openCount = findings.filter((item) => !item.reviewed).length;

  function toggleReviewed(id: string) {
    setFindings((current) => current.map((item) => item.id === id ? { ...item, reviewed: !item.reviewed } : item));
    setNotice(findings.find((item) => item.id === id)?.reviewed ? "Finding returned to open queue." : "Marked reviewed. You can reopen it any time.");
  }

  async function copyReference() {
    try {
      await navigator.clipboard?.writeText(`${selected.id} · ${selected.title} · ${selected.host}`);
      setNotice("Finding reference copied.");
    } catch {
      setNotice(`${selected.id} · ${selected.host}`);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#0b101a] text-[#e6edf8]" style={{ fontFamily: "Manrope, sans-serif" }}>
      <header className="sticky top-0 z-20 flex h-[62px] items-center justify-between border-b border-[#202b3d] bg-[#0b101a]/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#5d9dff]/25 bg-[#438cff]/[.11] text-[#8dbbff]">
            <Shield size={17} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-extrabold tracking-[-.05em]">web<span className="text-[#6eaaff]">sentinel</span></span>
            <span className="hidden text-[9px] tracking-[.02em] text-[#5e6d84] sm:inline">/ Northstar Lab</span>
          </div>
          <ChevronDown size={13} className="ml-[-4px] text-[#63718a]" />
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-[#54c89b]/15 bg-[#54c89b]/[.06] px-2.5 py-1.5 text-[9px] font-semibold text-[#83d9b5] sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[#72dcb1]" /> SAMPLE MODE
          </div>
          <button aria-label="Notifications" onClick={() => setNotice("You’re all caught up on workspace updates.")} className="relative rounded-lg p-2 text-[#7e8da4] hover:bg-white/[.05] hover:text-white">
            <Bell size={16} /><span className="absolute right-[7px] top-[7px] h-1.5 w-1.5 rounded-full bg-[#9a88ff]" />
          </button>
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#34435b] bg-[#172338] text-[9px] font-bold text-[#b7cdf0]">NS</div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 pb-8 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[.17em] text-[#718099]">
              <span>Assessment</span><ChevronRight size={11} /><span className="text-[#9eb0ca]">Triage desk</span>
            </div>
            <h1 className="text-[25px] font-extrabold leading-tight tracking-[-.055em] sm:text-[30px]">The work, not the score.</h1>
            <p className="mt-1.5 text-[11px] text-[#8391a7]">A focused queue for deciding what deserves attention next.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowBriefing((value) => !value); setNotice(""); }} className="inline-flex items-center gap-2 rounded-lg border border-[#2a374c] bg-[#111a29] px-3 py-2.5 text-[10px] font-bold text-[#c0ccde] transition hover:border-[#40516d] hover:bg-[#172337]">
              <FileText size={13} /> Briefing
            </button>
            <button onClick={() => { setFilter("Open"); setActiveAsset("All surfaces"); setQuery(""); setNotice("Queue refreshed with the latest sample records."); }} className="inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-3.5 py-2.5 text-[10px] font-extrabold text-[#08111f] transition hover:bg-[#69a6ff]">
              <Zap size={13} /> Review queue
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#28364a] bg-[#101927] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#5a9aff]/[.11] text-[#83b5ff]"><Activity size={15} /></div>
            <div><div className="text-[10px] font-bold text-[#d5dfed]">Northstar Lab · latest sample</div><div className="mt-0.5 text-[9px] text-[#74839a]">WS-2048 <span className="mx-1.5 text-[#455269]">/</span> Today, 09:42 <span className="mx-1.5 text-[#455269]">/</span> Not a live assessment</div></div>
          </div>
          <div className="flex items-center gap-3 text-[9px]">
            <span className="hidden text-[#75839a] sm:inline">Queue completion</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#253147]"><div className="h-full w-[18%] rounded-full bg-[#6da9ff]" /></div>
            <span className="font-mono text-[#b3c0d2]">2 / 12</span>
            <ArrowUpRight size={13} className="text-[#7e8da4]" />
          </div>
        </div>

        {showBriefing && (
          <section className="mb-4 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-[#6d61b4]/25 bg-[#342d58]/20 p-4">
            <div className="flex gap-3">
              <Sparkles size={16} className="mt-0.5 text-[#b8aaff]" />
              <div><div className="text-[11px] font-bold text-[#e0dbff]">Triage briefing</div><p className="mt-1 max-w-3xl text-[10px] leading-5 text-[#aaa4cb]">Start with the client-side pattern on app.northstar-labs.test, then review the missing browser policy. Both are illustrative sample records. No live assessment data is connected.</p></div>
            </div>
            <button onClick={() => setShowBriefing(false)} aria-label="Close briefing" className="rounded p-1 text-[#948cb8] hover:bg-white/5"><X size={15} /></button>
          </section>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(350px,1fr)_minmax(300px,390px)]">
          <aside className="rounded-xl border border-[#202b3d] bg-[#0f1724] p-3">
            <div className="mb-3 flex items-center justify-between px-2 pt-1">
              <span className="text-[9px] font-extrabold uppercase tracking-[.16em] text-[#738199]">Surface map</span>
              <button onClick={() => { setActiveAsset("All surfaces"); setNotice("Showing every sample asset."); }} aria-label="Show all assets" className="text-[#718099] hover:text-white"><SlidersHorizontal size={13} /></button>
            </div>
            <div className="space-y-1">
              {assets.map(({ host, sub, icon: Icon }) => {
                const active = activeAsset === host;
                const count = host === "All surfaces" ? openCount : findings.filter((item) => item.host === host && !item.reviewed).length;
                return <button key={host} onClick={() => { setActiveAsset(host); setNotice(""); }} className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition ${active ? "border border-[#4f90ed]/25 bg-[#23406a]/25 text-[#b8d2fa]" : "border border-transparent text-[#8b99ae] hover:bg-white/[.035] hover:text-[#d8e2ef]"}`}>
                  <Icon size={14} className={`mt-0.5 shrink-0 ${active ? "text-[#81b4ff]" : "text-[#68778e]"}`} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[9px] font-bold">{host}</span><span className="mt-1 block text-[8px] text-[#697991]">{sub}</span></span>
                  <span className={`mt-0.5 rounded px-1.5 py-0.5 font-mono text-[8px] ${active ? "bg-[#4d8ce2]/15 text-[#9bc2ff]" : "bg-[#192333] text-[#8090a7]"}`}>{count}</span>
                </button>;
              })}
            </div>
            <div className="my-3 border-t border-[#202a3b]" />
            <div className="rounded-lg bg-[#111b2a] p-3">
              <div className="flex items-center gap-2 text-[9px] font-bold text-[#c4cede]"><CircleDot size={12} className="text-[#a38dff]" /> Attention guide</div>
              <p className="mt-2 text-[8px] leading-4 text-[#728198]">Critical and high severity findings are surfaced first. Review each item in context; this sample workspace does not calculate real risk.</p>
            </div>
            <div className="mt-3 flex items-center gap-2 px-2 text-[8px] text-[#64738a]"><span className="h-1.5 w-1.5 rounded-full bg-[#7c6de4]" /> Illustrative records only</div>
          </aside>

          <section className="min-w-0 overflow-hidden rounded-xl border border-[#202b3d] bg-[#0f1724]">
            <div className="border-b border-[#202a3b] px-4 pb-3 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div><div className="text-[13px] font-extrabold tracking-[-.03em] text-[#dce6f4]">Findings to review</div><div className="mt-1 text-[9px] text-[#74839a]">{visibleFindings.length} shown <span className="mx-1">·</span> {openCount} still open</div></div>
                <div className="flex rounded-lg border border-[#253248] bg-[#0b121d] p-0.5">
                  {["Open", "Critical", "High", "All"].map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-md px-2 py-1.5 text-[8px] font-bold transition ${filter === item ? "bg-[#263956] text-[#c8ddff]" : "text-[#75849a] hover:text-[#d7e1ef]"}`}>{item}</button>)}
                </div>
              </div>
              <label className="mt-3 flex h-9 items-center gap-2 rounded-lg border border-[#253147] bg-[#0b121d] px-3 focus-within:border-[#538ee2]">
                <Search size={13} className="text-[#6c7b91]" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an issue, host, or category" className="w-full bg-transparent text-[9px] text-[#d9e4f3] outline-none placeholder:text-[#65748a]" />
                {query && <button aria-label="Clear search" onClick={() => setQuery("")} className="text-[#718199] hover:text-white"><X size={12} /></button>}
                <span className="hidden rounded border border-[#253147] px-1.5 py-0.5 font-mono text-[8px] text-[#5e6c82] sm:inline">⌘ K</span>
              </label>
            </div>
            <div className="divide-y divide-[#1c2738]">
              {visibleFindings.map((finding) => {
                const active = finding.id === selected.id;
                return <button key={finding.id} onClick={() => { setSelectedId(finding.id); setShowEvidence(false); setNotice(""); }} className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition ${active ? "bg-[#1a2b43]/70 shadow-[inset_2px_0_0_#69a7ff]" : "hover:bg-white/[.025]"}`}>
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${severityTone[finding.severity]}`}><ShieldAlert size={13} /></span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[10px] font-bold ${active ? "text-[#e3ecf8]" : "text-[#c3cede]"}`}>{finding.title}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[8px] text-[#728198]"><span className="truncate">{finding.host}</span><span className="text-[#3f4b60]">·</span><span>{finding.category}</span></span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className={`rounded border px-1.5 py-0.5 text-[7px] font-bold ${severityTone[finding.severity]}`}>{finding.severity}</span>
                    <span className="text-[8px] text-[#66758b]">{finding.reviewed ? "Reviewed" : finding.age}</span>
                  </span>
                </button>;
              })}
              {visibleFindings.length === 0 && <div className="px-5 py-12 text-center"><Search size={20} className="mx-auto text-[#53627a]" /><div className="mt-3 text-[10px] font-bold text-[#bdc8d8]">Nothing in this slice</div><p className="mt-1 text-[9px] text-[#75839a]">Try another severity or search term.</p><button onClick={() => { setFilter("All"); setQuery(""); setActiveAsset("All surfaces"); }} className="mt-3 text-[9px] font-bold text-[#8bb9ff] hover:text-white">Reset filters</button></div>}
            </div>
            <div className="flex items-center justify-between border-t border-[#202a3b] px-4 py-3 text-[8px] text-[#65748a]">
              <span>Prioritized by severity, then age</span><button onClick={() => setNotice("Queue sorting is set to severity, then age.")} className="flex items-center gap-1.5 text-[#91a0b6] hover:text-white">Sort: priority <ChevronDown size={11} /></button>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-[#27364c] bg-[#101927]">
            <div className="flex items-center justify-between border-b border-[#253147] px-4 py-3.5">
              <div className="flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-[.13em] text-[#8a9ab2]"><span className="h-1.5 w-1.5 rounded-full bg-[#72aaff]" /> Finding detail</div>
              <button onClick={copyReference} aria-label="Copy finding reference" className="rounded-md p-1.5 text-[#73839a] hover:bg-white/[.05] hover:text-white"><Clipboard size={13} /></button>
            </div>
            <div className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded border px-2 py-1 text-[8px] font-bold ${severityTone[selected.severity]}`}>{selected.severity} severity</span>
                <span className="font-mono text-[8px] text-[#74839a]">{selected.id}</span>
              </div>
              <h2 className="mt-3 text-[17px] font-extrabold leading-[1.25] tracking-[-.04em] text-[#e4ebf5]">{selected.title}</h2>
              <div className="mt-2 flex items-center gap-1.5 text-[9px] text-[#8e9db2]"><Globe2 size={12} className="text-[#7186a4]" />{selected.host}<ExternalLink size={10} className="ml-auto text-[#63728a]" /></div>
              <p className="mt-4 text-[10px] leading-[1.8] text-[#9aa8bc]">{selected.summary}</p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[#263348] bg-[#0d1521] p-2.5"><div className="text-[8px] uppercase tracking-[.12em] text-[#64738a]">Category</div><div className="mt-1.5 text-[9px] font-semibold text-[#c4cfdf]">{selected.category}</div></div>
                <div className="rounded-lg border border-[#263348] bg-[#0d1521] p-2.5"><div className="text-[8px] uppercase tracking-[.12em] text-[#64738a]">First observed</div><div className="mt-1.5 flex items-center gap-1 text-[9px] font-semibold text-[#c4cfdf]"><Clock3 size={10} className="text-[#7989a1]" />{selected.age}</div></div>
              </div>

              <button onClick={() => setShowEvidence((value) => !value)} className="mt-4 flex w-full items-center justify-between rounded-lg border border-[#29374d] bg-[#111c2b] px-3 py-2.5 text-left text-[9px] font-bold text-[#b9c6d9] hover:bg-[#172437]">
                <span className="flex items-center gap-2"><FileText size={12} className="text-[#89a9d6]" /> Sample evidence</span><ChevronDown size={13} className={`transition-transform ${showEvidence ? "rotate-180" : ""}`} />
              </button>
              {showEvidence && <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-[#1e2c40] bg-[#0a111c] p-3 font-mono text-[8px] leading-5 text-[#91a3bd]">{selected.evidence}</pre>}

              <div className="mt-4 rounded-lg border border-[#6a5aa7]/20 bg-[#6552d1]/[.055] p-3">
                <div className="flex items-center gap-2 text-[9px] font-bold text-[#c8bef6]"><Sparkles size={12} /> Suggested next step</div>
                <p className="mt-1.5 text-[9px] leading-4 text-[#938ab9]">Validate this sample against the application owner’s intended configuration before recording a remediation plan.</p>
              </div>

              <button onClick={() => toggleReviewed(selected.id)} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-[9px] font-extrabold transition ${selected.reviewed ? "border-[#31445e] bg-[#152235] text-[#a9c5eb] hover:bg-[#1b2c43]" : "border-[#438cff]/40 bg-[#438cff] text-[#091321] hover:bg-[#69a6ff]"}`}>
                {selected.reviewed ? <><Check size={13} /> Reopen finding</> : <><CheckCircle2 size={13} /> Mark as reviewed</>}
              </button>
              {selected.reviewed && <div className="mt-2 text-center text-[8px] text-[#78cba8]">Reviewed in this local prototype session</div>}
            </div>
          </section>
        </div>

        <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#202a3b] bg-[#0e1622] px-4 py-2.5">
          <div className="flex items-center gap-2 text-[8px] text-[#738199]"><span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#382e67] text-[#b7a8ff]"><Shield size={11} /></span><span><b className="text-[#9ba9bd]">Safe preview</b> · sample records only · no network activity</span></div>
          <button onClick={() => setNotice("You’re viewing the latest available illustrative sample.")} className="flex items-center gap-1 text-[8px] text-[#72839b] hover:text-[#c5d5ea]">About this workspace <ArrowRight size={10} /></button>
        </footer>
      </div>

      {notice && <div role="status" className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-[#33435b] bg-[#182437] px-4 py-3 text-[10px] text-[#d2deed] shadow-xl"><CheckCircle2 size={14} className="shrink-0 text-[#73d7ab]" />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message" className="ml-2 text-[#8393aa] hover:text-white"><X size={12} /></button></div>}
    </main>
  );
}

export default TriageDesk;
