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

    // 1. Collision check
    for (const item of sectionItems) {
      if (item.id) {
        const collision = await prisma.class.findFirst({
          where: {
            name: newName,
            section: item.section,
            isActive: true,
            id: { not: item.id }
          }
        });
        if (collision) {
          return { error: `Class ${newName} - Section ${item.section} already exists.` };
        }
      }
    }

    // 2. Perform updates
    for (const item of sectionItems) {
      if (item.id) {
        await prisma.class.update({
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

// Shared robust cascade deletion for classes without interactive transaction timeouts
async function cascadeDeleteClasses(classIds: string[]) {
  if (!classIds || classIds.length === 0) return;

  // 1. Unlink students enrolled in these classes (preserve students)
  await prisma.student.updateMany({
    where: { classId: { in: classIds } },
    data: { classId: null }
  });

  // 2. Cascade Attendances
  await prisma.attendance.deleteMany({
    where: { classId: { in: classIds } }
  });

  // 3. Cascade Assignments and Submissions
  await prisma.submission.deleteMany({
    where: { assignment: { classId: { in: classIds } } }
  });
  await prisma.assignment.deleteMany({
    where: { classId: { in: classIds } }
  });

  // 4. Cascade Timetable slots (by class or subject belonging to class)
  await prisma.timetable.deleteMany({
    where: {
      OR: [
        { classId: { in: classIds } },
        { subject: { classId: { in: classIds } } }
      ]
    }
  });

  // 5. Cascade Exam Requests
  await prisma.examRequest.deleteMany({
    where: {
      OR: [
        { classId: { in: classIds } },
        { subject: { classId: { in: classIds } } }
      ]
    }
  });

  // 6. Cascade Marks and MarkHistories
  await prisma.markHistory.deleteMany({
    where: {
      mark: {
        OR: [
          { exam: { classId: { in: classIds } } },
          { subject: { classId: { in: classIds } } }
        ]
      }
    }
  });
  await prisma.mark.deleteMany({
    where: {
      OR: [
        { exam: { classId: { in: classIds } } },
        { subject: { classId: { in: classIds } } }
      ]
    }
  });

  // 7. Cascade ReportCards and Exams
  await prisma.reportCard.deleteMany({
    where: { exam: { classId: { in: classIds } } }
  });
  await prisma.exam.deleteMany({
    where: { classId: { in: classIds } }
  });

  // 8. Cascade Class-targeted Announcements
  await prisma.announcement.deleteMany({
    where: { targetType: "CLASS", targetId: { in: classIds } }
  });

  // 9. Cascade Subjects for these classes
  await prisma.subject.deleteMany({
    where: { classId: { in: classIds } }
  });

  // 10. Delete the Classes themselves
  await prisma.class.deleteMany({
    where: { id: { in: classIds } }
  });
}

// Clean cascading deletion for a single class section
export async function deleteClassAction(id: string) {
  try {
    const classData = await prisma.class.findUnique({
      where: { id },
      select: { id: true, name: true, section: true }
    });

    if (!classData) return { error: "Class not found." };

    await cascadeDeleteClasses([id]);

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

    await cascadeDeleteClasses(classIds);

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
