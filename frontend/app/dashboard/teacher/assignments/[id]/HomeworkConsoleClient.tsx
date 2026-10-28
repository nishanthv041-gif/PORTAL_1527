"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  BookOpen, 
  GraduationCap, 
  Calendar as CalendarIcon, 
  Clock, 
  Trash2, 
  MessageSquare, 
  Send, 
  RefreshCw, 
  HeartHandshake, 
  AlertCircle,
  Sparkles
} from "lucide-react";
import { 
  deleteAssignment, 
  addHomeworkComment, 
  getHomeworkComments, 
  deleteHomeworkComment 
} from "@/backend/api/actions/dashboard/teacher/assignments/actions";
import styles from "@/frontend/app/dashboard/dashboard.module.css";

export type ConsoleComment = {
  id: string;
  content: string;
  createdAt: string;
  authorName: string;
  authorRole: string;
  userId: string;
};

interface HomeworkConsoleClientProps {
  assignment: {
    id: string;
    title: string;
    description: string | null;
    deadline: string;
    createdAt: string;
    class: {
      id: string;
      name: string;
      section: string;
    };
    subject: {
      id: string;
      name: string;
    } | null;
    teacher: {
      id: string;
      userId: string;
      user: {
        name: string;
      };
    };
  };
  currentUser: {
    id: string;
    name: string;
    role: string;
  };
  initialComments: ConsoleComment[];
  canManage?: boolean;
  assignedStaffName?: string;
}

