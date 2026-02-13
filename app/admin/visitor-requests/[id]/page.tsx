'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeftIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { uploadWithProgress } from '@/lib/upload-with-progress';

type Team = { id: string; name: string; leader?: { id: string; fullName: string; phone?: string } };
type VisitorRequest = {
  id: string;
  buildingType: string | null;
  phone: string;
  province: string;
  technique: string;
  name: string | null;
  company: string | null;
  email: string | null;
  serviceSlug: string;
  siteName?: string | null;
  siteCoordinator?: string | null;
  slaHours?: number | null;
  status?: string;
  requesterId?: string | null;
  assignedTeamId?: string | null;
  assignedTeam?: Team | null;
  maintenanceDescription?: string | null;
  beforeImageUrls?: string[] | null;
  finishingImageUrls?: string[] | null;
  createdAt: string;
  updatedAt: string;
};

export default function VisitorRequestDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [request, setRequest] = useState<VisitorRequest | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState('');
  const [assignedTeamId, setAssignedTeamId] = useState('');
  const [maintenanceDescription, setMaintenanceDescription] = useState('');
  const [beforeUrls, setBeforeUrls] = useState<string[]>([]);
  const [afterUrls, setAfterUrls] = useState<string[]>([]);
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState<number | null>(null);
  const [statusError, setStatusError] = useState('');
  const [inspectionResultVal, setInspectionResultVal] = useState('');
  const [inspectionCommentsVal, setInspectionCommentsVal] = useState('');
  const [inspectionChecklistVal, setInspectionChecklistVal] = useState<Array<{ id: string; label: string; checked: boolean; comment?: string; weight?: 'minor' | 'major' }>>([]);
  const [savingInspection, setSavingInspection] = useState(false);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [checklistTemplates, setChecklistTemplates] = useState<Array<{ id: string; name: string; items: { id: string; label: string; weight?: string }[] }>>([]);
  const [ncrReasonVal, setNcrReasonVal] = useState('');
  const [ncrImageUrls, setNcrImageUrls] = useState<string[]>([]);
  const [ncrAdminComment, setNcrAdminComment] = useState('');
  const [ncrAdminImageUrls, setNcrAdminImageUrls] = useState<string[]>([]);
  const [savingNcrAccept, setSavingNcrAccept] = useState(false);
  const [savingNcrResubmit, setSavingNcrResubmit] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      setStatusError('');
      try {
        const [res, countRes, teamsRes, checklistsRes] = await Promise.all([
          fetch(`/api/visitor-requests/${id}`),
          fetch('/api/notifications/count?type=pending_tickets'),
          fetch('/api/admin/teams'),
          fetch('/api/admin/checklists'),
        ]);
        const data = await res.json();
        const countData = await countRes.json();
        const teamsData = await teamsRes.json();
        if (data.success && data.request) {
          const r = data.request as VisitorRequest & { designSpecifications?: string | null; attachmentUrls?: string[] };
          setRequest(r);
          setStatus(r.status ?? 'PENDING');
          setAssignedTeamId(r.assignedTeamId ?? '');
          setMaintenanceDescription(r.maintenanceDescription ?? '');
          setBeforeUrls(Array.isArray(r.beforeImageUrls) ? r.beforeImageUrls : []);
          setAfterUrls(Array.isArray(r.finishingImageUrls) ? r.finishingImageUrls : []);
        }
        if (countData.success && typeof countData.count === 'number') {
          setPendingCount(countData.count);
        }
        if (teamsData.success && teamsData.teams) {
          setTeams(teamsData.teams);
        }
        const checklistsData = await checklistsRes.json();
        if (checklistsData.success && checklistsData.checklists) {
          setChecklistTemplates(checklistsData.checklists.map((c: { id: string; name: string; items: unknown }) => ({
            id: c.id,
            name: c.name,
            items: Array.isArray(c.items)
              ? c.items.filter((x: unknown) => x && typeof x === 'object' && 'label' in x).map((x: { id?: string; label: string; weight?: string }) => ({
                  id: x.id || `item-${Date.now()}`,
                  label: String(x.label),
                  weight: x.weight === 'major' ? 'major' : 'minor',
                }))
              : [],
          })));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  type NcrResubmission = { at: string; by: string; action: string; comment?: string | null; imageUrls?: string[] };
  type ChecklistItem = { id: string; label: string; checked: boolean; comment?: string; weight?: 'minor' | 'major' };
  const parseTicketData = (r: VisitorRequest | null) => {
    if (!r) return { siteName: null, siteCoordinator: null, slaHours: null, displayCompany: null, designSpecifications: null, attachmentUrls: [], inspectionResult: null, inspectionComments: null, inspectionChecklist: [] as ChecklistItem[], ncrReason: null, ncrImageUrls: [] as string[], ncrResubmissions: [] as NcrResubmission[] };
    let siteName = r.siteName ?? null;
    let siteCoordinator = r.siteCoordinator ?? null;
    let slaHours = r.slaHours ?? null;
    let displayCompany = r.company ?? null;
    let designSpecifications: string | null = null;
    let attachmentUrls: string[] = [];
    let inspectionResult: string | null = null;
    let inspectionComments: string | null = null;
    let inspectionChecklist: ChecklistItem[] = [];
    let ncrReason: string | null = null;
    let ncrImageUrls: string[] = [];
    let ncrResubmissions: NcrResubmission[] = [];
    if (typeof r.company === 'string') {
      try {
        const parsed = JSON.parse(r.company) as Record<string, unknown>;
        if (parsed._ticket) {
          siteName = (parsed.siteName as string) ?? siteName;
          siteCoordinator = (parsed.siteCoordinator as string) ?? siteCoordinator;
          slaHours = (parsed.slaHours as number) ?? slaHours;
          displayCompany = (parsed.company as string) ?? displayCompany;
          designSpecifications = (parsed.designSpecifications as string) ?? null;
          attachmentUrls = Array.isArray(parsed.attachmentUrls) ? parsed.attachmentUrls.filter((u: unknown) => typeof u === 'string') : [];
          inspectionResult = (parsed.inspectionResult as string) ?? null;
          inspectionComments = (parsed.inspectionComments as string) ?? null;
          inspectionChecklist = Array.isArray(parsed.inspectionChecklist)
            ? (parsed.inspectionChecklist as { id?: string; label?: string; checked?: boolean; comment?: string; weight?: string }[]).filter((c) => c && typeof c === 'object' && 'id' in c && 'label' in c).map((c) => ({ id: String(c.id), label: String(c.label), checked: !!c.checked, comment: c.comment, weight: c.weight === 'major' ? 'major' : 'minor' }))
            : [];
          ncrReason = (parsed.ncrReason as string) ?? null;
          ncrImageUrls = Array.isArray(parsed.ncrImageUrls) ? parsed.ncrImageUrls.filter((u: unknown) => typeof u === 'string') : [];
          ncrResubmissions = Array.isArray(parsed.ncrResubmissions)
            ? (parsed.ncrResubmissions as Array<{ at?: string; by?: string; action?: string; comment?: string; imageUrls?: string[] }>).map((e) => ({ at: e.at || '', by: e.by || '', action: e.action || 'resubmit', comment: e.comment ?? null, imageUrls: Array.isArray(e.imageUrls) ? e.imageUrls : [] }))
            : [];
        }
      } catch {
        /* not ticket JSON */
      }
    }
    return { siteName, siteCoordinator, slaHours, displayCompany, designSpecifications, attachmentUrls, inspectionResult, inspectionComments, inspectionChecklist, ncrReason, ncrImageUrls, ncrResubmissions };
  };

  const parsed = parseTicketData(request);
  useEffect(() => {
    setInspectionResultVal(parsed.inspectionResult ?? '');
    setInspectionCommentsVal(parsed.inspectionComments ?? '');
    setInspectionChecklistVal(parsed.inspectionChecklist ?? []);
    setNcrReasonVal(parsed.ncrReason ?? '');
    setNcrImageUrls(parsed.ncrImageUrls ?? []);
  }, [parsed.inspectionResult, parsed.inspectionComments, JSON.stringify(parsed.inspectionChecklist), parsed.ncrReason, JSON.stringify(parsed.ncrImageUrls)]);

  const computeAutoInspectionResult = (items: typeof inspectionChecklistVal) => {
    if (items.length === 0) return null;
    const notAccepted = items.filter((it) => !it.checked);
    if (notAccepted.length === 0) return 'accepted';
    const hasMajorNotAccepted = notAccepted.some((it) => it.weight === 'major');
    const allNotAcceptedAreMinor = notAccepted.every((it) => it.weight === 'minor');
    if (allNotAcceptedAreMinor) return 'accepted_with_comments';
    if (hasMajorNotAccepted) return null;
    return null;
  };

  useEffect(() => {
    if (request?.serviceSlug !== 'quality-control-supervision') return;
    if (inspectionChecklistVal.length === 0) return;
    const autoResult = computeAutoInspectionResult(inspectionChecklistVal);
    if (autoResult !== null && autoResult !== inspectionResultVal) setInspectionResultVal(autoResult);
    if (autoResult === null) {
      const notAccepted = inspectionChecklistVal.filter((it) => !it.checked);
      const hasMajor = notAccepted.some((it) => it.weight === 'major');
      if (hasMajor && ['accepted', 'accepted_with_comments'].includes(inspectionResultVal)) {
        setInspectionResultVal('');
      }
    }
  }, [inspectionChecklistVal, inspectionResultVal, request?.serviceSlug]);

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
    setStatusError('');
    if (newStatus === 'IN_PROGRESS' && !assignedTeamId) {
      setStatusError('Assign a team before setting status to In Progress.');
      return;
    }
    setUpdating(true);
    try {
      const body: { status: string; assignedTeamId?: string } = { status: newStatus };
      if (assignedTeamId) body.assignedTeamId = assignedTeamId;
      const res = await fetch(`/api/visitor-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setStatus(newStatus);
        setRequest((prev) => (prev ? { ...prev, status: newStatus, assignedTeamId: data.request?.assignedTeamId ?? assignedTeamId, assignedTeam: data.request?.assignedTeam ?? prev.assignedTeam } : null));
        setStatusError('');
        const countRes = await fetch('/api/notifications/count?type=pending_tickets');
        const countData = await countRes.json();
        if (countData.success && typeof countData.count === 'number') setPendingCount(countData.count);
      } else {
        setStatusError(data.message || 'Update failed');
      }
    } catch (e) {
      setStatusError('Request failed');
      console.error(e);
    } finally {
      setUpdating(false);
    }
  };

  const handleAssignTeam = async () => {
    if (!id) return;
    setStatusError('');
    setUpdating(true);
    try {
      const res = await fetch(`/api/visitor-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedTeamId: assignedTeamId || null }),
      });
      const data = await res.json();
      if (data.success) {
        setRequest((prev) => (prev ? { ...prev, assignedTeamId: data.request?.assignedTeamId ?? assignedTeamId, assignedTeam: data.request?.assignedTeam ?? prev.assignedTeam } : null));
      } else {
        setStatusError(data.message || 'Update failed');
      }
    } catch (e) {
      setStatusError('Request failed');
    } finally {
      setUpdating(false);
    }
  };

  const uploadTicketImage = async (file: File, onProgress?: (percent: number) => void): Promise<string | null> => {
    setImageUploading(true);
    setImageUploadProgress(0);
    try {
      const data = await uploadWithProgress('/api/upload/ticket-image', file, {
        onProgress: (p) => {
          setImageUploadProgress(p);
          onProgress?.(p);
        },
      });
      return data.success && data.url ? data.url : null;
    } finally {
      setImageUploading(false);
      setImageUploadProgress(null);
    }
  };

  const handleSaveMaintenance = async () => {
    if (!id) return;
    setSavingMaintenance(true);
    try {
      const res = await fetch(`/api/visitor-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maintenanceDescription: maintenanceDescription.trim() || null,
          beforeImageUrls: beforeUrls,
          finishingImageUrls: afterUrls,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRequest((prev) =>
          prev
            ? {
                ...prev,
                maintenanceDescription: maintenanceDescription.trim() || null,
                beforeImageUrls: beforeUrls,
                finishingImageUrls: afterUrls,
              }
            : null
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingMaintenance(false);
    }
  };

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString();
    } catch {
      return s;
    }
  };

  if (loading && !request) {
    return (
      <div className="py-12 text-center text-gray-500">Loading...</div>
    );
  }

  if (!request) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500 mb-4">Request not found.</p>
        <Link href="/admin/visitor-requests" className="text-blue-600 hover:text-blue-800 font-medium mr-4">← Visitor Requests</Link>
        <Link href="/admin/quality-requests" className="text-blue-600 hover:text-blue-800 font-medium">← Quality Requests</Link>
      </div>
    );
  }

  const { siteName, siteCoordinator, slaHours, displayCompany, designSpecifications, attachmentUrls, inspectionResult, inspectionComments, inspectionChecklist } = parsed;
  const effectiveStatus = (request.status ?? '').toString().toUpperCase();
  const isCompleted = effectiveStatus === 'COMPLETED';

  const handleSaveInspection = async () => {
    if (!id) return;
    if ((inspectionResultVal || '').toLowerCase() === 'ncr' && !ncrReasonVal.trim()) {
      return;
    }
    setSavingInspection(true);
    try {
      const body: Record<string, unknown> = {
        inspectionResult: inspectionResultVal || null,
        inspectionComments: inspectionCommentsVal || null,
        inspectionChecklist: inspectionChecklistVal,
      };
      if ((inspectionResultVal || '').toLowerCase() === 'ncr') {
        body.ncrReason = ncrReasonVal.trim();
        body.ncrImageUrls = ncrImageUrls;
        body.status = 'IN_PROGRESS';
      } else if (['accepted', 'accepted_with_comments'].includes((inspectionResultVal || '').toLowerCase())) {
        body.status = 'COMPLETED';
      }
      const res = await fetch(`/api/visitor-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success && data.request) {
        setRequest(data.request);
        const newStatus = (data.request as { status?: string }).status ?? '';
        setStatus(newStatus);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingInspection(false);
    }
  };

  const handleNcrAccept = async () => {
    if (!id) return;
    setSavingNcrAccept(true);
    try {
      const res = await fetch(`/api/visitor-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ncrAction: 'accept' }),
      });
      const data = await res.json();
      if (data.success && data.request) {
        setRequest(data.request);
        setStatus('IN_PROGRESS');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingNcrAccept(false);
    }
  };

  const handleNcrResubmit = async () => {
    if (!id) return;
    setSavingNcrResubmit(true);
    try {
      const res = await fetch(`/api/visitor-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ncrAction: 'resubmit',
          ncrAdminComment: ncrAdminComment.trim() || null,
          ncrAdminImageUrls,
        }),
      });
      const data = await res.json();
      if (data.success && data.request) {
        setRequest(data.request);
        setNcrAdminComment('');
        setNcrAdminImageUrls([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingNcrResubmit(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href={request.serviceSlug === 'quality-control-supervision' ? '/admin/quality-requests' : '/admin/visitor-requests'}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Back to {request.serviceSlug === 'quality-control-supervision' ? 'Quality Requests' : 'Visitor Requests'}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Ticket #{request.id.slice(-8)}</h1>
          {pendingCount > 0 && (
            <span className="px-2.5 py-0.5 text-sm font-medium rounded-full bg-amber-100 text-amber-800">
              {pendingCount} pending tickets
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Details</h2>
        </div>
        <dl className="px-6 py-4 space-y-4 divide-y divide-gray-100">
          <div className="flex justify-between py-3">
            <dt className="text-sm text-gray-500">Date</dt>
            <dd className="text-sm text-gray-900">{formatDate(request.createdAt)}</dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-sm text-gray-500">Service</dt>
            <dd className="text-sm text-gray-900">{request.serviceSlug}</dd>
          </div>
          {(request.serviceSlug === 'enterprise-networking' || request.serviceSlug === 'quality-control-supervision') && (
            <>
              <div className="flex justify-between py-3">
                <dt className="text-sm text-gray-500">Site name</dt>
                <dd className="text-sm text-gray-900">{siteName ?? '—'}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-sm text-gray-500">Site coordinator</dt>
                <dd className="text-sm text-gray-900">{siteCoordinator ?? '—'}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-sm text-gray-500">SLA (hours)</dt>
                <dd className="text-sm text-gray-900">{slaHours != null ? slaHours : '—'}</dd>
              </div>
              <div className="flex justify-between items-center py-3">
                <dt className="text-sm text-gray-500">Assigned team</dt>
                <dd className="flex items-center gap-2">
                  <select
                    value={assignedTeamId}
                    onChange={(e) => setAssignedTeamId(e.target.value)}
                    disabled={updating || isCompleted}
                    className="text-sm border border-gray-300 rounded px-3 py-1.5 bg-white min-w-[180px] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="">— Select team —</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} (leader: {t.leader?.fullName || '—'})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAssignTeam}
                    disabled={updating || isCompleted}
                    className="text-sm px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                </dd>
              </div>
              {statusError && (
                <div className="py-2">
                  <p className="text-sm text-red-600">{statusError}</p>
                </div>
              )}
              <div className="flex justify-between items-center py-3">
                <dt className="text-sm text-gray-500">Status</dt>
                <dd>
                  {isCompleted && (
                    <span className="text-sm text-gray-500 italic mr-2">(Completed — no edits allowed)</span>
                  )}
                  <select
                    value={status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    disabled={updating || isCompleted}
                    className="text-sm border border-gray-300 rounded px-3 py-1.5 bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="PENDING">Pending</option>
                    <option value="ON_SITE">We on site</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED" disabled={request.serviceSlug === 'quality-control-supervision' && (parsed.inspectionResult || '').toLowerCase() === 'ncr'}>
                      Completed
                    </option>
                  </select>
                  {request.serviceSlug === 'quality-control-supervision' && (parsed.inspectionResult || '').toLowerCase() === 'ncr' && (
                    <p className="text-xs text-amber-700 mt-1">NCR tickets stay In Progress until you click Accept in the NCR section below.</p>
                  )}
                </dd>
              </div>
            </>
          )}
          <div className="flex justify-between py-3">
            <dt className="text-sm text-gray-500">Name</dt>
            <dd className="text-sm text-gray-900">{request.name ?? '—'}</dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-sm text-gray-500">Company</dt>
            <dd className="text-sm text-gray-900">{displayCompany ?? request.company ?? '—'}</dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-sm text-gray-500">Phone</dt>
            <dd className="text-sm text-gray-900">{request.phone}</dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-sm text-gray-500">Province</dt>
            <dd className="text-sm text-gray-900">{request.province}</dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-sm text-gray-500">Technique</dt>
            <dd className="text-sm text-gray-900">{request.technique}</dd>
          </div>
        </dl>
      </div>

      {attachmentUrls.length > 0 && (
        <div className="mt-6 bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-100/80">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <PhotoIcon className="w-5 h-5 text-slate-600" />
              Attachments from requester
            </h2>
          </div>
          <div className="p-6">
            <div className="flex flex-wrap gap-4">
              {attachmentUrls.map((url, idx) => {
                const href = url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`;
                const isImage = /\.(jpe?g|png|gif|webp)$/i.test(url) || url.toLowerCase().includes('image');
                const filename = url.split('/').pop() ?? `Attachment ${idx + 1}`;
                return (
                  <a
                    key={idx}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg border border-slate-200 overflow-hidden hover:border-slate-400 hover:shadow-md transition-all bg-white"
                  >
                    {isImage ? (
                      <img src={href} alt={filename} className="w-32 h-32 object-cover" />
                    ) : (
                      <div className="w-32 h-32 flex flex-col items-center justify-center bg-slate-100 text-slate-600 text-xs font-medium px-2 text-center gap-1">
                        <span className="text-lg">📎</span>
                        <span className="truncate max-w-[120px]">{filename}</span>
                      </div>
                    )}
                    <span className="block text-xs text-slate-600 truncate px-2 py-1.5 max-w-[128px] border-t border-slate-100">{filename}</span>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {request.serviceSlug === 'quality-control-supervision' && designSpecifications && (
        <div className="mt-6 bg-amber-50/80 border border-amber-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-200 bg-amber-100/50">
            <h2 className="text-lg font-semibold text-amber-900 flex items-center gap-2">
              <PhotoIcon className="w-5 h-5 text-amber-600" />
              Design & specifications
            </h2>
          </div>
          <div className="p-6">
            <div className="rounded-lg border border-amber-200 bg-white p-4 min-h-[60px]">
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{designSpecifications}</p>
            </div>
          </div>
        </div>
      )}

      {request.serviceSlug === 'quality-control-supervision' && (
        <div className="mt-6 bg-amber-50/80 border border-amber-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-200 bg-amber-100/50">
            <h2 className="text-lg font-semibold text-amber-900">Inspection results</h2>
            {isCompleted && <p className="text-sm text-amber-800 mt-1">(Read-only — completed)</p>}
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-amber-800 mb-1">Result</label>
              <select
                value={inspectionResultVal}
                onChange={(e) => setInspectionResultVal(e.target.value)}
                disabled={isCompleted}
                className="w-full max-w-xs text-sm border border-amber-200 rounded-lg px-3 py-2 bg-white text-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">— Select —</option>
                <option value="accepted">Accepted</option>
                <option value="accepted_with_comments">Accepted with comments</option>
                <option value="not_accepted">NOT accepted</option>
                <option value="ncr">NCR</option>
                <option value="in_progress">In progress</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-amber-800 mb-1">Comments</label>
              <textarea
                value={inspectionCommentsVal}
                onChange={(e) => setInspectionCommentsVal(e.target.value)}
                disabled={isCompleted}
                rows={3}
                className="w-full text-sm border border-amber-200 rounded-lg px-3 py-2 bg-white text-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="Inspection comments (e.g. for Accepted with comments)"
              />
            </div>
            {(inspectionResultVal || '').toLowerCase() === 'ncr' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-amber-800 mb-1">NCR reason <span className="text-red-600">*</span></label>
                  <textarea
                    value={ncrReasonVal}
                    onChange={(e) => setNcrReasonVal(e.target.value)}
                    disabled={isCompleted}
                    rows={3}
                    className="w-full text-sm border border-amber-200 rounded-lg px-3 py-2 bg-white text-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Reason for Non-Conformance Report (required)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-amber-800 mb-1">NCR attached images</label>
                  <div className="flex flex-wrap gap-2 items-center">
                    {ncrImageUrls.map((url) => (
                      <span key={url} className="relative inline-block">
                        <a href={url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded border bg-gray-100 overflow-hidden">
                          <img src={url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`} alt="NCR" className="w-full h-full object-cover" />
                        </a>
                        {!isCompleted && (
                          <button
                            type="button"
                            onClick={() => setNcrImageUrls((prev) => prev.filter((u) => u !== url))}
                            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                    {!isCompleted && (
                      <label className={`w-20 h-20 rounded border border-dashed flex items-center justify-center shrink-0 ${imageUploading ? 'border-gray-300 bg-gray-50 cursor-not-allowed opacity-60' : 'border-amber-400 cursor-pointer hover:bg-amber-50'}`}>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={imageUploading}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const url = await uploadTicketImage(file);
                              if (url) setNcrImageUrls((prev) => [...prev, url]);
                              e.target.value = '';
                            }
                          }}
                        />
                        <PhotoIcon className="w-8 h-8 text-amber-500" />
                      </label>
                    )}
                  </div>
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-amber-800 mb-1">Checklist</label>
              {checklistTemplates.length > 0 && !isCompleted && (
                <div className="mb-3">
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const val = e.target.value;
                      e.target.value = '';
                      if (!val) return;
                      const template = checklistTemplates.find((t) => t.id === val);
                      if (template && template.items.length > 0) {
                        setInspectionChecklistVal((prev) => [
                          ...prev,
                          ...template.items.map((it) => ({ id: `${it.id}-${Date.now()}`, label: it.label, checked: false, weight: (it.weight === 'major' ? 'major' : 'minor') as 'minor' | 'major' })),
                        ]);
                      }
                    }}
                    className="text-sm border border-amber-200 rounded-lg px-3 py-2 bg-white text-gray-900 max-w-xs"
                  >
                    <option value="">— Apply checklist template —</option>
                    {checklistTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.items.length} items)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-2">
              {inspectionChecklistVal.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-amber-200">
                <div className="grid grid-cols-12 gap-2 px-2 py-1.5 bg-amber-100/50 text-xs font-medium text-amber-900 min-w-[600px]">
                  <span className="col-span-4">Item</span>
                  <span className="col-span-2">Weight</span>
                  <span className="col-span-2">Accepted</span>
                  <span className="col-span-2">Not accepted</span>
                  <span className="col-span-2 text-right">Actions</span>
                </div>
                {inspectionChecklistVal.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 p-2 rounded-lg border border-amber-200 border-t-0 bg-white items-center min-w-[600px] first:rounded-t-none">
                    <div className="col-span-4 min-w-0">
                      <span className="text-sm text-gray-900 block truncate">{item.label}</span>
                      {item.comment && <p className="text-xs text-gray-600 mt-0.5 truncate">{item.comment}</p>}
                    </div>
                    <div className="col-span-2">
                      <select
                        value={item.weight || 'minor'}
                        onChange={(e) =>
                          setInspectionChecklistVal((prev) =>
                            prev.map((p) => (p.id === item.id ? { ...p, weight: e.target.value as 'minor' | 'major' } : p))
                          )
                        }
                        className="text-xs border border-amber-200 rounded px-2 py-1 w-full"
                      >
                        <option value="minor">Minor</option>
                        <option value="major">Major</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() =>
                          setInspectionChecklistVal((prev) =>
                            prev.map((p) => (p.id === item.id ? { ...p, checked: true } : p))
                          )
                        }
                        disabled={isCompleted}
                        className="rounded border-amber-300 disabled:opacity-60 disabled:cursor-not-allowed"
                        title="Accepted"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="checkbox"
                        checked={!item.checked}
                        onChange={() =>
                          setInspectionChecklistVal((prev) =>
                            prev.map((p) => (p.id === item.id ? { ...p, checked: false } : p))
                          )
                        }
                        className="rounded border-amber-300"
                        title="Not accepted"
                      />
                    </div>
                    <div className="col-span-2 flex items-center gap-1 justify-end">
                      <input
                        type="text"
                        value={item.comment ?? ''}
                        onChange={(e) =>
                          setInspectionChecklistVal((prev) =>
                            prev.map((p) => (p.id === item.id ? { ...p, comment: e.target.value || undefined } : p))
                          )
                        }
                        disabled={isCompleted}
                        placeholder="Comment"
                        className="text-xs border border-gray-200 rounded px-1.5 py-0.5 w-20 disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                      <button
                        type="button"
                        onClick={() => setInspectionChecklistVal((prev) => prev.filter((p) => p.id !== item.id))}
                        disabled={isCompleted}
                        className="text-red-600 hover:text-red-800 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newChecklistItem}
                    onChange={(e) => setNewChecklistItem(e.target.value)}
                    disabled={isCompleted}
                    placeholder="Add checklist item"
                    className="flex-1 text-sm border border-amber-200 rounded-lg px-3 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newChecklistItem.trim()) {
                          setInspectionChecklistVal((prev) => [...prev, { id: crypto.randomUUID(), label: newChecklistItem.trim(), checked: false, weight: 'minor' }]);
                          setNewChecklistItem('');
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newChecklistItem.trim()) {
                        setInspectionChecklistVal((prev) => [...prev, { id: crypto.randomUUID(), label: newChecklistItem.trim(), checked: false, weight: 'minor' }]);
                        setNewChecklistItem('');
                      }
                    }}
                    disabled={isCompleted}
                    className="text-sm px-4 py-2 bg-amber-200 text-amber-900 rounded-lg hover:bg-amber-300 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveInspection}
              disabled={savingInspection || isCompleted || ((inspectionResultVal || '').toLowerCase() === 'ncr' && !ncrReasonVal.trim())}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingInspection ? 'Saving...' : isCompleted ? 'Completed — no edits' : (inspectionResultVal || '').toLowerCase() === 'ncr' && !ncrReasonVal.trim() ? 'Enter NCR reason to save' : 'Save inspection'}
            </button>
          </div>
        </div>
      )}

      {request.serviceSlug === 'quality-control-supervision' && parsed.ncrResubmissions.length > 0 && (
        <div className="mt-6 bg-rose-50/80 border border-rose-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-rose-200 bg-rose-100/50">
            <h2 className="text-lg font-semibold text-rose-900">NCR resubmissions (report)</h2>
            <p className="text-sm text-rose-800 mt-0.5">Saved timeline of requester resubmissions and admin actions {isCompleted ? '(NCR closed)' : ''}</p>
          </div>
          <div className="p-6 space-y-4">
            {parsed.ncrResubmissions.map((entry, idx) => (
              <div key={idx} className="rounded-lg border border-rose-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-gray-900">{entry.by === 'admin' ? 'Admin' : 'Requester'}</span>
                  <span className="text-gray-500">—</span>
                  <span className="text-gray-600">{entry.action === 'accept' ? 'Accepted (NCR closed)' : 'Resubmitted'}</span>
                  <span className="text-gray-400">{new Date(entry.at).toLocaleString()}</span>
                </div>
                {entry.comment && <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{entry.comment}</p>}
                {entry.imageUrls && entry.imageUrls.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {entry.imageUrls.map((url, i) => (
                      <a key={i} href={url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`} target="_blank" rel="noopener noreferrer" className="block w-16 h-16 rounded border overflow-hidden">
                        <img src={url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`} alt="" className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {parsed.ncrResubmissions.length > 0 && parsed.ncrResubmissions[parsed.ncrResubmissions.length - 1].by === 'requester' && parsed.ncrResubmissions[parsed.ncrResubmissions.length - 1].action === 'resubmit' && !isCompleted && (
              <div className="rounded-lg border-2 border-rose-300 bg-rose-50/50 p-4 space-y-4">
                <p className="text-sm font-medium text-rose-900">Requester has resubmitted. Accept or send back with comment/photos.</p>
                <p className="text-xs text-rose-700">If you Accept, edit the checklist and report below, set the new result (e.g. Accepted), then Save inspection to complete the ticket.</p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleNcrAccept}
                    disabled={savingNcrAccept}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {savingNcrAccept ? 'Saving...' : 'Accept NCR response'}
                  </button>
                  <div className="flex-1 min-w-[200px]">
                    <textarea
                      value={ncrAdminComment}
                      onChange={(e) => setNcrAdminComment(e.target.value)}
                      placeholder="Comment for requester (optional)"
                      rows={2}
                      className="w-full text-sm border border-rose-200 rounded-lg px-3 py-2"
                    />
                    <div className="flex flex-wrap gap-2 items-center mt-2">
                      {ncrAdminImageUrls.map((url) => (
                        <span key={url} className="relative inline-block">
                          <img src={url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`} alt="" className="w-14 h-14 object-cover rounded border" />
                          <button type="button" onClick={() => setNcrAdminImageUrls((p) => p.filter((u) => u !== url))} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-xs">×</button>
                        </span>
                      ))}
                      <label className="w-14 h-14 rounded border border-dashed border-rose-300 flex items-center justify-center cursor-pointer hover:bg-rose-50">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={imageUploading}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const url = await uploadTicketImage(file);
                              if (url) setNcrAdminImageUrls((p) => [...p, url]);
                              e.target.value = '';
                            }
                          }}
                        />
                        <PhotoIcon className="w-6 h-6 text-rose-500" />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={handleNcrResubmit}
                      disabled={savingNcrResubmit}
                      className="mt-2 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 text-sm"
                    >
                      {savingNcrResubmit ? 'Sending...' : 'Resubmit to requester'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {(request.serviceSlug === 'enterprise-networking' || request.serviceSlug === 'quality-control-supervision') && (status === 'IN_PROGRESS' || status === 'COMPLETED') && (
        <>
          {/* Read-only view of saved values */}
          <div className="mt-6 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-lg font-semibold text-gray-900">Maintenance details (view)</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Description</label>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 min-h-[60px]">
                  {maintenanceDescription ? (
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{maintenanceDescription}</p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No description yet</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-2">Before images</label>
                {beforeUrls.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {beforeUrls.map((url, idx) => {
                      const imgSrc = url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`;
                      return (
                        <a key={idx} href={imgSrc} target="_blank" rel="noopener noreferrer" className="block w-24 h-24 rounded-lg border border-gray-200 overflow-hidden hover:border-blue-400">
                          <img src={imgSrc} alt={`Before ${idx + 1}`} className="w-full h-full object-cover" />
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No before images yet</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-2">After / finishing images</label>
                {afterUrls.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {afterUrls.map((url, idx) => {
                      const imgSrc = url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`;
                      return (
                        <a key={idx} href={imgSrc} target="_blank" rel="noopener noreferrer" className="block w-24 h-24 rounded-lg border border-gray-200 overflow-hidden hover:border-blue-400">
                          <img src={imgSrc} alt={`After ${idx + 1}`} className="w-full h-full object-cover" />
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No after images yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Edit form */}
          <div className="mt-6 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">Edit maintenance (leader notes &amp; images)</h2>
            {isCompleted && <p className="text-sm text-gray-500 mt-1">(Completed — no edits allowed)</p>}
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description of work / issues</label>
              <textarea
                value={maintenanceDescription}
                onChange={(e) => setMaintenanceDescription(e.target.value)}
                disabled={isCompleted}
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="Describe maintenance or issues addressed..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Before images</label>
              <div className="flex flex-wrap gap-2 items-center">
                {beforeUrls.map((url) => (
                  <span key={url} className="relative inline-block">
                    <a href={url} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded border bg-gray-100 overflow-hidden">
                      <img src={url} alt="Before" className="w-full h-full object-cover" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setBeforeUrls((prev) => prev.filter((u) => u !== url))}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {!isCompleted && (
                <label className={`w-20 h-20 rounded border border-dashed flex items-center justify-center shrink-0 ${imageUploading ? 'border-gray-300 bg-gray-50 cursor-not-allowed opacity-60' : 'border-gray-400 cursor-pointer hover:bg-gray-50'}`}>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={imageUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const url = await uploadTicketImage(file);
                        if (url) setBeforeUrls((prev) => [...prev, url]);
                        e.target.value = '';
                      }
                    }}
                  />
                  <PhotoIcon className="w-8 h-8 text-gray-400" />
                </label>
                )}
              </div>
              {imageUploading && imageUploadProgress != null && (
                <div className="mt-1 w-full max-w-[200px] h-1.5 rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-200" style={{ width: `${imageUploadProgress}%` }} />
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">After / finishing images</label>
              <div className="flex flex-wrap gap-2 items-center">
                {afterUrls.map((url) => (
                  <span key={url} className="relative inline-block">
                    <a href={url} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded border bg-gray-100 overflow-hidden">
                      <img src={url} alt="After" className="w-full h-full object-cover" />
                    </a>
                    {!isCompleted && (
                    <button
                      type="button"
                      onClick={() => setAfterUrls((prev) => prev.filter((u) => u !== url))}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center"
                    >
                      ×
                    </button>
                    )}
                  </span>
                ))}
                <label className={`w-20 h-20 rounded border border-dashed flex items-center justify-center shrink-0 ${imageUploading ? 'border-gray-300 bg-gray-50 cursor-not-allowed opacity-60' : 'border-gray-400 cursor-pointer hover:bg-gray-50'}`}>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={imageUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const url = await uploadTicketImage(file);
                        if (url) setAfterUrls((prev) => [...prev, url]);
                        e.target.value = '';
                      }
                    }}
                  />
                  <PhotoIcon className="w-8 h-8 text-gray-400" />
                </label>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveMaintenance}
              disabled={savingMaintenance || imageUploading || isCompleted}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingMaintenance ? 'Saving…' : imageUploading ? `Uploading${imageUploadProgress != null ? ` ${imageUploadProgress}%` : '…'}` : isCompleted ? 'Completed — no edits' : 'Save description & images'}
            </button>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
