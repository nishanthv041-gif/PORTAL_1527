"use client";

import { useState, useMemo } from "react";
import { BookOpen, Calendar as CalendarIcon, CheckCircle2, FileText, Clock } from "lucide-react";
import OpenConversationButton from "@/frontend/components/homework/OpenConversationButton";

export type ParentAssignmentItem = {
  id: string;
  title: string;
  description: string | null;
  deadline: string;
  createdAt: string;
  fileUrl: string | null;
  teacher: {
    id: string;
    user: {
      name: string;
    };
  };
  class: {
    id: string;
    name: string;
    section: string;
  };
  subject: {
    id: string;
    name: string;
    code: string;
  } | null;
  _count: {
    comments: number;
  };
};

interface ParentHomeworkListProps {
  assignments: ParentAssignmentItem[];
  currentUser: {
    id: string;
    name: string;
    role: string;
  };
  childName: string;
}

export default function ParentHomeworkList({
  assignments,
  currentUser,
  childName
}: ParentHomeworkListProps) {
  const [selectedSubject, setSelectedSubject] = useState<string>("ALL");
  const [timeFilter, setTimeFilter] = useState<"ALL" | "TODAY_GIVEN" | "TODAY_DUE">("ALL");

  const isToday = (dateString: string) => {
    const d = new Date(dateString);
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  };

  // Unique subjects
  const subjectOptions = useMemo(() => {
    const map = new Map<string, string>();
    assignments.forEach(a => {
      if (a.subject) {
        map.set(a.subject.id, a.subject.name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [assignments]);

  const todayGivenCount = useMemo(() => {
    return assignments.filter(a => isToday(a.createdAt)).length;
  }, [assignments]);

  const todayDueCount = useMemo(() => {
    return assignments.filter(a => isToday(a.deadline)).length;
  }, [assignments]);

  // Filtered items
  const filtered = useMemo(() => {
    return assignments.filter(item => {
      if (selectedSubject !== "ALL" && item.subject?.id !== selectedSubject) return false;
      if (timeFilter === "TODAY_GIVEN" && !isToday(item.createdAt)) return false;
      if (timeFilter === "TODAY_DUE" && !isToday(item.deadline)) return false;
      return true;
    });
  }, [assignments, selectedSubject, timeFilter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Filters Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          padding: "0.85rem 1rem",
          borderRadius: "10px",
          backgroundColor: "var(--background)",
          border: "1px solid var(--border)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
            Filter by Subject:
          </span>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            style={{
              padding: "0.45rem 0.85rem",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              backgroundColor: "var(--card)",
              color: "var(--foreground)",
              fontSize: "0.85rem",
              outline: "none"
            }}
          >
            <option value="ALL">All Subjects ({assignments.length})</option>
            {subjectOptions.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <div style={{ display: "flex", gap: "4px", backgroundColor: "var(--card)", padding: "2px", borderRadius: "8px", border: "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={() => setTimeFilter("ALL")}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: timeFilter === "ALL" ? "var(--primary)" : "transparent",
                color: timeFilter === "ALL" ? "var(--primary-fg)" : "var(--foreground)",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              All Tasks
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter("TODAY_GIVEN")}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: timeFilter === "TODAY_GIVEN" ? "var(--primary)" : "transparent",
                color: timeFilter === "TODAY_GIVEN" ? "var(--primary-fg)" : "var(--foreground)",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Given Today ({todayGivenCount})
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter("TODAY_DUE")}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: timeFilter === "TODAY_DUE" ? "var(--primary)" : "transparent",
                color: timeFilter === "TODAY_DUE" ? "var(--primary-fg)" : "var(--foreground)",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Due Today ({todayDueCount})
            </button>
          </div>
        </div>

        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <Clock size={14} style={{ color: "#ca8a04" }} />
          <span>Each homework automatically deletes once its deadline expires</span>
        </div>
      </div>

      {/* Homework Cards List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {filtered.map((item) => {
          return (
            <div
              key={item.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                padding: "1.25rem 1.5rem",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                backgroundColor: "var(--background)",
                boxShadow: "0 2px 6px rgba(0,0,0,0.03)"
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.85rem", flex: "1 1 320px" }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "12px",
                      backgroundColor: "rgba(99, 102, 241, 0.12)",
                      color: "var(--primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }}
                  >
                    <BookOpen size={22} />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.3rem" }}>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          padding: "2px 8px",
                          borderRadius: "12px",
                          backgroundColor: "rgba(99, 102, 241, 0.15)",
                          color: "var(--primary)",
                          fontWeight: 700
                        }}
                      >
                        {item.subject?.name || "General Subject"}
                      </span>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          padding: "2px 8px",
                          borderRadius: "12px",
                          backgroundColor: "rgba(16, 185, 129, 0.15)",
                          color: "var(--success)",
                          fontWeight: 700
                        }}
                      >
                        {item.class.name} - {item.class.section}
                      </span>
                      {isToday(item.createdAt) && (
                        <span style={{ fontSize: "0.75rem", padding: "2px 7px", borderRadius: "10px", backgroundColor: "rgba(16, 185, 129, 0.15)", color: "var(--success)", fontWeight: 700 }}>
                          ✨ Given Today
                        </span>
                      )}
                      {isToday(item.deadline) && (
                        <span style={{ fontSize: "0.75rem", padding: "2px 7px", borderRadius: "10px", backgroundColor: "rgba(234, 179, 8, 0.15)", color: "#ca8a04", fontWeight: 700 }}>
                          ⚠️ Due Today
                        </span>
                      )}
                    </div>

                    <h3 style={{ margin: 0, color: "var(--foreground)", fontSize: "1.1rem", fontWeight: 700 }}>
                      {item.title}
                    </h3>
                    <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      Assigned by <strong>{item.teacher?.user?.name || "Subject Teacher"}</strong>
                    </p>
                  </div>
                </div>

                {/* Status Badge */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.35rem" }}>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      padding: "4px 10px",
                      borderRadius: "12px",
                      backgroundColor: "rgba(234, 179, 8, 0.12)",
                      color: "#ca8a04",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      fontWeight: 700
                    }}
                  >
                    <Clock size={12} />
                    ⏱️ Auto-deletes on {new Date(item.deadline).toLocaleDateString()}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                    <CalendarIcon size={14} style={{ color: "var(--primary)" }} />
                    <span>Due: <strong>{new Date(item.deadline).toLocaleDateString()}</strong></span>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              {item.description && (
                <div
                  style={{
                    padding: "0.85rem 1.1rem",
                    borderRadius: "8px",
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    fontSize: "0.9rem",
                    color: "var(--foreground)",
                    lineHeight: 1.5
                  }}
                >
                  <strong style={{ display: "block", marginBottom: "0.2rem", fontSize: "0.8rem", textTransform: "uppercase", color: "var(--text-secondary)" }}>
                    Instructions for Parents & Student:
                  </strong>
                  <span>{item.description}</span>
                </div>
              )}

              {/* Footer / Work Conversation */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px solid var(--border)",
                  paddingTop: "0.75rem",
                  flexWrap: "wrap",
                  gap: "0.75rem"
                }}
              >
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <Clock size={13} />
                  <span>Assigned on {new Date(item.createdAt).toLocaleDateString()}</span>
                </div>

                <OpenConversationButton
                  assignmentId={item.id}
                  assignmentTitle={item.title}
                  subjectName={item.subject?.name}
                  className={`${item.class.name} - ${item.class.section}`}
                  teacherName={item.teacher?.user?.name}
                  currentUser={currentUser}
                  initialCommentCount={item._count.comments}
                  label="💬 Work Conversation / Ask Teacher"
                />
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
            <FileText size={44} style={{ opacity: 0.3, margin: "0 auto 0.75rem" }} />
            <h4 style={{ margin: "0 0 0.35rem 0", color: "var(--foreground)", fontSize: "1.05rem" }}>
              No active home work
            </h4>
            <p style={{ margin: 0, fontSize: "0.85rem" }}>
              {assignments.length === 0 
                ? `No active home work for ${childName}'s class. Homework automatically deletes after the deadline.`
                : "No home works match the selected subject filter."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
