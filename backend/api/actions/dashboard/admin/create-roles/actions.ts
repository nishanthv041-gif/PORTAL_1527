"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function createTeacherAction(formData: FormData) {
  try {
    const { getSystemSetting } = await import("@/backend/api/actions/dashboard/admin/settings/actions");
    const allowTeacher = await getSystemSetting("ALLOW_TEACHER_REGISTRATION", "true");
    if (allowTeacher === "false") {
      return { error: "Teacher account creation is currently disabled in System Settings." };
    }

    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;
    const qualification = formData.get("qualification") as string;
    const subjectIdsInput = formData.get("subjectIds") as string;
    
    // Auth fields
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const googleEmail = formData.get("googleEmail") as string;

    if (!isValidEmail(email)) return { error: "Invalid official email address." };
    if (googleEmail) {
      const cleanGoogle = googleEmail.trim().toLowerCase();
      if (!isValidEmail(cleanGoogle) || (!cleanGoogle.endsWith('@gmail.com') && !cleanGoogle.endsWith('@googlemail.com'))) {
        return { error: "Google Email must be a valid Gmail account (@gmail.com)." };
      }
    }

    // Check uniqueness
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return { error: "A user with this official email already exists." };

    // Real Google email validation (format check)
    let googleEmailVerified = false;
    if (googleEmail && (googleEmail.endsWith('@gmail.com') || googleEmail.endsWith('@googlemail.com'))) {
      googleEmailVerified = true;
    }

    const subjectIds = subjectIdsInput ? subjectIdsInput.split(',').filter(Boolean) : [];
    const classTeacherId = formData.get("classTeacherId") as string;
    
    const resumeFile = formData.get("resume") as File | null;
    let resumeUrl = null;
    if (resumeFile && resumeFile.size > 0) {
      try {
        const { put } = await import("@vercel/blob");
        const blob = await put(resumeFile.name, resumeFile, { access: 'public' });
        resumeUrl = blob.url;
      } catch (err) {
        console.error("Vercel Blob upload failed, falling back to dummy URL", err);
        resumeUrl = `/uploads/${resumeFile.name.replace(/\s+/g, '_')}`;
      }
    }

    const teacherData: import("@prisma/client").Prisma.TeacherCreateWithoutUserInput = {
      phone,
      qualification,
      resumeUrl,
      joinDate: new Date(),
      isActive: true,
      subjects: {
        connect: subjectIds.map((s: string) => ({ id: s })),
      }
    };

    if (classTeacherId) {
      teacherData.classTeacherOf = {
        connect: { id: classTeacherId }
      };
    }

    // Create User & Teacher
    await prisma.user.create({
      data: {
        name,
        email,
        password, // Using plain password as per existing mock data flow. In prod, bcrypt.
        role: "TEACHER",
        status: "ACTIVE",
        googleEmail: googleEmail || null,
        googleEmailVerified: googleEmailVerified && !!googleEmail,
        teacher: {
          create: teacherData
        }
      },
    });

    revalidatePath("/dashboard/admin/users");
    revalidatePath("/dashboard/admin/teachers");
    revalidatePath("/dashboard/admin/subjects");
    
    return { success: true, message: "Teacher created successfully." };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to create teacher." };
    }
    return { error: "Failed to create teacher." };
  }
}

