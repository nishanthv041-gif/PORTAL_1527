"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  Send,
  X,
  RefreshCw,
  User,
  ShieldCheck,
  HeartHandshake,
  AlertCircle,
  GraduationCap,
  Clock,
  CheckCircle2
} from "lucide-react";
import {
  addComplaintMessageAction,
  getComplaintMessagesAction
} from "@/backend/api/actions/dashboard/parent/complaints/actions";

export type ComplaintMessageItem = {
  id: string;
  content: string;
  createdAt: string;
  authorName: string;
  authorRole: string; // "ADMIN", "PARENT", "TEACHER"
  userId: string;
};

export interface ComplaintConversationModalProps {
  complaintId: string;
  complaintTitle: string;
  studentName: string;
  studentClass?: string | null;
  category: string;
  severity: string;
  status: string;
  currentUser: {
    id: string;
    name: string;
    role: string;
  };
  initialMessages?: ComplaintMessageItem[];
  isOpen: boolean;
  onClose: () => void;
  onMessageAdded?: (newMessage: ComplaintMessageItem) => void;
}

export default function ComplaintConversationModal({
  complaintId,
  complaintTitle,
  studentName,
  studentClass,
  category,
  severity,
  status,
  currentUser,
  initialMessages = [],
  isOpen,
  onClose,
  onMessageAdded
}: ComplaintConversationModalProps) {
  const [messages, setMessages] = useState<ComplaintMessageItem[]>(initialMessages);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadMessages = async () => {
    setRefreshing(true);
    try {
      const data = await getComplaintMessagesAction(complaintId);
      setMessages(data);
    } catch (err) {
      console.error("Failed to load complaint messages:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (initialMessages.length > 0) {
        setMessages(initialMessages);
      } else {
        loadMessages();
      }
      setTimeout(scrollToBottom, 50);
    }
  }, [isOpen, complaintId]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setErrorMsg("");

    const res = await addComplaintMessageAction(complaintId, trimmed);
    if (res.success && res.message) {
      const newMsg = res.message as ComplaintMessageItem;
      setMessages(prev => [...prev, newMsg]);
      setInputText("");
      if (onMessageAdded) onMessageAdded(newMsg);
      setTimeout(scrollToBottom, 50);
    } else {
      setErrorMsg(res.error || "Failed to post message");
    }
    setSending(false);
  };

  const getSeverityColor = (sev: string) => {
    switch (sev.toUpperCase()) {
      case "CRITICAL": return { bg: "rgba(239, 68, 68, 0.15)", text: "var(--danger)", border: "rgba(239, 68, 68, 0.3)" };
      case "HIGH": return { bg: "rgba(249, 115, 22, 0.15)", text: "#ea580c", border: "rgba(249, 115, 22, 0.3)" };
      case "MEDIUM": return { bg: "rgba(234, 179, 8, 0.15)", text: "#ca8a04", border: "rgba(234, 179, 8, 0.3)" };
      default: return { bg: "rgba(16, 185, 129, 0.15)", text: "var(--success)", border: "rgba(16, 185, 129, 0.3)" };
    }
  };

  const getStatusColor = (st: string) => {
    switch (st.toUpperCase()) {
      case "RESOLVED": return { bg: "rgba(16, 185, 129, 0.15)", text: "var(--success)" };
      case "UNDER_REVIEW": return { bg: "rgba(234, 179, 8, 0.15)", text: "#ca8a04" };
      default: return { bg: "rgba(239, 68, 68, 0.15)", text: "var(--danger)" };
    }
  };

  const sevColors = getSeverityColor(severity);
  const stColors = getStatusColor(status);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
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
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        {/* =========================================================
            MODAL HEADER
           ========================================================= */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--border)",
            backgroundColor: "var(--background)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem"
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Badges Bar */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
              <span
                style={{
                  fontSize: "0.75rem",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  backgroundColor: sevColors.bg,
                  color: sevColors.text,
                  border: `1px solid ${sevColors.border}`,
                  fontWeight: 700
                }}
              >
                {severity}
              </span>

              <span
                style={{
                  fontSize: "0.75rem",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(99, 102, 241, 0.12)",
                  color: "var(--primary)",
                  fontWeight: 700
                }}
              >
                {category}
              </span>

              <span
                style={{
                  fontSize: "0.75rem",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  backgroundColor: stColors.bg,
                  color: stColors.text,
                  fontWeight: 700
                }}
              >
                {status.replace("_", " ")}
              </span>

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  fontSize: "0.75rem",
                  color: "var(--text-secondary)",
                  fontWeight: 600
                }}
              >
                <User size={12} /> {studentName} {studentClass ? `(${studentClass})` : ""}
              </span>
            </div>

            <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "var(--foreground)", wordBreak: "break-word" }}>
              {complaintTitle}
            </h3>
            <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Official Complaint Conversation & Resolution Thread
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={loadMessages}
              disabled={refreshing}
              title="Refresh conversation"
              style={{
                width: 32,
                height: 32,
                borderRadius: "8px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: refreshing ? "not-allowed" : "pointer"
              }}
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close"
              style={{
                width: 32,
                height: 32,
                borderRadius: "8px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer"
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* =========================================================
            MESSAGES THREAD
           ========================================================= */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.25rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            backgroundColor: "var(--card)"
          }}
        >
          {messages.map((msg) => {
            const isMe = msg.userId === currentUser.id;
            const isAdmin = msg.authorRole === "ADMIN";
            const isParent = msg.authorRole === "PARENT";

            return (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isMe ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  alignSelf: isMe ? "flex-end" : "flex-start"
                }}
              >
                {/* Author Info */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    marginBottom: "0.25rem",
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)"
                  }}
                >
                  <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
                    {isMe ? "You" : msg.authorName}
                  </span>
                  <span
                    style={{
                      padding: "1px 6px",
                      borderRadius: "6px",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      backgroundColor: isAdmin
                        ? "rgba(99, 102, 241, 0.15)"
                        : isParent
                          ? "rgba(16, 185, 129, 0.15)"
                          : "rgba(245, 158, 11, 0.15)",
                      color: isAdmin
                        ? "var(--primary)"
                        : isParent
                          ? "var(--success)"
                          : "#d97706"
                    }}
                  >
                    {isAdmin ? "Administration" : isParent ? "Parent" : "Teacher"}
                  </span>
                  <span>•</span>
                  <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>

                {/* Message Bubble */}
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    borderRadius: "12px",
                    backgroundColor: isMe
                      ? "var(--primary)"
                      : isAdmin
                        ? "rgba(99, 102, 241, 0.1)"
                        : "var(--background)",
                    color: isMe ? "var(--primary-fg)" : "var(--foreground)",
                    border: isMe ? "none" : "1px solid var(--border)",
                    fontSize: "0.9rem",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word"
                  }}
                >
                  {msg.content}
                </div>
              </div>
            );
          })}

          {messages.length === 0 && (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-secondary)" }}>
              <MessageSquare size={36} style={{ opacity: 0.3, margin: "0 auto 0.5rem" }} />
              <p style={{ margin: 0, fontSize: "0.875rem" }}>
                No messages yet. Send a response below to start the conversation.
              </p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* =========================================================
            INPUT FOOTER
           ========================================================= */}
        <div
          style={{
            padding: "1rem 1.25rem",
            borderTop: "1px solid var(--border)",
            backgroundColor: "var(--background)"
          }}
        >
          {errorMsg && (
            <div style={{ color: "var(--danger)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSend} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-end" }}>
            <textarea
              rows={2}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type your response or question here... (Enter to send)"
              style={{
                flex: 1,
                padding: "0.65rem 0.85rem",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                color: "var(--foreground)",
                fontSize: "0.9rem",
                resize: "none",
                outline: "none"
              }}
            />

            <button
              type="submit"
              disabled={sending || !inputText.trim()}
              style={{
                padding: "0.65rem 1.25rem",
                height: "50px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "var(--primary)",
                color: "var(--primary-fg)",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: sending || !inputText.trim() ? "not-allowed" : "pointer",
                opacity: sending || !inputText.trim() ? 0.6 : 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem"
              }}
            >
              <Send size={15} />
              <span>{sending ? "Sending..." : "Send"}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
