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
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "PAST_DUE">("ALL");

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

  // Filtered items
  const filtered = useMemo(() => {
    return assignments.filter(item => {
      const isPastDue = new Date(item.deadline) < new Date();
      if (statusFilter === "ACTIVE" && isPastDue) return false;
      if (statusFilter === "PAST_DUE" && !isPastDue) return false;
      if (selectedSubject !== "ALL" && item.subject?.id !== selectedSubject) return false;
      return true;
    });
  }, [assignments, statusFilter, selectedSubject]);

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
          <span style={{ fontSize: "0.825rem", fontWeight: 600, color: "var(--text-secondary)" }}>
            Filter by Subject:
          </span>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            style={{
              padding: "0.4rem 0.75rem",
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
        </div>

        <div style={{ display: "flex", gap: "0.3rem" }}>
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              border: "none",
              backgroundColor: statusFilter === "ALL" ? "var(--primary)" : "transparent",
              color: statusFilter === "ALL" ? "var(--primary-fg)" : "var(--text-secondary)",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ACTIVE")}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              border: "none",
              backgroundColor: statusFilter === "ACTIVE" ? "var(--primary)" : "transparent",
              color: statusFilter === "ACTIVE" ? "var(--primary-fg)" : "var(--text-secondary)",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("PAST_DUE")}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              border: "none",
              backgroundColor: statusFilter === "PAST_DUE" ? "var(--primary)" : "transparent",
              color: statusFilter === "PAST_DUE" ? "var(--primary-fg)" : "var(--text-secondary)",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Past Due
          </button>
        </div>
      </div>

      {/* Homework Cards List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {filtered.map((item) => {
          const isPastDue = new Date(item.deadline) < new Date();

          return (
            <div
              key={item.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                padding: "1.25rem",
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
                    </div>

                    <h3 style={{ margin: 0, color: "var(--foreground)", fontSize: "1.05rem", fontWeight: 700 }}>
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
                      backgroundColor: isPastDue ? "rgba(156, 163, 175, 0.15)" : "rgba(16, 185, 129, 0.15)",
                      color: isPastDue ? "var(--text-secondary)" : "var(--success)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      fontWeight: 700
                    }}
                  >
                    <CheckCircle2 size={12} />
                    {isPastDue ? "Completed / Past Due" : "Active Home Work"}
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
                    padding: "0.75rem 1rem",
                    borderRadius: "8px",
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    fontSize: "0.875rem",
                    color: "var(--foreground)",
                    lineHeight: 1.45
                  }}
                >
                  <strong>Instructions: </strong>
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
              No home work tasks found
            </h4>
            <p style={{ margin: 0, fontSize: "0.85rem" }}>
              {assignments.length === 0 
                ? `No home work has been assigned for ${childName}'s class yet.`
                : "No home works match the selected subject or status filter."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
