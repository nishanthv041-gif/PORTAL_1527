import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { AssignStudentsSchema } from "@/backend/lib/validations/transport";

export const dynamic = "force-dynamic";

// POST /api/buses/[id]/students: Assign students (single or bulk)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Administrator role required" }, { status: 403 });
    }

    const { id: busId } = await params;
    const body = await req.json();

    const formattedPayload = Array.isArray(body)
      ? { students: body, academicYear: "2025-2026" }
      : body;

    const parsed = AssignStudentsSchema.safeParse(formattedPayload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Validation failed" }, { status: 400 });
    }

    const { students: assignments, academicYear } = parsed.data;

    // Check bus existence and capacity
    const bus = await prisma.bus.findUnique({
      where: { id: busId },
      include: {
        students: {
          where: { academicYear },
          select: { studentId: true },
        },
      },
    });

    if (!bus) {
      return NextResponse.json({ error: "Bus not found" }, { status: 404 });
    }
    if (!bus.isActive) {
      return NextResponse.json({ error: "Cannot assign students to an inactive bus" }, { status: 400 });
    }

    const currentCount = bus.students.length;
    const currentlyEnrolledIds = new Set(bus.students.map((s) => s.studentId));
    const newStudentsCount = assignments.filter((a) => !currentlyEnrolledIds.has(a.studentId)).length;

    if (currentCount + newStudentsCount > bus.capacity) {
      return NextResponse.json({
        error: `Bus capacity exceeded. Capacity: ${bus.capacity}, current: ${currentCount}, attempting to add: ${newStudentsCount}.`,
      }, { status: 400 });
    }

    // Check if any student belongs to ANOTHER bus in the same academic year
    const studentIds = assignments.map((a) => a.studentId);
    const existingOther = await prisma.busStudent.findMany({
      where: {
        studentId: { in: studentIds },
        academicYear,
        busId: { not: busId },
      },
      include: {
        student: { select: { firstName: true, lastName: true, rollNumber: true } },
        bus: { select: { busNumber: true, name: true } },
      },
    });

    if (existingOther.length > 0) {
      const conflict = existingOther[0];
      return NextResponse.json({
        error: `Student ${conflict.student.firstName} ${conflict.student.lastName} (Roll: ${conflict.student.rollNumber}) is already assigned to ${conflict.bus.busNumber} (${conflict.bus.name}) for ${academicYear}. Duplicate bus assignments are blocked.`,
      }, { status: 409 });
    }

    // Upsert in transaction
    await prisma.$transaction(async (tx) => {
      for (const item of assignments) {
        await tx.busStudent.upsert({
          where: {
            studentId_academicYear: {
              studentId: item.studentId,
              academicYear,
            },
          },
          update: {
            busId,
            pickupPoint: item.pickupPoint || null,
            dropPoint: item.dropPoint || null,
            assignedAt: new Date(),
          },
          create: {
            busId,
            studentId: item.studentId,
            academicYear,
            pickupPoint: item.pickupPoint || null,
            dropPoint: item.dropPoint || null,
          },
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: `Assigned ${assignments.length} student(s) to Bus ${bus.busNumber}`,
      count: assignments.length,
    });
  } catch (error: any) {
    console.error("POST /api/buses/[id]/students error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/buses/[id]/students: Remove a student from this bus
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Administrator role required" }, { status: 403 });
    }

    const { id: busId } = await params;
    const { searchParams } = new URL(req.url);
    const busStudentId = searchParams.get("busStudentId");
    const studentId = searchParams.get("studentId");

    let target: any = null;
    if (busStudentId) {
      target = await prisma.busStudent.findUnique({ where: { id: busStudentId } });
    } else if (studentId) {
      target = await prisma.busStudent.findFirst({ where: { busId, studentId } });
    }

    if (!target) {
      return NextResponse.json({ error: "Student bus assignment record not found" }, { status: 404 });
    }

    // Delete ONLY assignment row, preserving student record
    await prisma.busStudent.delete({
      where: { id: target.id },
    });

    return NextResponse.json({ success: true, message: "Student unassigned from bus successfully" });
  } catch (error: any) {
    console.error("DELETE /api/buses/[id]/students error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}

