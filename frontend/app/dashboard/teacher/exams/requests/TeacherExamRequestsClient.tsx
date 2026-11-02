"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  Layers,
  Search,
  Filter,
  Check,
  X,
  ChevronRight,
  BookOpen,
  Users,
  Send,
  Loader2
} from "lucide-react";
import styles from "./TeacherExamRequests.module.css";
import { Modal } from "@/frontend/components/ui";
import { createExamRequestWorkflowAction, ExamType } from "@/backend/api/actions/exams/examRequestWorkflowActions";

export type AvailableClass = {
  id: string;
  name: string;
  section: string;
  isClassTeacher: boolean;
  subjects: Array<{
    id: string;
    name: string;
    code: string;
    maxMarks: number;
    passMarks: number;
    teacherName?: string | null;
  }>;
};

export type ExamRequestRecord = {
  id: string;
  title: string;
  examType: string;
  classId: string;
  className: string;
  section: string;
  status: string; // PENDING_ADMIN, APPROVED, REJECTED, CANCELLED
  adminRemark?: string | null;
  createdAt: string;
  examDates?: string | null;
  remarks?: string | null;
  subjects: Array<{
    id: string;
    subjectId: string;
    subjectName: string;
    maxMarks: number;
    passMark: number;
    examDate?: string | null;
    teacherName?: string | null;
  }>;
  exam?: {
    id: string;
    status: string; // MARKS_IN_PROGRESS, SUBMITTED, VERIFIED, PUBLISHED
  } | null;
};

const EXAM_TYPE_OPTIONS: { value: ExamType; label: string }[] = [
  { value: "UNIT_TEST", label: "Unit Test" },
  { value: "QUARTERLY", label: "Quarterly Examination" },
  { value: "HALF_YEARLY", label: "Half-Yearly Examination" },
  { value: "ANNUAL", label: "Annual Examination" },
  { value: "MODEL", label: "Model Examination" },
  { value: "OTHER", label: "Other Test / Assessment" },
];

const PRESET_NAMES = [
  "Unit Test 1",
  "Unit Test 2",
  "Quarterly Exam",
  "Midterm Examination",
  "Half-Yearly Exam",
  "Model Exam",
  "Annual Examination",
];

