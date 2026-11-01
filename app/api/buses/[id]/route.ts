import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { UpdateBusSchema } from "@/backend/lib/validations/transport";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const bus = await prisma.bus.findUnique({
      where: { id },
      include: {
        inChargeStaff: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        students: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                rollNumber: true,
                admissionNo: true,
                class: { select: { id: true, name: true, section: true } },
                parents: {
                  include: {
                    parent: {
                      select: {
                        phone: true,
                        user: { select: { name: true, email: true } },
                      },
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
          take: 30,
          include: {
            reportedByStaff: {
              include: { user: { select: { name: true } } },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 30,
          include: {
            senderStaff: {
              include: { user: { select: { name: true } } },
            },
            targetStudent: {
              select: { firstName: true, lastName: true, rollNumber: true },
            },
          },
        },
      },
    });

    if (!bus) {
      return NextResponse.json({ error: "Bus not found" }, { status: 404 });
    }

    // Role check: If user is not ADMIN, ensure they are the staff in-charge
    if (session.user.role !== "ADMIN") {
      const staff = await prisma.staff.findUnique({ where: { userId: session.user.id } });
      if (!staff || bus.inChargeStaffId !== staff.id) {
        return NextResponse.json({ error: "Access denied: Not your assigned bus" }, { status: 403 });
      }
    }

    return NextResponse.json({ success: true, bus });
  } catch (error: any) {
    console.error("GET /api/buses/[id] error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Administrator role required" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = UpdateBusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Validation failed" }, { status: 400 });
    }

    const data = parsed.data;

    const existingBus = await prisma.bus.findUnique({
      where: { id },
      include: { _count: { select: { students: true } } },
    });
    if (!existingBus) {
      return NextResponse.json({ error: "Bus not found" }, { status: 404 });
    }

    if (data.busNumber && data.busNumber !== existingBus.busNumber) {
      const conflict = await prisma.bus.findUnique({ where: { busNumber: data.busNumber } });
      if (conflict) {
        return NextResponse.json({ error: `Bus Number "${data.busNumber}" is already in use` }, { status: 409 });
      }
    }

    if (data.capacity !== undefined && data.capacity < existingBus._count.students) {
      return NextResponse.json({
        error: `Cannot reduce capacity to ${data.capacity}. Enrolled students: ${existingBus._count.students}.`,
      }, { status: 400 });
    }

    const updated = await prisma.bus.update({
      where: { id },
      data: {
        ...(data.busNumber ? { busNumber: data.busNumber } : {}),
        ...(data.registrationNo ? { registrationNo: data.registrationNo.toUpperCase() } : {}),
        ...(data.name ? { name: data.name } : {}),
        ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
        ...(data.driverName ? { driverName: data.driverName } : {}),
        ...(data.driverPhone ? { driverPhone: data.driverPhone } : {}),
        ...(data.routeDescription !== undefined ? { routeDescription: data.routeDescription } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.inChargeStaffId !== undefined ? { inChargeStaffId: data.inChargeStaffId } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    return NextResponse.json({ success: true, bus: updated });
  } catch (error: any) {
    console.error("PATCH /api/buses/[id] error:", error);
    return NextResponse.json({ error: error?.message || "Failed to update bus" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Administrator role required" }, { status: 403 });
    }

    const { id } = await params;
    const bus = await prisma.bus.findUnique({
      where: { id },
      include: { _count: { select: { students: true } } },
    });
    if (!bus) {
      return NextResponse.json({ error: "Bus not found" }, { status: 404 });
    }

    // Safely delete bus (cascade unassigns students without deleting student records)
    await prisma.bus.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: `Bus ${bus.busNumber} deleted safely. ${bus._count.students} students unassigned.`,
    });
  } catch (error: any) {
    console.error("DELETE /api/buses/[id] error:", error);
    return NextResponse.json({ error: error?.message || "Failed to delete bus" }, { status: 500 });
  }
}
