"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";
import {
  Home,
  GraduationCap,
  Award,
  CalendarCheck,
  Grid,
  Calendar,
  BookOpen,
  Bus,
  MessageSquare,
  Bell,
  Video,
  AlertCircle,
  Star,
  Settings,
  LogOut,
} from "lucide-react";
import styles from "./ParentBottomNav.module.css";
import BottomSheet from "@/components/ui/BottomSheet";

export function ParentBottomNav() {
  const pathname = usePathname();
  const confirm = useConfirm();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = async () => {
    const ok = await confirm({
      title: "Sign out of Parent Portal?",
      message: "Are you sure you want to log out of your parent account?",
      confirmText: "Sign Out",
      cancelText: "Stay Logged In",
      variant: "primary",
    });
    if (!ok) return;

    try {
      sessionStorage.removeItem("srt_portal_popup_notif_dismissed");
      sessionStorage.removeItem("srt_portal_fresh_login");
    } catch { }
    await signOut({ callbackUrl: "/" });
  };

  const navItems = [
    {
      label: "Home",
      href: "/dashboard/parent",
      icon: <Home size={20} />,
      isActive: pathname === "/dashboard/parent",
    },
    {
      label: "Classes",
      href: "/dashboard/parent/classes",
      icon: <GraduationCap size={20} />,
      isActive: pathname?.startsWith("/dashboard/parent/classes"),
    },
    {
      label: "Report Cards",
      href: "/dashboard/parent/report-cards",
      icon: <Award size={20} />,
      isActive: pathname?.startsWith("/dashboard/parent/report-cards"),
    },
    {
      label: "Attendance",
      href: "/dashboard/parent/attendance",
      icon: <CalendarCheck size={20} />,
      isActive: pathname?.startsWith("/dashboard/parent/attendance"),
    },
  ];

  const moreItems = [
    {
      label: "Timetable",
      href: "/dashboard/parent/timetable",
      icon: <Calendar size={22} />,
    },
    {
      label: "Home Work",
      href: "/dashboard/parent/assignments",
      icon: <BookOpen size={22} />,
    },
    {
      label: "Exams",
      href: "/dashboard/parent/exams",
      icon: <Award size={22} />,
    },
    {
      label: "School Bus",
      href: "/parent/bus",
      icon: <Bus size={22} />,
    },
    {
      label: "Messages",
      href: "/dashboard/parent/messages",
      icon: <MessageSquare size={22} />,
    },
    {
      label: "Announce",
      href: "/dashboard/parent/announcements",
      icon: <Bell size={22} />,
    },
    {
      label: "Meetings",
      href: "/dashboard/parent/meetings",
      icon: <Video size={22} />,
    },
    {
      label: "Complaints",
      href: "/dashboard/parent/complaints",
      icon: <AlertCircle size={22} />,
    },
    {
      label: "Programs",
      href: "/dashboard/parent/programs",
      icon: <Star size={22} />,
    },
    {
      label: "Settings",
      href: "/dashboard/parent/settings",
      icon: <Settings size={22} />,
    },
    {
      label: "Log Out",
      href: "#logout",
      icon: <LogOut size={22} />,
      isLogout: true,
    },
  ];

  const isMoreActive =
    !navItems.some((item) => item.isActive) &&
    moreItems.some(
      (item) =>
        !item.isLogout &&
        (pathname?.startsWith(item.href) ||
          (item.href === "/dashboard/parent/assignments" && pathname?.startsWith("/dashboard/parent/homework")))
    );

  if (!mounted) return null;

  return createPortal(
    <>
      <nav className={styles.bottomNav} aria-label="Parent mobile navigation">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className={`${styles.navItem} ${item.isActive ? styles.navItemActive : ""}`}
            aria-current={item.isActive ? "page" : undefined}
          >
            <div className={styles.iconWrapper}>
              {item.icon}
              {item.isActive && <div className={styles.activeDot} />}
            </div>
            <span className={styles.navLabel}>{item.label}</span>
          </Link>
        ))}

        <button
          type="button"
          className={`${styles.navItem} ${isMoreActive ? styles.navItemActive : ""}`}
          onClick={() => setIsMoreOpen(true)}
          aria-label="Open more menu"
          aria-expanded={isMoreOpen}
        >
          <div className={styles.iconWrapper}>
            <Grid size={20} />
            {isMoreActive && <div className={styles.activeDot} />}
          </div>
          <span className={styles.navLabel}>More</span>
        </button>
      </nav>

      <BottomSheet
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        title="Parent Menu"
      >
        <div className={styles.moreGrid}>
          {moreItems.map((item) =>
            item.isLogout ? (
              <button
                key={item.href}
                type="button"
                className={`${styles.moreItem} ${styles.moreItemLogout}`}
                onClick={() => {
                  setIsMoreOpen(false);
                  handleLogout();
                }}
              >
                <div className={styles.moreIconCircle}>{item.icon}</div>
                <span>{item.label}</span>
              </button>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={styles.moreItem}
                onClick={() => setIsMoreOpen(false)}
              >
                <div className={styles.moreIconCircle}>{item.icon}</div>
                <span>{item.label}</span>
              </Link>
            )
          )}
        </div>

        <div className={styles.moreLogoutSection}>
          <button
            type="button"
            className={styles.moreLogoutBtn}
            onClick={() => {
              setIsMoreOpen(false);
              handleLogout();
            }}
          >
            <LogOut size={18} />
            <span>Log Out of Parent Portal</span>
          </button>
        </div>
      </BottomSheet>
    </>,
    document.body
  );
}

export default ParentBottomNav;

