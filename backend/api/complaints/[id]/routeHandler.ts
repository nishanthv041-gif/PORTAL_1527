import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role === "PARENT") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { title, description, category, severity } = body;

    const complaint = await prisma.complaint.findUnique({
      where: { id },
    });

    if (!complaint) {
      return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    }

    if (session.user.role === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: session.user.id }
      });
      
      if (!teacher || complaint.teacherId !== teacher.id) {
        return NextResponse.json(
          { error: "Forbidden: You can only edit complaints you raised" },
          { status: 403 }
        );
      }

      if (complaint.status !== "OPEN") {
        return NextResponse.json(
          { error: "Forbidden: You cannot edit a complaint that is already under review or resolved" },
          { status: 403 }
        );
      }
    }

    const updatedComplaint = await prisma.complaint.update({
      where: { id },
      data: {
        title,
        description,
        category,
        severity,
      },
    });

    return NextResponse.json(updatedComplaint);
  } catch (error) {
    const e = error as Error;
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role === "PARENT") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const complaint = await prisma.complaint.findUnique({
      where: { id },
    });

    if (!complaint) {
      return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    }

    if (session.user.role === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: session.user.id }
      });
      
      if (!teacher || complaint.teacherId !== teacher.id) {
        return NextResponse.json(
          { error: "Forbidden: You can only delete complaints you raised" },
          { status: 403 }
        );
      }

      if (complaint.status !== "OPEN") {
        return NextResponse.json(
          { error: "Forbidden: You cannot delete a complaint that is already under review or resolved" },
          { status: 403 }
        );
      }
    }

    await prisma.complaint.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const e = error as Error;
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
