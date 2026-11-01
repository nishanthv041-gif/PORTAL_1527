import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user || session.user.role !== "PARENT") {
      return NextResponse.json({ error: "Unauthorized access: Parent portal only" }, { status: 401 });
    }

    const parent = await prisma.parent.findUnique({
      where: { userId: session.user.id },
      include: {
        children: {
          include: {
            student: {
              include: {
                class: true,
                busAssignments: {
                  include: {
                    bus: {
                      include: {
                        inChargeStaff: {
                          include: { user: { select: { name: true, email: true } } },
                        },
                        statusLogs: {
                          orderBy: { createdAt: "desc" },
                          take: 5,
                        },
                        messages: {
                          orderBy: { createdAt: "desc" },
                          take: 10,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!parent) {
      return NextResponse.json({ error: "Parent record not found" }, { status: 404 });
    }

    const childrenTransport = parent.children.map((rel) => {
      const student = rel.student;
      const assignment = student.busAssignments[0] || null;

      return {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        rollNumber: student.rollNumber,
        admissionNo: student.admissionNo,
        className: student.class ? `${student.class.name} - ${student.class.section}` : "N/A",
        hasBus: !!assignment,
        busDetails: assignment
          ? {
              assignmentId: assignment.id,
              busId: assignment.bus.id,
              busNumber: assignment.bus.busNumber,
              registrationNo: assignment.bus.registrationNo,
              name: assignment.bus.name,
              routeDescription: assignment.bus.routeDescription,
              status: assignment.bus.status,
              driverName: assignment.bus.driverName,
              driverPhone: assignment.bus.driverPhone,
              inChargeStaffName: assignment.bus.inChargeStaff?.user?.name || "Transport Desk",
              inChargeStaffPhone: assignment.bus.inChargeStaff?.phone || "Office Extension",
              pickupPoint: assignment.pickupPoint,
              dropPoint: assignment.dropPoint,
              academicYear: assignment.academicYear,
              recentStatusLogs: assignment.bus.statusLogs,
              recentMessages: assignment.bus.messages,
            }
          : null,
      };
    });

    return NextResponse.json({ success: true, children: childrenTransport });
  } catch (error: any) {
    console.error("GET /api/parent/bus error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