export async function createParentStudentAction(formData: FormData) {
  try {
    const { getSystemSetting } = await import("@/backend/api/actions/dashboard/admin/settings/actions");
    const allowParent = await getSystemSetting("ALLOW_PARENT_REGISTRATION", "true");
    const allowStudent = await getSystemSetting("ALLOW_STUDENT_REGISTRATION", "true");
    if (allowParent === "false" || allowStudent === "false") {
      return { error: "Parent or Student account creation is currently disabled in System Settings." };
    }
    
    // Student fields
    const studentName = formData.get("studentName") as string;
    const gender = formData.get("gender") as string;
    const dateOfBirth = formData.get("dateOfBirth") as string;
    const rollNumber = formData.get("rollNumber") as string;
    const admissionNo = formData.get("admissionNo") as string;
    const classId = formData.get("classId") as string;
    const batch = formData.get("batch") as string;
    const rawResidence = (formData.get("residenceType") as string) || "DAYSCHOLAR";
    const residenceType = rawResidence.toUpperCase().includes("HOSTEL") ? "HOSTEL" : "DAYSCHOLAR";

    // Parent fields
    const parentName = formData.get("parentName") as string;
    const parentPhone = formData.get("parentPhone") as string;
    const parentEmail = formData.get("parentEmail") as string;
    const parentPassword = formData.get("parentPassword") as string;
    const parentGoogleEmail = formData.get("parentGoogleEmail") as string;
    const parentAddress = formData.get("parentAddress") as string;

    if (!isValidEmail(parentEmail)) return { error: "Invalid official email address." };
    if (parentGoogleEmail) {
      const cleanGoogle = parentGoogleEmail.trim().toLowerCase();
      if (!isValidEmail(cleanGoogle) || (!cleanGoogle.endsWith('@gmail.com') && !cleanGoogle.endsWith('@googlemail.com'))) {
        return { error: "Google Email must be a valid Gmail account (@gmail.com)." };
      }
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ 
      where: { email: parentEmail },
      include: { parent: true }
    });
    
    if (existingUser && existingUser.role !== "PARENT") {
      return { error: `A user with email ${parentEmail} already exists with role ${existingUser.role}.` };
    }

    const existingStudent = await prisma.student.findFirst({
      where: { OR: [{ rollNumber }, { admissionNo }] }
    });
    if (existingStudent) return { error: "A student with this Roll Number or Admission Number already exists." };

    // Real Google email validation (format check)
    let googleEmailVerified = false;
    if (parentGoogleEmail && (parentGoogleEmail.endsWith('@gmail.com') || parentGoogleEmail.endsWith('@googlemail.com'))) {
      googleEmailVerified = true;
    }

    const [firstName, ...lastNameParts] = studentName.split(' ');
    const lastName = lastNameParts.join(' ') || '.';

    // Create User (if new), Parent (if new), and Student in transaction
    await prisma.$transaction(async (tx) => {
      let parentId: string;

      if (!existingUser) {
        const user = await tx.user.create({
          data: {
            name: parentName,
            email: parentEmail,
            password: parentPassword,
            role: "PARENT",
            status: "ACTIVE",
            googleEmail: parentGoogleEmail || null,
            googleEmailVerified: googleEmailVerified && !!parentGoogleEmail,
            parent: {
              create: {
                phone: parentPhone,
                isActive: true,
              }
            }
          },
          include: { parent: true }
        });
        parentId = user.parent!.id;
      } else {
        if (!existingUser.parent) {
          const newParent = await tx.parent.create({
            data: {
              userId: existingUser.id,
              phone: parentPhone,
              isActive: true
            }
          });
          parentId = newParent.id;
        } else {
          parentId = existingUser.parent.id;
        }
      }

      const student = await tx.student.create({
        data: {
          firstName,
          lastName,
          rollNumber,
          admissionNo,
          gender,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          address: parentAddress,
          classId: classId || null,
          batch: batch || null,
          residenceType,
          isActive: true
        }
      });

      await tx.parentStudent.create({
        data: {
          parentId,
          studentId: student.id
        }
      });

      return student;
    });

    try {
      revalidatePath("/dashboard/admin/users");
      revalidatePath("/dashboard/admin/parents");
      revalidatePath("/dashboard/admin/students");
    } catch {
      // Ignored outside Next.js request context
    }

    return { success: true, message: "Parent & Student created successfully." };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to create parent & student." };
    }
    return { error: "Failed to create parent & student." };
  }
}

export async function createAdminAction(formData: FormData) {
  try {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    
    if (!name || !email) return { error: "Name and Email ID are required." };

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.endsWith('@gmail.com') && !cleanEmail.endsWith('@googlemail.com')) {
      return { error: "Admin email must be a valid Gmail account (@gmail.com)." };
    }

    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser) return { error: "A user with this email already exists." };

    await prisma.user.create({
      data: {
        name,
        email: cleanEmail,
        role: "ADMIN",
        status: "ACTIVE",
        googleEmail: cleanEmail,
        googleEmailVerified: true
      }
    });

    revalidatePath("/dashboard/admin/users");
    
    return { success: true, message: "Admin created successfully." };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to create Admin." };
    }
    return { error: "Failed to create Admin." };
  }
}
