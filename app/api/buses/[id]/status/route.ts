import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { UpdateBusStatusSchema } from "@/backend/lib/validations/transport";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: busId } = await params;
    const body = await req.json();

    const parsed = UpdateBusStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Validation failed" }, { status: 400 });
    }

    const { status, issueType, description } = parsed.data;

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
        return NextResponse.json({ error: "Forbidden: You are not the assigned in-charge for this bus" }, { status: 403 });
      }
    }

    const reporterStaffId = staffRecord?.id || bus.inChargeStaffId || null;

    // Update bus status
    const updatedBus = await prisma.bus.update({
      where: { id: busId },
      data: { status },
    });

    // Create status log
    const log = await prisma.busStatusLog.create({
      data: {
        busId,
        status,
        issueType: issueType || null,
        description,
        reportedByStaffId: reporterStaffId,
      },
    });

    // AUTOMATIC URGENT PARENT NOTIFICATION IF STATUS != 'RUNNING'
    let notifiedParentCount = 0;
    if (status !== "RUNNING") {
      const busStudents = await prisma.busStudent.findMany({
        where: { busId },
        select: {
          student: {
            select: {
              parents: {
                select: {
                  parent: {
                    select: {
                      userId: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const parentUserIds: string[] = [];
      for (const bs of busStudents) {
        for (const p of bs.student.parents) {
          if (p.parent?.userId && !parentUserIds.includes(p.parent.userId)) {
            parentUserIds.push(p.parent.userId);
          }
        }
      }

      if (parentUserIds.length > 0) {
        const statusPrefix =
          status === "DELAYED"
            ? "⏱️ Transit Delay"
            : status === "NOT_RUNNING"
            ? "⚠️ Bus Service Interrupted"
            : "🔧 Maintenance Update";

        const notifTitle = `${statusPrefix}: Bus ${bus.busNumber}`;
        const notifContent = `Bus ${bus.busNumber} (${bus.name}): ${description}`;

        await prisma.notification.createMany({
          data: parentUserIds.map((userId) => ({
            userId,
            title: notifTitle,
            content: notifContent,
            type: "BUS",
            category: "BUS",
            priority: "URGENT",
            link: "/parent/bus",
            isRead: false,
          })),
        });

        for (const uid of parentUserIds) {
          invalidateUserNotifCache(uid);
        }

        notifiedParentCount = parentUserIds.length;
      }
    }

    return NextResponse.json({
      success: true,
      bus: updatedBus,
      log,
      notifiedParentCount,
      message: `Status updated to ${status}.${notifiedParentCount > 0 ? ` Urgent notification dispatched to ${notifiedParentCount} parents.` : ""}`,
    });
  } catch (error: any) {
    console.error("PATCH /api/buses/[id]/status error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
