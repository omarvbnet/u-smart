'use client';

import type { ProviserMembership } from '@/lib/proviser-permissions';
import type { ProviserUser } from '@/lib/proviser-web';
import { useProviserAuth } from '@/components/proviser/ProviserAuthProvider';
import type { PrivateDepartment } from '@/components/proviser/use-proviser-workspace';
import { Card, CardBody } from '@/components/proviser/proviser-ui';

export type ProviserPageContext = {
  user: ProviserUser;
  membership: ProviserMembership;
  departments: PrivateDepartment[];
  refresh: () => Promise<void>;
};

export function ProviserPageGuard({
  children,
  requireManagement,
  requirePerformance,
  requirePrivateWorkspace,
}: {
  children: (ctx: ProviserPageContext) => React.ReactNode;
  requireManagement?: boolean;
  requirePerformance?: boolean;
  requirePrivateWorkspace?: boolean;
}) {
  const { user, membership, departments, refresh } = useProviserAuth();

  if (!user) return null;

  if (requireManagement && !membership.canManageStaff && !membership.canManageDepartments) {
    return (
      <Card>
        <CardBody>
          <p className="text-slate-400">You do not have permission to manage team settings.</p>
        </CardBody>
      </Card>
    );
  }

  if (requirePerformance && !membership.canViewPerformance) {
    return (
      <Card>
        <CardBody>
          <p className="text-slate-400">Performance reports are only available to owners and managers.</p>
        </CardBody>
      </Card>
    );
  }

  if (
    requirePrivateWorkspace &&
    membership.mode !== 'private'
  ) {
    return (
      <Card>
        <CardBody>
          <p className="text-slate-400">This section requires an approved private company workspace.</p>
        </CardBody>
      </Card>
    );
  }

  return children({ user, membership, departments, refresh });
}
