import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { decodeProfileSkills } from '@/lib/coordinator-access';

export type CoordinatorContext = {
  userId: string;
  companyId: string;
  role: string;
  status: string;
  username: string;
  name: string | null;
  departments: string[];
  privileges: string[];
};

export async function getCoordinatorContext(req: NextRequest): Promise<CoordinatorContext | null> {
  const auth = getRequesterFromRequest(req);
  if (!auth || auth.payload.identitySource !== 'coordinator_user') return null;
  const user = await (prisma as any).coordinatorUser.findUnique({
    where: { id: auth.payload.requesterId },
    select: {
      id: true,
      companyId: true,
      role: true,
      status: true,
      username: true,
      name: true,
      profile: {
        select: { skills: true },
      },
    },
  });
  if (!user || !user.companyId) return null;
  const access = decodeProfileSkills(user.profile?.skills ?? [], user.role ?? 'COORDINATOR');
  return {
    userId: user.id,
    companyId: user.companyId,
    role: user.role ?? 'COORDINATOR',
    status: user.status ?? 'ACTIVE',
    username: user.username,
    name: user.name ?? null,
    departments: access.departments,
    privileges: access.privileges,
  };
}