export default function TeacherExamRequestsClient({
  classes,
  requests: initialRequests,
}: {
  classes: AvailableClass[];
  requests: ExamRequestRecord[];
}) {
  const router = useRouter();
  const [requests, setRequests] = useState<ExamRequestRecord[]>(initialRequests);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  // Form State
  const defaultClass = classes.find((c) => c.isClassTeacher) || classes[0];
  const [selectedClassId, setSelectedClassId] = useState<string>(defaultClass?.id || "");
  const [examName, setExamName] = useState<string>("");
  const [examType, setExamType] = useState<ExamType>("UNIT_TEST");
  const [remarks, setRemarks] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Selected subjects mapping in form
  const activeClass = useMemo(() => classes.find((c) => c.id === selectedClassId), [classes, selectedClassId]);

  const [subjectConfigs, setSubjectConfigs] = useState<
    Record<string, { selected: boolean; maxMarks: number; passMark: number; examDate: string }>
  >(() => {
    const initial: Record<string, { selected: boolean; maxMarks: number; passMark: number; examDate: string }> = {};
    if (defaultClass) {
      defaultClass.subjects.forEach((s) => {
        initial[s.id] = {
          selected: true,
          maxMarks: s.maxMarks || 100,
          passMark: s.passMarks || 35,
          examDate: "",
        };
      });
    }
    return initial;
  });

  // When class selection changes, initialize subject configs
  const handleClassChange = (newClassId: string) => {
    setSelectedClassId(newClassId);
    const cls = classes.find((c) => c.id === newClassId);
    if (cls) {
      const updated: Record<string, { selected: boolean; maxMarks: number; passMark: number; examDate: string }> = {};
      cls.subjects.forEach((s) => {
        updated[s.id] = {
          selected: true,
          maxMarks: s.maxMarks || 100,
          passMark: s.passMarks || 35,
          examDate: "",
        };
      });
      setSubjectConfigs(updated);
    }
  };

  const toggleSelectAll = (selectAll: boolean) => {
    if (!activeClass) return;
    const updated = { ...subjectConfigs };
    activeClass.subjects.forEach((s) => {
      if (updated[s.id]) {
        updated[s.id].selected = selectAll;
      }
    });
    setSubjectConfigs(updated);
  };

  const handleSubjectToggle = (subjectId: string) => {
    setSubjectConfigs((prev) => ({
      ...prev,
      [subjectId]: {
        ...prev[subjectId],
        selected: !prev[subjectId]?.selected,
      },
    }));
  };

  const handleSubjectFieldChange = (subjectId: string, field: "maxMarks" | "passMark" | "examDate", val: any) => {
    setSubjectConfigs((prev) => ({
      ...prev,
      [subjectId]: {
        ...prev[subjectId],
        [field]: val,
      },
    }));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!examName.trim()) {
      setErrorMessage("Please enter an examination name.");
      return;
    }

    if (!selectedClassId) {
      setErrorMessage("Please select a target class.");
      return;
    }

    const selectedSubjects = Object.entries(subjectConfigs)
      .filter(([_, conf]) => conf.selected)
      .map(([subId, conf]) => ({
        subjectId: subId,
        maxMarks: Number(conf.maxMarks) || 100,
        passMark: Number(conf.passMark) || 35,
        examDate: conf.examDate || undefined,
      }));

    if (selectedSubjects.length === 0) {
      setErrorMessage("Please select at least one subject for the examination.");
      return;
    }

    startTransition(async () => {
      const res = await createExamRequestWorkflowAction({
        name: examName.trim(),
        type: examType,
        classId: selectedClassId,
        subjects: selectedSubjects,
        remarks: remarks.trim() || undefined,
      });

      if (!res.success) {
        setErrorMessage(res.error || "Failed to submit exam request.");
      } else {
        setIsModalOpen(false);
        setExamName("");
        setRemarks("");
        router.refresh();
      }
    });
  };

  // Filtered requests list
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter === "PENDING" && r.status !== "PENDING_ADMIN" && r.status !== "PENDING") {
        return false;
      }
      if (statusFilter === "APPROVED" && r.status !== "APPROVED") {
        return false;
      }
      if (statusFilter === "REJECTED" && r.status !== "REJECTED" && r.status !== "DECLINED") {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = r.title.toLowerCase().includes(q);
        const matchesClass = `${r.className} ${r.section}`.toLowerCase().includes(q);
        if (!matchesTitle && !matchesClass) return false;
      }

      return true;
    });
  }, [requests, statusFilter, searchQuery]);

  return (
    <div className={styles.container}>
      {/* Header Banner */}
      <div className={styles.headerCard}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>
            <FileText size={26} color="#3b82f6" />
            Exam Requests
          </h1>
          <p className={styles.pageSubtitle}>
            Raise examination proposals for your classes, assign subject teachers, and track approval status.
          </p>
        </div>

        <button
          onClick={() => {
            setErrorMessage(null);
            setIsModalOpen(true);
          }}
          className={styles.createBtn}
        >
          <Plus size={18} />
          Create Exam Request
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className={styles.filterBar}>
        <div className={styles.pillsRow}>
          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground, #fff)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <Filter size={15} /> Status:
          </span>
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`${styles.pill} ${statusFilter === "ALL" ? styles.pillActive : ""}`}
          >
            All Requests ({requests.length})
          </button>
          <button
            onClick={() => setStatusFilter("PENDING")}
            className={`${styles.pill} ${statusFilter === "PENDING" ? styles.pillActive : ""}`}
          >
            Pending Approval ({requests.filter((r) => r.status === "PENDING_ADMIN" || r.status === "PENDING").length})
          </button>
          <button
            onClick={() => setStatusFilter("APPROVED")}
            className={`${styles.pill} ${statusFilter === "APPROVED" ? styles.pillActive : ""}`}
          >
            Approved ({requests.filter((r) => r.status === "APPROVED").length})
          </button>
          <button
            onClick={() => setStatusFilter("REJECTED")}
            className={`${styles.pill} ${statusFilter === "REJECTED" ? styles.pillActive : ""}`}
          >
            Declined ({requests.filter((r) => r.status === "REJECTED" || r.status === "DECLINED").length})
          </button>
        </div>

        <div style={{ position: "relative" }}>
          <input
            type="text"
            placeholder="Search requests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: "var(--card-bg, #1e293b)",
              border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
              color: "var(--foreground, #f8fafc)",
              padding: "0.45rem 0.85rem 0.45rem 2rem",
              borderRadius: "8px",
              fontSize: "0.85rem",
              outline: "none",
            }}
          />
          <Search size={14} style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary, #94a3b8)" }} />
        </div>
      </div>

      {/* Requests Grid */}
      {filteredRequests.length > 0 ? (
        <div className={styles.requestsGrid}>
          {filteredRequests.map((req) => {
            const isApproved = req.status === "APPROVED";
            const isRejected = req.status === "REJECTED" || req.status === "DECLINED";
            const isPendingAdmin = req.status === "PENDING_ADMIN" || req.status === "PENDING";

            // Determine timeline step
            let stepIndex = 1; // 1 = Requested
            if (isApproved) {
              stepIndex = 2; // Approved
              if (req.exam?.status === "SUBMITTED") stepIndex = 3;
              if (req.exam?.status === "VERIFIED" || req.exam?.status === "PUBLISHED") stepIndex = 4;
            }

            return (
              <div key={req.id} className={styles.requestCard}>
                <div className={styles.cardTop}>
                  <div>
                    <h3 className={styles.cardExamTitle}>{req.title}</h3>
                    <p className={styles.cardExamMeta}>
                      Class {req.className} - {req.section} • {req.examType.replace("_", " ")}
                    </p>
                  </div>
                  <div>
                    {isPendingAdmin && (
                      <span className={`${styles.statusBadge} ${styles.statusPending}`}>
                        <Clock size={12} /> Pending Admin
                      </span>
                    )}
                    {isApproved && (
                      <span className={`${styles.statusBadge} ${styles.statusApproved}`}>
                        <CheckCircle2 size={12} /> Approved
                      </span>
                    )}
                    {isRejected && (
                      <span className={`${styles.statusBadge} ${styles.statusRejected}`}>
                        <AlertCircle size={12} /> Declined
                      </span>
                    )}
                  </div>
                </div>

                {/* Status Timeline */}
                <div className={styles.timeline}>
                  <div className={`${styles.timelineStep} ${stepIndex >= 1 ? styles.stepCompleted : ""}`}>
                    <div className={styles.stepDot}>1</div>
                    <span className={styles.stepLabel}>Requested</span>
                  </div>
                  <div className={`${styles.timelineStep} ${isRejected ? styles.stepRejected : stepIndex >= 2 ? styles.stepCompleted : isPendingAdmin ? styles.stepActive : ""}`}>
                    <div className={styles.stepDot}>{isRejected ? "✕" : "2"}</div>
                    <span className={styles.stepLabel}>{isRejected ? "Declined" : "Approval"}</span>
                  </div>
                  <div className={`${styles.timelineStep} ${stepIndex >= 3 ? styles.stepCompleted : stepIndex === 2 ? styles.stepActive : ""}`}>
                    <div className={styles.stepDot}>3</div>
                    <span className={styles.stepLabel}>Marks Entry</span>
                  </div>
                  <div className={`${styles.timelineStep} ${stepIndex >= 4 ? styles.stepCompleted : stepIndex === 3 ? styles.stepActive : ""}`}>
                    <div className={styles.stepDot}>4</div>
                    <span className={styles.stepLabel}>Verified</span>
                  </div>
                </div>

                {/* Subjects breakdown */}
                <div>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary, #94a3b8)", textTransform: "uppercase" }}>
                    Included Subjects ({req.subjects.length}):
                  </span>
                  <div className={styles.subjectsList} style={{ marginTop: "0.35rem" }}>
                    {req.subjects.map((s) => (
                      <span key={s.id} className={styles.subjectChip} title={`Teacher: ${s.teacherName || "Assigned by system"}`}>
                        <BookOpen size={12} color="#60a5fa" />
                        {s.subjectName} ({s.maxMarks}m)
                      </span>
                    ))}
                  </div>
                </div>

                {/* Admin remark if rejected */}
                {isRejected && req.adminRemark && (
                  <div className={styles.adminRemarkBox}>
                    <strong>Admin Reason: </strong> {req.adminRemark}
                  </div>
                )}

                {/* Card footer */}
                <div style={{ marginTop: "auto", paddingTop: "0.5rem", borderTop: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.775rem", color: "var(--text-secondary, #94a3b8)" }}>
                  <span>Requested: {new Date(req.createdAt).toLocaleDateString()}</span>
                  {isApproved && (
                    <span style={{ color: "#34d399", fontWeight: 600 }}>Active in Exam Hub</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyCard}>
          <FileText size={48} style={{ opacity: 0.4 }} />
          <h3 style={{ margin: 0, color: "var(--foreground, #f8fafc)" }}>No Exam Requests Found</h3>
          <p style={{ margin: 0, maxWidth: "420px", fontSize: "0.875rem" }}>
            {searchQuery || statusFilter !== "ALL"
              ? "No requests match your current search and filter criteria."
              : "You have not raised any examination requests yet. Click \"Create Exam Request\" to propose an examination for your classes."}
          </p>
        </div>
      )}

      {/* Create Exam Request Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Exam / Test Request"
        size="lg"
      >
        <form onSubmit={handleCreateSubmit} className={styles.formSection}>
          {errorMessage && (
            <div style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "0.75rem 1rem", borderRadius: "8px", color: "#f87171", fontSize: "0.875rem" }}>
              {errorMessage}
            </div>
          )}

          <div className={styles.formGrid}>
            {/* Exam Name */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground, #fff)" }}>
                Examination Name *
              </label>
              <input
                type="text"
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                placeholder="e.g. Unit Test 1"
                required
                style={{
                  background: "var(--background, #0f172a)",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                  color: "var(--foreground, #fff)",
                  padding: "0.6rem 0.85rem",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  outline: "none",
                }}
              />
              {/* Presets */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.2rem" }}>
                {PRESET_NAMES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setExamName(name)}
                    style={{
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      color: "var(--text-secondary, #94a3b8)",
                      borderRadius: "4px",
                      padding: "0.15rem 0.45rem",
                      fontSize: "0.7rem",
                      cursor: "pointer",
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Exam Type */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground, #fff)" }}>
                Exam Type *
              </label>
              <select
                value={examType}
                onChange={(e) => setExamType(e.target.value as ExamType)}
                style={{
                  background: "var(--background, #0f172a)",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                  color: "var(--foreground, #fff)",
                  padding: "0.6rem 0.85rem",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                {EXAM_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Class Selection */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground, #fff)" }}>
              Target Class & Section *
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => handleClassChange(e.target.value)}
              style={{
                background: "var(--background, #0f172a)",
                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                color: "var(--foreground, #fff)",
                padding: "0.6rem 0.85rem",
                borderRadius: "8px",
                fontSize: "0.9rem",
                outline: "none",
                cursor: "pointer",
              }}
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} - {cls.section} {cls.isClassTeacher ? "(Your Assigned Class)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Subjects Configuration */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground, #fff)", textTransform: "uppercase" }}>
                Select Subjects & Criteria *
              </label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => toggleSelectAll(true)}
                  style={{ background: "none", border: "none", color: "#60a5fa", fontSize: "0.8rem", cursor: "pointer", textDecoration: "underline" }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => toggleSelectAll(false)}
                  style={{ background: "none", border: "none", color: "var(--text-secondary, #94a3b8)", fontSize: "0.8rem", cursor: "pointer" }}
                >
                  Clear
                </button>
              </div>
            </div>

            {activeClass && activeClass.subjects.length > 0 ? (
              <div style={{ maxHeight: "260px", overflowY: "auto", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))", borderRadius: "8px" }}>
                <table className={styles.subjectsTable}>
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }}></th>
                      <th>Subject</th>
                      <th>Assigned Teacher</th>
                      <th>Max Marks</th>
                      <th>Pass Mark</th>
                      <th>Exam Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeClass.subjects.map((sub) => {
                      const conf = subjectConfigs[sub.id] || { selected: false, maxMarks: 100, passMark: 35, examDate: "" };
                      return (
                        <tr key={sub.id} style={{ opacity: conf.selected ? 1 : 0.5 }}>
                          <td>
                            <input
                              type="checkbox"
                              checked={conf.selected}
                              onChange={() => handleSubjectToggle(sub.id)}
                              style={{ width: "16px", height: "16px", cursor: "pointer" }}
                            />
                          </td>
                          <td style={{ fontWeight: 600, color: "var(--foreground, #fff)" }}>
                            {sub.name} <span style={{ fontSize: "0.75rem", color: "var(--text-secondary, #94a3b8)" }}>({sub.code})</span>
                          </td>
                          <td style={{ color: "var(--text-secondary, #94a3b8)", fontSize: "0.8rem" }}>
                            {sub.teacherName || "Assigned by system"}
                          </td>
                          <td>
                            <input
                              type="number"
                              min={1}
                              max={1000}
                              value={conf.maxMarks}
                              onChange={(e) => handleSubjectFieldChange(sub.id, "maxMarks", Number(e.target.value))}
                              disabled={!conf.selected}
                              className={styles.numInput}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min={1}
                              max={conf.maxMarks}
                              value={conf.passMark}
                              onChange={(e) => handleSubjectFieldChange(sub.id, "passMark", Number(e.target.value))}
                              disabled={!conf.selected}
                              className={styles.numInput}
                            />
                          </td>
                          <td>
                            <input
                              type="date"
                              value={conf.examDate}
                              onChange={(e) => handleSubjectFieldChange(sub.id, "examDate", e.target.value)}
                              disabled={!conf.selected}
                              style={{
                                background: "var(--background, #0f172a)",
                                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                                color: "var(--foreground, #fff)",
                                padding: "0.35rem 0.5rem",
                                borderRadius: "6px",
                                fontSize: "0.8rem",
                                outline: "none",
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ fontSize: "0.85rem", color: "var(--danger, #ef4444)" }}>
                No subjects configured for this class. Please contact the administrator.
              </p>
            )}
          </div>

          {/* Remarks */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground, #fff)" }}>
              Remarks / Special Instructions (Optional)
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Covers Chapters 1 to 4. Conducted in Morning Session."
              rows={2}
              style={{
                background: "var(--background, #0f172a)",
                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                color: "var(--foreground, #fff)",
                padding: "0.6rem 0.85rem",
                borderRadius: "8px",
                fontSize: "0.875rem",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              disabled={isPending}
              style={{
                background: "transparent",
                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.2))",
                color: "var(--text-secondary, #94a3b8)",
                padding: "0.6rem 1.25rem",
                borderRadius: "8px",
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className={styles.createBtn}
            >
              {isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Submitting...
                </>
              ) : (
                <>
                  <Send size={16} /> Submit to Administrator
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
