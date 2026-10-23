import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        teacher: {
          select: { phone: true }
        },
        parent: {
          select: { phone: true }
        }
      }
    });

    return NextResponse.json(users);
  } catch {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(getAuthOptions());
  
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, email, password, role, phone, status } = body;

    if (!email || !password || !name) {
      return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const createdUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: role || "PARENT",
          status: status || "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true
        }
      });

      if (user.role === "TEACHER") {
        await tx.teacher.create({
          data: {
            userId: user.id,
            phone: phone || null,
          }
        });
      } else if (user.role === "PARENT") {
        await tx.parent.create({
          data: {
            userId: user.id,
            phone: phone || null,
          }
        });
      }

      return user;
    });

    return NextResponse.json(createdUser, { status: 201 });
  } catch (error: unknown) {
    console.error("[UsersAPI] User creation error:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
