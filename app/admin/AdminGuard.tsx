'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminNav from './AdminNav';

type User = { id: string; email: string; name: string | null; role: string };

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false);
      return;
    }
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.user) {
          setUser(data.user);
        } else {
          router.replace('/admin/login');
        }
      })
      .catch(() => router.replace('/admin/login'))
      .finally(() => setLoading(false));
  }, [pathname, isLoginPage, router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    router.replace('/admin/login');
    router.refresh();
  };

  if (loading && !isLoginPage) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <aside className="fixed top-0 left-0 z-40 w-64 h-screen flex flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-r border-white/5 shadow-2xl shadow-black/20">
        <div className="flex flex-col h-full min-h-0">
          <div className="shrink-0 px-5 py-6 border-b border-white/5">
            <Link
              href="/admin"
              className="flex items-center gap-3 group"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/30 group-hover:shadow-blue-500/40 transition-shadow">
                <span className="text-lg font-bold text-white">U</span>
              </div>
              <span className="text-lg font-bold text-white tracking-tight">U-SMART</span>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Admin</span>
            </Link>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-4 admin-nav-scroll">
            <AdminNav />
          </div>
          <div className="shrink-0 p-4 border-t border-white/5 space-y-2 bg-slate-900/50">
            <div className="px-3 py-2 rounded-lg bg-white/5">
              <div className="text-sm font-medium text-white truncate" title={user.email}>
                {user.name || user.email}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{user.role}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            >
              Sign out
            </button>
            <Link
              href="/"
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              ← Back to site
            </Link>
          </div>
        </div>
      </aside>
      <main className="pl-64">
        {children}
      </main>
    </div>
  );
}
