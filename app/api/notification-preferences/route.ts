import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getToken } from "next-auth/jwt";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";

export const dynamic = "force-dynamic";

const DEFAULT_PREFERENCES = {
  enabled: true,
  general: true,
  account: true,
  alerts: true,
  academic: true,
  admin: true,
  maintenance: true,
};

/**
 * GET /api/notification-preferences
 * Returns user notification settings per category.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    const token = !session?.user?.id
      ? await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
      : null;

    const userId = session?.user?.id || (token?.id as string);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let prefs = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = await prisma.notificationPreference.create({
        data: {
          userId,
          ...DEFAULT_PREFERENCES,
        },
      });
    }

    // Also return active registered devices
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        deviceName: true,
        platform: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      preferences: {
        enabled: prefs.enabled,
        general: prefs.general,
        account: prefs.account,
        alerts: prefs.alerts,
        academic: prefs.academic,
        admin: prefs.admin,
        maintenance: prefs.maintenance,
      },
      devices: subscriptions,
    });
  } catch (error) {
    console.error("GET /api/notification-preferences error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/notification-preferences
 * Updates user category notification preferences.
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    const token = !session?.user?.id
      ? await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
      : null;

    const userId = session?.user?.id || (token?.id as string);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const updateData: any = {};
    const allowedKeys = ["enabled", "general", "account", "alerts", "academic", "admin", "maintenance"];
    for (const key of allowedKeys) {
      if (typeof body[key] === "boolean") {
        updateData[key] = body[key];
      }
    }

    const updated = await prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...DEFAULT_PREFERENCES,
        ...updateData,
      },
      update: updateData,
    });

    return NextResponse.json({
      success: true,
      preferences: {
        enabled: updated.enabled,
        general: updated.general,
        account: updated.account,
        alerts: updated.alerts,
        academic: updated.academic,
        admin: updated.admin,
        maintenance: updated.maintenance,
      },
    });
  } catch (error) {
    console.error("PUT /api/notification-preferences error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
