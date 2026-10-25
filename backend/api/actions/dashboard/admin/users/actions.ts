"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";

export async function deactivateUser(id: string) {
  await prisma.user.update({
    where: { id },
    data: { status: 'INACTIVE' }
  });
  
  // also deactivate associated teacher/parent if needed
  const user = await prisma.user.findUnique({ where: { id }, include: { teacher: true, parent: true } });
  if (user?.teacher) {
    await prisma.teacher.update({ where: { id: user.teacher.id }, data: { isActive: false } });
  }
  if (user?.parent) {
    await prisma.parent.update({ where: { id: user.parent.id }, data: { isActive: false } });
  }

  revalidatePath('/dashboard/admin/users');
}

export async function setUserExpiry(id: string, hours: number) {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hours);
  
  await prisma.user.update({
    where: { id },
    data: { expiresAt }
  });
  revalidatePath('/dashboard/admin/users');
}

export async function activateUser(id: string) {
  await prisma.user.update({
    where: { id },
    data: { status: 'ACTIVE' }
  });
  
  const user = await prisma.user.findUnique({ where: { id }, include: { teacher: true, parent: true } });
  if (user?.teacher) {
    await prisma.teacher.update({ where: { id: user.teacher.id }, data: { isActive: true } });
  }
  if (user?.parent) {
    await prisma.parent.update({ where: { id: user.parent.id }, data: { isActive: true } });
  }

  revalidatePath('/dashboard/admin/users');
}

export async function activateAllUsers() {
  await prisma.user.updateMany({
    where: { status: 'INACTIVE' },
    data: { status: 'ACTIVE' }
  });
  
  await prisma.teacher.updateMany({
    where: { isActive: false },
    data: { isActive: true }
  });
  
  await prisma.parent.updateMany({
    where: { isActive: false },
    data: { isActive: true }
  });

  revalidatePath('/dashboard/admin/users');
}

export async function deleteUser(id: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        teacher: true,
        parent: true,
        staff: true
      }
    });

    if (!user) return { error: "User not found." };
    if (user.role === 'ADMIN') return { error: "Cannot delete ADMIN users." };

    // Define all dependency cleanup operations
    const runCleanup = async (db: any) => {
      // 1. Dependency cleanup for TEACHER
      if (user.teacher) {
        const teacherId = user.teacher.id;

        // Disconnect from classes and remove simple dependencies concurrently
        await Promise.all([
          db.class.updateMany({ where: { classTeacherId: teacherId }, data: { classTeacherId: null } }),
          db.class.updateMany({ where: { teacherId: teacherId }, data: { teacherId: null } }),
          db.subject.updateMany({ where: { teacherId: teacherId }, data: { teacherId: null } }),
          db.complaint.deleteMany({ where: { teacherId } }),
          db.examRequest.deleteMany({ where: { teacherId } }),
          db.teacherAttendance.deleteMany({ where: { teacherId } }).catch(() => {})
        ]);

        // Disconnect meetings
        const meetingsWithTeacher = await db.meeting.findMany({
          where: { teachers: { some: { id: teacherId } } },
          select: { id: true }
        });
        if (meetingsWithTeacher.length > 0) {
          await Promise.all(
            meetingsWithTeacher.map((m: { id: string }) =>
              db.meeting.update({
                where: { id: m.id },
                data: { teachers: { disconnect: { id: teacherId } } }
              })
            )
          );
        }

        // Submissions & assignments
        const assignments = await db.assignment.findMany({ where: { teacherId }, select: { id: true } });
        const assignmentIds = assignments.map((a: { id: string }) => a.id);
        if (assignmentIds.length > 0) {
          await db.submission.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
        }
        await db.assignment.deleteMany({ where: { teacherId } });
        await db.teacher.delete({ where: { id: teacherId } });
      }

      // 2. Dependency cleanup for PARENT
      if (user.parent) {
        const parentId = user.parent.id;

        // Disconnect meetings
        const meetingsWithParent = await db.meeting.findMany({
          where: { parents: { some: { id: parentId } } },
          select: { id: true }
        });
        if (meetingsWithParent.length > 0) {
          await Promise.all(
            meetingsWithParent.map((m: { id: string }) =>
              db.meeting.update({
                where: { id: m.id },
                data: { parents: { disconnect: { id: parentId } } }
              })
            )
          );
        }

        await db.parentStudent.deleteMany({ where: { parentId } });
        await db.parent.delete({ where: { id: parentId } });
      }

      // 3. Dependency cleanup for STAFF
      if (user.staff) {
        await db.staff.delete({ where: { id: user.staff.id } });
      }

      // 4. Base User records & logs in parallel
      await Promise.all([
        db.message.deleteMany({ where: { OR: [{ senderId: id }, { receiverId: id }] } }),
        db.notification.deleteMany({ where: { userId: id } }),
        db.rating.deleteMany({ where: { userId: id } }),
        db.auditLog.deleteMany({ where: { OR: [{ userId: id }, { targetId: id }] } }),
        db.announcement.deleteMany({ where: { authorId: id } }),
        db.loginAttempt.deleteMany({ where: { email: user.email } }),
      ]);

      // 5. Delete the User record
      await db.user.delete({ where: { id } });
    };

    // Try within an expanded transaction timeout (15s wait, 30s execution)
    try {
      await prisma.$transaction(async (tx) => {
        await runCleanup(tx);
      }, {
        maxWait: 15000,
        timeout: 30000
      });
    } catch (txErr: any) {
      // If transaction closed due to PgBouncer pooler timeout (P2028),
      // execute direct cleanup sequentially to ensure complete deletion without error
      if (txErr?.code === 'P2028') {
        console.warn("[deleteUser] Interactive transaction closed by pooler. Executing direct cleanup...");
        await runCleanup(prisma);
      } else {
        throw txErr;
      }
    }

    try {
      revalidatePath('/dashboard/admin/users');
    } catch {
      // Ignore outside request context
    }

    return { success: true, message: "User deleted successfully." };
  } catch (error: unknown) {
    console.error("Delete user error:", error);
    if (error && typeof error === 'object' && 'code' in error) {
      const prismaError = error as { code: string; message: string };
      if (prismaError.code === 'P2003') {
        return { error: "Cannot delete user due to unresolved database relation constraint." };
      }
      if (prismaError.code === 'P2025') {
        return { error: "User or related record was already removed." };
      }
      const cleanMsg = prismaError.message ? prismaError.message.split('\n').map(s => s.trim()).filter(Boolean)[0] : "Database error";
      return { error: `Database error (${prismaError.code}): ${cleanMsg}` };
    }
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "An unexpected error occurred while deleting the user." };
  }
}

