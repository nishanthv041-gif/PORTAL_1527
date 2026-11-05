import { PrismaClient } from "@prisma/client";

const globalForDb = globalThis as unknown as {
  primaryPrisma?: PrismaClient;
  secondaryPrisma?: PrismaClient;
};

/**
 * Lazily creates or returns the singleton Primary Prisma Client (Neon Singapore).
 * Never called at module evaluation time.
 */
export function getPrimaryClient(): PrismaClient {
  if (globalForDb.primaryPrisma) {
    return globalForDb.primaryPrisma;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not configured. Please define DATABASE_URL in your environment variables."
    );
  }

  const client = new PrismaClient({
    datasources: {
      db: { url },
    },
    log:
      process.env.NODE_ENV === "development" && process.env.DEBUG_QUERIES === "true"
        ? ["query", "error", "warn"]
        : ["error", "warn"],
  });

  globalForDb.primaryPrisma = client;
  return client;
}

/**
 * Lazily creates or returns the singleton Secondary Prisma Client (Supabase Ireland).
 * Never called at module evaluation time.
 */
export function getSecondaryClient(): PrismaClient | null {
  if (globalForDb.secondaryPrisma) {
    return globalForDb.secondaryPrisma;
  }

  const supaUrl =
    process.env.SECONDARY_DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.SUPABASE_DIRECT_URL;

  if (!supaUrl) {
    return null;
  }

  const client = new PrismaClient({
    datasources: {
      db: { url: supaUrl },
    },
    log: ["error", "warn"],
  });

  globalForDb.secondaryPrisma = client;
  return client;
}

export function isSecondaryDbConfigured(): boolean {
  return Boolean(
    process.env.SECONDARY_DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.SUPABASE_DIRECT_URL
  );
}

/**
 * Lazy Primary DB proxy singleton.
 * Importing this never throws and never connects to the database.
 * Initialization happens strictly on first query at runtime.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    // Avoid intercepting promise resolution or React symbol checks
    if (prop === "then" || prop === "$$typeof" || prop === Symbol.toStringTag) {
      return undefined;
    }
    const client = getPrimaryClient();
    const value = Reflect.get(client, prop, client);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

/**
 * Lazy Secondary DB proxy singleton.
 * Throws only when a query is executed if SECONDARY_DATABASE_URL is missing.
 */
export const dbSecondary: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (prop === "then" || prop === "$$typeof" || prop === Symbol.toStringTag) {
      return undefined;
    }
    const client = getSecondaryClient();
    if (!client) {
      throw new Error(
        "SECONDARY_DATABASE_URL is not configured. Please define SECONDARY_DATABASE_URL in your environment variables."
      );
    }
    const value = Reflect.get(client, prop, client);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

// Re-export standard prisma reference for backward compatibility
export const prisma = db;
export default db;
