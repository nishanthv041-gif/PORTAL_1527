"use client";

import { useState } from "react";
import { 
  Check, 
  CheckCheck, 
  Clock, 
  AlertCircle, 
  Trash2, 
  Download, 
  FileText, 
  MoreVertical,
  RotateCcw
} from "lucide-react";
import VoiceNotePlayer from "./VoiceNotePlayer";

export interface ChatMessage {
  id: string;
  clientTempId?: string;
  content: string;
  senderId: string;
  receiverId: string;
  isRead: boolean;
  isDeleted: boolean;
  messageType?: string; // 'TEXT' | 'AUDIO' | 'FILE' | 'IMAGE'
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileType?: string | null;
  duration?: number | null;
  editedAt?: Date | string | null;
  createdAt: Date | string;
  status?: "sending" | "sent" | "failed";
}

interface ChatMessageItemProps {
  message: ChatMessage;
  currentUserId: string;
  isAdmin?: boolean;
  onDelete: (id: string, mode: "for_me" | "for_everyone") => Promise<void>;
  onRetry?: (message: ChatMessage) => void;
}

export default function ChatMessageItem({
  message,
  currentUserId,
  isAdmin = false,
  onDelete,
  onRetry,
}: ChatMessageItemProps) {
  const isMine = message.senderId === currentUserId;
  const isPending = message.status === "sending";
  const isFailed = message.status === "failed";
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const canDeleteForEveryone = (isMine || isAdmin) && !message.isDeleted && !isPending && !isFailed;

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTimestamp = (date: Date | string) => {
    try {
      const d = new Date(date);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const handleDeleteClick = (mode: "for_me" | "for_everyone") => {
    setIsDeleting(true);
    setShowDeleteModal(false);
    setShowMenu(false);
    onDelete(message.id, mode).finally(() => {
      setIsDeleting(false);
    });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignSelf: isMine ? "flex-end" : "flex-start",
        maxWidth: "85%",
        width: "fit-content",
        position: "relative",
        opacity: isDeleting ? 0.4 : 1,
        transition: "opacity 0.2s ease",
      }}
    >
      <div
        style={{
          padding: "0.65rem 0.85rem",
          borderRadius: isMine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          backgroundColor: isMine ? "var(--primary, #6366f1)" : "var(--card-bg, #ffffff)",
          color: isMine ? "#ffffff" : "var(--foreground, #1e293b)",
          boxShadow: "0 2px 5px rgba(0, 0, 0, 0.05)",
          border: isMine ? "none" : "1px solid var(--border-color, #e2e8f0)",
          position: "relative",
          wordBreak: "break-word",
        }}
      >
        {/* Deleted Message Placeholder */}
        {message.isDeleted ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontStyle: "italic", opacity: 0.7, fontSize: "0.875rem" }}>
            <span>🚫</span>
            <span>This message was deleted</span>
          </div>
        ) : (
          <>
            {/* 1. Image Attachment */}
            {message.messageType === "IMAGE" && message.fileUrl && (
              <div style={{ marginBottom: "0.5rem" }}>
                <a href={message.fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
                  <img
                    src={message.fileUrl}
                    alt={message.fileName || "Image"}
                    style={{
                      maxHeight: "260px",
                      maxWidth: "100%",
                      borderRadius: "10px",
                      objectFit: "cover",
                      display: "block",
                      cursor: "pointer",
                    }}
                  />
                </a>
              </div>
            )}

            {/* 2. Audio Voice Note */}
            {((message.messageType || "").toUpperCase() === "AUDIO" || message.fileType?.startsWith("audio/")) && message.fileUrl && (
              <VoiceNotePlayer
                src={message.fileUrl}
                duration={message.duration}
                isMine={isMine}
                messageId={message.id}
              />
            )}

            {/* 3. Document / Generic File Attachment */}
            {message.messageType === "FILE" && message.fileUrl && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.5rem",
                borderRadius: "8px",
                backgroundColor: isMine ? "rgba(255, 255, 255, 0.15)" : "var(--background, #f8fafc)",
                marginBottom: message.content && message.content !== message.fileName ? "0.5rem" : 0,
              }}>
                <div style={{
                  padding: "0.4rem",
                  borderRadius: "6px",
                  backgroundColor: isMine ? "rgba(255, 255, 255, 0.2)" : "rgba(99, 102, 241, 0.1)",
                  color: isMine ? "#ffffff" : "var(--primary, #6366f1)",
                }}>
                  <FileText size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: 0,
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>
                    {message.fileName || "Document"}
                  </p>
                  {message.fileSize && (
                    <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>
                      {formatFileSize(message.fileSize)}
                    </span>
                  )}
                </div>
                <a
                  href={message.fileUrl}
                  download={message.fileName || "download"}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "inherit",
                    padding: "0.35rem",
                    borderRadius: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="Download file"
                >
                  <Download size={16} />
                </a>
              </div>
            )}

            {/* 4. Text Content (if not just the file placeholder name) */}
            {message.content && 
             !(message.messageType === "AUDIO" && message.content === "🎤 Voice message") && 
             !(message.messageType === "FILE" && message.content === `📎 ${message.fileName}`) && (
              <div style={{
                fontSize: "0.92rem",
                lineHeight: "1.45",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {message.content}
              </div>
            )}
          </>
        )}

        {/* Footer: Time + Status Indicators + Action Menu */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "0.35rem",
          marginTop: "0.3rem",
          fontSize: "0.7rem",
          opacity: 0.85,
        }}>
          {message.editedAt && <span>(edited)</span>}
          <span>{formatTimestamp(message.createdAt)}</span>

          {/* Status Checkmarks for Sender */}
          {isMine && !message.isDeleted && (
            <span>
              {isPending && <Clock size={12} style={{ opacity: 0.8 }} />}
              {isFailed && (
                <span style={{ color: "#ef4444", display: "inline-flex", alignItems: "center", gap: "2px" }}>
                  <AlertCircle size={12} />
                  {onRetry && (
                    <button
                      type="button"
                      onClick={() => onRetry(message)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#ef4444",
                        cursor: "pointer",
                        padding: 0,
                        textDecoration: "underline",
                        fontSize: "0.7rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "2px",
                      }}
                    >
                      <RotateCcw size={10} /> Retry
                    </button>
                  )}
                </span>
              )}
              {message.status !== "sending" && !isFailed && (
                message.isRead ? (
                  <span title="Read" style={{ display: "inline-flex" }}>
                    <CheckCheck size={14} style={{ color: isMine ? "#38bdf8" : "#0284c7" }} />
                  </span>
                ) : (
                  <span title="Sent" style={{ display: "inline-flex" }}>
                    <Check size={14} style={{ opacity: 0.75 }} />
                  </span>
                )
              )}
            </span>
          )}

          {/* Dropdown Action Trigger */}
          {!message.isDeleted && !isPending && (
            <div style={{ position: "relative", marginLeft: "2px" }}>
              <button
                type="button"
                onClick={() => setShowMenu(!showMenu)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "inherit",
                  opacity: 0.6,
                  cursor: "pointer",
                  padding: "0 2px",
                  display: "flex",
                  alignItems: "center",
                }}
                title="Message options"
              >
                <MoreVertical size={13} />
              </button>

              {showMenu && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  backgroundColor: "var(--card-bg, #ffffff)",
                  color: "var(--foreground, #1e293b)",
                  border: "1px solid var(--border-color, #e2e8f0)",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                  zIndex: 50,
                  minWidth: "150px",
                  overflow: "hidden",
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(message.content);
                      setShowMenu(false);
                    }}
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      color: "inherit",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    Copy Text
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      setShowDeleteModal(true);
                    }}
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      color: "var(--danger, #ef4444)",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <Trash2 size={13} /> Delete...
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "1rem",
        }}>
          <div style={{
            background: "var(--card-bg, #ffffff)",
            color: "var(--foreground, #1e293b)",
            borderRadius: "12px",
            padding: "1.5rem",
            maxWidth: "380px",
            width: "100%",
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            border: "1px solid var(--border-color, #e2e8f0)",
          }}>
            <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem", fontWeight: 600 }}>Delete Message?</h4>
            <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.875rem", opacity: 0.8, lineHeight: 1.4 }}>
              Choose how you would like to delete this message.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {canDeleteForEveryone && (
                <button
                  type="button"
                  onClick={() => handleDeleteClick("for_everyone")}
                  style={{
                    padding: "0.7rem 1rem",
                    backgroundColor: "var(--danger, #ef4444)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    cursor: "pointer",
                  }}
                >
                  Delete for Everyone
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDeleteClick("for_me")}
                style={{
                  padding: "0.7rem 1rem",
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  color: "var(--danger, #ef4444)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                Delete for Me
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                style={{
                  padding: "0.7rem 1rem",
                  background: "transparent",
                  color: "inherit",
                  border: "1px solid var(--border-color, #e2e8f0)",
                  borderRadius: "8px",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  marginTop: "0.25rem",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
