"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  BookOpen, Search, Filter, CheckCircle2, Clock, AlertCircle,
  RotateCcw, ArrowRight, ShieldAlert, GraduationCap, Calendar, FileText
} from "lucide-react";
import styles from "./TeacherMarksTasks.module.css";

interface MarksTaskItem {
  id: string;
  examId: string;
  examName: string;
  examDate: string;
  className: string;
  section: string;
  classId: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  maxMarks: number;
  passMark: number;
  status: string; // PENDING | DRAFT | SUBMITTED | RETURNED | VERIFIED
  submittedAt: string | null;
  verifiedAt: string | null;
  returnRemark: string | null;
  totalStudents: number;
  enteredMarksCount: number;
  isCompleted: boolean;
}

export default function TeacherMarksTasksClient({
  tasks,
}: {
  tasks: MarksTaskItem[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Status filter
      if (statusFilter !== "ALL" && task.status !== statusFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchSubject = task.subjectName.toLowerCase().includes(q);
        const matchClass = `${task.className} ${task.section}`.toLowerCase().includes(q);
        const matchExam = task.examName.toLowerCase().includes(q);
        if (!matchSubject && !matchClass && !matchExam) return false;
      }
      return true;
    });
  }, [tasks, statusFilter, searchQuery]);

  const counts = useMemo(() => {
    return {
      all: tasks.length,
      pending: tasks.filter((t) => t.status === "PENDING").length,
      draft: tasks.filter((t) => t.status === "DRAFT").length,
      submitted: tasks.filter((t) => t.status === "SUBMITTED").length,
      returned: tasks.filter((t) => t.status === "RETURNED").length,
      verified: tasks.filter((t) => t.status === "VERIFIED").length,
    };
  }, [tasks]);

  const renderBadge = (status: string) => {
    switch (status) {
      case "VERIFIED":
        return <span className={`${styles.statusBadge} ${styles.badgeVerified}`}><CheckCircle2 size={13} /> Verified</span>;
      case "SUBMITTED":
        return <span className={`${styles.statusBadge} ${styles.badgeSubmitted}`}><Clock size={13} /> Submitted</span>;
      case "RETURNED":
        return <span className={`${styles.statusBadge} ${styles.badgeReturned}`}><RotateCcw size={13} /> Returned</span>;
      case "DRAFT":
        return <span className={`${styles.statusBadge} ${styles.badgeDraft}`}><AlertCircle size={13} /> In Progress</span>;
      default:
        return <span className={`${styles.statusBadge} ${styles.badgePending}`}><Clock size={13} /> Pending</span>;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1>My Marks Tasks</h1>
          <p>Enter, draft, import Excel, and submit subject marks to Class Teachers for verification.</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link
            href="/dashboard/teacher/exams"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.55rem 1rem",
              borderRadius: "8px",
              background: "rgba(255, 255, 255, 0.08)",
              color: "#cbd5e1",
              textDecoration: "none",
              fontSize: "0.85rem",
              fontWeight: 500,
            }}
          >
            <Calendar size={16} /> Exam Schedule
          </Link>
          <Link
            href="/dashboard/teacher/exams/requests"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.55rem 1rem",
              borderRadius: "8px",
              background: "rgba(255, 255, 255, 0.08)",
              color: "#cbd5e1",
              textDecoration: "none",
              fontSize: "0.85rem",
              fontWeight: 500,
            }}
          >
            <FileText size={16} /> Exam Requests
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className={styles.filterBar}>
        <div className={styles.filterPills}>
          <button
            type="button"
            className={`${styles.pill} ${statusFilter === "ALL" ? styles.pillActive : ""}`}
            onClick={() => setStatusFilter("ALL")}
          >
            All Tasks ({counts.all})
          </button>
          <button
            type="button"
            className={`${styles.pill} ${statusFilter === "RETURNED" ? styles.pillActive : ""}`}
            onClick={() => setStatusFilter("RETURNED")}
            style={counts.returned > 0 ? { borderColor: "#ef4444", color: "#f87171" } : {}}
          >
            Returned ({counts.returned})
          </button>
          <button
            type="button"
            className={`${styles.pill} ${statusFilter === "PENDING" ? styles.pillActive : ""}`}
            onClick={() => setStatusFilter("PENDING")}
          >
            Pending ({counts.pending})
          </button>
          <button
            type="button"
            className={`${styles.pill} ${statusFilter === "DRAFT" ? styles.pillActive : ""}`}
            onClick={() => setStatusFilter("DRAFT")}
          >
            In Progress ({counts.draft})
          </button>
          <button
            type="button"
            className={`${styles.pill} ${statusFilter === "SUBMITTED" ? styles.pillActive : ""}`}
            onClick={() => setStatusFilter("SUBMITTED")}
          >
            Submitted ({counts.submitted})
          </button>
          <button
            type="button"
            className={`${styles.pill} ${statusFilter === "VERIFIED" ? styles.pillActive : ""}`}
            onClick={() => setStatusFilter("VERIFIED")}
          >
            Verified ({counts.verified})
          </button>
        </div>

        <div style={{ position: "relative", minWidth: "240px" }}>
          <Search size={16} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search subject, class, exam..."
            style={{
              width: "100%",
              padding: "0.5rem 0.85rem 0.5rem 2.2rem",
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

      {/* Grid of Tasks */}
      {filteredTasks.length === 0 ? (
        <div className={styles.emptyState}>
          <BookOpen size={40} style={{ opacity: 0.4, marginBottom: "0.75rem" }} />
          <h3 style={{ margin: "0 0 0.5rem 0", color: "#f8fafc" }}>No Marks Tasks Found</h3>
          <p style={{ margin: 0, fontSize: "0.9rem" }}>
            {tasks.length === 0
              ? "You currently have no subject marks tasks assigned. Once an exam request is approved by the admin, your subject tasks will appear here."
              : "No tasks match your current filter or search criteria."}
          </p>
        </div>
      ) : (
        <div className={styles.tasksGrid}>
          {filteredTasks.map((task) => {
            const percent = task.totalStudents > 0
              ? Math.min(100, Math.round((task.enteredMarksCount / task.totalStudents) * 100))
              : 0;

            const isLocked = task.status === "SUBMITTED" || task.status === "VERIFIED";

            return (
              <div key={task.id} className={styles.taskCard}>
                <div>
                  <div className={styles.cardTop}>
                    <div>
                      <div className={styles.examName}>{task.examName}</div>
                      <h2 className={styles.subjectTitle}>{task.subjectName}</h2>
                      <div className={styles.classBadge}>
                        <GraduationCap size={14} /> Class {task.className}-{task.section}
                      </div>
                    </div>
                    {renderBadge(task.status)}
                  </div>

                  {/* Return remark alert if returned */}
                  {task.status === "RETURNED" && task.returnRemark && (
                    <div className={styles.returnAlert} style={{ marginTop: "0.75rem" }}>
                      <RotateCcw size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                      <div>
                        <strong>Returned by Class Teacher:</strong>
                        <div style={{ marginTop: "2px" }}>{task.returnRemark}</div>
                      </div>
                    </div>
                  )}

                  <div className={styles.metaGrid} style={{ marginTop: "0.75rem" }}>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Max Marks</span>
                      <span className={styles.metaValue}>{task.maxMarks}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Pass Mark</span>
                      <span className={styles.metaValue}>{task.passMark}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Enrolled Students</span>
                      <span className={styles.metaValue}>{task.totalStudents}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Marks Entered</span>
                      <span className={styles.metaValue}>
                        {task.enteredMarksCount} / {task.totalStudents}
                      </span>
                    </div>
                  </div>

                  <div className={styles.progressSection} style={{ marginTop: "0.85rem" }}>
                    <div className={styles.progressLabelRow}>
                      <span>Completion</span>
                      <span style={{ fontWeight: 600 }}>{percent}%</span>
                    </div>
                    <div className={styles.progressBarBg}>
                      <div
                        className={styles.progressBarFill}
                        style={{
                          width: `${percent}%`,
                          backgroundColor: task.status === "VERIFIED"
                            ? "#10b981"
                            : task.status === "SUBMITTED"
                            ? "#3b82f6"
                            : task.status === "RETURNED"
                            ? "#ef4444"
                            : "#f59e0b",
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className={styles.cardFooter}>
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    {task.status === "SUBMITTED" && "Locked (Awaiting verification)"}
                    {task.status === "VERIFIED" && "Verified by Class Teacher"}
                    {task.status === "RETURNED" && "Action needed: Revise marks"}
                    {(task.status === "PENDING" || task.status === "DRAFT") && "Editable"}
                  </div>

                  <Link
                    href={`/dashboard/teacher/exams/tasks/${task.id}`}
                    className={styles.openButton}
                    style={{
                      background: isLocked ? "rgba(255, 255, 255, 0.1)" : "#3b82f6",
                      color: isLocked ? "#cbd5e1" : "#ffffff",
                    }}
                  >
                    <span>{isLocked ? "View Marks" : "Enter Marks"}</span>
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
