import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

export type TeacherClass = {
  classId: string;
  sectionId: string;
  section: string;
  name: string;
  displayName: string;   // e.g. "Class 2 - A" (built ONCE here, never prefixed again in the UI)
  studentCount: number;
  isClassTeacher: boolean;
  subjects?: string[];
};

import { formatClassName } from "./formatClassName";
export { formatClassName };

/**
 * Single source of truth for all classes and sections assigned to a teacher.
 * Returns all assigned classes sorted with the teacher's primary Class Teacher class first.
 */
export async function getTeacherClasses(teacherId: string): Promise<TeacherClass[]> {
  if (!teacherId) return [];

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: {
      classTeacherOf: {
        where: { isActive: true },
        include: {
          students: { where: { isActive: true }, select: { id: true } },
          subjects: { select: { id: true, name: true, teacherId: true } }
        }
      },
      classes: {
        where: { isActive: true },
        include: {
          students: { where: { isActive: true }, select: { id: true } },
          subjects: { select: { id: true, name: true, teacherId: true } }
        }
      },
      subjects: {
        where: { isActive: true },
        include: {
          class: {
            include: {
              students: { where: { isActive: true }, select: { id: true } }
            }
          }
        }
      }
    }
  });

  if (!teacher) return [];

  const classMap = new Map<string, TeacherClass>();

  // 1. Class where teacher is Class Teacher (highest priority, sorted first)
  if (teacher.classTeacherOf) {
    const c = teacher.classTeacherOf;
    classMap.set(c.id, {
      classId: c.id,
      sectionId: c.id,
      section: c.section,
      name: c.name,
      displayName: formatClassName(c.name, c.section),
      studentCount: c.students.length,
      isClassTeacher: true,
      subjects: c.subjects.filter(s => s.teacherId === teacher.id).map(s => s.name)
    });
  }

  // 2. Classes where teacher is assigned via Class.teacherId
  if (teacher.classes) {
    for (const c of teacher.classes) {
      if (!classMap.has(c.id)) {
        // Gracefully honor class teacher role if classTeacherId is not set to another teacher
        const isDesignatedClassTeacher = !c.classTeacherId || c.classTeacherId === teacher.id;
        classMap.set(c.id, {
          classId: c.id,
          sectionId: c.id,
          section: c.section,
          name: c.name,
          displayName: formatClassName(c.name, c.section),
          studentCount: c.students.length,
          isClassTeacher: isDesignatedClassTeacher,
          subjects: c.subjects.filter(s => s.teacherId === teacher.id).map(s => s.name)
        });
      }
    }
  }

  // 3. Classes from subjects taught by this teacher
  if (teacher.subjects) {
    for (const sub of teacher.subjects) {
      if (sub.class && !classMap.has(sub.class.id)) {
        const c = sub.class;
        classMap.set(c.id, {
          classId: c.id,
          sectionId: c.id,
          section: c.section,
          name: c.name,
          displayName: formatClassName(c.name, c.section),
          studentCount: c.students.length,
          isClassTeacher: false,
          subjects: [sub.name]
        });
      } else if (sub.class && classMap.has(sub.class.id)) {
        const existing = classMap.get(sub.class.id)!;
        if (existing.subjects && !existing.subjects.includes(sub.name)) {
          existing.subjects.push(sub.name);
        }
      }
    }
  }

  return Array.from(classMap.values());
}

/**
 * Returns the classes for the currently authenticated teacher from the server session.
 */
export async function getLoggedInTeacherClasses(): Promise<{
  teacherId: string;
  classes: TeacherClass[];
} | null> {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "TEACHER") return null;

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true }
  });

  if (!teacher) return null;

  const classes = await getTeacherClasses(teacher.id);
  return { teacherId: teacher.id, classes };
}

/**
 * Server-side security check: verifies that the teacher has permission to access the class.
 */
export async function verifyTeacherClassAccess(teacherId: string, classId: string): Promise<boolean> {
  if (!teacherId || !classId) return false;
  const classes = await getTeacherClasses(teacherId);
  return classes.some(c => c.classId === classId);
}
