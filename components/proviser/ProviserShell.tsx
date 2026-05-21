'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ClipboardList, LayoutDashboard, LogOut, MapPin, User } from 'lucide-react';
import type { ProviserUser } from '@/lib/proviser-web';
import { isEngineerRole } from '@/lib/proviser-web';

type NavItem = { href: string; label: string; icon: React.ReactNode };

export function ProviserShell({
  user,
  children,
  onLogout,
}: {
  user: ProviserUser;
  children: React.ReactNode;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const engineer = isEngineerRole(user.role);
  const base = engineer ? '/proviser/engineer' : '/proviser/company';

  const nav: NavItem[] = [
    { href: base, label: engineer ? 'Tickets' : 'Tickets', icon: <ClipboardList className="w-4 h-4" /> },
    { href: '/proviser/sites', label: 'Sites', icon: <MapPin className="w-4 h-4" /> },
    { href: '/proviser/notifications', label: 'Alerts', icon: <Bell className="w-4 h-4" /> },
    { href: '/proviser/profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col">
      <header className="border-b border-white/10 bg-[#0f1419]/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link href={base} className="flex items-center gap-2 font-bold text-amber-400 tracking-wide">
            <LayoutDashboard className="w-5 h-5" />
            <span>Proviser</span>
          </Link>
          <p className="hidden sm:block text-sm text-gray-400 truncate max-w-[200px]">
            {user.name || user.username}
            {user.role ? <span className="text-gray-500"> · {user.role}</span> : null}
          </p>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto pb-2">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition ${
                  active ? 'bg-amber-500/20 text-amber-300' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
