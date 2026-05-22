'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Map,
  MapPin,
  Menu,
  Package,
  User,
  Users,
  Wrench,
  XCircle,
  X,
} from 'lucide-react';
import type { ProviserUser } from '@/lib/proviser-web';
import type { ProviserMembership } from '@/lib/proviser-permissions';
import { buildProviserNav, isNavActive } from '@/lib/proviser-nav';

const ICONS: Record<string, React.ReactNode> = {
  tickets: <ClipboardList className="w-5 h-5 shrink-0" />,
  sites: <MapPin className="w-5 h-5 shrink-0" />,
  map: <Map className="w-5 h-5 shrink-0" />,
  staff: <Users className="w-5 h-5 shrink-0" />,
  departments: <Building2 className="w-5 h-5 shrink-0" />,
  warehouse: <Package className="w-5 h-5 shrink-0" />,
  performance: <BarChart3 className="w-5 h-5 shrink-0" />,
  cancellations: <XCircle className="w-5 h-5 shrink-0" />,
  maintenance: <Wrench className="w-5 h-5 shrink-0" />,
  alerts: <Bell className="w-5 h-5 shrink-0" />,
  profile: <User className="w-5 h-5 shrink-0" />,
};

export function ProviserShell({
  user,
  membership,
  children,
  onLogout,
}: {
  user: ProviserUser;
  membership?: ProviserMembership;
  children: React.ReactNode;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const m = membership ?? {
    mode: 'none' as const,
    isOwner: false,
    role: user.role ?? '',
    departmentId: null,
    departmentName: null,
    workspaceStatus: null,
    canManageDepartments: false,
    canManageStaff: false,
    canViewPerformance: false,
    performanceScope: null,
    canViewCompanyWide: false,
    isDepartmentScoped: false,
    scopeDepartmentId: null,
  };

  const nav = buildProviserNav(user.role ?? m.role, m);
  const ticketsHref = nav[0]?.href ?? '/proviser/company';

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {nav.map((item) => {
        const active = isNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
              active
                ? 'bg-amber-500/15 text-amber-200 border border-amber-500/25'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            {ICONS[item.icon] ?? <LayoutDashboard className="w-5 h-5" />}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-[#07080c] text-white flex">
      {/* Desktop sidebar — stays mounted across navigations */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-white/[0.06] bg-[#0c1018]">
        <div className="p-5 border-b border-white/[0.06]">
          <Link href={ticketsHref} prefetch className="flex items-center gap-2.5 font-bold text-lg">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-black">
              <LayoutDashboard className="w-5 h-5" />
            </span>
            <span className="bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent">
              Proviser
            </span>
          </Link>
          <p className="mt-3 text-xs text-slate-500 truncate">
            {user.name || user.username}
            {m.departmentName ? (
              <span className="block text-slate-400 mt-0.5">{m.departmentName}</span>
            ) : user.role ? (
              <span className="block text-slate-400 mt-0.5">{user.role}</span>
            ) : null}
          </p>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <NavLinks />
        </nav>
        <div className="p-4 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-50 border-b border-white/[0.06] bg-[#0c1018]/95 backdrop-blur-md">
          <div className="flex items-center justify-between px-4 h-14">
            <Link href={ticketsHref} prefetch className="font-bold text-amber-400">
              Proviser
            </Link>
            <button
              type="button"
              aria-label="Menu"
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded-lg text-slate-300 hover:bg-white/5"
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </header>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-[60]">
            <button
              type="button"
              className="absolute inset-0 bg-black/60"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute right-0 top-0 bottom-0 w-[min(100%,280px)] bg-[#0c1018] border-l border-white/10 flex flex-col shadow-2xl">
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <span className="font-semibold text-amber-300">Menu</span>
                <button type="button" onClick={() => setMobileOpen(false)} className="p-1 text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                <NavLinks onNavigate={() => setMobileOpen(false)} />
              </nav>
              <div className="p-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    onLogout();
                  }}
                  className="flex w-full items-center gap-2 text-sm text-slate-400"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 lg:py-8">{children}</main>

        {/* Mobile bottom nav — primary items */}
        <nav className="lg:hidden sticky bottom-0 z-40 border-t border-white/[0.06] bg-[#0c1018]/95 backdrop-blur-md px-2 py-2 flex justify-around gap-1 safe-area-pb">
          {nav.slice(0, 5).map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] min-w-[56px] ${
                  active ? 'text-amber-300' : 'text-slate-500'
                }`}
              >
                {ICONS[item.icon]}
                <span className="truncate max-w-[64px]">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
