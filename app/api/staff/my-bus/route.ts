import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { getDayScholarWhere, getDayScholarBusStudentWhere } from "@/backend/lib/transport/dayScholarHelper";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user || !["ADMIN", "TEACHER", "STAFF", "NON_TEACHING_STAFF"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized access: Staff/Teacher role required" }, { status: 401 });
    }

    let staff = await prisma.staff.findUnique({ where: { userId: session.user.id } });
    if (!staff && session.user.role === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({ where: { userId: session.user.id } });
      if (teacher) {
        staff = await prisma.staff.create({
          data: {
            userId: session.user.id,
            phone: teacher.phone,
            designation: "Teacher & Bus In-charge",
            isActive: true,
          },
        });
      }
    }

    const where: any = { isActive: true };
    if (session.user.role !== "ADMIN") {
      if (!staff) {
        return NextResponse.json({ success: true, buses: [] });
      }
      where.inChargeStaffId = staff.id;
    }

    const buses = await prisma.bus.findMany({
      where,
      include: {
        inChargeStaff: {
          include: { user: { select: { name: true, email: true } } },
        },
        _count: {
          select: {
            students: {
              where: {
                student: getDayScholarWhere(),
              },
            },
          },
        },
        students: {
          where: getDayScholarBusStudentWhere(),
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                rollNumber: true,
                admissionNo: true,
                class: { select: { name: true, section: true } },
                parents: {
                  include: {
                    parent: {
                      select: { phone: true, user: { select: { name: true } } },
                    },
                  },
                },
              },
            },
          },
          orderBy: { student: { firstName: "asc" } },
        },
        statusLogs: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
      orderBy: { busNumber: "asc" },
    });

    return NextResponse.json({ success: true, buses, staffId: staff?.id || null });
  } catch (error: any) {
    console.error("GET /api/staff/my-bus error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}

