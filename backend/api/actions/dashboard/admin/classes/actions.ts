"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";

export async function createClassAction(formData: FormData) {
  try {
    const name = (formData.get("name") as string)?.trim();
    const maxStrengthDefault = parseInt((formData.get("maxStrength") as string) || "40", 10);
    
    // Per-section teacher assignment: JSON string of [{ section: string, teacherId?: string | null, maxStrength?: number }]
    const sectionAssignmentsRaw = formData.get("sectionAssignments") as string;
    let assignments: { section: string; teacherId?: string | null; maxStrength?: number }[] = [];

    if (sectionAssignmentsRaw) {
      try {
        assignments = JSON.parse(sectionAssignmentsRaw);
      } catch (err) {
        console.error("Failed to parse sectionAssignments JSON:", err);
      }
    }

    if (assignments.length === 0) {
      const sectionsInput = formData.getAll("sections") as string[];
      let sections: string[] = [];
      if (sectionsInput.length === 1 && sectionsInput[0].includes(',')) {
        sections = sectionsInput[0].split(',').map(s => s.trim());
      } else if (sectionsInput.length > 0) {
        sections = sectionsInput.map(s => s.trim()).filter(Boolean);
      }
      const fallbackTeacherId = (formData.get("teacherId") as string) || null;
      assignments = sections.map(section => ({ section, teacherId: fallbackTeacherId, maxStrength: maxStrengthDefault }));
    }

    if (!name || assignments.length === 0) {
      return { error: "Class name and at least one section are required." };
    }

    // Create a class document for each section with its assigned class teacher
    for (const item of assignments) {
      const section = item.section?.trim();
      if (!section) continue;

      const strength = item.maxStrength || maxStrengthDefault;
      const teacherId = item.teacherId || null;

      // Check if exists
      const exists = await prisma.class.findFirst({
        where: { name, section, isActive: true }
      });

      if (exists) {
        return { error: `Class ${name} - Section ${section} already exists.` };
      }

      await prisma.class.create({
        data: {
          name,
          section,
          maxStrength: strength,
          teacherId: teacherId,
          isActive: true
        }
      });
    }

    revalidatePath("/dashboard/admin/classes");
    return { success: true, message: "Classes created successfully." };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to process request." };
    }
    return { error: "Failed to process request." };
  }
}

export async function editClassAction(formData: FormData) {
  try {
    const id = formData.get("id") as string;
    const name = (formData.get("name") as string)?.trim();
    const section = (formData.get("section") as string)?.trim();
    const maxStrength = parseInt((formData.get("maxStrength") as string) || "40", 10);
    const teacherId = (formData.get("teacherId") as string) || null;

    if (!id || !name || !section) {
      return { error: "Class ID, Name and Section are required." };
    }

    const exists = await prisma.class.findFirst({
      where: { name, section, isActive: true, id: { not: id } }
    });

    if (exists) {
      return { error: `Class ${name} - Section ${section} already exists.` };
    }

    await prisma.class.update({
      where: { id },
      data: {
        name,
        section,
        maxStrength,
        teacherId: teacherId ? teacherId : null
      }
    });

    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/admin/classes");
    return { success: true, message: "Class updated successfully." };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to edit class." };
    }
    return { error: "Failed to edit class." };
  }
}

