"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader2 } from "lucide-react";
import { clearAllNotificationsAction } from "@/backend/api/actions/notifications/unifiedNotificationActions";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";

export default function ClearAllNotificationsButton() {
  const [isClearing, setIsClearing] = useState(false);
  const router = useRouter();
  const confirm = useConfirm();

  const handleClear = async () => {
    const ok = await confirm({
      title: "Clear All Notifications?",
      message: "Are you sure you want to clear all notifications? This will mark all your notifications as read and silence active alerts.",
      confirmText: "Clear All",
      cancelText: "Cancel",
      variant: "warning"
    });
    if (!ok) return;

    setIsClearing(true);
    try {
      const res = await clearAllNotificationsAction();
      if (res?.error) {
        alert(res.error);
      } else {
        localStorage.setItem("srt_portal_notif_cleared_v1", "true");
        localStorage.setItem("srt_portal_notif_cleared_time", new Date().toISOString());
        sessionStorage.setItem("srt_portal_popup_notif_dismissed", "true");
        window.dispatchEvent(new CustomEvent("notifications-cleared"));
        router.refresh();
      }
    } catch {
      // Silent error handling
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <button
      onClick={handleClear}
      disabled={isClearing}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.5rem 1rem",
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        color: "var(--danger, #ef4444)",
        border: "1px solid rgba(239, 68, 68, 0.25)",
        borderRadius: "8px",
        cursor: isClearing ? "not-allowed" : "pointer",
        fontSize: "0.875rem",
        fontWeight: 600,
        transition: "all 0.15s ease"
      }}
      onMouseOver={(e) => {
        if (!isClearing) {
          e.currentTarget.style.backgroundColor = "var(--danger, #ef4444)";
          e.currentTarget.style.color = "#ffffff";
        }
      }}
      onMouseOut={(e) => {
        if (!isClearing) {
          e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
          e.currentTarget.style.color = "var(--danger, #ef4444)";
        }
      }}
      title="Clear all notifications across the portal"
    >
      {isClearing ? (
        <>
          <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
          <span>Clearing...</span>
        </>
      ) : (
        <>
          <CheckCheck size={16} />
          <span>Clear All Notifications</span>
        </>
      )}
    </button>
  );
}
