"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { parseAndValidateDob, RoleType } from "@/lib/validations/dob";
import { getSchoolNow } from "@/lib/time";
import { requireClassTeacherAccess } from "@/lib/teacher/classAccess";
import { dispatchImmediateBirthdayWishForPerson } from "@/app/api/internal/cron/birthdays/route";
import { sendUserNotification } from "@/backend/services/push/notificationDispatcher";
import { formatClassName } from "@/lib/teacher/formatClassName";
import * as XLSX from "xlsx";

export interface MissingDobPerson {
  id: string;
  name: string;
  role: "STUDENT" | "TEACHER" | "STAFF" | "ADMIN" | "PARENT" | "DRIVER";
  identifier: string; // Roll number, email, or bus number
  className?: string;
  classId?: string;
  hasPortalAccount: boolean;
}

export async function getMissingDobSummaryAction() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Unauthorized: Admin access required.");
  }

  // 1. Students without DOB
  const missingStudents = await prisma.student.findMany({
    where: { isActive: true, dateOfBirth: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      rollNumber: true,
      admissionNo: true,
      classId: true,
      class: { select: { name: true, section: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalStudents = await prisma.student.count({ where: { isActive: true } });

  // 2. Teachers without DOB
  const missingTeachers = await prisma.teacher.findMany({
    where: { isActive: true, dateOfBirth: null },
    select: {
      id: true,
      user: { select: { id: true, name: true, email: true } },
      phone: true,
    },
  });
  const totalTeachers = await prisma.teacher.count({ where: { isActive: true } });

  // 3. Staff without DOB
  const missingStaff = await prisma.staff.findMany({
    where: { isActive: true, dateOfBirth: null },
    select: {
      id: true,
      designation: true,
      user: { select: { id: true, name: true, email: true } },
      phone: true,
    },
  });
  const totalStaff = await prisma.staff.count({ where: { isActive: true } });

  // 4. Admins without DOB
  const missingAdmins = await prisma.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE", dateOfBirth: null },
    select: { id: true, name: true, email: true },
  });
  const totalAdmins = await prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });

  // 5. Parents without DOB
  const missingParents = await prisma.parent.findMany({
    where: { isActive: true, dateOfBirth: null },
    select: {
      id: true,
      phone: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  const totalParents = await prisma.parent.count({ where: { isActive: true } });

  // 6. Drivers without DOB
  const missingDrivers = await prisma.bus.findMany({
    where: { isActive: true, driverDob: null },
    select: { id: true, busNumber: true, driverName: true, driverPhone: true },
  });
  const totalDrivers = await prisma.bus.count({ where: { isActive: true } });

  const totalPeople = totalStudents + totalTeachers + totalStaff + totalAdmins + totalParents + totalDrivers;
  const totalMissing =
    missingStudents.length +
    missingTeachers.length +
    missingStaff.length +
    missingAdmins.length +
    missingParents.length +
    missingDrivers.length;
  const completedCount = totalPeople - totalMissing;

  const people: MissingDobPerson[] = [
    ...missingStudents.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName || ""}`.trim(),
      role: "STUDENT" as const,
      identifier: s.admissionNo || s.rollNumber,
      className: s.class ? `${s.class.name} - ${s.class.section}` : "Unassigned",
      classId: s.classId || undefined,
      hasPortalAccount: false,
    })),
    ...missingTeachers.map((t) => ({
      id: t.id,
      name: t.user.name,
      role: "TEACHER" as const,
      identifier: t.user.email,
      hasPortalAccount: true,
    })),
    ...missingStaff.map((st) => ({
      id: st.id,
      name: st.user.name,
      role: "STAFF" as const,
      identifier: `${st.designation || "Staff"} (${st.user.email})`,
      hasPortalAccount: true,
    })),
    ...missingAdmins.map((a) => ({
      id: a.id,
      name: a.name,
      role: "ADMIN" as const,
      identifier: a.email,
      hasPortalAccount: true,
    })),
    ...missingParents.map((p) => ({
      id: p.id,
      name: p.user.name,
      role: "PARENT" as const,
      identifier: p.user.email,
      hasPortalAccount: true,
    })),
    ...missingDrivers.map((d) => ({
      id: d.id,
      name: d.driverName,
      role: "DRIVER" as const,
      identifier: `${d.busNumber} (${d.driverPhone})`,
      hasPortalAccount: false,
    })),
  ];

  return {
    totalPeople,
    totalMissing,
    completedCount,
    percentage: totalPeople > 0 ? Math.round((completedCount / totalPeople) * 100) : 100,
    people,
  };
}

export async function updateSinglePersonDobAction(params: {
  personType: "STUDENT" | "TEACHER" | "STAFF" | "ADMIN" | "PARENT" | "DRIVER";
  personId: string;
  dateOfBirth: string;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    return { error: "Unauthorized: Admin access required." };
  }

  const { personType, personId, dateOfBirth } = params;
  const validation = parseAndValidateDob(dateOfBirth, personType as RoleType, true);
  if (!validation.isValid || !validation.dateStr) {
    return { error: validation.error || "Invalid date of birth." };
  }

  const parsedDate = new Date(`${validation.dateStr}T00:00:00Z`);

  try {
    if (personType === "STUDENT") {
      await prisma.student.update({
        where: { id: personId },
        data: { dateOfBirth: parsedDate },
      });
    } else if (personType === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({ where: { id: personId }, select: { userId: true } });
      if (!teacher) return { error: "Teacher not found." };
      await prisma.$transaction([
        prisma.teacher.update({ where: { id: personId }, data: { dateOfBirth: parsedDate } }),
        prisma.user.update({ where: { id: teacher.userId }, data: { dateOfBirth: parsedDate } }),
      ]);
    } else if (personType === "STAFF") {
      const staff = await prisma.staff.findUnique({ where: { id: personId }, select: { userId: true } });
      if (!staff) return { error: "Staff not found." };
      await prisma.$transaction([
        prisma.staff.update({ where: { id: personId }, data: { dateOfBirth: parsedDate } }),
        prisma.user.update({ where: { id: staff.userId }, data: { dateOfBirth: parsedDate } }),
      ]);
    } else if (personType === "ADMIN") {
      await prisma.user.update({
        where: { id: personId },
        data: { dateOfBirth: parsedDate },
      });
    } else if (personType === "PARENT") {
      const parent = await prisma.parent.findUnique({ where: { id: personId }, select: { userId: true } });
      if (!parent) return { error: "Parent not found." };
      await prisma.$transaction([
        prisma.parent.update({ where: { id: personId }, data: { dateOfBirth: parsedDate } }),
        prisma.user.update({ where: { id: parent.userId }, data: { dateOfBirth: parsedDate } }),
      ]);
    } else if (personType === "DRIVER") {
      await prisma.bus.update({
        where: { id: personId },
        data: { driverDob: parsedDate },
      });
    }

    // Audit log entry (safe: never logs the DOB value)
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "UPDATE_DOB",
        targetModel: personType,
        targetId: personId,
        details: JSON.stringify({ updatedBy: session.user.email }),
      },
    }).catch(() => {});

    revalidatePath("/dashboard/admin/birthdays/missing");
    revalidatePath("/dashboard/admin/students");
    revalidatePath("/dashboard/admin/teachers");
    revalidatePath("/dashboard/admin/users");

    return { success: true, dateStr: validation.dateStr };
  } catch (err: any) {
    console.error("Error updating single person DOB:", err?.message);
    return { error: "Failed to update Date of Birth." };
  }
}

export interface BulkDobPreviewItem {
  identifier: string;
  personName: string;
  role: string;
  personId: string;
  oldDob: string;
  newDob: string;
  status: "MATCHED" | "UNMATCHED" | "INVALID_DOB";
  message?: string;
}

export async function previewBulkDobUploadAction(formData: FormData): Promise<{
  success: boolean;
  error?: string;
  items?: BulkDobPreviewItem[];
  totalRows?: number;
  matchedCount?: number;
  unmatchedCount?: number;
  invalidDobCount?: number;
}> {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    return { success: false, error: "Unauthorized: Admin access required." };
  }

  const file = formData.get("file") as File | null;
  if (!file) return { success: false, error: "No file provided." };

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

    if (!rows || rows.length === 0) {
      return { success: false, error: "The uploaded sheet is empty." };
    }

    // Preload identifiers from database
    const students = await prisma.student.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true, admissionNo: true, rollNumber: true, dateOfBirth: true },
    });
    const users = await prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, email: true, role: true, dateOfBirth: true },
    });

    const studentMap = new Map<string, typeof students[0]>();
    students.forEach((s) => {
      if (s.admissionNo) studentMap.set(s.admissionNo.toLowerCase().trim(), s);
      if (s.rollNumber) studentMap.set(s.rollNumber.toLowerCase().trim(), s);
    });

    const userMap = new Map<string, typeof users[0]>();
    users.forEach((u) => {
      if (u.email) userMap.set(u.email.toLowerCase().trim(), u);
    });

    const previewItems: BulkDobPreviewItem[] = [];
    let matchedCount = 0;
    let unmatchedCount = 0;
    let invalidDobCount = 0;

    for (const r of rows) {
      // Find identifier column
      const keys = Object.keys(r);
      const idKey = keys.find((k) => /id|roll|adm|email|username/i.test(k));
      const dobKey = keys.find((k) => /dob|birth|date/i.test(k));

      const rawId = idKey ? String(r[idKey] || "").trim() : "";
      const rawDob = dobKey ? String(r[dobKey] || "").trim() : "";

      if (!rawId) continue;

      const normalizedId = rawId.toLowerCase();
      const matchedStudent = studentMap.get(normalizedId);
      const matchedUser = userMap.get(normalizedId);

      if (!matchedStudent && !matchedUser) {
        unmatchedCount++;
        previewItems.push({
          identifier: rawId,
          personName: "Not found",
          role: "UNKNOWN",
          personId: "",
          oldDob: "N/A",
          newDob: rawDob,
          status: "UNMATCHED",
          message: "No student or user found matching this identifier.",
        });
        continue;
      }

      const val = parseAndValidateDob(rawDob, (matchedStudent ? "STUDENT" : matchedUser?.role as any) || "STUDENT", true);
      if (!val.isValid || !val.dateStr) {
        invalidDobCount++;
        previewItems.push({
          identifier: rawId,
          personName: matchedStudent ? `${matchedStudent.firstName} ${matchedStudent.lastName || ""}` : matchedUser!.name,
          role: matchedStudent ? "STUDENT" : matchedUser!.role,
          personId: matchedStudent ? matchedStudent.id : matchedUser!.id,
          oldDob: matchedStudent?.dateOfBirth ? matchedStudent.dateOfBirth.toISOString().split("T")[0] : "Blank",
          newDob: rawDob,
          status: "INVALID_DOB",
          message: val.error || "Invalid date format.",
        });
        continue;
      }

      matchedCount++;
      previewItems.push({
        identifier: rawId,
        personName: matchedStudent ? `${matchedStudent.firstName} ${matchedStudent.lastName || ""}` : matchedUser!.name,
        role: matchedStudent ? "STUDENT" : matchedUser!.role,
        personId: matchedStudent ? matchedStudent.id : matchedUser!.id,
        oldDob: matchedStudent?.dateOfBirth
          ? matchedStudent.dateOfBirth.toISOString().split("T")[0]
          : matchedUser?.dateOfBirth
          ? matchedUser.dateOfBirth.toISOString().split("T")[0]
          : "Blank",
        newDob: val.dateStr,
        status: "MATCHED",
      });
    }

    return {
      success: true,
      items: previewItems,
      totalRows: rows.length,
      matchedCount,
      unmatchedCount,
      invalidDobCount,
    };
  } catch (err: any) {
    console.error("Bulk DOB preview error:", err?.message);
    return { success: false, error: "Failed to read Excel workbook." };
  }
}

export async function commitBulkDobUpdatesAction(items: Array<{ personId: string; role: string; newDob: string }>) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    return { error: "Unauthorized: Admin access required." };
  }

  let updatedCount = 0;

  for (const item of items) {
    try {
      const parsed = new Date(`${item.newDob}T00:00:00Z`);
      if (item.role === "STUDENT") {
        await prisma.student.update({
          where: { id: item.personId },
          data: { dateOfBirth: parsed },
        });
      } else {
        await prisma.user.update({
          where: { id: item.personId },
          data: { dateOfBirth: parsed },
        });
        if (item.role === "TEACHER") {
          await prisma.teacher.updateMany({ where: { userId: item.personId }, data: { dateOfBirth: parsed } });
        } else if (item.role === "STAFF") {
          await prisma.staff.updateMany({ where: { userId: item.personId }, data: { dateOfBirth: parsed } });
        } else if (item.role === "PARENT") {
          await prisma.parent.updateMany({ where: { userId: item.personId }, data: { dateOfBirth: parsed } });
        }
      }
      updatedCount++;
    } catch (e) {
      console.error(`Failed to update DOB for ${item.personId}:`, e);
    }
  }

  revalidatePath("/dashboard/admin/birthdays/missing");
  return { success: true, updatedCount };
}

export async function getBirthdaySettingsAction() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Unauthorized.");
  }

  let settings = await prisma.birthdaySettings.findUnique({
    where: { id: "default" },
  });

  if (!settings) {
    settings = await prisma.birthdaySettings.create({
      data: { id: "default" },
    });
  }

  return settings;
}

export async function updateBirthdaySettingsAction(data: any) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    return { error: "Unauthorized: Admin privileges required." };
  }

  try {
    const updated = await prisma.birthdaySettings.upsert({
      where: { id: "default" },
      create: {
        ...data,
        id: "default",
        updatedBy: session.user.email,
      },
      update: {
        ...data,
        updatedBy: session.user.email,
      },
    });

    revalidatePath("/dashboard/admin/settings/birthdays");
    return { success: true, settings: updated };
  } catch (err: any) {
    return { error: err?.message || "Failed to save Birthday Settings." };
  }
}

export async function sendTestBirthdayWishAction() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return { error: "Session required." };
  }

  try {
    const notif = await prisma.notification.create({
      data: {
        userId: session.user.id,
        title: `Happy Birthday, ${session.user.name || "Administrator"}! 🎂`,
        content: `Dear ${session.user.name || "Administrator"}, SRT School wishes you a very happy birthday and a wonderful year ahead! - SRT School (Test Sample)`,
        type: "BIRTHDAY",
        category: "GENERAL",
        priority: "NORMAL",
        link: "/dashboard/admin",
        isRead: false,
      },
    });

    return { success: true, notificationId: notif.id };
  } catch (err: any) {
    return { error: err?.message || "Failed to dispatch test birthday wish." };
  }
}

export async function getBirthdayDashboardDataAction() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Unauthorized: Admin access required.");
  }

  const schoolNow = getSchoolNow();
  const dateString = `${schoolNow.year}-${String(schoolNow.month).padStart(2, "0")}-${String(schoolNow.day).padStart(2, "0")}`;
  const recentRuns = await prisma.birthdayJobRun.findMany({
    take: 7,
    orderBy: { runAt: "desc" },
  });

  // Check CRON_SECRET configured
  const hasCronSecret = Boolean(process.env.CRON_SECRET);

  return {
    schoolNow: {
      ...schoolNow,
      dateString,
    },
    hasCronSecret,
    recentRuns,
  };
}

// ============================================================================
// CLASS TEACHER & ADMIN: CLASS MISSING DOB STUDIO ACTIONS
// ============================================================================

export interface ClassStudentDobItem {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  rollNumber: string;
  admissionNo: string;
  dateOfBirth: string | null; // YYYY-MM-DD
  hasDob: boolean;
  parentName: string;
  parentPhone: string | null;
  hasPortalAccount: boolean;
}

export async function getClassMissingDobSummaryAction(classId: string) {
  const access = await requireClassTeacherAccess(classId);

  const [students, settings] = await Promise.all([
    prisma.student.findMany({
      where: { classId, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        rollNumber: true,
        admissionNo: true,
        dateOfBirth: true,
        parents: {
          take: 1,
          include: {
            parent: {
              include: {
                user: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: [{ rollNumber: "asc" }, { firstName: "asc" }],
    }),
    prisma.birthdaySettings.findUnique({ where: { id: "default" } }),
  ]);

  const mappedStudents: ClassStudentDobItem[] = students.map((s) => {
    const dobStr = s.dateOfBirth
      ? s.dateOfBirth.toISOString().split("T")[0]
      : null;
    const parentRec = s.parents[0]?.parent;
    const parentName = parentRec?.user?.name || "Parent";
    const parentPhone = parentRec?.phone || parentRec?.alternatePhone || null;
    const hasPortalAccount = Boolean(parentRec?.user?.name);

    return {
      id: s.id,
      name: `${s.firstName} ${s.lastName || ""}`.trim(),
      firstName: s.firstName,
      lastName: s.lastName,
      rollNumber: s.rollNumber,
      admissionNo: s.admissionNo,
      dateOfBirth: dobStr,
      hasDob: Boolean(dobStr),
      parentName,
      parentPhone,
      hasPortalAccount,
    };
  });

  const totalStudents = mappedStudents.length;
  const missingCount = mappedStudents.filter((s) => !s.hasDob).length;
  const completedCount = totalStudents - missingCount;
  const percentage = totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 100;

  return {
    classId: access.classId,
    className: access.className,
    userRole: access.userRole,
    students: mappedStudents,
    totalStudents,
    missingCount,
    completedCount,
    percentage,
    settings: {
      teacherCanEditExistingDob: settings?.teacherCanEditExistingDob ?? true,
      requireAdminApprovalForDobChange: settings?.requireAdminApprovalForDobChange ?? false,
      whatsappShortcut: Boolean(settings?.whatsappShortcut),
    },
  };
}

export async function saveStudentDobAction(params: {
  studentId: string;
  classId: string;
  dateOfBirth: string;
  reason?: string;
}) {
  const access = await requireClassTeacherAccess(params.classId);

  const student = await prisma.student.findUnique({
    where: { id: params.studentId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      classId: true,
      dateOfBirth: true,
    },
  });

  if (!student || student.classId !== params.classId) {
    return { error: "Student not found in this class." };
  }

  const validation = parseAndValidateDob(params.dateOfBirth, "STUDENT", true);
  if (!validation.isValid || !validation.dateStr) {
    return { error: validation.error || "Please enter a valid date of birth (DD/MM/YYYY)." };
  }

  const existingDobStr = student.dateOfBirth
    ? student.dateOfBirth.toISOString().split("T")[0]
    : null;

  if (existingDobStr === validation.dateStr) {
    return { success: true, unchanged: true, message: "Date is already set to this value." };
  }

  const settings = await prisma.birthdaySettings.findUnique({ where: { id: "default" } });
  const studentName = `${student.firstName} ${student.lastName || ""}`.trim();

  // If teacher is editing an existing DOB and permission is off:
  if (existingDobStr && access.userRole === "TEACHER" && settings?.teacherCanEditExistingDob === false) {
    return { error: "Permission denied: Only administrators can modify existing dates of birth." };
  }

  // If approval workflow is active for teacher edits:
  if (existingDobStr && access.userRole === "TEACHER" && settings?.requireAdminApprovalForDobChange === true) {
    await prisma.dobChangeLog.create({
      data: {
        personType: "STUDENT",
        personId: student.id,
        personName: studentName,
        classId: params.classId,
        changedById: access.userId,
        changedByName: "Class Teacher",
        changedByRole: "TEACHER",
        oldDateStr: existingDobStr,
        newDateStr: validation.dateStr,
        status: "PENDING_APPROVAL",
        reason: params.reason || "Teacher correction request",
      },
    });

    return {
      success: true,
      pendingApproval: true,
      message: "Change request submitted for administrator approval.",
    };
  }

  // Direct update
  const parsedDate = new Date(`${validation.dateStr}T00:00:00Z`);
  await prisma.student.update({
    where: { id: student.id },
    data: { dateOfBirth: parsedDate },
  });

  // Log audit
  await prisma.dobChangeLog.create({
    data: {
      personType: "STUDENT",
      personId: student.id,
      personName: studentName,
      classId: params.classId,
      changedById: access.userId,
      changedByName: access.userRole === "ADMIN" ? "Administrator" : "Class Teacher",
      changedByRole: access.userRole,
      oldDateStr: existingDobStr,
      newDateStr: validation.dateStr,
      status: "APPROVED",
      reason: params.reason || (existingDobStr ? "Updated Date of Birth" : "Initial Date of Birth entry"),
    },
  });

  // Trigger immediate send if birthday is today in Asia/Kolkata
  const dispatchResult = await dispatchImmediateBirthdayWishForPerson({
    personType: "student",
    personId: student.id,
    classId: params.classId,
  });

  revalidatePath("/dashboard/teacher/birthdays/missing");
  revalidatePath("/dashboard/teacher/birthdays");
  revalidatePath("/dashboard/admin/birthdays/missing");

  return {
    success: true,
    dateOfBirth: validation.dateStr,
    isBirthdayToday: dispatchResult.isBirthdayToday,
    immediateSent: dispatchResult.isBirthdayToday,
    message: dispatchResult.isBirthdayToday ? dispatchResult.message : "Date of Birth saved successfully.",
  };
}

export async function saveMultipleStudentDobsAction(params: {
  classId: string;
  updates: Array<{ studentId: string; dateOfBirth: string }>;
}) {
  const access = await requireClassTeacherAccess(params.classId);

  let updatedCount = 0;
  let immediateSentCount = 0;
  const errors: string[] = [];

  for (const item of params.updates) {
    try {
      const res = await saveStudentDobAction({
        studentId: item.studentId,
        classId: params.classId,
        dateOfBirth: item.dateOfBirth,
      });
      if (res.error) {
        errors.push(res.error);
      } else if (res.success) {
        updatedCount++;
        if (res.immediateSent) {
          immediateSentCount++;
        }
      }
    } catch (err: any) {
      errors.push(err?.message || "Error saving record.");
    }
  }

  revalidatePath("/dashboard/teacher/birthdays/missing");
  revalidatePath("/dashboard/teacher/birthdays");
  revalidatePath("/dashboard/admin/birthdays/missing");

  return {
    success: true,
    updatedCount,
    immediateSentCount,
    errors,
  };
}

export async function previewClassExcelDobAction(formData: FormData, classId: string) {
  const access = await requireClassTeacherAccess(classId);

  const file = formData.get("file") as File | null;
  if (!file) {
    return { error: "Please upload an Excel (.xlsx, .xls) or CSV file." };
  }

  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (rawRows.length === 0) {
    return { error: "The uploaded file contains no data." };
  }

  // Load class students
  const classStudents = await prisma.student.findMany({
    where: { classId, isActive: true },
    select: {
      id: true,
      rollNumber: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
    },
  });

  const valid: Array<{
    studentId: string;
    studentName: string;
    rollNumber: string;
    oldDob: string | null;
    newDob: string;
  }> = [];

  const unchanged: Array<{
    studentId: string;
    studentName: string;
    rollNumber: string;
    currentDob: string;
  }> = [];

  const errors: Array<{
    rowNumber: number;
    identifier: string;
    reason: string;
  }> = [];

  rawRows.forEach((row, index) => {
    const rowNum = index + 2;
    // Discover column keys flexibly
    const keys = Object.keys(row);
    const idKey = keys.find((k) =>
      /roll|admission|adm|reg|id|student\s*id/i.test(k)
    );
    const nameKey = keys.find((k) => /name|student/i.test(k));
    const dobKey = keys.find((k) => /dob|birth|date\s*of\s*birth/i.test(k));

    const idVal = idKey ? String(row[idKey]).trim() : "";
    const nameVal = nameKey ? String(row[nameKey]).trim().toLowerCase() : "";
    const dobRaw = dobKey ? row[dobKey] : null;

    if (!dobRaw) {
      return; // Skip empty rows
    }

    // Match student
    let matched = classStudents.find((s) => {
      if (idVal && (s.rollNumber === idVal || s.admissionNo === idVal)) return true;
      if (nameVal) {
        const fullName = `${s.firstName} ${s.lastName || ""}`.trim().toLowerCase();
        if (fullName === nameVal) return true;
      }
      return false;
    });

    if (!matched) {
      errors.push({
        rowNumber: rowNum,
        identifier: idVal || nameVal || `Row #${rowNum}`,
        reason: "No student in this class matched this Roll No / Name.",
      });
      return;
    }

    // Format DOB string
    let parsedDobStr: string | null = null;
    if (dobRaw instanceof Date) {
      parsedDobStr = dobRaw.toISOString().split("T")[0];
    } else {
      parsedDobStr = String(dobRaw).trim();
    }

    const validation = parseAndValidateDob(parsedDobStr, "STUDENT", true);
    if (!validation.isValid || !validation.dateStr) {
      errors.push({
        rowNumber: rowNum,
        identifier: matched.rollNumber || matched.firstName,
        reason: validation.error || "Invalid date format. Use DD/MM/YYYY.",
      });
      return;
    }

    const currentDobStr = matched.dateOfBirth
      ? matched.dateOfBirth.toISOString().split("T")[0]
      : null;

    if (currentDobStr === validation.dateStr) {
      unchanged.push({
        studentId: matched.id,
        studentName: `${matched.firstName} ${matched.lastName || ""}`.trim(),
        rollNumber: matched.rollNumber,
        currentDob: currentDobStr,
      });
    } else {
      valid.push({
        studentId: matched.id,
        studentName: `${matched.firstName} ${matched.lastName || ""}`.trim(),
        rollNumber: matched.rollNumber,
        oldDob: currentDobStr,
        newDob: validation.dateStr,
      });
    }
  });

  return {
    success: true,
    preview: {
      totalRows: rawRows.length,
      valid,
      unchanged,
      errors,
    },
  };
}

