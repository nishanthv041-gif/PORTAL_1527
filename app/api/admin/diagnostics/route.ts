import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getAuthOptions } from '@/backend/auth/authOptions';
import { prisma } from '@/backend/db/prisma';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authStart = performance.now();
  const session = await getServerSession(getAuthOptions());
  const authLatencyMs = Math.round((performance.now() - authStart) * 100) / 100;

  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
  }

  // 1. Measure live Neon PostgreSQL query performance
  let neonStatus = 'connected';
  let neonPingMs = 0;
  let neonQueryMs = 0;
  let userCount = 0;
  let studentCount = 0;
  let classCount = 0;
  let neonError: string | null = null;

  try {
    const t0 = performance.now();
    await prisma.$queryRaw`SELECT 1 as ping`;
    neonPingMs = Math.round((performance.now() - t0) * 100) / 100;

    const t1 = performance.now();
    const [users, students, classes] = await Promise.all([
      prisma.user.count(),
      prisma.student.count(),
      prisma.class.count(),
    ]);
    neonQueryMs = Math.round((performance.now() - t1) * 100) / 100;
    userCount = users;
    studentCount = students;
    classCount = classes;
  } catch (err: unknown) {
    neonStatus = 'error';
    neonError = err instanceof Error ? err.message : String(err);
  }

  // 2. Measure live Supabase API & Auth latency
  let supabaseStatus = 'not_configured';
  let supabaseLatencyMs = 0;
  let supabaseError: string | null = null;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supaKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (supaUrl && supaKey) {
    try {
      const s0 = performance.now();
      const supabase = createClient(supaUrl, supaKey);
      await Promise.race([
        supabase.auth.getSession(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase request timeout (3000ms)')), 3000)),
      ]);
      supabaseLatencyMs = Math.round((performance.now() - s0) * 100) / 100;
      supabaseStatus = 'connected';
    } catch (err: unknown) {
      supabaseStatus = 'degraded';
      supabaseError = err instanceof Error ? err.message : String(err);
    }
  }

  // 3. System Memory and Node.js telemetry
  const memory = process.memoryUsage();

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    auth: {
      status: 'authenticated',
      role: session.user.role,
      user: session.user.email,
      verificationLatencyMs: authLatencyMs,
    },
    primaryDatabase: {
      provider: 'Neon PostgreSQL (Singapore ap-southeast-1)',
      status: neonStatus,
      pingLatencyMs: neonPingMs,
      aggregatedQueryMs: neonQueryMs,
      totalLatencyMs: Math.round((neonPingMs + neonQueryMs) * 100) / 100,
      records: {
        users: userCount,
        students: studentCount,
        classes: classCount,
      },
      error: neonError,
    },
    secondaryDatabase: {
      provider: 'Supabase (Ireland eu-west-1)',
      endpoint: supaUrl ? supaUrl.replace(/\/+$/, '') : null,
      status: supabaseStatus,
      latencyMs: supabaseLatencyMs,
      error: supabaseError,
    },
    nodeServer: {
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        heapUsedMb: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
        heapTotalMb: Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100,
        rssMb: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
        externalMb: Math.round((memory.external / 1024 / 1024) * 100) / 100,
      },
    },
  }, {
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Server-Timing': `auth;dur=${authLatencyMs}, neon;dur=${neonPingMs + neonQueryMs}, supa;dur=${supabaseLatencyMs}`,
    },
  });
}

