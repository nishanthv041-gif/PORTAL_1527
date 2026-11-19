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
      },
      subjects: {
        include: {
          class: {
            include: {
              _count: {
                select: { students: true }
              }
            }
          }
        }
      }
    }
  });

  if (!teacher) return null;

  const classMap = new Map<string, any>();
  if (teacher.classTeacherOf) {
    classMap.set(teacher.classTeacherOf.id, teacher.classTeacherOf);
  }
  for (const c of teacher.classes) {
    classMap.set(c.id, c);
  }
  if (teacher.subjects) {
    for (const s of teacher.subjects) {
      if (s.class && !classMap.has(s.class.id)) {
        classMap.set(s.class.id, s.class);
      }
    }
  }

  teacher.classes = Array.from(classMap.values());
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
      },
      subjects: {
        include: {
          class: {
            include: {
              students: {
                orderBy: { firstName: 'asc' }
              }
            }
          }
        }
      }
    }
  });

  if (!teacher) return null;

  const classMap = new Map<string, any>();
  if (teacher.classTeacherOf) {
    classMap.set(teacher.classTeacherOf.id, teacher.classTeacherOf);
  }
  for (const c of teacher.classes) {
    classMap.set(c.id, c);
  }
  if (teacher.subjects) {
    for (const s of teacher.subjects) {
      if (s.class && !classMap.has(s.class.id)) {
        classMap.set(s.class.id, s.class);
      }
    }
  }

  teacher.classes = Array.from(classMap.values());
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