export async function commitClassExcelDobAction(
  classId: string,
  items: Array<{ studentId: string; dateOfBirth: string }>
) {
  return saveMultipleStudentDobsAction({ classId, updates: items });
}

// ============================================================================
// CLASS TEACHER & ADMIN: BIRTHDAY WISHES STUDIO ACTIONS
// ============================================================================

export interface BirthdayCelebrantItem {
  id: string;
  name: string;
  firstName: string;
  rollNumber: string;
  dateOfBirth: string; // YYYY-MM-DD
  birthdayFormatted: string; // "14 October"
  daysUntil: number; // 0 = today
  parentName: string;
  parentPhone: string | null;
  hasPortalAccount: boolean;
  wishSent: boolean;
  wishSentAt: string | null;
  teacherNote: string | null;
  teacherNoteSentAt: string | null;
}

export async function getClassBirthdayWishesSummaryAction(classId: string) {
  const access = await requireClassTeacherAccess(classId);
  const schoolNow = getSchoolNow();
  const year = schoolNow.year;
  const month = schoolNow.month;
  const day = schoolNow.day;

  const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const isFeb28InNonLeapYear = !isLeap(year) && month === 2 && day === 28;

  const [students, settings] = await Promise.all([
    prisma.student.findMany({
      where: { classId, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        rollNumber: true,
        dateOfBirth: true,
        parents: {
          take: 1,
          include: {
            parent: {
              include: {
                user: { select: { id: true, name: true } },
              },
            },
          },
        },
        birthdayWishes: {
          where: { year },
          select: { id: true, audience: true, sentAt: true, status: true },
        },
        birthdayNotes: {
          where: { year },
          select: { id: true, message: true, createdAt: true },
          take: 1,
        },
      },
      orderBy: [{ rollNumber: "asc" }, { firstName: "asc" }],
    }),
    prisma.birthdaySettings.findUnique({ where: { id: "default" } }),
  ]);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const todayCelebrants: BirthdayCelebrantItem[] = [];
  const upcoming7Days: BirthdayCelebrantItem[] = [];
  const upcoming30Days: BirthdayCelebrantItem[] = [];
  let celebrantsThisMonthCount = 0;
  let missingDobCount = 0;

  // Reference timestamp for start of today in UTC
  const todayRef = new Date(Date.UTC(year, month - 1, day));

  students.forEach((s) => {
    if (!s.dateOfBirth) {
      missingDobCount++;
      return;
    }

    const dobMonth = s.dateOfBirth.getUTCMonth() + 1;
    const dobDay = s.dateOfBirth.getUTCDate();
    const dobFormatted = `${dobDay} ${monthNames[dobMonth - 1]}`;
    const dobStr = s.dateOfBirth.toISOString().split("T")[0];

    if (dobMonth === month) {
      celebrantsThisMonthCount++;
    }

    const isToday =
      (dobMonth === month && dobDay === day) ||
      (isFeb28InNonLeapYear && dobMonth === 2 && dobDay === 29);

    // Calculate days until next birthday
    let nextBdayThisYear = new Date(Date.UTC(year, dobMonth - 1, dobDay));
    if (nextBdayThisYear < todayRef && !isToday) {
      nextBdayThisYear = new Date(Date.UTC(year + 1, dobMonth - 1, dobDay));
    }
    const diffMs = nextBdayThisYear.getTime() - todayRef.getTime();
    const daysUntil = isToday ? 0 : Math.round(diffMs / (1000 * 60 * 60 * 24));

    const parentRec = s.parents[0]?.parent;
    const parentName = parentRec?.user?.name || "Parent";
    const parentPhone = parentRec?.phone || parentRec?.alternatePhone || null;
    const hasPortalAccount = Boolean(parentRec?.user?.id);

    const sentWish = s.birthdayWishes.find((w) => w.status === "SENT");
    const teacherNote = s.birthdayNotes[0]?.message || null;
    const teacherNoteSentAt = s.birthdayNotes[0]?.createdAt ? s.birthdayNotes[0].createdAt.toISOString() : null;

    const celebrant: BirthdayCelebrantItem = {
      id: s.id,
      name: `${s.firstName} ${s.lastName || ""}`.trim(),
      firstName: s.firstName,
      rollNumber: s.rollNumber,
      dateOfBirth: dobStr,
      birthdayFormatted: dobFormatted,
      daysUntil,
      parentName,
      parentPhone,
      hasPortalAccount,
      wishSent: Boolean(sentWish),
      wishSentAt: sentWish ? sentWish.sentAt.toISOString() : null,
      teacherNote,
      teacherNoteSentAt,
    };

    if (isToday) {
      todayCelebrants.push(celebrant);
    } else if (daysUntil > 0 && daysUntil <= 7) {
      upcoming7Days.push(celebrant);
    } else if (daysUntil > 7 && daysUntil <= 30) {
      upcoming30Days.push(celebrant);
    }
  });

  // Sort upcoming chronologically
  upcoming7Days.sort((a, b) => a.daysUntil - b.daysUntil);
  upcoming30Days.sort((a, b) => a.daysUntil - b.daysUntil);

  return {
    classId: access.classId,
    className: access.className,
    userRole: access.userRole,
    todayCelebrants,
    upcoming7Days,
    upcoming30Days,
    totalCelebrantsThisMonth: celebrantsThisMonthCount,
    missingDobCount,
    totalStudents: students.length,
    settings: {
      whatsappShortcut: Boolean(settings?.whatsappShortcut),
      teacherCanEditExistingDob: settings?.teacherCanEditExistingDob ?? true,
      notifyClassTeacher: settings?.notifyClassTeacher ?? true,
    },
  };
}

