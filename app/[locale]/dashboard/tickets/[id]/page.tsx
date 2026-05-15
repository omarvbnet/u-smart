'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Clock,
  CheckCircle,
  Activity,
  FileText,
  Image as ImageIcon,
  Calendar,
  User,
  Building2,
  FileDown,
  Share2,
  MessageSquare,
  Send,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { QRCodeSVG } from 'qrcode.react';

type AssignedTeam = {
  id: string;
  name: string;
  leader: { id: string; fullName: string; phone?: string } | null;
} | null;

type TicketDetail = {
  id: string;
  siteName: string | null;
  siteCoordinator: string | null;
  slaHours: number | null;
  technique: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  company?: string | null;
  statusTimeline: { status: string; createdAt: string }[];
  maintenanceDescription: string | null;
  beforeImageUrls?: string[];
  finishingImageUrls: string[];
  assignedTeam?: AssignedTeam;
  designSpecifications?: string | null;
  attachmentUrls?: string[];
  inspectionResult?: string | null;
  inspectionComments?: string | null;
  inspectionChecklist?: Array<{ id: string; label: string; checked: boolean; comment?: string; weight?: string }>;
  ncrReason?: string | null;
  ncrImageUrls?: string[];
  ncrResubmissions?: Array<{ at: string; by: string; action: string; comment?: string | null; imageUrls?: string[] }>;
  assignedEngineerId?: string | null;
  assignedEngineerName?: string | null;
};

type Comment = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  authorRole: 'engineer' | 'technician' | 'requester';
};

