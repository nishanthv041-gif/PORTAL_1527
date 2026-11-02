"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import styles from "./TeacherBottomNav.module.css";
import BottomSheet from "@/components/ui/BottomSheet";

export function TeacherBottomNav() {
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
      label: "Assignments",
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
  ];

  const isMoreActive =
    !navItems.some((item) => item.isActive) &&
    moreItems.some((item) => pathname?.startsWith(item.href));

  if (!mounted) return null;

  return createPortal(
    <>
      <nav className={styles.bottomNav} aria-label="Teacher mobile navigation">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
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
        title="Teacher Menu"
      >
        <div className={styles.moreGrid}>
          {moreItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.moreItem}
              onClick={() => setIsMoreOpen(false)}
            >
              <div className={styles.moreIconCircle}>{item.icon}</div>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </BottomSheet>
    </>,
    document.body
  );
}

export default TeacherBottomNav;

