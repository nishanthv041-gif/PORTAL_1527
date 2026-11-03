import { NextResponse } from 'next/server';
import { prisma } from '@/backend/db/prisma';
import { createClient } from '@supabase/supabase-js';

// Short 3-second cache for DB health status to prevent connection exhaustion during concurrent health probes
let cachedDbHealth: { status: string; latencyMs: number; expiresAt: number } | null = null;
let cachedSupabaseHealth: { status: string; latencyMs: number; expiresAt: number } | null = null;

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

  const now = Date.now();

  // 1. Neon PostgreSQL connectivity & latency test with 3-second TTL cache
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
      console.error('[HealthCheck] Neon database readiness failure:', err);
      return NextResponse.json({
        status: 'degraded',
        message: 'Primary database (Neon) is unreachable or timed out.',
        database: { status: 'unreachable', error: err instanceof Error ? err.message : 'Unknown DB error' },
        timestamp: new Date().toISOString(),
      }, { status: 503 });
    }
  }

  // 2. Supabase API & Auth connectivity check
  let supabaseStatus = 'not_configured';
  let supabaseLatencyMs = 0;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supaKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (supaUrl && supaKey) {
    if (cachedSupabaseHealth && cachedSupabaseHealth.expiresAt > now) {
      supabaseStatus = cachedSupabaseHealth.status;
      supabaseLatencyMs = cachedSupabaseHealth.latencyMs;
    } else {
      try {
        const supaStart = Date.now();
        const supabase = createClient(supaUrl, supaKey);
        await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase ping timeout')), 3000))
        ]);
        supabaseLatencyMs = Date.now() - supaStart;
        supabaseStatus = 'connected';
        cachedSupabaseHealth = { status: 'connected', latencyMs: supabaseLatencyMs, expiresAt: now + 5000 };
      } catch (err) {
        supabaseStatus = 'degraded';
        cachedSupabaseHealth = null;
      }
    }
  }

  const memory = process.memoryUsage();

  const isPrimaryOk = dbStatus === 'connected';
  const isSecondaryOk = supabaseStatus === 'connected';
  const currentMode = isPrimaryOk ? 'normal' : isSecondaryOk ? 'limited' : 'unavailable';

  return NextResponse.json({
    ok: isPrimaryOk || isSecondaryOk,
    mode: currentMode,
    status: isPrimaryOk ? 'healthy' : isSecondaryOk ? 'limited_mode' : 'degraded',
    message: isPrimaryOk
      ? 'System and primary database operating normally.'
      : 'Primary database offline. Limited read mode active via secondary replica.',
    primary: {
      ok: isPrimaryOk,
      status: dbStatus,
      latencyMs: dbLatencyMs,
    },
    secondary: {
      ok: isSecondaryOk,
      status: supabaseStatus,
      endpoint: supaUrl || null,
      latencyMs: supabaseLatencyMs,
    },
    databases: {
      primaryNeonPostgres: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      secondarySupabase: {
        status: supabaseStatus,
        endpoint: supaUrl || null,
        latencyMs: supabaseLatencyMs,
      },
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
