"use client";

import { useState } from "react";
import { adminSendMessage } from "@/backend/api/actions/dashboard/admin/messages/[id]/actions";
import { Send } from "lucide-react";

export default function MessageForm({ receiverId }: { receiverId: string }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    const result = await adminSendMessage(receiverId, content);
    
    if (result.success) {
      setContent("");
    } else {
      alert(result.error);
    }
    
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '1rem', marginTop: 'auto' }}>
      <input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Type a message..."
        style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: '24px', border: '1px solid var(--border-color)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
        disabled={loading}
      />
      <button 
        type="submit" 
        disabled={loading || !content.trim()}
        style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (loading || !content.trim()) ? 'not-allowed' : 'pointer', opacity: (loading || !content.trim()) ? 0.5 : 1 }}
      >
        <Send size={18} />
      </button>
    </form>
  );
}
