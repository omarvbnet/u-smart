/**
 * Central validation for unique email and phone across all user-facing entities.
 * Used during registration and profile updates.
 */
import { PrismaClient } from '@prisma/client';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

import { normalizePhoneDigits, phonesMatch } from '@/lib/phone-match';

export type ExcludeIds = {
  requesterId?: string;
  userId?: string;
  registrationRequestId?: string;
  companyRequestId?: string;
  employeeId?: string;
};

/**
 * Check if email is already used by any user/requester/request.
 * Returns { taken: true, message } if taken, { taken: false } otherwise.
 */
export async function checkEmailUnique(
  prisma: PrismaClient,
  email: string,
  exclude?: ExcludeIds
): Promise<{ taken: boolean; message?: string }> {
  const norm = normalizeEmail(email);
  if (!norm) return { taken: false };

  // User (admin)
  const userDelegate = (prisma as { user?: { findFirst: (args: unknown) => Promise<unknown> } }).user;
  if (userDelegate?.findFirst) {
    const u = await userDelegate.findFirst({
      where: {
        email: { equals: norm, mode: 'insensitive' },
        ...(exclude?.userId && { id: { not: exclude.userId } }),
      },
    }) as { id?: string } | null;
    if (u) return { taken: true, message: 'Email is already in use by an admin account' };
  }

  // TicketRequester
  const r = await prisma.ticketRequester.findFirst({
    where: {
      email: { equals: norm, mode: 'insensitive' },
      ...(exclude?.requesterId && { id: { not: exclude.requesterId } }),
    },
  });
  if (r) return { taken: true, message: 'Email is already registered' };

  // CoordinatorUser (new provider identity)
  const coordinatorDelegate = (prisma as { coordinatorUser?: { findFirst: (args: unknown) => Promise<unknown> } }).coordinatorUser;
  if (coordinatorDelegate?.findFirst) {
    try {
      const cu = await coordinatorDelegate.findFirst({
        where: {
          email: { equals: norm, mode: 'insensitive' },
        },
        select: { id: true },
      }) as { id?: string } | null;
      if (cu) return { taken: true, message: 'Email is already registered as a coordinator user' };
    } catch (err) {
      // Backward compatibility for older DB schemas where coordinator_users
      // may not have all columns expected by the current Prisma model.
      const code = (err as { code?: string })?.code;
      if (code !== 'P2022') throw err;
    }
  }

  // RegistrationRequest (pending)
  const rrDelegate = (prisma as { registrationRequest?: { findFirst: (args: unknown) => Promise<unknown> } }).registrationRequest;
  if (rrDelegate?.findFirst) {
    const rr = await rrDelegate.findFirst({
      where: {
        email: { equals: norm, mode: 'insensitive' },
        status: 'PENDING',
        ...(exclude?.registrationRequestId && { id: { not: exclude.registrationRequestId } }),
      },
    }) as { id?: string } | null;
    if (rr) return { taken: true, message: 'Email is already used in a pending registration' };
  }

  // CompanyRequest (pending)
  const crDelegate = (prisma as { companyRequest?: { findFirst: (args: unknown) => Promise<unknown> } }).companyRequest;
  if (crDelegate?.findFirst) {
    const cr = await crDelegate.findFirst({
      where: {
        pocEmail: { equals: norm, mode: 'insensitive' },
        status: 'PENDING',
        ...(exclude?.companyRequestId && { id: { not: exclude.companyRequestId } }),
      },
    }) as { id?: string } | null;
    if (cr) return { taken: true, message: 'Email is already used in a pending company request' };
  }

  return { taken: false };
}

/**
 * Check if phone is already used by any requester/employee/request.
 * Uses digits-only comparison to catch 0771 123 4567 vs +9647711234567.
 */
export async function checkPhoneUnique(
  prisma: PrismaClient,
  phone: string,
  exclude?: ExcludeIds
): Promise<{ taken: boolean; message?: string }> {
  const norm = normalizePhoneDigits(phone);
  if (!norm || norm.length < 6) return { taken: false };

  // TicketRequester
  const reqs = await prisma.ticketRequester.findMany({
    where: exclude?.requesterId ? { id: { not: exclude.requesterId } } : undefined,
    select: { id: true, phone: true },
  });
  for (const r of reqs) {
    const p = normalizePhoneDigits((r as { phone: string }).phone);
    if (phonesMatch(norm, p)) return { taken: true, message: 'Phone number is already registered' };
  }

  // Employee
  const empDelegate = (prisma as { employee?: { findMany: (args: unknown) => Promise<unknown[]> } }).employee;
  if (empDelegate?.findMany) {
    const employees = await empDelegate.findMany({
      where: exclude?.employeeId ? { id: { not: exclude.employeeId } } : {},
      select: { id: true, phone: true },
    }) as { phone: string }[];
    for (const e of employees) {
      const p = normalizePhoneDigits(e.phone);
      if (phonesMatch(norm, p)) return { taken: true, message: 'Phone number is already in use' };
    }
  }

  // RegistrationRequest (pending)
  const rrDelegate2 = prisma as { registrationRequest?: { findMany: (args: unknown) => Promise<{ phone: string; id: string }[]> } };
  if (rrDelegate2.registrationRequest) {
    const rrs = await rrDelegate2.registrationRequest.findMany({
      where: { status: 'PENDING', ...(exclude?.registrationRequestId && { id: { not: exclude.registrationRequestId } }) },
      select: { id: true, phone: true },
    });
    for (const rr of rrs) {
      const p = normalizePhoneDigits(rr.phone);
      if (phonesMatch(norm, p)) return { taken: true, message: 'Phone number is already used in a pending registration' };
    }
  }

  // CompanyRequest (pending)
  const crDelegate2 = prisma as { companyRequest?: { findMany: (args: unknown) => Promise<{ pocPhone: string; id: string }[]> } };
  if (crDelegate2.companyRequest) {
    const crs = await crDelegate2.companyRequest.findMany({
      where: { status: 'PENDING', ...(exclude?.companyRequestId && { id: { not: exclude.companyRequestId } }) },
      select: { id: true, pocPhone: true },
    });
    for (const cr of crs) {
      const p = normalizePhoneDigits(cr.pocPhone);
      if (phonesMatch(norm, p)) return { taken: true, message: 'Phone number is already used in a pending company request' };
    }
  }

  return { taken: false };
}
