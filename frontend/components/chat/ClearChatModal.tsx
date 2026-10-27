"use client";

import { useState } from "react";
import { Trash2, AlertTriangle, X } from "lucide-react";

interface ClearChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmClear: () => Promise<void>;
  otherUserName: string;
}

export default function ClearChatModal({
  isOpen,
  onClose,
  onConfirmClear,
  otherUserName,
}: ClearChatModalProps) {
  const [isClearing, setIsClearing] = useState(false);

  if (!isOpen) return null;

  const handleClear = async () => {
    setIsClearing(true);
    try {
      await onConfirmClear();
      onClose();
    } catch (err) {
      console.error("Failed to clear chat:", err);
      alert("Failed to clear chat. Please try again.");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      backgroundColor: "rgba(0, 0, 0, 0.55)",
      backdropFilter: "blur(2px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1100,
      padding: "1rem",
    }}>
      <div style={{
        background: "var(--card-bg, #ffffff)",
        color: "var(--foreground, #1e293b)",
        borderRadius: "14px",
        padding: "1.75rem",
        maxWidth: "420px",
        width: "100%",
        boxShadow: "0 15px 35px rgba(0, 0, 0, 0.25)",
        border: "1px solid var(--border-color, #e2e8f0)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              color: "var(--danger, #ef4444)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <Trash2 size={18} />
            </div>
            <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>Clear Chat?</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "inherit", opacity: 0.6, cursor: "pointer", padding: "0.25rem" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Explanation */}
        <div style={{
          backgroundColor: "rgba(245, 158, 11, 0.08)",
          border: "1px solid rgba(245, 158, 11, 0.2)",
          borderRadius: "8px",
          padding: "0.75rem 1rem",
          display: "flex",
          gap: "0.6rem",
          marginBottom: "1.25rem",
        }}>
          <AlertTriangle size={18} style={{ color: "#d97706", flexShrink: 0, marginTop: "2px" }} />
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--foreground)", lineHeight: "1.45" }}>
            Clearing this chat will remove all message history with <strong>{otherUserName}</strong> from <em>your view</em>. New messages will still appear normally, and other conversation participants will keep their copies.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isClearing}
            style={{
              padding: "0.65rem 1.25rem",
              background: "transparent",
              color: "inherit",
              border: "1px solid var(--border-color, #e2e8f0)",
              borderRadius: "8px",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={isClearing}
            style={{
              padding: "0.65rem 1.4rem",
              backgroundColor: "var(--danger, #ef4444)",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: isClearing ? "not-allowed" : "pointer",
              opacity: isClearing ? 0.7 : 1,
            }}
          >
            {isClearing ? "Clearing..." : "Clear Chat"}
          </button>
        </div>
      </div>
    </div>
  );
}
