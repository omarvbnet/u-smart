'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ClipboardList, LogOut, Loader2, Bell, UserCog, PlusCircle, X, Clock, CheckCircle, BarChart3, Building2, MapPin, Activity, Map, Edit2, Trash2, Filter, Download, Upload } from 'lucide-react';
import { uploadWithProgress } from '@/lib/upload-with-progress';

const ENTERPRISE_TECH_KEYS = ['maintenance', 'fiber', 'cable_systemization', 'closures', 'splice', 'qgis', 'asbuilt_design'] as const;
const QUALITY_CONTROL_TECH_KEYS = ['inspection', 'supervision', 'hse', 'investigation', 'tracking'] as const;
const ALL_TECH_KEYS = [...ENTERPRISE_TECH_KEYS, ...QUALITY_CONTROL_TECH_KEYS] as const;

function TicketCard({
  ticket,
  t,
  formatDate,
  formatTotalDelay,
  getTechniqueLabel,
  getStatusLabel,
}: {
  ticket: Ticket;
  t: (key: string) => string;
  formatDate: (s: string) => string;
  formatTotalDelay: (a: string, b: string) => string;
  getTechniqueLabel: (tech: string) => string;
  getStatusLabel: (status: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasTimeline = (ticket.statusTimeline?.length ?? 0) > 0;
  const statusStyles: Record<string, string> = {
    COMPLETED: 'bg-emerald-500/20 text-emerald-400',
    ON_SITE: 'bg-cyan-500/20 text-cyan-400',
    IN_PROGRESS: 'bg-amber-500/20 text-amber-400',
    PENDING: 'bg-gray-500/20 text-gray-400',
  };
  const statusBadgeStyle = statusStyles[ticket.status] ?? 'bg-gray-500/20 text-gray-400';
  const timelineStyles: Record<string, string> = {
    PENDING: 'bg-gray-500/30 text-gray-400 border-gray-500/40',
    ON_SITE: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
    IN_PROGRESS: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    COMPLETED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  };
  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-4 hover:border-cyan-500/25 transition-all shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white truncate">
            {ticket.siteName || t('ticketForm.ticket')} <span className="text-cyan-400 font-mono">#{ticket.id.slice(-6)}</span>
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">{ticket.siteCoordinator || '—'} · {getTechniqueLabel(ticket.technique)}</p>
          <p className="text-xs text-gray-500 mt-1">{formatDate(ticket.createdAt)}</p>
          {ticket.status === 'COMPLETED' && ticket.completedAt && (
            <p className="text-xs text-emerald-400/90 mt-0.5">{t('ticketForm.completedAt')}: {formatDate(ticket.completedAt)} · {t('ticketForm.totalDelay')}: {formatTotalDelay(ticket.createdAt, ticket.completedAt)}</p>
          )}
        </div>
        <span className={`shrink-0 px-2 py-1 rounded-lg text-xs font-medium ${statusBadgeStyle}`}>
          {getStatusLabel(ticket.status)}
        </span>
      </div>
      {hasTimeline && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(!expanded); }}
            className="flex items-center gap-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300"
          >
            <Activity className="w-3.5 h-3.5" />
            {t('ticketForm.statusTimeline')} ({ticket.statusTimeline?.length ?? 0})
            <span className="text-gray-500">{expanded ? '▼' : '▶'}</span>
          </button>
          {expanded && (
            <div className="relative pl-5 mt-2 space-y-2">
              <div className="absolute left-[7px] top-1.5 bottom-1.5 w-0.5 bg-white/10 rounded-full" />
              {(ticket.statusTimeline ?? []).map((entry, idx) => {
                const style = timelineStyles[entry.status] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30';
                const Icon = entry.status === 'COMPLETED' ? CheckCircle : entry.status === 'ON_SITE' ? MapPin : entry.status === 'IN_PROGRESS' ? Activity : Clock;
                return (
                  <div key={idx} className="relative flex items-center gap-2">
                    <span className={`absolute left-0 flex h-4 w-4 items-center justify-center rounded-full border ${style} z-[1]`}>
                      <Icon className="h-2.5 w-2.5" />
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${style}`}>{getStatusLabel(entry.status)}</span>
                    <span className="text-xs text-gray-500">{formatDate(entry.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Ticket = {
  id: string;
  siteName: string | null;
  siteCoordinator: string | null;
  slaHours: number | null;
  technique: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  statusTimeline?: { status: string; createdAt: string }[];
};

type Site = {
  id: string;
  siteId: string;
  location: string;
  province: string;
  ticketCount?: number;
  qualityControlCount?: number;
  enterpriseCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

type SlaStats = { withinSla: number; outOfSla: number; total: number };

export default function TicketDashboardPage() {
  const router = useRouter();
  const params = useParams();
  const t = useTranslations('Index');
  const locale = typeof params?.locale === 'string' ? params.locale : 'en';
  const [user, setUser] = useState<{ id: string; username: string; name: string | null; phone?: string; company?: string | null; companyCertificationUrl?: string | null; status?: string; hasUpdatedCredentials?: boolean; serviceSlug?: string; role?: string } | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; read: boolean; createdAt: string }[]>([]);
  const [slaStats, setSlaStats] = useState<SlaStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountForm, setAccountForm] = useState({ username: '', password: '', passwordConfirm: '', name: '', phone: '', company: '' });
  const [accountUpdating, setAccountUpdating] = useState(false);
  const [accountMessage, setAccountMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [filters, setFilters] = useState({ from: '', to: '', siteName: '', ticketId: '' });
  const [appliedFilters, setAppliedFilters] = useState({ from: '', to: '', siteName: '', ticketId: '' });
  const [ticketFormOpen, setTicketFormOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    siteName: '',
    siteLocations: '',
    slaHours: 24,
    technique: 'maintenance',
    phone: '',
    province: '',
  });
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketMessage, setTicketMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [dashboardSection, setDashboardSection] = useState<'pending' | 'completed' | 'statistics' | 'company' | 'sites'>('pending');
  const [certUploading, setCertUploading] = useState(false);
  const [certUploadProgress, setCertUploadProgress] = useState<number | null>(null);
  const [certMessage, setCertMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [siteFormOpen, setSiteFormOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [siteForm, setSiteForm] = useState({ siteId: '', location: '', province: '' });
  const [siteSubmitting, setSiteSubmitting] = useState(false);
  const [siteMessage, setSiteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [siteFilter, setSiteFilter] = useState('');
  const [selectedSiteForTickets, setSelectedSiteForTickets] = useState<Site | null>(null);
  const [siteTicketsFilter, setSiteTicketsFilter] = useState({ status: '', from: '', to: '' });
  const [exportingSites, setExportingSites] = useState(false);
  const [importingSites, setImportingSites] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const siteFileInputRef = useRef<HTMLInputElement>(null);

  const filteredTicketsForSectionRaw =
    dashboardSection === 'pending'
      ? tickets.filter((tk) => tk.status !== 'COMPLETED')
      : dashboardSection === 'completed'
        ? tickets.filter((tk) => tk.status === 'COMPLETED')
        : [];
  const ticketIdFilter = (appliedFilters.ticketId || '').trim().toLowerCase();
  const filteredTicketsForSection = ticketIdFilter
    ? filteredTicketsForSectionRaw.filter(
        (tk) =>
          tk.id.toLowerCase().includes(ticketIdFilter) ||
          tk.id.slice(-6).toLowerCase().includes(ticketIdFilter)
      )
    : filteredTicketsForSectionRaw;

  const loadData = async () => {
    const params = new URLSearchParams();
    params.set('serviceSlug', 'enterprise-networking');
    if (appliedFilters.from) params.set('from', appliedFilters.from);
    if (appliedFilters.to) params.set('to', appliedFilters.to);
    if (appliedFilters.siteName) params.set('siteName', appliedFilters.siteName);
    const qs = params.toString();
    const [meRes, ticketsRes, notifRes, statsRes] = await Promise.all([
      fetch('/api/auth/requester-me').then((r) => r.json()),
      fetch(`/api/tickets?${qs}`, { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/notifications?for=requester').then((r) => r.json()),
      fetch(`/api/tickets/stats?${qs}`, { credentials: 'include' }).then((r) => r.json()),
    ]);
    if (!meRes.success || !meRes.user) {
      router.replace(`/${locale}/dashboard/login`);
      return;
    }
    setUser(meRes.user);
    if (ticketsRes.success && ticketsRes.tickets) setTickets(ticketsRes.tickets);
    if (notifRes.success && Array.isArray(notifRes.notifications)) setNotifications(notifRes.notifications);
    if (statsRes.success && statsRes.stats) setSlaStats(statsRes.stats);
  };

  const loadSites = async () => {
    setSitesLoading(true);
    try {
      const res = await fetch('/api/sites', { credentials: 'include' });
      const data = await res.json();
      if (data.success && data.sites) setSites(data.sites);
    } catch {
      /* ignore */
    } finally {
      setSitesLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadData()
      .then(() => setLoading(false))
      .catch(() => {
        router.replace(`/${locale}/dashboard/login`);
      });
  }, [router, locale]);

  useEffect(() => {
    if (dashboardSection === 'sites' || ticketFormOpen) {
      loadSites();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardSection, ticketFormOpen]);

  useEffect(() => {
    if (!user) return;
    const validForEn = ENTERPRISE_TECH_KEYS.includes(ticketForm.technique as typeof ENTERPRISE_TECH_KEYS[number]);
    if (!validForEn) {
      setTicketForm((f) => ({ ...f, technique: 'maintenance' }));
    }
  }, [user?.serviceSlug]);

  useEffect(() => {
    const t = setInterval(loadData, 15000);
    return () => clearInterval(t);
  }, [appliedFilters.from, appliedFilters.to, appliedFilters.siteName]);

  const handleLogout = async () => {
    await fetch('/api/auth/requester-logout', { method: 'POST' });
    router.replace(`/${locale}/dashboard/login`);
    router.refresh();
  };

  const handleTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTicketMessage(null);
    if (!ticketForm.siteName.trim() || !ticketForm.siteLocations.trim() || !ticketForm.technique) {
      setTicketMessage({ type: 'error', text: 'Site name, site locations and technique are required.' });
      return;
    }
    setTicketSubmitting(true);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          siteName: ticketForm.siteName.trim(),
          siteCoordinator: ticketForm.siteLocations.trim(),
          slaHours: Number(ticketForm.slaHours) || 24,
          technique: ticketForm.technique,
          phone: ticketForm.phone.trim() || undefined,
          province: ticketForm.province.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTicketMessage({ type: 'success', text: t('ticketForm.successMessage') });
        setTicketForm({ siteName: '', siteLocations: '', slaHours: 24, technique: 'maintenance', phone: '', province: '' });
        loadData();
        setTimeout(() => { setTicketFormOpen(false); setTicketMessage(null); }, 1500);
      } else {
        setTicketMessage({ type: 'error', text: data.message || t('visitorRequestForm.errorMessage') });
      }
    } catch {
      setTicketMessage({ type: 'error', text: t('visitorRequestForm.errorMessage') });
    } finally {
      setTicketSubmitting(false);
    }
  };

  const handleAccountUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountMessage(null);
    if (accountForm.password && accountForm.password !== accountForm.passwordConfirm) {
      setAccountMessage({ type: 'error', text: t('ticketForm.passwordMismatch') });
      return;
    }
    if (accountForm.password && accountForm.password.length < 6) {
      setAccountMessage({ type: 'error', text: t('ticketForm.passwordMinLength') });
      return;
    }
    setAccountUpdating(true);
    try {
      const res = await fetch('/api/auth/requester-update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: accountForm.username.trim() || undefined,
          password: accountForm.password || undefined,
          name: accountForm.name.trim() || undefined,
          phone: accountForm.phone.trim() || undefined,
          company: accountForm.company.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAccountMessage({ type: 'success', text: t('ticketForm.accountUpdated') });
        setAccountForm((f) => ({ ...f, password: '', passwordConfirm: '' }));
        setShowUpdateForm(false);
        if (data.user) setUser((u) => (u ? { ...u, ...data.user, hasUpdatedCredentials: true } : null));
      } else {
        setAccountMessage({ type: 'error', text: data.message || t('ticketForm.updateFailed') });
      }
    } catch {
      setAccountMessage({ type: 'error', text: t('ticketForm.updateFailed') });
    } finally {
      setAccountUpdating(false);
    }
  };

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString(locale === 'ar' ? 'ar-EG' : locale);
    } catch {
      return s;
    }
  };

  const formatTotalDelay = (createdAt: string, completedAt: string) => {
    try {
      const start = new Date(createdAt).getTime();
      const end = new Date(completedAt).getTime();
      const ms = Math.max(0, end - start);
      const sec = Math.floor(ms / 1000);
      const min = Math.floor(sec / 60);
      const hours = Math.floor(min / 60);
      const days = Math.floor(hours / 24);
      if (days > 0) return `${days}d ${hours % 24}h ${min % 60}m`;
      if (hours > 0) return `${hours}h ${min % 60}m`;
      if (min > 0) return `${min}m ${sec % 60}s`;
      return `${sec}s`;
    } catch {
      return '—';
    }
  };

  const getStatusLabel = (status: string) => {
    const key = `ticketForm.status.${status}`;
    const translated = t(key);
    return translated !== key ? translated : status;
  };

  const getTechniqueLabel = (tech: string) => {
    if (ENTERPRISE_TECH_KEYS.includes(tech as typeof ENTERPRISE_TECH_KEYS[number])) {
      const key = `visitorRequestForm.enterpriseTechniques.${tech}`;
      const translated = t(key);
      return translated !== key ? translated : tech;
    }
    if (QUALITY_CONTROL_TECH_KEYS.includes(tech as typeof QUALITY_CONTROL_TECH_KEYS[number])) {
      const key = `visitorRequestForm.qualityControlTechniques.${tech}`;
      const translated = t(key);
      return translated !== key ? translated : tech;
    }
    return tech;
  };

  const handleSiteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSiteMessage(null);
    if (!siteForm.siteId.trim() || !siteForm.location.trim() || !siteForm.province.trim()) {
      setSiteMessage({ type: 'error', text: t('ticketForm.siteRequired') });
      return;
    }
    setSiteSubmitting(true);
    try {
      const url = editingSite ? `/api/sites/${editingSite.id}` : '/api/sites';
      const method = editingSite ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          siteId: siteForm.siteId.trim(),
          location: siteForm.location.trim(),
          province: siteForm.province.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSiteMessage({ type: 'success', text: editingSite ? t('ticketForm.siteUpdated') : t('ticketForm.siteCreated') });
        setSiteForm({ siteId: '', location: '', province: '' });
        setEditingSite(null);
        setSiteFormOpen(false);
        loadSites();
        setTimeout(() => setSiteMessage(null), 2000);
      } else {
        setSiteMessage({ type: 'error', text: data.message || t('ticketForm.siteError') });
      }
    } catch {
      setSiteMessage({ type: 'error', text: t('ticketForm.siteError') });
    } finally {
      setSiteSubmitting(false);
    }
  };

  const getDefaultTechnique = () => 'maintenance';

  const handleOpenTicketFromSite = (site: Site) => {
    setTicketForm({
      siteName: site.siteId,
      siteLocations: site.location,
      slaHours: 24,
      technique: getDefaultTechnique(),
      phone: user?.phone || '',
      province: site.province,
    });
    setTicketFormOpen(true);
    setDashboardSection('pending');
  };

  const handleEditSite = (site: Site) => {
    setEditingSite(site);
    setSiteForm({ siteId: site.siteId, location: site.location, province: site.province });
    setSiteFormOpen(true);
  };

  const handleDeleteSite = async (id: string) => {
    if (!confirm(t('ticketForm.confirmDeleteSite'))) return;
    try {
      const res = await fetch(`/api/sites/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        loadSites();
      }
    } catch {
      /* ignore */
    }
  };

  const handleExportSites = async () => {
    setExportingSites(true);
    try {
      const res = await fetch('/api/sites?export=1', { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sites-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setSiteMessage({ type: 'error', text: t('ticketForm.importError') });
    } finally {
      setExportingSites(false);
    }
  };

  const handleImportSitesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingSites(true);
    setSiteMessage(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const sitesList = Array.isArray(data.sites) ? data.sites : Array.isArray(data) ? data : [];
      if (sitesList.length === 0) {
        setSiteMessage({ type: 'error', text: t('ticketForm.importError') });
        setImportingSites(false);
        if (siteFileInputRef.current) siteFileInputRef.current.value = '';
        return;
      }
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sites: sitesList }),
      });
      const result = await res.json();
      if (result.success) {
        setSiteMessage({ type: 'success', text: `${t('ticketForm.importSuccess')}: ${result.created} created, ${result.skipped} skipped` });
        loadSites();
        setTimeout(() => setSiteMessage(null), 4000);
      } else {
        setSiteMessage({ type: 'error', text: result.message || t('ticketForm.importError') });
      }
    } catch {
      setSiteMessage({ type: 'error', text: t('ticketForm.importError') });
    } finally {
      setImportingSites(false);
      if (siteFileInputRef.current) siteFileInputRef.current.value = '';
    }
  };

  const handleExportDashboardData = async () => {
    setExportingData(true);
    try {
      const res = await fetch('/api/tickets?serviceSlug=enterprise-networking&export=1&format=json', { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `network-dashboard-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setTicketMessage({ type: 'error', text: t('ticketForm.importError') });
    } finally {
      setExportingData(false);
    }
  };

  const filteredSites = siteFilter.trim()
    ? sites.filter((s) => s.siteId.toLowerCase().includes(siteFilter.toLowerCase()))
    : sites;

  const siteTicketsRaw = selectedSiteForTickets
    ? tickets.filter((tk) => (tk.siteName || '').trim() === (selectedSiteForTickets.siteId || '').trim())
    : [];
  const siteTicketsFiltered = siteTicketsRaw.filter((tk) => {
    if (siteTicketsFilter.status && tk.status !== siteTicketsFilter.status) return false;
    if (siteTicketsFilter.from) {
      const d = new Date(tk.createdAt);
      const from = new Date(siteTicketsFilter.from);
      if (d < from) return false;
    }
    if (siteTicketsFilter.to) {
      const d = new Date(tk.createdAt);
      const to = new Date(siteTicketsFilter.to);
      to.setHours(23, 59, 59, 999);
      if (d > to) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
      </div>
    );
  }

  const isRestricted = user?.status === 'SUSPENDED' || user?.status === 'BLOCKED';
  const isCompany = user?.role === 'COMPANY';

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {isRestricted && (
          <div className={`mb-6 rounded-xl border px-4 py-3 ${user?.status === 'BLOCKED' ? 'bg-red-500/20 border-red-500/40 text-red-300' : 'bg-amber-500/20 border-amber-500/40 text-amber-300'}`}>
            <p className="text-sm font-medium">
              {user?.status === 'BLOCKED' ? t('ticketForm.accountBlocked') : t('ticketForm.accountSuspended')}
            </p>
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <ClipboardList className="w-8 h-8 text-cyan-400 shrink-0" />
              {t('ticketForm.myTickets')}
            </h1>
            <p className="text-gray-400 mt-1">
              {user?.name ? `${t('ticketForm.welcome')}, ${user.name}` : `${t('ticketForm.welcome')} (${user?.username})`}
            </p>
            {user && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400">
                <span title={t('visitorRequestForm.phoneLabel')}>{user.phone || '—'}</span>
                <span className="text-white/60">·</span>
                <span title={t('visitorRequestForm.companyLabel')} className="text-cyan-400/90">{user.company || '—'}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isRestricted}
              title={isRestricted ? t('ticketForm.accountSuspended') : undefined}
              onClick={async () => {
                const res = await fetch('/api/auth/requester-me', { credentials: 'include' });
                const data = await res.json();
                if (data.success && data.user) {
                  setTicketForm((f) => ({
                    ...f,
                    phone: data.user.phone || f.phone,
                    province: f.province || 'N/A',
                  }));
                }
                setTicketFormOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-colors"
            >
              <PlusCircle className="w-5 h-5" />
              {t('ticketForm.addTicket')}
            </button>
            <button
              type="button"
              onClick={handleExportDashboardData}
              disabled={exportingData}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-cyan-500/20 text-cyan-400 rounded-xl font-medium transition-colors disabled:opacity-50"
              title={t('ticketForm.exportDashboardData')}
            >
              {exportingData ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
              {t('ticketForm.exportDashboardData')}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2 border border-white/20 rounded-xl text-gray-400 hover:text-white hover:border-white/40 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              {t('ticketForm.logout')}
            </button>
          </div>
        </div>

        {user && (user.hasUpdatedCredentials === true ? !showUpdateForm && (
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setShowUpdateForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 rounded-xl text-sm font-medium transition-colors"
            >
              <UserCog className="w-4 h-4" />
              {t('ticketForm.updateUserInfo')}
            </button>
          </div>
        ) : null)}
        {user && ((!user.hasUpdatedCredentials || showUpdateForm) && (
          <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <UserCog className="w-5 h-5 text-cyan-400" />
              {t('ticketForm.updateAccount')}
            </h3>
            <p className="text-sm text-gray-400 mb-4">{t('ticketForm.updateAccountHint')}</p>
            {user.hasUpdatedCredentials && showUpdateForm && (
              <button
                type="button"
                onClick={() => setShowUpdateForm(false)}
                className="mb-4 text-sm text-gray-400 hover:text-white"
              >
                ← {t('visitorRequestForm.close')}
              </button>
            )}
            {accountMessage && (
              <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${accountMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                {accountMessage.text}
              </div>
            )}
            <form onSubmit={handleAccountUpdate} className="space-y-4 max-w-md">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-400 mb-1">{t('ticketForm.newUsername')}</label>
                <input
                  type="text"
                  value={accountForm.username}
                  onChange={(e) => setAccountForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder={user?.username}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-cyan-500 outline-none text-sm"
                  minLength={3}
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-400 mb-1">{t('ticketForm.newPassword')}</label>
                <input
                  type="password"
                  value={accountForm.password}
                  onChange={(e) => setAccountForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-cyan-500 outline-none text-sm"
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-400 mb-1">{t('ticketForm.confirmPassword')}</label>
                <input
                  type="password"
                  value={accountForm.passwordConfirm}
                  onChange={(e) => setAccountForm((f) => ({ ...f, passwordConfirm: e.target.value }))}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-cyan-500 outline-none text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={accountUpdating || !(
                  (accountForm.username?.trim?.().length >= 3) ||
                  (accountForm.password?.length >= 6) ||
                  (accountForm.name?.trim?.().length ?? 0) > 0 ||
                  (accountForm.phone?.trim?.().length ?? 0) > 0 ||
                  (accountForm.company?.trim?.().length ?? 0) > 0
                )}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg text-white text-sm font-medium"
              >
                {accountUpdating ? '...' : t('ticketForm.saveAccount')}
              </button>
            </form>
          </div>
        ))}

        {/* Global date range & filters - visible for all sections, applies to tickets + stats */}
        <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-semibold text-cyan-400 mb-3 flex items-center gap-2">
            <Filter className="w-4 h-4" />
            {t('ticketForm.filterByDate')} / {t('ticketForm.filterBySite')}
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('ticketForm.filterFrom')}</label>
              <input
                type="date"
                value={filters.from}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('ticketForm.filterTo')}</label>
              <input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('ticketForm.filterBySite')}</label>
              <input
                type="text"
                value={filters.siteName}
                onChange={(e) => setFilters((f) => ({ ...f, siteName: e.target.value }))}
                placeholder={t('ticketForm.filterPlaceholder')}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm min-w-[140px]"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('ticketForm.filterByTicketId') || 'Filter by ticket ID'}</label>
              <input
                type="text"
                value={filters.ticketId}
                onChange={(e) => setFilters((f) => ({ ...f, ticketId: e.target.value }))}
                placeholder="e.g. abc123 or last 6 chars"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm min-w-[120px]"
              />
            </div>
            <button
              type="button"
              onClick={() => { setAppliedFilters({ ...filters }); loadData(); }}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-white text-sm font-medium"
            >
              {t('ticketForm.applyFilter') || 'Apply'}
            </button>
            <button
              type="button"
              onClick={() => {
                const cleared = { from: '', to: '', siteName: '', ticketId: '' };
                setFilters(cleared);
                setAppliedFilters(cleared);
                loadData();
              }}
              className="px-4 py-2 bg-white/10 hover:bg-white/15 text-gray-400 hover:text-white rounded-lg text-sm font-medium"
            >
              {t('ticketForm.clearFilter') || 'Clear'}
            </button>
          </div>
        </div>

        {/* Dashboard navigation */}
        <nav className="flex flex-wrap gap-2 mb-6 border-b border-white/10 pb-4">
          <button
            type="button"
            onClick={() => setDashboardSection('pending')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              dashboardSection === 'pending' ? 'bg-cyan-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Clock className="w-4 h-4" />
            {t('ticketForm.navPending')}
            {tickets.filter((tk) => tk.status !== 'COMPLETED').length > 0 && (
              <span className="bg-amber-500/80 text-white text-xs px-1.5 py-0.5 rounded-full">
                {tickets.filter((tk) => tk.status !== 'COMPLETED').length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setDashboardSection('completed')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              dashboardSection === 'completed' ? 'bg-cyan-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            {t('ticketForm.navCompleted')}
          </button>
          <button
            type="button"
            onClick={() => setDashboardSection('statistics')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              dashboardSection === 'statistics' ? 'bg-cyan-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            {t('ticketForm.navStatistics')}
          </button>
          <button
            type="button"
            onClick={() => setDashboardSection('company')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              dashboardSection === 'company' ? 'bg-cyan-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Building2 className="w-4 h-4" />
            {t('ticketForm.navCompanyInfo')}
          </button>
          <button
            type="button"
            onClick={() => setDashboardSection('sites')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              dashboardSection === 'sites' ? 'bg-cyan-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Map className="w-4 h-4" />
            {t('ticketForm.navSites')}
          </button>
        </nav>

        {notifications.length > 0 && (
          <div className="mb-6 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <h3 className="text-sm font-semibold text-cyan-400 flex items-center gap-2 mb-2">
              <Bell className="w-4 h-4" />
              Notifications
            </h3>
            <ul className="space-y-2 max-h-32 overflow-y-auto">
              {notifications.slice(0, 5).map((n) => (
                <li
                  key={n.id}
                  className={`text-sm ${n.read ? 'text-gray-500' : 'text-gray-300'}`}
                >
                  <span className="font-medium">{n.title}</span> — {n.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {ticketFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => !ticketSubmitting && setTicketFormOpen(false)}>
            <div className="bg-[#0f1419] border border-white/10 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">{t('ticketForm.title')}</h3>
                <button type="button" onClick={() => !ticketSubmitting && setTicketFormOpen(false)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {ticketMessage && (
                <div className={`mb-4 px-4 py-3 rounded-xl text-sm ${ticketMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                  {ticketMessage.text}
                </div>
              )}
              <form onSubmit={handleTicketSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{t('ticketForm.siteName')}</label>
                  {sites.length > 0 ? (
                    <select
                      value={sites.some((s) => s.siteId === ticketForm.siteName) ? ticketForm.siteName : (ticketForm.siteName ? '__manual__' : '')}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '__manual__' || v === '') {
                          setTicketForm((f) => ({ ...f, siteName: v === '__manual__' ? '' : f.siteName, siteLocations: '', province: '' }));
                        } else {
                          const site = sites.find((s) => s.siteId === v);
                          if (site) {
                            setTicketForm((f) => ({ ...f, siteName: site.siteId, siteLocations: site.location, province: site.province }));
                          }
                        }
                      }}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none"
                    >
                      <option value="">— {t('ticketForm.selectFromSites')} —</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.siteId} className="bg-[#0f1419]">
                          {s.siteId} — {s.location}
                        </option>
                      ))}
                      <option value="__manual__" className="bg-[#0f1419]">— {t('ticketForm.typeNewSite')} —</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={ticketForm.siteName}
                      onChange={(e) => setTicketForm((f) => ({ ...f, siteName: e.target.value }))}
                      placeholder={t('ticketForm.siteNamePlaceholder')}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyan-500 outline-none"
                      required
                    />
                  )}
                  {sites.length > 0 && !sites.some((s) => s.siteId === ticketForm.siteName) && (
                    <input
                      type="text"
                      value={ticketForm.siteName}
                      onChange={(e) => setTicketForm((f) => ({ ...f, siteName: e.target.value }))}
                      placeholder={t('ticketForm.siteNamePlaceholder')}
                      className="w-full mt-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyan-500 outline-none"
                      required
                    />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{t('ticketForm.siteLocations')}</label>
                  <input
                    type="text"
                    value={ticketForm.siteLocations}
                    onChange={(e) => setTicketForm((f) => ({ ...f, siteLocations: e.target.value }))}
                    placeholder={t('ticketForm.siteLocationsPlaceholder')}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyan-500 outline-none"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">{t('ticketForm.slaHours')}</label>
                    <input
                      type="number"
                      min={1}
                      max={8760}
                      value={ticketForm.slaHours}
                      onChange={(e) => setTicketForm((f) => ({ ...f, slaHours: parseInt(e.target.value, 10) || 24 }))}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">{t('ticketForm.techniqueLabel')}</label>
                    <select
                      value={ticketForm.technique}
                      onChange={(e) => setTicketForm((f) => ({ ...f, technique: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none"
                      required
                    >
                      {ENTERPRISE_TECH_KEYS.map((key) => (
                        <option key={key} value={key} className="bg-[#0f1419]">
                          {t(`visitorRequestForm.enterpriseTechniques.${key}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{t('visitorRequestForm.phoneLabel')}</label>
                  <input
                    type="tel"
                    value={ticketForm.phone}
                    onChange={(e) => setTicketForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+964..."
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{t('visitorRequestForm.provinceLabel')}</label>
                  <input
                    type="text"
                    value={ticketForm.province}
                    onChange={(e) => setTicketForm((f) => ({ ...f, province: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={ticketSubmitting} className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold rounded-xl">
                    {ticketSubmitting ? '...' : t('ticketForm.submitButton')}
                  </button>
                  <button type="button" onClick={() => !ticketSubmitting && setTicketFormOpen(false)} className="px-5 py-3 border border-white/20 rounded-xl text-gray-400 hover:text-white">
                    {t('visitorRequestForm.close')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {dashboardSection === 'company' && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 mb-6">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <Building2 className="w-5 h-5 text-cyan-400" />
              {t('ticketForm.navCompanyInfo')}
            </h3>
            <p className="text-sm text-gray-400 mb-4">{t('ticketForm.updateAccountHint')}</p>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">{t('visitorRequestForm.nameLabel')}</dt>
                <dd className="text-white font-medium">{user?.name || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{t('visitorRequestForm.phoneLabel')}</dt>
                <dd className="text-white font-medium">{user?.phone || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{t('visitorRequestForm.companyLabel')}</dt>
                <dd className="text-white font-medium">{user?.company ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{t('ticketForm.companyCertification')}</dt>
                <dd className="text-white font-medium">
                  {user?.companyCertificationUrl ? (
                    <a href={user.companyCertificationUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline">
                      {t('ticketForm.viewCertification')}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
            {certMessage && (
              <div className={`mt-3 px-3 py-2 rounded-lg text-sm ${certMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                {certMessage.text}
              </div>
            )}
            {!isRestricted && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-white/10 ${certUploading ? 'bg-white/10 cursor-not-allowed opacity-80' : 'bg-white/10 hover:bg-white/15 cursor-pointer'}`}>
                  <input
                    type="file"
                    accept=".pdf,image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={certUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setCertMessage(null);
                      setCertUploading(true);
                      setCertUploadProgress(0);
                      try {
                        const upData = await uploadWithProgress('/api/upload/certification', file, {
                          credentials: 'include',
                          onProgress: (p) => setCertUploadProgress(p),
                        });
                        if (!upData.success || !upData.url) {
                          setCertMessage({ type: 'error', text: upData.message || t('ticketForm.uploadFailed') });
                          return;
                        }
                        const patchRes = await fetch('/api/auth/requester-update', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ companyCertificationUrl: upData.url }),
                        });
                        const patchData = await patchRes.json();
                        if (patchData.success && patchData.user) {
                          setUser((u) => (u ? { ...u, companyCertificationUrl: patchData.user.companyCertificationUrl } : null));
                          setCertMessage({ type: 'success', text: t('ticketForm.certificationUploaded') });
                        } else {
                          setCertMessage({ type: 'error', text: patchData.message || t('ticketForm.uploadFailed') });
                        }
                      } catch {
                        setCertMessage({ type: 'error', text: t('ticketForm.uploadFailed') });
                      } finally {
                        setCertUploading(false);
                        setCertUploadProgress(null);
                        e.target.value = '';
                      }
                    }}
                  />
                  {certUploading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
                  <span>{certUploading && certUploadProgress != null ? `${t('ticketForm.uploading')} ${certUploadProgress}%` : t('ticketForm.attachCertification')}</span>
                </label>
                {certUploading && certUploadProgress != null && (
                  <div className="w-full max-w-[200px] h-1.5 rounded-full bg-white/10 overflow-hidden mt-1">
                    <div className="h-full bg-cyan-500 rounded-full transition-all duration-200" style={{ width: `${certUploadProgress}%` }} />
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setAccountForm((f) => ({ ...f, name: user?.name ?? '', phone: user?.phone ?? '', company: user?.company ?? '' }));
                setShowUpdateForm(true);
              }}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-white text-sm font-medium"
            >
              <UserCog className="w-4 h-4" />
              {t('ticketForm.updateUserInfo')}
            </button>
          </div>
        )}

        {dashboardSection === 'sites' && (
          <div className="space-y-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Map className="w-5 h-5 text-cyan-400" />
                {t('ticketForm.navSites')}
              </h3>
              {isCompany && !isRestricted && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportSites}
                    disabled={exportingSites || sites.length === 0}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-cyan-500/20 text-cyan-400 rounded-xl text-sm font-medium disabled:opacity-50"
                    title={t('ticketForm.exportSitesHint')}
                  >
                    {exportingSites ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    {t('ticketForm.exportSites')}
                  </button>
                  <button
                    type="button"
                    onClick={() => siteFileInputRef.current?.click()}
                    disabled={importingSites}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-cyan-500/20 text-cyan-400 rounded-xl text-sm font-medium disabled:opacity-50"
                    title={t('ticketForm.importSitesHint')}
                  >
                    {importingSites ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {t('ticketForm.importSites')}
                  </button>
                  <input
                    ref={siteFileInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={handleImportSitesChange}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSite(null);
                      setSiteForm({ siteId: '', location: '', province: '' });
                      setSiteFormOpen(true);
                      setSiteMessage(null);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-white text-sm font-medium"
                  >
                    <PlusCircle className="w-4 h-4" />
                    {t('ticketForm.addSite')}
                  </button>
                </div>
              )}
            </div>

            {/* Filter */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <Filter className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={siteFilter}
                  onChange={(e) => setSiteFilter(e.target.value)}
                  placeholder={t('ticketForm.filterBySiteId')}
                  className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:border-cyan-500 outline-none"
                />
              </div>
            </div>

            {/* Sites List */}
            {sitesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
              </div>
            ) : filteredSites.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
                <Map className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                <p className="text-gray-400">{t('ticketForm.noSites')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredSites.map((site) => (
                  <div
                    key={site.id}
                    className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-5 hover:border-cyan-500/30 transition-all hover:shadow-lg hover:shadow-cyan-500/10"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedSiteForTickets(site)}
                      className="w-full text-left flex items-start justify-between mb-3 rounded-lg -m-1 p-1 hover:bg-white/5 transition-colors"
                    >
                      <div>
                        <h4 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                          <MapPin className="w-5 h-5 text-cyan-400 shrink-0" />
                          {site.siteId}
                        </h4>
                        <p className="text-sm text-gray-400">{site.location}</p>
                        <p className="text-xs text-gray-500 mt-1">{site.province}</p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-xs font-semibold">
                          <ClipboardList className="w-3 h-3" /> EN: {site.enterpriseCount ?? 0}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs font-semibold">
                          <ClipboardList className="w-3 h-3" /> QC: {site.qualityControlCount ?? 0}
                        </span>
                      </div>
                    </button>
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => setSelectedSiteForTickets(site)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-cyan-500/20 text-cyan-400 rounded-lg text-xs font-medium transition-colors"
                      >
                        <ClipboardList className="w-3.5 h-3.5" />
                        View tickets
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenTicketFromSite(site)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-white text-xs font-medium transition-colors"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        {t('ticketForm.openTicket')}
                      </button>
                      {isCompany && !isRestricted && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleEditSite(site)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 rounded-lg text-gray-300 text-xs font-medium transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            {t('ticketForm.updateSite')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSite(site.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 text-xs font-medium transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Site tickets modal */}
            {selectedSiteForTickets && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedSiteForTickets(null)}>
                <div className="bg-[#0A0A0F] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-cyan-400" />
                      {selectedSiteForTickets.siteId} — Related tickets
                    </h3>
                    <button type="button" onClick={() => setSelectedSiteForTickets(null)} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-4 border-b border-white/10 space-y-3 shrink-0">
                    <p className="text-sm text-gray-400">{selectedSiteForTickets.location} · {selectedSiteForTickets.province}</p>
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Status</label>
                        <select
                          value={siteTicketsFilter.status}
                          onChange={(e) => setSiteTicketsFilter((f) => ({ ...f, status: e.target.value }))}
                          className="px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm"
                        >
                          <option value="">All</option>
                          <option value="PENDING">PENDING</option>
                          <option value="ON_SITE">ON_SITE</option>
                          <option value="IN_PROGRESS">IN_PROGRESS</option>
                          <option value="COMPLETED">COMPLETED</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">{t('ticketForm.filterFrom')}</label>
                        <input
                          type="date"
                          value={siteTicketsFilter.from}
                          onChange={(e) => setSiteTicketsFilter((f) => ({ ...f, from: e.target.value }))}
                          className="px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">{t('ticketForm.filterTo')}</label>
                        <input
                          type="date"
                          value={siteTicketsFilter.to}
                          onChange={(e) => setSiteTicketsFilter((f) => ({ ...f, to: e.target.value }))}
                          className="px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    {siteTicketsFiltered.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-8">{t('ticketForm.noTickets')}</p>
                    ) : (
                      <div className="space-y-2">
                        {siteTicketsFiltered.map((ticket) => (
                          <div
                            key={ticket.id}
                            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 hover:border-cyan-500/20 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-white truncate">#{ticket.id.slice(-6)} · {ticket.siteCoordinator || '—'}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{getTechniqueLabel(ticket.technique)} · {formatDate(ticket.createdAt)}</p>
                              </div>
                              <span
                                className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-medium ${
                                  ticket.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' :
                                  ticket.status === 'ON_SITE' ? 'bg-cyan-500/20 text-cyan-400' :
                                  ticket.status === 'IN_PROGRESS' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/20 text-gray-400'
                                }`}
                              >
                                {getStatusLabel(ticket.status)}
                              </span>
                            </div>
                            {ticket.status === 'COMPLETED' && ticket.completedAt && (
                              <p className="text-xs text-emerald-400/90 mt-1">{t('ticketForm.completedAt')}: {formatDate(ticket.completedAt)} · {t('ticketForm.totalDelay')}: {formatTotalDelay(ticket.createdAt, ticket.completedAt)}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Add/Edit Site Form Modal */}
            {siteFormOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-[#0A0A0F] border border-white/10 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">
                      {editingSite ? t('ticketForm.editSite') : t('ticketForm.addSite')}
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setSiteFormOpen(false);
                        setEditingSite(null);
                        setSiteForm({ siteId: '', location: '', province: '' });
                        setSiteMessage(null);
                      }}
                      className="text-gray-400 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  {siteMessage && (
                    <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${siteMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {siteMessage.text}
                    </div>
                  )}
                  <form onSubmit={handleSiteSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">{t('ticketForm.siteId')}</label>
                      <input
                        type="text"
                        value={siteForm.siteId}
                        onChange={(e) => setSiteForm((f) => ({ ...f, siteId: e.target.value }))}
                        placeholder={t('ticketForm.siteIdPlaceholder')}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-cyan-500 outline-none text-sm"
                        required
                        disabled={!!editingSite}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">{t('ticketForm.siteLocation')}</label>
                      <input
                        type="text"
                        value={siteForm.location}
                        onChange={(e) => setSiteForm((f) => ({ ...f, location: e.target.value }))}
                        placeholder={t('ticketForm.siteLocationPlaceholder')}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-cyan-500 outline-none text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">{t('ticketForm.province')}</label>
                      <select
                        value={siteForm.province}
                        onChange={(e) => setSiteForm((f) => ({ ...f, province: e.target.value }))}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-cyan-500 outline-none text-sm"
                        required
                      >
                        <option value="">{t('ticketForm.selectProvince')}</option>
                        <option value="Baghdad">Baghdad</option>
                        <option value="Basra">Basra</option>
                        <option value="Mosul">Mosul</option>
                        <option value="Erbil">Erbil</option>
                        <option value="Najaf">Najaf</option>
                        <option value="Karbala">Karbala</option>
                        <option value="Sulaymaniyah">Sulaymaniyah</option>
                        <option value="Dohuk">Dohuk</option>
                        <option value="Kirkuk">Kirkuk</option>
                        <option value="Ramadi">Ramadi</option>
                        <option value="Samarra">Samarra</option>
                        <option value="Baqubah">Baqubah</option>
                        <option value="Amarah">Amarah</option>
                        <option value="Nasiriyah">Nasiriyah</option>
                        <option value="Diwaniyah">Diwaniyah</option>
                        <option value="Kut">Kut</option>
                        <option value="Hillah">Hillah</option>
                        <option value="Fallujah">Fallujah</option>
                        <option value="Tikrit">Tikrit</option>
                      </select>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={siteSubmitting}
                        className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg text-white text-sm font-medium"
                      >
                        {siteSubmitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (editingSite ? t('ticketForm.updateSite') : t('ticketForm.addSite'))}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSiteFormOpen(false);
                          setEditingSite(null);
                          setSiteForm({ siteId: '', location: '', province: '' });
                          setSiteMessage(null);
                        }}
                        className="px-4 py-2 bg-white/10 hover:bg-white/15 rounded-lg text-gray-300 text-sm font-medium"
                      >
                        {t('visitorRequestForm.close')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {dashboardSection === 'statistics' && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 mb-6">
            <h3 className="text-lg font-semibold text-cyan-400 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              {t('ticketForm.navStatistics')}
            </h3>
            {slaStats != null ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                    <p className="text-2xl font-bold text-white">{tickets.length}</p>
                    <p className="text-xs text-gray-500">Total tickets</p>
                  </div>
                  <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                    <p className="text-2xl font-bold text-white">{tickets.filter((tk) => tk.status !== 'COMPLETED').length}</p>
                    <p className="text-xs text-gray-500">{t('ticketForm.navPending')}</p>
                  </div>
                  <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                    <p className="text-2xl font-bold text-emerald-400">{slaStats.withinSla}</p>
                    <p className="text-xs text-gray-500">{t('ticketForm.withinSla')}</p>
                  </div>
                  <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                    <p className="text-2xl font-bold text-amber-400">{slaStats.outOfSla}</p>
                    <p className="text-xs text-gray-500">{t('ticketForm.outOfSla')}</p>
                  </div>
                </div>
                {(slaStats.withinSla > 0 || slaStats.outOfSla > 0) && (
                  <div className="flex gap-2 h-3 rounded-full overflow-hidden bg-white/5 max-w-md">
                    <div className="bg-emerald-500" style={{ width: slaStats.total ? `${(slaStats.withinSla / slaStats.total) * 100}%` : '0%' }} />
                    <div className="bg-amber-500" style={{ width: slaStats.total ? `${(slaStats.outOfSla / slaStats.total) * 100}%` : '0%' }} />
                  </div>
                )}
              </>
            ) : (
              <p className="text-gray-500 text-sm">No statistics yet.</p>
            )}
          </div>
        )}

        {(dashboardSection === 'pending' || dashboardSection === 'completed') && (
          <>
          {slaStats != null && (slaStats.withinSla > 0 || slaStats.outOfSla > 0) && (
            <div className="mb-6 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-cyan-400 mb-4">{t('ticketForm.slaChart')}</h3>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div className="rounded-xl bg-emerald-500/20 border border-emerald-500/30 p-4">
                  <p className="text-2xl font-bold text-emerald-400">{slaStats.withinSla}</p>
                  <p className="text-sm text-gray-400">{t('ticketForm.withinSla')}</p>
                </div>
                <div className="rounded-xl bg-amber-500/20 border border-amber-500/30 p-4">
                  <p className="text-2xl font-bold text-amber-400">{slaStats.outOfSla}</p>
                  <p className="text-sm text-gray-400">{t('ticketForm.outOfSla')}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2 h-3 rounded-full overflow-hidden bg-white/5 max-w-md">
                <div
                  className="bg-emerald-500 transition-all"
                  style={{ width: slaStats.total ? `${(slaStats.withinSla / slaStats.total) * 100}%` : '0%' }}
                />
                <div
                  className="bg-amber-500 transition-all"
                  style={{ width: slaStats.total ? `${(slaStats.outOfSla / slaStats.total) * 100}%` : '0%' }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end mb-4">
            {dashboardSection === 'pending' && (
              <button
                type="button"
                onClick={async () => {
                  const res = await fetch('/api/auth/requester-me', { credentials: 'include' });
                  const data = await res.json();
                  if (data.success && data.user) {
                    setTicketForm((f) => ({ ...f, phone: data.user.phone || f.phone, province: f.province || 'N/A' }));
                  }
                  setTicketFormOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-white text-sm font-medium"
              >
                <PlusCircle className="w-4 h-4" />
                {t('ticketForm.addTicket')}
              </button>
            )}
          </div>
          {filteredTicketsForSection.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-gray-400">
              <p className="mb-4">{dashboardSection === 'pending' ? t('ticketForm.noTickets') : 'No completed tickets.'}</p>
              {dashboardSection === 'pending' && (
                <button
                  type="button"
                  onClick={async () => {
                    const res = await fetch('/api/auth/requester-me', { credentials: 'include' });
                    const data = await res.json();
                    if (data.success && data.user) {
                      setTicketForm((f) => ({ ...f, phone: data.user.phone || f.phone, province: f.province || 'N/A' }));
                    }
                    setTicketFormOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-5 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-medium text-white"
                >
                  <PlusCircle className="w-5 h-5" />
                  {t('ticketForm.addTicket')}
                </button>
              )}
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredTicketsForSection.map((ticket) => (
              <Link key={ticket.id} href={`/dashboard/tickets/${ticket.id}`} className="block focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 focus:ring-offset-[#0A0A0F] rounded-xl">
                <TicketCard
                  ticket={ticket}
                  t={t}
                  formatDate={formatDate}
                  formatTotalDelay={formatTotalDelay}
                  getTechniqueLabel={getTechniqueLabel}
                  getStatusLabel={getStatusLabel}
                />
              </Link>
            ))}
          </div>
          )}
          </>
        )}

        <p className="mt-8 text-center text-sm text-gray-500">
          <Link href="/" className="text-cyan-400 hover:text-cyan-300">
            {t('ticketForm.backToHome')}
          </Link>
        </p>
      </div>
    </div>
  );
}
