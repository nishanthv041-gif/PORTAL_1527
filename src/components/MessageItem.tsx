"use client";

import { useState } from "react";
import { Edit2, Trash2, X, Check } from "lucide-react";
import { useRouter } from "next/navigation";

export default function MessageItem({
  message,
  currentUserId,
}: {
  message: { id: string; content: string; senderId: string; createdAt: Date; editedAt: Date | null; isDeleted: boolean };
  currentUserId: string;
}) {
  const isMine = message.senderId === currentUserId;
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  if (message.isDeleted) return null;

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    
    setIsLoading(true);
    try {
      const res = await fetch(`/api/messages/${message.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Failed to delete message");
      setIsLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim()) return;
    
    setIsLoading(true);
    try {
      const res = await fetch(`/api/messages/${message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      if (!res.ok) throw new Error("Failed to edit");
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Failed to edit message");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ alignSelf: isMine ? "flex-end" : "flex-start", maxWidth: "70%" }}>
      <div
        style={{
          padding: "0.75rem",
          borderRadius: "12px",
          backgroundColor: isMine ? "var(--primary)" : "var(--background)",
          color: isMine ? "white" : "var(--foreground)",
          border: isMine ? "none" : "1px solid var(--border)",
          position: "relative",
        }}
      >
        {isEditing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              style={{
                width: "100%",
                background: "transparent",
                color: "inherit",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: "4px",
                padding: "0.25rem",
                resize: "none"
              }}
              rows={3}
            />
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button onClick={() => { setIsEditing(false); setEditContent(message.content); }} disabled={isLoading} style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", opacity: 0.8 }}>
                <X size={16} />
              </button>
              <button onClick={handleSaveEdit} disabled={isLoading} style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}>
                <Check size={16} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div>{message.content}</div>
            {isMine && !isEditing && (
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  marginTop: "0.5rem",
                  justifyContent: "flex-end",
                  opacity: 0.8,
                }}
              >
                <button onClick={() => setIsEditing(true)} style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}>
                  <Edit2 size={14} />
                </button>
                <button onClick={handleDelete} style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <div style={{ fontSize: "0.75rem", opacity: 0.6, marginTop: "0.25rem", textAlign: isMine ? "right" : "left" }}>
        {new Date(message.createdAt).toLocaleString()}
        {message.editedAt && <span> (edited)</span>}
      </div>
    </div>
  );
}
