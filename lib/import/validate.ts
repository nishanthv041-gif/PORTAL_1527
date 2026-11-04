/**
 * Core validation engine for bulk import rows.
 * Features:
 * - Lossless normalization and field mapping
 * - Zod schema verification
 * - In-file duplicate and cross-email conflict detection
 * - Same-person duplicate detection (e.g. Rows 13 & 21 with identical phone)
 * - Class teacher multi-claim collision detection
 * - DB duplicate verification
 * - One-click actionable suggestions
 */

import { prisma } from "@/backend/db/prisma";
import {
  ColumnMappingItem,
  RawRow,
  RowValidationResult,
  SuggestionAction,
  ImportRole,
} from "./types";
import {
  assessPassword,
  normalizeEmail,
  normalizeFullName,
  normalizeGender,
  normalizePhone,
  normalizeSubjects,
  parseClassTeacher,
  resolveClassSmart,
  splitFullName,
} from "./normalizers";
import { formatDateToKolkataIso } from "./coerce";
import { TeacherRowSchema } from "./schemas/teacher";
import { StudentRowSchema } from "./schemas/student";

export interface ValidationContext {
  role: ImportRole;
  columnMappings: ColumnMappingItem[];
  rawRows: RawRow[];
  checkDb?: boolean;
  availableClasses?: Array<{ id: string; name: string; section: string }>;
}

/**
 * Validates all raw rows against the configured column mappings and role rules.
 */
