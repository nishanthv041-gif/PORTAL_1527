"use client";

import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, Trash2, X, RefreshCw, BookOpen, GraduationCap } from "lucide-react";
import { addHomeworkComment, getHomeworkComments, deleteHomeworkComment } from "@/backend/api/actions/dashboard/teacher/assignments/actions";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";

export type CommentItem = {
  id: string;
  content: string;
  createdAt: string;
  authorName: string;
  authorRole: string;
  userId: string;
};

export interface WorkConversationModalProps {
  assignmentId: string;
  assignmentTitle: string;
  subjectName?: string | null;
  className: string;
  teacherName?: string | null;
  currentUser: {
    id: string;
    name: string;
    role: string;
  };
  initialComments?: CommentItem[];
  isOpen: boolean;
  onClose: () => void;
  onCommentsUpdated?: (newCount: number) => void;
}

export default function WorkConversationModal({
  assignmentId,
  assignmentTitle,
  subjectName,
  className,
  teacherName,
  currentUser,
  initialComments = [],
  isOpen,
  onClose,
  onCommentsUpdated
}: WorkConversationModalProps) {
  const confirm = useConfirm();
  const [comments, setComments] = useState<CommentItem[]>(initialComments);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadComments = async () => {
    setRefreshing(true);
    try {
      const data = await getHomeworkComments(assignmentId);
      setComments(data);
      if (onCommentsUpdated) {
        onCommentsUpdated(data.length);
      }
    } catch (err) {
      console.error("Failed to load comments", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadComments();
    }
  }, [isOpen, assignmentId]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [comments, isOpen]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setErrorMsg("");

    const res = await addHomeworkComment(assignmentId, trimmed);
    if (res.success && res.comment) {
      const updated = [...comments, res.comment as CommentItem];
      setComments(updated);
      setInputText("");
      if (onCommentsUpdated) {
        onCommentsUpdated(updated.length);
      }
      setTimeout(scrollToBottom, 50);
    } else {
      setErrorMsg(res.error || "Failed to post message");
    }
    setSending(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    const ok = await confirm({
      title: "Delete Message?",
      message: "Are you sure you want to delete this message? This cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger"
    });
    if (!ok) return;

    const res = await deleteHomeworkComment(commentId);
    if (res.success) {
      const updated = comments.filter(c => c.id !== commentId);
      setComments(updated);
      if (onCommentsUpdated) {
        onCommentsUpdated(updated.length);
      }
    } else {
      alert(res.error || "Failed to delete message");
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "680px",
          height: "85vh",
          maxHeight: "750px",
          backgroundColor: "var(--card)",
          borderRadius: "16px",
          border: "1px solid var(--border)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--border)",
            background: "linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.08))",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem"
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  padding: "3px 10px",
                  borderRadius: "20px",
                  backgroundColor: "rgba(99, 102, 241, 0.15)",
                  color: "var(--primary)",
                  fontSize: "0.75rem",
                  fontWeight: 700
                }}
              >
                <BookOpen size={13} />
                {subjectName || "Subject Homework"}
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  padding: "3px 10px",
                  borderRadius: "20px",
                  backgroundColor: "rgba(16, 185, 129, 0.15)",
                  color: "var(--success)",
                  fontSize: "0.75rem",
                  fontWeight: 700
                }}
              >
                <GraduationCap size={13} />
                {className}
              </span>
              {teacherName && (
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem"
                  }}
                >
                  Assigned Staff: <strong>{teacherName}</strong>
                </span>
              )}
            </div>

            <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "var(--foreground)" }}>
              💬 Work Conversation: {assignmentTitle}
            </h3>
            <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.825rem", color: "var(--text-secondary)" }}>
              Connected communication between assigned teacher, students, and parents for this homework.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              onClick={loadComments}
              disabled={refreshing}
              title="Refresh conversation"
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                width: 34,
                height: 34,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--foreground)"
              }}
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onClose}
              title="Close"
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                width: 34,
                height: 34,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--foreground)"
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Message Feed */}
        <div
          style={{
            flex: 1,
            padding: "1.25rem",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            backgroundColor: "var(--background)"
          }}
        >
          {comments.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-secondary)" }}>
              <MessageSquare size={44} style={{ opacity: 0.3, margin: "0 auto 0.75rem" }} />
              <h4 style={{ margin: "0 0 0.4rem 0", color: "var(--foreground)", fontSize: "1rem" }}>
                No messages yet
              </h4>
              <p style={{ margin: 0, fontSize: "0.85rem", maxWidth: "340px", marginInline: "auto" }}>
                Start the conversation! The assigned staff member, parents, and students can post homework questions and updates here.
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
                    <span>{new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  {/* Bubble */}
                  <div
                    style={{
                      position: "relative",
                      padding: "0.85rem 1rem",
                      borderRadius: isCurrentUser ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                      backgroundColor: isCurrentUser
                        ? "var(--primary)"
                        : "var(--card)",
                      color: isCurrentUser ? "var(--primary-fg)" : "var(--foreground)",
                      border: isCurrentUser ? "none" : "1px solid var(--border)",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      fontSize: "0.9rem",
                      lineHeight: "1.45",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word"
                    }}
                  >
                    {comment.content}

                    {/* Delete button for author or teacher */}
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
                          opacity: 0.8
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

        {/* Composer */}
        <form
          onSubmit={handleSend}
          style={{
            padding: "1rem 1.25rem",
            borderTop: "1px solid var(--border)",
            backgroundColor: "var(--card)",
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
              placeholder={`Write a message as ${currentUser.name} (${currentUser.role.toLowerCase()})...`}
              style={{
                width: "100%",
                padding: "0.65rem 0.85rem",
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
              padding: "0.7rem 1.25rem",
              borderRadius: "8px",
              backgroundColor: "var(--primary)",
              color: "var(--primary-fg)",
              border: "none",
              fontWeight: 600,
              fontSize: "0.9rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              cursor: sending || !inputText.trim() ? "not-allowed" : "pointer",
              opacity: sending || !inputText.trim() ? 0.6 : 1,
              height: "44px"
            }}
          >
            <Send size={15} />
            {sending ? "Sending..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
