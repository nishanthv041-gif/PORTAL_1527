"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, CheckCircle2, RotateCcw, AlertTriangle, Send, FileSpreadsheet,
  Printer, Search, Filter, ShieldCheck, ChevronLeft, ChevronRight, Edit3, X,
  Clock, AlertCircle, Sparkles, Layers, Award, Check
} from "lucide-react";
import styles from "./ConsolidatedMarksReview.module.css";
import {
  verifySubjectMarksAction,
  returnSubjectMarksAction,
  bulkVerifyAllSubmittedSubjectsAction,
  updateSingleMarkAuditAction,
  publishExamToReportCardsAction,
} from "@/backend/api/actions/exams/classTeacherMarksActions";
import { exportConsolidatedMarksToExcel } from "@/frontend/lib/exams/exportConsolidatedMarks";

export interface SubjectMeta {
  id: string; // examSubjectId
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  teacherId: string | null;
  teacherName: string;
  maxMarks: number;
  passMark: number;
  status: string; // PENDING | DRAFT | SUBMITTED | RETURNED | VERIFIED
  submittedAt: string | null;
  verifiedAt: string | null;
  returnRemark: string | null;
  stats?: {
    average: number;
    highest: number;
    lowest: number;
    passPercentage: number;
    submittedCount: number;
    absentCount: number;
  };
}

export interface StudentMarkEntry {
  markId?: string;
  marksObtained: number | null;
  isAbsent: boolean;
  remark?: string | null;
  isPass: boolean;
  isHighest: boolean;
  isMissing: boolean;
}

export interface StudentRowData {
  studentId: string;
  rollNumber: string;
  admissionNo: string;
  fullName: string;
  subjectScores: Record<string, StudentMarkEntry>;
  totalObtained: number;
  percentage: number;
  result: "PASS" | "FAIL";
  rank: number;
  hasMissingMarks: boolean;
  hasFailedSubjects: boolean;
}

export interface ExamMeta {
  id: string;
  name: string;
  date: string;
  status: string; // MARKS_IN_PROGRESS | SUBMITTED | VERIFIED | PUBLISHED
  isPublished: boolean;
  classId: string;
  className: string;
  section: string;
  classTeacherName: string;
  totalMaxMarks: number;
  totalSubjects: number;
  submittedCount: number;
  verifiedCount: number;
  returnedCount: number;
  pendingCount: number;
  canPublish: boolean;
}

interface Props {
  exam: ExamMeta;
  subjects: SubjectMeta[];
  initialRows: StudentRowData[];
}

