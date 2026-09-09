"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function deactivateParent(id: string) {
  await prisma.parent.update({
    where: { id },
    data: { isActive: false }
  });
  
  const parent = await prisma.parent.findUnique({ where: { id } });
  if (parent) {
    await prisma.user.update({
      where: { id: parent.userId },
      data: { status: 'INACTIVE' }
    });
  }

  // Do NOT cascade to students, as per requirements
  revalidatePath('/dashboard/admin/parents');
  revalidatePath('/dashboard/admin/users');
  return { success: true };
}

export async function activateParent(id: string) {
  await prisma.parent.update({
    where: { id },
    data: { isActive: true }
  });
  
  const parent = await prisma.parent.findUnique({ where: { id } });
  if (parent) {
    await prisma.user.update({
      where: { id: parent.userId },
      data: { status: 'ACTIVE' }
    });
  }

  revalidatePath('/dashboard/admin/parents');
  revalidatePath('/dashboard/admin/users');
  return { success: true };
}

export async function deleteParent(id: string) {
  try {
    const parent = await prisma.parent.findUnique({
      where: { id }
    });

    if (!parent) return { error: "Parent not found." };

    // Disconnect from parent student links
    await prisma.parentStudent.deleteMany({
      where: { parentId: id }
    });

    // Disconnect from meetings via individual updates
    const parentMeetings = await prisma.meeting.findMany({
      where: { parents: { some: { id } } },
      select: { id: true }
    });
    for (const meeting of parentMeetings) {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { parents: { disconnect: [{ id }] } }
      });
    }

    // We also delete the base user here since Parent is heavily tied to User
    await prisma.message.deleteMany({ where: { OR: [{ senderId: parent.userId }, { receiverId: parent.userId }] } });
    await prisma.notification.deleteMany({ where: { userId: parent.userId } });
    await prisma.rating.deleteMany({ where: { userId: parent.userId } });
    await prisma.parent.delete({ where: { id } });
    await prisma.user.delete({ where: { id: parent.userId } });

    revalidatePath('/dashboard/admin/parents');
    revalidatePath('/dashboard/admin/users');
    return { success: true, message: "Parent deleted successfully." };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to delete parent." };
    }
    return { error: "Failed to delete parent." };
  }
}
