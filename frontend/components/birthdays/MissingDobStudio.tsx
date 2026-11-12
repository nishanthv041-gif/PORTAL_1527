"use client";

import React, { useState, useTransition, useMemo } from "react";
import {
  Calendar,
  Check,
  Upload,
  RefreshCw,
  FileSpreadsheet,
  Search,
  X,
  Clock,
  ArrowRight,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import {
  AlertCircleIcon as AlertCircle,
  CheckCircle2Icon as CheckCircle2,
  XCircleIcon as XCircle,
  Share2Icon as Share2,
} from "@/frontend/components/birthdays/BirthdayIcons";
import {
  saveStudentDobAction,
  saveMultipleStudentDobsAction,
  previewClassExcelDobAction,
  commitClassExcelDobAction,
  reviewDobChangeApprovalAction,
} from "@/backend/api/actions/dashboard/admin/birthdays/actions";
import { TeacherClass } from "@/lib/teacher/getTeacherClasses";
import styles from "./BirthdayStudio.module.css";

export interface StudentDobRecord {
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

interface MissingDobStudioProps {
  userRole: "ADMIN" | "TEACHER";
  classes: TeacherClass[];
  selectedClassId: string;
  initialStudents: StudentDobRecord[];
  initialPercentage: number;
  initialMissingCount: number;
  initialCompletedCount: number;
  settings: {
    teacherCanEditExistingDob: boolean;
    requireAdminApprovalForDobChange: boolean;
    whatsappShortcut?: boolean;
  };
  canEditDob?: boolean;
  isClassTeacher?: boolean;
  adminLogs?: any[];
  onClassChange?: (classId: string) => void;
}

export default function MissingDobStudio({
  userRole,
  classes,
  selectedClassId,
  initialStudents,
  initialPercentage,
  initialMissingCount,
  initialCompletedCount,
  settings,
  canEditDob = true,
  isClassTeacher = true,
  adminLogs = [],
  onClassChange,
}: MissingDobStudioProps) {
  const [currentClassId, setCurrentClassId] = useState(selectedClassId);
  const [students, setStudents] = useState<StudentDobRecord[]>(initialStudents);
  const [activeTab, setActiveTab] = useState<"missing" | "all" | "audit">("missing");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  // Map of studentId -> draft date string (YYYY-MM-DD)
  const [draftDates, setDraftDates] = useState<{ [studentId: string]: string }>({});
  const [statusMessages, setStatusMessages] = useState<{
    [studentId: string]: { type: "success" | "error" | "pending"; text: string };
  }>({});

  // Excel Modal state
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [excelPreview, setExcelPreview] = useState<{
    valid: Array<{ studentId: string; studentName: string; rollNumber: string; oldDob: string | null; newDob: string }>;
    unchanged: Array<{ studentId: string; studentName: string; rollNumber: string; currentDob: string }>;
    errors: Array<{ rowNumber: number; identifier: string; reason: string }>;
  } | null>(null);

  // Stats calculation
  const missingCount = students.filter((s) => !s.hasDob).length;
  const completedCount = students.length - missingCount;
  const percentage = students.length > 0 ? Math.round((completedCount / students.length) * 100) : 100;

  // Filtered list
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (activeTab === "missing" && s.hasDob) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = s.name.toLowerCase().includes(q);
        const matchRoll = s.rollNumber.toLowerCase().includes(q);
        const matchAdm = s.admissionNo.toLowerCase().includes(q);
        if (!matchName && !matchRoll && !matchAdm) return false;
      }
      return true;
    });
  }, [students, activeTab, searchQuery]);

  const changedCount = Object.keys(draftDates).length;

  const handleDateChange = (studentId: string, val: string) => {
    const original = students.find((s) => s.id === studentId)?.dateOfBirth || "";
    if (val === original) {
      const next = { ...draftDates };
      delete next[studentId];
      setDraftDates(next);
    } else {
      setDraftDates((prev) => ({ ...prev, [studentId]: val }));
    }
  };

  const handleSaveSingle = (studentId: string) => {
    const draftDate = draftDates[studentId];
    if (!draftDate) return;

    startTransition(async () => {
      const res = await saveStudentDobAction({
        studentId,
        classId: currentClassId,
        dateOfBirth: draftDate,
      });

      if (res.error) {
        setStatusMessages((prev) => ({
          ...prev,
          [studentId]: { type: "error", text: res.error || "Save failed" },
        }));
      } else if (res.pendingApproval) {
        setStatusMessages((prev) => ({
          ...prev,
          [studentId]: { type: "pending", text: "Submitted for Admin approval ⏳" },
        }));
        const next = { ...draftDates };
        delete next[studentId];
        setDraftDates(next);
      } else if (res.success) {
        setStudents((prev) =>
          prev.map((s) =>
            s.id === studentId
              ? { ...s, dateOfBirth: draftDate, hasDob: true }
              : s
          )
        );
        setStatusMessages((prev) => ({
          ...prev,
          [studentId]: {
            type: "success",
            text: res.isBirthdayToday ? "Saved & Birthday Wish Sent! 🎂" : "Saved successfully! ✓",
          },
        }));
        const next = { ...draftDates };
        delete next[studentId];
        setDraftDates(next);

        setTimeout(() => {
          setStatusMessages((prev) => {
            const copy = { ...prev };
            delete copy[studentId];
            return copy;
          });
        }, 4000);
      }
    });
  };

  const handleSaveAll = () => {
    const updates = Object.entries(draftDates).map(([studentId, dateOfBirth]) => ({
      studentId,
      dateOfBirth,
    }));
    if (updates.length === 0) return;

    startTransition(async () => {
      const res = await saveMultipleStudentDobsAction({
        classId: currentClassId,
        updates,
      });

      if (res.success) {
        setStudents((prev) =>
          prev.map((s) => {
            const update = updates.find((u) => u.studentId === s.id);
            if (update) {
              return { ...s, dateOfBirth: update.dateOfBirth, hasDob: true };
            }
            return s;
          })
        );
        setDraftDates({});
      }
    });
  };

  const handleExcelPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excelFile) return;

    setIsUploading(true);
    const fd = new FormData();
    fd.append("file", excelFile);

    try {
      const res = await previewClassExcelDobAction(fd, currentClassId);
      if (res.error) {
        alert(res.error);
      } else if (res.preview) {
        setExcelPreview(res.preview);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to parse Excel file.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleExcelCommit = async () => {
    if (!excelPreview || excelPreview.valid.length === 0) return;

    setIsUploading(true);
    try {
      const itemsToSave = excelPreview.valid.map((v) => ({
        studentId: v.studentId,
        dateOfBirth: v.newDob,
      }));
      const res = await commitClassExcelDobAction(currentClassId, itemsToSave);
      if (res.success) {
        setStudents((prev) =>
          prev.map((s) => {
            const update = itemsToSave.find((u) => u.studentId === s.id);
            if (update) {
              return { ...s, dateOfBirth: update.dateOfBirth, hasDob: true };
            }
            return s;
          })
        );
        setIsExcelModalOpen(false);
        setExcelPreview(null);
        setExcelFile(null);
      } else {
        alert(res.errors?.join(", ") || "Failed to commit Excel records.");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to commit records.");
    } finally {
      setIsUploading(false);
    }
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const buildWhatsAppRequestLink = (s: StudentDobRecord) => {
    if (!s.parentPhone) return "#";
    const cleanPhone = s.parentPhone.replace(/[^0-9]/g, "");
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const text = encodeURIComponent(
      `Dear ${s.parentName || "Parent"}, kindly share the Date of Birth for ${s.name} (Roll #${s.rollNumber}) to update official school records and birthday celebrations at SRT School. Thank you!`
    );
    return `https://wa.me/${formattedPhone}?text=${text}`;
  };

  return (
    <div className={styles.container}>
      {/* Hero Header Banner */}
      {/* Hero Banner */}
      <section className={styles.heroBanner}>
        <div className={styles.heroContent}>
          <div className={styles.heroText}>
            <div className={styles.badgePill}>
              <Calendar size={14} />
              <span>SRT Public School • Records Management</span>
            </div>
            <h1 className={styles.heroTitle}>Date of Birth Directory</h1>
            <p className={styles.heroSubtitle}>
              Maintain student birth dates to ensure timely classroom birthday celebrations, parent greetings, and official school records.
            </p>
          </div>

          <div className={styles.heroActions}>
            {classes.length > 1 && (
              <div className={styles.classSelectWrapper}>
                <span className={styles.classSelectLabel}>Class:</span>
                <select
                  value={currentClassId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setCurrentClassId(newId);
                    if (onClassChange) onClassChange(newId);
                  }}
                  className={styles.classSelect}
                >
                  {classes.map((c) => (
                    <option key={c.classId} value={c.classId}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {canEditDob && (
              <button
                type="button"
                onClick={() => setIsExcelModalOpen(true)}
                className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
              >
                <FileSpreadsheet size={16} />
                <span>Fill from Excel</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Progress & Search Section */}
      <div className={styles.progressCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--foreground)" }}>{percentage}%</span>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginLeft: "0.5rem" }}>
              ({completedCount} of {students.length} students completed)
            </span>
          </div>
          {missingCount > 0 ? (
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#f59e0b" }}>
              ⚠️ {missingCount} {missingCount === 1 ? "student needs" : "students need"} a date of birth
            </span>
          ) : (
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#10b981" }}>
              ✓ All students in this class have a date of birth!
            </span>
          )}
        </div>

        <div className={styles.progressBarTrack}>
          <div className={styles.progressBarFill} style={{ width: `${percentage}%` }} />
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div className={styles.tabBar}>
          <button
            onClick={() => startTransition(() => setActiveTab("missing"))}
            className={`${styles.tabBtn} ${activeTab === "missing" ? styles.tabBtnActive : ""}`}
          >
            <span>Missing Dates</span>
            {missingCount > 0 && (
              <span className={`${styles.tabBadge} ${activeTab === "missing" ? "" : styles.tabBadgeAlert}`}>
                {missingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => startTransition(() => setActiveTab("all"))}
            className={`${styles.tabBtn} ${activeTab === "all" ? styles.tabBtnActive : ""}`}
          >
            <span>All Students</span>
            <span className={styles.tabBadge}>{students.length}</span>
          </button>
        </div>

        <div className={styles.searchBarWrapper} style={{ minWidth: "260px" }}>
          <Search size={16} style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student name, roll number..."
            className={styles.searchInput}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Floating Save All Changes bar */}
      {changedCount > 0 && (
        <div
          style={{
            position: "sticky",
            top: "1rem",
            zIndex: 40,
            padding: "0.85rem 1.25rem",
            borderRadius: "14px",
            background: "var(--card-bg)",
            border: "2px solid var(--primary)",
            boxShadow: "0 8px 30px rgba(59, 130, 246, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--foreground)" }}>
            💾 You have {changedCount} unsaved date {changedCount === 1 ? "change" : "changes"}
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={() => setDraftDates({})}
              className={styles.footerBtn}
              style={{ minHeight: "38px" }}
            >
              Discard
            </button>
            <button
              onClick={handleSaveAll}
              disabled={isPending}
              className={`${styles.footerBtn} ${styles.footerBtnPrimary}`}
              style={{ minHeight: "38px" }}
            >
              {isPending ? "Saving All..." : "Save All Changes"}
            </button>
          </div>
        </div>
      )}

      {/* Student List */}
      {filteredStudents.length === 0 ? (
        <div className={styles.emptyState}>
          <div style={{ fontSize: "2.5rem" }}>🎉</div>
          <h3 className={styles.emptyTitle}>
            {searchQuery
              ? "No students match your search"
              : activeTab === "missing"
              ? "No missing birth dates in this class!"
              : "No students found in this class."}
          </h3>
          <p className={styles.emptyDesc}>
            {searchQuery
              ? "Try adjusting your search terms."
              : "Every student has an updated date of birth on record."}
          </p>
        </div>
      ) : (
        <div className={styles.cardsGrid}>
          {filteredStudents.map((student) => {
            const draft = draftDates[student.id];
            const currentVal = draft !== undefined ? draft : student.dateOfBirth || "";
            const isDirty = draft !== undefined && draft !== (student.dateOfBirth || "");
            const statusMsg = statusMessages[student.id];

            return (
              <div key={student.id} className={styles.celebrantCard}>
                <div className={styles.celebrantHeader}>
                  <div className={`${styles.avatarCircle} ${styles.avatarCircleDob}`}>{getInitials(student.name)}</div>
                  <div className={styles.celebrantMeta}>
                    <h3 className={styles.celebrantName}>{student.name}</h3>
                    <div className={styles.celebrantRoll}>
                      Roll #{student.rollNumber} • Adm #{student.admissionNo}
                    </div>
                    {student.parentName && (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                        Parent: <strong>{student.parentName}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Date Input Field */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>
                    DATE OF BIRTH (DD/MM/YYYY):
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                      type="date"
                      value={currentVal}
                      disabled={!canEditDob}
                      onChange={(e) => handleDateChange(student.id, e.target.value)}
                      className={styles.dateInput}
                      style={{ flex: 1 }}
                    />
                    {isDirty && (
                      <button
                        onClick={() => handleSaveSingle(student.id)}
                        disabled={isPending}
                        className={`${styles.footerBtn} ${styles.footerBtnPrimary}`}
                        style={{ minHeight: "44px", flexShrink: 0 }}
                      >
                        <Check size={16} />
                        <span>Save</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Status Feedback */}
                {statusMsg ? (
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color:
                        statusMsg.type === "success"
                          ? "#10b981"
                          : statusMsg.type === "error"
                          ? "#ef4444"
                          : "#f59e0b",
                    }}
                  >
                    {statusMsg.text}
                  </div>
                ) : student.hasDob ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", color: "#10b981", fontWeight: 600 }}>
                    <CheckCircle2 size={14} />
                    <span>On Record</span>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", color: "#f59e0b", fontWeight: 600 }}>
                      <AlertCircle size={14} />
                      <span>Missing Date of Birth</span>
                    </div>

                    {student.parentPhone && (
                      <a
                        href={buildWhatsAppRequestLink(student)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.whatsAppAskBtn}
                        title="Send WhatsApp request to parent for Date of Birth"
                      >
                        <Share2 size={12} />
                        <span>Ask Parent via WhatsApp</span>
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* EXCEL IMPORT MODAL */}
      {isExcelModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsExcelModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Import Birth Dates from Excel</h3>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                  Upload a spreadsheet with Roll No / Name and Date of Birth
                </div>
              </div>
              <button
                onClick={() => setIsExcelModalOpen(false)}
                className={styles.iconBtn}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {!excelPreview ? (
                <form onSubmit={handleExcelPreview} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div
                    style={{
                      border: "2px dashed var(--border-color)",
                      borderRadius: "16px",
                      padding: "2rem 1.5rem",
                      textAlign: "center",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.75rem",
                      background: "rgba(0,0,0,0.01)",
                    }}
                  >
                    <FileSpreadsheet size={36} style={{ color: "var(--primary)" }} />
                    <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--foreground)" }}>
                      Choose an Excel (.xlsx, .xls) or CSV file
                    </div>
                    <input
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
                      style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={() => setIsExcelModalOpen(false)}
                      className={styles.footerBtn}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!excelFile || isUploading}
                      className={`${styles.footerBtn} ${styles.footerBtnPrimary}`}
                    >
                      {isUploading ? "Reading File..." : "Preview Import"}
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    <strong>{excelPreview.valid.length}</strong> new or updated dates found,{" "}
                    <strong>{excelPreview.unchanged.length}</strong> already up to date,{" "}
                    <strong>{excelPreview.errors.length}</strong> errors.
                  </div>

                  {excelPreview.valid.length > 0 && (
                    <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "10px" }}>
                      <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "rgba(0,0,0,0.03)", textAlign: "left" }}>
                            <th style={{ padding: "0.5rem" }}>Student</th>
                            <th style={{ padding: "0.5rem" }}>Roll #</th>
                            <th style={{ padding: "0.5rem" }}>New Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {excelPreview.valid.map((v, i) => (
                            <tr key={i} style={{ borderTop: "1px solid var(--border-color)" }}>
                              <td style={{ padding: "0.5rem" }}>{v.studentName}</td>
                              <td style={{ padding: "0.5rem" }}>{v.rollNumber}</td>
                              <td style={{ padding: "0.5rem", fontWeight: 700, color: "#10b981" }}>{v.newDob}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={() => setExcelPreview(null)}
                      className={styles.footerBtn}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleExcelCommit}
                      disabled={isUploading || excelPreview.valid.length === 0}
                      className={`${styles.footerBtn} ${styles.footerBtnPrimary}`}
                    >
                      {isUploading ? "Saving..." : `Apply ${excelPreview.valid.length} Dates`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
