import type { ProviserMembership } from '@/lib/proviser-permissions';
import { canViewSitesMap } from '@/lib/proviser-permissions';
import { isEngineerRole } from '@/lib/proviser-web';

export type ProviserNavItem = {
  href: string;
  label: string;
  icon: string;
  match?: (pathname: string) => boolean;
};

export function proviserTicketsHome(role: string): string {
  return isEngineerRole(role) ? '/proviser/engineer' : '/proviser/company';
}

export function buildProviserNav(
  role: string,
  membership: ProviserMembership
): ProviserNavItem[] {
  const tickets = proviserTicketsHome(role);
  const m = membership;
  const items: ProviserNavItem[] = [
    { href: tickets, label: 'Tickets', icon: 'tickets' },
    { href: '/proviser/sites', label: 'Sites', icon: 'sites' },
  ];

  if (canViewSitesMap(role, m.mode)) {
    items.push({ href: '/proviser/sites/map', label: 'Map', icon: 'map' });
  }

  if (m.canManageStaff || m.canManageDepartments) {
    items.push({ href: '/proviser/staff', label: 'Staff', icon: 'staff' });
  }

  if (m.mode === 'private' && (m.canManageDepartments || m.departmentId)) {
    items.push({ href: '/proviser/departments', label: 'Departments', icon: 'departments' });
  }

  if (m.mode === 'private' && (m.isOwner || m.canManageStaff)) {
    items.push({ href: '/proviser/warehouse', label: 'Materials', icon: 'warehouse' });
  }

  if (m.canViewPerformance) {
    items.push({ href: '/proviser/performance', label: 'Performance', icon: 'performance' });
  }

  if (m.mode === 'private' && (m.isOwner || m.canManageStaff)) {
    items.push(
      { href: '/proviser/cancellations', label: 'Cancellations', icon: 'cancellations' },
      { href: '/proviser/maintenance', label: 'Maintenance', icon: 'maintenance' }
    );
  }

  items.push(
    { href: '/proviser/notifications', label: 'Alerts', icon: 'alerts' },
    { href: '/proviser/profile', label: 'Profile', icon: 'profile' }
  );

  return items;
}

export function isProviserPublicPath(pathname: string): boolean {
  return (
    pathname === '/proviser/login' ||
    pathname === '/proviser/register' ||
    pathname === '/proviser'
  );
}

export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/proviser/company' || href === '/proviser/engineer') {
    return pathname === href || pathname.startsWith('/proviser/tickets/');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
