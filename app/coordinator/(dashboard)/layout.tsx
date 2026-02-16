'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, ListTodo, LogOut, Menu, CalendarClock, TrendingUp, FileText, Plug } from 'lucide-react';

type User = { id: string; email: string; name: string | null; role: string; companyName: string };

export default function CoordinatorDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetch('/api/coordinator/auth/login', { method: 'GET', credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.authenticated && data.user) {
          setUser(data.user);
        } else {
          router.replace('/coordinator/login');
        }
      })
      .catch(() => router.replace('/coordinator/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const logout = async () => {
    await fetch('/api/coordinator/auth/logout', { method: 'POST', credentials: 'include' });
    router.replace('/coordinator/login');
    router.refresh();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500">جاري التحميل...</div>
      </div>
    );
  }

  if (!user) return null;

  const nav = [
    { href: '/coordinator', label: 'لوحة التحكم', icon: LayoutDashboard },
    { href: '/coordinator/tasks', label: 'المهام', icon: ListTodo },
    { href: '/coordinator/job-duties', label: 'واجبات الوظيفة', icon: CalendarClock },
    { href: '/coordinator/kpis', label: 'مؤشرات الأداء', icon: TrendingUp },
    { href: '/coordinator/reports', label: 'التقارير', icon: FileText },
    { href: '/coordinator/integrations', label: 'التكاملات', icon: Plug },
  ];

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed inset-y-0 right-0 z-40 w-64 bg-slate-900 text-white transform transition-transform lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-slate-700">
            <p className="font-semibold">منسق المشاريع الرقمي</p>
            <p className="text-sm text-slate-400 truncate">{user.companyName}</p>
          </div>
          <nav className="flex-1 p-4 space-y-1">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  pathname === href ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            ))}
          </nav>
          <div className="p-4 border-t border-slate-700">
            <button
              onClick={logout}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              تسجيل الخروج
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 lg:mr-64">
        <header className="sticky top-0 z-30 flex items-center gap-4 h-14 px-4 bg-white border-b border-slate-200">
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="p-2 rounded-lg hover:bg-slate-100 lg:hidden"
            aria-label="القائمة"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm text-slate-600">{user.name || user.email}</span>
        </header>
        <main className="p-4 md:p-6">{children}</main>
      </div>

      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="إغلاق"
        />
      )}
    </div>
  );
}
