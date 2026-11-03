import { NextRequest, NextResponse } from "next/server";
import { db, dbSecondary } from "@/lib/db";
import { getCachedServerSession } from "@/backend/auth/sessionCache";

export const dynamic = "force-dynamic";

/**
 * Validates request authorization:
 * Allows Vercel Cron / Render Cron with secret, OR authenticated ADMIN session.
 */
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const cronHeader = req.headers.get("x-cron-secret");

  if (cronSecret && (authHeader === cronSecret || cronHeader === cronSecret)) {
    return true;
  }

  // Fallback: allow logged-in administrators
  try {
    const session = await getCachedServerSession();
    if (session?.user?.role === "ADMIN") {
      return true;
    }
  } catch {
    // Session validation error
  }

  return false;
}

/**
 * GET /api/internal/sync
 * Returns outbox status and pending sync count.
 */
export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [pendingCount, failedCount, syncedCount] = await Promise.all([
      db.syncOutbox.count({ where: { status: "PENDING" } }),
      db.syncOutbox.count({ where: { status: "FAILED" } }),
      db.syncOutbox.count({ where: { status: "SYNCED" } }),
    ]);

    return NextResponse.json({
      status: "healthy",
      primary: "Neon (Singapore)",
      secondary: "Supabase (Ireland)",
      outbox: {
        pending: pendingCount,
        failed: failedCount,
        synced: syncedCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to query outbox queue", details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/internal/sync
 * Processes pending items from SyncOutbox queue and applies them to Supabase in the background.
 */
export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    const pendingItems = await db.syncOutbox.findMany({
      where: {
        status: { in: ["PENDING", "FAILED"] },
        attempts: { lt: 5 }, // Retry limit
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    if (pendingItems.length === 0) {
      return NextResponse.json({
        message: "Outbox queue is empty. Both databases are completely synchronized.",
        processed: 0,
        durationMs: Date.now() - startTime,
      });
    }

    for (const item of pendingItems) {
      processed++;
      try {
        const delegate = (dbSecondary as any)[item.modelName];
        if (!delegate) {
          throw new Error(`Model delegate "${item.modelName}" not found on secondary database.`);
        }

        const payload = item.payload ? (typeof item.payload === "string" ? JSON.parse(item.payload) : item.payload) : null;

        if (item.action === "DELETE") {
          await delegate.deleteMany({
            where: { id: item.recordId },
          });
        } else if (item.action === "CREATE" || item.action === "UPDATE") {
          if (payload) {
            await delegate.upsert({
              where: { id: item.recordId },
              create: payload,
              update: payload,
            });
          }
        }

        // Mark as synced in Neon
        await db.syncOutbox.update({
          where: { id: item.id },
          data: {
            status: "SYNCED",
            syncedAt: new Date(),
            error: null,
          },
        });
        succeeded++;
      } catch (err: any) {
        failed++;
        await db.syncOutbox.update({
          where: { id: item.id },
          data: {
            status: "FAILED",
            attempts: { increment: 1 },
            error: err?.message || String(err),
          },
        });
      }
    }

    return NextResponse.json({
      message: `Processed ${processed} outbox items`,
      succeeded,
      failed,
      durationMs: Date.now() - startTime,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Sync worker failed", details: error?.message },
      { status: 500 }
    );
  }
}