export default function HomeworkConsoleClient({
  assignment,
  currentUser,
  initialComments,
  canManage = true,
  assignedStaffName
}: HomeworkConsoleClientProps) {
  const router = useRouter();
  const [comments, setComments] = useState<ConsoleComment[]>(initialComments);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [comments]);

  const loadComments = async () => {
    setRefreshing(true);
    try {
      const data = await getHomeworkComments(assignment.id);
      setComments(data);
    } catch (err) {
      console.error("Failed to load comments:", err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setErrorMsg("");

    const res = await addHomeworkComment(assignment.id, trimmed);
    if (res.success && res.comment) {
      setComments(prev => [...prev, res.comment as ConsoleComment]);
      setInputText("");
      setTimeout(scrollToBottom, 50);
    } else {
      setErrorMsg(res.error || "Failed to post message");
    }
    setSending(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("Are you sure you want to delete this message?")) return;

    const res = await deleteHomeworkComment(commentId);
    if (res.success) {
      setComments(prev => prev.filter(c => c.id !== commentId));
    } else {
      alert(res.error || "Failed to delete message");
    }
  };

  const handleManualDeleteHomework = async () => {
    setDeleting(true);
    const res = await deleteAssignment(assignment.id);
    if (res.success) {
      router.push("/dashboard/teacher/assignments");
      router.refresh();
    } else {
      alert("Failed to delete home work: " + res.error);
      setDeleting(false);
    }
  };

  return (
    <div className={styles.dashboard}>
      {/* Top Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <Link
          href="/dashboard/teacher/assignments"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            color: "var(--primary)",
            textDecoration: "none",
            fontSize: "0.9rem",
            fontWeight: 600
          }}
        >
          <ArrowLeft size={16} /> Back to Home Work
        </Link>

        {/* Action Button: Manual Delete if authorized, or Staff in Charge badge */}
        {canManage ? (
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "6px 14px",
              borderRadius: "8px",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              color: "var(--danger)",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            <Trash2 size={14} />
            <span>Manual Delete Home Work</span>
          </button>
        ) : (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "6px 12px",
              borderRadius: "8px",
              backgroundColor: "rgba(99, 102, 241, 0.08)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              color: "var(--primary)",
              fontSize: "0.825rem",
              fontWeight: 600
            }}
          >
            <span>Subject Staff: {assignedStaffName || assignment.teacher.user.name}</span>
          </div>
        )}
      </div>

      {/* ===================================================
          CARD 1: HOME WORK INFORMATION FOR PARENTS & CONSOLE
         =================================================== */}
      <div className={styles.chartCard} style={{ padding: "1.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  padding: "4px 12px",
                  borderRadius: "16px",
                  backgroundColor: "rgba(99, 102, 241, 0.15)",
                  color: "var(--primary)",
                  fontSize: "0.8rem",
                  fontWeight: 700
                }}
              >
                <BookOpen size={14} />
                {assignment.subject?.name || "General Subject"}
              </span>

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  padding: "4px 12px",
                  borderRadius: "16px",
                  backgroundColor: "rgba(16, 185, 129, 0.15)",
                  color: "var(--success)",
                  fontSize: "0.8rem",
                  fontWeight: 700
                }}
              >
                <GraduationCap size={14} />
                {assignment.class.name} - {assignment.class.section}
              </span>

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  padding: "4px 12px",
                  borderRadius: "16px",
                  backgroundColor: "rgba(99, 102, 241, 0.12)",
                  color: "var(--primary)",
                  fontSize: "0.8rem",
                  fontWeight: 700
                }}
              >
                👤 Staff: {assignedStaffName || assignment.teacher.user.name}
              </span>

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  padding: "4px 10px",
                  borderRadius: "16px",
                  backgroundColor: "rgba(234, 179, 8, 0.15)",
                  color: "#ca8a04",
                  fontSize: "0.75rem",
                  fontWeight: 700
                }}
              >
                <Clock size={13} />
                ⏱️ Auto-deletes after deadline
              </span>
            </div>

            <h1 style={{ margin: "0 0 0.4rem 0", fontSize: "1.75rem", fontWeight: 800, color: "var(--foreground)" }}>
              {assignment.title}
            </h1>

            <div style={{ display: "flex", gap: "1.25rem", fontSize: "0.85rem", color: "var(--text-secondary)", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <CalendarIcon size={14} style={{ color: "var(--primary)" }} />
                <span>Due: <strong>{new Date(assignment.deadline).toLocaleDateString()}</strong></span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Clock size={14} />
                <span>Assigned on: {new Date(assignment.createdAt).toLocaleDateString()}</span>
              </div>
              <div>
                Teacher: <strong>{assignment.teacher.user.name}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "6px 12px", borderRadius: "10px", backgroundColor: "rgba(16, 185, 129, 0.1)", color: "var(--success)", fontSize: "0.8rem", fontWeight: 700 }}>
            <HeartHandshake size={15} />
            <span>Shared with Parents & Students</span>
          </div>
        </div>

        {/* Instructions / Description */}
        <div
          style={{
            padding: "1rem 1.25rem",
            borderRadius: "10px",
            backgroundColor: "var(--background)",
            border: "1px solid var(--border)",
            fontSize: "0.95rem",
            color: "var(--foreground)",
            lineHeight: 1.6,
            marginTop: "0.75rem"
          }}
        >
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "0.3rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Home Work Guidelines & Information for Parents:
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>
            {assignment.description || "No specific instructions provided. Complete the assigned homework for this subject."}
          </div>
        </div>
      </div>

      {/* ===================================================
          CARD 2: HOME WORK CONVERSATION (INLINE CONSOLE)
         =================================================== */}
      <div className={styles.chartCard} style={{ padding: "1.75rem", display: "flex", flexDirection: "column", height: "600px" }}>
        {/* Console Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", paddingBottom: "0.75rem", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <MessageSquare size={20} style={{ color: "var(--primary)" }} />
              <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--foreground)" }}>
                Home Work Conversation Console
              </h2>
              <span style={{ padding: "2px 8px", borderRadius: "12px", backgroundColor: "rgba(99, 102, 241, 0.15)", color: "var(--primary)", fontSize: "0.75rem", fontWeight: 700 }}>
                {comments.length}
              </span>
            </div>
            <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.825rem", color: "var(--text-secondary)" }}>
              Direct information to parents and immediate parent-teacher homework queries for <strong>{assignment.subject?.name || "Subject"}</strong> ({assignment.class.name} - {assignment.class.section})
            </p>
          </div>

          <button
            type="button"
            onClick={loadComments}
            disabled={refreshing}
            title="Refresh messages"
            style={{
              padding: "6px 10px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              backgroundColor: "var(--background)",
              color: "var(--foreground)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.8rem",
              fontWeight: 600
            }}
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Message Feed */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            padding: "0.75rem",
            backgroundColor: "var(--background)",
            borderRadius: "10px",
            border: "1px solid var(--border)"
          }}
        >
          {comments.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-secondary)" }}>
              <MessageSquare size={44} style={{ opacity: 0.3, margin: "0 auto 0.75rem" }} />
              <h4 style={{ margin: "0 0 0.35rem 0", color: "var(--foreground)" }}>No messages in this console yet</h4>
              <p style={{ margin: 0, fontSize: "0.85rem" }}>
                Post a note or guideline below to inform parents and students immediately!
              </p>
            </div>
          ) : (
            comments.map((comment) => {
              const isCurrentUser = comment.userId === currentUser.id;
              const isTeacher = comment.authorRole === "TEACHER";
              const isParent = comment.authorRole === "PARENT";

              return (
                <div
                  key={comment.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isCurrentUser ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                    alignSelf: isCurrentUser ? "flex-end" : "flex-start"
                  }}
                >
                  {/* Sender meta */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      fontSize: "0.75rem",
                      marginBottom: "0.25rem",
                      color: "var(--text-secondary)"
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
                      {comment.authorName} {isCurrentUser ? "(You)" : ""}
                    </span>
                    <span
                      style={{
                        padding: "1px 6px",
                        borderRadius: "10px",
                        fontSize: "0.68rem",
                        fontWeight: 600,
                        backgroundColor: isTeacher
                          ? "rgba(99, 102, 241, 0.15)"
                          : isParent
                          ? "rgba(16, 185, 129, 0.15)"
                          : "rgba(168, 85, 247, 0.15)",
                        color: isTeacher
                          ? "var(--primary)"
                          : isParent
                          ? "var(--success)"
                          : "purple"
                      }}
                    >
                      {isTeacher ? "Teacher 🎓" : isParent ? "Parent 👨‍👩‍👧‍👦" : "Staff"}
                    </span>
                    <span>•</span>
                    <span>{new Date(comment.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>

                  {/* Message Bubble */}
                  <div
                    style={{
                      position: "relative",
                      padding: "0.85rem 1.1rem",
                      borderRadius: isCurrentUser ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                      backgroundColor: isCurrentUser ? "var(--primary)" : "var(--card)",
                      color: isCurrentUser ? "var(--primary-fg)" : "var(--foreground)",
                      border: isCurrentUser ? "none" : "1px solid var(--border)",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      fontSize: "0.9rem",
                      lineHeight: "1.5",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word"
                    }}
                  >
                    {comment.content}

                    {/* Delete comment option */}
                    {(isCurrentUser || currentUser.role === "ADMIN" || currentUser.role === "TEACHER") && (
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        title="Delete message"
                        style={{
                          position: "absolute",
                          top: "-8px",
                          right: isCurrentUser ? "auto" : "-8px",
                          left: isCurrentUser ? "-8px" : "auto",
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          backgroundColor: "var(--card)",
                          border: "1px solid var(--border)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: "var(--danger)",
                          opacity: 0.85
                        }}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input Box */}
        <form
          onSubmit={handleSend}
          style={{
            marginTop: "1rem",
            display: "flex",
            gap: "0.75rem",
            alignItems: "flex-end"
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder={`Write homework information or answer queries as ${currentUser.name} (Teacher)...`}
              style={{
                width: "100%",
                padding: "0.75rem 0.9rem",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--background)",
                color: "var(--foreground)",
                resize: "none",
                fontSize: "0.9rem",
                outline: "none"
              }}
            />
            {errorMsg && (
              <span style={{ color: "var(--danger)", fontSize: "0.75rem" }}>{errorMsg}</span>
            )}
          </div>

          <button
            type="submit"
            disabled={sending || !inputText.trim()}
            style={{
              padding: "0.75rem 1.35rem",
              borderRadius: "8px",
              backgroundColor: "var(--primary)",
              color: "var(--primary-fg)",
              border: "none",
              fontWeight: 700,
              fontSize: "0.9rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              cursor: sending || !inputText.trim() ? "not-allowed" : "pointer",
              opacity: sending || !inputText.trim() ? 0.6 : 1,
              height: "46px"
            }}
          >
            <Send size={15} />
            {sending ? "Sending..." : "Send to Parents"}
          </button>
        </form>
      </div>

      {/* ===================================================
          MANUAL DELETE CONFIRMATION MODAL
         =================================================== */}
      {showDeleteModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "1rem"
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDeleteModal(false);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "460px",
              backgroundColor: "var(--card)",
              borderRadius: "16px",
              border: "1px solid var(--border)",
              boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
              padding: "1.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ width: 44, height: 44, borderRadius: "12px", backgroundColor: "rgba(239, 68, 68, 0.15)", color: "var(--danger)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Trash2 size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "var(--foreground)" }}>
                  Manually Delete Home Work?
                </h3>
                <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                  This permanently removes this homework and its discussion thread.
                </p>
              </div>
            </div>

            <div style={{ padding: "0.85rem", borderRadius: "10px", backgroundColor: "var(--background)", border: "1px solid var(--border)", fontSize: "0.9rem" }}>
              <div style={{ fontWeight: 700, color: "var(--foreground)" }}>{assignment.title}</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                Class: {assignment.class.name} - {assignment.class.section} • Subject: {assignment.subject?.name || "General"}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={{
                  padding: "0.65rem 1.25rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  backgroundColor: "transparent",
                  color: "var(--foreground)",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.9rem"
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleManualDeleteHomework}
                disabled={deleting}
                style={{
                  padding: "0.65rem 1.25rem",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "var(--danger)",
                  color: "#fff",
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem"
                }}
              >
                <Trash2 size={15} />
                {deleting ? "Deleting..." : "Yes, Delete Now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
