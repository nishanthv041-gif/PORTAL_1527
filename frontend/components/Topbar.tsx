"use client";

import styles from "./Topbar.module.css";
import { usePathname, useRouter } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { ArrowLeft } from "lucide-react";

export default function Topbar({
  user,
}: {
  user: { name?: string | null; role?: string | null };
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Create a readable title from pathname
  const getPageTitle = () => {
    if (pathname === "/dashboard") return "Overview";
    const segment = pathname.split("/").pop();
    return segment
      ? segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ")
      : "Dashboard";
  };

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
        <h2 className={styles.title}>{getPageTitle()}</h2>
      </div>
      <div className={styles.userInfo}>
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
