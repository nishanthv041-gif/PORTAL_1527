import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL environment variable. Please define it in production.");
}

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['query'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
