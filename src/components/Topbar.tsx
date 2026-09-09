"use client";

import styles from "./Topbar.module.css";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

export default function Topbar({
  user,
}: {
  user: { name?: string | null; role?: string | null };
}) {
  const pathname = usePathname();

  // Create a readable title from pathname
  const getPageTitle = () => {
    if (pathname === "/dashboard") return "Overview";
    const segment = pathname.split("/").pop();
    return segment
      ? segment.charAt(0).toUpperCase() + segment.slice(1).replace("-", " ")
      : "Dashboard";
  };

  return (
    <header className={styles.topbar}>
      <h2 className={styles.title}>{getPageTitle()}</h2>
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
