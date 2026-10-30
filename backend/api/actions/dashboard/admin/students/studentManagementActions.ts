"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import bcrypt from "bcryptjs";
import { z } from "zod";

const studentCreateSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().default(""),
  rollNumber: z.string().min(1, "Roll number is required"),
  admissionNo: z.string().min(1, "Admission number is required"),
  classId: z.string().min(1, "Class is required"),
  dateOfBirth: z.string().optional().or(z.literal("")),
  gender: z.string().optional().or(z.literal("")),
  bloodGroup: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  photo: z.string().optional().or(z.literal("")),
  batch: z.string().optional().or(z.literal("")),
  residenceType: z.enum(["DAYSCHOLAR", "HOSTEL"]).default("DAYSCHOLAR"),
  isActive: z.boolean().default(true),

  // Parent Linking / Creation
  existingParentId: z.string().optional().or(z.literal("")),
  parentName: z.string().optional().or(z.literal("")),
  parentEmail: z.string().optional().or(z.literal("")),
  parentGoogleEmail: z.string().optional().or(z.literal("")),
  parentPassword: z.string().optional().or(z.literal("")),
  parentPhone: z.string().optional().or(z.literal("")),
  parentAlternatePhone: z.string().optional().or(z.literal("")),
  parentOccupation: z.string().optional().or(z.literal("")),
});

const studentUpdateSchema = studentCreateSchema.extend({
  studentId: z.string(),
  parentId: z.string().optional().or(z.literal("")),
  parentStatus: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export async function createStudentAction(rawData: z.infer<typeof studentCreateSchema>) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized: Admin privileges required." };
    }

    const validated = studentCreateSchema.parse(rawData);

    // Check unique admission number
    const existingAdmission = await prisma.student.findUnique({
      where: { admissionNo: validated.admissionNo.trim() }
    });
    if (existingAdmission) {
      return { error: `Admission number "${validated.admissionNo}" is already in use by another student.` };
    }

    // Check unique roll number in this class
    const existingRoll = await prisma.student.findFirst({
      where: {
        classId: validated.classId,
        rollNumber: validated.rollNumber.trim()
      }
    });
    if (existingRoll) {
      return { error: `Roll number "${validated.rollNumber}" already exists in this class.` };
    }

    let parentId = validated.existingParentId || null;

    // Run transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. If no existing parent linked, create new Parent & User if details provided
      if (!parentId && validated.parentEmail?.trim()) {
        const normParentEmail = validated.parentEmail.trim().toLowerCase();
        const normGoogleEmail = validated.parentGoogleEmail?.trim().toLowerCase() || null;

        const existingEmail = await tx.user.findFirst({
          where: { email: { equals: normParentEmail, mode: "insensitive" } }
        });
        if (existingEmail) {
          throw new Error(`Email "${normParentEmail}" is already used. Select "Link Existing Parent" if this is a sibling.`);
        }

        const plainPass = validated.parentPassword || "Parent@123";
        const hashedPass = await bcrypt.hash(plainPass, 10);

        const parentUser = await tx.user.create({
          data: {
            name: validated.parentName?.trim() || `${validated.firstName}'s Parent`,
            email: normParentEmail,
            googleEmail: normGoogleEmail,
            password: hashedPass,
            role: "PARENT",
            status: "ACTIVE",
            sessionVersion: 1,
          }
        });

        const parent = await tx.parent.create({
          data: {
            userId: parentUser.id,
            phone: validated.parentPhone?.trim() || null,
            alternatePhone: validated.parentAlternatePhone?.trim() || null,
            occupation: validated.parentOccupation?.trim() || null,
            isActive: true,
          }
        });

        parentId = parent.id;
      }

      // 2. Create Student
      const student = await tx.student.create({
        data: {
          firstName: validated.firstName.trim(),
          lastName: validated.lastName.trim(),
          rollNumber: validated.rollNumber.trim(),
          admissionNo: validated.admissionNo.trim(),
          classId: validated.classId,
          dateOfBirth: validated.dateOfBirth ? new Date(validated.dateOfBirth) : null,
          gender: validated.gender || null,
          bloodGroup: validated.bloodGroup || null,
          address: validated.address?.trim() || null,
          photo: validated.photo || null,
          batch: validated.batch?.trim() || null,
          residenceType: validated.residenceType,
          isActive: validated.isActive,
        }
      });

      // 3. Link Parent to Student
      if (parentId) {
        await tx.parentStudent.create({
          data: {
            parentId,
            studentId: student.id,
          }
        });
      }

      // 4. Audit Log
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "CREATE_STUDENT",
          targetModel: "Student",
          targetId: student.id,
          details: `Created student ${validated.firstName} ${validated.lastName} (Roll: ${validated.rollNumber}, Adm: ${validated.admissionNo})`,
        }
      });

      return { studentId: student.id };
    });

    revalidatePath("/dashboard/admin/students");
    return { success: true, studentId: result.studentId };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return { error: error.issues?.[0]?.message || "Validation failed" };
    }
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Failed to create student." };
  }
}

