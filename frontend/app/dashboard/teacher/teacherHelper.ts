import { cache } from "react";
import { prisma } from "@/backend/db/prisma";

async function queryTeacherFromDb(userId: string) {
  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    include: {
      classTeacherOf: {
        include: {
          _count: {
            select: { students: true }
          }
        }
      },
      classes: {
        include: {
          _count: {
            select: { students: true }
          }
        }
      }
    }
  });

  if (!teacher) return null;

  // Merge classTeacherOf into classes if not present
  if (teacher.classTeacherOf) {
    const exists = teacher.classes.some(c => c.id === teacher.classTeacherOf!.id);
    if (!exists) {
      teacher.classes.unshift(teacher.classTeacherOf);
    }
  }

  return teacher;
}

type TeacherWithClasses = NonNullable<Awaited<ReturnType<typeof queryTeacherFromDb>>>;

// 60-second TTL cache for teacher records across tab navigations
const teacherCache = new Map<string, { data: TeacherWithClasses; expiresAt: number }>();

export function invalidateTeacherCache(userId?: string) {
  if (userId) {
    teacherCache.delete(userId);
    teacherWithStudentsCache.delete(userId);
  } else {
    teacherCache.clear();
    teacherWithStudentsCache.clear();
  }
}

export const getTeacherByUserId = cache(async (userId: string) => {
  const now = Date.now();
  const cached = teacherCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const teacher = await queryTeacherFromDb(userId);
  if (teacher) {
    teacherCache.set(userId, { data: teacher, expiresAt: now + 60_000 });
  }

  return teacher;
});

async function queryTeacherWithStudentsFromDb(userId: string) {
  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    include: {
      classTeacherOf: {
        include: {
          students: {
            orderBy: { firstName: 'asc' }
          }
        }
      },
      classes: {
        include: {
          students: {
            orderBy: { firstName: 'asc' }
          }
        }
      }
    }
  });

  if (!teacher) return null;

  if (teacher.classTeacherOf) {
    const exists = teacher.classes.some(c => c.id === teacher.classTeacherOf!.id);
    if (!exists) {
      teacher.classes.unshift(teacher.classTeacherOf);
    }
  }

  return teacher;
}

type TeacherWithStudents = NonNullable<Awaited<ReturnType<typeof queryTeacherWithStudentsFromDb>>>;

const teacherWithStudentsCache = new Map<string, { data: TeacherWithStudents; expiresAt: number }>();

export const getTeacherWithStudents = cache(async (userId: string) => {
  const now = Date.now();
  const cached = teacherWithStudentsCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const teacher = await queryTeacherWithStudentsFromDb(userId);
  if (teacher) {
    teacherWithStudentsCache.set(userId, { data: teacher, expiresAt: now + 60_000 });
  }

  return teacher;
});
