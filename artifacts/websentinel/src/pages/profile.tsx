import { useState } from 'react';
import { Link } from 'wouter';
import {
  Shield, User, Mail, Briefcase, Calendar, Activity, Lock,
  Check, LogOut, ArrowRight, ChevronRight, Radar, ShieldCheck,
  Bell, Settings2, Loader2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-[#202a3c] bg-[#111827]/90 ${className}`}>{children}</section>;
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#75829b]">{children}</div>;
}
function Badge({ children, tone = 'blue' }: { children: React.ReactNode; tone?: string }) {
  const map: Record<string, string> = {
    blue: 'border-blue-300/15 bg-blue-400/10 text-blue-300',
    green: 'border-emerald-300/15 bg-emerald-400/10 text-emerald-300',
    violet: 'border-violet-300/15 bg-violet-400/10 text-violet-300',
    amber: 'border-amber-300/15 bg-amber-400/10 text-amber-300',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${map[tone] ?? map.blue}`}>
      {children}
    </span>
  );
}

export default function Profile() {
  const { user, logout } = useAuth();

  const [nameValue, setNameValue] = useState(user?.name ?? '');
  const [roleValue, setRoleValue] = useState(user?.role ?? '');
  const [saved, setSaved] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [notifications, setNotifications] = useState({
    scanComplete: true,
    newFindings: true,
    weeklyReport: false,
    securityAlerts: true,
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  if (!user) return null;

  const activityItems = [
    { icon: Radar, label: 'Ran subdomain enumeration', time: '2h ago', detail: 'example.com — 14 subdomains found' },
    { icon: ShieldCheck, label: 'TLS certificate check', time: '3h ago', detail: 'api.example.com — Grade A' },
    { icon: Shield, label: 'Security scan completed', time: '1d ago', detail: 'northstar-labs.test — Score 78' },
    { icon: Activity, label: 'Reviewed findings', time: '2d ago', detail: '3 findings marked reviewed' },
  ];

  return (
    <div className="fade-up">
      {/* Page heading */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Workspace / account</Eyebrow>
          <h1 className="text-[26px] font-bold tracking-[-.04em] text-[#edf3ff] md:text-[30px]">Your profile</h1>
          <p className="mt-1.5 max-w-2xl text-[12px] leading-5 text-[#8793a9]">Manage your account details and workspace preferences.</p>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="inline-flex items-center gap-2 rounded-lg border border-red-400/20 bg-red-400/[.07] px-3.5 py-2.5 text-[11px] font-semibold text-red-300 transition hover:bg-red-400/[.12] disabled:opacity-50"
        >
          {loggingOut ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
          Sign out
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
        {/* Left: avatar + summary */}
        <div className="space-y-4">
          <Card className="p-5 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-[#33415c] bg-gradient-to-br from-[#1a263a] to-[#1e2b42] text-[28px] font-bold text-[#b4ccf4] shadow-[0_0_40px_rgba(67,140,255,.08)]">
              {user.avatar}
            </div>
            <h2 className="mt-4 text-[16px] font-bold tracking-[-.03em] text-[#edf3ff]">{user.name}</h2>
            <p className="mt-1 text-[11px] text-[#8a99b5]">{user.role}</p>
            <div className="mt-3 flex items-center justify-center">
              <Badge tone="green"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Active</Badge>
            </div>

            <div className="mt-5 space-y-3 border-t border-[#202a3c] pt-5 text-left">
              {[
                { icon: Mail, label: 'Email', value: user.email },
                { icon: Briefcase, label: 'Role', value: user.role },
                { icon: Calendar, label: 'Member since', value: user.joinedAt },
                { icon: Activity, label: 'Scans run', value: String(user.scansRun) },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#1b2a41] text-[#7199cc]">
                    <Icon size={13} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[8px] uppercase tracking-[.1em] text-[#68758b]">{label}</div>
                    <div className="truncate text-[10px] font-semibold text-[#c4cfdf]">{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick links */}
          <Card className="overflow-hidden">
            <div className="border-b border-[#202a3c] px-4 py-3">
              <Eyebrow>Quick access</Eyebrow>
            </div>
            {[
              { icon: Radar, label: 'Subdomain enumeration', href: '/subdomains', hint: 'Map attack surface' },
              { icon: ShieldCheck, label: 'TLS / certificate check', href: '/tls', hint: 'Inspect HTTPS posture' },
              { icon: Shield, label: 'Security overview', href: '/overview', hint: 'Dashboard' },
              { icon: Settings2, label: 'Settings', href: '/settings', hint: 'Workspace preferences' },
            ].map(({ icon: Icon, label, href, hint }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 border-b border-[#202a3c] px-4 py-3 text-left transition last:border-0 hover:bg-white/[.025]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#1b2a41] text-[#7199cc]">
                  <Icon size={13} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[10px] font-semibold text-[#c4cfdf]">{label}</span>
                  <span className="block text-[8px] text-[#68758b]">{hint}</span>
                </span>
                <ChevronRight size={12} className="text-[#68758b]" />
              </Link>
            ))}
          </Card>
        </div>

        {/* Right: edit form + notifications + activity */}
        <div className="space-y-4">
          {/* Edit profile */}
          <Card className="p-5">
            <Eyebrow>Profile details</Eyebrow>
            <h2 className="text-[14px] font-bold text-[#dce6f5]">Edit profile</h2>
            <form onSubmit={handleSave} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-semibold text-[#8a9ab5]">Display name</span>
                  <div className="flex items-center gap-2 rounded-lg border border-[#2b3850] bg-[#0d1420] px-3 focus-within:border-[#5e9aff]">
                    <User size={13} className="text-[#71809a]" />
                    <input
                      value={nameValue}
                      onChange={e => setNameValue(e.target.value)}
                      className="h-10 w-full bg-transparent text-[11px] text-[#dce6f5] outline-none placeholder:text-[#546179]"
                      placeholder="Your name"
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-semibold text-[#8a9ab5]">Job title / role</span>
                  <div className="flex items-center gap-2 rounded-lg border border-[#2b3850] bg-[#0d1420] px-3 focus-within:border-[#5e9aff]">
                    <Briefcase size={13} className="text-[#71809a]" />
                    <input
                      value={roleValue}
                      onChange={e => setRoleValue(e.target.value)}
                      className="h-10 w-full bg-transparent text-[11px] text-[#dce6f5] outline-none placeholder:text-[#546179]"
                      placeholder="Security Analyst"
                    />
                  </div>
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-semibold text-[#8a9ab5]">Email address</span>
                <div className="flex items-center gap-2 rounded-lg border border-[#2b3850] bg-[#0d1420] px-3 opacity-60">
                  <Mail size={13} className="text-[#71809a]" />
                  <input
                    value={user.email}
                    disabled
                    className="h-10 w-full bg-transparent text-[11px] text-[#9aa8be] outline-none cursor-not-allowed"
                  />
                </div>
                <p className="mt-1 text-[9px] text-[#586477]">Email cannot be changed in this prototype.</p>
              </label>

              <div className="flex items-center justify-between gap-3 border-t border-[#222d41] pt-4">
                <span className="text-[9px] text-[#69c99a] transition-opacity" style={{ opacity: saved ? 1 : 0 }}>
                  <Check size={11} className="mr-1 inline" />Changes saved locally.
                </span>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#438cff] px-4 py-2.5 text-[11px] font-bold text-[#08111f] shadow-[0_4px_16px_rgba(55,129,255,.15)] transition hover:bg-[#64a1ff]"
                >
                  <Check size={13} /> Save changes
                </button>
              </div>
            </form>
          </Card>

          {/* Notifications */}
          <Card className="p-5">
            <Eyebrow>Preferences</Eyebrow>
            <h2 className="text-[14px] font-bold text-[#dce6f5]">Notifications</h2>
            <div className="mt-4 space-y-3">
              {(Object.entries(notifications) as [keyof typeof notifications, boolean][]).map(([key, enabled]) => {
                const labels: Record<keyof typeof notifications, { title: string; desc: string }> = {
                  scanComplete: { title: 'Scan completed', desc: 'Alert when a security scan finishes' },
                  newFindings: { title: 'New findings', desc: 'Notify on critical or high severity discoveries' },
                  weeklyReport: { title: 'Weekly report digest', desc: 'Summary of workspace activity each week' },
                  securityAlerts: { title: 'Security alerts', desc: 'Real-time alerts for critical issues' },
                };
                const { title, desc } = labels[key];
                return (
                  <label key={key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#222d40] bg-[#0f1725] px-3.5 py-3 transition hover:border-[#354461]">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1b2a41] text-[#83aff1]">
                      <Bell size={14} />
                    </span>
                    <span className="flex-1">
                      <span className="block text-[10px] font-semibold text-[#cbd6e7]">{title}</span>
                      <span className="mt-0.5 block text-[9px] text-[#75839a]">{desc}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => setNotifications(n => ({ ...n, [key]: !n[key] }))}
                      className="h-4 w-4 accent-[#629dff]"
                      aria-label={title}
                    />
                  </label>
                );
              })}
            </div>
            <p className="mt-3 text-[9px] text-[#586477]">Notification settings are local to this prototype session.</p>
          </Card>

          {/* Security */}
          <Card className="p-5">
            <Eyebrow>Security</Eyebrow>
            <h2 className="text-[14px] font-bold text-[#dce6f5]">Account security</h2>
            <div className="mt-4 space-y-3">
              {[
                { icon: Lock, label: 'Password', value: 'Last changed: prototype session', action: 'Update' },
                { icon: ShieldCheck, label: 'Two-factor auth', value: 'Not configured', action: 'Enable' },
              ].map(({ icon: Icon, label, value, action }) => (
                <div key={label} className="flex items-center justify-between rounded-lg border border-[#222d40] bg-[#0f1725] px-3.5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1b2a41] text-[#83aff1]">
                      <Icon size={14} />
                    </span>
                    <div>
                      <div className="text-[10px] font-semibold text-[#cbd6e7]">{label}</div>
                      <div className="mt-0.5 text-[9px] text-[#75839a]">{value}</div>
                    </div>
                  </div>
                  <button className="rounded-md border border-[#273248] bg-[#121a29] px-2.5 py-1.5 text-[9px] font-semibold text-[#8a9ab5] transition hover:border-[#354461] hover:text-[#c4cfdf]">
                    {action}
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[9px] text-[#586477]">Security actions are UI-only in this prototype environment.</p>
          </Card>

          {/* Recent activity */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#202a3c] px-5 py-4">
              <div>
                <Eyebrow>Account</Eyebrow>
                <h2 className="text-[14px] font-bold text-[#dce6f5]">Recent activity</h2>
              </div>
              <Link href="/history" className="text-[10px] font-semibold text-[#80b3ff] hover:text-white">
                View all <ArrowRight size={12} className="inline" />
              </Link>
            </div>
            <div className="divide-y divide-[#202a3b]">
              {activityItems.map(({ icon: Icon, label, time, detail }) => (
                <div key={label} className="flex items-start gap-3 px-5 py-4">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1b2a41] text-[#7199cc]">
                    <Icon size={14} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-semibold text-[#c4cfdf]">{label}</div>
                    <div className="mt-0.5 text-[9px] text-[#75839a]">{detail}</div>
                  </div>
                  <div className="shrink-0 text-[9px] text-[#66758b]">{time}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
