'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  LayoutDashboard, Users, ClipboardList, TicketCheck, ShieldAlert,
  LogOut, RefreshCw, Plus, X, ChevronDown, ChevronUp, Loader2,
  TrendingUp, Clock, CheckCircle2, AlertTriangle, BarChart3,
  MapPin, User, Building2, Filter, Download, Search, Activity,
  ArrowUpRight, ArrowDownRight, Settings, Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type KpiData = {
  totalTickets: number;
  withinSla: number;
  outOfSla: number;
  conflictsCount: number;
  totalInspectionHours: number;
  totalMaintenanceHours: number;
  totalSupervisionHours: number;
  avgInspectionHours: number;
  avgMaintenanceHours: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  byTechnique: Record<string, number>;
  byResult: Record<string, number>;
  staffPerformance: StaffPerf[];
};

type StaffPerf = {
  userId: string;
  username: string;
  name: string | null;
  role: string;
  status: string;
  assigned: number;
  completed: number;
  needsEdit: number;
  resubmitted: number;
  withinSla: number;
  outSla: number;
};

type StaffMember = {
  id: string;
  username: string;
  name: string | null;
  email: string;
  role: string;
  status: string;
  mustChangePassword?: boolean;
  createdAt?: string;
};

type Checklist = {
  id: string;
  name: string;
  taskCategory?: string | null;
  techniqueTypes?: string[];
  items?: { label: string; weight: string }[];
  createdAt?: string;
};

type ChecklistItem = { label: string; weight: 'minor' | 'major' | 'critical' };

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  COMPANY_OWNER: 'Company Owner',
  COORDINATOR: 'Coordinator',
  ENGINEER: 'Engineer',
  QUALITY_ENGINEER: 'Quality Engineer',
  SUPERVISION_ENGINEER: 'Supervision Engineer',
  TECHNICIAN: 'Technician',
  CLIENT: 'Client',
  ADMIN: 'Admin',
};

const ROLE_COLORS: Record<string, string> = {
  COMPANY_OWNER: '#FBBF24',
  COORDINATOR: '#6C63FF',
  ENGINEER: '#00D4AA',
  QUALITY_ENGINEER: '#4ADE80',
  SUPERVISION_ENGINEER: '#38BDF8',
  TECHNICIAN: '#FF9F43',
  CLIENT: '#A78BFA',
  ADMIN: '#F87171',
};

