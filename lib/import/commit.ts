/**
 * Safe database transaction commit and error workbook generation.
 * Rules:
 * - Chunked execution (1-5 rows per batch) prevents Vercel serverless timeouts
 * - Passwords hashed with bcryptjs outside transactions
 * - ZERO plain text passwords logged, printed, or exported
 * - Safe error Excel export for failed/flagged rows
 */

import { hash } from "bcryptjs";
import * as XLSX from "xlsx";
import { prisma } from "@/backend/db/prisma";
import { BatchImportResult, ImportRole, RowValidationResult } from "./types";
import { sanitizeForSpreadsheetExport } from "./coerce";

/**
 * Commits a batch of validated rows to the database.
 * Supports Teacher and Student/Parent imports with automatic rollback per row on error.
 */
export async function commitImportBatch(
  role: ImportRole,
  rows: Record<string, any>[]
): Promise<BatchImportResult> {
  const result: BatchImportResult = {
    totalAttempted: rows.length,
    successfulCount: 0,
    failedCount: 0,
    createdUserIds: [],
    errors: [],
  };

  for (const row of rows) {
    const excelRow = row._excelRowNumber || row.excelRowNumber || 0;
    try {
      if (role === "TEACHER") {
        await commitSingleTeacher(row);
      } else {
        await commitSingleStudent(row);
      }
      result.successfulCount++;
    } catch (err: unknown) {
      result.failedCount++;
      const message = err instanceof Error ? err.message : "Database write failed.";
      result.errors.push({
        excelRowNumber: excelRow,
        identifier: row.userId || row.rollNo || "Unknown",
        error: message,
      });
      console.error(`[Import Engine] Error importing row ${excelRow}:`, message);
    }
  }

  return result;
}

/**
 * Commits a single teacher row in a transaction:
 * Creates User -> Teacher -> links classTeacher and subjects.
 */
async function commitSingleTeacher(data: Record<string, any>) {
  const {
    name,
    firstName,
    lastName,
    gender,
    phone,
    qualification,
    subjects,
    classTeacher,
    userId,
    password,
  } = data;

  const cleanEmail = String(userId).trim().toLowerCase();
  const hashedPassword = await hash(String(password || "Teacher@123"), 10);
  const fullName = `${firstName} ${lastName || ""}`.trim() || name;

  return await prisma.$transaction(async (tx) => {
    // 1. Check if user already exists
    const existing = await tx.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existing) {
      throw new Error(`User with email "${cleanEmail}" already exists.`);
    }

    if (phone) {
      const existingTeacher = await tx.teacher.findFirst({
        where: { phone },
      });
      if (existingTeacher) {
        throw new Error(`Teacher with phone number "${phone}" already exists.`);
      }
    }

    // 2. Create User record
    const user = await tx.user.create({
      data: {
        email: cleanEmail,
        name: fullName,
        password: hashedPassword,
        role: "TEACHER",
        status: "ACTIVE",
        notificationsEnabled: true,
      },
    });

    // 3. Create Teacher profile
    const teacher = await tx.teacher.create({
      data: {
        userId: user.id,
        phone: phone || null,
        qualification: qualification || null,
      },
    });

    // 4. Assign Class Teacher role if requested and class exists
    if (classTeacher) {
      const classNameParts = classTeacher.split(/[-–]/).map((s: string) => s.trim());
      const clsName = classNameParts[0];
      const secName = classNameParts[1] || "";

      const foundClass = await tx.class.findFirst({
        where: {
          AND: [
            { name: { contains: clsName, mode: "insensitive" } },
            ...(secName ? [{ section: { equals: secName } }] : []),
          ],
        },
      });

      if (foundClass) {
        // Link teacher to class
        await tx.class.update({
          where: { id: foundClass.id },
          data: { teacherId: teacher.id },
        });
      }
    }

    // 5. Link subjects if provided
    if (Array.isArray(subjects) && subjects.length > 0) {
      for (const subjName of subjects) {
        const foundSubj = await tx.subject.findFirst({
          where: { name: { equals: subjName, mode: "insensitive" } },
        });
        if (foundSubj) {
          await tx.subject.update({
            where: { id: foundSubj.id },
            data: { teacherId: teacher.id },
          }).catch(() => {});
        }
      }
    }

    return teacher;
  });
}

