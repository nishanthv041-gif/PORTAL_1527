"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

export async function createStaffAction(formData: FormData) {
  try {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const phone = formData.get("phone") as string;
    const jobTitle = formData.get("jobTitle") as string;

    if (!name || !email || !password || !jobTitle) {
      return { error: "Please fill in all required fields." };
    }

    if (password.length < 6) {
      return { error: "Password must be at least 6 characters long." };
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
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
        role: "NON_TEACHING_STAFF",
        status: "ACTIVE",
        staff: {
          create: {
            designation: jobTitle,
            phone,
            joinDate: new Date(),
            isActive: true,
          }
        }
      }
    });

    revalidatePath("/dashboard/admin/users");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Something went wrong." };
    }
    return { error: "Something went wrong." };
  }
}
