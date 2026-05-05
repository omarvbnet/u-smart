'use client';

import { useState, useEffect } from 'react';
import { Building2, Plus, Users, RefreshCw, Eye, EyeOff, Copy, CheckCircle2 } from 'lucide-react';

type CoordCompany = {
  id: string;
  slug: string;
  name: string;
  freeTicketsUsed: number;
  freeTicketsLimit: number;
  activeTicketPlan: string | null;
  createdAt: string;
  _count?: { users: number; tickets: number };
};

type Credential = { username: string; password: string; companyName: string };
type StaffCred = { username: string; temporaryPassword: string };
type PaymentRow = {
  id: string;
  amountCents: number;
  status: string;
  createdAt: string;
  subscription?: { company?: { name?: string | null } | null } | null;
};
type InvoiceRow = {
  id: string;
  amountCents: number;
  createdAt: string;
  periodFrom: string;
  periodTo: string;
  subscription?: { company?: { name?: string | null } | null } | null;
};

const STAFF_ROLES = [
  { value: 'MANAGER', label: 'Manager' },
  { value: 'TEAM_LEADER', label: 'Team Leader' },
  { value: 'COORDINATOR', label: 'Coordinator' },
  { value: 'ENGINEER', label: 'Engineer (General)' },
  { value: 'QUALITY_ENGINEER', label: 'Quality Engineer' },
  { value: 'SUPERVISION_ENGINEER', label: 'Supervision Engineer' },
  { value: 'TECHNICIAN', label: 'Technician' },
  { value: 'CLIENT', label: 'Client' },
];