/**
 * Commits a single student and parent row in a transaction.
 */
async function commitSingleStudent(data: Record<string, any>) {
  const {
    rollNo,
    name,
    firstName,
    lastName,
    gender,
    dob,
    residenceType,
    class: targetClassName,
    parentName,
    parentFirstName,
    parentLastName,
    parentPhone,
    parentEmail,
    parentPassword,
  } = data;

  const studentFullName = `${firstName} ${lastName || ""}`.trim() || name;
  const parentFullName = `${parentFirstName} ${parentLastName || ""}`.trim() || parentName;
  const cleanParentEmail = String(parentEmail).trim().toLowerCase();
  const hashedParentPassword = await hash(String(parentPassword || "Parent@123"), 10);

  return await prisma.$transaction(async (tx) => {
    // 1. Find or create parent user
    let parentUser = await tx.user.findUnique({
      where: { email: cleanParentEmail },
      include: { parent: true },
    });

    if (!parentUser) {
      parentUser = await tx.user.create({
        data: {
          email: cleanParentEmail,
          name: parentFullName,
          password: hashedParentPassword,
          role: "PARENT",
          status: "ACTIVE",
          notificationsEnabled: true,
        },
        include: { parent: true },
      });
    }

    // Ensure Parent record exists
    let parent = parentUser.parent;
    if (!parent) {
      parent = await tx.parent.create({
        data: {
          userId: parentUser.id,
          phone: parentPhone || null,
        },
      });
    }

    // 2. Resolve Class
    let classId = "";
    if (targetClassName) {
      const foundClass = await tx.class.findFirst({
        where: { name: { contains: targetClassName, mode: "insensitive" } },
      });
      if (foundClass) classId = foundClass.id;
    }

    // 3. Create Student
    const student = await tx.student.create({
      data: {
        rollNumber: rollNo,
        admissionNo: `ADM${rollNo}`,
        firstName,
        lastName: lastName || "",
        gender: gender || "OTHER",
        dateOfBirth: dob ? new Date(dob) : null,
        residenceType: residenceType === "HOSTEL" ? "HOSTEL" : "DAYSCHOLAR",
        classId: classId || (await tx.class.findFirst())?.id || "",
        isActive: true,
      },
    });

    // 4. Link Student to Parent
    await tx.parentStudent.create({
      data: {
        studentId: student.id,
        parentId: parent.id,
      },
    });

    return student;
  });
}

/**
 * Generates an Excel error workbook (.xlsx buffer) for failed/flagged rows.
 * SECURITY: Passwords are NEVER included in error reports or logs!
 */
export function generateErrorReportExcel(rows: RowValidationResult[]): Buffer {
  const headers = [
    "Excel Row",
    "Status",
    "Identifier",
    "Full Name",
    "Problem Fields",
    "Errors & Warnings",
    "Suggested Actions",
  ];

  const exportData: unknown[][] = [headers];

  for (const r of rows) {
    if (r.status === "VALID") continue; // only export rows needing attention

    const problemFields = Object.keys(r.fieldErrors).join(", ") || "None";
    const errors = [
      ...Object.values(r.fieldErrors),
      ...r.duplicateWarnings,
      ...r.conflictWarnings,
      ...(r.warnings.password ? [r.warnings.password] : []),
    ].join(" | ");

    const suggestions = r.suggestions.map(s => s.label).join(" ; ");
    const identifier = r.data.userId || r.data.rollNo || r.data.phone || "N/A";
    const name = r.data.name || `${r.data.firstName || ""} ${r.data.lastName || ""}`.trim() || "N/A";

    exportData.push([
      r.excelRowNumber,
      r.status,
      sanitizeForSpreadsheetExport(identifier),
      sanitizeForSpreadsheetExport(name),
      sanitizeForSpreadsheetExport(problemFields),
      sanitizeForSpreadsheetExport(errors),
      sanitizeForSpreadsheetExport(suggestions),
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(exportData);
  XLSX.utils.book_append_sheet(wb, ws, "Import Issues");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