export async function sendClassTeacherPersonalNoteAction(params: {
  studentId: string;
  classId: string;
  message: string;
}) {
  const access = await requireClassTeacherAccess(params.classId);
  const trimmed = params.message.trim().slice(0, 200);

  if (!trimmed) {
    return { error: "Personal message cannot be empty." };
  }

  const schoolNow = getSchoolNow();
  const year = schoolNow.year;

  // Resolve teacherId for the relation
  let teacherId = access.teacherId;
  if (teacherId === "admin") {
    const cls = await prisma.class.findUnique({
      where: { id: params.classId },
      select: { classTeacherId: true },
    });
    if (cls?.classTeacherId) {
      teacherId = cls.classTeacherId;
    } else {
      const anyTeacher = await prisma.teacher.findFirst({ select: { id: true } });
      if (!anyTeacher) {
        return { error: "No teacher profile configured to attach this note." };
      }
      teacherId = anyTeacher.id;
    }
  }

  // Save note
  const note = await prisma.birthdayNote.upsert({
    where: {
      studentId_teacherId_year: {
        studentId: params.studentId,
        teacherId,
        year,
      },
    },
    create: {
      studentId: params.studentId,
      teacherId,
      year,
      message: trimmed,
    },
    update: {
      message: trimmed,
    },
  });

  // Send notifications to Student and Parent
  const student = await prisma.student.findUnique({
    where: { id: params.studentId },
    select: {
      firstName: true,
      parents: {
        include: {
          parent: {
            include: { user: { select: { id: true } } },
          },
        },
      },
    },
  });

  if (student) {
    const title = `Special Birthday Note from your Class Teacher 📝`;
    const body = `"${trimmed}"`;

    for (const p of student.parents) {
      const parentUserId = p.parent?.user?.id;
      if (parentUserId) {
        await prisma.notification.create({
          data: {
            userId: parentUserId,
            title,
            content: body,
            type: "ANNOUNCEMENT",
            category: "GENERAL",
            priority: "HIGH",
            link: "/dashboard/parent",
            isRead: false,
          },
        });
        sendUserNotification(parentUserId, title, body, "academic", "/dashboard/parent", "URGENT").catch(() => {});
      }
    }
  }

  revalidatePath("/dashboard/teacher/birthdays");
  revalidatePath("/dashboard/admin/settings/birthdays");

  return { success: true, note };
}

