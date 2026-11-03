import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json(
        { error: "Endpoint is required to unsubscribe." },
        { status: 400 }
      );
    }

    // Only allow user to remove their own subscription
    await prisma.pushSubscription.deleteMany({
      where: {
        endpoint,
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Push subscription removed successfully.",
    });
  } catch (error: unknown) {
    console.error("[Push API] Unsubscribe error:", error);
    return NextResponse.json(
      { error: "Internal server error while unsubscribing." },
      { status: 500 }
    );
  }
}