export async function updateStudentAction(rawData: z.infer<typeof studentUpdateSchema>) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized: Admin privileges required." };
    }

    const validated = studentUpdateSchema.parse(rawData);

    const student = await prisma.student.findUnique({
      where: { id: validated.studentId },
      include: {
        parents: {
          include: { parent: { include: { user: true } } }
        }
      }
    });
    if (!student) return { error: "Student not found." };

    // Check unique admissionNo
    const duplicateAdmission = await prisma.student.findFirst({
      where: {
        id: { not: student.id },
        admissionNo: validated.admissionNo.trim(),
      }
    });
    if (duplicateAdmission) {
      return { error: `Admission number "${validated.admissionNo}" is already in use.` };
    }

    // Check unique rollNumber in class
    const duplicateRoll = await prisma.student.findFirst({
      where: {
        id: { not: student.id },
        classId: validated.classId,
        rollNumber: validated.rollNumber.trim(),
      }
    });
    if (duplicateRoll) {
      return { error: `Roll number "${validated.rollNumber}" is already in use in this class.` };
    }

    await prisma.$transaction(async (tx) => {
      // 1. Update Student record
      await tx.student.update({
        where: { id: student.id },
        data: {
          firstName: validated.firstName.trim(),
          lastName: validated.lastName.trim(),
          rollNumber: validated.rollNumber.trim(),
          admissionNo: validated.admissionNo.trim(),
          classId: validated.classId, // Seamless class move! Attendance/marks preserved!
          dateOfBirth: validated.dateOfBirth ? new Date(validated.dateOfBirth) : null,
          gender: validated.gender || null,
          bloodGroup: validated.bloodGroup || null,
          address: validated.address?.trim() || null,
          photo: validated.photo || null,
          batch: validated.batch?.trim() || null,
          residenceType: validated.residenceType,
          isActive: validated.isActive,
        }
      });

      // 2. Manage Parent Details & Credentials
      const currentParentStudent = student.parents[0];
      const targetParentId = validated.existingParentId || validated.parentId || currentParentStudent?.parentId;

      if (targetParentId) {
        // If switching to an existing sibling's parent
        if (currentParentStudent && currentParentStudent.parentId !== targetParentId) {
          await tx.parentStudent.delete({
            where: {
              parentId_studentId: {
                parentId: currentParentStudent.parentId,
                studentId: student.id
              }
            }
          });
          await tx.parentStudent.create({
            data: { parentId: targetParentId, studentId: student.id }
          });
        }

        // Update target parent's profile and user credentials if fields provided
        const parentRecord = await tx.parent.findUnique({
          where: { id: targetParentId },
          include: { user: true }
        });

        if (parentRecord) {
          const parentUpdates: any = {};
          if (validated.parentPhone !== undefined) parentUpdates.phone = validated.parentPhone.trim() || null;
          if (validated.parentAlternatePhone !== undefined) parentUpdates.alternatePhone = validated.parentAlternatePhone.trim() || null;
          if (validated.parentOccupation !== undefined) parentUpdates.occupation = validated.parentOccupation.trim() || null;
          parentUpdates.isActive = validated.parentStatus === "ACTIVE";

          await tx.parent.update({
            where: { id: targetParentId },
            data: parentUpdates
          });

          // Update User
          const userUpdates: any = {};
          if (validated.parentName?.trim()) userUpdates.name = validated.parentName.trim();
          if (validated.parentEmail?.trim()) {
            const normEmail = validated.parentEmail.trim().toLowerCase();
            if (normEmail !== parentRecord.user.email.toLowerCase()) {
              const dup = await tx.user.findFirst({
                where: {
                  id: { not: parentRecord.userId },
                  email: { equals: normEmail, mode: "insensitive" }
                }
              });
              if (dup) throw new Error(`Parent email "${normEmail}" is already used by another account.`);
              userUpdates.email = normEmail;
              userUpdates.sessionVersion = { increment: 1 };
            }
          }
          if (validated.parentGoogleEmail !== undefined) {
            userUpdates.googleEmail = validated.parentGoogleEmail.trim().toLowerCase() || null;
          }
          if (validated.parentPassword && validated.parentPassword.length >= 6) {
            userUpdates.password = await bcrypt.hash(validated.parentPassword, 10);
            userUpdates.sessionVersion = { increment: 1 };
          }
          if (validated.parentStatus !== parentRecord.user.status) {
            userUpdates.status = validated.parentStatus;
            if (validated.parentStatus === "INACTIVE") {
              userUpdates.sessionVersion = { increment: 1 };
            }
          }

          if (Object.keys(userUpdates).length > 0) {
            await tx.user.update({
              where: { id: parentRecord.userId },
              data: userUpdates
            });
          }
        }
      } else if (validated.parentEmail?.trim()) {
        // Create brand new parent for this student
        const normParentEmail = validated.parentEmail.trim().toLowerCase();
        const normGoogleEmail = validated.parentGoogleEmail?.trim().toLowerCase() || null;

        const existingEmail = await tx.user.findFirst({
          where: { email: { equals: normParentEmail, mode: "insensitive" } }
        });
        if (existingEmail) {
          throw new Error(`Email "${normParentEmail}" is already in use.`);
        }

        const plainPass = validated.parentPassword || "Parent@123";
        const hashedPass = await bcrypt.hash(plainPass, 10);

        const parentUser = await tx.user.create({
          data: {
            name: validated.parentName?.trim() || `${validated.firstName}'s Parent`,
            email: normParentEmail,
            googleEmail: normGoogleEmail,
            password: hashedPass,
            role: "PARENT",
            status: "ACTIVE",
            sessionVersion: 1,
          }
        });

        const newParent = await tx.parent.create({
          data: {
            userId: parentUser.id,
            phone: validated.parentPhone?.trim() || null,
            alternatePhone: validated.parentAlternatePhone?.trim() || null,
            occupation: validated.parentOccupation?.trim() || null,
            isActive: true,
          }
        });

        await tx.parentStudent.create({
          data: { parentId: newParent.id, studentId: student.id }
        });
      }

      // 3. Audit Log
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "UPDATE_STUDENT",
          targetModel: "Student",
          targetId: student.id,
          details: `Updated student ${validated.firstName} ${validated.lastName} (Class ID: ${validated.classId})`,
        }
      });
    });

    revalidatePath("/dashboard/admin/students");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return { error: error.issues?.[0]?.message || "Validation failed" };
    }
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Failed to update student." };
  }
}

