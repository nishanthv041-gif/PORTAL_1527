import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { CreateBusSchema } from "@/backend/lib/validations/transport";

export const dynamic = "force-dynamic";

// GET /api/buses: List buses with search, filter, and pagination
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status && status !== "ALL") {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { busNumber: { contains: search, mode: "insensitive" } },
        { registrationNo: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { driverName: { contains: search, mode: "insensitive" } },
        { inChargeStaff: { user: { name: { contains: search, mode: "insensitive" } } } },
      ];
    }

    const [total, buses] = await Promise.all([
      prisma.bus.count({ where }),
      prisma.bus.findMany({
        where,
        skip,
        take: limit,
        orderBy: { busNumber: "asc" },
        include: {
          inChargeStaff: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
          _count: {
            select: { students: true },
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      buses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("GET /api/buses error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}

// POST /api/buses: Create a new bus (ADMIN only)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Administrator role required" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = CreateBusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Validation failed" }, { status: 400 });
    }

    const data = parsed.data;

    // Check unique busNumber
    const existing = await prisma.bus.findUnique({
      where: { busNumber: data.busNumber },
    });
    if (existing) {
      return NextResponse.json({ error: `Bus Number "${data.busNumber}" is already in use` }, { status: 409 });
    }

    // Verify inChargeStaffId is an active staff member if provided
    if (data.inChargeStaffId) {
      const staff = await prisma.staff.findUnique({
        where: { id: data.inChargeStaffId },
      });
      if (!staff || !staff.isActive) {
        return NextResponse.json({ error: "The selected in-charge staff member is not active or does not exist" }, { status: 400 });
      }
    }

    const bus = await prisma.bus.create({
      data: {
        busNumber: data.busNumber,
        registrationNo: data.registrationNo.toUpperCase(),
        name: data.name,
        capacity: data.capacity,
        driverName: data.driverName,
        driverPhone: data.driverPhone,
        routeDescription: data.routeDescription || null,
        status: data.status,
        inChargeStaffId: data.inChargeStaffId || null,
        isActive: data.isActive,
      },
      include: {
        inChargeStaff: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    return NextResponse.json({ success: true, bus }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/buses error:", error);
    return NextResponse.json({ error: error?.message || "Failed to create bus" }, { status: 500 });
  }
}