export async function triggerSendNowForStudentAction(params: {
  studentId: string;
  classId: string;
}) {
  const access = await requireClassTeacherAccess(params.classId);

  const dispatchResult = await dispatchImmediateBirthdayWishForPerson({
    personType: "student",
    personId: params.studentId,
    classId: params.classId,
    forceSend: true,
  });

  revalidatePath("/dashboard/teacher/birthdays");
  revalidatePath("/dashboard/admin/settings/birthdays");

  return dispatchResult;
}

// ============================================================================
// ADMIN: AUDIT LOG & APPROVAL ACTIONS
// ============================================================================

export async function getAdminDobChangesLogAction(params?: {
  page?: number;
  limit?: number;
  status?: string;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Unauthorized: Admin access required.");
  }

  const page = Math.max(1, params?.page || 1);
  const limit = Math.min(100, Math.max(10, params?.limit || 25));
  const skip = (page - 1) * limit;

  const whereClause: any = {};
  if (params?.status && params.status !== "ALL") {
    whereClause.status = params.status;
  }

  const [totalCount, logs] = await Promise.all([
    prisma.dobChangeLog.count({ where: whereClause }),
    prisma.dobChangeLog.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    logs,
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / limit),
  };
}

export async function reviewDobChangeApprovalAction(params: {
  changeLogId: string;
  decision: "APPROVED" | "REJECTED";
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    return { error: "Unauthorized: Admin access required." };
  }

  const changeLog = await prisma.dobChangeLog.findUnique({
    where: { id: params.changeLogId },
  });

  if (!changeLog || changeLog.status !== "PENDING_APPROVAL") {
    return { error: "Pending approval request not found." };
  }

  if (params.decision === "REJECTED") {
    await prisma.dobChangeLog.update({
      where: { id: changeLog.id },
      data: { status: "REJECTED" },
    });
    return { success: true, message: "Change request rejected." };
  }

  // Apply change
  const parsedDate = new Date(`${changeLog.newDateStr}T00:00:00Z`);
  if (changeLog.personType === "STUDENT") {
    await prisma.student.update({
      where: { id: changeLog.personId },
      data: { dateOfBirth: parsedDate },
    });
  }

  await prisma.dobChangeLog.update({
    where: { id: changeLog.id },
    data: { status: "APPROVED" },
  });

  revalidatePath("/dashboard/admin/birthdays/missing");
  revalidatePath("/dashboard/teacher/birthdays/missing");

  return { success: true, message: "Change request approved and applied." };
}


