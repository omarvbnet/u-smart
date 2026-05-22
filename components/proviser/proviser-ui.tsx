'use client';

import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="text-sm text-slate-400 mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#141a22] to-[#0f1419] shadow-lg shadow-black/20 ${className}`}
    >
      {children}
    </div>
  );
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full sm:max-w-md rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
    />
  );
}

export type TabItem<T extends string> = { id: T; label: string; count?: number };

export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition ${
            active === t.id
              ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
              : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
          }`}
        >
          {t.label}
          {t.count != null ? ` (${t.count})` : ''}
        </button>
      ))}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  IN_PROGRESS: 'bg-sky-500/15 text-sky-200 border-sky-500/30',
  COMPLETED: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
  CANCELLED: 'bg-rose-500/15 text-rose-200 border-rose-500/30',
  CANCELED: 'bg-rose-500/15 text-rose-200 border-rose-500/30',
};

export function StatusBadge({ status }: { status: string }) {
  const key = status.toUpperCase().replace(/\s+/g, '_');
  const style = STATUS_STYLES[key] ?? 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  const label = status.replace(/_/g, ' ');
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase border ${style}`}>
      {label}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
      <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-white mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-center text-slate-500 py-16 text-sm">{message}</p>
  );
}

export function ScopeBanner({ membership }: { membership: { canViewCompanyWide: boolean; departmentName: string | null; isOwner: boolean } }) {
  if (membership.canViewCompanyWide) {
    return (
      <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200/90">
        Company-wide view — all departments, provinces, and staff.
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-2.5 text-sm text-sky-200/90">
      Department scope
      {membership.departmentName ? `: ${membership.departmentName}` : ''} — managers and engineers see only their department data.
    </div>
  );
}
