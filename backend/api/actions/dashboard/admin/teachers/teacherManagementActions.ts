"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import bcrypt from "bcryptjs";
import { z } from "zod";

const teacherCreateSchema = z.object({
  name: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Valid email/username is required"),
  googleEmail: z.string().email("Valid Google email is required").optional().or(z.literal("")),
  password: z.string().min(6, "Password must be at least 6 characters").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  alternatePhone: z.string().optional().or(z.literal("")),
  qualification: z.string().optional().or(z.literal("")),
  joinDate: z.string().optional().or(z.literal("")),
  resumeUrl: z.string().optional().or(z.literal("")),
  maxPeriodsPerDay: z.number().min(1).max(12).default(6),
  maxPeriodsPerWeek: z.number().min(1).max(60).default(30),
  classIds: z.array(z.string()).default([]),
  subjectIds: z.array(z.string()).default([]),
  classTeacherOfId: z.string().optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

const teacherUpdateSchema = teacherCreateSchema.extend({
  teacherId: z.string(),
});

export async function createTeacherAction(rawData: z.infer<typeof teacherCreateSchema>) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized: Admin privileges required." };
    }

    const validated = teacherCreateSchema.parse(rawData);
    const normalizedEmail = validated.email.trim().toLowerCase();
    const normalizedGoogleEmail = validated.googleEmail?.trim().toLowerCase() || null;

    // Check unique email
    const existingEmail = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } }
    });
    if (existingEmail) {
      return { error: `A user with email/username "${normalizedEmail}" already exists.` };
    }

    // Check unique googleEmail
    if (normalizedGoogleEmail) {
      const existingGoogle = await prisma.user.findFirst({
        where: {
          OR: [
            { googleEmail: { equals: normalizedGoogleEmail, mode: "insensitive" } },
            { email: { equals: normalizedGoogleEmail, mode: "insensitive" } }
          ]
        }
      });
      if (existingGoogle) {
        return { error: `Google email "${normalizedGoogleEmail}" is already linked to another user.` };
      }
    }

    // Hash password or default
    const plainPassword = validated.password || "Teacher@123";
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create User
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          name: validated.name.trim(),
          role: "TEACHER",
          status: validated.status,
          googleEmail: normalizedGoogleEmail,
          googleEmailVerified: false,
          sessionVersion: 1,
        }
      });

      // 2. Create Teacher
      const teacher = await tx.teacher.create({
        data: {
          userId: user.id,
          phone: validated.phone?.trim() || null,
          alternatePhone: validated.alternatePhone?.trim() || null,
          qualification: validated.qualification?.trim() || null,
          joinDate: validated.joinDate ? new Date(validated.joinDate) : new Date(),
          resumeUrl: validated.resumeUrl?.trim() || null,
          maxPeriodsPerDay: validated.maxPeriodsPerDay,
          maxPeriodsPerWeek: validated.maxPeriodsPerWeek,
          isActive: validated.status === "ACTIVE",
          classes: validated.classIds.length > 0 ? {
            connect: validated.classIds.map(id => ({ id }))
          } : undefined,
        }
      });

      // 3. Connect subjects
      if (validated.subjectIds.length > 0) {
        await tx.subject.updateMany({
          where: { id: { in: validated.subjectIds } },
          data: { teacherId: teacher.id }
        });
      }

      // 4. Assign Class Teacher
      if (validated.classTeacherOfId) {
        await tx.class.update({
          where: { id: validated.classTeacherOfId },
          data: { classTeacherId: teacher.id }
        });
      }

      // 5. Audit Log
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "CREATE_TEACHER",
          targetModel: "Teacher",
          targetId: teacher.id,
          details: `Created teacher ${validated.name} (${normalizedEmail})`,
        }
      });

      return { teacherId: teacher.id, userId: user.id };
    });

    revalidatePath("/dashboard/admin/teachers");
    revalidatePath("/dashboard/admin/timetable");
    return { success: true, teacherId: result.teacherId };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return { error: error.issues?.[0]?.message || "Validation failed" };
    }
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Failed to create teacher." };
  }
}

