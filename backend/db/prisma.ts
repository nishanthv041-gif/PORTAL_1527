import { PrismaClient } from '@prisma/client';
import { env } from '@/backend/config/env';

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop) {
    if (!globalForPrisma.prisma) {
      // The getter inside env.DATABASE_URL will throw if missing
      const url = env.DATABASE_URL;
      
      globalForPrisma.prisma = new PrismaClient({
        log: ['query'],
      });
    }
    const value = (globalForPrisma.prisma as any)[prop];
    return typeof value === 'function' ? value.bind(globalForPrisma.prisma) : value;
  }
});
