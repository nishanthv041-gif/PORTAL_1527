"use client";

import { useState } from "react";
import { BookOpen, User, Mail, Phone, LayoutGrid, Table as TableIcon } from "lucide-react";
import styles from "./ParentClasses.module.css";

export type SubjectItem = {
  id: string;
  name: string;
  code: string;
  maxMarks: number;
  passMarks: number;
  teacher?: {
    id: string;
    phone?: string | null;
    user: {
      name: string;
      email: string;
    };
  } | null;
};

export default function SubjectsFacultySection({
  subjects,
}: {
  subjects: SubjectItem[];
}) {
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  if (subjects.length === 0) {
    return (
      <div className={styles.subjectsCard}>
        <h3 className={styles.subjectsTitle}>
          <BookOpen size={20} className="text-primary" />
          Subjects &amp; Subject Teachers (0)
        </h3>
        <p style={{ color: "var(--text-secondary)", padding: "1.5rem 0", margin: 0 }}>
          No subjects assigned to this class yet.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.subjectsCard}>
      <div className={styles.subjectsHeaderRow}>
        <h3 className={styles.subjectsTitle}>
          <BookOpen size={20} className="text-primary" />
          <span>Subjects &amp; Subject Teachers ({subjects.length})</span>
        </h3>

        {/* View Mode Switcher for mobile & touch ergonomics */}
        <div className={styles.viewToggle} role="tablist" aria-label="View switch">
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={`${styles.viewToggleBtn} ${viewMode === "cards" ? styles.viewToggleBtnActive : ""}`}
            title="Card View (Stacked)"
          >
            <LayoutGrid size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
            Cards
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`${styles.viewToggleBtn} ${viewMode === "table" ? styles.viewToggleBtnActive : ""}`}
            title="Tabular View"
          >
            <TableIcon size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
            Table
          </button>
        </div>
      </div>

      {/* 1. Stacked Responsive Cards View (Default on mobile, fits 100% of screen without overflow) */}
      {viewMode === "cards" ? (
        <div className={styles.mobileCardsContainer}>
          {subjects.map((sub) => (
            <div key={sub.id} className={styles.mobileSubjectCard}>
              <div className={styles.mobileSubjectTop}>
                <span className={styles.subjectCodeBadge}>{sub.code}</span>
                <h4 className={styles.subjectNameTitle}>{sub.name}</h4>
              </div>

              {/* Assigned Faculty */}
              <div className={styles.mobileTeacherRow}>
                <div className={styles.teacherAvatar}>
                  {sub.teacher?.user?.name ? sub.teacher.user.name.charAt(0).toUpperCase() : "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--foreground)" }}>
                    {sub.teacher ? sub.teacher.user.name : <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>Unassigned</span>}
                  </div>
                  {sub.teacher?.user?.email && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--text-secondary)", fontSize: "0.78rem", marginTop: "0.2rem" }}>
                      <Mail size={13} style={{ flexShrink: 0 }} />
                      <span style={{ overflowWrap: "anywhere", wordBreak: "break-all", minWidth: 0 }}>
                        {sub.teacher.user.email}
                      </span>
                    </div>
                  )}
                  {sub.teacher?.phone && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--text-secondary)", fontSize: "0.78rem", marginTop: "0.15rem" }}>
                      <Phone size={13} style={{ flexShrink: 0 }} />
                      <span>{sub.teacher.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Marks Criteria Chips */}
              <div className={styles.mobileMarksRow}>
                <span className={styles.markChip} style={{ color: "var(--foreground)" }}>
                  <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Max Marks:</span> {sub.maxMarks}
                </span>
                <span className={styles.markChip} style={{ color: "var(--foreground)" }}>
                  <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Pass Marks:</span> {sub.passMarks}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* 2. Horizontally-Scrollable Table Container (Bounded cleanly inside card, touch scrolling enabled) */
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Subject Code</th>
                <th className={styles.th}>Subject Name</th>
                <th className={styles.th}>Teacher</th>
                <th className={styles.th}>Max Marks</th>
                <th className={styles.th}>Pass Marks</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((sub) => (
                <tr key={sub.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td className={styles.td} style={{ fontWeight: 600, color: "var(--primary)", whiteSpace: "nowrap" }}>
                    {sub.code}
                  </td>
                  <td className={styles.td} style={{ fontWeight: 600 }}>
                    {sub.name}
                  </td>
                  <td className={styles.td} style={{ minWidth: "180px" }}>
                    {sub.teacher ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: "var(--foreground)" }}>{sub.teacher.user.name}</div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", overflowWrap: "anywhere", wordBreak: "break-all" }}>
                          {sub.teacher.user.email}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>Unassigned</span>
                    )}
                  </td>
                  <td className={styles.td} style={{ fontWeight: 500 }}>{sub.maxMarks}</td>
                  <td className={styles.td} style={{ fontWeight: 500 }}>{sub.passMarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
