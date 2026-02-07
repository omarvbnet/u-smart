// lib/prisma.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrisma(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error']
  })
}

// Invalidate stale cache when schema was updated (e.g. after adding new models)
let prismaInstance = globalForPrisma.prisma
if (prismaInstance && (!('visitorRequest' in prismaInstance) || !('ticketRequester' in prismaInstance) || !('site' in prismaInstance) || !('companyRequest' in prismaInstance) || !('company' in prismaInstance) || !('inspectionChecklist' in prismaInstance))) {
  try {
    (prismaInstance as any).$disconnect?.().catch(() => {})
  } catch {
    /* ignore */
  }
  globalForPrisma.prisma = undefined
  prismaInstance = undefined
}

prismaInstance = prismaInstance ?? createPrisma()
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prismaInstance
}

export const prisma = prismaInstance