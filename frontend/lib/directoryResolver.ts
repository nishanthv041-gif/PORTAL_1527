import { prisma } from "@/backend/db/prisma";

export interface ResolvedTeacherForParent {
  id: string;
  name: string;
  email: string;
  roleDesc: string;
  className: string;
  childName: string;
}

export interface ResolvedParentForTeacher {
  id: string;
  name: string;
  email: string;
  studentName: string;
  className: string;
}

export interface ResolvedClass {
  id: string;
  name: string;
  section: string;
}

/**
 * Resolves all eligible teachers that a parent can communicate with:
 * - Direct class faculty (Class.teacher)
 * - Assigned class teachers (Class.classTeacher)
 * - All subject teachers teaching the classes of the parent's children (Class.subjects.teacher)
 */
export async function getTeachersForParent(parentUserId: string): Promise<ResolvedTeacherForParent[]> {
  try {
    const parent = await prisma.parent.findUnique({
      where: { userId: parentUserId },
      include: {
        children: {
          include: {
            student: {
              include: {
                class: {
                  include: {
                    teacher: { include: { user: { select: { id: true, name: true, email: true } } } },
                    classTeacher: { include: { user: { select: { id: true, name: true, email: true } } } },
                    subjects: {
                      include: {
                        teacher: { include: { user: { select: { id: true, name: true, email: true } } } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!parent) return [];

    const teacherMap = new Map<string, ResolvedTeacherForParent>();

    for (const childRel of parent.children) {
      const student = childRel.student;
      const cls = student.class;
      if (!cls) continue;
      const childFullName = `${student.firstName} ${student.lastName}`.trim();
      const classLabel = `${cls.name} - ${cls.section}`;

      // 1. Direct class faculty
      if (cls.teacher?.user) {
        teacherMap.set(cls.teacher.user.id, {
          id: cls.teacher.user.id,
          name: cls.teacher.user.name || "Teacher",
          email: cls.teacher.user.email || "",
          roleDesc: `Class Faculty (${classLabel})`,
          className: classLabel,
          childName: childFullName,
        });
      }

      // 2. Official Class Teacher
      if (cls.classTeacher?.user) {
        teacherMap.set(cls.classTeacher.user.id, {
          id: cls.classTeacher.user.id,
          name: cls.classTeacher.user.name || "Class Teacher",
          email: cls.classTeacher.user.email || "",
          roleDesc: `Class Teacher (${classLabel})`,
          className: classLabel,
          childName: childFullName,
        });
      }

      // 3. Subject Teachers
      if (cls.subjects) {
        for (const subj of cls.subjects) {
          if (subj.teacher?.user) {
            const existing = teacherMap.get(subj.teacher.user.id);
            const subjName = subj.name;
            if (existing) {
              if (!existing.roleDesc.includes(subjName)) {
                existing.roleDesc += `, ${subjName}`;
              }
            } else {
              teacherMap.set(subj.teacher.user.id, {
                id: subj.teacher.user.id,
                name: subj.teacher.user.name || "Subject Teacher",
                email: subj.teacher.user.email || "",
                roleDesc: `${subjName} Teacher (${classLabel})`,
                className: classLabel,
                childName: childFullName,
              });
            }
          }
        }
      }
    }

    return Array.from(teacherMap.values());
  } catch (error) {
    console.error("[getTeachersForParent] Error resolving teachers:", error);
    return [];
  }
}

/**
 * Resolves all eligible parents and classes that a teacher can communicate with:
 * - Direct classes (Teacher.classes)
 * - Class teacher assignment (Teacher.classTeacherOf)
 * - Classes taught via subjects (Teacher.subjects.class)
 */
export async function getParentsForTeacher(teacherUserId: string): Promise<{
  parents: ResolvedParentForTeacher[];
  classes: ResolvedClass[];
}> {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: teacherUserId },
      include: {
        classes: { select: { id: true, name: true, section: true } },
        classTeacherOf: { select: { id: true, name: true, section: true } },
        subjects: {
          include: {
            class: { select: { id: true, name: true, section: true } }
          }
        }
      }
    });

    if (!teacher) return { parents: [], classes: [] };

    const classMap = new Map<string, ResolvedClass>();
    for (const c of teacher.classes) {
      classMap.set(c.id, c);
    }
    if (teacher.classTeacherOf) {
      classMap.set(teacher.classTeacherOf.id, teacher.classTeacherOf);
    }
    for (const s of teacher.subjects) {
      if (s.class) {
        classMap.set(s.class.id, s.class);
      }
    }

    const assignedClasses = Array.from(classMap.values());
    const assignedClassIds = assignedClasses.map(c => c.id);

    if (assignedClassIds.length === 0) {
      return { parents: [], classes: [] };
    }

    const students = await prisma.student.findMany({
      where: { classId: { in: assignedClassIds }, isActive: true },
      include: {
        class: { select: { name: true, section: true } },
        parents: {
          include: {
            parent: {
              include: {
                user: { select: { id: true, name: true, email: true } }
              }
            }
          }
        }
      }
    });

    const parentMap = new Map<string, ResolvedParentForTeacher>();

    for (const st of students) {
      const studentFullName = `${st.firstName} ${st.lastName}`.trim();
      const classLabel = st.class ? `${st.class.name}-${st.class.section}` : "";
      for (const pRel of st.parents) {
        const pUser = pRel.parent?.user;
        if (pUser && !parentMap.has(pUser.id)) {
          parentMap.set(pUser.id, {
            id: pUser.id,
            name: pUser.name || "Parent",
            email: pUser.email || "",
            studentName: studentFullName,
            className: classLabel,
          });
        }
      }
    }

    return {
      parents: Array.from(parentMap.values()),
      classes: assignedClasses
    };
  } catch (error) {
    console.error("[getParentsForTeacher] Error resolving parents:", error);
    return { parents: [], classes: [] };
  }
}
