import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { SendBusMessageSchema } from "@/backend/lib/validations/transport";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";

export const dynamic = "force-dynamic";

// GET /api/buses/[id]/messages: List messages for this bus
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: busId } = await params;
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "15", 10)));
    const skip = (page - 1) * limit;

    const [total, messages] = await Promise.all([
      prisma.busMessage.count({ where: { busId } }),
      prisma.busMessage.findMany({
        where: { busId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          senderStaff: {
            include: { user: { select: { name: true, role: true } } },
          },
          targetStudent: {
            select: { firstName: true, lastName: true, rollNumber: true },
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      messages,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    console.error("GET /api/buses/[id]/messages error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}

// POST /api/buses/[id]/messages: Send common or individual message
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user || !["ADMIN", "TEACHER", "STAFF", "NON_TEACHING_STAFF"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    const { id: busId } = await params;
    const body = await req.json();

    const parsed = SendBusMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Validation failed" }, { status: 400 });
    }

    const { type, title, message, priority, targetStudentId } = parsed.data;

    const bus = await prisma.bus.findUnique({
      where: { id: busId },
      include: { inChargeStaff: { include: { user: true } } },
    });
    if (!bus) {
      return NextResponse.json({ error: "Bus not found" }, { status: 404 });
    }

    // Role check: If not ADMIN, user must be the in-charge staff
    let staffRecord = await prisma.staff.findUnique({ where: { userId: session.user.id } });
    if (session.user.role !== "ADMIN") {
      if (!staffRecord || bus.inChargeStaffId !== staffRecord.id) {
        return NextResponse.json({ error: "Forbidden: You can only broadcast messages for your assigned bus" }, { status: 403 });
      }
    }

    const senderStaffId = staffRecord?.id || bus.inChargeStaffId || null;

    // Collect recipient parent user IDs
    let parentUserIds: string[] = [];

    if (type === "COMMON") {
      const busStudents = await prisma.busStudent.findMany({
        where: { busId },
        select: {
          student: {
            select: {
              parents: { select: { parent: { select: { userId: true } } } },
            },
          },
        },
      });

      for (const bs of busStudents) {
        for (const p of bs.student.parents) {
          if (p.parent?.userId && !parentUserIds.includes(p.parent.userId)) {
            parentUserIds.push(p.parent.userId);
          }
        }
      }
    } else if (type === "INDIVIDUAL") {
      if (!targetStudentId) {
        return NextResponse.json({ error: "Target student required for individual message" }, { status: 400 });
      }

      // Verify that this student is assigned to THIS bus
      const isEnrolled = await prisma.busStudent.findFirst({
        where: { busId, studentId: targetStudentId },
      });
      if (!isEnrolled) {
        return NextResponse.json({ error: "Selected student is not enrolled on this bus" }, { status: 400 });
      }

      const parents = await prisma.parentStudent.findMany({
        where: { studentId: targetStudentId },
        select: { parent: { select: { userId: true } } },
      });

      for (const p of parents) {
        if (p.parent?.userId && !parentUserIds.includes(p.parent.userId)) {
          parentUserIds.push(p.parent.userId);
        }
      }
    }

    // CREATE BUS MESSAGE + NOTIFICATION ROWS IN ONE PRISMA TRANSACTION
    const result = await prisma.$transaction(async (tx) => {
      const createdMsg = await tx.busMessage.create({
        data: {
          busId,
          senderStaffId,
          type,
          title: title.trim(),
          message: message.trim(),
          priority,
          targetStudentId: type === "INDIVIDUAL" ? targetStudentId : null,
        },
      });

      if (parentUserIds.length > 0) {
        const notifIcon = priority === "URGENT" ? "🚨 " : "🚌 ";
        const formattedTitle = `${notifIcon}Bus ${bus.busNumber}: ${title.trim()}`;

        await tx.notification.createMany({
          data: parentUserIds.map((userId) => ({
            userId,
            title: formattedTitle,
            content: message.trim(),
            type: "BUS",
            category: "BUS",
            priority,
            link: "/parent/bus",
            isRead: false,
          })),
        });
      }

      return createdMsg;
    });

    for (const uid of parentUserIds) {
      invalidateUserNotifCache(uid);
    }

    return NextResponse.json({
      success: true,
      busMessage: result,
      recipientCount: parentUserIds.length,
      message: `Message sent to ${parentUserIds.length} parent accounts`,
    }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/buses/[id]/messages error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}

