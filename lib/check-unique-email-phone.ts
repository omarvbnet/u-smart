/**
 * Central validation for unique email and phone across all user-facing entities.
 * Used during registration and profile updates.
 */
import { PrismaClient } from '@prisma/client';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Normalize phone to digits only for comparison (handles +964 77 123 4567, 0771 123 4567, etc.) */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

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
    const cu = await coordinatorDelegate.findFirst({
      where: {
        email: { equals: norm, mode: 'insensitive' },
      },
    }) as { id?: string } | null;
    if (cu) return { taken: true, message: 'Email is already registered as a coordinator user' };
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
  const norm = normalizePhone(phone);
  if (!norm || norm.length < 6) return { taken: false };

  /** Same if digits match, or Iraqi format: 0771... vs 964771... */
  const phonesMatch = (a: string, b: string): boolean => {
    if (!a || !b) return false;
    if (a === b) return true;
    const withZero = a.startsWith('964') ? '0' + a.slice(3) : a;
    const with964 = a.startsWith('0') ? '964' + a.slice(1) : a;
    return b === withZero || b === with964;
  };

  // TicketRequester
  const reqs = await prisma.ticketRequester.findMany({
    where: exclude?.requesterId ? { id: { not: exclude.requesterId } } : undefined,
    select: { id: true, phone: true },
  });
  for (const r of reqs) {
    const p = normalizePhone((r as { phone: string }).phone);
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
      const p = normalizePhone(e.phone);
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
      const p = normalizePhone(rr.phone);
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
      const p = normalizePhone(cr.pocPhone);
      if (phonesMatch(norm, p)) return { taken: true, message: 'Phone number is already used in a pending company request' };
    }
  }

  return { taken: false };
}