export default function CoordinatorCompaniesPage() {
  const [companies, setCompanies] = useState<CoordCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New company form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({
    companyName: '',
    ownerFirstName: '',
    ownerLastName: '',
    ownerEmail: '',
    ownerPassword: '',
  });
  const [creating, setCreating] = useState(false);
  const [newCred, setNewCred] = useState<Credential | null>(null);

  // Add staff form
  const [staffCompanyId, setStaffCompanyId] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState({ firstName: '', lastName: '', email: '', role: 'TECHNICIAN', password: '' });
  const [addingStaff, setAddingStaff] = useState(false);
  const [staffCred, setStaffCred] = useState<StaffCred | null>(null);
  const [staffMsg, setStaffMsg] = useState('');

  const [showPwd, setShowPwd] = useState(false);
  const [copied, setCopied] = useState('');
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [paymentTotals, setPaymentTotals] = useState({ paymentsCents: 0, invoicesCents: 0 });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [companyRes, paymentRes] = await Promise.all([
        fetch('/api/admin/coordinator-companies'),
        fetch('/api/admin/company-payments'),
      ]);
      const companyData = await companyRes.json();
      const paymentData = await paymentRes.json();
      if (companyData.success) setCompanies(companyData.companies ?? []);
      else setError(companyData.message ?? 'Failed to load companies');
      if (paymentData.success) {
        setPayments(paymentData.payments ?? []);
        setInvoices(paymentData.invoices ?? []);
        setPaymentTotals({
          paymentsCents: paymentData.totals?.paymentsCents ?? 0,
          invoicesCents: paymentData.totals?.invoicesCents ?? 0,
        });
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/admin/coordinator-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      });
      const data = await res.json();
      if (data.success) {
        setNewCred({ username: data.credentials.username, password: data.credentials.password, companyName: data.company.name });
        setNewForm({ companyName: '', ownerFirstName: '', ownerLastName: '', ownerEmail: '', ownerPassword: '' });
        setShowNewForm(false);
        load();
      } else {
        setError(data.message ?? 'Failed to create');
      }
    } catch {
      setError('Network error');
    } finally {
      setCreating(false);
    }
  };

  const addStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffCompanyId) return;
    setAddingStaff(true);
    setStaffMsg('');
    try {
      const res = await fetch(`/api/admin/coordinator-companies/${staffCompanyId}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staffForm),
      });
      const data = await res.json();
      if (data.success) {
        setStaffCred(data.credentials);
        setStaffForm({ firstName: '', lastName: '', email: '', role: 'TECHNICIAN', password: '' });
        setStaffMsg('Staff member created.');
        load();
      } else {
        setStaffMsg(data.message ?? 'Failed to create staff');
      }
    } catch {
      setStaffMsg('Network error');
    } finally {
      setAddingStaff(false);
    }
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const fmt = (s: string) => new Date(s).toLocaleDateString();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-cyan-400" />
            Coordinator Companies
          </h1>
          <p className="text-slate-400 text-sm mt-1">Create and manage coordinator platform companies and their staff</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-slate-300 hover:text-white text-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={() => { setShowNewForm(!showNewForm); setNewCred(null); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> New Company
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 px-4 py-3 text-sm">{error}</div>
      )}

      <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <h2 className="text-sm font-semibold text-emerald-300 mb-3">Company Payments Overview</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <p className="text-slate-400 text-xs">Total payments</p>
            <p className="text-white font-semibold">${(paymentTotals.paymentsCents / 100).toFixed(2)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <p className="text-slate-400 text-xs">Total invoices</p>
            <p className="text-white font-semibold">${(paymentTotals.invoicesCents / 100).toFixed(2)}</p>
          </div>
        </div>
        <div className="mt-3 grid lg:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 max-h-44 overflow-auto">
            <p className="text-slate-300 font-medium mb-2">Recent Payments</p>
            {payments.slice(0, 8).map((p) => (
              <p key={p.id} className="text-slate-400 mb-1">
                {(p.subscription?.company?.name ?? 'Company')} - ${(p.amountCents / 100).toFixed(2)} - {p.status}
              </p>
            ))}
            {payments.length === 0 && <p className="text-slate-500">No payments yet.</p>}
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 max-h-44 overflow-auto">
            <p className="text-slate-300 font-medium mb-2">Recent Invoices</p>
            {invoices.slice(0, 8).map((i) => (
              <p key={i.id} className="text-slate-400 mb-1">
                {(i.subscription?.company?.name ?? 'Company')} - ${(i.amountCents / 100).toFixed(2)}
              </p>
            ))}
            {invoices.length === 0 && <p className="text-slate-500">No invoices yet.</p>}
          </div>
        </div>
      </div>

      {/* New credential result */}
      {newCred && (
        <div className="mb-6 rounded-xl border border-green-500/40 bg-green-500/10 p-5">
          <p className="text-green-300 font-semibold mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> Company &ldquo;{newCred.companyName}&rdquo; created
          </p>
          <div className="space-y-2 font-mono text-sm">
            <div className="flex items-center gap-3">
              <span className="text-slate-400 w-24">Username:</span>
              <span className="text-white">{newCred.username}</span>
              <button onClick={() => copy(newCred.username, 'uname')} className="ml-1 text-cyan-400 hover:text-cyan-300">
                {copied === 'uname' ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-slate-400 w-24">Password:</span>
              <span className="text-white">{showPwd ? newCred.password : '••••••••'}</span>
              <button onClick={() => setShowPwd(!showPwd)} className="text-slate-400 hover:text-white">
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button onClick={() => copy(newCred.password, 'pwd')} className="ml-1 text-cyan-400 hover:text-cyan-300">
                {copied === 'pwd' ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">Share these credentials securely. The owner can log in at <strong>/ar/dashboard/login</strong> or the Provisor app.</p>
          <button onClick={() => setNewCred(null)} className="mt-3 text-xs text-slate-500 hover:text-slate-300">Dismiss</button>
        </div>
      )}

      {/* Staff credential result */}
      {staffCred && (
        <div className="mb-6 rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-5">
          <p className="text-cyan-300 font-semibold mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> Staff member created
          </p>
          <div className="space-y-2 font-mono text-sm">
            <div className="flex items-center gap-3">
              <span className="text-slate-400 w-24">Username:</span>
              <span className="text-white">{staffCred.username}</span>
              <button onClick={() => copy(staffCred.username, 'su')} className="ml-1 text-cyan-400 hover:text-cyan-300">
                {copied === 'su' ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-slate-400 w-24">Temp pwd:</span>
              <span className="text-white">{staffCred.temporaryPassword}</span>
              <button onClick={() => copy(staffCred.temporaryPassword, 'sp')} className="ml-1 text-cyan-400 hover:text-cyan-300">
                {copied === 'sp' ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">User must change password on first login.</p>
          <button onClick={() => setStaffCred(null)} className="mt-3 text-xs text-slate-500 hover:text-slate-300">Dismiss</button>
        </div>
      )}

      {/* New company form */}
      {showNewForm && (
        <form onSubmit={createCompany} className="mb-6 rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
          <h2 className="text-white font-semibold text-lg">Create new coordinator company</h2>
          <div>
            <label className="block text-slate-400 text-xs mb-1">Company name *</label>
            <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
              value={newForm.companyName} onChange={e => setNewForm(f => ({ ...f, companyName: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 text-xs mb-1">Owner first name *</label>
              <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                value={newForm.ownerFirstName} onChange={e => setNewForm(f => ({ ...f, ownerFirstName: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Owner last name</label>
              <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                value={newForm.ownerLastName} onChange={e => setNewForm(f => ({ ...f, ownerLastName: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 text-xs mb-1">Owner email *</label>
              <input type="email" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                value={newForm.ownerEmail} onChange={e => setNewForm(f => ({ ...f, ownerEmail: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Owner password *</label>
              <input type="password" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                value={newForm.ownerPassword} onChange={e => setNewForm(f => ({ ...f, ownerPassword: e.target.value }))} minLength={6} required />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={creating}
              className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-sm font-medium">
              {creating ? 'Creating…' : 'Create company + owner'}
            </button>
            <button type="button" onClick={() => setShowNewForm(false)}
              className="px-4 py-2 rounded-lg bg-white/5 text-slate-400 hover:text-white text-sm">Cancel</button>
          </div>
        </form>
      )}

      {/* Add staff panel */}
      {staffCompanyId && (
        <form onSubmit={addStaff} className="mb-6 rounded-xl border border-violet-500/30 bg-violet-500/5 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold text-lg">
              Add staff — {companies.find(c => c.id === staffCompanyId)?.name}
            </h2>
            <button type="button" onClick={() => { setStaffCompanyId(null); setStaffCred(null); setStaffMsg(''); }}
              className="text-slate-400 hover:text-white text-sm">Close</button>
          </div>
          {staffMsg && <p className={`text-sm ${staffMsg.startsWith('Staff') ? 'text-green-400' : 'text-red-400'}`}>{staffMsg}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 text-xs mb-1">First name *</label>
              <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-400"
                value={staffForm.firstName} onChange={e => setStaffForm(f => ({ ...f, firstName: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Last name</label>
              <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-400"
                value={staffForm.lastName} onChange={e => setStaffForm(f => ({ ...f, lastName: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 text-xs mb-1">Email *</label>
              <input type="email" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-400"
                value={staffForm.email} onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Password (optional — auto-gen if empty)</label>
              <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-400"
                value={staffForm.password} onChange={e => setStaffForm(f => ({ ...f, password: e.target.value }))} placeholder="Leave blank to auto-generate" />
            </div>
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1">Role *</label>
            <div className="flex flex-wrap gap-2">
              {STAFF_ROLES.map(r => (
                <button key={r.value} type="button"
                  onClick={() => setStaffForm(f => ({ ...f, role: r.value }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    staffForm.role === r.value
                      ? 'bg-violet-600/40 border-violet-400 text-violet-200'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  }`}>{r.label}</button>
              ))}
            </div>
          </div>
          <button type="submit" disabled={addingStaff}
            className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-medium">
            {addingStaff ? 'Adding…' : 'Add staff member'}
          </button>
        </form>
      )}

      {/* Companies list */}
      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : companies.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No coordinator companies yet.</p>
          <p className="text-sm mt-1">Click &ldquo;New Company&rdquo; to create the first one.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {companies.map(c => (
            <div key={c.id} className="rounded-xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-white font-semibold text-base">{c.name}</h3>
                  <p className="text-slate-500 text-xs mt-0.5">
                    slug: {c.slug} · created {fmt(c.createdAt)}
                  </p>
                  <div className="flex flex-wrap gap-3 mt-3 text-xs">
                    <span className="text-slate-300">
                      <span className="text-slate-500">Staff:</span> {c._count?.users ?? '—'}
                    </span>
                    <span className="text-slate-300">
                      <span className="text-slate-500">Tickets:</span> {c._count?.tickets ?? '—'}
                    </span>
                    <span className="text-slate-300">
                      <span className="text-slate-500">Free quota:</span> {c.freeTicketsUsed}/{c.freeTicketsLimit}
                    </span>
                    {c.activeTicketPlan && (
                      <span className="text-green-400">Plan: {c.activeTicketPlan}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { setStaffCompanyId(c.id); setStaffCred(null); setStaffMsg(''); }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 text-violet-300 text-xs font-medium"
                >
                  <Users className="w-3.5 h-3.5" /> Add staff
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
