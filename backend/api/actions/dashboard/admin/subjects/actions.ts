"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";

export async function createSubjectAction(formData: FormData) {
  try {
    const name = (formData.get("name") as string)?.trim();
    const code = (formData.get("code") as string)?.trim();
    const { getSystemSetting } = await import("@/backend/api/actions/dashboard/admin/settings/actions");
    const defaultPassSetting = await getSystemSetting("DEFAULT_PASSING_MARKS", "40");
    
    const maxMarks = parseInt(formData.get("maxMarks") as string || "100", 10);
    const passMarks = parseInt(formData.get("passMarks") as string || defaultPassSetting, 10);
    
    // Per-class teacher assignments: [{ classId: string, teacherId?: string | null }]
    const classAssignmentsRaw = formData.get("classAssignments") as string;
    let assignments: { classId: string; teacherId?: string | null }[] = [];

    if (classAssignmentsRaw) {
      try {
        assignments = JSON.parse(classAssignmentsRaw);
      } catch (err) {
        console.error("Failed to parse classAssignments JSON:", err);
      }
    }

    if (assignments.length === 0) {
      const classIdsInput = formData.get("classIds") as string;
      const defaultTeacherId = (formData.get("teacherId") as string) || null;
      const classIds = classIdsInput ? classIdsInput.split(',').filter(Boolean) : [];
      assignments = classIds.map(cid => ({ classId: cid, teacherId: defaultTeacherId }));
    }

    if (!name || !code || assignments.length === 0) {
      return { error: "Subject Name, Code, and at least one Class are required." };
    }

    // Create a subject document for each selected class with its assigned staff
    for (const item of assignments) {
      const { classId, teacherId } = item;
      if (!classId) continue;

      // Check if it already exists for this class
      const exists = await prisma.subject.findFirst({
        where: { name, classId }
      });

      if (exists) {
        return { error: `Subject "${name}" already exists for one of the selected classes.` };
      }

      await prisma.subject.create({
        data: {
          name,
          code,
          maxMarks,
          passMarks,
          classId,
          teacherId: teacherId || null
        }
      });
    }

    revalidatePath("/dashboard/admin/subjects");
    return { success: true, message: "Subjects created successfully." };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to create subject." };
    }
    return { error: "Failed to create subject." };
  }
}

