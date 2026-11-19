"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import BroadcastModal, { ClassOption } from "@/frontend/components/chat/BroadcastModal";

export default function TeacherBroadcastButton({ classes = [] }: { classes: ClassOption[] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.6rem 1.2rem",
          backgroundColor: "var(--primary, #6366f1)",
          color: "#ffffff",
          border: "none",
          borderRadius: "8px",
          fontWeight: 700,
          fontSize: "0.88rem",
          cursor: "pointer",
          boxShadow: "0 2px 6px rgba(99, 102, 241, 0.25)",
        }}
      >
        <Send size={15} /> Send File / Broadcast to Class
      </button>

      <BroadcastModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        currentUserRole="TEACHER"
        classes={classes}
      />
    </>
  );
}
