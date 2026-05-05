'use client';

import React, { useState, useEffect, useRef } from 'react';
import { uploadWithProgress } from '@/lib/upload-with-progress';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ClipboardList, LogOut, Loader2, PlusCircle, X, BarChart3, Building2, MapPin, Activity, Map, Edit2, Trash2, Filter, ShieldCheck, FileText, Paperclip, TrendingUp, TrendingDown, Minus, Download, Upload } from 'lucide-react';

const QUALITY_CONTROL_TECH_KEYS = ['inspection', 'supervision', 'building', 'hse', 'investigation', 'tracking'] as const;

type Ticket = {
  id: string;
  siteName: string | null;
  siteCoordinator: string | null;
  slaHours: number | null;
  technique: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  inspectionResult?: string | null;
  statusTimeline?: { status: string; createdAt: string }[];
  ncrReason?: string | null;
  ncrImageUrls?: string[];
  ncrResubmissions?: Array<{ at: string; by: string; action: string; comment?: string | null; imageUrls?: string[] }>;
};

type Site = {
  id: string;
  siteId: string;
  location: string;
  province: string;
  ticketCount?: number;
  qualityControlCount?: number;
  enterpriseCount?: number;
  inspectionQcCount?: number;
  maintenanceQcCount?: number;
  inspectionHoursTotal?: number;
  maintenanceHoursTotal?: number;
  createdAt?: string;
  updatedAt?: string;
};

type SlaStats = {
  withinSla: number;
  outOfSla: number;
  total: number;
  inspectionStats?: InspectionCounts;
  inspectionTrend?: InspectionCounts;
  ticketsByCategory?: Record<string, number>;
  ticketsByRoleScope?: Record<string, number>;
  ticketsByStatus?: Record<string, number>;
  usersByRole?: Record<string, number>;
};
type InspectionCounts = { total: number; accepted: number; accepted_with_comments: number; not_accepted: number; ncr: number; in_progress: number };

type CompanyDashboardPayload = {
  totalStaff: number;
  totalTickets: number;
  staffByRole?: Record<string, number>;
  ticketsByRoleScope?: Record<string, number>;
  ticketsByCategory?: Record<string, number>;
  ticketsByStatus?: Record<string, number>;
  departmentPerformance?: Record<
    string,
    {
      totalTasks: number;
      inProgress: number;
      pending: number;
      withInSla: number;
      overSla: number;
      totalDelays: number;
      inspectionResults: number;
    }
  >;
  staffPerformance?: Array<{
    userId: string;
    role: string;
    status: string;
    assigned: number;
    completed: number;
    needsEdit: number;
    resubmitted: number;
  }>;
};