export async function updateSubjectGroupAction(formData: FormData) {
  try {
    const originalName = (formData.get("originalName") as string)?.trim();
    const newName = (formData.get("name") as string)?.trim();
    const code = (formData.get("code") as string)?.trim();
    const maxMarks = parseInt(formData.get("maxMarks") as string || "100", 10);
    const passMarks = parseInt(formData.get("passMarks") as string || "35", 10);

    const classAssignmentsRaw = formData.get("classAssignments") as string;
    let assignments: { classId: string; teacherId?: string | null }[] = [];

    if (classAssignmentsRaw) {
      try {
        assignments = JSON.parse(classAssignmentsRaw);
      } catch (err) {
        console.error("Failed to parse classAssignments JSON:", err);
      }
    }

    if (assignments.length === 0) {
      const classIdsInput = formData.get("classIds") as string;
      const defaultTeacherId = (formData.get("teacherId") as string) || null;
      const classIds = classIdsInput ? classIdsInput.split(',').filter(Boolean) : [];
      assignments = classIds.map(cid => ({ classId: cid, teacherId: defaultTeacherId }));
    }

    if (!originalName || !newName || !code || assignments.length === 0) {
      return { error: "Subject Name, Code, and at least one Class are required." };
    }

    // Check if newName conflicts with an existing different subject
    if (newName.toLowerCase() !== originalName.toLowerCase()) {
      const conflict = await prisma.subject.findFirst({
        where: { 
          name: { equals: newName, mode: "insensitive" },
          NOT: { name: originalName }
        }
      });
      if (conflict) {
        return { error: `A subject named "${newName}" already exists.` };
      }
    }

    // Fetch existing subject records for originalName
    const existingRecords = await prisma.subject.findMany({
      where: { name: originalName }
    });

    const selectedClassIds = new Set(assignments.map(a => a.classId));

    // 1. Remove classes no longer selected (batched)
    const toRemove = existingRecords.filter(r => !selectedClassIds.has(r.classId));
    const toRemoveIds = toRemove.map(r => r.id);

    if (toRemoveIds.length > 0) {
      const marks = await prisma.mark.findMany({
        where: { subjectId: { in: toRemoveIds } },
        select: { id: true }
      });
      const markIds = marks.map(m => m.id);
      if (markIds.length > 0) {
        await prisma.markHistory.deleteMany({
          where: { markId: { in: markIds } }
        });
        await prisma.mark.deleteMany({
          where: { id: { in: markIds } }
        });
      }

      await prisma.timetable.deleteMany({
        where: { subjectId: { in: toRemoveIds } }
      });

      await prisma.examRequest.deleteMany({
        where: { subjectId: { in: toRemoveIds } }
      });

      await prisma.subject.deleteMany({
        where: { id: { in: toRemoveIds } }
      });
    }

    // 2. Update existing class records or insert newly assigned classes in parallel
    await Promise.all(
      assignments.map(async (item) => {
        const { classId, teacherId } = item;
        const existing = existingRecords.find(r => r.classId === classId);

        if (existing) {
          const updatedSubject = await prisma.subject.update({
            where: { id: existing.id },
            data: {
              name: newName,
              code,
              maxMarks,
              passMarks,
              teacherId: teacherId || null,
              isActive: true,
            }
          });

          // If assigned staff changed, transfer active home work ownership for this subject to the new staff
          if (teacherId) {
            await prisma.assignment.updateMany({
              where: { subjectId: existing.id },
              data: { teacherId }
            });
          }

          return updatedSubject;
        } else {
          return prisma.subject.create({
            data: {
              name: newName,
              code,
              maxMarks,
              passMarks,
              classId,
              teacherId: teacherId || null,
              isActive: true,
            }
          });
        }
      })
    );

    revalidatePath("/dashboard/admin/subjects");
    revalidatePath(`/dashboard/admin/subjects/${encodeURIComponent(newName)}`);
    if (newName !== originalName) {
      revalidatePath(`/dashboard/admin/subjects/${encodeURIComponent(originalName)}`);
    }
    revalidatePath("/dashboard/admin/timetable");

    return { success: true, message: "Subject updated successfully.", newName };
  } catch (error: unknown) {
    console.error("Update subject error:", error);
    if (error instanceof Error) {
      return { error: error.message || "Failed to update subject." };
    }
    return { error: "Failed to update subject." };
  }
}

export async function deactivateSubject(id: string) {
  try {
    await prisma.subject.update({
      where: { id },
      data: { isActive: false }
    });
    revalidatePath("/dashboard/admin/subjects");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to deactivate subject." };
  }
}

export async function deleteSubject(id: string) {
  try {
    const subject = await prisma.subject.findUnique({
      where: { id },
      select: { id: true, name: true }
    });

    if (!subject) return { error: "Subject not found." };

    // 1. Cascade Marks & MarkHistory
    const marks = await prisma.mark.findMany({
      where: { subjectId: id },
      select: { id: true }
    });
    const markIds = marks.map(m => m.id);

    if (markIds.length > 0) {
      await prisma.markHistory.deleteMany({
        where: { markId: { in: markIds } }
      });
      await prisma.mark.deleteMany({
        where: { id: { in: markIds } }
      });
    }

    // 2. Cascade Timetable slots
    await prisma.timetable.deleteMany({
      where: { subjectId: id }
    });

    // 3. Cascade Exam Requests
    await prisma.examRequest.deleteMany({
      where: { subjectId: id }
    });

    // 4. Delete Subject record
    await prisma.subject.delete({
      where: { id }
    });

    revalidatePath("/dashboard/admin/subjects");
    revalidatePath("/dashboard/admin/timetable");
    return { success: true, message: "Subject deleted successfully." };
  } catch (error: unknown) {
    console.error("Delete subject error:", error);
    if (error instanceof Error) {
      return { error: error.message || "Failed to delete subject." };
    }
    return { error: "Failed to delete subject." };
  }
}

