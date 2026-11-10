"use server";

import { prisma } from "@/backend/db/prisma";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { parseAndValidateDob } from "@/lib/validations/dob";

export async function createStaffAction(formData: FormData) {
  try {
    const name = ((formData.get("name") as string) || "").trim();
    const email = ((formData.get("email") as string) || "").trim().toLowerCase();
    const password = ((formData.get("password") as string) || "").trim();
    const phone = ((formData.get("phone") as string) || "").trim();
    const jobTitle = ((formData.get("jobTitle") as string) || "").trim();
    const dateOfBirth = ((formData.get("dateOfBirth") as string) || "").trim();

    if (!name || !email || !password || !jobTitle) {
      return { error: "Please fill in all required fields." };
    }

    let staffDobDate: Date | null = null;
    if (dateOfBirth) {
      const dobValidation = parseAndValidateDob(dateOfBirth, "STAFF", true);
      if (!dobValidation.isValid) {
        return { error: dobValidation.error || "A valid Staff Date of Birth is required." };
      }
      staffDobDate = dobValidation.dateStr ? new Date(`${dobValidation.dateStr}T00:00:00Z`) : null;
    } else {
      const settings = await prisma.birthdaySettings.findUnique({ where: { id: "default" } }).catch(() => null);
      if (settings?.dobRequiredStaff !== false) {
        return { error: "Staff Date of Birth is required." };
      }
    }

    if (password.length < 6) {
      return { error: "Password must be at least 6 characters long." };
    }

    const existingUser = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });

    if (existingUser) {
      return { error: "Email is already in use." };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: "STAFF",
        status: "ACTIVE",
        dateOfBirth: staffDobDate,
        staff: {
          create: {
            designation: jobTitle,
            phone,
            dateOfBirth: staffDobDate,
            joinDate: new Date(),
            isActive: true,
          }
        }
      }
    });

    revalidatePath("/dashboard/admin/users");
    revalidatePath("/dashboard/admin/staff-attendance");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Something went wrong." };
    }
    return { error: "Something went wrong." };
  }
}
