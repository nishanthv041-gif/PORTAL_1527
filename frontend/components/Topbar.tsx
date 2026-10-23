"use client";

import styles from "./Topbar.module.css";
import { usePathname, useRouter } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { ArrowLeft, Bell } from "lucide-react";
import { useEffect, useState } from "react";

// Matches the key used in NotificationPopupModal
const CLEARED_KEY = "srt_portal_notif_cleared_v1";

export default function Topbar({
  user,
}: {
  user: { name?: string | null; role?: string | null };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [showRedDot, setShowRedDot] = useState(false);

  // On mount, check if notifications have been permanently cleared
  useEffect(() => {
    const isClearedForever = localStorage.getItem(CLEARED_KEY) === "true";
    setShowRedDot(!isClearedForever);

    // Listen for the event dispatched by NotificationPopupModal on "Clear All"
    const handleCleared = () => {
      setShowRedDot(false);
    };
    window.addEventListener("notifications-cleared", handleCleared);
    return () => window.removeEventListener("notifications-cleared", handleCleared);
  }, []);

  // Determine if we should show the back button
  // Typically, show it if we are deeper than the main dashboard level.
  // /dashboard is 2 segments (['', 'dashboard'])
  // /dashboard/admin/users is 4 segments
  const showBack = (pathname || "").split("/").filter(Boolean).length > 2;

  return (
    <header className={styles.topbar}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {showBack && (
          <button 
            onClick={() => router.back()} 
            style={{ 
              background: 'var(--card-bg)', 
              border: '1px solid var(--border-color)', 
              cursor: 'pointer', 
              color: 'var(--text-secondary)', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.25rem',
              padding: '0.4rem 0.75rem',
              borderRadius: '8px',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.color = 'var(--foreground)';
              e.currentTarget.style.borderColor = 'var(--foreground)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.borderColor = 'var(--border-color)';
            }}
          >
            <ArrowLeft size={16} />
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Back</span>
          </button>
        )}
      </div>
      <div className={styles.userInfo}>
        <button
          type="button"
          onClick={() => {
            // Re-enable popup for this manual click by removing the session dismissed flag
            window.dispatchEvent(new CustomEvent("open-notification-popup"));
          }}
          title="View Notifications"
          aria-label="View Notifications"
          style={{
            background: 'var(--card-bg, #ffffff)',
            border: '1px solid var(--border-color)',
            borderRadius: '50%',
            width: '38px',
            height: '38px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#f59e0b',
            position: 'relative',
            marginRight: '0.35rem',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            flexShrink: 0
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'scale(1.06)';
            e.currentTarget.style.borderColor = 'var(--primary)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.borderColor = 'var(--border-color)';
          }}
        >
          <Bell size={18} />
          {showRedDot && (
            <span style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#ef4444',
              border: '1.5px solid var(--card-bg, #ffffff)'
            }} />
          )}
        </button>

        <ThemeToggle style={{ marginRight: "0.25rem" }} />
        <div className={styles.userDetails}>
          <span className={styles.userName}>{user?.name}</span>
          <span className={styles.userRole}>{user?.role}</span>
        </div>
        <div className={styles.avatar}>{user?.name?.charAt(0) || "U"}</div>
      </div>
    </header>
  );
}
