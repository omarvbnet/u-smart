'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  FolderKanban,
  Boxes,
  Package,
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
  Network,
  HardHat,
  Sun,
  Scale,
  KeyRound,
  BugPlay,
  ListChecks,
  Tags,
  ArrowUpCircle,
} from 'lucide-react';

const links = [
  { href: '/admin', label: 'Hero / Home', icon: Home },
  { href: '/admin/analytics', label: 'Analytics dashboard', icon: ClipboardCheck },
  { href: '/admin/provisor-requests', label: 'Provisor requests', icon: TicketCheck, badgeType: 'pending_qc' as const },
  { href: '/admin/projects', label: 'Projects', icon: FolderKanban },
  { href: '/admin/services', label: 'Services', icon: Boxes },
  { href: '/admin/products', label: 'Products', icon: Package },
  { href: '/admin/clients', label: 'Clients', icon: Users },
  { href: '/admin/careers', label: 'Careers', icon: Briefcase },
  { href: '/admin/applications', label: 'Applications', icon: FileText },
  { href: '/admin/visitor-requests', label: 'Visitors', icon: FileText, badgeType: 'pending_visitor' as const },
  { href: '/admin/clean-energy-requests', label: 'Clean Energy Inbox', icon: Sun, badgeType: 'pending_clean_energy' as const },
  { href: '/admin/enterprise-networking-requests', label: 'Enterprise Networking', icon: Network, badgeType: 'pending_enterprise' as const },
  { href: '/admin/quality-requests', label: 'Quality Requests', icon: ClipboardCheck, badgeType: 'pending_qc' as const },
  { href: '/admin/conflicts', label: 'Conflicts', icon: Scale, badgeType: 'pending_conflicts' as const },
  { href: '/admin/training-requests', label: 'Training', icon: GraduationCap, badgeType: 'pending_training' as const },
  { href: '/admin/product-requests', label: 'Product Orders', icon: Package, badgeType: 'pending_product' as const },
  { href: '/admin/checklists', label: 'Checklists', icon: CheckSquare },
  { href: '/admin/provisor-techniques', label: 'QC techniques', icon: ClipboardCheck },
  { href: '/admin/ticket-policy', label: 'Ticket cancel / resubmit', icon: TicketCheck },
  { href: '/admin/platform-reasons', label: 'Maintenance / expense reasons', icon: Tags },
  { href: '/admin/issue-reports', label: 'Issue reports', icon: BugPlay, badgeType: 'pending_issue_reports' as const },
  { href: '/admin/issue-report-types', label: 'Issue report types', icon: ListChecks },
  { href: '/admin/engineers', label: 'Provisor Engineers', icon: HardHat },
  { href: '/admin/teams', label: 'Teams', icon: UsersRound },
  { href: '/admin/employees', label: 'Employees', icon: UserCog },
  { href: '/admin/company-requests', label: 'Company Req.', icon: Building2 },
  { href: '/admin/ticket-api-key-requests', label: 'Ticket API keys', icon: KeyRound },
  { href: '/admin/registration-requests', label: 'Registration Req.', icon: UserCircle },
  { href: '/admin/upgrade-requests', label: 'Upgrade Requests', icon: ArrowUpCircle, badgeType: 'pending_upgrade_requests' as const },
  { href: '/admin/companies', label: 'Companies', icon: Building },
  { href: '/admin/coordinator-companies', label: 'Coordinator Companies', icon: Building2 },
  { href: '/admin/private-companies', label: 'Private workspaces', icon: Building, badgeType: 'pending_private_company' as const },
  { href: '/admin/requesters', label: 'Requesters', icon: TicketCheck },
  { href: '/admin/push-notifications', label: 'Push notifications', icon: TicketCheck },
  { href: '/admin/users', label: 'Users', icon: UserCircle },
];

