"use client";

import { useState, useEffect, useTransition } from "react";
import { 
  Upload, Download, FileSpreadsheet, Loader2, AlertTriangle, 
  CheckCircle2, Edit3, Trash2, X, Search, Check, RefreshCw,
  Clock, ShieldAlert, ArrowRight, Eye, AlertOctagon, HelpCircle,
  FileCheck, Users, GraduationCap, Wand2
} from "lucide-react";
import { 
  scanExcelFileAction, 
  revalidateExcelRowsAction, 
  commitExcelImportAction, 
  getImportHistoryAction,
  generateErrorReportAction
} from "@/backend/api/actions/dashboard/admin/excel-import/actions";
import { RowValidationResult, ExcelScanResult, ImportCommitResult } from "@/backend/lib/services/excelImportEngine";

type ClassItem = {
  id: string;
  name: string;
  section: string;
};

interface ImportHistoryItem {
  id: string;
  templateType: string;
  fileName: string;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  skippedRows: number;
  status: string;
  startedAt: Date | string;
  completedAt?: Date | string | null;
  errorSummary?: string | null;
}

export default function BulkUpload({ 
  type, 
  classes = [] 
}: { 
  type: "teacher" | "student" | "admin";
  classes?: ClassItem[];
}) {
  const [isPending, startTransition] = useTransition();

  // Active view tab in bulk upload
  const [activeTab, setActiveTab] = useState<"UPLOAD" | "HISTORY">("UPLOAD");

  // Upload & Scan state
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [scanResult, setScanResult] = useState<ExcelScanResult | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Filter & Search
  const [filter, setFilter] = useState<"ALL" | "ERRORS" | "VALID" | "DUPLICATES">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Editing state
  const [editingRow, setEditingRow] = useState<RowValidationResult | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, any>>({});
  const [editRowErrors, setEditRowErrors] = useState<Record<string, string>>({});

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [importMode, setImportMode] = useState<"VALID_ONLY" | "ALL_AFTER_CORRECTIONS">("VALID_ONLY");

  // Commit execution state
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);

  // History state
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Available classes (combines props and those returned from scan)
  const activeClasses = (scanResult?.availableClasses && scanResult.availableClasses.length > 0)
    ? scanResult.availableClasses
    : classes;

  // Load history on tab switch
  useEffect(() => {
    if (activeTab === "HISTORY") {
      fetchHistory();
    }
  }, [activeTab]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await getImportHistoryAction(25);
      if (res.success && res.history) {
        setHistory(res.history as unknown as ImportHistoryItem[]);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  // Template download helpers
  const csvTemplatePath = type === "student" 
    ? "/templates/student_upload_template.csv" 
    : (type === "teacher" ? "/templates/teacher_upload_template.csv" : "/templates/admin_upload_template.csv");
  const excelTemplatePath = type === "student" 
    ? "/templates/student_upload_template.xlsx" 
    : (type === "teacher" ? "/templates/teacher_upload_template.xlsx" : "/templates/admin_upload_template.xlsx");

  const csvTemplateFilename = `${type}_upload_template.csv`;
  const excelTemplateFilename = `${type}_upload_template.xlsx`;

  // Handle file drop & select
  const handleFileChange = (selectedFile: File) => {
    setGeneralError(null);
    setCommitResult(null);

    const name = selectedFile.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".csv")) {
      setGeneralError("Invalid file type. Please upload a CSV (.csv) or Excel workbook (.xlsx or .xls).");
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setGeneralError("File size exceeds 10MB limit.");
      return;
    }

    setFile(selectedFile);
    performScan(selectedFile);
  };

  const performScan = (targetFile: File) => {
    startTransition(async () => {
      setGeneralError(null);
      setScanResult(null);

      const formData = new FormData();
      formData.append("file", targetFile);

      const res = await scanExcelFileAction(formData, type);
      if (!res.success) {
        setGeneralError(res.error || "Failed to scan Excel file.");
        if (res.result) setScanResult(res.result);
      } else if (res.result) {
        setScanResult(res.result);
      }
    });
  };

  // Revalidate modified rows
  const handleRevalidateAll = () => {
    if (!scanResult) return;
    startTransition(async () => {
      const rawRows = scanResult.rows.map(r => r.data);
      const res = await revalidateExcelRowsAction(rawRows, type);
      if (res.success && res.result) {
        setScanResult(res.result);
      } else {
        setGeneralError(res.error || "Revalidation failed.");
      }
    });
  };

  // Download error report (.csv)
  const handleDownloadErrorReport = async () => {
    if (!scanResult) return;
    try {
      const res = await generateErrorReportAction(scanResult.rows);
      if (res.success && res.csvContent) {
        const blob = new Blob([res.csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `excel_import_errors_${type}_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert(res.error || "Failed to generate error report.");
      }
    } catch (err) {
      alert("Failed to download error report.");
    }
  };

  // Check if any rows have unclear residence options
  const hasUnclearResidenceRows = (scanResult?.rows || []).some(r => {
    const resRaw = String(r.data.residenceType || "").toUpperCase();
    return (resRaw.includes("DAY") && resRaw.includes("HOSTEL")) || !!r.fieldErrors?.residenceType?.includes("Unclear option");
  });

  // Open Edit Modal for a row
  const openEditRow = (row: RowValidationResult) => {
    setEditingRow(row);
    const initialData = { ...row.data };
    if (initialData.residenceType) {
      const upper = String(initialData.residenceType).toUpperCase();
      if (upper.includes("HOSTEL") && !upper.includes("DAY")) {
        initialData.residenceType = "HOSTEL";
      } else {
        initialData.residenceType = "DAYSCHOLAR";
      }
    } else {
      initialData.residenceType = "DAYSCHOLAR";
    }
    setEditFormData(initialData);
    setEditRowErrors({ ...row.fieldErrors });
  };

  // Quick action: set single row residence
  const handleQuickSetResidence = (row: RowValidationResult, chosenResidence: "DAYSCHOLAR" | "HOSTEL") => {
    if (!scanResult) return;
    startTransition(async () => {
      const updatedRows = scanResult.rows.map(r => {
        if (r.rowId === row.rowId) {
          return {
            ...r.data,
            residenceType: chosenResidence
          };
        }
        return r.data;
      });

      const res = await revalidateExcelRowsAction(updatedRows, type);
      if (res.success && res.result) {
        setScanResult(res.result);
      } else {
        setGeneralError(res.error || "Failed to update row residence.");
      }
    });
  };

  // Quick action: auto-resolve all unclear residence rows to DAYSCHOLAR
  const handleAutoResolveUnclearResidence = () => {
    if (!scanResult) return;
    startTransition(async () => {
      const updatedRows = scanResult.rows.map(r => {
        const rowData = { ...r.data };
        const resRaw = String(rowData.residenceType || "").toUpperCase();
        if ((resRaw.includes("DAY") && resRaw.includes("HOSTEL")) || r.fieldErrors?.residenceType?.includes("Unclear option")) {
          rowData.residenceType = "DAYSCHOLAR";
        }
        return rowData;
      });

      const res = await revalidateExcelRowsAction(updatedRows, type);
      if (res.success && res.result) {
        setScanResult(res.result);
      } else {
        setGeneralError(res.error || "Failed to auto-resolve unclear residence options.");
      }
    });
  };

  // Edit first error row
  const handleEditFirstError = () => {
    if (!scanResult) return;
    const firstErr = scanResult.rows.find(r => !r.isReadyToImport) || scanResult.rows[0];
    if (firstErr) {
      openEditRow(firstErr);
    }
  };

  // Save row changes & revalidate in-place
  const handleSaveRow = async () => {
    if (!editingRow || !scanResult) return;

    startTransition(async () => {
      // Update data in scanResult.rows
      const updatedRows = scanResult.rows.map(r => {
        if (r.rowId === editingRow.rowId) {
          return editFormData;
        }
        return r.data;
      });

      const res = await revalidateExcelRowsAction(updatedRows, type);
      if (res.success && res.result) {
        setScanResult(res.result);
        setEditingRow(null);
      } else {
        alert(res.error || "Failed to revalidate corrected row.");
      }
    });
  };

  // Handle final import execution
  const handleExecuteImport = () => {
    if (!scanResult) return;

    // Filter rows eligible for import
    const rowsToImport = scanResult.rows
      .filter(r => r.isReadyToImport && !r.isSampleRow)
      .map(r => r.data);

    if (rowsToImport.length === 0) {
      alert("No valid rows ready to import.");
      return;
    }

    setShowConfirmModal(false);

    startTransition(async () => {
      setGeneralError(null);
      const res = await commitExcelImportAction(
        rowsToImport, 
        type, 
        file?.name || "upload.xlsx", 
        file?.size || 0
      );

      if (res.result) {
        setCommitResult(res.result);
        if (res.result.success || res.result.importedCount > 0) {
          // Reset scan result on full or partial success so user sees the report
          setScanResult(null);
          setFile(null);
        }
      } else {
        setGeneralError(res.error || "Import failed during database execution.");
      }
    });
  };

  // Filtered rows for the preview table
  const displayedRows = (scanResult?.rows || []).filter(r => {
    // Tab filter
    if (filter === "ERRORS" && r.status === "VALID") return false;
    if (filter === "VALID" && r.status !== "VALID") return false;
    if (filter === "DUPLICATES" && r.status !== "DUPLICATE_IN_FILE" && r.status !== "CONFLICT_DB") return false;

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const searchable = [
        String(r.excelRowNumber),
        r.data.studentFirstName,
        r.data.studentLastName,
        r.data.studentRollNo,
        r.data.admissionNo,
        r.data.parentEmail,
        r.data.firstName,
        r.data.lastName,
        r.data.email
      ].filter(Boolean).join(" ").toLowerCase();

      return searchable.includes(q);
    }

    return true;
  });

  return (
    <div style={{
      marginTop: "2.5rem",
      backgroundColor: "var(--card-bg, #ffffff)",
      borderRadius: "16px",
      border: "1px solid var(--border-color, #e5e7eb)",
      boxShadow: "0 4px 20px -2px rgba(0,0,0,0.05)",
      overflow: "hidden"
    }}>
      {/* Header Bar */}
      <div style={{
        padding: "1.5rem 2rem",
        borderBottom: "1px solid var(--border-color, #e5e7eb)",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        background: "linear-gradient(to right, rgba(99, 102, 241, 0.03), transparent)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            backgroundColor: type === "student" ? "rgba(16, 185, 129, 0.1)" : (type === "teacher" ? "rgba(99, 102, 241, 0.1)" : "rgba(239, 68, 68, 0.1)"),
            color: type === "student" ? "#10b981" : (type === "teacher" ? "#6366f1" : "var(--danger, #ef4444)"),
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <FileSpreadsheet size={26} />
          </div>
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
              {type === "student" 
                ? "Intelligent Student & Parent Import" 
                : (type === "teacher" ? "Intelligent Teacher Import" : "Intelligent Admin Import")
              }
            </h2>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-secondary, #6b7280)" }}>
              {type === "student" 
                ? "Upload student-parent workbook (.csv or .xlsx). Automatically links siblings, validates classes, and detects duplicates."
                : (type === "teacher"
                  ? "Upload official teacher spreadsheet (.csv or .xlsx). Validates emails, qualifications, and provisions teacher credentials securely."
                  : "Upload administrator accounts (.csv or .xlsx). Validates Gmail addresses (@gmail.com) for Google SSO and provisions admin access.")
              }
            </p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            onClick={() => setActiveTab("UPLOAD")}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              border: "1px solid",
              borderColor: activeTab === "UPLOAD" ? "var(--primary, #6366f1)" : "var(--border-color, #e5e7eb)",
              backgroundColor: activeTab === "UPLOAD" ? "var(--primary-bg, rgba(99, 102, 241, 0.1))" : "transparent",
              color: activeTab === "UPLOAD" ? "var(--primary, #6366f1)" : "var(--foreground)",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem"
            }}
          >
            <Upload size={16} /> Import Workflow
          </button>
          <button
            onClick={() => setActiveTab("HISTORY")}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              border: "1px solid",
              borderColor: activeTab === "HISTORY" ? "var(--primary, #6366f1)" : "var(--border-color, #e5e7eb)",
              backgroundColor: activeTab === "HISTORY" ? "var(--primary-bg, rgba(99, 102, 241, 0.1))" : "transparent",
              color: activeTab === "HISTORY" ? "var(--primary, #6366f1)" : "var(--foreground)",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem"
            }}
          >
            <Clock size={16} /> Import History & Audit
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ padding: "2rem" }}>

        {/* ======================================================== */}
        {/* VIEW 1: IMPORT WORKFLOW */}
        {/* ======================================================== */}
        {activeTab === "UPLOAD" && (
          <div>
            {/* Template Download Bar with CSV and XLSX options */}
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              padding: "1rem 1.5rem",
              backgroundColor: "rgba(99, 102, 241, 0.05)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              borderRadius: "12px",
              marginBottom: "1.75rem"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <FileCheck size={20} color="#6366f1" />
                <span style={{ fontSize: "0.875rem", color: "var(--foreground)" }}>
                  Download official template with exact column headers:
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <a
                  href={csvTemplatePath}
                  download={csvTemplateFilename}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 1rem",
                    backgroundColor: "var(--card-bg, #ffffff)",
                    color: "var(--primary, #6366f1)",
                    border: "1px solid var(--primary, #6366f1)",
                    borderRadius: "8px",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    textDecoration: "none",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)"
                  }}
                >
                  <Download size={16} /> Download Template (.csv)
                </a>
                <a
                  href={excelTemplatePath}
                  download={excelTemplateFilename}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 1rem",
                    backgroundColor: "var(--primary, #6366f1)",
                    color: "#ffffff",
                    borderRadius: "8px",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    textDecoration: "none",
                    boxShadow: "0 2px 4px rgba(99, 102, 241, 0.2)"
                  }}
                >
                  <Download size={16} /> Download Template (.xlsx)
                </a>
              </div>
            </div>

            {/* General Error Notification */}
            {generalError && (
              <div style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                padding: "1rem 1.25rem",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "10px",
                marginBottom: "1.5rem",
                color: "#dc2626"
              }}>
                <AlertOctagon size={20} style={{ flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Scan & Validation Alert</div>
                  <div style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>{generalError}</div>
                </div>
              </div>
            )}

            {/* Commit Success Report Screen */}
            {commitResult && (
              <div style={{
                padding: "2rem",
                backgroundColor: commitResult.success ? "rgba(16, 185, 129, 0.05)" : "rgba(245, 158, 11, 0.05)",
                border: `1px solid ${commitResult.success ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
                borderRadius: "12px",
                marginBottom: "2rem"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
                  <div style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    backgroundColor: commitResult.success ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                    color: commitResult.success ? "#10b981" : "#f59e0b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                    <CheckCircle2 size={28} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--foreground)" }}>
                      {commitResult.success ? "Import Completed Successfully!" : "Import Completed with Partial Results"}
                    </h3>
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                      Batch ID: <code>{commitResult.batchId}</code> • Database transaction successfully committed.
                    </p>
                  </div>
                </div>

                {/* Metric Summary */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "1rem",
                  margin: "1.5rem 0"
                }}>
                  <div style={{ padding: "1rem", background: "var(--card-bg)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>IMPORTED RECORDS</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#10b981", marginTop: "0.25rem" }}>{commitResult.importedCount}</div>
                  </div>
                  <div style={{ padding: "1rem", background: "var(--card-bg)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>SKIPPED ROWS</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#6b7280", marginTop: "0.25rem" }}>{commitResult.skippedCount}</div>
                  </div>
                  <div style={{ padding: "1rem", background: "var(--card-bg)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>FAILED ROWS</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: commitResult.failedCount > 0 ? "#ef4444" : "#6b7280", marginTop: "0.25rem" }}>
                      {commitResult.failedCount}
                    </div>
                  </div>
                </div>

                {/* List of Created Accounts */}
                {commitResult.createdAccounts && commitResult.createdAccounts.length > 0 && (
                  <div style={{ marginTop: "1.5rem" }}>
                    <h4 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                      Created & Linked Accounts ({commitResult.createdAccounts.length}):
                    </h4>
                    <div style={{
                      maxHeight: "180px",
                      overflowY: "auto",
                      backgroundColor: "var(--card-bg)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      padding: "0.5rem"
                    }}>
                      {commitResult.createdAccounts.map((acc, idx) => (
                        <div key={idx} style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.4rem 0.75rem",
                          fontSize: "0.8125rem",
                          borderBottom: idx !== commitResult.createdAccounts.length - 1 ? "1px solid var(--border-color)" : "none"
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{
                              padding: "0.15rem 0.4rem",
                              borderRadius: "4px",
                              fontWeight: 700,
                              fontSize: "0.6875rem",
                              backgroundColor: acc.role === "STUDENT" ? "rgba(16, 185, 129, 0.1)" : (acc.role === "PARENT" ? "rgba(59, 130, 246, 0.1)" : (acc.role === "ADMIN" ? "rgba(236, 72, 153, 0.1)" : "rgba(139, 92, 246, 0.1)")),
                              color: acc.role === "STUDENT" ? "#10b981" : (acc.role === "PARENT" ? "#3b82f6" : (acc.role === "ADMIN" ? "#ec4899" : "#8b5cf6"))
                            }}>
                              {acc.role}
                            </span>
                            <span style={{ fontWeight: 500 }}>{acc.name}</span>
                          </div>
                          <span style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>{acc.identifier}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Errors Breakdown if any */}
                {commitResult.errors && commitResult.errors.length > 0 && (
                  <div style={{ marginTop: "1rem", color: "#dc2626", fontSize: "0.875rem" }}>
                    <strong>Row Failures:</strong>
                    <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
                      {commitResult.errors.map((e, idx) => <li key={idx}>{e}</li>)}
                    </ul>
                  </div>
                )}

                <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }}>
                  <button
                    onClick={() => {
                      setCommitResult(null);
                      setScanResult(null);
                      setFile(null);
                    }}
                    style={{
                      padding: "0.625rem 1.25rem",
                      backgroundColor: "var(--primary, #6366f1)",
                      color: "#ffffff",
                      borderRadius: "8px",
                      border: "none",
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      cursor: "pointer"
                    }}
                  >
                    Upload Another File
                  </button>
                  <button
                    onClick={() => setActiveTab("HISTORY")}
                    style={{
                      padding: "0.625rem 1.25rem",
                      backgroundColor: "transparent",
                      color: "var(--foreground)",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      cursor: "pointer"
                    }}
                  >
                    View Import History
                  </button>
                </div>
              </div>
            )}

            {/* Drag & Drop Upload Zone */}
            {!scanResult && !commitResult && (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileChange(e.dataTransfer.files[0]);
                  }
                }}
                style={{
                  border: `2px dashed ${isDragging ? "var(--primary, #6366f1)" : "var(--border-color, #d1d5db)"}`,
                  backgroundColor: isDragging ? "rgba(99, 102, 241, 0.05)" : "var(--card-bg)",
                  borderRadius: "14px",
                  padding: "3.5rem 2rem",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.2s ease"
                }}
                onClick={() => {
                  const input = document.getElementById("excel-file-input") as HTMLInputElement;
                  if (input) input.click();
                }}
              >
                <input
                  id="excel-file-input"
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileChange(e.target.files[0]);
                    }
                  }}
                />

                <div style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(99, 102, 241, 0.1)",
                  color: "var(--primary, #6366f1)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "1rem"
                }}>
                  {isPending ? <Loader2 size={32} className="animate-spin" /> : <Upload size={32} />}
                </div>

                <h3 style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.5rem", color: "var(--foreground)" }}>
                  {isPending ? "Scanning spreadsheet & checking database..." : "Drag and drop your CSV or Excel file here, or click to browse"}
                </h3>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary, #6b7280)" }}>
                  Supports .csv, .xlsx, and .xls files up to 10MB • Auto-detects columns, missing fields & duplicate records
                </p>
              </div>
            )}

            {/* SCAN RESULTS & INTERACTIVE PREVIEW */}
            {scanResult && (
              <div>
                {/* File Info Bar */}
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "1rem 1.25rem",
                  backgroundColor: "var(--card-bg)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "10px",
                  marginBottom: "1.5rem"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <FileSpreadsheet size={22} color="var(--primary, #6366f1)" />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{file?.name || "Uploaded Spreadsheet"}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        {((file?.size || 0) / 1024).toFixed(1)} KB • Detected Template: <strong>{scanResult.detectedTemplate}</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <button
                      onClick={handleRevalidateAll}
                      disabled={isPending}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        padding: "0.5rem 0.875rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)",
                        background: "transparent",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      <RefreshCw size={14} className={isPending ? "animate-spin" : ""} /> Revalidate All
                    </button>
                    <button
                      onClick={handleDownloadErrorReport}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        padding: "0.5rem 0.875rem",
                        borderRadius: "8px",
                        border: "1px solid #ef4444",
                        backgroundColor: "rgba(239, 68, 68, 0.05)",
                        color: "#ef4444",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      <Download size={14} /> Download Error Report
                    </button>
                    <button
                      onClick={() => {
                        setScanResult(null);
                        setFile(null);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        padding: "0.5rem 0.875rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)",
                        background: "transparent",
                        color: "var(--text-secondary)",
                        fontSize: "0.8125rem",
                        cursor: "pointer"
                      }}
                    >
                      <Trash2 size={14} /> Clear
                    </button>
                  </div>
                </div>

                {/* Scan Metrics Overview Cards */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: "0.875rem",
                  marginBottom: "1.75rem"
                }}>
                  {/* Total Rows */}
                  <div style={{
                    padding: "1rem",
                    backgroundColor: "var(--card-bg)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "10px"
                  }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>TOTAL ROWS</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--foreground)", marginTop: "0.25rem" }}>
                      {scanResult.totalRows}
                    </div>
                  </div>

                  {/* Ready to Import (Valid) */}
                  <div style={{
                    padding: "1rem",
                    backgroundColor: "rgba(16, 185, 129, 0.05)",
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                    borderRadius: "10px"
                  }}>
                    <div style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: 600 }}>READY TO IMPORT</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#10b981", marginTop: "0.25rem" }}>
                      {scanResult.readyToImportCount}
                    </div>
                  </div>

                  {/* Needs Correction / Errors */}
                  <div style={{
                    padding: "1rem",
                    backgroundColor: scanResult.errorRowsCount > 0 ? "rgba(239, 68, 68, 0.05)" : "var(--card-bg)",
                    border: `1px solid ${scanResult.errorRowsCount > 0 ? "rgba(239, 68, 68, 0.2)" : "var(--border-color)"}`,
                    borderRadius: "10px"
                  }}>
                    <div style={{ fontSize: "0.75rem", color: scanResult.errorRowsCount > 0 ? "#ef4444" : "var(--text-secondary)", fontWeight: 600 }}>
                      NEEDS CORRECTION
                    </div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: scanResult.errorRowsCount > 0 ? "#ef4444" : "var(--foreground)", marginTop: "0.25rem" }}>
                      {scanResult.errorRowsCount}
                    </div>
                  </div>

                  {/* Duplicates in File */}
                  <div style={{
                    padding: "1rem",
                    backgroundColor: scanResult.duplicateRowsCount > 0 ? "rgba(245, 158, 11, 0.05)" : "var(--card-bg)",
                    border: `1px solid ${scanResult.duplicateRowsCount > 0 ? "rgba(245, 158, 11, 0.2)" : "var(--border-color)"}`,
                    borderRadius: "10px"
                  }}>
                    <div style={{ fontSize: "0.75rem", color: scanResult.duplicateRowsCount > 0 ? "#f59e0b" : "var(--text-secondary)", fontWeight: 600 }}>
                      IN-FILE DUPLICATES
                    </div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: scanResult.duplicateRowsCount > 0 ? "#f59e0b" : "var(--foreground)", marginTop: "0.25rem" }}>
                      {scanResult.duplicateRowsCount}
                    </div>
                  </div>

                  {/* Database Conflicts */}
                  <div style={{
                    padding: "1rem",
                    backgroundColor: scanResult.conflictRowsCount > 0 ? "rgba(139, 92, 246, 0.05)" : "var(--card-bg)",
                    border: `1px solid ${scanResult.conflictRowsCount > 0 ? "rgba(139, 92, 246, 0.2)" : "var(--border-color)"}`,
                    borderRadius: "10px"
                  }}>
                    <div style={{ fontSize: "0.75rem", color: scanResult.conflictRowsCount > 0 ? "#8b5cf6" : "var(--text-secondary)", fontWeight: 600 }}>
                      DB CONFLICTS
                    </div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: scanResult.conflictRowsCount > 0 ? "#8b5cf6" : "var(--foreground)", marginTop: "0.25rem" }}>
                      {scanResult.conflictRowsCount}
                    </div>
                  </div>

                  {/* Sample Rows */}
                  {scanResult.sampleRowsCount > 0 && (
                    <div style={{
                      padding: "1rem",
                      backgroundColor: "rgba(107, 114, 128, 0.05)",
                      border: "1px solid rgba(107, 114, 128, 0.2)",
                      borderRadius: "10px"
                    }}>
                      <div style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: 600 }}>TEMPLATE SAMPLES</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#6b7280", marginTop: "0.25rem" }}>
                        {scanResult.sampleRowsCount}
                      </div>
                    </div>
                  )}
                </div>

                {/* Filter Tabs & Search Bar */}
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  marginBottom: "1rem"
                }}>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      onClick={() => setFilter("ALL")}
                      style={{
                        padding: "0.4rem 0.8rem",
                        borderRadius: "6px",
                        border: "1px solid",
                        borderColor: filter === "ALL" ? "var(--primary)" : "var(--border-color)",
                        backgroundColor: filter === "ALL" ? "var(--primary-bg)" : "transparent",
                        color: filter === "ALL" ? "var(--primary)" : "var(--foreground)",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      All Rows ({scanResult.rows.length})
                    </button>
                    <button
                      onClick={() => setFilter("ERRORS")}
                      style={{
                        padding: "0.4rem 0.8rem",
                        borderRadius: "6px",
                        border: "1px solid",
                        borderColor: filter === "ERRORS" ? "#ef4444" : "var(--border-color)",
                        backgroundColor: filter === "ERRORS" ? "rgba(239, 68, 68, 0.1)" : "transparent",
                        color: filter === "ERRORS" ? "#ef4444" : "var(--foreground)",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      Errors Only ({scanResult.errorRowsCount})
                    </button>
                    <button
                      onClick={() => setFilter("VALID")}
                      style={{
                        padding: "0.4rem 0.8rem",
                        borderRadius: "6px",
                        border: "1px solid",
                        borderColor: filter === "VALID" ? "#10b981" : "var(--border-color)",
                        backgroundColor: filter === "VALID" ? "rgba(16, 185, 129, 0.1)" : "transparent",
                        color: filter === "VALID" ? "#10b981" : "var(--foreground)",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      Valid Only ({scanResult.readyToImportCount})
                    </button>
                    <button
                      onClick={() => setFilter("DUPLICATES")}
                      style={{
                        padding: "0.4rem 0.8rem",
                        borderRadius: "6px",
                        border: "1px solid",
                        borderColor: filter === "DUPLICATES" ? "#f59e0b" : "var(--border-color)",
                        backgroundColor: filter === "DUPLICATES" ? "rgba(245, 158, 11, 0.1)" : "transparent",
                        color: filter === "DUPLICATES" ? "#f59e0b" : "var(--foreground)",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      Duplicates & Conflicts ({scanResult.duplicateRowsCount + scanResult.conflictRowsCount})
                    </button>
                  </div>

                  <div style={{ position: "relative", minWidth: "240px" }}>
                    <Search size={16} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
                    <input
                      type="text"
                      placeholder="Search preview rows..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "0.45rem 0.75rem 0.45rem 2.25rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)",
                        background: "transparent",
                        fontSize: "0.8125rem"
                      }}
                    />
                  </div>
                </div>

                {/* Validation Preview Table */}
                <div style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: "10px",
                  overflowX: "auto",
                  backgroundColor: "var(--card-bg)"
                }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", textAlign: "left" }}>
                    <thead>
                      <tr style={{ backgroundColor: "rgba(0,0,0,0.02)", borderBottom: "1px solid var(--border-color)" }}>
                        <th style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "var(--text-secondary)", width: "70px" }}>Row</th>
                        <th style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "var(--text-secondary)", width: "120px" }}>Status</th>
                        <th style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                          {type === "student" ? "Student Details" : (type === "teacher" ? "Teacher Name" : "Admin Name")}
                        </th>
                        <th style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                          {type === "student" ? "Parent & Contact" : (type === "teacher" ? "Email & Phone" : "Gmail Address")}
                        </th>
                        <th style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                          {type === "student" ? "Class & Residence" : (type === "teacher" ? "Joining & Qualification" : "Role & Status")}
                        </th>
                        <th style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "var(--text-secondary)" }}>Validation Issues</th>
                        <th style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "var(--text-secondary)", textAlign: "right", width: "90px" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
                            No rows match the selected filter.
                          </td>
                        </tr>
                      ) : (
                        displayedRows.map((r) => {
                          const isReady = r.isReadyToImport;
                          const isErr = r.status === "NEEDS_CORRECTION";
                          const isDup = r.status === "DUPLICATE_IN_FILE";
                          const isConflict = r.status === "CONFLICT_DB";
                          const isSample = r.status === "SAMPLE_ROW";

                          return (
                            <tr key={r.rowId} style={{
                              borderBottom: "1px solid var(--border-color)",
                              backgroundColor: isErr ? "rgba(239, 68, 68, 0.02)" : (isDup ? "rgba(245, 158, 11, 0.02)" : "transparent")
                            }}>
                              {/* Row Number */}
                              <td style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                                #{r.excelRowNumber}
                              </td>

                              {/* Status Badge */}
                              <td style={{ padding: "0.75rem 1rem" }}>
                                {isReady && (
                                  <span style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.3rem",
                                    padding: "0.2rem 0.5rem",
                                    borderRadius: "6px",
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                    backgroundColor: "rgba(16, 185, 129, 0.1)",
                                    color: "#10b981"
                                  }}>
                                    <CheckCircle2 size={12} /> Valid
                                  </span>
                                )}
                                {isErr && (
                                  <span style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.3rem",
                                    padding: "0.2rem 0.5rem",
                                    borderRadius: "6px",
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                    backgroundColor: "rgba(239, 68, 68, 0.1)",
                                    color: "#ef4444"
                                  }}>
                                    <AlertTriangle size={12} /> Correction
                                  </span>
                                )}
                                {isDup && (
                                  <span style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.3rem",
                                    padding: "0.2rem 0.5rem",
                                    borderRadius: "6px",
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                    backgroundColor: "rgba(245, 158, 11, 0.1)",
                                    color: "#f59e0b"
                                  }}>
                                    <AlertOctagon size={12} /> Duplicate
                                  </span>
                                )}
                                {isConflict && (
                                  <span style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.3rem",
                                    padding: "0.2rem 0.5rem",
                                    borderRadius: "6px",
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                    backgroundColor: "rgba(139, 92, 246, 0.1)",
                                    color: "#8b5cf6"
                                  }}>
                                    <ShieldAlert size={12} /> DB Conflict
                                  </span>
                                )}
                                {isSample && (
                                  <span style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.3rem",
                                    padding: "0.2rem 0.5rem",
                                    borderRadius: "6px",
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                    backgroundColor: "rgba(107, 114, 128, 0.1)",
                                    color: "#6b7280"
                                  }}>
                                    Sample
                                  </span>
                                )}
                              </td>

                              {/* Col 1 */}
                              <td style={{ padding: "0.75rem 1rem" }}>
                                {type === "student" ? (
                                  <div>
                                    <div style={{ fontWeight: 600 }}>{r.data.studentFirstName} {r.data.studentLastName}</div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                                      Roll: <strong>{r.data.studentRollNo || "Missing"}</strong> • Adm: {r.data.admissionNo || "N/A"}
                                    </div>
                                  </div>
                                ) : type === "teacher" ? (
                                  <div>
                                    <div style={{ fontWeight: 600 }}>{r.data.firstName} {r.data.lastName}</div>
                                  </div>
                                ) : (
                                  <div>
                                    <div style={{ fontWeight: 600 }}>{r.data.name || "Missing Name"}</div>
                                  </div>
                                )}
                              </td>

                              {/* Col 2 */}
                              <td style={{ padding: "0.75rem 1rem" }}>
                                {type === "student" ? (
                                  <div>
                                    <div style={{ fontWeight: 500 }}>{r.data.parentFirstName} {r.data.parentLastName}</div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                                      {r.data.parentEmail || "Missing email"} {r.data.isExistingParent && " (Existing Parent)"}
                                    </div>
                                  </div>
                                ) : type === "teacher" ? (
                                  <div>
                                    <div style={{ fontWeight: 500 }}>{r.data.email || "Missing"}</div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{r.data.phone || "No phone"}</div>
                                  </div>
                                ) : (
                                  <div>
                                    <div style={{ fontWeight: 500 }}>{r.data.email || "Missing"}</div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Google OAuth SSO</div>
                                  </div>
                                )}
                              </td>

                              {/* Col 3 */}
                              <td style={{ padding: "0.75rem 1rem" }}>
                                {type === "student" ? (
                                  <div>
                                    <div style={{ fontWeight: 500 }}>{r.data.classNameResolved || r.data.class || "Unassigned"}</div>
                                    <div style={{ fontSize: "0.75rem", color: r.fieldErrors.residenceType ? "#ef4444" : "var(--text-secondary)" }}>
                                      Type: <strong>{r.data.residenceType || "DAYSCHOLAR"}</strong>
                                    </div>
                                    {r.fieldErrors.residenceType && (
                                      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginTop: "0.35rem" }}>
                                        <button
                                          type="button"
                                          onClick={() => handleQuickSetResidence(r, "DAYSCHOLAR")}
                                          disabled={isPending}
                                          title="Click to set residence as Dayscholar"
                                          style={{
                                            padding: "0.2rem 0.45rem",
                                            fontSize: "0.7rem",
                                            borderRadius: "4px",
                                            border: "1px solid #10b981",
                                            backgroundColor: "rgba(16, 185, 129, 0.1)",
                                            color: "#10b981",
                                            cursor: "pointer",
                                            fontWeight: 700
                                          }}
                                        >
                                          + Dayscholar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleQuickSetResidence(r, "HOSTEL")}
                                          disabled={isPending}
                                          title="Click to set residence as Hostel"
                                          style={{
                                            padding: "0.2rem 0.45rem",
                                            fontSize: "0.7rem",
                                            borderRadius: "4px",
                                            border: "1px solid #6366f1",
                                            backgroundColor: "rgba(99, 102, 241, 0.1)",
                                            color: "#6366f1",
                                            cursor: "pointer",
                                            fontWeight: 700
                                          }}
                                        >
                                          + Hostel
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ) : type === "teacher" ? (
                                  <div>
                                    <div>Qual: {r.data.qualification || "Missing"}</div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Join: {r.data.joiningDate || "N/A"}</div>
                                  </div>
                                ) : (
                                  <div>
                                    <div style={{ fontWeight: 600, color: "var(--primary)" }}>Role: ADMIN</div>
                                    <div style={{ fontSize: "0.75rem", color: "#10b981" }}>Status: ACTIVE</div>
                                  </div>
                                )}
                              </td>

                              {/* Validation Issues */}
                              <td style={{ padding: "0.75rem 1rem" }}>
                                {isReady && (
                                  <span style={{ color: "#10b981", fontSize: "0.8125rem" }}>All fields valid & verified</span>
                                )}
                                {isSample && (
                                  <span style={{ color: "#6b7280", fontSize: "0.8125rem" }}>Template demonstration row (skipped)</span>
                                )}
                                {(!isReady && !isSample) && (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                                    {Object.entries(r.fieldErrors).map(([field, err], i) => (
                                      <span key={i} style={{
                                        display: "inline-block",
                                        padding: "0.15rem 0.4rem",
                                        borderRadius: "4px",
                                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                                        color: "#ef4444",
                                        fontSize: "0.75rem"
                                      }}>
                                        {err}
                                      </span>
                                    ))}
                                    {r.duplicateWarnings.map((dup, i) => (
                                      <span key={`dup-${i}`} style={{
                                        display: "inline-block",
                                        padding: "0.15rem 0.4rem",
                                        borderRadius: "4px",
                                        backgroundColor: "rgba(245, 158, 11, 0.1)",
                                        color: "#f59e0b",
                                        fontSize: "0.75rem"
                                      }}>
                                        {dup}
                                      </span>
                                    ))}
                                    {r.conflictWarnings.map((conf, i) => (
                                      <span key={`conf-${i}`} style={{
                                        display: "inline-block",
                                        padding: "0.15rem 0.4rem",
                                        borderRadius: "4px",
                                        backgroundColor: "rgba(139, 92, 246, 0.1)",
                                        color: "#8b5cf6",
                                        fontSize: "0.75rem"
                                      }}>
                                        {conf}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>

                              {/* Edit Action */}
                              <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                                <button
                                  onClick={() => openEditRow(r)}
                                  disabled={isPending}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.3rem",
                                    padding: "0.35rem 0.65rem",
                                    borderRadius: "6px",
                                    border: r.isReadyToImport ? "1px solid var(--border-color)" : "1px solid #6366f1",
                                    backgroundColor: r.isReadyToImport ? "transparent" : "rgba(99, 102, 241, 0.12)",
                                    color: r.isReadyToImport ? "var(--foreground)" : "#6366f1",
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                    cursor: "pointer"
                                  }}
                                >
                                  <Edit3 size={12} /> {r.isReadyToImport ? "Edit" : "Edit / Fix"}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Import Bottom Action Bar */}
                <div style={{
                  marginTop: "1.75rem",
                  padding: "1.25rem 1.75rem",
                  backgroundColor: "rgba(99, 102, 241, 0.04)",
                  border: "1px solid rgba(99, 102, 241, 0.15)",
                  borderRadius: "12px",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem"
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--foreground)" }}>
                      {scanResult.readyToImportCount} of {scanResult.totalRows} records ready for database import
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: scanResult.errorRowsCount > 0 || scanResult.sampleRowsCount > 0 ? "#f59e0b" : "var(--text-secondary)", marginTop: "0.2rem", fontWeight: scanResult.readyToImportCount === 0 ? 600 : 400 }}>
                      {scanResult.errorRowsCount > 0 
                        ? `⚠️ ${scanResult.errorRowsCount} record(s) need updates (unclear option or missing fields). Please update the details before importing.`
                        : (scanResult.readyToImportCount === 0 && scanResult.sampleRowsCount > 0)
                        ? `${scanResult.sampleRowsCount} row(s) detected as template demonstration. Click "Update Details" to fill in real student data.`
                        : "All data rows passed schema validation and duplicate checks."
                      }
                    </div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem" }}>
                    {/* Auto-Resolve button if unclear residence rows exist */}
                    {hasUnclearResidenceRows && (
                      <button
                        type="button"
                        onClick={handleAutoResolveUnclearResidence}
                        disabled={isPending}
                        title="Auto-fix all unclear 'Dayscholar (or Hostel)' values to Dayscholar"
                        style={{
                          padding: "0.625rem 1.15rem",
                          backgroundColor: "#3b82f6",
                          color: "#ffffff",
                          borderRadius: "8px",
                          border: "none",
                          fontWeight: 700,
                          fontSize: "0.875rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.45rem",
                          boxShadow: "0 2px 6px rgba(59, 130, 246, 0.3)"
                        }}
                      >
                        <Wand2 size={16} /> Quick Fix: Set Unclear to Dayscholar
                      </button>
                    )}

                    {/* Update / Edit First Error Row */}
                    {(scanResult.errorRowsCount > 0 || scanResult.readyToImportCount === 0) && (
                      <button
                        type="button"
                        onClick={handleEditFirstError}
                        disabled={isPending}
                        style={{
                          padding: "0.625rem 1.15rem",
                          backgroundColor: scanResult.readyToImportCount === 0 ? "var(--primary, #6366f1)" : "rgba(99, 102, 241, 0.15)",
                          color: scanResult.readyToImportCount === 0 ? "#ffffff" : "#6366f1",
                          borderRadius: "8px",
                          border: scanResult.readyToImportCount === 0 ? "none" : "1px solid #6366f1",
                          fontWeight: 700,
                          fontSize: "0.875rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.45rem",
                          boxShadow: scanResult.readyToImportCount === 0 ? "0 2px 6px rgba(99, 102, 241, 0.3)" : "none"
                        }}
                      >
                        <Edit3 size={16} /> Update Details {scanResult.errorRowsCount > 0 ? `(${scanResult.errorRowsCount} pending)` : ""}
                      </button>
                    )}

                    {/* Revalidate Button */}
                    <button
                      type="button"
                      onClick={handleRevalidateAll}
                      disabled={isPending}
                      style={{
                        padding: "0.625rem 1rem",
                        backgroundColor: "transparent",
                        color: "var(--foreground)",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)",
                        fontWeight: 600,
                        fontSize: "0.875rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem"
                      }}
                    >
                      <RefreshCw size={15} /> Revalidate
                    </button>

                    {/* Import Buttons */}
                    {scanResult.readyToImportCount > 0 && (
                      <button
                        onClick={() => {
                          setImportMode("VALID_ONLY");
                          setShowConfirmModal(true);
                        }}
                        disabled={isPending}
                        style={{
                          padding: "0.625rem 1.25rem",
                          backgroundColor: "#10b981",
                          color: "#ffffff",
                          borderRadius: "8px",
                          border: "none",
                          fontWeight: 700,
                          fontSize: "0.875rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          boxShadow: "0 2px 6px rgba(16, 185, 129, 0.3)"
                        }}
                      >
                        {isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                        Import Valid Rows ({scanResult.readyToImportCount})
                      </button>
                    )}

                    {scanResult.errorRowsCount === 0 && scanResult.readyToImportCount > 0 && (
                      <button
                        onClick={() => {
                          setImportMode("ALL_AFTER_CORRECTIONS");
                          setShowConfirmModal(true);
                        }}
                        disabled={isPending}
                        style={{
                          padding: "0.625rem 1.25rem",
                          backgroundColor: "var(--primary, #6366f1)",
                          color: "#ffffff",
                          borderRadius: "8px",
                          border: "none",
                          fontWeight: 700,
                          fontSize: "0.875rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem"
                        }}
                      >
                        Import All ({scanResult.readyToImportCount})
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 2: IMPORT HISTORY & AUDIT TAB */}
        {/* ======================================================== */}
        {activeTab === "HISTORY" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>Past Import Batches & Audit Trail</h3>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                  Review historical Excel uploads, imported account volumes, and download non-sensitive error summaries.
                </p>
              </div>
              <button
                onClick={fetchHistory}
                disabled={loadingHistory}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.5rem 0.875rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "transparent",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                <RefreshCw size={14} className={loadingHistory ? "animate-spin" : ""} /> Refresh
              </button>
            </div>

            {loadingHistory ? (
              <div style={{ textAlign: "center", padding: "3rem" }}>
                <Loader2 size={32} className="animate-spin" style={{ color: "var(--primary)" }} />
                <p style={{ marginTop: "0.75rem", color: "var(--text-secondary)" }}>Loading import history...</p>
              </div>
            ) : history.length === 0 ? (
              <div style={{
                textAlign: "center",
                padding: "3rem",
                border: "1px dashed var(--border-color)",
                borderRadius: "12px",
                color: "var(--text-secondary)"
              }}>
                <FileSpreadsheet size={40} style={{ opacity: 0.5, marginBottom: "0.5rem" }} />
                <h4>No import history recorded yet</h4>
                <p style={{ fontSize: "0.875rem", margin: 0 }}>Any batch imported will automatically be logged here for audit purposes.</p>
              </div>
            ) : (
              <div style={{ border: "1px solid var(--border-color)", borderRadius: "10px", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ backgroundColor: "rgba(0,0,0,0.02)", borderBottom: "1px solid var(--border-color)" }}>
                      <th style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "var(--text-secondary)" }}>Timestamp</th>
                      <th style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "var(--text-secondary)" }}>Template Type</th>
                      <th style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "var(--text-secondary)" }}>File Name</th>
                      <th style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "var(--text-secondary)" }}>Total Rows</th>
                      <th style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "var(--text-secondary)" }}>Imported</th>
                      <th style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "var(--text-secondary)" }}>Failed</th>
                      <th style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "var(--text-secondary)" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                        <td style={{ padding: "0.75rem 1rem", fontSize: "0.8125rem" }}>
                          {new Date(h.startedAt).toLocaleString()}
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <span style={{
                            padding: "0.2rem 0.5rem",
                            borderRadius: "4px",
                            fontWeight: 700,
                            fontSize: "0.75rem",
                            backgroundColor: h.templateType === "STUDENT_PARENT" ? "rgba(16, 185, 129, 0.1)" : "rgba(99, 102, 241, 0.1)",
                            color: h.templateType === "STUDENT_PARENT" ? "#10b981" : "#6366f1"
                          }}>
                            {h.templateType}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 500 }}>{h.fileName}</td>
                        <td style={{ padding: "0.75rem 1rem" }}>{h.totalRows}</td>
                        <td style={{ padding: "0.75rem 1rem", color: "#10b981", fontWeight: 600 }}>{h.importedRows}</td>
                        <td style={{ padding: "0.75rem 1rem", color: h.failedRows > 0 ? "#ef4444" : "var(--text-secondary)" }}>{h.failedRows}</td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <span style={{
                            padding: "0.2rem 0.5rem",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            backgroundColor: h.status === "COMPLETED" ? "rgba(16, 185, 129, 0.1)" : (h.status === "PARTIAL" ? "rgba(245, 158, 11, 0.1)" : "rgba(239, 68, 68, 0.1)"),
                            color: h.status === "COMPLETED" ? "#10b981" : (h.status === "PARTIAL" ? "#f59e0b" : "#ef4444")
                          }}>
                            {h.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ======================================================== */}
      {/* INLINE ROW EDITING MODAL */}
      {/* ======================================================== */}
      {editingRow && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: "1rem"
        }}>
          <div style={{
            backgroundColor: "var(--card-bg, #ffffff)",
            borderRadius: "16px",
            border: "1px solid var(--border-color, #e5e7eb)",
            width: "100%",
            maxWidth: "700px",
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
            overflow: "hidden"
          }}>
            {/* Modal Header */}
            <div style={{
              padding: "1.25rem 1.5rem",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: "rgba(0,0,0,0.02)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Edit3 size={18} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>
                  Correct Details: Excel Row #{editingRow.excelRowNumber}
                </h3>
              </div>
              <button
                onClick={() => setEditingRow(null)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body: Form Fields */}
            <div style={{ padding: "1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              
              {type === "student" ? (
                <>
                  <div style={{ fontWeight: 700, fontSize: "0.9375rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.25rem" }}>
                    Student Information
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Student First Name *
                      </label>
                      <input
                        type="text"
                        value={editFormData.studentFirstName || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, studentFirstName: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.studentFirstName ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      />
                      {editRowErrors.studentFirstName && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.studentFirstName}</span>}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Student Last Name *
                      </label>
                      <input
                        type="text"
                        value={editFormData.studentLastName || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, studentLastName: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.studentLastName ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      />
                      {editRowErrors.studentLastName && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.studentLastName}</span>}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Roll Number *
                      </label>
                      <input
                        type="text"
                        value={editFormData.studentRollNo || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, studentRollNo: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.studentRollNo ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      />
                      {editRowErrors.studentRollNo && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.studentRollNo}</span>}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Admission Number *
                      </label>
                      <input
                        type="text"
                        value={editFormData.admissionNo || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, admissionNo: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.admissionNo ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      />
                      {editRowErrors.admissionNo && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.admissionNo}</span>}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Date of Birth (YYYY-MM-DD)
                      </label>
                      <input
                        type="date"
                        value={editFormData.studentDob || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, studentDob: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.studentDob ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      />
                      {editRowErrors.studentDob && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.studentDob}</span>}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Assign Class *
                      </label>
                      <select
                        value={editFormData.classId || ""}
                        onChange={(e) => {
                          const cId = e.target.value;
                          const selected = activeClasses.find(c => c.id === cId);
                          setEditFormData({
                            ...editFormData,
                            classId: cId,
                            class: selected ? `${selected.name} - ${selected.section}` : "",
                            classNameResolved: selected ? `${selected.name} - ${selected.section}` : ""
                          });
                        }}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.class ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      >
                        <option value="">-- Select Class --</option>
                        {activeClasses.map(c => (
                          <option key={c.id} value={c.id}>{c.name} - Section {c.section}</option>
                        ))}
                      </select>
                      {editRowErrors.class && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.class}</span>}
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                        <label style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                          Residence Type *
                        </label>
                        {editingRow?.fieldErrors?.residenceType && (
                          <span style={{ fontSize: "0.75rem", color: "#f59e0b", fontWeight: 600 }}>
                            ⚠️ Unclear option in file — please confirm:
                          </span>
                        )}
                      </div>
                      <select
                        value={editFormData.residenceType === "HOSTEL" ? "HOSTEL" : "DAYSCHOLAR"}
                        onChange={(e) => {
                          setEditFormData({ ...editFormData, residenceType: e.target.value });
                          if (editRowErrors.residenceType) {
                            const errs = { ...editRowErrors };
                            delete errs.residenceType;
                            setEditRowErrors(errs);
                          }
                        }}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.residenceType ? "#f59e0b" : "var(--border-color)"}`,
                          background: "transparent",
                          color: "var(--foreground)"
                        }}
                      >
                        <option value="DAYSCHOLAR">Dayscholar (Day scholar)</option>
                        <option value="HOSTEL">Hostel (Hosteller)</option>
                      </select>
                      {editRowErrors.residenceType && (
                        <span style={{ color: "#ef4444", fontSize: "0.75rem", marginTop: "0.25rem", display: "block" }}>
                          {editRowErrors.residenceType}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ fontWeight: 700, fontSize: "0.9375rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.25rem", marginTop: "0.5rem" }}>
                    Parent Information
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Parent First Name *
                      </label>
                      <input
                        type="text"
                        value={editFormData.parentFirstName || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, parentFirstName: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.parentFirstName ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      />
                      {editRowErrors.parentFirstName && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.parentFirstName}</span>}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Parent Last Name *
                      </label>
                      <input
                        type="text"
                        value={editFormData.parentLastName || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, parentLastName: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.parentLastName ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      />
                      {editRowErrors.parentLastName && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.parentLastName}</span>}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Parent Email *
                      </label>
                      <input
                        type="email"
                        value={editFormData.parentEmail || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, parentEmail: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.parentEmail ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      />
                      {editRowErrors.parentEmail && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.parentEmail}</span>}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Parent Phone
                      </label>
                      <input
                        type="text"
                        value={editFormData.parentPhone || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, parentPhone: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.parentPhone ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      />
                      {editRowErrors.parentPhone && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.parentPhone}</span>}
                    </div>
                  </div>
                </>
              ) : type === "teacher" ? (
                /* TEACHER EDIT FORM */
                <>
                  <div style={{ fontWeight: 700, fontSize: "0.9375rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.25rem" }}>
                    Teacher Information
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        First Name *
                      </label>
                      <input
                        type="text"
                        value={editFormData.firstName || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, firstName: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.firstName ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      />
                      {editRowErrors.firstName && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.firstName}</span>}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Last Name *
                      </label>
                      <input
                        type="text"
                        value={editFormData.lastName || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.lastName ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      />
                      {editRowErrors.lastName && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.lastName}</span>}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Official Email *
                      </label>
                      <input
                        type="email"
                        value={editFormData.email || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.email ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      />
                      {editRowErrors.email && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.email}</span>}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Temporary Password *
                      </label>
                      <input
                        type="password"
                        value={editFormData.password || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.password ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      />
                      {editRowErrors.password && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.password}</span>}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Phone Number
                      </label>
                      <input
                        type="text"
                        value={editFormData.phone || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.phone ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      />
                      {editRowErrors.phone && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.phone}</span>}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Joining Date (YYYY-MM-DD)
                      </label>
                      <input
                        type="date"
                        value={editFormData.joiningDate || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, joiningDate: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.joiningDate ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      />
                      {editRowErrors.joiningDate && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.joiningDate}</span>}
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Qualification *
                      </label>
                      <input
                        type="text"
                        value={editFormData.qualification || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, qualification: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.qualification ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      />
                      {editRowErrors.qualification && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.qualification}</span>}
                    </div>
                  </div>
                </>
              ) : (
                /* ADMIN EDIT FORM */
                <>
                  <div style={{ fontWeight: 700, fontSize: "0.9375rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.25rem" }}>
                    Administrator Information
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={editFormData.name || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                        placeholder="e.g. John Doe"
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.name ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      />
                      {editRowErrors.name && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.name}</span>}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Google Gmail Address (@gmail.com) *
                      </label>
                      <input
                        type="email"
                        value={editFormData.email || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                        placeholder="admin@gmail.com"
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          border: `1px solid ${editRowErrors.email ? "#ef4444" : "var(--border-color)"}`,
                          background: "transparent"
                        }}
                      />
                      {editRowErrors.email && <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>{editRowErrors.email}</span>}
                      <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        Admins authenticate exclusively via Google OAuth SSO. Only @gmail.com and @googlemail.com are permitted.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: "1rem 1.5rem",
              borderTop: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "0.75rem",
              backgroundColor: "rgba(0,0,0,0.02)"
            }}>
              <button
                onClick={() => setEditingRow(null)}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "transparent",
                  color: "var(--foreground)",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRow}
                disabled={isPending}
                style={{
                  padding: "0.5rem 1.25rem",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "var(--primary, #6366f1)",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem"
                }}
              >
                {isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save & Revalidate Row
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* CONFIRMATION BEFORE DATABASE INSERTION MODAL */}
      {/* ======================================================== */}
      {showConfirmModal && scanResult && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: "1rem"
        }}>
          <div style={{
            backgroundColor: "var(--card-bg, #ffffff)",
            borderRadius: "16px",
            border: "1px solid var(--border-color, #e5e7eb)",
            width: "100%",
            maxWidth: "540px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
            overflow: "hidden"
          }}>
            <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(16, 185, 129, 0.15)",
                  color: "#10b981",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>
                    Confirm Database Import
                  </h3>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                    Please review the import summary before writing to PostgreSQL.
                  </p>
                </div>
              </div>
            </div>

            <div style={{ padding: "1.5rem" }}>
              <div style={{
                backgroundColor: "rgba(99, 102, 241, 0.05)",
                border: "1px solid rgba(99, 102, 241, 0.2)",
                borderRadius: "10px",
                padding: "1rem",
                marginBottom: "1.25rem"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Account Role:</span>
                  <span style={{ fontSize: "0.875rem", fontWeight: 700 }}>
                    {type === "student" ? "STUDENT & PARENT" : (type === "teacher" ? "TEACHER" : "ADMINISTRATOR")}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Rows to Import:</span>
                  <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#10b981" }}>
                    {scanResult.readyToImportCount} Records
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Skipped / Excluded Rows:</span>
                  <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#ef4444" }}>
                    {scanResult.totalRows - scanResult.readyToImportCount} Rows
                  </span>
                </div>
              </div>

              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {type === "student" ? (
                  <p style={{ margin: 0 }}>
                    • Valid students will be enrolled and linked to their specified class.<br />
                    • Sibling students sharing an existing parent email will be safely linked to that parent account without duplicating logins.<br />
                    • Passwords will be cryptographically hashed with bcrypt before storage.
                  </p>
                ) : type === "teacher" ? (
                  <p style={{ margin: 0 }}>
                    • Valid teachers will receive official accounts with the <code>TEACHER</code> role.<br />
                    • Credentials will be hashed with bcrypt. No plaintext credentials will be stored.
                  </p>
                ) : (
                  <p style={{ margin: 0 }}>
                    • Valid administrators will receive administrative accounts with the <code>ADMIN</code> role.<br />
                    • Google OAuth SSO will be enabled for verified Gmail addresses.
                  </p>
                )}
              </div>
            </div>

            <div style={{
              padding: "1rem 1.5rem",
              borderTop: "1px solid var(--border-color)",
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.75rem",
              backgroundColor: "rgba(0,0,0,0.02)"
            }}>
              <button
                onClick={() => setShowConfirmModal(false)}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "transparent",
                  color: "var(--foreground)",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={isPending}
                style={{
                  padding: "0.5rem 1.25rem",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "#10b981",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem"
                }}
              >
                {isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Confirm & Import Now
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