export async function deleteSubjectGroupByName(name: string) {
  try {
    const subjects = await prisma.subject.findMany({
      where: { name },
      select: { id: true }
    });

    if (subjects.length === 0) return { error: "Subject not found." };
    const subjectIds = subjects.map(s => s.id);

    // 1. Cascade Marks & MarkHistory
    const marks = await prisma.mark.findMany({
      where: { subjectId: { in: subjectIds } },
      select: { id: true }
    });
    const markIds = marks.map(m => m.id);

    if (markIds.length > 0) {
      await prisma.markHistory.deleteMany({
        where: { markId: { in: markIds } }
      });
      await prisma.mark.deleteMany({
        where: { id: { in: markIds } }
      });
    }

    // 2. Cascade Timetable slots
    await prisma.timetable.deleteMany({
      where: { subjectId: { in: subjectIds } }
    });

    // 3. Cascade Exam Requests
    await prisma.examRequest.deleteMany({
      where: { subjectId: { in: subjectIds } }
    });

    // 4. Delete all subjects with this name
    await prisma.subject.deleteMany({
      where: { id: { in: subjectIds } }
    });

    revalidatePath("/dashboard/admin/subjects");
    revalidatePath("/dashboard/admin/timetable");
    return { success: true, message: `Subject "${name}" deleted successfully.` };
  } catch (error: unknown) {
    console.error("Delete subject group error:", error);
    if (error instanceof Error) {
      return { error: error.message || "Failed to delete subject." };
    }
    return { error: "Failed to delete subject." };
  }
}

export async function assignSubjectTeacher(subjectId: string, teacherId: string) {
  try {
    if (!teacherId) {
      await prisma.subject.update({
        where: { id: subjectId },
        data: {
          teacher: {
            disconnect: true
          }
        }
      });
    } else {
      await prisma.subject.update({
        where: { id: subjectId },
        data: {
          teacher: {
            connect: { id: teacherId }
          }
        }
      });

      // Transfer home work control for this subject to the newly assigned teacher immediately
      await prisma.assignment.updateMany({
        where: { subjectId: subjectId },
        data: { teacherId: teacherId }
      });
    }
    revalidatePath("/dashboard/admin/subjects");
    revalidatePath("/dashboard/teacher/assignments");
    revalidatePath("/dashboard/teacher/homework");
    revalidatePath("/dashboard/teacher/classes");
    revalidatePath("/dashboard/parent/assignments");
    revalidatePath("/dashboard/parent/homework");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to assign teacher." };
    }
    return { error: "Failed to assign teacher." };
  }
}

export async function importSubjectsFromCsvAction(formData: FormData) {
  try {
    const file = formData.get("file") as File | null;
    if (!file) {
      return { error: "No file provided." };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { error: "Spreadsheet contains no sheets." };
    }

    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
    if (!rows || rows.length === 0) {
      return { error: "Spreadsheet is empty." };
    }

    const classes = await prisma.class.findMany({ where: { isActive: true } });
    const teachers = await prisma.teacher.findMany({
      where: { isActive: true },
      include: { user: true }
    });

    let createdCount = 0;
    for (const r of rows) {
      const norm: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) {
        norm[k.toLowerCase().replace(/[\s_-]/g, "")] = String(v).trim();
      }

      const name = norm.name || norm.subjectname || "";
      const code = (norm.code || norm.subjectcode || (name ? name.substring(0, 3).toUpperCase() : "")).trim();
      const maxMarks = parseInt(norm.maxmarks || norm.max || "100", 10);
      const passMarks = parseInt(norm.passmarks || norm.pass || "35", 10);
      const className = norm.class || norm.classname || "";
      const teacherEmail = norm.teacheremail || norm.email || "";

      if (!name) continue;

      // Match class
      const targetClass = classes.find(c => {
        const full = `${c.name} - Section ${c.section}`.toLowerCase();
        const short = `${c.name} ${c.section}`.toLowerCase();
        const clean = className.toLowerCase();
        return full.includes(clean) || short.includes(clean) || clean.includes(c.name.toLowerCase());
      }) || classes[0];

      if (!targetClass) continue;

      // Match teacher
      const targetTeacher = teacherEmail ? teachers.find(t => t.user.email.toLowerCase() === teacherEmail.toLowerCase()) : null;

      // Check if subject exists for class
      const existing = await prisma.subject.findFirst({
        where: { name, classId: targetClass.id }
      });

      if (existing) {
        if (targetTeacher) {
          await prisma.subject.update({
            where: { id: existing.id },
            data: { teacherId: targetTeacher.id }
          });
        }
      } else {
        await prisma.subject.create({
          data: {
            name,
            code,
            maxMarks,
            passMarks,
            classId: targetClass.id,
            teacherId: targetTeacher?.id || null
          }
        });
        createdCount++;
      }
    }

    revalidatePath("/dashboard/admin/subjects");
    return { success: true, count: createdCount };
  } catch (error) {
    console.error("Import subjects error:", error);
    if (error instanceof Error) {
      return { error: error.message || "Failed to import subjects." };
    }
    return { error: "Failed to import subjects." };
  }
}
