import { cache } from "react";
import { prisma } from "@/backend/db/prisma";

async function queryTeacherFromDb(userId: string) {
  return prisma.teacher.findUnique({
    where: { userId },
    include: {
      classes: {
        include: {
          _count: {
            select: { students: true }
          }
        }
      }
    }
  });
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
  return prisma.teacher.findUnique({
    where: { userId },
    include: {
      classes: {
        include: {
          students: {
            orderBy: { firstName: 'asc' }
          }
        }
      }
    }
  });
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
