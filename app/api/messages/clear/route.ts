import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { otherUserId } = body;

    if (!otherUserId) {
      return NextResponse.json({ error: "otherUserId is required" }, { status: 400 });
    }

    const currentUserId = session.user.id;
    const now = new Date();

    const meta = await prisma.conversationMeta.upsert({
      where: {
        userId_otherUserId: {
          userId: currentUserId,
          otherUserId,
        }
      },
      update: {
        clearedAt: now,
      },
      create: {
        userId: currentUserId,
        otherUserId,
        clearedAt: now,
      }
    });

    return NextResponse.json({
      success: true,
      clearedAt: meta.clearedAt,
    });
  } catch (error) {
    const e = error as Error;
    console.error("POST /api/messages/clear error:", e);
    return NextResponse.json({ error: e.message || "Failed to clear conversation" }, { status: 500 });
  }
}