export default function AdminNav() {
  const pathname = usePathname();
  const [visitorPendingCount, setVisitorPendingCount] = useState(0);
  const [enterprisePendingCount, setEnterprisePendingCount] = useState(0);
  const [cleanEnergyPendingCount, setCleanEnergyPendingCount] = useState(0);
  const [qcPendingCount, setQcPendingCount] = useState(0);
  const [trainingPendingCount, setTrainingPendingCount] = useState(0);
  const [productPendingCount, setProductPendingCount] = useState(0);
  const [privateCompanyPendingCount, setPrivateCompanyPendingCount] = useState(0);
  const [conflictsPendingCount, setConflictsPendingCount] = useState(0);
  const [upgradePendingCount, setUpgradePendingCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const [visitorRes, cleanEnergyRes, enterpriseRes, qcRes, trainingRes, productRes, privateRes, conflictsRes, upgradeRes] = await Promise.all([
          fetch('/api/notifications/count?type=pending_visitor_tickets'),
          fetch('/api/notifications/count?type=pending_clean_energy_tickets'),
          fetch('/api/notifications/count?type=pending_tickets'),
          fetch('/api/notifications/count?type=pending_qc_tickets'),
          fetch('/api/notifications/count?type=pending_training_requests'),
          fetch('/api/notifications/count?type=pending_product_requests'),
          fetch('/api/notifications/count?type=pending_private_companies'),
          fetch('/api/notifications/count?type=pending_conflicts'),
          fetch('/api/notifications/count?type=pending_upgrade_requests'),
        ]);
        const visitorData = await visitorRes.json();
        const cleanEnergyData = await cleanEnergyRes.json();
        const enterpriseData = await enterpriseRes.json();
        const qcData = await qcRes.json();
        const trainingData = await trainingRes.json();
        const productData = await productRes.json();
        const privateData = await privateRes.json().catch(() => ({}));
        const conflictsData = await conflictsRes.json().catch(() => ({}));
        const upgradeData = await upgradeRes.json().catch(() => ({}));
        if (visitorData.success && typeof visitorData.count === 'number') setVisitorPendingCount(visitorData.count);
        if (cleanEnergyData.success && typeof cleanEnergyData.count === 'number') setCleanEnergyPendingCount(cleanEnergyData.count);
        if (enterpriseData.success && typeof enterpriseData.count === 'number') setEnterprisePendingCount(enterpriseData.count);
        if (qcData.success && typeof qcData.count === 'number') setQcPendingCount(qcData.count);
        if (trainingData.success && typeof trainingData.count === 'number') setTrainingPendingCount(trainingData.count);
        if (productData.success && typeof productData.count === 'number') setProductPendingCount(productData.count);
        if (privateData?.success && typeof privateData.count === 'number') setPrivateCompanyPendingCount(privateData.count);
        if (conflictsData?.success && typeof conflictsData.count === 'number') setConflictsPendingCount(conflictsData.count);
        if (upgradeData?.success && typeof upgradeData.count === 'number') setUpgradePendingCount(upgradeData.count);
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
          (href === '/admin/visitor-requests' && badgeType === 'pending_visitor' && visitorPendingCount > 0) ||
          (href === '/admin/clean-energy-requests' && badgeType === 'pending_clean_energy' && cleanEnergyPendingCount > 0) ||
          (href === '/admin/enterprise-networking-requests' && badgeType === 'pending_enterprise' && enterprisePendingCount > 0) ||
          (href === '/admin/quality-requests' && badgeType === 'pending_qc' && qcPendingCount > 0) ||
          (href === '/admin/training-requests' && badgeType === 'pending_training' && trainingPendingCount > 0) ||
          (href === '/admin/product-requests' && badgeType === 'pending_product' && productPendingCount > 0) ||
          (href === '/admin/private-companies' && badgeType === 'pending_private_company' && privateCompanyPendingCount > 0) ||
          (href === '/admin/upgrade-requests' && badgeType === 'pending_upgrade_requests' && upgradePendingCount > 0) ||
          (href === '/admin/conflicts' && badgeType === 'pending_conflicts' && conflictsPendingCount > 0);
        const badgeCount =
          href === '/admin/visitor-requests' ? visitorPendingCount :
          href === '/admin/clean-energy-requests' ? cleanEnergyPendingCount :
          href === '/admin/enterprise-networking-requests' ? enterprisePendingCount :
          href === '/admin/quality-requests' ? qcPendingCount :
          href === '/admin/training-requests' ? trainingPendingCount :
          href === '/admin/product-requests' ? productPendingCount :
          href === '/admin/private-companies' ? privateCompanyPendingCount :
          href === '/admin/upgrade-requests' ? upgradePendingCount :
          href === '/admin/conflicts' ? conflictsPendingCount : 0;
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
