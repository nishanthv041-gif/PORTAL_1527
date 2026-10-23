import { NextResponse } from 'next/server';
import { prisma } from '@/backend/db/prisma';

// Short 3-second cache for DB health status to prevent connection exhaustion during concurrent health probes
let cachedDbHealth: { status: string; latencyMs: number; expiresAt: number } | null = null;

export async function GET() {
  const missingEnv: string[] = [];

  // Core essential production variables
  if (!process.env.DATABASE_URL) missingEnv.push('DATABASE_URL');
  if (!process.env.NEXTAUTH_SECRET) missingEnv.push('NEXTAUTH_SECRET');

  if (missingEnv.length > 0) {
    return NextResponse.json({
      status: 'error',
      message: 'Missing essential production environment variables.',
      missing: missingEnv,
    }, { status: 500 });
  }

  // Database connectivity & latency test with 3-second TTL cache
  const now = Date.now();
  let dbStatus = 'connected';
  let dbLatencyMs = 0;

  if (cachedDbHealth && cachedDbHealth.expiresAt > now) {
    dbStatus = cachedDbHealth.status;
    dbLatencyMs = cachedDbHealth.latencyMs;
  } else {
    try {
      const start = Date.now();
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Database ping timeout')), 3000))
      ]);
      dbLatencyMs = Date.now() - start;
      cachedDbHealth = { status: 'connected', latencyMs: dbLatencyMs, expiresAt: now + 3000 };
    } catch (err: unknown) {
      dbStatus = 'degraded';
      cachedDbHealth = null;
      console.error('[HealthCheck] Database readiness failure:', err);
      return NextResponse.json({
        status: 'degraded',
        message: 'Database is unreachable or timed out.',
        database: { status: 'unreachable', error: err instanceof Error ? err.message : 'Unknown DB error' },
        timestamp: new Date().toISOString(),
      }, { status: 503 });
    }
  }

  const memory = process.memoryUsage();

  return NextResponse.json({
    status: 'healthy',
    message: 'System is fully operational and ready for production traffic.',
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
    },
    system: {
      uptimeSeconds: Math.floor(process.uptime()),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
      rssMb: Math.round(memory.rss / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
  }, {
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
