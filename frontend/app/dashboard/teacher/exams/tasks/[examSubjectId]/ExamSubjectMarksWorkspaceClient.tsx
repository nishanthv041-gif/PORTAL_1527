"use client";

import { useState, useRef, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Download, Upload, Save, Send, CheckCircle2,
  AlertCircle, RotateCcw, Clock, Lock, FileSpreadsheet, X, AlertTriangle, Loader2
} from "lucide-react";
import styles from "./MarksWorkspace.module.css";
import {
  saveMarksDraftAction,
  submitMarksToClassTeacherAction,
  submitIndividualStudentMarkAction,
  MarkEntryItem,
} from "@/backend/api/actions/exams/marksEntryActions";
import {
  generateMarksExcelTemplate,
  parseAndValidateMarksExcel,
  ExcelValidationResult,
  TaskMetadata,
} from "@/frontend/lib/exams/excelMarksUtil";

export interface StudentRowItem {
  studentId: string;
  rollNumber: string;
  admissionNo: string;
  fullName: string;
  marksObtained: number | null;
  isAbsent: boolean;
  remark: string;
}

export interface WorkspaceTaskData {
  id: string;
  examId: string;
  examName: string;
  examStatus: string;
  examDate: string;
  classId: string;
  className: string;
  section: string;
  classTeacherName: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  teacherId: string | null;
  assignedTeacherName: string;
  maxMarks: number;
  passMark: number;
  status: string; // PENDING | DRAFT | SUBMITTED | RETURNED | VERIFIED
  submittedAt: string | null;
  verifiedAt: string | null;
  returnRemark: string | null;
  isEditable: boolean;
}

interface Props {
  task: WorkspaceTaskData;
  initialEntries: StudentRowItem[];
}

