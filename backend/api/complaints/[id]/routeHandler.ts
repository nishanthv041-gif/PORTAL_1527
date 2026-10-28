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

    const { id } = await params;
    const body = await request.json();
    const { title, description, category, severity } = body;

    const complaint = await prisma.complaint.findUnique({
      where: { id },
      include: { parent: true }
    });

    if (!complaint) {
      return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    }

    if (session.user.role === "PARENT") {
      const isOwner = complaint.authorId === session.user.id || complaint.parent?.userId === session.user.id;
      if (!isOwner) {
        return NextResponse.json({ error: "Forbidden: You can only edit complaints you submitted" }, { status: 403 });
      }
      if (complaint.status !== "OPEN") {
        return NextResponse.json({ error: "Forbidden: You cannot edit a complaint that is already under review or resolved" }, { status: 403 });
      }
    } else if (session.user.role === "TEACHER") {
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

    const { id } = await params;

    const complaint = await prisma.complaint.findUnique({
      where: { id },
      include: { parent: true }
    });

    if (!complaint) {
      return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    }

    if (session.user.role === "PARENT") {
      const isOwner = complaint.authorId === session.user.id || complaint.parent?.userId === session.user.id;
      if (!isOwner) {
        return NextResponse.json(
          { error: "Forbidden: You can only withdraw complaints you submitted" },
          { status: 403 }
        );
      }
      if (complaint.status !== "OPEN") {
        return NextResponse.json(
          { error: "Forbidden: You cannot withdraw a complaint that is already under review or resolved" },
          { status: 403 }
        );
      }
    } else if (session.user.role === "TEACHER") {
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

    // Cascade delete any complaint messages first
    await prisma.complaintMessage.deleteMany({
      where: { complaintId: id }
    });

    await prisma.complaint.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const e = error as Error;
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
