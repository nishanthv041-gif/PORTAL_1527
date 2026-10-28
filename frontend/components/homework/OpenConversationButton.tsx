"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import WorkConversationModal from "./WorkConversationModal";

interface OpenConversationButtonProps {
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
  initialCommentCount?: number;
  label?: string;
  variant?: "primary" | "secondary" | "outline";
}

export default function OpenConversationButton({
  assignmentId,
  assignmentTitle,
  subjectName,
  className,
  teacherName,
  currentUser,
  initialCommentCount = 0,
  label = "Work Conversation",
  variant = "primary"
}: OpenConversationButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(initialCommentCount);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "6px 14px",
          borderRadius: "8px",
          fontSize: "0.85rem",
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.15s ease",
          backgroundColor: variant === "primary" ? "rgba(99, 102, 241, 0.12)" : "var(--card)",
          color: variant === "primary" ? "var(--primary)" : "var(--foreground)",
          border: `1px solid ${variant === "primary" ? "rgba(99, 102, 241, 0.3)" : "var(--border)"}`
        }}
      >
        <MessageSquare size={15} />
        <span>{label}</span>
        {commentCount > 0 && (
          <span
            style={{
              padding: "1px 6px",
              borderRadius: "10px",
              backgroundColor: "var(--primary)",
              color: "var(--primary-fg)",
              fontSize: "0.72rem",
              fontWeight: 700
            }}
          >
            {commentCount}
          </span>
        )}
      </button>

      {isOpen && (
        <WorkConversationModal
          isOpen={true}
          onClose={() => setIsOpen(false)}
          assignmentId={assignmentId}
          assignmentTitle={assignmentTitle}
          subjectName={subjectName}
          className={className}
          teacherName={teacherName}
          currentUser={currentUser}
          onCommentsUpdated={(count: number) => setCommentCount(count)}
        />
      )}
    </>
  );
}
