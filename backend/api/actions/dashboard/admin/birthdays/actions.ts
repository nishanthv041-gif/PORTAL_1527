"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { parseAndValidateDob, RoleType } from "@/lib/validations/dob";
import { getSchoolNow } from "@/lib/time";
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

