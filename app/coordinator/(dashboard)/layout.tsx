'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, ListTodo, LogOut, Menu, CalendarClock, TrendingUp, FileText, Plug, CreditCard, Bell, Share2, Briefcase, User, FileCheck, Shield, Phone } from 'lucide-react';

type User = { id: string; email: string; name: string | null; role: string; companyName: string };
type NotificationItem = { id: string; title: string; body: string | null; linkUrl: string | null; read: boolean; createdAt: string };

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
  const [notifUnread, setNotifUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifList, setNotifList] = useState<NotificationItem[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

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

  const fetchNotifCount = () => {
    fetch('/api/coordinator/notifications?limit=1', { credentials: 'include' })
      .then((res) => res.json())
      .then((d) => { if (d.success && typeof d.unreadCount === 'number') setNotifUnread(d.unreadCount); });
  };

  useEffect(() => {
    if (!user) return;
    fetchNotifCount();
  }, [user]);

  useEffect(() => {
    if (!notifOpen) return;
    fetch('/api/coordinator/notifications?limit=20', { credentials: 'include' })
      .then((res) => res.json())
      .then((d) => { if (d.success && d.notifications) setNotifList(d.notifications); });
  }, [notifOpen]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const markOneRead = (id: string) => {
    fetch(`/api/coordinator/notifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ read: true }),
    }).then(() => {
      setNotifList((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setNotifUnread((c) => Math.max(0, c - 1));
    });
  };

  const markAllRead = () => {
    fetch('/api/coordinator/notifications/read-all', { method: 'POST', credentials: 'include' })
      .then((res) => res.json())
      .then((d) => {
        if (d.success) {
          setNotifUnread(0);
          setNotifList((prev) => prev.map((n) => ({ ...n, read: true })));
        }
      });
  };

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
    { href: '/coordinator/social', label: 'التواصل الاجتماعي', icon: Share2 },
    { href: '/coordinator/job-results', label: 'نتائج الوظائف', icon: Briefcase },
    { href: '/coordinator/profile', label: 'الملف الشخصي', icon: User },
    { href: '/coordinator/applications', label: 'الطلبات المولدة', icon: FileCheck },
    { href: '/coordinator/billing', label: 'الفواتير والاشتراك', icon: CreditCard },
    { href: '/coordinator/audit', label: 'سجل التدقيق', icon: Shield },
    { href: '/coordinator/voice', label: 'المكالمات والصوت', icon: Phone },
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
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 h-14 px-4 bg-white border-b border-slate-200">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen((o) => !o)}
              className="p-2 rounded-lg hover:bg-slate-100 lg:hidden"
              aria-label="القائمة"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-sm text-slate-600">{user.name || user.email}</span>
          </div>
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((o) => !o)}
              className="relative p-2 rounded-lg hover:bg-slate-100"
              aria-label="الإشعارات"
            >
              <Bell className="w-5 h-5 text-slate-600" />
              {notifUnread > 0 && (
                <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-xs">
                  {notifUnread > 99 ? '99+' : notifUnread}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute left-0 top-full mt-1 w-80 max-h-[320px] overflow-auto bg-white border border-slate-200 rounded-xl shadow-lg py-2 z-50">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                  <span className="font-medium text-slate-800">الإشعارات</span>
                  {notifUnread > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      تحديد الكل كمقروء
                    </button>
                  )}
                </div>
                {notifList.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-slate-500">لا توجد إشعارات</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {notifList.map((n) => (
                      <li key={n.id}>
                        <div
                          className={`px-3 py-2 hover:bg-slate-50 ${!n.read ? 'bg-blue-50/50' : ''}`}
                        >
                          {n.linkUrl ? (
                            <Link
                              href={n.linkUrl}
                              className="block"
                              onClick={() => { markOneRead(n.id); setNotifOpen(false); }}
                            >
                              <p className="text-sm font-medium text-slate-800">{n.title}</p>
                              {n.body && <p className="text-xs text-slate-500 line-clamp-2">{n.body}</p>}
                            </Link>
                          ) : (
                            <div>
                              <p className="text-sm font-medium text-slate-800">{n.title}</p>
                              {n.body && <p className="text-xs text-slate-500 line-clamp-2">{n.body}</p>}
                              {!n.read && (
                                <button
                                  type="button"
                                  onClick={() => markOneRead(n.id)}
                                  className="text-xs text-blue-600 mt-1 hover:underline"
                                >
                                  تحديد كمقروء
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
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