export default function TicketDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const t = useTranslations('Index');
  const ticketContentRef = useRef<HTMLDivElement>(null);
  const fromQc = searchParams.get('from') === 'qc';
  const [exportingPdf, setExportingPdf] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [shareFeedback, setShareFeedback] = useState<string>('');
  const locale = typeof params?.locale === 'string' ? params.locale : 'en';
  const id = typeof params?.id === 'string' ? params.id : '';
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [user, setUser] = useState<{ name: string | null; phone?: string; company?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ncrResubmitComment, setNcrResubmitComment] = useState('');
  const [ncrResubmitImageUrls, setNcrResubmitImageUrls] = useState<string[]>([]);
  const [ncrResubmitSubmitting, setNcrResubmitSubmitting] = useState(false);
  const [ncrResubmitUploading, setNcrResubmitUploading] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShareUrl(`${window.location.origin}/${locale}/ticket/${id}`);
    }
  }, [locale, id]);

  const loadTicket = async () => {
    if (!id) return null;
    const ticketRes = await fetch(`/api/tickets/${id}`, { credentials: 'include' });
    const ticketData = await ticketRes.json();
    if (ticketData.success && ticketData.ticket) {
      setTicket(ticketData.ticket as TicketDetail);
      return ticketData.ticket as TicketDetail;
    }
    return null;
  };

  useEffect(() => {
    if (!id) {
      setError('Invalid ticket');
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const [ticketRes, meRes] = await Promise.all([
          fetch(`/api/tickets/${id}`, { credentials: 'include' }),
          fetch('/api/auth/requester-me', { credentials: 'include' }),
        ]);
        if (cancelled) return;

        let ticketData: { success?: boolean; ticket?: unknown; message?: string } = {};
        try {
          ticketData = await ticketRes.json();
        } catch {
          setError(ticketRes.ok ? 'Invalid response from server' : `Request failed (${ticketRes.status})`);
          return;
        }

        if (ticketData.success && ticketData.ticket) {
          setTicket(ticketData.ticket as TicketDetail);
          const commentsRes = await fetch(`/api/tickets/${id}/comments`, { credentials: 'include' });
          if (cancelled) return;
          if (commentsRes.ok) {
            const commentsData = await commentsRes.json();
            if (commentsData.success && Array.isArray(commentsData.comments) && !cancelled) {
              setComments(commentsData.comments.map((c: Comment) => ({ ...c, createdAt: String(c.createdAt) })));
            }
          }
        } else {
          setError(ticketData.message || 'Ticket not found');
          return;
        }

        if (meRes.ok) {
          try {
            const meData = await meRes.json();
            if (meData.success && meData.user) {
              setUser({ name: meData.user.name, phone: meData.user.phone, company: meData.user.company });
            }
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load ticket';
          setError(msg.includes('fetch') || msg.includes('network') ? 'Network error. Please check your connection.' : msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id]);

  const handleNcrResubmit = async () => {
    if (!id) return;
    setNcrResubmitSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${id}/ncr-resubmit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ comment: ncrResubmitComment.trim() || null, imageUrls: ncrResubmitImageUrls }),
      });
      const data = await res.json();
      if (data.success) {
        setNcrResubmitComment('');
        setNcrResubmitImageUrls([]);
        await loadTicket();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setNcrResubmitSubmitting(false);
    }
  };

  const uploadNcrImage = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);
    setNcrResubmitUploading(true);
    try {
      const res = await fetch('/api/upload/ticket-image', { method: 'POST', body: formData });
      const data = await res.json();
      return data.success && data.url ? data.url : null;
    } catch {
      return null;
    } finally {
      setNcrResubmitUploading(false);
    }
  };

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString(locale === 'ar' ? 'ar-EG' : locale);
    } catch {
      return s;
    }
  };

  const formatTotalDelay = (created: string, completed: string) => {
    try {
      const ms = new Date(completed).getTime() - new Date(created).getTime();
      const hours = Math.floor(ms / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);
      if (days >= 1) return `${days}d`;
      return `${hours}h`;
    } catch {
      return '—';
    }
  };

  const getStatusLabel = (status: string) => {
    const key = `ticketForm.status.${status}`;
    const translated = t(key);
    return translated !== key ? translated : status;
  };

  const ENTERPRISE_TECH_KEYS = ['maintenance', 'fiber', 'cable_systemization', 'closures', 'splice', 'qgis', 'asbuilt_design'] as const;
  const QUALITY_CONTROL_TECH_KEYS = ['inspection', 'supervision', 'building', 'hse', 'investigation', 'tracking'] as const;

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

  const statusStyles: Record<string, string> = {
    COMPLETED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    ON_SITE: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
    IN_PROGRESS: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    PENDING: 'bg-gray-500/20 text-gray-400 border-gray-500/40',
  };

  const getInspectionResultLabel = (r: string) => {
    const map: Record<string, string> = {
      accepted: 'Accepted',
      accepted_with_comments: 'Accepted with comments',
      not_accepted: 'NOT accepted',
      ncr: 'NCR',
      in_progress: 'In progress',
    };
    return map[r] ?? r;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
      </div>
    );
  }

  if (error || !ticket) {
    const backHref = fromQc ? '/dashboard/quality-control' : '/dashboard';
    return (
      <div className="min-h-screen bg-[#0A0A0F] p-6">
        <div className="max-w-lg mx-auto rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-red-400 mb-4">{error || 'Ticket not found'}</p>
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-white text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            {fromQc ? 'Back to Quality Control' : 'Back to dashboard'}
          </Link>
        </div>
      </div>
    );
  }

  const isQCTicket = QUALITY_CONTROL_TECH_KEYS.includes(ticket.technique as typeof QUALITY_CONTROL_TECH_KEYS[number]);
  const hasInspectionData =
    isQCTicket &&
    (ticket.inspectionResult ||
      ticket.inspectionComments ||
      (ticket.inspectionChecklist && ticket.inspectionChecklist.length > 0) ||
      ticket.designSpecifications ||
      (ticket.attachmentUrls && ticket.attachmentUrls.length > 0));

  const backHref = isQCTicket ? '/dashboard/quality-control' : '/dashboard';
  const timelineEntries = ticket.statusTimeline?.length
    ? ticket.statusTimeline
    : [{ status: ticket.status, createdAt: ticket.createdAt }];

  const handleExportPdf = async () => {
    const el = ticketContentRef.current;
    if (!el) return;
    setExportingPdf(true);
    try {
      const canvas = await html2canvas(el, {
        backgroundColor: '#0A0A0F',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const imgW = canvas.width;
      const imgH = canvas.height;
      const ratio = Math.min(pdfW / imgW, pdfH / imgH) * 0.95;
      const w = imgW * ratio;
      const h = imgH * ratio;
      const x = (pdfW - w) / 2;
      const y = 10;
      pdf.addImage(imgData, 'PNG', x, y, w, h);
      pdf.save(`ticket-${ticket.id.slice(-8)}.pdf`);
    } catch (e) {
      console.error('PDF export failed:', e);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleAddComment = async () => {
    const text = commentBody.trim();
    if (!text || !id) return;
    setCommentSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json();
      if (data.success && data.comment) {
        setComments((prev) => [...prev, { ...data.comment, createdAt: String(data.comment.createdAt) }]);
        setCommentBody('');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleShare = async () => {
    const url = shareUrl || (typeof window !== 'undefined' ? `${window.location.origin}/${locale}/ticket/${id}` : '');
    const title = ticket?.siteName ? `Ticket: ${ticket.siteName}` : 'Ticket details';
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, url, text: title });
        setShareFeedback('shared');
      } else {
        await navigator.clipboard.writeText(url);
        setShareFeedback('copied');
      }
      setTimeout(() => setShareFeedback(''), 2000);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(url);
          setShareFeedback('copied');
        } catch {
          setShareFeedback('error');
        }
        setTimeout(() => setShareFeedback(''), 2000);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between gap-4 mb-6">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-medium rounded-xl"
            >
              <Share2 className="w-4 h-4" />
              {shareFeedback === 'shared' ? 'Shared!' : shareFeedback === 'copied' ? 'Copied!' : shareFeedback === 'error' ? 'Failed' : 'Share'}
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl"
            >
              <FileDown className="w-4 h-4" />
              {exportingPdf ? 'Exporting...' : 'Export as PDF'}
            </button>
          </div>
        </div>

        <div ref={ticketContentRef} className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent overflow-hidden shadow-xl">
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-white/10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-cyan-400" />
                  {ticket.siteName || t('ticketForm.ticket')} <span className="text-cyan-400 font-mono">#{ticket.id.slice(-6)}</span>
                </h1>
                <p className="text-sm text-gray-400 mt-1">{ticket.siteCoordinator || '—'}</p>
                {(ticket.company || user?.company) && (
                  <p className="text-sm text-cyan-400/90 mt-0.5">{ticket.company || user?.company}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-lg border border-white/20 bg-white p-1.5">
                  <QRCodeSVG
                    value={shareUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/${locale}/ticket/${ticket.id}`}
                    size={64}
                    level="M"
                    includeMargin={false}
                    className="block"
                  />
                </div>
                <span
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium border ${
                    statusStyles[ticket.status] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/40'
                  }`}
                >
                  {getStatusLabel(ticket.status)}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Scan QR code to share ticket details</p>
          </div>

          {/* Details grid */}
          <div className="p-5 sm:p-6 space-y-6">
            <section>
              <h2 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Ticket details
              </h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex gap-3 py-2 border-b border-white/5">
                  <dt className="text-gray-500 shrink-0">{t('ticketForm.siteCoordinator')}</dt>
                  <dd className="text-white">{ticket.siteCoordinator || '—'}</dd>
                </div>
                <div className="flex gap-3 py-2 border-b border-white/5">
                  <dt className="text-gray-500 shrink-0">{t('ticketForm.slaHours')}</dt>
                  <dd className="text-white">{ticket.slaHours != null ? `${ticket.slaHours}h` : '—'}</dd>
                </div>
                <div className="flex gap-3 py-2 border-b border-white/5">
                  <dt className="text-gray-500 shrink-0">Technique</dt>
                  <dd className="text-white">{getTechniqueLabel(ticket.technique)}</dd>
                </div>
                {ticket.assignedTeam && (
                  <div className="flex gap-3 py-2 border-b border-white/5 sm:col-span-2">
                    <dt className="text-gray-500 shrink-0 flex items-center gap-1.5"><User className="w-4 h-4 text-cyan-400" /> Assigned team</dt>
                    <dd className="text-white">
                      {ticket.assignedTeam.name}
                      {ticket.assignedTeam.leader && ` — Leader: ${ticket.assignedTeam.leader.fullName}`}
                    </dd>
                  </div>
                )}
                {(ticket.assignedEngineerName || ticket.assignedEngineerId) && (
                  <div className="flex gap-3 py-2 border-b border-white/5 sm:col-span-2">
                    <dt className="text-gray-500 shrink-0 flex items-center gap-1.5"><User className="w-4 h-4 text-cyan-400" /> Assigned engineer</dt>
                    <dd className="text-white">
                      <span className="font-medium">{ticket.assignedEngineerName ?? '—'}</span>
                      {ticket.assignedEngineerId && (
                        <span className="ml-1.5 text-gray-400 font-mono text-xs">(ID: {ticket.assignedEngineerId})</span>
                      )}
                    </dd>
                  </div>
                )}
                <div className="flex gap-3 py-2 border-b border-white/5">
                  <dt className="text-gray-500 shrink-0 flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Created</dt>
                  <dd className="text-white">{formatDate(ticket.createdAt)}</dd>
                </div>
                {ticket.completedAt && (
                  <>
                    <div className="flex gap-3 py-2 border-b border-white/5 sm:col-span-2">
                      <dt className="text-gray-500 shrink-0 flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-emerald-400" /> {t('ticketForm.completedAt')}</dt>
                      <dd className="text-emerald-400">{formatDate(ticket.completedAt)}</dd>
                    </div>
                    <div className="flex gap-3 py-2 border-b border-white/5 sm:col-span-2">
                      <dt className="text-gray-500 shrink-0">{t('ticketForm.totalDelay')}</dt>
                      <dd className="text-emerald-400">{formatTotalDelay(ticket.createdAt, ticket.completedAt)}</dd>
                    </div>
                  </>
                )}
              </dl>
            </section>

            {/* Status timeline - always shown for each status with timestamp */}
            <section>
              <h2 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                {t('ticketForm.statusTimeline')}
              </h2>
              <div className="relative pl-6 space-y-3">
                <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-cyan-500/50 via-cyan-500/30 to-emerald-500/50 rounded-full" />
                {timelineEntries.map((entry, idx) => {
                  const style = statusStyles[entry.status] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30';
                  const Icon = entry.status === 'COMPLETED' ? CheckCircle : entry.status === 'ON_SITE' ? MapPin : entry.status === 'IN_PROGRESS' ? Activity : Clock;
                  return (
                    <div key={idx} className="relative flex items-center gap-3">
                      <span className={`absolute left-0 flex h-6 w-6 items-center justify-center rounded-full border-2 ${style} z-[1] bg-[#0A0A0F]`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${style}`}>{getStatusLabel(entry.status)}</span>
                      <span className="text-xs text-gray-500">{formatDate(entry.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* QC Inspection section */}
            {hasInspectionData && (
              <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-amber-500/30 bg-amber-500/20">
                  <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Inspection details
                  </h2>
                </div>
                <div className="p-4 sm:p-5 space-y-4">
                  {ticket.inspectionResult && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Result</p>
                      <span className="inline-flex px-3 py-1 rounded-lg text-sm font-medium bg-amber-500/30 text-amber-300 border border-amber-500/40">
                        {getInspectionResultLabel(ticket.inspectionResult)}
                      </span>
                    </div>
                  )}
                  {ticket.inspectionComments && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Comments</p>
                      <p className="text-sm text-gray-300 whitespace-pre-wrap rounded-lg border border-amber-500/20 bg-white/5 p-3">{ticket.inspectionComments}</p>
                    </div>
                  )}
                  {ticket.designSpecifications && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Design & specifications</p>
                      <p className="text-sm text-gray-300 whitespace-pre-wrap rounded-lg border border-amber-500/20 bg-white/5 p-3">{ticket.designSpecifications}</p>
                    </div>
                  )}
                  {ticket.attachmentUrls && ticket.attachmentUrls.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Attached files</p>
                      <div className="flex flex-wrap gap-2">
                        {ticket.attachmentUrls.map((url, idx) => {
                          const isImage = /\.(jpe?g|png|gif|webp)$/i.test(url) || url.includes('image');
                          const srcOrHref = url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`;
                          return (
                            <a
                              key={idx}
                              href={srcOrHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block rounded-lg border border-amber-500/30 overflow-hidden hover:border-amber-400/50 transition-colors"
                            >
                              {isImage ? (
                                <img src={srcOrHref} alt={`Attachment ${idx + 1}`} className="w-20 h-20 object-cover" />
                              ) : (
                                <div className="w-20 h-20 flex items-center justify-center bg-amber-500/20 text-amber-400 text-xs font-medium px-2 text-center">PDF</div>
                              )}
                              <span className="block text-xs text-gray-400 truncate px-1 py-0.5 max-w-[80px]">{url.split('/').pop() ?? 'File'}</span>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {ticket.inspectionChecklist && ticket.inspectionChecklist.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Checklist</p>
                      <div className="overflow-x-auto rounded-lg border border-amber-500/20">
                        <div className="grid grid-cols-12 gap-2 px-2 py-1.5 bg-amber-500/20 text-xs font-medium text-amber-800">
                          <span className="col-span-5">Item</span>
                          <span className="col-span-2">Weight</span>
                          <span className="col-span-2">Accepted</span>
                          <span className="col-span-2">Not accepted</span>
                          <span className="col-span-1" />
                        </div>
                        {ticket.inspectionChecklist.map((item) => (
                          <div key={item.id} className="grid grid-cols-12 gap-2 px-2 py-1.5 border-t border-amber-500/10 text-sm">
                            <span className={`col-span-5 ${item.checked ? 'text-gray-400 line-through' : 'text-gray-300'}`}>{item.label}</span>
                            <span className="col-span-2 text-gray-400">{(item as { weight?: string }).weight || 'minor'}</span>
                            <span className="col-span-2">{item.checked ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : '—'}</span>
                            <span className="col-span-2">{!item.checked ? <span className="text-red-400">✗</span> : '—'}</span>
                            <span className="col-span-1">{item.comment && <span className="text-xs text-gray-500" title={item.comment}>…</span>}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* NCR (Non-Conformance Report) - reason, images, resubmit form, timeline */}
            {isQCTicket && (ticket.inspectionResult || '').toLowerCase() === 'ncr' && (
              <section className="rounded-xl border border-rose-500/30 bg-rose-500/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-rose-500/30 bg-rose-500/20">
                  <h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">NCR – Non-Conformance Report</h2>
                  <p className="text-xs text-rose-300/90 mt-0.5">Resubmit with comments and clearance images for review</p>
                </div>
                <div className="p-4 sm:p-5 space-y-4">
                  {ticket.ncrReason && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Reason for NCR</p>
                      <p className="text-sm text-gray-300 whitespace-pre-wrap rounded-lg border border-rose-500/20 bg-white/5 p-3">{ticket.ncrReason}</p>
                    </div>
                  )}
                  {ticket.ncrImageUrls && ticket.ncrImageUrls.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">NCR attached images</p>
                      <div className="flex flex-wrap gap-2">
                        {ticket.ncrImageUrls.map((url, i) => (
                          <a key={i} href={url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded-lg border border-rose-500/30 overflow-hidden">
                            <img src={url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`} alt="" className="w-full h-full object-cover" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {ticket.ncrResubmissions && ticket.ncrResubmissions.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Resubmission history</p>
                      <div className="space-y-2">
                        {ticket.ncrResubmissions.map((entry, idx) => (
                          <div key={idx} className="rounded-lg border border-rose-500/20 bg-white/5 p-3 text-sm">
                            <div className="flex items-center gap-2 text-gray-400">
                              <span>{entry.by === 'admin' ? 'Admin' : 'You'}</span>
                              <span>—</span>
                              <span>{entry.action === 'accept' ? 'Accepted (NCR closed)' : 'Resubmitted'}</span>
                              <span className="text-xs">{formatDate(entry.at)}</span>
                            </div>
                            {entry.comment && <p className="mt-1 text-gray-300 whitespace-pre-wrap">{entry.comment}</p>}
                            {entry.imageUrls && entry.imageUrls.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {entry.imageUrls.map((url, i) => (
                                  <a key={i} href={url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`} target="_blank" rel="noopener noreferrer" className="block w-14 h-14 rounded border border-rose-500/20 overflow-hidden">
                                    <img src={url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`} alt="" className="w-full h-full object-cover" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {ticket.status !== 'COMPLETED' && (
                    <div className="rounded-lg border-2 border-rose-500/30 bg-rose-500/10 p-4 space-y-3">
                      <p className="text-sm font-medium text-rose-300">Resubmit to admin</p>
                      <p className="text-xs text-rose-200/80">Add comments and clearance images for admin review.</p>
                      <div>
                        <label className="block text-xs font-medium text-rose-200/90 mb-1">Comments</label>
                        <textarea
                          value={ncrResubmitComment}
                          onChange={(e) => setNcrResubmitComment(e.target.value)}
                          placeholder="Your comments and clearance details for admin..."
                          rows={3}
                          className="w-full text-sm rounded-lg border border-rose-500/30 bg-white/5 text-gray-200 placeholder-gray-500 px-3 py-2 focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-rose-200/90 mb-1">Clearance images</label>
                        <div className="flex flex-wrap gap-2 items-center">
                        {ncrResubmitImageUrls.map((url) => (
                          <span key={url} className="relative inline-block">
                            <img src={url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`} alt="" className="w-16 h-16 object-cover rounded border border-rose-500/20" />
                            <button type="button" onClick={() => setNcrResubmitImageUrls((p) => p.filter((u) => u !== url))} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">×</button>
                          </span>
                        ))}
                        <label className={`w-16 h-16 rounded border border-dashed border-rose-500/40 flex items-center justify-center cursor-pointer hover:bg-rose-500/20 transition-colors ${ncrResubmitUploading ? 'opacity-60 pointer-events-none' : ''}`}>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={ncrResubmitUploading}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const url = await uploadNcrImage(file);
                                if (url) setNcrResubmitImageUrls((p) => [...p, url]);
                                e.target.value = '';
                              }
                            }}
                          />
                          {ncrResubmitUploading ? <Loader2 className="w-6 h-6 text-rose-400 animate-spin" /> : <ImageIcon className="w-6 h-6 text-rose-400" />}
                        </label>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleNcrResubmit}
                        disabled={ncrResubmitSubmitting}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2"
                      >
                        {ncrResubmitSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {ncrResubmitSubmitting ? 'Submitting...' : 'Resubmit to admin'}
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Before images */}
            {(ticket.beforeImageUrls?.length ?? 0) > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Before images
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {ticket.beforeImageUrls!.map((url, idx) => (
                    <a
                      key={idx}
                      href={url.startsWith('http') ? url : url.startsWith('/') ? `${typeof window !== 'undefined' ? window.location.origin : ''}${url}` : url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block aspect-video rounded-xl border border-white/10 bg-white/5 overflow-hidden hover:border-cyan-500/30 transition-colors"
                    >
                      <img
                        src={url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`}
                        alt={`Before ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* Description - Inspections for QC, Maintenance for others */}
            <section>
              <h2 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {isQCTicket ? 'Inspections description' : 'Maintenance description'}
              </h2>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 min-h-[80px]">
                {ticket.maintenanceDescription ? (
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{ticket.maintenanceDescription}</p>
                ) : (
                  <p className="text-sm text-gray-500 italic">{isQCTicket ? 'No inspection description added yet.' : 'No description added yet.'}</p>
                )}
              </div>
            </section>

            {/* Finishing site images */}
            <section>
              <h2 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                Finishing site images
              </h2>
              {ticket.finishingImageUrls && ticket.finishingImageUrls.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {ticket.finishingImageUrls.map((url, idx) => (
                    <a
                      key={idx}
                      href={url.startsWith('http') ? url : url.startsWith('/') ? `${typeof window !== 'undefined' ? window.location.origin : ''}${url}` : url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block aspect-video rounded-xl border border-white/10 bg-white/5 overflow-hidden hover:border-cyan-500/30 transition-colors"
                    >
                      <img
                        src={url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`}
                        alt={`Finishing ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
                  <ImageIcon className="w-10 h-10 text-gray-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No finishing images added yet.</p>
                </div>
              )}
            </section>

            {/* Comments (engineer, technician & requester) */}
            <section>
              <h2 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Comments
              </h2>
              {comments.length > 0 ? (
                <div className="space-y-3 mb-4">
                  {comments.map((c) => {
                    const isEng = c.authorRole === 'engineer';
                    const isTech = c.authorRole === 'technician';
                    const cardClass = isEng
                      ? 'border-cyan-500/30 bg-cyan-500/10'
                      : isTech
                        ? 'border-amber-500/30 bg-amber-500/10'
                        : 'border-emerald-500/30 bg-emerald-500/10';
                    const chipClass = isEng
                      ? 'bg-cyan-500/30 text-cyan-300'
                      : isTech
                        ? 'bg-amber-500/30 text-amber-200'
                        : 'bg-emerald-500/30 text-emerald-300';
                    const chipLabel = isEng ? 'Engineer' : isTech ? 'Technician' : 'Requester';
                    return (
                    <div
                      key={c.id}
                      className={`rounded-xl border p-3 text-sm ${cardClass}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white">{c.authorName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${chipClass}`}>
                          {chipLabel}
                        </span>
                        <span className="text-xs text-gray-500">{formatDate(c.createdAt)}</span>
                      </div>
                      <p className="text-gray-300 whitespace-pre-wrap">{c.body}</p>
                    </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500 mb-4">No comments yet.</p>
              )}
              <div className="rounded-xl border border-white/20 bg-white/5 p-3 space-y-2">
                <textarea
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Add a reply..."
                  rows={2}
                  className="w-full text-sm rounded-lg border border-white/20 bg-white/5 text-gray-200 placeholder-gray-500 px-3 py-2 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 resize-none"
                />
                <button
                  type="button"
                  onClick={handleAddComment}
                  disabled={commentSubmitting || !commentBody.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                >
                  {commentSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Reply
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
