"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";
import {
  Home,
  Users,
  Award,
  CalendarCheck,
  Grid,
  Calendar,
  BookOpen,
  GraduationCap,
  Bell,
  MessageSquare,
  AlertCircle,
  Settings,
  Bus,
  LogOut,
} from "lucide-react";
import styles from "./TeacherBottomNav.module.css";
import BottomSheet from "@/components/ui/BottomSheet";

export function TeacherBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const confirm = useConfirm();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const handleLogout = async () => {
    const ok = await confirm({
      title: "Sign out of Teacher Portal?",
      message: "Are you sure you want to log out of your teacher account? Any unsaved progress will be lost.",
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
      href: "/dashboard/teacher",
      icon: <Home size={20} />,
      isActive: pathname === "/dashboard/teacher",
    },
    {
      label: "Classes",
      href: "/dashboard/teacher/classes",
      icon: <Users size={20} />,
      isActive: pathname?.startsWith("/dashboard/teacher/classes"),
    },
    {
      label: "Report Cards",
      href: "/dashboard/teacher/report-cards",
      icon: <Award size={20} />,
      isActive: pathname?.startsWith("/dashboard/teacher/report-cards"),
    },
    {
      label: "Attendance",
      href: "/dashboard/teacher/attendance",
      icon: <CalendarCheck size={20} />,
      isActive: pathname?.startsWith("/dashboard/teacher/attendance"),
    },
  ];

  const moreItems = [
    {
      label: "Timetable",
      href: "/dashboard/teacher/timetable",
      icon: <Calendar size={22} />,
    },
    {
      label: "Home Work",
      href: "/dashboard/teacher/assignments",
      icon: <BookOpen size={22} />,
    },
    {
      label: "Exams",
      href: "/dashboard/teacher/exams",
      icon: <GraduationCap size={22} />,
    },
    {
      label: "Announce",
      href: "/dashboard/teacher/announcements",
      icon: <Bell size={22} />,
    },
    {
      label: "Messages",
      href: "/dashboard/teacher/messages",
      icon: <MessageSquare size={22} />,
    },
    {
      label: "Complaints",
      href: "/dashboard/teacher/complaints",
      icon: <AlertCircle size={22} />,
    },
    {
      label: "Transport",
      href: "/dashboard/teacher/transport",
      icon: <Bus size={22} />,
    },
    {
      label: "Settings",
      href: "/dashboard/teacher/settings",
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
          (item.href === "/dashboard/teacher/assignments" && pathname?.startsWith("/dashboard/teacher/homework")))
    );

  if (!mounted) return null;

  return createPortal(
    <>
      <nav className={styles.bottomNav} aria-label="Teacher mobile navigation">
        {navItems.map((item) => {
          const isPending = pendingHref === item.href && !item.isActive;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onMouseEnter={() => {
                try { router.prefetch(item.href); } catch {}
              }}
              onTouchStart={() => {
                try { router.prefetch(item.href); } catch {}
              }}
              onClick={() => setPendingHref(item.href)}
              className={`${styles.navItem} ${item.isActive ? styles.navItemActive : ""} ${isPending ? styles.navItemPending : ""}`}
              aria-current={item.isActive ? "page" : undefined}
            >
              <div className={styles.iconWrapper}>
                {isPending ? <div className={styles.bottomSpinner} /> : item.icon}
                {(item.isActive || isPending) && <div className={styles.activeDot} />}
              </div>
              <span className={styles.navLabel}>{item.label}</span>
            </Link>
          );
        })}

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
        title="Teacher Menu"
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
                onMouseEnter={() => {
                  try { router.prefetch(item.href); } catch {}
                }}
                onTouchStart={() => {
                  try { router.prefetch(item.href); } catch {}
                }}
                className={styles.moreItem}
                onClick={() => {
                  setPendingHref(item.href);
                  setIsMoreOpen(false);
                }}
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
            <span>Log Out of Teacher Portal</span>
          </button>
        </div>
      </BottomSheet>
    </>,
    document.body
  );
}

export default TeacherBottomNav;

