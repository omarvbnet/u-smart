import { prisma } from '@/lib/prisma';
import type { CoordinatorPayload } from './auth';

export async function logAudit(params: {
  companyId: string;
  userId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
  ip?: string;
}): Promise<void> {
  try {
    await prisma.coordinatorAuditLog.create({
      data: {
        companyId: params.companyId,
        userId: params.userId ?? null,
        action: params.action,
        resource: params.resource ?? null,
        resourceId: params.resourceId ?? null,
        payload: params.payload ?? undefined,
        ip: params.ip ?? null,
      },
    });
  } catch (e) {
    console.error('Coordinator audit log error:', e);
  }
}

export function getClientIp(request: Request): string | undefined {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip') ?? undefined;
}
