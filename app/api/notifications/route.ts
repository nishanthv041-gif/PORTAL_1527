import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getToken } from "next-auth/jwt";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications
 * Paginated notification retrieval with filters for unreadOnly and type/category.
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

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const typeFilter = searchParams.get("type");
    const categoryFilter = searchParams.get("category");

    const where: any = {
      userId,
      ...(unreadOnly ? { isRead: false } : {}),
      ...(typeFilter ? { type: typeFilter.toUpperCase() } : {}),
      ...(categoryFilter ? { category: categoryFilter.toUpperCase() } : {}),
    };

    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      items,
      total,
      unreadCount,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    });
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
