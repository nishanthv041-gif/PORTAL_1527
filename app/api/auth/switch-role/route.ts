import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const targetRole = (body.targetRole || "").trim().toUpperCase();

    if (!targetRole) {
      return NextResponse.json({ error: "Target role is required" }, { status: 400 });
    }

    // Fetch user and all role relationships to verify permissions
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        teacher: { select: { id: true, isActive: true } },
        parent: { select: { id: true, isActive: true } },
        staff: { select: { id: true, isActive: true } },
      },
    });

    if (!dbUser || dbUser.status === "INACTIVE") {
      return NextResponse.json(
        { error: "Account is inactive or could not be found." },
        { status: 403 }
      );
    }

    // Determine all authorized roles for this user
    const authorizedRoles: string[] = [dbUser.role];
    if (dbUser.teacher?.isActive && !authorizedRoles.includes("TEACHER")) {
      authorizedRoles.push("TEACHER");
    }
    if (dbUser.parent?.isActive && !authorizedRoles.includes("PARENT")) {
      authorizedRoles.push("PARENT");
    }
    if (dbUser.staff?.isActive && !authorizedRoles.includes("STAFF")) {
      authorizedRoles.push("STAFF");
    }
    if (dbUser.role === "ADMIN" && !authorizedRoles.includes("ADMIN")) {
      authorizedRoles.push("ADMIN");
    }

    const isAuthorized =
      authorizedRoles.includes(targetRole) ||
      (dbUser.role === "ADMIN") ||
      ((targetRole === "STAFF" || targetRole === "NON_TEACHING_STAFF") &&
        authorizedRoles.some((r) => r === "STAFF" || r === "NON_TEACHING_STAFF"));

    if (!isAuthorized) {
      return NextResponse.json(
        { error: `You do not have access to switch to the ${targetRole.toLowerCase()} portal.` },
        { status: 403 }
      );
    }

    // Update active role in database
    await prisma.user.update({
      where: { id: session.user.id },
      data: { role: targetRole },
    });

    // Touch active UserSession record to refresh activity
    try {
      await prisma.userSession.updateMany({
        where: { userId: session.user.id, revokedAt: null },
        data: { lastActiveAt: new Date() },
      });
    } catch (sessionErr) {
      console.warn("[SwitchRole] Failed to touch userSession activity:", sessionErr);
    }

    // Determine target dashboard URL
    let redirectUrl = "/dashboard";
    if (targetRole === "ADMIN") {
      redirectUrl = "/dashboard/admin";
    } else if (targetRole === "TEACHER") {
      redirectUrl = "/dashboard/teacher";
    } else if (targetRole === "PARENT") {
      redirectUrl = "/dashboard/parent";
    } else if (targetRole === "STAFF" || targetRole === "NON_TEACHING_STAFF") {
      redirectUrl = "/staff/my-bus";
    }

    return NextResponse.json({
      success: true,
      activeRole: targetRole,
      availableRoles: authorizedRoles,
      redirectUrl,
    });
  } catch (error) {
    console.error("[SwitchRole] Error during role switch:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while switching portals." },
      { status: 500 }
    );
  }
}
