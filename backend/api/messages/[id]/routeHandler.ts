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
    const { content } = body;

    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const message = await prisma.message.findUnique({
      where: { id },
    });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Ensure the user is the sender
    if (message.senderId !== session.user.id) {
      return NextResponse.json(
        { error: "Forbidden: You can only edit your own messages" },
        { status: 403 }
      );
    }

    // Ensure the message is not deleted
    if (message.isDeleted) {
      return NextResponse.json(
        { error: "Forbidden: Cannot edit a deleted message" },
        { status: 403 }
      );
    }

    const updatedMessage = await prisma.message.update({
      where: { id },
      data: {
        content,
        editedAt: new Date(),
      },
    });

    return NextResponse.json(updatedMessage);
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

    const message = await prisma.message.findUnique({
      where: { id },
    });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Ensure the user is the sender
    if (message.senderId !== session.user.id) {
      return NextResponse.json(
        { error: "Forbidden: You can only delete your own messages" },
        { status: 403 }
      );
    }

    const deletedMessage = await prisma.message.update({
      where: { id },
      data: {
        isDeleted: true,
      },
    });

    return NextResponse.json(deletedMessage);
  } catch (error) {
    const e = error as Error;
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
