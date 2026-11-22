import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getToken } from "next-auth/jwt";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/push/unsubscribe
 * Deactivates or removes a push subscription endpoint.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    const token = !session?.user?.id
      ? await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
      : null;

    const userId = session?.user?.id || (token?.id as string);
    const body = await req.json().catch(() => ({}));
    const { endpoint } = body;

    if (!endpoint || typeof endpoint !== "string") {
      return NextResponse.json(
        { error: "Endpoint string is required" },
        { status: 400 }
      );
    }

    // Deactivate or delete the subscription
    await prisma.pushSubscription.updateMany({
      where: {
        endpoint,
        ...(userId ? { userId } : {}),
      },
      data: {
        isActive: false,
      },
    });

    return NextResponse.json({
      success: true,
      unsubscribedEndpoint: endpoint,
    });
  } catch (error) {
    console.error("POST /api/push/unsubscribe error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
