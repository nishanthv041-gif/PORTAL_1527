"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { markNotificationReadAction } from "@/backend/actions/dashboard/parent/notifications/actions";

export default function MarkReadButton({ notificationId }: { notificationId: string }) {
  const [isMarking, setIsMarking] = useState(false);

  const handleMarkRead = async () => {
    setIsMarking(true);
    await markNotificationReadAction(notificationId);
    setIsMarking(false);
  };

  return (
    <button 
      onClick={handleMarkRead}
      disabled={isMarking}
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.25rem', 
        fontSize: '0.75rem', 
        background: 'transparent', 
        color: 'var(--primary)', 
        border: '1px solid var(--primary)', 
        padding: '6px 12px', 
        borderRadius: '16px',
        cursor: isMarking ? 'not-allowed' : 'pointer',
        opacity: isMarking ? 0.5 : 1,
        transition: 'all 0.2s'
      }}
    >
      <Check size={14} /> {isMarking ? "Marking..." : "Mark as Read"}
    </button>
  );
}
