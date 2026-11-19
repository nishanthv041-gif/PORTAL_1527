import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { processNotificationOutbox } from "@/lib/dispatcher";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/outbox/process
 * 
 * Background / Cron worker endpoint that drains pending or failed notifications from the
 * transactional outbox queue with exponential backoff.
 * 
 * Accessible by:
 * 1. Admin users with active session.
 * 2. Background scheduler / Cron with Bearer CRON_SECRET.
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthed = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!isCronAuthed) {
      const session = await getServerSession(getAuthOptions());
      if (!session || !session.user || session.user.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const result = await processNotificationOutbox();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    console.error("[Outbox Process API] Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Outbox processing failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}
