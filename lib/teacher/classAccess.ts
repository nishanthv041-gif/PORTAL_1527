import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { getLoggedInTeacherClasses, getTeacherClasses, TeacherClass } from "./getTeacherClasses";
import { prisma } from "@/backend/db/prisma";

export interface ClassTeacherAccessResult {
  teacherId: string;
  userId: string;
  userRole: "ADMIN" | "TEACHER";
  classId: string;
  className: string;
  isClassTeacher: boolean;
}

export class ClassAccessError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 403) {
    super(message);
    this.name = "ClassAccessError";
    this.statusCode = statusCode;
  }
}

/**
 * Server-side authorization authority:
 * Verifies that the current user has Class Teacher permission for the specified classId.
 * - Admin: Allowed for any valid class.
 * - Teacher: Allowed ONLY if designated as the Class Teacher for this class.
 * - Subject-only teachers / parents / students: Blocked with 403.
 */
export async function requireClassTeacherAccess(classId: string): Promise<ClassTeacherAccessResult> {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    throw new ClassAccessError("Unauthorized: Session required.", 401);
  }

  const userRole = session.user.role as "ADMIN" | "TEACHER";

  // 1. Admin access
  if (userRole === "ADMIN") {
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, name: true, section: true },
    });
    if (!cls) {
      throw new ClassAccessError("Class not found.", 404);
    }
    return {
      teacherId: "admin",
      userId: session.user.id,
      userRole: "ADMIN",
      classId: cls.id,
      className: `${cls.name} - ${cls.section}`,
      isClassTeacher: true,
    };
  }

  // 2. Teacher access
  if (userRole === "TEACHER") {
    const teacherInfo = await getLoggedInTeacherClasses();
    if (!teacherInfo) {
      throw new ClassAccessError("Teacher profile not found.", 403);
    }

    const assigned = teacherInfo.classes.find(
      (c) => c.classId === classId && c.isClassTeacher
    );

    if (!assigned) {
      throw new ClassAccessError(
        "Forbidden: You are not designated as the Class Teacher for this class.",
        403
      );
    }

    return {
      teacherId: teacherInfo.teacherId,
      userId: session.user.id,
      userRole: "TEACHER",
      classId: assigned.classId,
      className: assigned.displayName,
      isClassTeacher: true,
    };
  }

  // 3. Other roles
  throw new ClassAccessError("Forbidden: Class Teacher or Admin access required.", 403);
}

/**
 * Returns all classes where the logged-in user is Class Teacher (or all classes if Admin).
 */
export async function getAuthorizedBirthdayClasses(): Promise<{
  role: "ADMIN" | "TEACHER";
  classes: TeacherClass[];
  selectedClassId: string | null;
}> {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    throw new ClassAccessError("Unauthorized.", 401);
  }

  if (session.user.role === "ADMIN") {
    const allDbClasses = await prisma.class.findMany({
      where: { isActive: true },
      include: {
        students: { where: { isActive: true }, select: { id: true } },
      },
      orderBy: [{ name: "asc" }, { section: "asc" }],
    });

    const formatted: TeacherClass[] = allDbClasses.map((c) => ({
      classId: c.id,
      sectionId: c.id,
      section: c.section,
      name: c.name,
      displayName: `${c.name} - ${c.section}`,
      studentCount: c.students.length,
      isClassTeacher: true,
    }));

    return {
      role: "ADMIN",
      classes: formatted,
      selectedClassId: formatted[0]?.classId || null,
    };
  }

  if (session.user.role === "TEACHER") {
    const teacherInfo = await getLoggedInTeacherClasses();
    if (!teacherInfo) {
      return { role: "TEACHER", classes: [], selectedClassId: null };
    }

    // Filter ONLY classes where this teacher is the Class Teacher
    const classTeacherClasses = teacherInfo.classes.filter((c) => c.isClassTeacher);

    return {
      role: "TEACHER",
      classes: classTeacherClasses,
      selectedClassId: classTeacherClasses[0]?.classId || null,
    };
  }

  return { role: "TEACHER", classes: [], selectedClassId: null };
}