export default function ExamSubjectMarksWorkspaceClient({
  task,
  initialEntries,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  // Local state for rows
  const [entries, setEntries] = useState<StudentRowItem[]>(initialEntries);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [sendingStudentIds, setSendingStudentIds] = useState<Record<string, "sending" | "sent" | "error">>({});

  // Submit Modal state
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [missingList, setMissingList] = useState<Array<{ rollNumber: string; name: string }>>([]);

  // Excel Preview Modal state
  const [excelPreview, setExcelPreview] = useState<ExcelValidationResult | null>(null);
  const [isParsingExcel, setIsParsingExcel] = useState(false);

  // Statistics
  const stats = useMemo(() => {
    let entered = 0;
    let absent = 0;
    let missing = 0;

    for (const e of entries) {
      if (e.isAbsent) {
        absent++;
      } else if (e.marksObtained !== null && e.marksObtained !== undefined && !isNaN(e.marksObtained)) {
        entered++;
      } else {
        missing++;
      }
    }

    const total = entries.length;
    return {
      total,
      entered,
      absent,
      missing,
      completed: total > 0 && entered + absent === total,
    };
  }, [entries]);

  // Input Change Handlers
  const handleMarksChange = (studentId: string, valStr: string) => {
    setSaveStatus("idle");
    setEntries((prev) =>
      prev.map((row) => {
        if (row.studentId !== studentId) return row;
        if (valStr === "") {
          return { ...row, marksObtained: null };
        }
        const num = parseFloat(valStr);
        if (isNaN(num)) {
          return { ...row, marksObtained: null };
        }
        return { ...row, marksObtained: num };
      })
    );
  };

  const handleAbsentToggle = (studentId: string, isChecked: boolean) => {
    setSaveStatus("idle");
    setEntries((prev) =>
      prev.map((row) => {
        if (row.studentId !== studentId) return row;
        return {
          ...row,
          isAbsent: isChecked,
          marksObtained: isChecked ? null : row.marksObtained,
        };
      })
    );
  };

  const handleRemarkChange = (studentId: string, remark: string) => {
    setSaveStatus("idle");
    setEntries((prev) =>
      prev.map((row) => {
        if (row.studentId !== studentId) return row;
        return { ...row, remark };
      })
    );
  };

  // Keyboard navigation: Enter or ArrowDown focuses next row's marks input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, currentIndex: number) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      const nextInput = document.getElementById(`marks-input-${currentIndex + 1}`);
      if (nextInput) {
        (nextInput as HTMLInputElement).focus();
        (nextInput as HTMLInputElement).select();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevInput = document.getElementById(`marks-input-${currentIndex - 1}`);
      if (prevInput) {
        (prevInput as HTMLInputElement).focus();
        (prevInput as HTMLInputElement).select();
      }
    }
  };

  // 1. Download Excel Template
  const handleDownloadTemplate = () => {
    const meta: TaskMetadata = {
      id: task.id,
      examId: task.examId,
      examName: task.examName,
      className: task.className,
      section: task.section,
      subjectName: task.subjectName,
      subjectCode: task.subjectCode,
      maxMarks: task.maxMarks,
      passMark: task.passMark,
    };

    const studentsData = entries.map((e) => ({
      id: e.studentId,
      rollNumber: e.rollNumber,
      admissionNo: e.admissionNo,
      fullName: e.fullName,
      marksObtained: e.marksObtained,
      isAbsent: e.isAbsent,
      remark: e.remark,
    }));

    const buffer = generateMarksExcelTemplate(meta, studentsData);
    const blob = new Blob([buffer as any], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Marks_${task.className}-${task.section}_${task.subjectName}_${task.examName}.xlsx`.replace(/\s+/g, "_");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 2. Upload Excel File
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingExcel(true);
    setSaveMessage(null);

    try {
      const meta: TaskMetadata = {
        id: task.id,
        examId: task.examId,
        examName: task.examName,
        className: task.className,
        section: task.section,
        subjectName: task.subjectName,
        maxMarks: task.maxMarks,
        passMark: task.passMark,
      };

      const studentsData = entries.map((s) => ({
        id: s.studentId,
        rollNumber: s.rollNumber,
        admissionNo: s.admissionNo,
        fullName: s.fullName,
      }));

      const res = await parseAndValidateMarksExcel(file, meta, studentsData);
      setExcelPreview(res);
    } catch (err) {
      console.error(err);
      setSaveMessage("Failed to parse Excel file. Please ensure it is a valid .xlsx file.");
    } finally {
      setIsParsingExcel(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Confirm Import from Excel Preview
  const handleConfirmExcelImport = () => {
    if (!excelPreview) return;

    const rowMap = new Map<string, (typeof excelPreview.rows)[0]>();
    for (const r of excelPreview.rows) {
      if (r.isValid && r.studentId) {
        rowMap.set(r.studentId, r);
      }
    }

    setEntries((prev) =>
      prev.map((item) => {
        const imported = rowMap.get(item.studentId);
        if (!imported) return item;
        return {
          ...item,
          marksObtained: imported.isAbsent ? null : imported.marksObtained,
          isAbsent: imported.isAbsent,
          remark: imported.remark || item.remark,
        };
      })
    );

    setExcelPreview(null);
    setSaveStatus("saved");
    setSaveMessage(`Successfully imported ${excelPreview.stats.validRows} student records from Excel.`);
  };

  // 3. Save Draft Action
  const handleSaveDraft = () => {
    if (!task.isEditable) return;
    setSaveStatus("saving");
    setSaveMessage(null);

    const payload: MarkEntryItem[] = entries.map((e) => ({
      studentId: e.studentId,
      marksObtained: e.marksObtained,
      isAbsent: e.isAbsent,
      remark: e.remark,
    }));

    startTransition(async () => {
      const res = await saveMarksDraftAction(task.id, payload);
      if (res.success) {
        setSaveStatus("saved");
        setSaveMessage("Draft saved successfully.");
      } else {
        setSaveStatus("error");
        setSaveMessage(res.error || "Failed to save draft.");
      }
    });
  };

  // 4. Send Individual Student Mark to Class Teacher
  const handleSendIndividualStudent = async (studentId: string) => {
    const row = entries.find((e) => e.studentId === studentId);
    if (!row) return;

    const hasScore = row.marksObtained !== null && row.marksObtained !== undefined && !isNaN(Number(row.marksObtained));
    if (!row.isAbsent && !hasScore) {
      alert("Please enter a mark score or check Absent before sending this student to the Class Teacher.");
      return;
    }

    setSendingStudentIds((prev) => ({ ...prev, [studentId]: "sending" }));

    try {
      const res = await submitIndividualStudentMarkAction(task.id, {
        studentId: row.studentId,
        marksObtained: row.marksObtained,
        isAbsent: row.isAbsent,
        remark: row.remark,
      });

      if (res.success) {
        setSendingStudentIds((prev) => ({ ...prev, [studentId]: "sent" }));
        setSaveMessage(`Mark for ${row.fullName} (${row.isAbsent ? "ABSENT" : `${res.score ?? row.marksObtained}/${task.maxMarks}`}) sent to Class Teacher and added to test grid!`);
        setTimeout(() => {
          setSendingStudentIds((prev) => {
            const copy = { ...prev };
            delete copy[studentId];
            return copy;
          });
        }, 3500);
      } else {
        setSendingStudentIds((prev) => ({ ...prev, [studentId]: "error" }));
        alert(res.error || "Failed to send mark.");
      }
    } catch (err) {
      console.error(err);
      setSendingStudentIds((prev) => ({ ...prev, [studentId]: "error" }));
      alert("An unexpected error occurred while sending mark.");
    }
  };

  // 5. Open Submit Confirmation Modal
  const handleOpenSubmitModal = () => {
    setSubmitError(null);
    const missing: Array<{ rollNumber: string; name: string }> = [];

    for (const e of entries) {
      const hasScore = e.marksObtained !== null && e.marksObtained !== undefined && !isNaN(e.marksObtained);
      if (!e.isAbsent && !hasScore) {
        missing.push({ rollNumber: e.rollNumber, name: e.fullName });
      }
    }

    setMissingList(missing);
    setIsSubmitModalOpen(true);
  };

  // Confirm Submission to Class Teacher (allows partial)
  const handleConfirmSubmit = () => {
    const validCount = entries.filter((e) => e.isAbsent || (e.marksObtained !== null && e.marksObtained !== undefined && !isNaN(Number(e.marksObtained)))).length;
    if (validCount === 0) {
      setSubmitError("No student marks have been entered. Please enter at least one student's mark.");
      return;
    }

    setSubmitError(null);
    const payload: MarkEntryItem[] = entries.map((e) => ({
      studentId: e.studentId,
      marksObtained: e.marksObtained,
      isAbsent: e.isAbsent,
      remark: e.remark,
    }));

    startTransition(async () => {
      const res = await submitMarksToClassTeacherAction(task.id, payload, true);
      if (res.success) {
        setIsSubmitModalOpen(false);
        router.refresh();
      } else {
        setSubmitError(res.error || "Failed to submit marks.");
        if (res.missingStudents) {
          setMissingList(res.missingStudents);
        }
      }
    });
  };

  return (
    <div className={styles.container}>
      {/* Top Breadcrumb */}
      <div className={styles.topBar}>
        <Link href="/dashboard/teacher/exams/tasks" className={styles.backLink}>
          <ArrowLeft size={16} /> Back to Marks Tasks
        </Link>
        <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
          Task ID: {task.id.slice(0, 10)}...
        </span>
      </div>

      {/* Task Summary Banner */}
      <div className={styles.bannerCard}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
            <span className={`${styles.badge} ${styles.badgeInfo}`}>
              Class {task.className}-{task.section}
            </span>
            <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>•</span>
            <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
              Class Teacher: <strong style={{ color: "#e2e8f0" }}>{task.classTeacherName}</strong>
            </span>
          </div>

          <h1 className={styles.examTitle}>{task.subjectName} Marks Entry</h1>
          <div className={styles.subjectMeta}>
            <span>Exam: <strong style={{ color: "#f8fafc" }}>{task.examName}</strong></span>
            <span>•</span>
            <span>Max Marks: <strong style={{ color: "#f8fafc" }}>{task.maxMarks}</strong></span>
            <span>•</span>
            <span>Pass Mark: <strong style={{ color: "#f8fafc" }}>{task.passMark}</strong></span>
          </div>
        </div>

        <div>
          {task.status === "VERIFIED" && (
            <span className={`${styles.badge} ${styles.badgeSuccess}`}>
              <CheckCircle2 size={16} /> Verified by Class Teacher
            </span>
          )}
          {task.status === "SUBMITTED" && (
            <span className={`${styles.badge} ${styles.badgeInfo}`}>
              <Clock size={16} /> Submitted to Class Teacher (Locked)
            </span>
          )}
          {task.status === "RETURNED" && (
            <span className={`${styles.badge} ${styles.badgeDanger}`}>
              <RotateCcw size={16} /> Action Required: Returned
            </span>
          )}
          {task.status === "DRAFT" && (
            <span className={`${styles.badge} ${styles.badgeWarning}`}>
              <AlertCircle size={16} /> In Progress (Draft)
            </span>
          )}
          {task.status === "PENDING" && (
            <span className={`${styles.badge} ${styles.badgeWarning}`}>
              <Clock size={16} /> Pending Entry
            </span>
          )}
        </div>
      </div>

      {/* Alerts for Status */}
      {task.status === "RETURNED" && task.returnRemark && (
        <div className={`${styles.alertBox} ${styles.alertDanger}`}>
          <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            <strong>Returned by Class Teacher ({task.classTeacherName}):</strong>
            <p style={{ margin: "4px 0 0 0" }}>{task.returnRemark}</p>
            <p style={{ margin: "4px 0 0 0", fontSize: "0.825rem", color: "#f87171" }}>
              Please revise the marked values and click &quot;Submit to Class Teacher&quot; once corrected.
            </p>
          </div>
        </div>
      )}

      {!task.isEditable && (
        <div className={`${styles.alertBox} ${styles.alertInfo}`}>
          <Lock size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            <strong>Marks Task is Locked</strong>
            <p style={{ margin: "2px 0 0 0", fontSize: "0.85rem" }}>
              These marks have already been submitted to the Class Teacher. If any modifications are needed, please contact the Class Teacher ({task.classTeacherName}) to return the subject for revision.
            </p>
          </div>
        </div>
      )}

      {/* Save Status Feedback */}
      {saveMessage && (
        <div
          className={`${styles.alertBox} ${
            saveStatus === "error" ? styles.alertDanger : styles.alertSuccess
          }`}
        >
          {saveStatus === "error" ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{saveMessage}</span>
        </div>
      )}

      {/* Action Toolbar */}
      <div className={styles.actionToolbar}>
        <div className={styles.statsCounter}>
          <span>
            Entered: <strong className={styles.counterBadge}>{stats.entered}</strong> / {stats.total}
          </span>
          <span>
            Absent: <strong className={styles.counterBadge} style={{ color: "#f87171" }}>{stats.absent}</strong>
          </span>
          <span>
            Missing:{" "}
            <strong
              className={styles.counterBadge}
              style={{ color: stats.missing > 0 ? "#fbbf24" : "#34d399" }}
            >
              {stats.missing}
            </strong>
          </span>
        </div>

        <div className={styles.toolbarActions}>
          {/* Download Excel Template */}
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className={styles.btnSecondary}
            title="Download an official Excel template pre-filled with student roll numbers"
          >
            <Download size={15} />
            <span>Excel Template</span>
          </button>

          {/* Upload Filled Excel */}
          {task.isEditable && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsingExcel}
                className={styles.btnSecondary}
                title="Upload filled Excel file for validation & import"
              >
                {isParsingExcel ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={15} />}
                <span>Import Excel</span>
              </button>
            </>
          )}

          {/* Save Draft */}
          {task.isEditable && (
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isPending || saveStatus === "saving"}
              className={styles.btnPrimary}
            >
              {isPending || saveStatus === "saving" ? (
                <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <Save size={15} />
              )}
              <span>Save Draft</span>
            </button>
          )}

          {/* Submit to Class Teacher */}
          {task.isEditable && (
            <button
              type="button"
              onClick={handleOpenSubmitModal}
              disabled={isPending}
              className={styles.btnSubmit}
            >
              <Send size={15} />
              <span>Submit to Class Teacher</span>
            </button>
          )}
        </div>
      </div>

      {/* Spreadsheet Table */}
      <div className={styles.tableContainer}>
        <table className={styles.spreadsheetTable}>
          <thead>
            <tr>
              <th style={{ width: "60px", textAlign: "center" }}>#</th>
              <th style={{ width: "120px" }}>Roll No</th>
              <th style={{ minWidth: "180px" }}>Student Name</th>
              <th style={{ width: "130px", textAlign: "right" }}>Marks (Max: {task.maxMarks})</th>
              <th style={{ width: "90px", textAlign: "center" }}>Absent</th>
              <th style={{ minWidth: "180px" }}>Remarks</th>
              <th style={{ width: "120px", textAlign: "center" }}>Send to CT</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((row, idx) => {
              const isInvalidScore =
                row.marksObtained !== null &&
                (row.marksObtained < 0 || row.marksObtained > task.maxMarks);

              const studentStatus = sendingStudentIds[row.studentId];

              return (
                <tr key={row.studentId} className={row.isAbsent ? styles.rowAbsent : ""}>
                  <td style={{ textAlign: "center", color: "#64748b", fontSize: "0.8rem" }}>
                    {idx + 1}
                  </td>
                  <td style={{ fontWeight: 600, color: "#f8fafc" }}>
                    {row.rollNumber}
                  </td>
                  <td>
                    <span style={{ fontWeight: 500 }}>{row.fullName}</span>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Adm: {row.admissionNo}
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <input
                      id={`marks-input-${idx}`}
                      type="number"
                      step="any"
                      min="0"
                      max={task.maxMarks}
                      inputMode="decimal"
                      disabled={!task.isEditable || row.isAbsent}
                      value={row.marksObtained ?? ""}
                      onChange={(e) => handleMarksChange(row.studentId, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, idx)}
                      placeholder={row.isAbsent ? "ABSENT" : "-"}
                      className={`${styles.marksInput} ${isInvalidScore ? styles.marksInputInvalid : ""}`}
                    />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={row.isAbsent}
                      disabled={!task.isEditable}
                      onChange={(e) => handleAbsentToggle(row.studentId, e.target.checked)}
                      className={styles.absentCheckbox}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      disabled={!task.isEditable}
                      value={row.remark}
                      onChange={(e) => handleRemarkChange(row.studentId, e.target.value)}
                      placeholder="Optional remark..."
                      className={styles.remarksInput}
                    />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      disabled={!task.isEditable || studentStatus === "sending"}
                      onClick={() => handleSendIndividualStudent(row.studentId)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "0.32rem 0.65rem",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: task.isEditable ? "pointer" : "not-allowed",
                        border: "1px solid",
                        backgroundColor:
                          studentStatus === "sent"
                            ? "rgba(16, 185, 129, 0.2)"
                            : "rgba(59, 130, 246, 0.15)",
                        borderColor:
                          studentStatus === "sent"
                            ? "rgba(16, 185, 129, 0.4)"
                            : "rgba(59, 130, 246, 0.35)",
                        color: studentStatus === "sent" ? "#34d399" : "#60a5fa",
                        transition: "all 0.15s ease",
                      }}
                      title="Send this student's mark directly to the Class Teacher and add to test grid"
                    >
                      {studentStatus === "sending" ? (
                        <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                      ) : studentStatus === "sent" ? (
                        <CheckCircle2 size={12} />
                      ) : (
                        <Send size={12} />
                      )}
                      <span>
                        {studentStatus === "sending"
                          ? "Sending..."
                          : studentStatus === "sent"
                          ? "Sent ✓"
                          : "Send"}
                      </span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Excel Preview Modal */}
      {excelPreview && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <FileSpreadsheet size={20} color="#3b82f6" />
                <h3 className={styles.modalTitle}>Excel Import Preview</h3>
              </div>
              <button
                type="button"
                onClick={() => setExcelPreview(null)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            {!excelPreview.isCompatibleTemplate ? (
              <div className={`${styles.alertBox} ${styles.alertDanger}`}>
                <AlertCircle size={20} style={{ flexShrink: 0 }} />
                <div>
                  <strong>Incompatible Template</strong>
                  <p style={{ margin: "4px 0 0 0" }}>{excelPreview.templateError}</p>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
                  <div style={{ background: "rgba(0,0,0,0.3)", padding: "0.6rem", borderRadius: "8px", textAlign: "center" }}>
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Valid Rows</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#10b981" }}>
                      {excelPreview.stats.validRows} / {excelPreview.stats.totalRows}
                    </div>
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.3)", padding: "0.6rem", borderRadius: "8px", textAlign: "center" }}>
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Absentees</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#f59e0b" }}>
                      {excelPreview.stats.absentCount}
                    </div>
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.3)", padding: "0.6rem", borderRadius: "8px", textAlign: "center" }}>
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Errors</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 700, color: excelPreview.stats.errorCount > 0 ? "#ef4444" : "#10b981" }}>
                      {excelPreview.stats.errorCount}
                    </div>
                  </div>
                </div>

                {excelPreview.errors.length > 0 && (
                  <div style={{ marginBottom: "1rem", maxHeight: "150px", overflowY: "auto" }}>
                    <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#f87171", marginBottom: "0.35rem" }}>
                      Validation Issues Detected:
                    </div>
                    {excelPreview.errors.map((err, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: "0.78rem",
                          background: "rgba(239, 68, 68, 0.1)",
                          color: "#fca5a5",
                          padding: "0.35rem 0.6rem",
                          borderRadius: "4px",
                          marginBottom: "0.3rem",
                        }}
                      >
                        Row {err.row}: {err.message}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ maxHeight: "250px", overflowY: "auto", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px" }}>
                  <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.05)", textAlign: "left" }}>
                        <th style={{ padding: "0.5rem" }}>Roll</th>
                        <th style={{ padding: "0.5rem" }}>Name</th>
                        <th style={{ padding: "0.5rem", textAlign: "right" }}>Marks</th>
                        <th style={{ padding: "0.5rem", textAlign: "center" }}>Absent</th>
                        <th style={{ padding: "0.5rem" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {excelPreview.rows.slice(0, 50).map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding: "0.45rem" }}>{r.rollNumber}</td>
                          <td style={{ padding: "0.45rem" }}>{r.studentName}</td>
                          <td style={{ padding: "0.45rem", textAlign: "right" }}>
                            {r.isAbsent ? "ABSENT" : r.marksObtained ?? "-"}
                          </td>
                          <td style={{ padding: "0.45rem", textAlign: "center" }}>
                            {r.isAbsent ? "YES" : "NO"}
                          </td>
                          <td style={{ padding: "0.45rem" }}>
                            {r.isValid ? (
                              <span style={{ color: "#10b981", fontWeight: 600 }}>Valid</span>
                            ) : (
                              <span style={{ color: "#ef4444" }}>{r.error}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => setExcelPreview(null)}
                className={styles.btnSecondary}
              >
                Cancel
              </button>
              {excelPreview.isCompatibleTemplate && excelPreview.stats.validRows > 0 && (
                <button
                  type="button"
                  onClick={handleConfirmExcelImport}
                  className={styles.btnPrimary}
                >
                  Confirm Import ({excelPreview.stats.validRows} Records)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {isSubmitModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Send size={20} color="#10b981" />
                <h3 className={styles.modalTitle}>Submit Marks to Class Teacher</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSubmitModalOpen(false)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <div>
              <p style={{ margin: "0 0 1rem 0", fontSize: "0.9rem", color: "#cbd5e1" }}>
                You are about to submit marks for <strong>{task.subjectName}</strong> ({task.className}-{task.section}) to the Class Teacher: <strong>{task.classTeacherName}</strong>.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
                <div style={{ background: "rgba(0,0,0,0.3)", padding: "0.6rem", borderRadius: "8px", textAlign: "center" }}>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Total Students</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#f8fafc" }}>
                    {stats.total}
                  </div>
                </div>
                <div style={{ background: "rgba(0,0,0,0.3)", padding: "0.6rem", borderRadius: "8px", textAlign: "center" }}>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Marks Entered</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#10b981" }}>
                    {stats.entered}
                  </div>
                </div>
                <div style={{ background: "rgba(0,0,0,0.3)", padding: "0.6rem", borderRadius: "8px", textAlign: "center" }}>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Absent Count</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#f59e0b" }}>
                    {stats.absent}
                  </div>
                </div>
              </div>

              {missingList.length > 0 ? (
                <div className={`${styles.alertBox} ${styles.alertWarning}`} style={{ flexDirection: "column", background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", color: "#fbbf24" }}>
                    <AlertTriangle size={18} />
                    <strong>Partial Submission: {missingList.length} student(s) not yet entered</strong>
                  </div>
                  <p style={{ margin: "4px 0 6px 0", fontSize: "0.85rem", color: "#cbd5e1" }}>
                    The <strong>{stats.entered + stats.absent} entered student marks</strong> will be submitted to the Class Teacher and added to the test grid. You can return later to submit the remaining {missingList.length} student(s).
                  </p>
                  <div style={{ maxHeight: "100px", overflowY: "auto", width: "100%", fontSize: "0.8rem", color: "#94a3b8" }}>
                    {missingList.map((m, idx) => (
                      <div key={idx} style={{ padding: "2px 0" }}>
                        • Roll {m.rollNumber}: {m.name}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ padding: "0.75rem", borderRadius: "8px", background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.3)", color: "#34d399", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                  <CheckCircle2 size={16} />
                  <span>All <strong>{stats.total}</strong> students have marks or are marked absent. Ready for full submission!</span>
                </div>
              )}

              {submitError && (
                <div className={`${styles.alertBox} ${styles.alertDanger}`} style={{ marginTop: "0.75rem" }}>
                  <AlertCircle size={18} />
                  <span>{submitError}</span>
                </div>
              )}

              <div style={{ marginTop: "1rem", fontSize: "0.825rem", color: "#94a3b8" }}>
                <strong>Note:</strong> Submitted marks immediately appear in the Class Teacher&apos;s consolidated marks review grid for verification.
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => setIsSubmitModalOpen(false)}
                className={styles.btnSecondary}
              >
                Back to Editing
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                disabled={isPending || (stats.entered + stats.absent === 0)}
                className={styles.btnSubmit}
              >
                {isPending ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={16} />}
                <span>
                  {missingList.length > 0
                    ? `Submit Available (${stats.entered + stats.absent} Students)`
                    : "Confirm & Submit All"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