const STAFF_ROLES = ['COMPANY_OWNER', 'COORDINATOR', 'ENGINEER', 'QUALITY_ENGINEER', 'SUPERVISION_ENGINEER', 'TECHNICIAN', 'CLIENT'];
const CATEGORIES = ['QUALITY', 'MAINTENANCE', 'SUPERVISION'];
const CAT_COLORS: Record<string, string> = {
  QUALITY: '#4ADE80',
  MAINTENANCE: '#FF9F43',
  SUPERVISION: '#38BDF8',
  UNSPECIFIED: '#6B7280',
};
const STATUS_COLORS: Record<string, string> = {
  COMPLETED: '#4ADE80',
  IN_PROGRESS: '#FBBF24',
  ON_SITE: '#38BDF8',
  PENDING: '#6B7280',
  NEEDS_EDIT: '#FF4757',
};

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'tickets', label: 'Tickets & KPIs', icon: TicketCheck },
  { id: 'staff', label: 'Staff', icon: Users },
  { id: 'checklists', label: 'Checklists', icon: ClipboardList },
  { id: 'conflicts', label: 'Conflicts', icon: ShieldAlert },
] as const;
type TabId = (typeof TABS)[number]['id'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function roleLabel(r: string) { return ROLE_LABELS[r] ?? r.replace(/_/g, ' '); }
function roleColor(r: string) { return ROLE_COLORS[r] ?? '#6B7280'; }

function KpiTile({ label, value, sub, icon: Icon, color, trend }: {
  label: string; value: string | number; sub?: string;
  icon: LucideIcon; color: string; trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}22` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <div>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-extrabold text-white">{value}</span>
          {trend === 'up' && <ArrowUpRight className="w-4 h-4 text-emerald-400 mb-1" />}
          {trend === 'down' && <ArrowDownRight className="w-4 h-4 text-red-400 mb-1" />}
        </div>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">{children}</p>
  );
}

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-[#12122A] p-4 ${className}`}>
      {children}
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold" style={{ background: `${color}22`, color }}>
      {label}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CompanyHubPage() {
  const router = useRouter();
  const params = useParams();
  const locale = typeof params?.locale === 'string' ? params.locale : 'en';

  const [checking, setChecking] = useState(true);
  const [me, setMe] = useState<{ username: string; name: string | null; role: string; company: string | null } | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // KPI state
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterCat, setFilterCat] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Staff state
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('TECHNICIAN');
  const [staffMsg, setStaffMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [staffSubmitting, setStaffSubmitting] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editStatus, setEditStatus] = useState('');

  // Checklist state
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [clLoading, setClLoading] = useState(false);
  const [clName, setClName] = useState('');
  const [clCat, setClCat] = useState('QUALITY');
  const [clTech, setClTech] = useState('inspection');
  const [clItems, setClItems] = useState<ChecklistItem[]>([{ label: '', weight: 'minor' }]);
  const [clMsg, setClMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [clSubmitting, setClSubmitting] = useState(false);

  // Conflicts state
  const [conflictsCount, setConflictsCount] = useState<number | null>(null);

  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auth check ───────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/auth/requester-me', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success || !d.user) { router.replace(`/${locale}/dashboard/login`); return; }
        const role = d.user.role ?? '';
        const canAccess = ['COMPANY_OWNER', 'COMPANY', 'COORDINATOR', 'ADMIN'].includes(role) || !!d.user.companyId;
        if (!canAccess) { router.replace(`/${locale}/dashboard/login`); return; }
        setMe({ username: d.user.username, name: d.user.name, role, company: d.user.company ?? null });
        setChecking(false);
      })
      .catch(() => router.replace(`/${locale}/dashboard/login`));
  }, [router, locale]);

  // ── KPI fetch ─────────────────────────────────────────────────────────────

  const fetchKpi = useCallback(async () => {
    setKpiLoading(true);
    try {
      const q = new URLSearchParams();
      if (filterFrom) q.set('from', filterFrom);
      if (filterTo) q.set('to', filterTo);
      if (filterCat !== 'ALL') q.set('category', filterCat);
      if (filterStatus !== 'ALL') q.set('status', filterStatus);
      const res = await fetch(`/api/company/kpi?${q}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) setKpi(data.kpi);
    } finally {
      setKpiLoading(false);
    }
  }, [filterFrom, filterTo, filterCat, filterStatus]);

  useEffect(() => { if (!checking) fetchKpi(); }, [checking, fetchKpi]);

  // ── Staff fetch ───────────────────────────────────────────────────────────

  const fetchStaff = useCallback(async () => {
    setStaffLoading(true);
    try {
      const res = await fetch('/api/company/staff', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setStaff(data.users ?? []);
    } finally {
      setStaffLoading(false);
    }
  }, []);

  useEffect(() => { if (!checking) fetchStaff(); }, [checking, fetchStaff]);

  // ── Checklists fetch ──────────────────────────────────────────────────────

  const fetchChecklists = useCallback(async () => {
    setClLoading(true);
    try {
      const res = await fetch('/api/inspection-checklists', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setChecklists(data.checklists ?? []);
    } finally {
      setClLoading(false);
    }
  }, []);

  useEffect(() => { if (!checking) fetchChecklists(); }, [checking, fetchChecklists]);

  // ── Conflicts count ───────────────────────────────────────────────────────

  useEffect(() => {
    if (checking) return;
    fetch('/api/conflicts', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setConflictsCount((d.conflicts ?? []).length);
      })
      .catch(() => {});
  }, [checking]);

  // ── Create staff ──────────────────────────────────────────────────────────

  async function createStaff(e: React.FormEvent) {
    e.preventDefault();
    setStaffMsg(null);
    setStaffSubmitting(true);
    try {
      const res = await fetch('/api/company/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ firstName: newFirstName, lastName: newLastName, email: newEmail, role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        const creds = data.credentials;
        setStaffMsg({ text: `✓ Created — Username: ${creds?.username ?? '—'} · Temp password: ${creds?.temporaryPassword ?? '—'} (copy now!)`, isError: false });
        setNewFirstName(''); setNewLastName(''); setNewEmail('');
        await fetchStaff();
      } else {
        setStaffMsg({ text: data.message ?? 'Failed to create.', isError: true });
      }
    } catch {
      setStaffMsg({ text: 'Network error.', isError: true });
    } finally {
      setStaffSubmitting(false);
    }
  }

  // ── Update staff ──────────────────────────────────────────────────────────

  async function updateStaff() {
    if (!editingStaff) return;
    setStaffSubmitting(true);
    const body: Record<string, string> = {};
    if (editRole && editRole !== editingStaff.role) body.role = editRole;
    if (editStatus && editStatus !== editingStaff.status) body.status = editStatus;
    if (!Object.keys(body).length) { setEditingStaff(null); setStaffSubmitting(false); return; }
    try {
      const res = await fetch(`/api/company/staff/${editingStaff.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setStaffMsg({ text: data.success ? '✓ Staff updated.' : (data.message ?? 'Failed.'), isError: !data.success });
      if (data.success) { setEditingStaff(null); await fetchStaff(); }
    } catch {
      setStaffMsg({ text: 'Network error.', isError: true });
    } finally {
      setStaffSubmitting(false);
    }
  }

  // ── Create checklist ──────────────────────────────────────────────────────

  async function createChecklist(e: React.FormEvent) {
    e.preventDefault();
    const validItems = clItems.filter((i) => i.label.trim());
    if (!clName.trim()) { setClMsg({ text: 'Checklist name is required.', isError: true }); return; }
    if (!validItems.length) { setClMsg({ text: 'Add at least one checklist item.', isError: true }); return; }
    setClMsg(null);
    setClSubmitting(true);
    try {
      const types = clTech.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      const res = await fetch('/api/inspection-checklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: clName, taskCategory: clCat, techniqueTypes: types, items: validItems }),
      });
      const data = await res.json();
      if (data.success) {
        setClMsg({ text: '✓ Checklist saved.', isError: false });
        setClName(''); setClTech('inspection'); setClItems([{ label: '', weight: 'minor' }]);
        await fetchChecklists();
      } else {
        setClMsg({ text: data.message ?? 'Failed.', isError: true });
      }
    } catch {
      setClMsg({ text: 'Network error.', isError: true });
    } finally {
      setClSubmitting(false);
    }
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  async function logout() {
    await fetch('/api/auth/requester-logout', { method: 'POST', credentials: 'include' });
    router.replace(`/${locale}/dashboard/login`);
  }

  // ── Dismiss auto-clear messages ───────────────────────────────────────────

  useEffect(() => {
    if (!staffMsg) return;
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    if (!staffMsg.isError) msgTimerRef.current = setTimeout(() => setStaffMsg(null), 8000);
  }, [staffMsg]);

  // ── Guards ────────────────────────────────────────────────────────────────

  if (checking) {
    return (
      <div className="min-h-screen bg-[#05051A] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
      </div>
    );
  }

  const filteredStaff = staff.filter((u) => {
    const q = staffSearch.toLowerCase();
    return !q || (u.username + (u.name ?? '') + u.email + u.role).toLowerCase().includes(q);
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#05051A] text-white">
      {/* ── Topbar ── */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0A0A1F]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-600/30 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-none">{me?.company ?? 'Company Hub'}</p>
              <p className="text-[10px] text-gray-500 leading-none mt-0.5">{me?.name ?? me?.username} · {roleLabel(me?.role ?? '')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { fetchKpi(); fetchStaff(); fetchChecklists(); }}
              className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* ── Tab nav ── */}
      <div className="sticky top-14 z-20 bg-[#0A0A1F]/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 overflow-x-auto">
          <div className="flex gap-1 py-2 min-w-max">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                    active
                      ? 'bg-violet-600/25 text-violet-300 border border-violet-500/30'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {tab.id === 'conflicts' && conflictsCount !== null && conflictsCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                      {conflictsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* ════════════════════════════════════════════════════════
            OVERVIEW TAB
        ════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Top KPI grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <KpiTile label="Total Tickets" value={kpi?.totalTickets ?? '—'} icon={TicketCheck} color="#6C63FF" />
              <KpiTile label="Within SLA" value={kpi?.withinSla ?? '—'} sub="Completed on time" icon={CheckCircle2} color="#4ADE80" trend="up" />
              <KpiTile label="Out of SLA" value={kpi?.outOfSla ?? '—'} sub="Overdue / late" icon={AlertTriangle} color="#FF4757" trend="down" />
              <KpiTile label="Conflicts" value={kpi?.conflictsCount ?? conflictsCount ?? '—'} icon={ShieldAlert} color="#FBBF24" />
              <KpiTile label="Inspection Hrs" value={kpi?.totalInspectionHours ?? '—'} sub={`avg ${kpi?.avgInspectionHours ?? 0}h/ticket`} icon={Clock} color="#38BDF8" />
              <KpiTile label="Maintenance Hrs" value={kpi?.totalMaintenanceHours ?? '—'} sub="Maintenance tickets" icon={Activity} color="#FF9F43" />
            </div>

            {/* Category breakdown */}
            {kpi && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <GlassCard>
                  <SectionLabel>Tickets by Category</SectionLabel>
                  <div className="space-y-2">
                    {Object.entries(kpi.byCategory).map(([cat, count]) => {
                      const pct = kpi.totalTickets > 0 ? Math.round((count / kpi.totalTickets) * 100) : 0;
                      const c = CAT_COLORS[cat] ?? '#6B7280';
                      return (
                        <div key={cat}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-semibold" style={{ color: c }}>{cat}</span>
                            <span className="text-gray-400">{count} ({pct}%)</span>
                          </div>
                          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: c }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </GlassCard>

                <GlassCard>
                  <SectionLabel>Tickets by Status</SectionLabel>
                  <div className="space-y-2">
                    {Object.entries(kpi.byStatus).map(([s, count]) => {
                      const pct = kpi.totalTickets > 0 ? Math.round((count / kpi.totalTickets) * 100) : 0;
                      const c = STATUS_COLORS[s] ?? '#6B7280';
                      return (
                        <div key={s}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-semibold" style={{ color: c }}>{s.replace(/_/g, ' ')}</span>
                            <span className="text-gray-400">{count} ({pct}%)</span>
                          </div>
                          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: c }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </GlassCard>
              </div>
            )}

            {/* Inspection results */}
            {kpi && Object.keys(kpi.byResult).length > 0 && (
              <GlassCard>
                <SectionLabel>Inspection Results</SectionLabel>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(kpi.byResult).map(([result, count]) => (
                    <div key={result} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-xs text-gray-400">{result.replace(/_/g, ' ')}</span>
                      <span className="text-sm font-bold text-white">{count}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            {/* Staff performance */}
            {kpi && kpi.staffPerformance.length > 0 && (
              <GlassCard className="overflow-x-auto">
                <SectionLabel>Staff Performance</SectionLabel>
                <table className="w-full text-xs min-w-[640px]">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-500 text-left">
                      <th className="pb-2 font-semibold">Member</th>
                      <th className="pb-2 font-semibold">Role</th>
                      <th className="pb-2 font-semibold text-right">Assigned</th>
                      <th className="pb-2 font-semibold text-right text-emerald-400">Done</th>
                      <th className="pb-2 font-semibold text-right text-amber-400">Needs Edit</th>
                      <th className="pb-2 font-semibold text-right text-violet-400">Resubmit</th>
                      <th className="pb-2 font-semibold text-right text-sky-400">Within SLA</th>
                      <th className="pb-2 font-semibold text-right text-red-400">Out SLA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {kpi.staffPerformance.map((p) => (
                      <tr key={p.userId} className="hover:bg-white/3">
                        <td className="py-2.5 font-medium text-white">{p.name ?? p.username}</td>
                        <td className="py-2.5">
                          <Badge label={roleLabel(p.role)} color={roleColor(p.role)} />
                        </td>
                        <td className="py-2.5 text-right text-white">{p.assigned}</td>
                        <td className="py-2.5 text-right text-emerald-400">{p.completed}</td>
                        <td className="py-2.5 text-right text-amber-400">{p.needsEdit}</td>
                        <td className="py-2.5 text-right text-violet-400">{p.resubmitted}</td>
                        <td className="py-2.5 text-right text-sky-400">{p.withinSla}</td>
                        <td className="py-2.5 text-right text-red-400">{p.outSla}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </GlassCard>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            TICKETS & KPIs TAB
        ════════════════════════════════════════════════════════ */}
        {activeTab === 'tickets' && (
          <div className="space-y-6">
            {/* Filters */}
            <GlassCard>
              <div className="flex items-center gap-2 mb-4">
                <Filter className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-semibold text-white">Filters & Date Range</span>
                {kpiLoading && <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin ml-auto" />}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">From date</label>
                  <input
                    type="date"
                    value={filterFrom}
                    onChange={(e) => setFilterFrom(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:border-violet-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">To date</label>
                  <input
                    type="date"
                    value={filterTo}
                    onChange={(e) => setFilterTo(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:border-violet-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Category</label>
                  <select
                    value={filterCat}
                    onChange={(e) => setFilterCat(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0A0A1F] border border-white/10 rounded-xl text-white text-sm focus:border-violet-500 outline-none"
                  >
                    <option value="ALL">All categories</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Status</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0A0A1F] border border-white/10 rounded-xl text-white text-sm focus:border-violet-500 outline-none"
                  >
                    <option value="ALL">All statuses</option>
                    {['PENDING', 'ON_SITE', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_EDIT'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={fetchKpi}
                  disabled={kpiLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl text-sm font-semibold transition-colors"
                >
                  {kpiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart3 className="w-3.5 h-3.5" />}
                  Apply Filters
                </button>
                <button
                  onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterCat('ALL'); setFilterStatus('ALL'); }}
                  className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/5 border border-white/10 transition-colors"
                >
                  Reset
                </button>
              </div>
            </GlassCard>

            {/* KPI summary tiles */}
            {kpi && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <KpiTile label="Total Tickets" value={kpi.totalTickets} icon={TicketCheck} color="#6C63FF" />
                  <KpiTile label="Within SLA" value={kpi.withinSla} sub="On-time completions" icon={CheckCircle2} color="#4ADE80" />
                  <KpiTile label="Out of SLA" value={kpi.outOfSla} sub="Late / overdue" icon={AlertTriangle} color="#FF4757" />
                  <KpiTile
                    label="SLA Rate"
                    value={kpi.totalTickets > 0 ? `${Math.round((kpi.withinSla / Math.max(1, kpi.withinSla + kpi.outOfSla)) * 100)}%` : '—'}
                    sub="Completion on time"
                    icon={TrendingUp}
                    color="#00D4AA"
                  />
                  <KpiTile label="Inspection Hrs" value={`${kpi.totalInspectionHours}h`} sub={`avg ${kpi.avgInspectionHours}h`} icon={Clock} color="#38BDF8" />
                  <KpiTile label="Maintenance Hrs" value={`${kpi.totalMaintenanceHours}h`} sub={`Supervision: ${kpi.totalSupervisionHours}h`} icon={Activity} color="#FF9F43" />
                </div>

                {/* Technique breakdown */}
                {Object.keys(kpi.byTechnique).length > 0 && (
                  <GlassCard>
                    <SectionLabel>Tickets by Technique</SectionLabel>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(kpi.byTechnique).map(([tech, count]) => (
                        <div key={tech} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                          <span className="text-xs text-gray-400 capitalize">{tech.replace(/_/g, ' ')}</span>
                          <span className="text-sm font-bold text-white">{count}</span>
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                )}

                {/* Result breakdown */}
                {Object.keys(kpi.byResult).length > 0 && (
                  <GlassCard>
                    <SectionLabel>Inspection Results</SectionLabel>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(kpi.byResult).map(([result, count]) => (
                        <div key={result} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                          <span className="text-xs text-gray-400 capitalize">{result.replace(/_/g, ' ')}</span>
                          <span className="text-sm font-bold text-white">{count}</span>
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                )}

                {/* Full staff performance for filtered period */}
                {kpi.staffPerformance.length > 0 && (
                  <GlassCard className="overflow-x-auto">
                    <SectionLabel>Staff Performance (Filtered Period)</SectionLabel>
                    <table className="w-full text-xs min-w-[700px]">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-500 text-left">
                          <th className="pb-2 font-semibold">Member</th>
                          <th className="pb-2 font-semibold">Role</th>
                          <th className="pb-2 font-semibold text-right">Assigned</th>
                          <th className="pb-2 font-semibold text-right text-emerald-400">Completed</th>
                          <th className="pb-2 font-semibold text-right text-sky-400">Within SLA</th>
                          <th className="pb-2 font-semibold text-right text-red-400">Out SLA</th>
                          <th className="pb-2 font-semibold text-right text-amber-400">Needs Edit</th>
                          <th className="pb-2 font-semibold text-right text-violet-400">Resubmitted</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {kpi.staffPerformance.map((p) => (
                          <tr key={p.userId} className="hover:bg-white/3">
                            <td className="py-2.5 font-medium text-white">{p.name ?? p.username}</td>
                            <td className="py-2.5"><Badge label={roleLabel(p.role)} color={roleColor(p.role)} /></td>
                            <td className="py-2.5 text-right text-white">{p.assigned}</td>
                            <td className="py-2.5 text-right text-emerald-400">{p.completed}</td>
                            <td className="py-2.5 text-right text-sky-400">{p.withinSla}</td>
                            <td className="py-2.5 text-right text-red-400">{p.outSla}</td>
                            <td className="py-2.5 text-right text-amber-400">{p.needsEdit}</td>
                            <td className="py-2.5 text-right text-violet-400">{p.resubmitted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </GlassCard>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            STAFF TAB
        ════════════════════════════════════════════════════════ */}
        {activeTab === 'staff' && (
          <div className="space-y-6">
            {/* Message banner */}
            {staffMsg && (
              <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
                staffMsg.isError
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}>
                <span className="flex-1 font-mono">{staffMsg.text}</span>
                <button onClick={() => setStaffMsg(null)}><X className="w-4 h-4 opacity-60 hover:opacity-100" /></button>
              </div>
            )}

            {/* Create form */}
            <GlassCard>
              <div className="flex items-center gap-2 mb-4">
                <Plus className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-semibold text-white">Add new staff member</span>
              </div>
              <form onSubmit={createStaff} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text" placeholder="First name *" value={newFirstName} required
                    onChange={(e) => setNewFirstName(e.target.value)}
                    className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:border-violet-500 outline-none"
                  />
                  <input
                    type="text" placeholder="Last name" value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:border-violet-500 outline-none"
                  />
                </div>
                <input
                  type="email" placeholder="Email *" value={newEmail} required
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:border-violet-500 outline-none"
                />
                <div>
                  <p className="text-xs text-gray-400 mb-2">Role</p>
                  <div className="flex flex-wrap gap-2">
                    {STAFF_ROLES.map((r) => {
                      const active = newRole === r;
                      const c = roleColor(r);
                      return (
                        <button
                          key={r} type="button"
                          onClick={() => setNewRole(r)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                          style={{
                            background: active ? `${c}22` : 'transparent',
                            borderColor: active ? c : 'rgba(255,255,255,0.15)',
                            color: active ? c : '#9CA3AF',
                          }}
                        >
                          {roleLabel(r)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button
                  type="submit" disabled={staffSubmitting}
                  className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {staffSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create staff member
                </button>
              </form>
            </GlassCard>

            {/* Staff list */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <SectionLabel>Team members ({filteredStaff.length})</SectionLabel>
                <div className="flex items-center gap-2 ml-auto px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl">
                  <Search className="w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text" placeholder="Search..." value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                    className="bg-transparent text-sm text-white placeholder-gray-500 outline-none w-32"
                  />
                </div>
              </div>
              {staffLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-violet-400 animate-spin" /></div>
              ) : filteredStaff.length === 0 ? (
                <div className="py-12 text-center text-gray-500 text-sm">No staff members yet.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredStaff.map((u) => {
                    const c = roleColor(u.role);
                    const isActive = u.status === 'ACTIVE';
                    return (
                      <GlassCard key={u.id}>
                        <div className="flex items-start gap-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold flex-shrink-0"
                            style={{ background: `${c}22`, color: c }}
                          >
                            {(u.name ?? u.username)[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{u.name ?? u.username}</p>
                            <p className="text-xs text-gray-400 truncate">@{u.username} · {u.email}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <Badge label={roleLabel(u.role)} color={c} />
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg"
                                style={{
                                  background: isActive ? '#4ADE8022' : '#FF475722',
                                  color: isActive ? '#4ADE80' : '#FF4757',
                                }}
                              >
                                {u.status}
                              </span>
                              {u.mustChangePassword && (
                                <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-lg">Must change pwd</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => { setEditingStaff(u); setEditRole(u.role); setEditStatus(u.status); }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                            title="Edit"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                        </div>
                      </GlassCard>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            CHECKLISTS TAB
        ════════════════════════════════════════════════════════ */}
        {activeTab === 'checklists' && (
          <div className="space-y-6">
            {clMsg && (
              <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
                clMsg.isError
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}>
                <span className="flex-1">{clMsg.text}</span>
                <button onClick={() => setClMsg(null)}><X className="w-4 h-4 opacity-60" /></button>
              </div>
            )}

            {/* Create checklist */}
            <GlassCard>
              <div className="flex items-center gap-2 mb-4">
                <Plus className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-semibold text-white">New checklist</span>
              </div>
              <form onSubmit={createChecklist} className="space-y-4">
                <input
                  type="text" placeholder="Checklist name *" value={clName} required
                  onChange={(e) => setClName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:border-emerald-500 outline-none"
                />

                {/* Category */}
                <div>
                  <p className="text-xs text-gray-400 mb-2">Category</p>
                  <div className="flex gap-2">
                    {CATEGORIES.map((c) => {
                      const active = clCat === c;
                      const col = CAT_COLORS[c] ?? '#6B7280';
                      return (
                        <button
                          key={c} type="button" onClick={() => setClCat(c)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                          style={{
                            background: active ? `${col}22` : 'transparent',
                            borderColor: active ? col : 'rgba(255,255,255,0.15)',
                            color: active ? col : '#9CA3AF',
                          }}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Technique types */}
                <input
                  type="text" placeholder="Technique types (comma-separated): inspection, supervision…"
                  value={clTech}
                  onChange={(e) => setClTech(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:border-emerald-500 outline-none"
                />

                {/* Checklist items builder */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-400">Checklist items ({clItems.length})</p>
                    <button
                      type="button"
                      onClick={() => setClItems((prev) => [...prev, { label: '', weight: 'minor' }])}
                      className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add item
                    </button>
                  </div>
                  <div className="space-y-2">
                    {clItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10">
                        <span className="text-xs text-gray-500 w-5 flex-shrink-0">{idx + 1}.</span>
                        <input
                          type="text"
                          placeholder="Item label…"
                          value={item.label}
                          onChange={(e) => setClItems((prev) => prev.map((it, i) => i === idx ? { ...it, label: e.target.value } : it))}
                          className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
                        />
                        <div className="flex gap-1">
                          {(['minor', 'major', 'critical'] as const).map((w) => {
                            const wColors: Record<string, string> = { minor: '#4ADE80', major: '#FBBF24', critical: '#FF4757' };
                            const wc = wColors[w];
                            const active = item.weight === w;
                            return (
                              <button
                                key={w} type="button"
                                onClick={() => setClItems((prev) => prev.map((it, i) => i === idx ? { ...it, weight: w } : it))}
                                className="px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all"
                                style={{
                                  background: active ? `${wc}22` : 'transparent',
                                  borderColor: active ? wc : 'rgba(255,255,255,0.15)',
                                  color: active ? wc : '#6B7280',
                                }}
                              >
                                {w}
                              </button>
                            );
                          })}
                        </div>
                        {clItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setClItems((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-gray-500 hover:text-red-400 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setClItems((prev) => [...prev, { label: '', weight: 'minor' }])}
                    className="mt-2 w-full py-2 rounded-xl border border-dashed border-white/20 text-xs text-gray-500 hover:text-white hover:border-violet-500/40 transition-colors"
                  >
                    + Add another item
                  </button>
                </div>

                <button
                  type="submit" disabled={clSubmitting}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {clSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
                  Save checklist
                </button>
              </form>
            </GlassCard>

            {/* Checklist list */}
            {clLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-emerald-400 animate-spin" /></div>
            ) : checklists.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-sm">No checklists yet.</div>
            ) : (
              <div className="space-y-3">
                <SectionLabel>Checklists ({checklists.length})</SectionLabel>
                {checklists.map((cl) => {
                  const c = CAT_COLORS[cl.taskCategory ?? ''] ?? '#6B7280';
                  const items = cl.items ?? [];
                  return (
                    <ChecklistCard key={cl.id} cl={cl} c={c} items={items} />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            CONFLICTS TAB
        ════════════════════════════════════════════════════════ */}
        {activeTab === 'conflicts' && (
          <ConflictsTab />
        )}
      </main>

      {/* ── Edit staff modal ── */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setEditingStaff(null)}>
          <div className="bg-[#12122A] border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Edit Staff Member</h3>
              <button onClick={() => setEditingStaff(null)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-400 mb-4">{editingStaff.name ?? editingStaff.username} · @{editingStaff.username}</p>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-400 mb-2">Role</p>
                <div className="flex flex-wrap gap-2">
                  {STAFF_ROLES.map((r) => {
                    const active = editRole === r;
                    const c = roleColor(r);
                    return (
                      <button
                        key={r} type="button" onClick={() => setEditRole(r)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                        style={{
                          background: active ? `${c}22` : 'transparent',
                          borderColor: active ? c : 'rgba(255,255,255,0.15)',
                          color: active ? c : '#9CA3AF',
                        }}
                      >
                        {roleLabel(r)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-2">Status</p>
                <div className="flex gap-2">
                  {['ACTIVE', 'INACTIVE'].map((s) => {
                    const active = editStatus === s;
                    const c = s === 'ACTIVE' ? '#4ADE80' : '#FF4757';
                    return (
                      <button
                        key={s} type="button" onClick={() => setEditStatus(s)}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-all"
                        style={{
                          background: active ? `${c}22` : 'transparent',
                          borderColor: active ? c : 'rgba(255,255,255,0.15)',
                          color: active ? c : '#9CA3AF',
                        }}
                      >
                        {s === 'ACTIVE' ? 'Active' : 'Inactive'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={updateStaff}
                disabled={staffSubmitting}
                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl text-sm font-semibold transition-colors"
              >
                {staffSubmitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save changes'}
              </button>
              <button
                onClick={() => setEditingStaff(null)}
                className="px-4 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/5 border border-white/10 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Checklist card (collapsible) ─────────────────────────────────────────────

function ChecklistCard({ cl, c, items }: { cl: Checklist; c: string; items: { label: string; weight: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-white/10 bg-[#12122A] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors text-left"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${c}22` }}>
          <ClipboardList className="w-5 h-5" style={{ color: c }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{cl.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {cl.techniqueTypes?.join(', ') ?? '—'} · {items.length} item{items.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cl.taskCategory && <Badge label={cl.taskCategory} color={c} />}
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {open && items.length > 0 && (
        <div className="border-t border-white/10 px-4 pb-4">
          <div className="space-y-1.5 mt-3">
            {items.map((item, idx) => {
              const wColors: Record<string, string> = { minor: '#4ADE80', major: '#FBBF24', critical: '#FF4757' };
              const wc = wColors[item.weight] ?? '#6B7280';
              return (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-5">{idx + 1}.</span>
                  <span className="text-xs text-white flex-1">{item.label}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg" style={{ background: `${wc}22`, color: wc }}>
                    {item.weight}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Conflicts tab (inline fetch) ──────────────────────────────────────────────

type ConflictItem = { id: string; status: string; resolutionStatus?: string | null; createdAt: string };

function ConflictsTab() {
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/conflicts', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (d.success) setConflicts(d.conflicts ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const open = conflicts.filter((c) => c.status !== 'RESOLVED' && c.resolutionStatus !== 'RESOLVED').length;
  const resolved = conflicts.length - open;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiTile label="Total Conflicts" value={conflicts.length} icon={ShieldAlert} color="#FBBF24" />
        <KpiTile label="Open Conflicts" value={open} icon={AlertTriangle} color="#FF4757" />
        <KpiTile label="Resolved" value={resolved} icon={CheckCircle2} color="#4ADE80" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-amber-400 animate-spin" /></div>
      ) : conflicts.length === 0 ? (
        <div className="py-16 text-center">
          <ShieldAlert className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No conflicts recorded.</p>
        </div>
      ) : (
        <GlassCard className="overflow-x-auto">
          <SectionLabel>All conflicts ({conflicts.length})</SectionLabel>
          <table className="w-full text-xs min-w-[400px]">
            <thead>
              <tr className="border-b border-white/10 text-gray-500 text-left">
                <th className="pb-2 font-semibold">Conflict ID</th>
                <th className="pb-2 font-semibold">Status</th>
                <th className="pb-2 font-semibold">Resolution</th>
                <th className="pb-2 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {conflicts.map((c) => {
                const isResolved = c.status === 'RESOLVED' || c.resolutionStatus === 'RESOLVED';
                return (
                  <tr key={c.id} className="hover:bg-white/3">
                    <td className="py-2.5 font-mono text-violet-300">#{c.id.slice(-6)}</td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded-lg font-bold ${isResolved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-gray-400">{c.resolutionStatus ?? '—'}</td>
                    <td className="py-2.5 text-gray-400">{new Date(c.createdAt).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </GlassCard>
      )}
    </div>
  );
}
