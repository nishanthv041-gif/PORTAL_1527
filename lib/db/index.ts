import { PrismaClient } from '@prisma/client';

const globalForDb = globalThis as unknown as {
  primaryPrisma?: PrismaClient;
  secondaryPrisma?: PrismaClient;
};

// 1. Primary Database (Neon PostgreSQL in Singapore)
// Uses pooled connection URL (with ?pgbouncer=true&connection_limit=5)
function createPrimaryClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  return new PrismaClient({
    datasources: {
      db: { url },
    },
    log: process.env.NODE_ENV === 'development' && process.env.DEBUG_QUERIES === 'true'
      ? ['query', 'error', 'warn']
      : ['error', 'warn'],
  });
}

// 2. Secondary Database (Supabase PostgreSQL in Ireland)
// Uses transaction pooler (port 6543) for serverless operations
function createSecondaryClient(): PrismaClient | null {
  const supaUrl =
    process.env.SECONDARY_DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.SUPABASE_DIRECT_URL;

  if (!supaUrl) return null;

  return new PrismaClient({
    datasources: {
      db: { url: supaUrl },
    },
    log: ['error', 'warn'],
  });
}

export const db: PrismaClient = globalForDb.primaryPrisma ?? createPrimaryClient();
globalForDb.primaryPrisma = db;

export const dbSecondary: PrismaClient | null =
  globalForDb.secondaryPrisma ?? createSecondaryClient();
if (dbSecondary) {
  globalForDb.secondaryPrisma = dbSecondary;
}

// Re-export standard prisma reference for seamless backward compatibility
export const prisma = db;

export * from "./outbox";