export async function validateImportRows(
  context: ValidationContext
): Promise<RowValidationResult[]> {
  const { role, columnMappings, rawRows, checkDb = true } = context;

  // Retrieve active classes from context or database for smart class matching
  let activeClasses = context.availableClasses || [];
  if (activeClasses.length === 0 && checkDb) {
    try {
      activeClasses = await prisma.class.findMany({
        where: { isActive: true },
        select: { id: true, name: true, section: true },
        orderBy: [{ name: "asc" }, { section: "asc" }],
      });
    } catch (err) {
      console.warn("Could not fetch active classes for import validation:", err);
    }
  }

  // Build header-to-target field lookup
  const headerToField = new Map<string, string>();
  for (const m of columnMappings) {
    if (m.targetField) {
      headerToField.set(m.excelHeader, m.targetField);
    }
  }

  // 1. Initial row construction and individual field normalization
  const parsedRows: Array<{
    excelRowNumber: number;
    data: Record<string, any>;
    originalData: Record<string, string>;
    fieldErrors: Record<string, string>;
    warnings: Record<string, string>;
  }> = [];

  for (const r of rawRows) {
    const rawData: Record<string, string> = { ...r.cells };
    const mapped: Record<string, any> = {};

    for (const [header, val] of Object.entries(rawData)) {
      const field = headerToField.get(header);
      if (field) {
        mapped[field] = val;
      }
    }

    const fieldErrors: Record<string, string> = {};
    const warnings: Record<string, string> = {};

    if (role === "TEACHER") {
      // Normalization for Teacher
      const rawName = mapped.name || "";
      const cleanName = normalizeFullName(rawName);
      const { firstName, lastName } = splitFullName(cleanName);

      mapped.name = cleanName;
      mapped.fullName = cleanName;
      mapped.firstName = firstName;
      mapped.lastName = lastName;

      mapped.gender = normalizeGender(mapped.gender || "");
      mapped.phone = normalizePhone(mapped.phone || "");
      mapped.userId = normalizeEmail(mapped.userId || "");
      mapped.email = mapped.userId; // compatibility with legacy UI
      mapped.googleEmail = normalizeEmail(mapped.googleEmail || "");
      mapped.qualification = (mapped.qualification || "").trim();
      mapped.joiningDate = mapped.joiningDate || formatDateToKolkataIso(new Date());

      const rawSubject = mapped.subject || "";
      mapped.subjects = normalizeSubjects(rawSubject);
      mapped.subject = mapped.subjects.join(", ");

      const classResolution = resolveClassSmart(mapped.classTeacher || "", activeClasses);
      mapped.isClassTeacher = classResolution.isClassTeacher;
      mapped.classTeacherClassId = classResolution.matchedClass?.id || "";
      mapped.classTeacherClassName = classResolution.canonicalName;
      mapped.classTeacher = classResolution.canonicalName;
      mapped.classNotFound = classResolution.isNotFound;
      if (classResolution.isNotFound) {
        mapped.classNotFoundName = classResolution.rawEntry;
        warnings.classTeacher = `Class "${classResolution.rawEntry}" is not created in the portal yet.`;
      }
      if (classResolution.isNonClassRole) {
        mapped.nonClassRole = classResolution.nonClassRole;
      }

      const pwdQuality = assessPassword(mapped.password || "", mapped.phone);
      if (pwdQuality.warning) {
        warnings.password = pwdQuality.warning;
      }

      // Validate with TeacherRowSchema
      const result = TeacherRowSchema.safeParse(mapped);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const fieldName = String(issue.path[0] || "general");
          fieldErrors[fieldName] = issue.message;
        }
      }
    } else {
      // Normalization for Student / Parent
      const rawStudentName = mapped.name || "";
      const cleanStudentName = normalizeFullName(rawStudentName);
      const studentSplit = splitFullName(cleanStudentName);

      mapped.name = cleanStudentName;
      mapped.fullName = cleanStudentName;
      mapped.studentFirstName = studentSplit.firstName;
      mapped.studentLastName = studentSplit.lastName;
      mapped.firstName = studentSplit.firstName;
      mapped.lastName = studentSplit.lastName;

      mapped.rollNo = (mapped.rollNo || "").trim();
      mapped.studentRollNo = mapped.rollNo;
      mapped.admissionNo = `ADM${mapped.rollNo}`;
      mapped.class = (mapped.class || "").trim();
      mapped.classNameResolved = mapped.class;
      mapped.gender = normalizeGender(mapped.gender || "");
      mapped.residenceType = (mapped.residenceType || "DAYSCHOLAR").toUpperCase().includes("HOSTEL")
        ? "HOSTEL"
        : "DAYSCHOLAR";

      const rawParentName = mapped.parentName || "";
      const cleanParentName = normalizeFullName(rawParentName);
      const parentSplit = splitFullName(cleanParentName);
      mapped.parentName = cleanParentName;
      mapped.parentFirstName = parentSplit.firstName;
      mapped.parentLastName = parentSplit.lastName;

      mapped.parentPhone = normalizePhone(mapped.parentPhone || "");
      mapped.parentEmail = normalizeEmail(mapped.parentEmail || "");
      mapped.parentPassword = (mapped.parentPassword || "").trim() || "Parent@123";

      const result = StudentRowSchema.safeParse(mapped);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const fieldName = String(issue.path[0] || "general");
          fieldErrors[fieldName] = issue.message;
        }
      }
    }

    parsedRows.push({
      excelRowNumber: r.excelRowNumber,
      data: mapped,
      originalData: rawData,
      fieldErrors,
      warnings,
    });
  }

  // 2. In-file duplicate and conflict detection
  const phoneToRows = new Map<string, number[]>();
  const userIdToRows = new Map<string, number[]>();
  const googleEmailToRows = new Map<string, number[]>();
  const classToRows = new Map<string, number[]>();

  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    const d = row.data;

    const phone = d.phone || d.parentPhone;
    if (phone) {
      const list = phoneToRows.get(phone) || [];
      list.push(i);
      phoneToRows.set(phone, list);
    }

    const uid = d.userId || d.rollNo;
    if (uid) {
      const list = userIdToRows.get(uid.toLowerCase()) || [];
      list.push(i);
      userIdToRows.set(uid.toLowerCase(), list);
    }

    const gEmail = d.googleEmail;
    if (gEmail) {
      const list = googleEmailToRows.get(gEmail.toLowerCase()) || [];
      list.push(i);
      googleEmailToRows.set(gEmail.toLowerCase(), list);
    }

    const cls = d.classTeacher || d.class;
    if (cls && d.isClassTeacher) {
      const list = classToRows.get(cls.toLowerCase()) || [];
      list.push(i);
      classToRows.set(cls.toLowerCase(), list);
    }
  }

  // 3. Database check for existing users if requested
  const existingDbEmails = new Set<string>();
  const existingDbPhones = new Set<string>();

  if (checkDb) {
    try {
      const allUserIds = parsedRows
        .map(r => r.data.userId || r.data.parentEmail)
        .filter(Boolean);
      const allPhones = parsedRows
        .map(r => r.data.phone || r.data.parentPhone)
        .filter(Boolean);

      const dbUsers = await prisma.user.findMany({
        where: { email: { in: allUserIds } },
        select: { email: true },
      });

      for (const u of dbUsers) {
        if (u.email) existingDbEmails.add(u.email.toLowerCase());
      }

      const [dbTeachers, dbParents] = await Promise.all([
        prisma.teacher.findMany({
          where: { phone: { in: allPhones } },
          select: { phone: true },
        }),
        prisma.parent.findMany({
          where: { phone: { in: allPhones } },
          select: { phone: true },
        }),
      ]);

      for (const t of dbTeachers) {
        if (t.phone) existingDbPhones.add(normalizePhone(t.phone));
      }
      for (const p of dbParents) {
        if (p.phone) existingDbPhones.add(normalizePhone(p.phone));
      }
    } catch (err) {
      console.warn("DB check during import validation bypassed:", err);
    }
  }

  // 4. Construct final RowValidationResult list with actionable suggestions
  const results: RowValidationResult[] = [];

  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    const d = row.data;
    const excelRow = row.excelRowNumber;

    const duplicateWarnings: string[] = [];
    const conflictWarnings: string[] = [];
    const suggestions: SuggestionAction[] = [];
    let samePersonMatch: RowValidationResult["samePersonMatch"] = undefined;
    let classConflict: RowValidationResult["classConflict"] = undefined;

    // Check Phone Duplicates / Same-person match
    const phone = d.phone || d.parentPhone;
    if (phone && (phoneToRows.get(phone)?.length || 0) > 1) {
      const matchingIdxs = phoneToRows.get(phone)!.filter(idx => idx !== i);
      const matchedIdx = matchingIdxs[0];
      const matchedRow = parsedRows[matchedIdx];

      samePersonMatch = {
        matchedRowNumber: matchedRow.excelRowNumber,
        matchedPersonName: matchedRow.data.name || "Unknown",
        reason: `Identical phone number (${phone}) with Row ${matchedRow.excelRowNumber}.`,
        differingFields: [],
      };

      duplicateWarnings.push(
        `Duplicate phone number (${phone}) shared with Excel Row ${matchedRow.excelRowNumber} (${matchedRow.data.name}).`
      );

      // Offer skip suggestions for duplicate rows
      suggestions.push({
        id: `skip-dup-${excelRow}`,
        label: `Skip duplicate Row ${excelRow}`,
        field: "row",
        actionType: "SKIP_ROW",
      });
    }

    // Check User ID in-file duplicates
    const uid = (d.userId || d.rollNo || "").toLowerCase();
    if (uid && (userIdToRows.get(uid)?.length || 0) > 1) {
      const otherIdxs = userIdToRows.get(uid)!.filter(idx => idx !== i);
      const otherRow = parsedRows[otherIdxs[0]];
      duplicateWarnings.push(
        `User ID "${uid}" is duplicated in Excel Row ${otherRow.excelRowNumber}.`
      );
    }

    // Check Cross-Email Conflict (Row 26 case: User ID belongs to another person's name)
    // If User ID matches another row's name or another row's Google ID, or differs from own Google ID
    if (d.userId && d.googleEmail && d.userId.toLowerCase() !== d.googleEmail.toLowerCase()) {
      // Check if another row has this User ID as their primary name/email
      const userIdPrefix = d.userId.split("@")[0].toLowerCase();
      const currentNameClean = (d.name || "").toLowerCase().replace(/[^a-z]/g, "");

      if (!currentNameClean.includes(userIdPrefix) && !userIdPrefix.includes(currentNameClean)) {
        conflictWarnings.push(
          `User ID (${d.userId}) does not match teacher name (${d.name}). Google Mail ID is (${d.googleEmail}).`
        );

        // One-click suggestion: Use Google mail as User ID
        suggestions.push({
          id: `use-google-email-${excelRow}`,
          label: `Use Google mail as User ID (${d.googleEmail})`,
          field: "userId",
          newValue: d.googleEmail,
          actionType: "SET_FIELD",
        });
      }
    }

    // Check Class Teacher collisions (e.g. multiple teachers claiming "Class 1 - A")
    const cls = (d.classTeacher || "").toLowerCase();
    if (cls && d.isClassTeacher && (classToRows.get(cls)?.length || 0) > 1) {
      const claimedIdxs = classToRows.get(cls)!;
      const claimedRowNums = claimedIdxs.map(idx => parsedRows[idx].excelRowNumber);

      classConflict = {
        className: d.classTeacher,
        claimedByRows: claimedRowNums,
      };

      conflictWarnings.push(
        `Class "${d.classTeacher}" is claimed as Class Teacher by rows: ${claimedRowNums.join(", ")}.`
      );

      suggestions.push({
        id: `clear-class-teacher-${excelRow}`,
        label: `Import as Subject Teacher (remove class teacher claim)`,
        field: "classTeacher",
        newValue: "",
        actionType: "CLEAR_FIELD",
      });
    }

    // Check DB conflicts
    if (d.userId && existingDbEmails.has(d.userId.toLowerCase())) {
      conflictWarnings.push(`User ID / Email "${d.userId}" already exists in the portal database.`);
    }
    if (phone && existingDbPhones.has(phone)) {
      conflictWarnings.push(`Phone number "${phone}" is already registered to an existing portal user.`);
    }

    // Password suggestion if weak
    if (row.warnings.password) {
      const randomStrongPass = `SRT@${Math.floor(1000 + Math.random() * 9000)}`;
      suggestions.push({
        id: `gen-pass-${excelRow}`,
        label: `Generate strong password (${randomStrongPass})`,
        field: "password",
        newValue: randomStrongPass,
        actionType: "GENERATE_PASSWORD",
      });
    }

    // Determine final row status
    let status: RowValidationResult["status"] = "VALID";
    const hasFieldErrors = Object.keys(row.fieldErrors).length > 0;
    const missingFields = Object.keys(row.fieldErrors).filter(k => 
      row.fieldErrors[k].toLowerCase().includes("required") || row.fieldErrors[k].toLowerCase().includes("missing")
    );
    const invalidFields = Object.keys(row.fieldErrors).filter(k => 
      !missingFields.includes(k)
    );
    const hasDuplicates = duplicateWarnings.length > 0;
    const hasDbConflicts = conflictWarnings.some(c => c.includes("database") || c.includes("portal user"));

    if (hasDbConflicts) {
      status = "CONFLICT_DB";
    } else if (hasDuplicates) {
      status = "DUPLICATE_IN_FILE";
    } else if (hasFieldErrors) {
      status = "NEEDS_CORRECTION";
    }

    const isReady = status === "VALID" && !hasFieldErrors;

    results.push({
      rowId: `row-${excelRow}`,
      excelRowNumber: excelRow,
      status,
      isReadyToImport: isReady,
      isSampleRow: false,
      fieldErrors: row.fieldErrors,
      missingFields,
      invalidFields,
      warnings: row.warnings,
      duplicateWarnings,
      conflictWarnings,
      samePersonMatch,
      classConflict,
      suggestions,
      data: d,
      originalData: row.originalData,
    });
  }

  return results;
}