export default function QualityControlDashboardPage() {
  const router = useRouter();
  const params = useParams();
  const t = useTranslations('Index');
  const locale = typeof params?.locale === 'string' ? params.locale : 'en';
  const [user, setUser] = useState<{
    id: string;
    username: string;
    name: string | null;
    phone?: string;
    company?: string | null;
    companyCertificationUrl?: string | null;
    serviceSlug?: string;
    role?: string;
    companyId?: string | null;
    linkedCoordinatorCompanyId?: string | null;
  } | null>(null);
  const [provisorStaff, setProvisorStaff] = useState<Array<{ id: string; username: string; email: string; role: string; name?: string | null }>>([]);
  const [provisorChecklists, setProvisorChecklists] = useState<Array<{ id: string; name: string; taskCategory?: string | null }>>([]);
  const [provisorBilling, setProvisorBilling] = useState<{
    freeTicketsUsed: number;
    freeTicketsLimit: number;
    activeTicketPlan: string | null;
    activeRateUsd: number | null;
  } | null>(null);
  const [provisorLoading, setProvisorLoading] = useState(false);
  const [provisorMsg, setProvisorMsg] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [ticketFormOpen, setTicketFormOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    siteName: '',
    siteLocations: '',
    slaHours: 24,
    technique: 'inspection' as string,
    phone: '',
    province: '',
    designSpecifications: '',
    taskCategory: 'QUALITY' as 'MAINTENANCE' | 'QUALITY' | 'SUPERVISION',
    checklistTemplateId: '',
    assignmentScope: 'COMPANY_STAFF' as 'COMPANY_STAFF' | 'USMART_STAFF',
    assigneeCoordinatorUserId: '',
    resubmitToRequester: false,
  });
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentUploadProgress, setAttachmentUploadProgress] = useState<number | null>(null);
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketMessage, setTicketMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [dashboardSection, setDashboardSection] = useState<'pending' | 'completed' | 'ncr' | 'company' | 'sites'>('pending');
  const [slaStats, setSlaStats] = useState<SlaStats | null>(null);
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
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [ticketListFilter, setTicketListFilter] = useState({ result: '', siteName: '', ticketId: '' });
  const [dashboardFilters, setDashboardFilters] = useState({ from: '', to: '', siteName: '', ticketId: '' });
  const [appliedDashboardFilters, setAppliedDashboardFilters] = useState({ from: '', to: '', siteName: '', ticketId: '' });
  const [exportingSites, setExportingSites] = useState(false);
  const [importingSites, setImportingSites] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const siteFileInputRef = useRef<HTMLInputElement>(null);
  const [qcTechniques, setQcTechniques] = useState<{ slug: string; labelAr: string; labelEn: string | null }[]>([]);
  const [companyDashboard, setCompanyDashboard] = useState<CompanyDashboardPayload | null>(null);

  const loadData = async () => {
    const params = new URLSearchParams();
    params.set('serviceSlug', 'quality-control-supervision');
    if (appliedDashboardFilters.from) params.set('from', appliedDashboardFilters.from);
    if (appliedDashboardFilters.to) params.set('to', appliedDashboardFilters.to);
    if (appliedDashboardFilters.siteName) params.set('siteName', appliedDashboardFilters.siteName);
    const qs = `?${params.toString()}`;
    const [meRes, ticketsRes, statsRes, techRes] = await Promise.all([
      fetch('/api/auth/requester-me', { credentials: 'include' }).then((r) => r.json()),
      fetch(`/api/tickets${qs}`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`/api/tickets/stats${qs}`, { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/provisor-techniques', { credentials: 'include' }).then((r) => r.json()),
    ]);
    if (!meRes.success || !meRes.user) {
      router.replace(`/${locale}/dashboard/login`);
      return;
    }
    setUser(meRes.user);

    const isCompanyRole = ['COMPANY_OWNER', 'COORDINATOR', 'MANAGER', 'TEAM_LEADER', 'ADMIN', 'COMPANY'].includes(String(meRes.user.role ?? ''));
    const coordRoles = ['COMPANY_OWNER', 'COORDINATOR', 'MANAGER', 'TEAM_LEADER', 'ADMIN', 'COMPANY'];
    if (
      isCompanyRole &&
      coordRoles.includes(String(meRes.user.role ?? ''))
    ) {
      try {
        const [clRes, stRes] = await Promise.all([
          fetch('/api/inspection-checklists', { credentials: 'include' }).then((r) => r.json()),
          fetch('/api/company/staff', { credentials: 'include' }).then((r) => r.json()),
        ]);
        if (clRes.success && Array.isArray(clRes.checklists)) {
          setProvisorChecklists(clRes.checklists);
        }
        if (stRes.success && Array.isArray(stRes.users)) {
          setProvisorStaff(stRes.users);
        }
      } catch {
        /* ignore */
      }
    }

    if (ticketsRes.success && ticketsRes.tickets) setTickets(ticketsRes.tickets);
    if (statsRes.success && statsRes.stats) setSlaStats(statsRes.stats);
    if (techRes.success && Array.isArray(techRes.inspection)) setQcTechniques(techRes.inspection);

    if (isCompanyRole) {
      try {
        const dashParams = new URLSearchParams();
        if (appliedDashboardFilters.from) dashParams.set('from', appliedDashboardFilters.from);
        if (appliedDashboardFilters.to) dashParams.set('to', appliedDashboardFilters.to);
        const dashRes = await fetch(`/api/company/dashboard?${dashParams.toString()}`, { credentials: 'include' }).then((r) =>
          r.json(),
        );
        if (dashRes.success && dashRes.dashboard) {
          setCompanyDashboard(dashRes.dashboard as CompanyDashboardPayload);
        } else {
          setCompanyDashboard(null);
        }
      } catch {
        setCompanyDashboard(null);
      }
    } else {
      setCompanyDashboard(null);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setLoading(true);
    loadData().then(() => setLoading(false)).catch(() => router.replace(`/${locale}/dashboard/login`));
  }, [router, locale, appliedDashboardFilters.from, appliedDashboardFilters.to, appliedDashboardFilters.siteName]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = setInterval(loadData, 15000);
    return () => clearInterval(id);
  }, [appliedDashboardFilters.from, appliedDashboardFilters.to, appliedDashboardFilters.siteName]);

  const isCompany = Boolean(
    user?.role === 'COMPANY' ||
    user?.role === 'COMPANY_OWNER' ||
    user?.role === 'COORDINATOR' ||
    user?.role === 'MANAGER' ||
    user?.role === 'TEAM_LEADER' ||
    user?.role === 'ADMIN',
  );
  const canManageSites =
    user?.role === 'COMPANY' ||
    user?.role === 'PERSONAL' ||
    user?.role === 'COMPANY_OWNER' ||
    user?.role === 'COORDINATOR' ||
    user?.role === 'MANAGER' ||
    user?.role === 'TEAM_LEADER' ||
    user?.role === 'ADMIN' ||
    user?.role === 'ENGINEER';
  const effectiveCompanyId = user?.companyId ?? user?.linkedCoordinatorCompanyId;
  // Company hub is available for all company-type roles.
  const canUseProvisorHub =
    user?.serviceSlug === 'quality-control-supervision' &&
    ['COMPANY_OWNER', 'COORDINATOR', 'MANAGER', 'TEAM_LEADER', 'ADMIN', 'COMPANY'].includes(String(user?.role ?? ''));

  /** API requires taskCategory + checklist for coordinator JWT (owner / coordinator / platform admin). */
  const canCreateCoordinatorTasks =
    Boolean(effectiveCompanyId) &&
    ['COMPANY_OWNER', 'COORDINATOR', 'MANAGER', 'TEAM_LEADER', 'ADMIN', 'COMPANY'].includes(String(user?.role ?? ''));
  /** Legacy requester (no companyId) can post simple tickets; coordinator staff cannot create. */
  const canOpenTicketForm = !user?.companyId || canCreateCoordinatorTasks;
  const isPersonal = user?.role === 'PERSONAL';

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
    if (dashboardSection === 'sites') loadSites();
  }, [dashboardSection]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ticketFormOpen && sites.length === 0 && !sitesLoading) loadSites();
  }, [ticketFormOpen, sites.length, sitesLoading]);

  const [staffForm, setStaffForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: 'TECHNICIAN',
    departments: '',
    privileges: '',
  });
  const [checklistForm, setChecklistForm] = useState({ name: '', taskCategory: 'QUALITY', techniqueTypes: 'inspection' });

  useEffect(() => {
    if (dashboardSection !== 'company' || !canUseProvisorHub) return;
    let cancelled = false;
    (async () => {
      setProvisorLoading(true);
      setProvisorMsg(null);
      try {
        const [s, c, b] = await Promise.all([
          fetch('/api/company/staff', { credentials: 'include' }).then((r) => r.json()),
          fetch('/api/inspection-checklists', { credentials: 'include' }).then((r) => r.json()),
          fetch('/api/company/billing/plan', { credentials: 'include' }).then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (s.success && Array.isArray(s.users)) setProvisorStaff(s.users);
        else setProvisorStaff([]);
        if (c.success && Array.isArray(c.checklists)) setProvisorChecklists(c.checklists);
        else setProvisorChecklists([]);
        if (b.success && b.billing) setProvisorBilling(b.billing);
        else setProvisorBilling(null);
        if (!s.success && !c.success && !b.success) {
          setProvisorMsg(
            'Could not load staff, checklists, or billing. Company owners should sign in with the same username and password as the web dashboard so your session includes the provider company.'
          );
        }
      } catch {
        if (!cancelled) setProvisorMsg('Could not load provider tools.');
      } finally {
        if (!cancelled) setProvisorLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dashboardSection, canUseProvisorHub, user?.id]);

  const submitStaffInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisorMsg(null);
    if (!staffForm.firstName.trim() || !staffForm.email.trim()) {
      setProvisorMsg('First name and email are required.');
      return;
    }
    setProvisorLoading(true);
    try {
      const res = await fetch('/api/company/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName: staffForm.firstName.trim(),
          lastName: staffForm.lastName.trim(),
          email: staffForm.email.trim(),
          role: staffForm.role,
          departments: staffForm.departments
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          privileges: staffForm.privileges
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setProvisorMsg(data.message || 'Failed to create staff');
        return;
      }
      setStaffForm({ firstName: '', lastName: '', email: '', role: 'TECHNICIAN', departments: '', privileges: '' });
      const list = await fetch('/api/company/staff', { credentials: 'include' }).then((r) => r.json());
      if (list.success && Array.isArray(list.users)) setProvisorStaff(list.users);
      setProvisorMsg(
        `User created. Username: ${data.credentials?.username ?? data.user?.username ?? '—'} · Temporary password: ${data.credentials?.temporaryPassword ?? '—'} (share securely; they must change it on first login.)`
      );
    } catch {
      setProvisorMsg('Failed to create staff');
    } finally {
      setProvisorLoading(false);
    }
  };

  const submitChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisorMsg(null);
    if (!checklistForm.name.trim()) {
      setProvisorMsg('Checklist name is required.');
      return;
    }
    setProvisorLoading(true);
    try {
      const techniqueTypes = checklistForm.techniqueTypes
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const res = await fetch('/api/inspection-checklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: checklistForm.name.trim(),
          taskCategory: checklistForm.taskCategory,
          techniqueTypes,
          items: [{ label: 'Item 1 — replace with your checklist steps', weight: 'minor' }],
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setProvisorMsg(data.message || 'Failed to create checklist');
        return;
      }
      setChecklistForm({ name: '', taskCategory: 'QUALITY', techniqueTypes: 'inspection' });
      const list = await fetch('/api/inspection-checklists', { credentials: 'include' }).then((r) => r.json());
      if (list.success && Array.isArray(list.checklists)) setProvisorChecklists(list.checklists);
      setProvisorMsg('Checklist saved. Edit items from admin or recreate with full item list via API.');
    } catch {
      setProvisorMsg('Failed to create checklist');
    } finally {
      setProvisorLoading(false);
    }
  };

  const activateBillingPlan = async (plan: 'WEEKLY' | 'MONTHLY' | 'YEARLY') => {
    setProvisorMsg(null);
    setProvisorLoading(true);
    try {
      const res = await fetch('/api/company/billing/plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!data.success) {
        setProvisorMsg(data.message || 'Could not activate plan');
        return;
      }
      if (data.billing) setProvisorBilling(data.billing);
      setProvisorMsg(`Billing plan set to ${plan}. Per-ticket rate applies after free quota.`);
    } catch {
      setProvisorMsg('Could not activate plan');
    } finally {
      setProvisorLoading(false);
    }
  };

  const handleSiteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSiteMessage(null);
    if (!(siteForm.siteId ?? '').trim() || !(siteForm.location ?? '').trim() || !(siteForm.province ?? '').trim()) {
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
          siteId: (siteForm.siteId ?? '').trim(),
          location: (siteForm.location ?? '').trim(),
          province: (siteForm.province ?? '').trim(),
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

  const handleOpenTicketFromSite = (site: Site) => {
    setTicketForm({
      siteName: site.siteId,
      siteLocations: site.location,
      slaHours: 24,
      technique: 'inspection',
      phone: user?.phone || '',
      province: site.province,
      designSpecifications: '',
      taskCategory: 'QUALITY',
      checklistTemplateId: '',
      assignmentScope: 'COMPANY_STAFF',
      assigneeCoordinatorUserId: '',
      resubmitToRequester: false,
    });
    setSelectedSiteId(site.siteId);
    setTicketFormOpen(true);
    setDashboardSection('pending');
  };

  const handleEditSite = (site: Site) => {
    setEditingSite(site);
    setSiteForm({ siteId: site.siteId, location: site.location, province: site.province });
    setSiteFormOpen(true);
    setSiteMessage(null);
  };

  const handleDeleteSite = async (id: string) => {
    if (!confirm(t('ticketForm.confirmDeleteSite'))) return;
    try {
      const res = await fetch(`/api/sites/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) loadSites();
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
      const res = await fetch('/api/tickets?serviceSlug=quality-control-supervision&export=1&format=json', { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quality-dashboard-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setTicketMessage({ type: 'error', text: t('ticketForm.importError') });
    } finally {
      setExportingData(false);
    }
  };

  const filteredSites = (siteFilter ?? '').trim()
    ? sites.filter((s) => s.siteId.toLowerCase().includes(siteFilter.toLowerCase()))
    : sites;

  const siteTicketsRaw = selectedSiteForTickets
    ? tickets.filter((tk) => (tk.siteName ?? '').trim() === (selectedSiteForTickets?.siteId ?? '').trim())
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

  const handleLogout = async () => {
    await fetch('/api/auth/requester-logout', { method: 'POST' });
    router.replace(`/${locale}/dashboard/login`);
    router.refresh();
  };

  const handleTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTicketMessage(null);
    const siteName = (ticketForm.siteName ?? '').trim();
    const siteLocations = (ticketForm.siteLocations ?? '').trim();
    const technique = (ticketForm.technique ?? '').trim();
    if (!siteName || !siteLocations || !technique) {
      setTicketMessage({ type: 'error', text: 'Site name, site locations and technique are required.' });
      return;
    }
    if (canCreateCoordinatorTasks) {
      if (!ticketForm.checklistTemplateId.trim()) {
        setTicketMessage({
          type: 'error',
          text: 'Choose a checklist template (create one under Company → Provider hub if none appear).',
        });
        return;
      }
    }

    setTicketSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        siteName,
        siteCoordinator: siteLocations,
        slaHours: Number(ticketForm.slaHours) || 24,
        technique,
        name: (user?.name ?? '').trim() || undefined,
        phone: (ticketForm.phone ?? '').trim() || undefined,
        province: (ticketForm.province ?? '').trim() || undefined,
        company: (user?.company ?? '').trim() || undefined,
        designSpecifications: (ticketForm.designSpecifications ?? '').trim() || undefined,
        attachmentUrls: attachmentUrls.length > 0 ? attachmentUrls : undefined,
      };
      if (canCreateCoordinatorTasks) {
        payload.taskCategory = ticketForm.taskCategory;
        payload.checklistTemplateId = ticketForm.checklistTemplateId.trim();
        payload.assignmentScope = ticketForm.assignmentScope;
        if (ticketForm.assigneeCoordinatorUserId.trim()) {
          payload.assigneeCoordinatorUserId = ticketForm.assigneeCoordinatorUserId.trim();
        }
        payload.resubmitToRequester = ticketForm.resubmitToRequester;
      }
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      let data: { success?: boolean; message?: string };
      try {
        data = await res.json();
      } catch {
        setTicketMessage({
          type: 'error',
          text: res.ok ? t('visitorRequestForm.errorMessage') : `${t('visitorRequestForm.errorMessage')} (${res.status})`,
        });
        return;
      }
      if (data.success) {
        setTicketMessage({ type: 'success', text: t('ticketForm.successMessage') });
        setTicketForm({
          siteName: '',
          siteLocations: '',
          slaHours: 24,
          technique: 'inspection',
          phone: '',
          province: '',
          designSpecifications: '',
          taskCategory: 'QUALITY',
          checklistTemplateId: '',
          assignmentScope: 'COMPANY_STAFF',
          assigneeCoordinatorUserId: '',
          resubmitToRequester: false,
        });
        setAttachmentUrls([]);
        setSelectedSiteId('');
        loadData();
        setTimeout(() => { setTicketFormOpen(false); setTicketMessage(null); }, 1500);
      } else {
        setTicketMessage({ type: 'error', text: (data as { message?: string }).message || t('visitorRequestForm.errorMessage') });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('visitorRequestForm.errorMessage');
      setTicketMessage({ type: 'error', text: msg });
    } finally {
      setTicketSubmitting(false);
    }
  };

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString(locale);
    } catch {
      return s;
    }
  };

  const formatTotalDelay = (created: string, completed: string) => {
    try {
      const a = new Date(created).getTime();
      const b = new Date(completed).getTime();
      const hours = Math.round((b - a) / (1000 * 60 * 60));
      return hours <= 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
    } catch {
      return '—';
    }
  };

  const getTechniqueLabel = (tech: string) => {
    const row = qcTechniques.find((x) => x.slug === tech);
    if (row) {
      return locale === 'ar' || locale === 'ku' ? row.labelAr : (row.labelEn || row.labelAr);
    }
    if (QUALITY_CONTROL_TECH_KEYS.includes(tech as typeof QUALITY_CONTROL_TECH_KEYS[number])) {
      const key = `visitorRequestForm.qualityControlTechniques.${tech}`;
      const translated = t(key);
      return translated !== key ? translated : tech;
    }
    return tech;
  };

  const fmtSiteHours = (h: number | undefined) => {
    const v = typeof h === 'number' && !Number.isNaN(h) ? h : 0;
    if (v <= 0) return '0';
    return v < 1 ? v.toFixed(2) : v.toFixed(1);
  };

  const getStatusLabel = (status: string) => {
    const key = `ticketForm.status.${status}`;
    const translated = t(key);
    return translated !== key ? translated : status;
  };

  const baseFilteredTickets = dashboardSection === 'pending'
    ? tickets.filter((tk) => tk.status !== 'COMPLETED')
    : dashboardSection === 'ncr'
      ? tickets.filter((tk) => (tk.inspectionResult || '').toLowerCase() === 'ncr' || (tk.ncrResubmissions?.length ?? 0) > 0)
      : tickets.filter((tk) => tk.status === 'COMPLETED');

  const roleForTaskCategory: Record<
    string,
    'QUALITY_ENGINEER' | 'SUPERVISION_ENGINEER' | 'TECHNICIAN'
  > = {
    QUALITY: 'QUALITY_ENGINEER',
    SUPERVISION: 'SUPERVISION_ENGINEER',
    MAINTENANCE: 'TECHNICIAN',
  };
  const assigneeRoleFilter = roleForTaskCategory[ticketForm.taskCategory];
  const assigneeOptions = provisorStaff.filter((u) => u.role === assigneeRoleFilter);
  const checklistOptions = provisorChecklists.filter(
    (c) => !c.taskCategory || c.taskCategory === ticketForm.taskCategory,
  );

  const filteredTickets = baseFilteredTickets.filter((tk) => {
    if (appliedDashboardFilters.ticketId.trim()) {
      const q = appliedDashboardFilters.ticketId.trim().toLowerCase();
      if (!tk.id.toLowerCase().includes(q)) return false;
    }
    if (ticketListFilter.result) {
      const r = (tk.inspectionResult ?? '').toLowerCase();
      if (r !== ticketListFilter.result.toLowerCase()) return false;
    }
    if (ticketListFilter.siteName.trim()) {
      const sn = (tk.siteName ?? '').toLowerCase();
      const coord = (tk.siteCoordinator ?? '').toLowerCase();
      const q = ticketListFilter.siteName.trim().toLowerCase();
      if (!sn.includes(q) && !coord.includes(q)) return false;
    }
    if (ticketListFilter.ticketId.trim()) {
      const q = ticketListFilter.ticketId.trim().toLowerCase();
      if (!tk.id.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-8 h-8 text-amber-400 shrink-0" />
              {t('ticketForm.myTickets')}
            </h1>
            <p className="text-amber-400/80 text-sm mt-1">Quality Control & Supervision</p>
            <p className="text-gray-400 mt-1">
              {user?.name ? `${t('ticketForm.welcome')}, ${user.name}` : `${t('ticketForm.welcome')} (${user?.username})`}
            </p>
            {user && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400">
                <span title={t('visitorRequestForm.phoneLabel')}>{user.phone || '—'}</span>
                <span className="text-white/60">·</span>
                <span title={t('visitorRequestForm.companyLabel')} className="text-amber-400/90">{user.company || '—'}</span>
              </div>
            )}
            {canCreateCoordinatorTasks && provisorChecklists.length === 0 && (
              <div className="mt-4 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                <strong className="text-amber-300">Coordinator tasks need a checklist.</strong>{' '}
                Open <span className="text-white font-medium">Company</span>, create at least one checklist under Provider hub, then add a ticket and pick task type (Quality / Supervision / Maintenance).
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                if (!canOpenTicketForm) return;
                const res = await fetch('/api/auth/requester-me', { credentials: 'include' });
                const data = await res.json();
                if (data.success && data.user) {
                  setTicketForm((f) => ({ ...f, phone: data.user.phone || f.phone, province: f.province || 'N/A' }));
                }
                setSelectedSiteId('');
                setAttachmentUrls([]);
                setTicketForm((f) => ({ ...f, designSpecifications: '' }));
                setTicketFormOpen(true);
              }}
              disabled={!canOpenTicketForm}
              title={
                canOpenTicketForm
                  ? undefined
                  : 'Only company owner or coordinator can create tasks for this company account.'
              }
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-xl text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <PlusCircle className="w-5 h-5" />
              {t('ticketForm.addTicket')}
            </button>
            <button
              type="button"
              onClick={handleExportDashboardData}
              disabled={exportingData}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-amber-500/20 text-amber-400 rounded-xl font-medium transition-colors disabled:opacity-50"
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

        {/* Global date range & filters - applies to tickets + stats for both company and engineer */}
        <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
            <Filter className="w-4 h-4" />
            {t('ticketForm.filterByDate') || 'Filter by date'} / {t('ticketForm.filterBySite') || 'Filter by site'}
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('ticketForm.filterFrom') || 'From'}</label>
              <input
                type="date"
                value={dashboardFilters.from}
                onChange={(e) => setDashboardFilters((f) => ({ ...f, from: e.target.value }))}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('ticketForm.filterTo') || 'To'}</label>
              <input
                type="date"
                value={dashboardFilters.to}
                onChange={(e) => setDashboardFilters((f) => ({ ...f, to: e.target.value }))}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('ticketForm.filterBySite') || 'Site'}</label>
              <input
                type="text"
                value={dashboardFilters.siteName}
                onChange={(e) => setDashboardFilters((f) => ({ ...f, siteName: e.target.value }))}
                placeholder={t('ticketForm.filterPlaceholder') || 'Site name'}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm min-w-[140px]"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('ticketForm.filterByTicketId') || 'Ticket ID'}</label>
              <input
                type="text"
                value={dashboardFilters.ticketId}
                onChange={(e) => setDashboardFilters((f) => ({ ...f, ticketId: e.target.value }))}
                placeholder="e.g. abc123"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm min-w-[120px]"
              />
            </div>
            <button
              type="button"
              onClick={() => setAppliedDashboardFilters({ ...dashboardFilters })}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-white text-sm font-medium"
            >
              {t('ticketForm.applyFilter') || 'Apply'}
            </button>
            <button
              type="button"
              onClick={() => {
                const cleared = { from: '', to: '', siteName: '', ticketId: '' };
                setDashboardFilters(cleared);
                setAppliedDashboardFilters(cleared);
              }}
              className="px-4 py-2 bg-white/10 hover:bg-white/15 text-gray-400 hover:text-white rounded-lg text-sm font-medium"
            >
              {t('ticketForm.clearFilter') || 'Clear'}
            </button>
          </div>
        </div>

        {slaStats && slaStats.total > 0 && (
          <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <h3 className="text-sm font-semibold text-amber-400 mb-2 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              {t('ticketForm.slaChart')}
            </h3>
            <div className="flex gap-4 text-sm">
              <span className="text-emerald-400">{t('ticketForm.withinSla')}: {slaStats.withinSla}</span>
              <span className="text-amber-400">{t('ticketForm.outOfSla')}: {slaStats.outOfSla}</span>
            </div>
          </div>
        )}

        {slaStats?.inspectionStats && (
          <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <h3 className="text-sm font-semibold text-amber-400 mb-4 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Inspection statistics
            </h3>
            {(() => {
              const s = slaStats.inspectionStats;
              const prev = slaStats.inspectionTrend ?? { total: 0, accepted: 0, accepted_with_comments: 0, not_accepted: 0, ncr: 0, in_progress: 0 };
              const trend = (curr: number, past: number) => curr > past ? 'up' : curr < past ? 'down' : 'same';
              const TrendIcon = ({ curr, past }: { curr: number; past: number }) => {
                const t = trend(curr, past);
                if (t === 'up') return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
                if (t === 'down') return <TrendingDown className="w-3.5 h-3.5 text-amber-400" />;
                return <Minus className="w-3.5 h-3.5 text-gray-400" />;
              };
              const cards = [
                { label: 'Total inspections', value: s.total, prev: prev.total, color: 'text-amber-400' },
                { label: 'Accepted', value: s.accepted, prev: prev.accepted, color: 'text-emerald-400' },
                { label: 'Accepted w/ comments', value: s.accepted_with_comments, prev: prev.accepted_with_comments, color: 'text-emerald-300' },
                { label: 'NOT accepted', value: s.not_accepted, prev: prev.not_accepted, color: 'text-red-400' },
                { label: 'NCR', value: s.ncr, prev: prev.ncr, color: 'text-rose-400' },
                { label: 'In progress', value: s.in_progress, prev: prev.in_progress, color: 'text-cyan-400' },
              ];
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {cards.map(({ label, value, prev, color }) => (
                    <div key={label} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                      <div className="flex items-center gap-1.5">
                        <span className={`font-semibold ${color}`}>{value}</span>
                        <TrendIcon curr={value} past={prev} />
                      </div>
                      {prev > 0 && <p className="text-[10px] text-gray-500 mt-0.5">Prev: {prev}</p>}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {(slaStats?.ticketsByCategory ||
          slaStats?.usersByRole ||
          (slaStats?.ticketsByRoleScope && Object.keys(slaStats.ticketsByRoleScope).length > 0) ||
          (slaStats?.ticketsByStatus && Object.keys(slaStats.ticketsByStatus).length > 0)) && (
          <div className="mb-6 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <h3 className="text-sm font-semibold text-cyan-300 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Company performance snapshot
            </h3>
            {slaStats?.ticketsByCategory && Object.keys(slaStats.ticketsByCategory).length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">Tickets by category</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(slaStats.ticketsByCategory).map(([k, v]) => (
                    <span key={k} className="px-2 py-1 rounded-lg bg-white/10 text-xs text-white">
                      {k}: <strong>{v}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {slaStats?.usersByRole && Object.keys(slaStats.usersByRole).length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">Staff accounts by role</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(slaStats.usersByRole).map(([k, v]) => (
                    <span key={k} className="px-2 py-1 rounded-lg bg-white/10 text-xs text-white">
                      {k}: <strong>{v}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {slaStats?.ticketsByRoleScope && Object.keys(slaStats.ticketsByRoleScope).length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">Tickets by assignment scope</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(slaStats.ticketsByRoleScope).map(([k, v]) => (
                    <span key={k} className="px-2 py-1 rounded-lg bg-white/10 text-xs text-white">
                      {k}: <strong>{v}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {slaStats?.ticketsByStatus && Object.keys(slaStats.ticketsByStatus).length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Tickets by status</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(slaStats.ticketsByStatus).map(([k, v]) => (
                    <span key={k} className="px-2 py-1 rounded-lg bg-white/10 text-xs text-white">
                      {k}: <strong>{v}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {companyDashboard && (
          <div className="mb-6 rounded-xl border border-violet-500/25 bg-violet-500/5 p-4 overflow-x-auto">
            <h3 className="text-sm font-semibold text-violet-300 mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Live company dashboard
            </h3>
            <div className="flex flex-wrap gap-4 mb-4 text-sm">
              <span className="text-gray-400">
                Team members: <strong className="text-white">{companyDashboard.totalStaff}</strong>
              </span>
              <span className="text-gray-400">
                Company tickets: <strong className="text-white">{companyDashboard.totalTickets}</strong>
              </span>
            </div>
            {companyDashboard.staffByRole && Object.keys(companyDashboard.staffByRole).length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">Staff roles (directory)</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(companyDashboard.staffByRole).map(([k, v]) => (
                    <span key={k} className="px-2 py-1 rounded-lg bg-white/10 text-xs text-white">
                      {k}: <strong>{v}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {companyDashboard.departmentPerformance && Object.keys(companyDashboard.departmentPerformance).length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">Departments performance</p>
                <div className="grid md:grid-cols-2 gap-2">
                  {Object.entries(companyDashboard.departmentPerformance).map(([dept, perf]) => (
                    <div key={dept} className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs">
                      <p className="text-violet-300 font-semibold mb-1">{dept}</p>
                      <div className="text-gray-300 grid grid-cols-2 gap-1">
                        <span>Total tasks: {perf.totalTasks}</span>
                        <span>Pending: {perf.pending}</span>
                        <span>In progress: {perf.inProgress}</span>
                        <span>Inspection: {perf.inspectionResults}</span>
                        <span>Within SLA: {perf.withInSla}</span>
                        <span>Over SLA: {perf.overSla}</span>
                        <span>Total delays: {perf.totalDelays}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {companyDashboard.staffPerformance && companyDashboard.staffPerformance.length > 0 && (
              <div className="rounded-lg border border-white/10 overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-black/30 text-violet-300">
                    <tr>
                      <th className="px-3 py-2 font-medium">Member</th>
                      <th className="px-3 py-2 font-medium">Role</th>
                      <th className="px-3 py-2 font-medium text-right">Assigned</th>
                      <th className="px-3 py-2 font-medium text-right">Done</th>
                      <th className="px-3 py-2 font-medium text-right">Needs edit</th>
                      <th className="px-3 py-2 font-medium text-right">Resubmit</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-200">
                    {companyDashboard.staffPerformance.map((row) => (
                      <tr key={row.userId} className="border-t border-white/10">
                        <td className="px-3 py-2 font-mono text-[11px]">
                          …{row.userId.slice(-8)}
                        </td>
                        <td className="px-3 py-2">{row.role}</td>
                        <td className="px-3 py-2 text-right">{row.assigned}</td>
                        <td className="px-3 py-2 text-right text-emerald-400">{row.completed}</td>
                        <td className="px-3 py-2 text-right text-amber-300">{row.needsEdit}</td>
                        <td className="px-3 py-2 text-right text-violet-300">{row.resubmitted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-6">
          <button
            type="button"
            onClick={() => setDashboardSection('pending')}
            className={`px-4 py-2 rounded-xl font-medium transition-colors ${dashboardSection === 'pending' ? 'bg-amber-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
          >
            {t('ticketForm.navPending')}
          </button>
          <button
            type="button"
            onClick={() => setDashboardSection('completed')}
            className={`px-4 py-2 rounded-xl font-medium transition-colors ${dashboardSection === 'completed' ? 'bg-amber-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
          >
            {t('ticketForm.navCompleted')}
          </button>
          <button
            type="button"
            onClick={() => setDashboardSection('ncr')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${dashboardSection === 'ncr' ? 'bg-rose-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
          >
            <ShieldCheck className="w-4 h-4" />
            NCR
            {tickets.filter((t) => (t.inspectionResult || '').toLowerCase() === 'ncr' || (t.ncrResubmissions?.length ?? 0) > 0).length > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-rose-500/80 text-white text-xs font-bold">
                {tickets.filter((t) => (t.inspectionResult || '').toLowerCase() === 'ncr' || (t.ncrResubmissions?.length ?? 0) > 0).length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setDashboardSection('company')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${dashboardSection === 'company' ? 'bg-amber-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
          >
            <Building2 className="w-4 h-4" />
            {t('ticketForm.navCompanyInfo')}
          </button>
          <button
            type="button"
            onClick={() => setDashboardSection('sites')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${dashboardSection === 'sites' ? 'bg-amber-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
          >
            <Map className="w-4 h-4" />
            {t('ticketForm.navSites')}
          </button>
        </div>

        {dashboardSection === 'company' && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 mb-6">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <Building2 className="w-5 h-5 text-amber-400" />
              {t('ticketForm.navCompanyInfo')}
            </h3>
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
                    <a href={user.companyCertificationUrl} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 underline">
                      {t('ticketForm.viewCertification')}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>

            {canUseProvisorHub && (
              <div className="mt-8 pt-8 border-t border-white/10 space-y-8">
                <h4 className="text-base font-semibold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-cyan-400" />
                  Provider hub (staff, checklists, billing)
                </h4>
                {provisorMsg && (
                  <p className="text-sm text-amber-200/90 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">{provisorMsg}</p>
                )}
                {provisorLoading && <p className="text-sm text-gray-400">Loading…</p>}

                {provisorBilling && (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <h5 className="text-sm font-medium text-cyan-300 mb-2">Tickets & billing</h5>
                    <p className="text-sm text-gray-300">
                      Free quota: {provisorBilling.freeTicketsUsed} / {provisorBilling.freeTicketsLimit} used.
                      {provisorBilling.activeTicketPlan
                        ? ` Active plan: ${provisorBilling.activeTicketPlan} ($${provisorBilling.activeRateUsd ?? '—'} per ticket).`
                        : ' After the free quota, choose a plan to keep creating coordinator tasks.'}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {(['WEEKLY', 'MONTHLY', 'YEARLY'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          disabled={provisorLoading || user?.role !== 'COMPANY_OWNER'}
                          onClick={() => activateBillingPlan(p)}
                          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-cyan-600/30 text-xs font-medium text-white disabled:opacity-40"
                        >
                          {p} ($
                          {p === 'WEEKLY' ? '0.7' : p === 'MONTHLY' ? '0.6' : '0.5'}/ticket)
                        </button>
                      ))}
                    </div>
                    {user?.role !== 'COMPANY_OWNER' && (
                      <p className="text-xs text-gray-500 mt-2">Only the company owner can change billing.</p>
                    )}
                  </div>
                )}

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <h5 className="text-sm font-medium text-cyan-300 mb-3">Staff (username from first name + temporary password)</h5>
                  <ul className="text-sm text-gray-300 space-y-1 mb-4 max-h-40 overflow-y-auto">
                    {provisorStaff.map((u) => (
                      <li key={u.id}>
                        <span className="text-white font-medium">{u.username}</span> — {u.role} — {u.email}
                      </li>
                    ))}
                    {provisorStaff.length === 0 && !provisorLoading && <li className="text-gray-500">No staff loaded.</li>}
                  </ul>
                  {(user?.role === 'COMPANY_OWNER' || user?.role === 'COORDINATOR' || user?.role === 'MANAGER' || user?.role === 'TEAM_LEADER' || user?.role === 'ADMIN' || user?.role === 'COMPANY') && (
                    <form onSubmit={submitStaffInvite} className="grid sm:grid-cols-2 gap-3 text-sm">
                      <input
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
                        placeholder="First name"
                        value={staffForm.firstName}
                        onChange={(e) => setStaffForm((f) => ({ ...f, firstName: e.target.value }))}
                      />
                      <input
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
                        placeholder="Last name"
                        value={staffForm.lastName}
                        onChange={(e) => setStaffForm((f) => ({ ...f, lastName: e.target.value }))}
                      />
                      <input
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white sm:col-span-2"
                        placeholder="Email"
                        type="email"
                        value={staffForm.email}
                        onChange={(e) => setStaffForm((f) => ({ ...f, email: e.target.value }))}
                      />
                      <select
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white sm:col-span-2"
                        value={staffForm.role}
                        onChange={(e) => setStaffForm((f) => ({ ...f, role: e.target.value }))}
                      >
                        <option value="MANAGER">Manager</option>
                        <option value="TEAM_LEADER">Team leader</option>
                        <option value="COORDINATOR">Coordinator</option>
                        <option value="QC">QC</option>
                        <option value="SUPERVISOR">Supervisor</option>
                        <option value="QUALITY_ENGINEER">Quality engineer (legacy)</option>
                        <option value="SUPERVISION_ENGINEER">Supervision engineer (legacy)</option>
                        <option value="TECHNICIAN">Technician</option>
                        <option value="ENGINEER">Engineer (general)</option>
                      </select>
                      <input
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white sm:col-span-2"
                        placeholder="Departments (comma-separated): network_maintenance, quality_control, supervision, electrical_deployments, mechanical"
                        value={staffForm.departments}
                        onChange={(e) => setStaffForm((f) => ({ ...f, departments: e.target.value }))}
                      />
                      <input
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white sm:col-span-2"
                        placeholder="Privileges (comma-separated): create_tasks, assign_tasks, manage_sites, manage_checklists, manage_conflicts, manage_staff, export_import"
                        value={staffForm.privileges}
                        onChange={(e) => setStaffForm((f) => ({ ...f, privileges: e.target.value }))}
                      />
                      <button
                        type="submit"
                        disabled={provisorLoading}
                        className="sm:col-span-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-50"
                      >
                        Create staff account
                      </button>
                    </form>
                  )}
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <h5 className="text-sm font-medium text-cyan-300 mb-3">Checklists (maintenance / quality / supervision)</h5>
                  <ul className="text-sm text-gray-300 space-y-1 mb-4 max-h-36 overflow-y-auto">
                    {provisorChecklists.map((c) => (
                      <li key={c.id}>
                        {c.name}{' '}
                        <span className="text-gray-500">({c.taskCategory ?? 'any'})</span>
                      </li>
                    ))}
                    {provisorChecklists.length === 0 && !provisorLoading && <li className="text-gray-500">No checklists yet.</li>}
                  </ul>
                  {(user?.role === 'COMPANY_OWNER' || user?.role === 'COORDINATOR' || user?.role === 'MANAGER' || user?.role === 'TEAM_LEADER' || user?.role === 'ADMIN' || user?.role === 'COMPANY') && (
                    <form onSubmit={submitChecklist} className="space-y-3 text-sm">
                      <input
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
                        placeholder="Checklist name"
                        value={checklistForm.name}
                        onChange={(e) => setChecklistForm((f) => ({ ...f, name: e.target.value }))}
                      />
                      <select
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
                        value={checklistForm.taskCategory}
                        onChange={(e) => setChecklistForm((f) => ({ ...f, taskCategory: e.target.value }))}
                      >
                        <option value="MAINTENANCE">Maintenance</option>
                        <option value="QUALITY">Quality</option>
                        <option value="SUPERVISION">Supervision</option>
                      </select>
                      <input
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
                        placeholder="Technique slugs, comma-separated (e.g. inspection,supervision)"
                        value={checklistForm.techniqueTypes}
                        onChange={(e) => setChecklistForm((f) => ({ ...f, techniqueTypes: e.target.value }))}
                      />
                      <button
                        type="submit"
                        disabled={provisorLoading}
                        className="w-full px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50"
                      >
                        Save checklist template
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {dashboardSection === 'sites' && (
          <div className="space-y-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Map className="w-5 h-5 text-amber-400" />
                {t('ticketForm.navSites')}
              </h3>
              {canManageSites && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportSites}
                    disabled={exportingSites || sites.length === 0}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-amber-500/20 text-amber-400 rounded-xl text-sm font-medium disabled:opacity-50"
                    title={t('ticketForm.exportSitesHint')}
                  >
                    {exportingSites ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    {t('ticketForm.exportSites')}
                  </button>
                  <button
                    type="button"
                    onClick={() => siteFileInputRef.current?.click()}
                    disabled={importingSites}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-amber-500/20 text-amber-400 rounded-xl text-sm font-medium disabled:opacity-50"
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
                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-xl text-white text-sm font-medium"
                  >
                    <PlusCircle className="w-4 h-4" />
                    {t('ticketForm.addSite')}
                  </button>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <Filter className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={siteFilter}
                  onChange={(e) => setSiteFilter(e.target.value)}
                  placeholder={t('ticketForm.filterBySiteId')}
                  className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:border-amber-500 outline-none"
                />
              </div>
            </div>
            {sitesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
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
                    className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-5 hover:border-amber-500/30 transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedSiteForTickets(site)}
                      className="w-full text-left flex items-start justify-between mb-3 rounded-lg -m-1 p-1 hover:bg-white/5 transition-colors"
                    >
                      <div>
                        <h4 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                          <MapPin className="w-5 h-5 text-amber-400 shrink-0" />
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
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded text-xs font-semibold">
                          <ClipboardList className="w-3 h-3" /> {locale === 'ar' ? 'فحص' : 'Insp.'}: {site.inspectionQcCount ?? 0} · {fmtSiteHours(site.inspectionHoursTotal)}h
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs font-semibold">
                          <ClipboardList className="w-3 h-3" /> {locale === 'ar' ? 'صيانة' : 'Maint.'}: {site.maintenanceQcCount ?? 0} · {fmtSiteHours(site.maintenanceHoursTotal)}h
                        </span>
                      </div>
                    </button>
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => setSelectedSiteForTickets(site)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-amber-500/20 text-amber-400 rounded-lg text-xs font-medium transition-colors"
                      >
                        <ClipboardList className="w-3.5 h-3.5" />
                        View tickets
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenTicketFromSite(site)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-white text-xs font-medium transition-colors"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        {t('ticketForm.openTicket')}
                      </button>
                      {canManageSites && (
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
            {selectedSiteForTickets && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedSiteForTickets(null)}>
                <div className="bg-[#0A0A0F] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-amber-400" />
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
                          <div key={ticket.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-white truncate">#{ticket.id.slice(-6)} · {ticket.siteCoordinator || '—'}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{getTechniqueLabel(ticket.technique)} · {formatDate(ticket.createdAt)}</p>
                                {ticket.status === 'COMPLETED' && ticket.completedAt && (
                                  <p className="text-xs text-emerald-400/90 mt-1">{t('ticketForm.completedAt')}: {formatDate(ticket.completedAt)} · {t('ticketForm.totalDelay')}: {formatTotalDelay(ticket.createdAt, ticket.completedAt)}</p>
                                )}
                                {ticket.inspectionResult === 'ncr' && ticket.ncrResubmissions && ticket.ncrResubmissions.length > 0 && (
                                  <p className="text-xs text-red-400/90 mt-1">NCR · {ticket.ncrResubmissions.length} resubmission{ticket.ncrResubmissions.length !== 1 ? 's' : ''}</p>
                                )}
                              </div>
                              <span className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-medium ${ticket.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' : ticket.status === 'IN_PROGRESS' ? 'bg-amber-500/20 text-amber-400' : ticket.status === 'ON_SITE' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                {getStatusLabel(ticket.status)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {(dashboardSection === 'pending' || dashboardSection === 'completed' || dashboardSection === 'ncr') && (
          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filters
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Result</label>
                <select
                  value={ticketListFilter.result}
                  onChange={(e) => setTicketListFilter((f) => ({ ...f, result: e.target.value }))}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:border-amber-500 outline-none"
                >
                  <option value="">All</option>
                  <option value="accepted">Accepted</option>
                  <option value="accepted_with_comments">Accepted w/ comments</option>
                  <option value="not_accepted">NOT accepted</option>
                  <option value="ncr">NCR</option>
                  <option value="in_progress">In progress</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Site name</label>
                <input
                  type="text"
                  value={ticketListFilter.siteName}
                  onChange={(e) => setTicketListFilter((f) => ({ ...f, siteName: e.target.value }))}
                  placeholder="Site or coordinator"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:border-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ticket ID</label>
                <input
                  type="text"
                  value={ticketListFilter.ticketId}
                  onChange={(e) => setTicketListFilter((f) => ({ ...f, ticketId: e.target.value }))}
                  placeholder="Filter by ID"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:border-amber-500 outline-none"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => setTicketListFilter({ result: '', siteName: '', ticketId: '' })}
                  className="text-sm text-gray-400 hover:text-amber-400"
                >
                  Clear filters
                </button>
              </div>
            </div>
          </div>
        )}

        {(dashboardSection === 'pending' || dashboardSection === 'completed' || dashboardSection === 'ncr') && (filteredTickets.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center text-gray-500">
            <p className="mb-4">{dashboardSection === 'pending' ? t('ticketForm.noTickets') : dashboardSection === 'ncr' ? 'No NCR tickets.' : 'No completed tickets.'}</p>
            {dashboardSection === 'pending' && (
              <button
                type="button"
                onClick={async () => {
                  if (!canOpenTicketForm) return;
                  const res = await fetch('/api/auth/requester-me', { credentials: 'include' });
                  const data = await res.json();
                  if (data.success && data.user) {
                    setTicketForm((f) => ({ ...f, phone: data.user.phone || f.phone, province: f.province || 'N/A' }));
                  }
                  setSelectedSiteId('');
                  setAttachmentUrls([]);
                  setTicketForm((f) => ({ ...f, designSpecifications: '' }));
                  setTicketFormOpen(true);
                }}
                disabled={!canOpenTicketForm}
                title={
                  canOpenTicketForm
                    ? undefined
                    : 'Only company owner or coordinator can create tasks for this company account.'
                }
                className="inline-flex items-center gap-2 px-5 py-3 bg-amber-600 hover:bg-amber-500 rounded-xl font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PlusCircle className="w-5 h-5" />
                {t('ticketForm.addTicket')}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/dashboard/tickets/${ticket.id}?from=quality-control`}
                className="block rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-4 hover:border-amber-500/25 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:ring-offset-2 focus:ring-offset-[#0f1419]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {ticket.siteName || t('ticketForm.ticket')} <span className="text-amber-400 font-mono">#{ticket.id.slice(-6)}</span>
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">{ticket.siteCoordinator || '—'} · {getTechniqueLabel(ticket.technique)}</p>
                    <p className="text-xs text-gray-500 mt-1">{formatDate(ticket.createdAt)}</p>
                    {ticket.status === 'COMPLETED' && ticket.completedAt && (
                      <p className="text-xs text-emerald-400/90 mt-0.5">{t('ticketForm.completedAt')}: {formatDate(ticket.completedAt)} · {t('ticketForm.totalDelay')}: {formatTotalDelay(ticket.createdAt, ticket.completedAt)}</p>
                    )}
                    {ticket.inspectionResult === 'ncr' && (
                      <>
                        <p className="text-xs text-red-400/90 mt-1 flex items-center gap-1.5">
                          NCR
                          {ticket.ncrResubmissions && ticket.ncrResubmissions.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 text-[10px] font-medium">
                              {ticket.ncrResubmissions.length} resubmission{ticket.ncrResubmissions.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </p>
                        {ticket.ncrReason && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-full" title={ticket.ncrReason}>Reason: {ticket.ncrReason}</p>
                        )}
                        {ticket.ncrResubmissions && ticket.ncrResubmissions.length > 0 && (() => {
                          const last = ticket.ncrResubmissions![ticket.ncrResubmissions!.length - 1];
                          return last.comment ? <p className="text-xs text-gray-500 mt-0.5 truncate max-w-full" title={last.comment}>Last: {last.comment}</p> : null;
                        })()}
                        {ticket.status !== 'COMPLETED' && (
                          <p className="text-xs text-rose-300 mt-1">
                            Resubmit to admin with comments and clearance images →
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                      ticket.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' :
                      ticket.status === 'IN_PROGRESS' ? 'bg-amber-500/20 text-amber-400' :
                      ticket.status === 'ON_SITE' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {getStatusLabel(ticket.status)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ))}

        <p className="mt-8 text-center text-sm text-gray-500">
          <Link href="/" className="text-amber-400 hover:text-amber-300">
            {t('ticketForm.backToHome')}
          </Link>
        </p>
      </div>

      {ticketFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm" onClick={() => !ticketSubmitting && setTicketFormOpen(false)}>
          <div className="bg-[#0f1419] border border-amber-500/20 rounded-xl p-4 sm:p-5 max-w-md w-full max-h-[92vh] overflow-y-auto shadow-xl shadow-amber-500/5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2"><ClipboardList className="w-4 h-4 text-amber-400" />{t('ticketForm.title')}</h3>
              <button type="button" onClick={() => !ticketSubmitting && setTicketFormOpen(false)} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            {ticketMessage && (
              <div className={`mb-3 px-2.5 py-1.5 rounded-lg text-xs ${ticketMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{ticketMessage.text}</div>
            )}
            <form onSubmit={handleTicketSubmit} className="space-y-2.5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">{t('ticketForm.siteName')}</label>
                {sites.length > 0 ? (
                  <>
                    <select
                      value={
                        sites.some((s) => s.siteId === ticketForm.siteName)
                          ? ticketForm.siteName
                          : (!isPersonal && ticketForm.siteName ? '__manual__' : '')
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '__manual__' || v === '') {
                          setTicketForm((f) => ({ ...f, siteName: '', siteLocations: '', province: '' }));
                          setSelectedSiteId('');
                        } else {
                          const site = sites.find((s) => s.siteId === v);
                          if (site) {
                            setTicketForm((f) => ({ ...f, siteName: site.siteId, siteLocations: site.location, province: site.province }));
                            setSelectedSiteId(v);
                          }
                        }
                      }}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:border-amber-500 outline-none"
                    >
                      <option value="">— {t('ticketForm.selectFromSites')} —</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.siteId} className="bg-[#0f1419]">
                          {s.siteId} — {s.location}
                        </option>
                      ))}
                      {!isPersonal && <option value="__manual__" className="bg-[#0f1419]">— {t('ticketForm.typeNewSite')} —</option>}
                    </select>
                    {!isPersonal && !sites.some((s) => s.siteId === ticketForm.siteName) && (
                      <input
                        value={ticketForm.siteName}
                        onChange={(e) => setTicketForm((f) => ({ ...f, siteName: e.target.value }))}
                        placeholder={t('ticketForm.siteNamePlaceholder')}
                        className="w-full mt-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-amber-500 outline-none"
                        required
                      />
                    )}
                  </>
                ) : (
                  <input
                    value={ticketForm.siteName}
                    onChange={(e) => setTicketForm((f) => ({ ...f, siteName: e.target.value }))}
                    placeholder={t('ticketForm.siteNamePlaceholder')}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-amber-500 outline-none"
                    required
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">{t('ticketForm.siteLocations')}</label>
                <input
                  value={ticketForm.siteLocations}
                  onChange={(e) => setTicketForm((f) => ({ ...f, siteLocations: e.target.value }))}
                  placeholder={t('ticketForm.siteLocationsPlaceholder')}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-amber-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">{t('ticketForm.techniqueLabel')}</label>
                <select
                  value={
                    qcTechniques.length > 0
                      ? (qcTechniques.some((x) => x.slug === ticketForm.technique)
                          ? ticketForm.technique
                          : (qcTechniques[0]?.slug ?? 'inspection'))
                      : ticketForm.technique
                  }
                  onChange={(e) => setTicketForm((f) => ({ ...f, technique: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:border-amber-500 outline-none"
                  required
                >
                  {qcTechniques.length > 0
                    ? qcTechniques.map((row) => (
                        <option key={row.slug} value={row.slug} className="bg-[#0f1419]">
                          {locale === 'ar' || locale === 'ku' ? row.labelAr : (row.labelEn || row.labelAr)}
                        </option>
                      ))
                    : QUALITY_CONTROL_TECH_KEYS.map((key) => (
                        <option key={key} value={key} className="bg-[#0f1419]">
                          {t(`visitorRequestForm.qualityControlTechniques.${key}`)}
                        </option>
                      ))}
                </select>
              </div>
              {canCreateCoordinatorTasks && (
                <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3 space-y-3">
                  <p className="text-xs text-cyan-200/90 font-medium">Coordinator task (required for company login)</p>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Task type</label>
                    <select
                      value={ticketForm.taskCategory}
                      onChange={(e) =>
                        setTicketForm((f) => ({
                          ...f,
                          taskCategory: e.target.value as typeof f.taskCategory,
                          checklistTemplateId: '',
                          assigneeCoordinatorUserId: '',
                        }))
                      }
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:border-cyan-500 outline-none"
                    >
                      <option value="QUALITY" className="bg-[#0f1419]">
                        Quality (assigned to quality engineers)
                      </option>
                      <option value="SUPERVISION" className="bg-[#0f1419]">
                        Supervision (assigned to supervision engineers)
                      </option>
                      <option value="MAINTENANCE" className="bg-[#0f1419]">
                        Maintenance (assigned to technicians)
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Checklist template</label>
                    <select
                      value={ticketForm.checklistTemplateId}
                      onChange={(e) =>
                        setTicketForm((f) => ({ ...f, checklistTemplateId: e.target.value }))
                      }
                      required
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:border-cyan-500 outline-none"
                    >
                      <option value="">— Select checklist —</option>
                      {checklistOptions.map((c) => (
                        <option key={c.id} value={c.id} className="bg-[#0f1419]">
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {checklistOptions.length === 0 && (
                      <p className="text-[11px] text-amber-300/90 mt-1">
                        No checklist for this task type — create one under Company → Provider hub.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Assignment pool</label>
                    <select
                      value={ticketForm.assignmentScope}
                      onChange={(e) =>
                        setTicketForm((f) => ({
                          ...f,
                          assignmentScope: e.target.value as typeof f.assignmentScope,
                        }))
                      }
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:border-cyan-500 outline-none"
                    >
                      <option value="COMPANY_STAFF" className="bg-[#0f1419]">
                        Your company staff
                      </option>
                      <option value="USMART_STAFF" className="bg-[#0f1419]">
                        U-Smart staff
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      Assign to staff (optional — filters by role for this task type)
                    </label>
                    <select
                      value={ticketForm.assigneeCoordinatorUserId}
                      onChange={(e) =>
                        setTicketForm((f) => ({
                          ...f,
                          assigneeCoordinatorUserId: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:border-cyan-500 outline-none"
                    >
                      <option value="">— Unassigned (visible by role) —</option>
                      {assigneeOptions.map((u) => (
                        <option key={u.id} value={u.id} className="bg-[#0f1419]">
                          {u.username} ({u.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ticketForm.resubmitToRequester}
                      onChange={(e) =>
                        setTicketForm((f) => ({
                          ...f,
                          resubmitToRequester: e.target.checked,
                        }))
                      }
                      className="rounded border-white/20 bg-white/5"
                    />
                    Allow staff to request edits from coordinator / requester when needed
                  </label>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">{t('ticketForm.slaHours')}</label>
                <input
                  type="number"
                  min={1}
                  max={8760}
                  value={ticketForm.slaHours}
                  onChange={(e) => setTicketForm((f) => ({ ...f, slaHours: parseInt(e.target.value, 10) || 24 }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:border-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">{t('visitorRequestForm.phoneLabel')}</label>
                <input
                  type="tel"
                  value={ticketForm.phone}
                  onChange={(e) => setTicketForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+964..."
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-0.5">{t('ticketForm.designSpecifications')}</label>
                <textarea value={ticketForm.designSpecifications} onChange={(e) => setTicketForm((f) => ({ ...f, designSpecifications: e.target.value }))} placeholder={t('ticketForm.designSpecificationsPlaceholder')} rows={2} className="w-full px-2.5 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-amber-500 outline-none resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-0.5">{t('ticketForm.attachFiles')}</label>
                <label className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border cursor-pointer ${attachmentUploading ? 'bg-amber-500/10 border-amber-500/30 text-amber-500/70 cursor-not-allowed' : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border-amber-500/30'}`}>
                  <Paperclip className="w-3.5 h-3.5 shrink-0" />
                  <span>{attachmentUploading ? (attachmentUploadProgress != null ? `${t('ticketForm.uploading')} ${attachmentUploadProgress}%` : t('ticketForm.uploading')) : t('ticketForm.addFile')}</span>
                  <input type="file" accept="image/*,.pdf" className="hidden" disabled={attachmentUploading} onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setAttachmentUploading(true);
                    setAttachmentUploadProgress(0);
                    try {
                      const d = await uploadWithProgress('/api/upload/ticket-attachment', file, {
                        credentials: 'include',
                        onProgress: (p) => setAttachmentUploadProgress(p),
                      });
                      if (d.success && d.url) setAttachmentUrls((u) => [...u, d.url!]);
                    } catch { /* ignore */ } finally { setAttachmentUploading(false); setAttachmentUploadProgress(null); e.target.value = ''; }
                  }} />
                </label>
                {attachmentUploading && attachmentUploadProgress != null && (
                  <div className="mt-1.5 h-1.5 w-full max-w-[200px] rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all duration-200" style={{ width: `${attachmentUploadProgress}%` }} />
                  </div>
                )}
                {attachmentUrls.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {attachmentUrls.map((url, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/10 rounded text-xs text-gray-300">
                        <FileText className="w-3 h-3" />
                        <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 truncate max-w-[120px]">{url.split('/').pop()}</a>
                        <button type="button" onClick={() => setAttachmentUrls((u) => u.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-0.5">{t('visitorRequestForm.provinceLabel')}</label>
                <input value={ticketForm.province} onChange={(e) => setTicketForm((f) => ({ ...f, province: e.target.value }))} className="w-full px-2.5 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 outline-none" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={ticketSubmitting || attachmentUploading} className="flex-1 py-2.5 text-sm font-semibold bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg">{ticketSubmitting ? '...' : attachmentUploading ? t('ticketForm.uploading') : t('ticketForm.submitButton')}</button>
                <button type="button" onClick={() => !ticketSubmitting && !attachmentUploading && setTicketFormOpen(false)} className="px-3 py-2.5 text-sm border border-white/20 rounded-lg text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed" disabled={ticketSubmitting || attachmentUploading}>{t('visitorRequestForm.close')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-amber-500 outline-none text-sm"
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
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-amber-500 outline-none text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">{t('ticketForm.province')}</label>
                <select
                  value={siteForm.province}
                  onChange={(e) => setSiteForm((f) => ({ ...f, province: e.target.value }))}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 outline-none text-sm"
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
                  className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg text-white text-sm font-medium"
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
  );
}