export async function editClassGroupAction(formData: FormData) {
  try {
    const oldName = (formData.get("oldName") as string)?.trim();
    const newName = (formData.get("newName") as string)?.trim();
    const sectionsJson = formData.get("sections") as string;

    if (!oldName || !newName) {
      return { error: "Class names are required." };
    }

    let sectionItems: { id: string; section: string; maxStrength: number; teacherId: string | null }[] = [];
    if (sectionsJson) {
      try {
        sectionItems = JSON.parse(sectionsJson);
      } catch (err) {
        console.error("Failed to parse sectionsJson:", err);
      }
    }

    await prisma.$transaction(async (tx) => {
      // Update each section
      for (const item of sectionItems) {
        if (item.id) {
          // Check for collision
          const collision = await tx.class.findFirst({
            where: {
              name: newName,
              section: item.section,
              isActive: true,
              id: { not: item.id }
            }
          });
          if (collision) {
            throw new Error(`Class ${newName} - Section ${item.section} already exists.`);
          }

          await tx.class.update({
            where: { id: item.id },
            data: {
              name: newName,
              section: item.section,
              maxStrength: item.maxStrength || 40,
              teacherId: item.teacherId || null
            }
          });
        }
      }
    });

    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/admin/classes");
    return { success: true, message: "Class details updated successfully." };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to update class details." };
    }
    return { error: "Failed to update class details." };
  }
}

export async function deactivateClassAction(id: string) {
  try {
    await prisma.class.update({
      where: { id },
      data: { isActive: false }
    });
    revalidatePath("/dashboard/admin/classes");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to deactivate class." };
  }
}

// Clean cascading deletion for a single class section
export async function deleteClassAction(id: string) {
  try {
    const classData = await prisma.class.findUnique({
      where: { id },
      select: { id: true, name: true, section: true }
    });

    if (!classData) return { error: "Class not found." };

    await prisma.$transaction(async (tx) => {
      // 1. Unlink students enrolled in this class so they are preserved
      await tx.student.updateMany({
        where: { classId: id },
        data: { classId: null }
      });

      // 2. Cascade Attendances
      await tx.attendance.deleteMany({
        where: { classId: id }
      });

      // 3. Cascade Assignments and Submissions
      const assignments = await tx.assignment.findMany({
        where: { classId: id },
        select: { id: true }
      });
      const assignmentIds = assignments.map(a => a.id);
      if (assignmentIds.length > 0) {
        await tx.submission.deleteMany({
          where: { assignmentId: { in: assignmentIds } }
        });
        await tx.assignment.deleteMany({
          where: { classId: id }
        });
      }

      // 4. Cascade Exam Requests
      await tx.examRequest.deleteMany({
        where: { classId: id }
      });

      // 5. Cascade Exams, Marks, and ReportCards
      const exams = await tx.exam.findMany({
        where: { classId: id },
        select: { id: true }
      });
      const examIds = exams.map(e => e.id);
      if (examIds.length > 0) {
        const marks = await tx.mark.findMany({
          where: { examId: { in: examIds } },
          select: { id: true }
        });
        const markIds = marks.map(m => m.id);
        if (markIds.length > 0) {
          await tx.markHistory.deleteMany({
            where: { markId: { in: markIds } }
          });
          await tx.mark.deleteMany({
            where: { id: { in: markIds } }
          });
        }
        await tx.reportCard.deleteMany({
          where: { examId: { in: examIds } }
        });
        await tx.exam.deleteMany({
          where: { classId: id }
        });
      }

      // 6. Cascade Timetable slots
      await tx.timetable.deleteMany({
        where: { classId: id }
      });

      // 7. Cascade Subjects for this class
      const subjects = await tx.subject.findMany({
        where: { classId: id },
        select: { id: true }
      });
      const subjectIds = subjects.map(s => s.id);
      if (subjectIds.length > 0) {
        const subMarks = await tx.mark.findMany({
          where: { subjectId: { in: subjectIds } },
          select: { id: true }
        });
        const subMarkIds = subMarks.map(m => m.id);
        if (subMarkIds.length > 0) {
          await tx.markHistory.deleteMany({
            where: { markId: { in: subMarkIds } }
          });
          await tx.mark.deleteMany({
            where: { id: { in: subMarkIds } }
          });
        }
        await tx.timetable.deleteMany({
          where: { subjectId: { in: subjectIds } }
        });
        await tx.examRequest.deleteMany({
          where: { subjectId: { in: subjectIds } }
        });
        await tx.subject.deleteMany({
          where: { id: { in: subjectIds } }
        });
      }

      // 8. Delete the Class itself
      await tx.class.delete({
        where: { id }
      });
    });

    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/admin/classes");
    return { success: true, message: `Class ${classData.name} - Section ${classData.section} deleted successfully.` };
  } catch (error: unknown) {
    console.error("Delete class error:", error);
    if (error instanceof Error) {
      return { error: error.message || "Failed to delete class." };
    }
    return { error: "Failed to delete class." };
  }
}

