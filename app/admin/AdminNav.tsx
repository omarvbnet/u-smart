'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  FolderKanban,
  Boxes,
  Users,
  Briefcase,
  FileText,
  ClipboardCheck,
  GraduationCap,
  CheckSquare,
  UsersRound,
  UserCog,
  Building2,
  Building,
  TicketCheck,
  UserCircle,
} from 'lucide-react';

const links = [
  { href: '/admin', label: 'Hero / Home', icon: Home },
  { href: '/admin/projects', label: 'Projects', icon: FolderKanban },
  { href: '/admin/services', label: 'Services', icon: Boxes },
  { href: '/admin/clients', label: 'Clients', icon: Users },
  { href: '/admin/careers', label: 'Careers', icon: Briefcase },
  { href: '/admin/applications', label: 'Applications', icon: FileText },
  { href: '/admin/visitor-requests', label: 'Visitors', icon: FileText },
  { href: '/admin/quality-requests', label: 'Quality Requests', icon: ClipboardCheck, badgeType: 'pending_qc' as const },
  { href: '/admin/training-requests', label: 'Training', icon: GraduationCap, badgeType: 'pending_training' as const },
  { href: '/admin/checklists', label: 'Checklists', icon: CheckSquare },
  { href: '/admin/teams', label: 'Teams', icon: UsersRound },
  { href: '/admin/employees', label: 'Employees', icon: UserCog },
  { href: '/admin/company-requests', label: 'Company Req.', icon: Building2 },
  { href: '/admin/companies', label: 'Companies', icon: Building },
  { href: '/admin/requesters', label: 'Requesters', icon: TicketCheck },
  { href: '/admin/users', label: 'Users', icon: UserCircle },
];

export default function AdminNav() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);
  const [qcPendingCount, setQcPendingCount] = useState(0);
  const [trainingPendingCount, setTrainingPendingCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const [res, qcRes, trainingRes] = await Promise.all([
          fetch('/api/notifications/count?type=pending_tickets'),
          fetch('/api/notifications/count?type=pending_qc_tickets'),
          fetch('/api/notifications/count?type=pending_training_requests'),
        ]);
        const data = await res.json();
        const qcData = await qcRes.json();
        const trainingData = await trainingRes.json();
        if (data.success && typeof data.count === 'number') setPendingCount(data.count);
        if (qcData.success && typeof qcData.count === 'number') setQcPendingCount(qcData.count);
        if (trainingData.success && typeof trainingData.count === 'number') setTrainingPendingCount(trainingData.count);
      } catch {
        /* ignore */
      }
    };
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <nav className="space-y-0.5 px-3">
      {links.map(({ href, label, icon: Icon, badgeType }) => {
        const isActive =
          href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(href);
        const showBadge =
          (href === '/admin/visitor-requests' && pendingCount > 0) ||
          (href === '/admin/quality-requests' && badgeType === 'pending_qc' && qcPendingCount > 0) ||
          (href === '/admin/training-requests' && badgeType === 'pending_training' && trainingPendingCount > 0);
        const badgeCount =
          href === '/admin/quality-requests' ? qcPendingCount :
          href === '/admin/training-requests' ? trainingPendingCount : pendingCount;
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
              isActive
                ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/10 text-white border border-white/10 shadow-lg shadow-blue-500/5'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
              <span className="text-sm font-medium truncate">{label}</span>
            </div>
            {showBadge && (
              <span className="shrink-0 min-w-[1.25rem] h-5 flex items-center justify-center px-1.5 text-xs font-semibold rounded-full bg-amber-500 text-white animate-pulse">
                {badgeCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