export async function updateTeacherAction(rawData: z.infer<typeof teacherUpdateSchema>) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized: Admin privileges required." };
    }

    const validated = teacherUpdateSchema.parse(rawData);
    const normalizedEmail = validated.email.trim().toLowerCase();
    const normalizedGoogleEmail = validated.googleEmail?.trim().toLowerCase() || null;

    const teacher = await prisma.teacher.findUnique({
      where: { id: validated.teacherId },
      include: { user: true, classTeacherOf: true }
    });
    if (!teacher) return { error: "Teacher not found." };

    // Uniqueness checks (excluding current user)
    const duplicateEmail = await prisma.user.findFirst({
      where: {
        id: { not: teacher.userId },
        email: { equals: normalizedEmail, mode: "insensitive" }
      }
    });
    if (duplicateEmail) {
      return { error: `Email/username "${normalizedEmail}" is already used by another account.` };
    }

    if (normalizedGoogleEmail) {
      const duplicateGoogle = await prisma.user.findFirst({
        where: {
          id: { not: teacher.userId },
          OR: [
            { googleEmail: { equals: normalizedGoogleEmail, mode: "insensitive" } },
            { email: { equals: normalizedGoogleEmail, mode: "insensitive" } }
          ]
        }
      });
      if (duplicateGoogle) {
        return { error: `Google email "${normalizedGoogleEmail}" is already linked to another account.` };
      }
    }

    await prisma.$transaction(async (tx) => {
      // Check if credentials changed
      const emailChanged = teacher.user.email.toLowerCase() !== normalizedEmail;
      const passwordProvided = Boolean(validated.password && validated.password.length >= 6);
      const statusChanged = teacher.user.status !== validated.status;

      const userUpdateData: any = {
        name: validated.name.trim(),
        email: normalizedEmail,
        googleEmail: normalizedGoogleEmail,
        status: validated.status,
      };

      if (passwordProvided) {
        userUpdateData.password = await bcrypt.hash(validated.password!, 10);
      }

      // Bump session version if credentials changed or account deactivated
      if (emailChanged || passwordProvided || (statusChanged && validated.status === "INACTIVE")) {
        userUpdateData.sessionVersion = { increment: 1 };
      }

      // 1. Update User
      await tx.user.update({
        where: { id: teacher.userId },
        data: userUpdateData,
      });

      // 2. Update Teacher
      await tx.teacher.update({
        where: { id: teacher.id },
        data: {
          phone: validated.phone?.trim() || null,
          alternatePhone: validated.alternatePhone?.trim() || null,
          qualification: validated.qualification?.trim() || null,
          joinDate: validated.joinDate ? new Date(validated.joinDate) : teacher.joinDate,
          resumeUrl: validated.resumeUrl?.trim() || null,
          maxPeriodsPerDay: validated.maxPeriodsPerDay,
          maxPeriodsPerWeek: validated.maxPeriodsPerWeek,
          isActive: validated.status === "ACTIVE",
          classes: {
            set: validated.classIds.map(id => ({ id }))
          }
        }
      });

      // 3. Update Subjects assignment
      // Unlink removed subjects
      await tx.subject.updateMany({
        where: {
          teacherId: teacher.id,
          id: { notIn: validated.subjectIds }
        },
        data: { teacherId: null }
      });
      // Link selected subjects
      if (validated.subjectIds.length > 0) {
        await tx.subject.updateMany({
          where: { id: { in: validated.subjectIds } },
          data: { teacherId: teacher.id }
        });
      }

      // 4. Class teacher role update
      const currentClassTeacherOf = teacher.classTeacherOf;
      if (currentClassTeacherOf && currentClassTeacherOf.id !== validated.classTeacherOfId) {
        await tx.class.update({
          where: { id: currentClassTeacherOf.id },
          data: { classTeacherId: null }
        });
      }
      if (validated.classTeacherOfId && (!currentClassTeacherOf || currentClassTeacherOf.id !== validated.classTeacherOfId)) {
        await tx.class.update({
          where: { id: validated.classTeacherOfId },
          data: { classTeacherId: teacher.id }
        });
      }

      // 5. Audit Log
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "UPDATE_TEACHER",
          targetModel: "Teacher",
          targetId: teacher.id,
          details: `Updated teacher ${validated.name} (${normalizedEmail})`,
        }
      });
    });

    revalidatePath("/dashboard/admin/teachers");
    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/teacher");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return { error: error.issues?.[0]?.message || "Validation failed" };
    }
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Failed to update teacher." };
  }
}