// Clean cascading deletion for an entire class group by name (Class-wise delete)
export async function deleteClassGroupByNameAction(className: string) {
  try {
    const classes = await prisma.class.findMany({
      where: { name: className },
      select: { id: true, name: true, section: true }
    });

    if (classes.length === 0) return { error: "Class not found." };
    const classIds = classes.map(c => c.id);

    await prisma.$transaction(async (tx) => {
      // 1. Unlink students
      await tx.student.updateMany({
        where: { classId: { in: classIds } },
        data: { classId: null }
      });

      // 2. Cascade Attendances
      await tx.attendance.deleteMany({
        where: { classId: { in: classIds } }
      });

      // 3. Cascade Assignments and Submissions
      const assignments = await tx.assignment.findMany({
        where: { classId: { in: classIds } },
        select: { id: true }
      });
      const assignmentIds = assignments.map(a => a.id);
      if (assignmentIds.length > 0) {
        await tx.submission.deleteMany({
          where: { assignmentId: { in: assignmentIds } }
        });
        await tx.assignment.deleteMany({
          where: { classId: { in: classIds } }
        });
      }

      // 4. Cascade Exam Requests
      await tx.examRequest.deleteMany({
        where: { classId: { in: classIds } }
      });

      // 5. Cascade Exams, Marks, and ReportCards
      const exams = await tx.exam.findMany({
        where: { classId: { in: classIds } },
        select: { id: true }
      });
      const examIds = exams.map(e => e.id);
      if (examIds.length > 0) {
        const marks = await tx.mark.findMany({
          where: { examId: { in: examIds } },
          select: { id: true }
        });
        const markIds = marks.map(m => m.id);
        if (markIds.length > 0) {
          await tx.markHistory.deleteMany({
            where: { markId: { in: markIds } }
          });
          await tx.mark.deleteMany({
            where: { id: { in: markIds } }
          });
        }
        await tx.reportCard.deleteMany({
          where: { examId: { in: examIds } }
        });
        await tx.exam.deleteMany({
          where: { classId: { in: classIds } }
        });
      }

      // 6. Cascade Timetable slots
      await tx.timetable.deleteMany({
        where: { classId: { in: classIds } }
      });

      // 7. Cascade Subjects
      const subjects = await tx.subject.findMany({
        where: { classId: { in: classIds } },
        select: { id: true }
      });
      const subjectIds = subjects.map(s => s.id);
      if (subjectIds.length > 0) {
        const subMarks = await tx.mark.findMany({
          where: { subjectId: { in: subjectIds } },
          select: { id: true }
        });
        const subMarkIds = subMarks.map(m => m.id);
        if (subMarkIds.length > 0) {
          await tx.markHistory.deleteMany({
            where: { markId: { in: subMarkIds } }
          });
          await tx.mark.deleteMany({
            where: { id: { in: subMarkIds } }
          });
        }
        await tx.timetable.deleteMany({
          where: { subjectId: { in: subjectIds } }
        });
        await tx.examRequest.deleteMany({
          where: { subjectId: { in: subjectIds } }
        });
        await tx.subject.deleteMany({
          where: { id: { in: subjectIds } }
        });
      }

      // 8. Delete the Classes
      await tx.class.deleteMany({
        where: { id: { in: classIds } }
      });
    });

    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/admin/classes");
    return { success: true, message: `Class "${className}" and all its sections deleted successfully.` };
  } catch (error: unknown) {
    console.error("Delete class group error:", error);
    if (error instanceof Error) {
      return { error: error.message || "Failed to delete class." };
    }
    return { error: "Failed to delete class." };
  }
}