export async function toggleStudentStatusAction(studentId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized: Admin privileges required." };
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId }
    });
    if (!student) return { error: "Student not found." };

    const newIsActive = !student.isActive;

    await prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: studentId },
        data: { isActive: newIsActive }
      });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: newIsActive ? "ACTIVATE_STUDENT" : "DEACTIVATE_STUDENT",
          targetModel: "Student",
          targetId: studentId,
          details: `${newIsActive ? "Activated" : "Deactivated"} student ${student.firstName} ${student.lastName}`,
        }
      });
    });

    revalidatePath("/dashboard/admin/students");
    return { success: true, newStatus: newIsActive };
  } catch (error: unknown) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to toggle student status." };
  }
}

export async function deleteStudentPermanentlyAction(studentId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized: Admin privileges required." };
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        parents: { select: { parentId: true } }
      }
    });
    if (!student) return { error: "Student not found." };

    await prisma.$transaction(async (tx) => {
      // 1. Delete student academic & behavioral relations
      await tx.attendance.deleteMany({ where: { studentId } });
      await tx.mark.deleteMany({ where: { studentId } });
      await tx.reportCard.deleteMany({ where: { studentId } });
      await tx.disciplineRecord.deleteMany({ where: { studentId } });
      await tx.achievement.deleteMany({ where: { studentId } });
      await tx.leaveRequest.deleteMany({ where: { studentId } });
      await tx.complaint.deleteMany({ where: { studentId } });

      // 2. Unlink parent-student records
      const parentIds = student.parents.map(p => p.parentId);
      await tx.parentStudent.deleteMany({ where: { studentId } });

      // 3. For each unlinked parent, check if they have any remaining children
      for (const pId of parentIds) {
        const remainingChildren = await tx.parentStudent.count({ where: { parentId: pId } });
        if (remainingChildren === 0) {
          // If no other children exist for this parent, clean up parent and user record
          const parent = await tx.parent.findUnique({ where: { id: pId } });
          if (parent) {
            await tx.parent.delete({ where: { id: pId } });
            await tx.user.delete({ where: { id: parent.userId } });
          }
        }
      }

      // 4. Delete Student
      await tx.student.delete({ where: { id: studentId } });

      // 5. Audit Log
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "DELETE_STUDENT",
          targetModel: "Student",
          targetId: studentId,
          details: `Deleted student ${student.firstName} ${student.lastName} (Adm: ${student.admissionNo})`,
        }
      });
    });

    revalidatePath("/dashboard/admin/students");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to delete student." };
  }
}