export async function toggleTeacherStatusAction(teacherId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized: Admin privileges required." };
    }

    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      include: { user: true }
    });
    if (!teacher) return { error: "Teacher not found." };

    const newIsActive = !teacher.isActive;
    const newStatus = newIsActive ? "ACTIVE" : "INACTIVE";

    await prisma.$transaction(async (tx) => {
      await tx.teacher.update({
        where: { id: teacherId },
        data: { isActive: newIsActive }
      });

      await tx.user.update({
        where: { id: teacher.userId },
        data: {
          status: newStatus,
          // If deactivating, revoke sessions immediately
          sessionVersion: newIsActive ? undefined : { increment: 1 }
        }
      });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: newIsActive ? "ACTIVATE_TEACHER" : "DEACTIVATE_TEACHER",
          targetModel: "Teacher",
          targetId: teacher.id,
          details: `${newIsActive ? "Activated" : "Deactivated"} teacher ${teacher.user.name}`,
        }
      });
    });

    revalidatePath("/dashboard/admin/teachers");
    revalidatePath("/dashboard/admin/timetable");
    return { success: true, newStatus };
  } catch (error: unknown) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to update teacher status." };
  }
}

export async function deleteTeacherPermanentlyAction(teacherId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized: Admin privileges required." };
    }

    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      include: { user: true }
    });
    if (!teacher) return { error: "Teacher not found." };

    // Check if teacher has active substitution duty today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeSub = await prisma.substitution.findFirst({
      where: {
        date: today,
        substituteTeacherId: teacherId,
        status: "ASSIGNED"
      }
    });
    if (activeSub) {
      return { error: "Cannot delete teacher: This teacher is currently assigned as an active substitute today." };
    }

    await prisma.$transaction(async (tx) => {
      // 1. Unlink class teacher role
      await tx.class.updateMany({
        where: { classTeacherId: teacherId },
        data: { classTeacherId: null }
      });

      // 2. Unlink from subjects (keep subjects intact)
      await tx.subject.updateMany({
        where: { teacherId },
        data: { teacherId: null }
      });

      // 3. Unlink from timetable slots (keep slots intact)
      await tx.timetable.updateMany({
        where: { teacherId },
        data: { teacherId: null }
      });

      // 4. Cascade delete exam requests and complaints
      await tx.examRequest.deleteMany({ where: { teacherId } });
      await tx.complaint.deleteMany({ where: { teacherId } });

      // 5. Cascade delete assignments and submissions
      const assignments = await tx.assignment.findMany({ where: { teacherId }, select: { id: true } });
      const assignmentIds = assignments.map(a => a.id);
      if (assignmentIds.length > 0) {
        await tx.submission.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
        await tx.assignment.deleteMany({ where: { teacherId } });
      }

      // 6. Disconnect from meetings
      const meetings = await tx.meeting.findMany({
        where: { teachers: { some: { id: teacherId } } },
        select: { id: true }
      });
      for (const m of meetings) {
        await tx.meeting.update({
          where: { id: m.id },
          data: { teachers: { disconnect: [{ id: teacherId }] } }
        });
      }

      // 7. Delete Teacher record
      await tx.teacher.delete({ where: { id: teacherId } });

      // 8. Delete User record
      await tx.user.delete({ where: { id: teacher.userId } });

      // 9. Audit Log
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "DELETE_TEACHER",
          targetModel: "Teacher",
          targetId: teacherId,
          details: `Deleted teacher ${teacher.user.name} (${teacher.user.email})`,
        }
      });
    });

    revalidatePath("/dashboard/admin/teachers");
    revalidatePath("/dashboard/admin/timetable");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to delete teacher." };
  }
}
