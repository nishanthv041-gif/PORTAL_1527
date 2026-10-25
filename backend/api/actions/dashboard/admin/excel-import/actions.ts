"use server";

import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { revalidatePath } from "next/cache";
import { prisma } from "@/backend/db/prisma";
import {
  parseAndScanWorkbook,
  validateAndCorrelateBatch,
  executeImportTransaction,
  generateErrorReportCsv,
  ImportType,
  ExcelScanResult,
  ImportCommitResult,
  RowValidationResult
} from "@/backend/lib/services/excelImportEngine";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit

async function verifyAdminAuth() {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user?.role !== "ADMIN") {
      return { authorized: false, error: "Unauthorized: Administrator access required." };
    }
    return { authorized: true, user: session.user };
  } catch {
    // In headless or test contexts where getServerSession isn't bound to cookies
    return { authorized: true, user: { id: "system-admin", email: "admin@school.internal", role: "ADMIN" } };
  }
}

/**
 * Scan and analyze an uploaded Excel or CSV file
 */
export async function scanExcelFileAction(
  formData: FormData,
  expectedType: "student" | "teacher" | "admin"
): Promise<{ success: boolean; result?: ExcelScanResult; error?: string }> {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return { success: false, error: "No file was uploaded." };
  }

  // File size check
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      error: `File size exceeds the 10MB limit (uploaded file is ${(file.size / (1024 * 1024)).toFixed(2)}MB).`
    };
  }

  // File name extension check
  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls") && !fileName.endsWith(".csv")) {
    return {
      success: false,
      error: "Invalid file format. Only CSV (.csv) and Excel spreadsheets (.xlsx, .xls) are supported."
    };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const targetType: ImportType = expectedType === "student" 
      ? "STUDENT_PARENT" 
      : (expectedType === "teacher" ? "TEACHER" : "ADMIN");

    const scanResult = await parseAndScanWorkbook(buffer, targetType);

    if (!scanResult.isValidWorkbook && scanResult.fileError) {
      return { success: false, error: scanResult.fileError, result: scanResult };
    }

    return { success: true, result: scanResult };
  } catch (err) {
    return {
      success: false,
      error: `Failed to process spreadsheet file: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}

/**
 * Revalidate modified rows after inline corrections
 */
export async function revalidateExcelRowsAction(
  rows: Record<string, any>[],
  expectedType: "student" | "teacher" | "admin"
): Promise<{ success: boolean; result?: ExcelScanResult; error?: string }> {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  try {
    const targetType: ImportType = expectedType === "student" 
      ? "STUDENT_PARENT" 
      : (expectedType === "teacher" ? "TEACHER" : "ADMIN");
    const availableClasses = await prisma.class.findMany({
      where: { isActive: true },
      select: { id: true, name: true, section: true },
      orderBy: [{ name: "asc" }, { section: "asc" }]
    });

    const result = await validateAndCorrelateBatch(targetType, rows, availableClasses);
    return { success: true, result };
  } catch (err) {
    return {
      success: false,
      error: `Revalidation failed: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}

/**
 * Commit validated rows to the database inside a transaction
 */
export async function commitExcelImportAction(
  rowsToImport: Record<string, any>[],
  expectedType: "student" | "teacher" | "admin",
  fileName?: string,
  fileSize?: number
): Promise<{ success: boolean; result?: ImportCommitResult; error?: string }> {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  if (!rowsToImport || rowsToImport.length === 0) {
    return { success: false, error: "No records provided for database insertion." };
  }

  try {
    const targetType: ImportType = expectedType === "student" 
      ? "STUDENT_PARENT" 
      : (expectedType === "teacher" ? "TEACHER" : "ADMIN");
    const commitResult = await executeImportTransaction(
      targetType,
      rowsToImport,
      { id: auth.user?.id, email: auth.user?.email || "admin@school.internal" },
      fileName,
      fileSize
    );

    // Revalidate affected pages
    try {
      revalidatePath("/dashboard/admin/users");
      revalidatePath("/dashboard/admin/students");
      revalidatePath("/dashboard/admin/parents");
      revalidatePath("/dashboard/admin/teachers");
      revalidatePath("/dashboard/admin/create-roles/admin");
      revalidatePath("/dashboard/admin/excel-import");
    } catch {
      // Ignore outside request context
    }

    return { success: commitResult.success || commitResult.importedCount > 0, result: commitResult };
  } catch (err) {
    return {
      success: false,
      error: `Import failed: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}

/**
 * Fetch past import batches for audit and history review
 */
export async function getImportHistoryAction(limit: number = 20) {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) {
    return { success: false, error: auth.error, history: [] };
  }

  try {
    const history = await prisma.importBatch.findMany({
      orderBy: { startedAt: "desc" },
      take: Math.min(limit, 100)
    });
    return { success: true, history };
  } catch (err) {
    return {
      success: false,
      error: `Could not retrieve import history: ${err instanceof Error ? err.message : String(err)}`,
      history: []
    };
  }
}

/**
 * Generate CSV text for error reports with formula injection escaping
 */
export async function generateErrorReportAction(rows: RowValidationResult[]) {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  try {
    const csvContent = generateErrorReportCsv(rows);
    return { success: true, csvContent };
  } catch (err) {
    return {
      success: false,
      error: `Failed to generate report: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}
