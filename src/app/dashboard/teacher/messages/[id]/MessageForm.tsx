"use client";

import { useState } from "react";
import { sendMessage } from "@/backend/actions/dashboard/teacher/messages/[id]/actions";

export default function MessageForm({ senderId, receiverId }: { senderId: string, receiverId: string }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    const result = await sendMessage(senderId, receiverId, content);
    
    if (result.success) {
      setContent("");
    } else {
      alert("Failed to send message: " + result.error);
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
      <input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Type your message..."
        style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
        disabled={loading}
      />
      <button
        type="submit"
        disabled={loading || !content.trim()}
        style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: "var(--primary)", color: "var(--primary-fg)",
          border: 'none',
          borderRadius: '8px',
          fontWeight: 500,
          cursor: loading || !content.trim() ? 'not-allowed' : 'pointer',
          opacity: loading || !content.trim() ? 0.7 : 1
        }}
      >
        Send
      </button>
    </form>
  );
}
