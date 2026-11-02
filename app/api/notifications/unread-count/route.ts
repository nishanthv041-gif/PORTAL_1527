import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/backend/db/prisma";
import { ServerTimer } from "@/lib/perf/serverTimer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const timer = new ServerTimer("/api/notifications/unread-count", "GET");

  try {
    const token = await timer.measure("auth", () =>
      getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET,
      })
    );

    if (!token?.id || token.isRevoked) {
      timer.logSummary(401);
      return NextResponse.json(
        { unreadCount: 0, hasBusAlert: false },
        {
          status: 401,
          headers: { "Server-Timing": timer.getHeaderValue() },
        }
      );
    }

    const userId = token.id as string;

    const counts = await timer.measure("db-counts", () =>
      prisma.notification.groupBy({
        by: ["category"],
        where: { userId, isRead: false },
        _count: { _all: true },
      })
    );

    let unreadCount = 0;
    let busAlertCount = 0;

    for (const row of counts) {
      const c = row._count._all;
      unreadCount += c;
      if (row.category === "BUS") {
        busAlertCount += c;
      }
    }

    timer.logSummary(200, token.role as string);

    return NextResponse.json(
      {
        success: true,
        unreadCount,
        hasBusAlert: busAlertCount > 0,
        busAlertCount,
      },
      {
        headers: {
          "Server-Timing": timer.getHeaderValue(),
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      }
    );
  } catch (error: any) {
    console.error("GET /api/notifications/unread-count error:", error);
    timer.logSummary(500);
    return NextResponse.json(
      { unreadCount: 0, hasBusAlert: false },
      {
        status: 500,
        headers: { "Server-Timing": timer.getHeaderValue() },
      }
    );
  }
}