export default function ConsolidatedMarksReviewClient({
  exam,
  subjects,
  initialRows,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "MISSING" | "FAILED">("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // View Mode: "table" | "cards"
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  // Return Subject Modal state
  const [returnModal, setReturnModal] = useState<{
    isOpen: boolean;
    subject: SubjectMeta | null;
    reason: string;
    error: string | null;
  }>({
    isOpen: false,
    subject: null,
    reason: "",
    error: null,
  });

  // Edit Single Mark Modal state
  const [editMarkModal, setEditMarkModal] = useState<{
    isOpen: boolean;
    subject: SubjectMeta | null;
    student: StudentRowData | null;
    currentScore: number | null;
    isAbsent: boolean;
    reason: string;
    error: string | null;
  }>({
    isOpen: false,
    subject: null,
    student: null,
    currentScore: null,
    isAbsent: false,
    reason: "",
    error: null,
  });

  // Action feedback
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return initialRows.filter((row) => {
      if (filterType === "MISSING" && !row.hasMissingMarks) return false;
      if (filterType === "FAILED" && !row.hasFailedSubjects) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = row.fullName.toLowerCase().includes(q);
        const matchRoll = row.rollNumber.toLowerCase().includes(q);
        if (!matchName && !matchRoll) return false;
      }

      return true;
    });
  }, [initialRows, filterType, searchQuery]);

  // Paginated rows for cards or compact mode
  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Handle Verify Subject
  const handleVerifySubject = (subject: SubjectMeta) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await verifySubjectMarksAction(subject.id);
      if (res.success) {
        setFeedback({ type: "success", message: `Marks for ${subject.subjectName} have been verified.` });
        router.refresh();
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to verify subject marks." });
      }
    });
  };

  // Open Return Modal
  const handleOpenReturnModal = (subject: SubjectMeta) => {
    setReturnModal({
      isOpen: true,
      subject,
      reason: "",
      error: null,
    });
  };

  // Confirm Return Subject
  const handleConfirmReturn = () => {
    if (!returnModal.subject) return;
    if (!returnModal.reason.trim()) {
      setReturnModal((prev) => ({ ...prev, error: "Please provide a reason for returning marks." }));
      return;
    }

    startTransition(async () => {
      const res = await returnSubjectMarksAction(returnModal.subject!.id, returnModal.reason);
      if (res.success) {
        setReturnModal({ isOpen: false, subject: null, reason: "", error: null });
        setFeedback({
          type: "success",
          message: `Returned ${returnModal.subject!.subjectName} marks to subject teacher for revision.`,
        });
        router.refresh();
      } else {
        setReturnModal((prev) => ({ ...prev, error: res.error || "Failed to return subject marks." }));
      }
    });
  };

  // Bulk Verify
  const handleBulkVerify = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await bulkVerifyAllSubmittedSubjectsAction(exam.id);
      if (res.success) {
        setFeedback({ type: "success", message: `Successfully verified all ${res.count} submitted subjects.` });
        router.refresh();
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to bulk verify subjects." });
      }
    });
  };

  // Open Edit Mark Modal
  const handleOpenEditMarkModal = (subject: SubjectMeta, student: StudentRowData) => {
    const entry = student.subjectScores[subject.id];
    setEditMarkModal({
      isOpen: true,
      subject,
      student,
      currentScore: entry?.marksObtained ?? null,
      isAbsent: Boolean(entry?.isAbsent),
      reason: "",
      error: null,
    });
  };

  // Confirm Edit Mark
  const handleConfirmEditMark = () => {
    if (!editMarkModal.subject || !editMarkModal.student) return;
    if (!editMarkModal.reason.trim()) {
      setEditMarkModal((prev) => ({ ...prev, error: "An audit reason is required to correct a student's marks." }));
      return;
    }

    startTransition(async () => {
      const res = await updateSingleMarkAuditAction({
        examSubjectId: editMarkModal.subject!.id,
        studentId: editMarkModal.student!.studentId,
        newScore: editMarkModal.isAbsent ? null : editMarkModal.currentScore,
        isAbsent: editMarkModal.isAbsent,
        reason: editMarkModal.reason,
      });

      if (res.success) {
        setEditMarkModal({
          isOpen: false,
          subject: null,
          student: null,
          currentScore: null,
          isAbsent: false,
          reason: "",
          error: null,
        });
        setFeedback({ type: "success", message: "Mark updated and audit entry recorded." });
        router.refresh();
      } else {
        setEditMarkModal((prev) => ({ ...prev, error: res.error || "Failed to update mark." }));
      }
    });
  };

  // Publish to Report Cards
  const handlePublishToReportCards = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await publishExamToReportCardsAction(exam.id);
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Official exam results published! Report cards generated for ${res.studentCount} students and notifications sent to parents.`,
        });
        router.refresh();
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to publish exam." });
      }
    });
  };

  // Export to Excel
  const handleExportExcel = () => {
    exportConsolidatedMarksToExcel(
      exam.name,
      exam.className,
      exam.section,
      subjects.map((s) => ({
        id: s.id,
        subjectName: s.subjectName,
        maxMarks: s.maxMarks,
        passMark: s.passMark,
      })),
      filteredRows
    );
  };

  // Export to PDF / Print
  const handlePrintPDF = () => {
    window.print();
  };

  const percentVerified = exam.totalSubjects > 0
    ? Math.round((exam.verifiedCount / exam.totalSubjects) * 100)
    : 0;

  return (
    <div className={styles.container}>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <Link href="/dashboard/teacher/exams" className={styles.backLink}>
          <ArrowLeft size={16} /> Back to Exams
        </Link>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => setViewMode(viewMode === "table" ? "cards" : "table")}
            className={styles.btnAction}
            style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
          >
            Switch to {viewMode === "table" ? "Card View" : "Table View"}
          </button>
        </div>
      </div>

      {/* Header Banner */}
      <div className={styles.headerCard}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
            <span className={styles.metaBadge}>
              Class {exam.className}-{exam.section}
            </span>
            <span style={{ color: "#64748b" }}>•</span>
            <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
              Class Teacher: <strong style={{ color: "#f8fafc" }}>{exam.classTeacherName}</strong>
            </span>
            <span style={{ color: "#64748b" }}>•</span>
            <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
              Status: <strong style={{ color: exam.isPublished ? "#10b981" : "#3b82f6" }}>{exam.status}</strong>
            </span>
          </div>

          <h1>{exam.name} — Consolidated Marks Review</h1>
          <div className={styles.metaRow}>
            <span>Enrolled Students: <strong style={{ color: "#f8fafc" }}>{initialRows.length}</strong></span>
            <span>•</span>
            <span>Total Subjects: <strong style={{ color: "#f8fafc" }}>{exam.totalSubjects}</strong></span>
            <span>•</span>
            <span>Max Score: <strong style={{ color: "#f8fafc" }}>{exam.totalMaxMarks}</strong></span>
          </div>
        </div>

        {/* Verification Progress Bar */}
        <div className={styles.progressContainer}>
          <div className={styles.progressLabel}>
            <span>Verification Progress</span>
            <strong style={{ color: exam.canPublish ? "#10b981" : "#60a5fa" }}>
              {exam.verifiedCount} of {exam.totalSubjects} verified ({percentVerified}%)
            </strong>
          </div>
          <div className={styles.progressBarTrack}>
            <div
              className={styles.progressBarFill}
              style={{
                width: `${percentVerified}%`,
                background: exam.canPublish ? "#10b981" : "#3b82f6",
              }}
            />
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
            {exam.submittedCount} awaiting verification • {exam.pendingCount} pending entry • {exam.returnedCount} returned
          </div>
        </div>
      </div>

      {/* Action / Alert Feedback */}
      {feedback && (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            fontSize: "0.875rem",
            background: feedback.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
            border: `1px solid ${feedback.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            color: feedback.type === "success" ? "#6ee7b7" : "#fca5a5",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {feedback.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Control & Filter Bar */}
      <div className={styles.controlBar}>
        <div className={styles.filterGroup}>
          <button
            type="button"
            className={`${styles.btnFilter} ${filterType === "ALL" ? styles.btnFilterActive : ""}`}
            onClick={() => setFilterType("ALL")}
          >
            All Students ({initialRows.length})
          </button>
          <button
            type="button"
            className={`${styles.btnFilter} ${filterType === "MISSING" ? styles.btnFilterActive : ""}`}
            onClick={() => setFilterType("MISSING")}
          >
            Show Missing Marks
          </button>
          <button
            type="button"
            className={`${styles.btnFilter} ${filterType === "FAILED" ? styles.btnFilterActive : ""}`}
            onClick={() => setFilterType("FAILED")}
          >
            Show Failed
          </button>

          <div style={{ position: "relative", minWidth: "220px", marginLeft: "0.4rem" }}>
            <Search size={15} style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student or roll no..."
              style={{
                width: "100%",
                padding: "0.45rem 0.75rem 0.45rem 2rem",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                background: "rgba(0, 0, 0, 0.25)",
                color: "#f8fafc",
                fontSize: "0.85rem",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <div className={styles.actionGroup}>
          {/* Bulk Verify All Submitted */}
          {exam.submittedCount > 0 && (
            <button
              type="button"
              onClick={handleBulkVerify}
              disabled={isPending}
              className={styles.btnAction}
              title="Verify all subjects currently in Submitted status"
            >
              <CheckCircle2 size={15} color="#10b981" />
              <span>Verify All Submitted ({exam.submittedCount})</span>
            </button>
          )}

          {/* Export to Excel */}
          <button
            type="button"
            onClick={handleExportExcel}
            className={styles.btnAction}
            title="Download consolidated mark sheet as Excel file"
          >
            <FileSpreadsheet size={15} color="#3b82f6" />
            <span>Export Excel</span>
          </button>

          {/* Export / Print PDF */}
          <button
            type="button"
            onClick={handlePrintPDF}
            className={styles.btnAction}
            title="Print or export mark sheet to PDF"
          >
            <Printer size={15} />
            <span>PDF Print</span>
          </button>

          {/* Publish to Report Card */}
          <button
            type="button"
            onClick={handlePublishToReportCards}
            disabled={isPending || !exam.canPublish || exam.isPublished}
            className={styles.btnPublish}
            title={
              exam.isPublished
                ? "Already published to parents & report cards"
                : exam.canPublish
                ? "Publish verified marks to report cards & notify parents"
                : "All subjects must be verified before publishing"
            }
          >
            <Send size={15} />
            <span>{exam.isPublished ? "Published to Report Card" : "Publish to Report Card"}</span>
          </button>
        </div>
      </div>

      {/* Main Grid View */}
      {viewMode === "table" ? (
        <div className={styles.gridWrapper}>
          <table className={styles.gridTable}>
            <thead>
              <tr>
                <th className={styles.stickyCol1} style={{ textAlign: "center" }}>Roll</th>
                <th className={styles.stickyCol2}>Student Name</th>

                {/* Subject Columns */}
                {subjects.map((sub) => {
                  const isSubmitted = sub.status === "SUBMITTED";
                  const isVerified = sub.status === "VERIFIED";
                  const isReturned = sub.status === "RETURNED";

                  return (
                    <th key={sub.id} style={{ minWidth: "150px" }}>
                      <div className={styles.subHeader}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "#f8fafc" }}>{sub.subjectName}</span>
                          <span
                            className={`${styles.subStatusPill} ${
                              isVerified
                                ? styles.subVerified
                                : isSubmitted
                                ? styles.subSubmitted
                                : isReturned
                                ? styles.subReturned
                                : styles.subPending
                            }`}
                          >
                            {sub.status}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: 500, textTransform: "none" }}>
                          Teacher: {sub.teacherName} (Max: {sub.maxMarks})
                        </div>

                        {/* Per-subject actions in column header */}
                        <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.25rem" }}>
                          {isSubmitted && (
                            <button
                              type="button"
                              onClick={() => handleVerifySubject(sub)}
                              disabled={isPending}
                              style={{
                                padding: "0.2rem 0.45rem",
                                borderRadius: "4px",
                                background: "rgba(16, 185, 129, 0.2)",
                                color: "#34d399",
                                border: "1px solid rgba(16, 185, 129, 0.4)",
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Verify
                            </button>
                          )}
                          {(isSubmitted || isVerified) && (
                            <button
                              type="button"
                              onClick={() => handleOpenReturnModal(sub)}
                              disabled={isPending}
                              style={{
                                padding: "0.2rem 0.45rem",
                                borderRadius: "4px",
                                background: "rgba(239, 68, 68, 0.15)",
                                color: "#f87171",
                                border: "1px solid rgba(239, 68, 68, 0.3)",
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Return
                            </button>
                          )}
                        </div>
                      </div>
                    </th>
                  );
                })}

                <th style={{ textAlign: "right", minWidth: "100px" }}>Total</th>
                <th style={{ textAlign: "right", minWidth: "100px" }}>%</th>
                <th style={{ textAlign: "center", minWidth: "70px" }}>Rank</th>
                <th style={{ textAlign: "center", minWidth: "90px" }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.studentId}>
                  <td className={styles.stickyCol1} style={{ textAlign: "center", fontWeight: 700, color: "#cbd5e1" }}>
                    {row.rollNumber}
                  </td>
                  <td className={styles.stickyCol2}>
                    <span style={{ fontWeight: 600 }}>{row.fullName}</span>
                    <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                      Adm: {row.admissionNo}
                    </div>
                  </td>

                  {/* Subject Scores */}
                  {subjects.map((sub) => {
                    const sc = row.subjectScores[sub.id];

                    if (!sc || sc.isMissing) {
                      return (
                        <td
                          key={sub.id}
                          className={`${styles.markCell} ${styles.markMissing}`}
                          onClick={() => handleOpenEditMarkModal(sub, row)}
                          title="Missing mark: Click to enter or correct"
                        >
                          <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>MISSING</span>
                        </td>
                      );
                    }

                    if (sc.isAbsent) {
                      return (
                        <td
                          key={sub.id}
                          className={styles.markCell}
                          onClick={() => handleOpenEditMarkModal(sub, row)}
                          title="Marked Absent: Click to edit"
                        >
                          <span className={styles.markAbsent}>AB</span>
                        </td>
                      );
                    }

                    const isBelowPass = sc.marksObtained !== null && sc.marksObtained < sub.passMark;

                    return (
                      <td
                        key={sub.id}
                        className={styles.markCell}
                        onClick={() => handleOpenEditMarkModal(sub, row)}
                        title={`Score: ${sc.marksObtained}/${sub.maxMarks}. Click to edit.`}
                      >
                        <span className={isBelowPass ? styles.markFail : sc.isHighest ? styles.markHighest : ""}>
                          {sc.marksObtained}
                        </span>
                        {sc.isHighest && <span className={styles.badgeTop}>TOP</span>}
                      </td>
                    );
                  })}

                  <td style={{ textAlign: "right", fontWeight: 700, color: "#f8fafc" }}>
                    {row.totalObtained}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>
                    {row.percentage}%
                  </td>
                  <td style={{ textAlign: "center", fontWeight: 700, color: row.rank === 1 ? "#fbbf24" : "#cbd5e1" }}>
                    #{row.rank}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span
                      style={{
                        padding: "0.2rem 0.55rem",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        background: row.result === "PASS" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                        color: row.result === "PASS" ? "#34d399" : "#f87171",
                      }}
                    >
                      {row.result}
                    </span>
                  </td>
                </tr>
              ))}

              {/* Bottom Subject Statistics Row */}
              <tr className={styles.statsRow}>
                <td className={styles.stickyCol1} style={{ textAlign: "center" }}>STATS</td>
                <td className={styles.stickyCol2}>Class Average &amp; Pass %</td>

                {subjects.map((sub) => {
                  const st = sub.stats;
                  return (
                    <td key={sub.id} style={{ textAlign: "right", fontSize: "0.78rem" }}>
                      <div>Avg: <strong style={{ color: "#f8fafc" }}>{st?.average ?? 0}</strong></div>
                      <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                        Top: {st?.highest ?? 0} • Pass: {st?.passPercentage ?? 0}%
                      </div>
                    </td>
                  );
                })}

                <td colSpan={4} style={{ textAlign: "right", color: "#94a3b8", fontSize: "0.8rem" }}>
                  {filteredRows.length} students rendered
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        /* Mobile / Paginated Cards View */
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
            {paginatedRows.map((row) => (
              <div key={row.studentId} className={styles.studentCard}>
                <div className={styles.studentCardHeader}>
                  <div>
                    <div className={styles.studentCardName}>{row.fullName}</div>
                    <div className={styles.studentCardRoll}>
                      Roll #{row.rollNumber} • Adm: {row.admissionNo}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.95rem", fontWeight: 800, color: row.rank === 1 ? "#fbbf24" : "#f8fafc" }}>
                      Rank #{row.rank}
                    </div>
                    <span
                      style={{
                        padding: "0.15rem 0.45rem",
                        borderRadius: "4px",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        background: row.result === "PASS" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                        color: row.result === "PASS" ? "#34d399" : "#f87171",
                      }}
                    >
                      {row.result} ({row.percentage}%)
                    </span>
                  </div>
                </div>

                <div className={styles.studentCardScores}>
                  {subjects.map((sub) => {
                    const sc = row.subjectScores[sub.id];
                    return (
                      <div
                        key={sub.id}
                        className={styles.scoreItem}
                        onClick={() => handleOpenEditMarkModal(sub, row)}
                        style={{ cursor: "pointer" }}
                      >
                        <span className={styles.scoreItemName}>{sub.subjectName}</span>
                        <span className={styles.scoreItemVal}>
                          {sc?.isMissing ? (
                            <span style={{ color: "#ef4444" }}>MISSING</span>
                          ) : sc?.isAbsent ? (
                            <span style={{ color: "#94a3b8" }}>ABSENT</span>
                          ) : (
                            sc?.marksObtained ?? "-"
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className={styles.paginationRow}>
              <span>
                Page {currentPage} of {totalPages} ({filteredRows.length} students)
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className={styles.btnAction}
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className={styles.btnAction}
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Return Subject Remark Modal */}
      {returnModal.isOpen && returnModal.subject && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "1rem" }}>
          <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "14px", width: "100%", maxWidth: "520px", padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <RotateCcw size={18} color="#ef4444" />
                <h3 style={{ margin: 0, fontSize: "1.15rem", color: "#f8fafc" }}>Return Marks to Subject Teacher</h3>
              </div>
              <button
                type="button"
                onClick={() => setReturnModal({ isOpen: false, subject: null, reason: "", error: null })}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: "0 0 1rem 0", fontSize: "0.875rem", color: "#cbd5e1" }}>
              Returning <strong>{returnModal.subject.subjectName}</strong> marks to teacher{" "}
              <strong>{returnModal.subject.teacherName}</strong>. The subject will become editable again for revision.
            </p>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "0.4rem" }}>
                Reason for Return (Mandatory):
              </label>
              <textarea
                value={returnModal.reason}
                onChange={(e) => setReturnModal((prev) => ({ ...prev, reason: e.target.value, error: null }))}
                placeholder="e.g. Roll #12 marks seems lower than midterm, please verify question 3 scoring..."
                rows={3}
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(0,0,0,0.3)",
                  color: "#f8fafc",
                  fontSize: "0.85rem",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {returnModal.error && (
              <div style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(239, 68, 68, 0.15)", color: "#fca5a5", fontSize: "0.8rem", marginBottom: "1rem" }}>
                {returnModal.error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={() => setReturnModal({ isOpen: false, subject: null, reason: "", error: null })}
                className={styles.btnAction}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReturn}
                disabled={isPending}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "8px",
                  background: "#ef4444",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Single Mark Audit Modal */}
      {editMarkModal.isOpen && editMarkModal.subject && editMarkModal.student && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "1rem" }}>
          <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "14px", width: "100%", maxWidth: "520px", padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Edit3 size={18} color="#3b82f6" />
                <h3 style={{ margin: 0, fontSize: "1.15rem", color: "#f8fafc" }}>Edit Mark with Audit Reason</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditMarkModal({ isOpen: false, subject: null, student: null, currentScore: null, isAbsent: false, reason: "", error: null })}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: "0 0 1rem 0", fontSize: "0.875rem", color: "#cbd5e1" }}>
              Editing mark for <strong>{editMarkModal.student.fullName}</strong> (Roll #{editMarkModal.student.rollNumber}) in <strong>{editMarkModal.subject.subjectName}</strong> (Max: {editMarkModal.subject.maxMarks}).
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "0.35rem" }}>
                  Marks Obtained:
                </label>
                <input
                  type="number"
                  min="0"
                  max={editMarkModal.subject.maxMarks}
                  step="any"
                  disabled={editMarkModal.isAbsent}
                  value={editMarkModal.isAbsent ? "" : editMarkModal.currentScore ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : parseFloat(e.target.value);
                    setEditMarkModal((prev) => ({ ...prev, currentScore: v, error: null }));
                  }}
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "rgba(0,0,0,0.3)",
                    color: "#f8fafc",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "0.35rem" }}>
                  Absent:
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", marginTop: "0.4rem", color: "#f8fafc", fontSize: "0.85rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={editMarkModal.isAbsent}
                    onChange={(e) => setEditMarkModal((prev) => ({ ...prev, isAbsent: e.target.checked, error: null }))}
                    style={{ width: "18px", height: "18px", accentColor: "#ef4444" }}
                  />
                  <span>Mark as Absent</span>
                </label>
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "0.4rem" }}>
                Reason for Correction (Mandatory Audit Log):
              </label>
              <textarea
                value={editMarkModal.reason}
                onChange={(e) => setEditMarkModal((prev) => ({ ...prev, reason: e.target.value, error: null }))}
                placeholder="e.g. Recalculated re-evaluation marks after teacher verification..."
                rows={2}
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(0,0,0,0.3)",
                  color: "#f8fafc",
                  fontSize: "0.85rem",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {editMarkModal.error && (
              <div style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(239, 68, 68, 0.15)", color: "#fca5a5", fontSize: "0.8rem", marginBottom: "1rem" }}>
                {editMarkModal.error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={() => setEditMarkModal({ isOpen: false, subject: null, student: null, currentScore: null, isAbsent: false, reason: "", error: null })}
                className={styles.btnAction}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmEditMark}
                disabled={isPending}
                className={styles.btnAction}
                style={{ background: "#3b82f6", color: "#ffffff", borderColor: "#3b82f6" }}
              >
                Save Correction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
