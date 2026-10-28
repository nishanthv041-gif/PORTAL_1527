"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import styles from "./PortalBreadcrumb.module.css";

interface BreadcrumbInfo {
  parentHref: string;
  parentLabel: string;
  currentLabel: string;
}

// Explicit mappings for high-priority pages across the portal
const ROUTE_MAP: Record<string, BreadcrumbInfo> = {
  // ================= ADMIN ROUTES =================
  "/dashboard/admin/activity-centre": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Activity Centre"
  },
  "/dashboard/admin/meetings": {
    parentHref: "/dashboard/admin/activity-centre",
    parentLabel: "Activity Centre",
    currentLabel: "Meetings Management"
  },
  "/dashboard/admin/programs": {
    parentHref: "/dashboard/admin/activity-centre",
    parentLabel: "Activity Centre",
    currentLabel: "School Programs"
  },
  "/dashboard/admin/calendar": {
    parentHref: "/dashboard/admin/activity-centre",
    parentLabel: "Activity Centre",
    currentLabel: "School Calendar"
  },
  "/dashboard/admin/messages": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Messages & Communication"
  },
  "/dashboard/admin/announcements": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Announcements"
  },
  "/dashboard/admin/classes": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Class Management"
  },
  "/dashboard/admin/batches": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Batches & Promotion"
  },
  "/dashboard/admin/timetable": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Timetable Management"
  },
  "/dashboard/admin/subjects": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Subjects Directory"
  },
  "/dashboard/admin/exams": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Examination Management"
  },
  "/dashboard/admin/report-cards": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Report Cards & Grades"
  },
  "/dashboard/admin/attendance": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Student Attendance"
  },
  "/dashboard/admin/teacher-attendance": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Teacher Attendance"
  },
  "/dashboard/admin/students": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Students Directory"
  },
  "/dashboard/admin/teachers": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Faculty Teachers"
  },
  "/dashboard/admin/parents": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Parents Directory"
  },
  "/dashboard/admin/users": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "User Management"
  },
  "/dashboard/admin/login-status": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Login Status"
  },
  "/dashboard/admin/main-roles": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Main Roles Overview"
  },
  "/dashboard/admin/create-roles": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Create Roles"
  },
  "/dashboard/admin/create-roles/teacher": {
    parentHref: "/dashboard/admin/create-roles",
    parentLabel: "Create Roles",
    currentLabel: "Teacher Account"
  },
  "/dashboard/admin/create-roles/parent": {
    parentHref: "/dashboard/admin/create-roles",
    parentLabel: "Create Roles",
    currentLabel: "Parent Account"
  },
  "/dashboard/admin/create-roles/admin": {
    parentHref: "/dashboard/admin/create-roles",
    parentLabel: "Create Roles",
    currentLabel: "Admin Account"
  },
  "/dashboard/admin/create-roles/staff": {
    parentHref: "/dashboard/admin/create-roles",
    parentLabel: "Create Roles",
    currentLabel: "Staff Account"
  },
  "/dashboard/admin/discipline": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Disciplinary Records"
  },
  "/dashboard/admin/achievements": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Achievements"
  },
  "/dashboard/admin/complaints": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Complaints & Grievances"
  },
  "/dashboard/admin/performance": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Academic Analytics"
  },
  "/dashboard/admin/notifications": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "Notifications"
  },
  "/dashboard/admin/settings": {
    parentHref: "/dashboard/admin",
    parentLabel: "Dashboard",
    currentLabel: "System Settings"
  },

  // ================= TEACHER ROUTES =================
  "/dashboard/teacher/classes": {
    parentHref: "/dashboard/teacher",
    parentLabel: "Dashboard",
    currentLabel: "My Classes"
  },
  "/dashboard/teacher/timetable": {
    parentHref: "/dashboard/teacher",
    parentLabel: "Dashboard",
    currentLabel: "Weekly Timetable"
  },
  "/dashboard/teacher/attendance": {
    parentHref: "/dashboard/teacher",
    parentLabel: "Dashboard",
    currentLabel: "Daily Attendance"
  },
  "/dashboard/teacher/assignments": {
    parentHref: "/dashboard/teacher",
    parentLabel: "Dashboard",
    currentLabel: "Home Work"
  },
  "/dashboard/teacher/homework": {
    parentHref: "/dashboard/teacher",
    parentLabel: "Dashboard",
    currentLabel: "Home Work"
  },
  "/dashboard/teacher/exams": {
    parentHref: "/dashboard/teacher",
    parentLabel: "Dashboard",
    currentLabel: "Examinations"
  },
  "/dashboard/teacher/report-cards": {
    parentHref: "/dashboard/teacher",
    parentLabel: "Dashboard",
    currentLabel: "Report Cards"
  },
  "/dashboard/teacher/leaves": {
    parentHref: "/dashboard/teacher",
    parentLabel: "Dashboard",
    currentLabel: "Leave Applications"
  },
  "/dashboard/teacher/meetings": {
    parentHref: "/dashboard/teacher",
    parentLabel: "Dashboard",
    currentLabel: "Meetings Schedule"
  },
  "/dashboard/teacher/messages": {
    parentHref: "/dashboard/teacher",
    parentLabel: "Dashboard",
    currentLabel: "Messages"
  },
  "/dashboard/teacher/notifications": {
    parentHref: "/dashboard/teacher",
    parentLabel: "Dashboard",
    currentLabel: "Notifications"
  },
  "/dashboard/teacher/calendar": {
    parentHref: "/dashboard/teacher",
    parentLabel: "Dashboard",
    currentLabel: "School Calendar"
  },
  "/dashboard/teacher/programs": {
    parentHref: "/dashboard/teacher",
    parentLabel: "Dashboard",
    currentLabel: "School Programs"
  },
  "/dashboard/teacher/announcements": {
    parentHref: "/dashboard/teacher",
    parentLabel: "Dashboard",
    currentLabel: "Announcements"
  },
  "/dashboard/teacher/achievements": {
    parentHref: "/dashboard/teacher",
    parentLabel: "Dashboard",
    currentLabel: "Student Achievements"
  },
  "/dashboard/teacher/discipline": {
    parentHref: "/dashboard/teacher",
    parentLabel: "Dashboard",
    currentLabel: "Discipline Records"
  },
  "/dashboard/teacher/complaints": {
    parentHref: "/dashboard/teacher",
    parentLabel: "Dashboard",
    currentLabel: "Complaints"
  },
  "/dashboard/teacher/settings": {
    parentHref: "/dashboard/teacher",
    parentLabel: "Dashboard",
    currentLabel: "Account Settings"
  },

  // ================= PARENT ROUTES =================
  "/dashboard/parent/classes": {
    parentHref: "/dashboard/parent",
    parentLabel: "Dashboard",
    currentLabel: "Children's Classes"
  },
  "/dashboard/parent/timetable": {
    parentHref: "/dashboard/parent",
    parentLabel: "Dashboard",
    currentLabel: "Class Timetable"
  },
  "/dashboard/parent/attendance": {
    parentHref: "/dashboard/parent",
    parentLabel: "Dashboard",
    currentLabel: "Attendance Record"
  },
  "/dashboard/parent/assignments": {
    parentHref: "/dashboard/parent",
    parentLabel: "Dashboard",
    currentLabel: "Home Work"
  },
  "/dashboard/parent/homework": {
    parentHref: "/dashboard/parent",
    parentLabel: "Dashboard",
    currentLabel: "Home Work"
  },
  "/dashboard/parent/exams": {
    parentHref: "/dashboard/parent",
    parentLabel: "Dashboard",
    currentLabel: "Exam Schedules"
  },
  "/dashboard/parent/report-cards": {
    parentHref: "/dashboard/parent",
    parentLabel: "Dashboard",
    currentLabel: "Academic Report Cards"
  },
  "/dashboard/parent/leaves": {
    parentHref: "/dashboard/parent",
    parentLabel: "Dashboard",
    currentLabel: "Request Leave"
  },
  "/dashboard/parent/meetings": {
    parentHref: "/dashboard/parent",
    parentLabel: "Dashboard",
    currentLabel: "Parent Meetings (PTM)"
  },
  "/dashboard/parent/messages": {
    parentHref: "/dashboard/parent",
    parentLabel: "Dashboard",
    currentLabel: "Messages"
  },
  "/dashboard/parent/notifications": {
    parentHref: "/dashboard/parent",
    parentLabel: "Dashboard",
    currentLabel: "Notifications"
  },
  "/dashboard/parent/calendar": {
    parentHref: "/dashboard/parent",
    parentLabel: "Dashboard",
    currentLabel: "School Calendar"
  },
  "/dashboard/parent/programs": {
    parentHref: "/dashboard/parent",
    parentLabel: "Dashboard",
    currentLabel: "School Programs"
  },
  "/dashboard/parent/announcements": {
    parentHref: "/dashboard/parent",
    parentLabel: "Dashboard",
    currentLabel: "Announcements"
  },
  "/dashboard/parent/achievements": {
    parentHref: "/dashboard/parent",
    parentLabel: "Dashboard",
    currentLabel: "Achievements"
  },
  "/dashboard/parent/discipline": {
    parentHref: "/dashboard/parent",
    parentLabel: "Dashboard",
    currentLabel: "Disciplinary Notes"
  },
  "/dashboard/parent/complaints": {
    parentHref: "/dashboard/parent",
    parentLabel: "Dashboard",
    currentLabel: "Complaints & Help Desk"
  },
  "/dashboard/parent/settings": {
    parentHref: "/dashboard/parent",
    parentLabel: "Dashboard",
    currentLabel: "Account Settings"
  }
};

function formatSlug(slug: string): string {
  if (!slug) return "";
  return slug
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function PortalBreadcrumb() {
  const pathname = usePathname();

  if (!pathname) return null;

  // Normalize path
  const cleanPath = pathname.split("?")[0].replace(/\/+$/, "");

  // Root dashboards do not need breadcrumb (they are home)
  if (
    cleanPath === "/dashboard" ||
    cleanPath === "/dashboard/admin" ||
    cleanPath === "/dashboard/teacher" ||
    cleanPath === "/dashboard/parent" ||
    cleanPath === "/login" ||
    cleanPath === "/login/admin" ||
    cleanPath === "/login/teacher" ||
    cleanPath === "/login/parent" ||
    cleanPath === ""
  ) {
    return null;
  }

  // 1. Direct match in ROUTE_MAP
  if (ROUTE_MAP[cleanPath]) {
    const info = ROUTE_MAP[cleanPath];
    return (
      <nav aria-label="Breadcrumb navigation" className={styles.breadcrumbBar}>
        <Link href={info.parentHref} className={styles.backLink}>
          <ArrowLeft size={16} /> {info.parentLabel}
        </Link>
        <span className={styles.separator}>/</span>
        <span className={styles.currentPage}>{info.currentLabel}</span>
      </nav>
    );
  }

  // 2. Dynamic sub-route detection (e.g., /messages/[id], /exams/[id], /classes/[id], etc.)
  const segments = cleanPath.split("/").filter(Boolean);

  // Example: ["dashboard", "admin", "messages", "clx123"]
  if (segments.length >= 3) {
    const role = segments[1]; // "admin", "teacher", "parent"
    const section = segments[2]; // "messages", "exams", "classes", "subjects", "parents", "report-cards", etc.

    // If it's a message thread
    if (section === "messages" && segments.length >= 4) {
      return (
        <nav aria-label="Breadcrumb navigation" className={styles.breadcrumbBar}>
          <Link href={`/dashboard/${role}/messages`} className={styles.backLink}>
            <ArrowLeft size={16} /> Messages
          </Link>
          <span className={styles.separator}>/</span>
          <span className={styles.currentPage}>Direct Conversation</span>
        </nav>
      );
    }

    // If it's exams marks/details
    if (section === "exams" && segments.length >= 4) {
      return (
        <nav aria-label="Breadcrumb navigation" className={styles.breadcrumbBar}>
          <Link href={`/dashboard/${role}/exams`} className={styles.backLink}>
            <ArrowLeft size={16} /> Examinations
          </Link>
          <span className={styles.separator}>/</span>
          <span className={styles.currentPage}>Exam Details</span>
        </nav>
      );
    }

    // If it's class roster
    if (section === "classes" && segments.length >= 4) {
      return (
        <nav aria-label="Breadcrumb navigation" className={styles.breadcrumbBar}>
          <Link href={`/dashboard/${role}/classes`} className={styles.backLink}>
            <ArrowLeft size={16} /> Classes
          </Link>
          <span className={styles.separator}>/</span>
          <span className={styles.currentPage}>Class Roster</span>
        </nav>
      );
    }

    // If it's assignment or homework submissions
    if ((section === "assignments" || section === "homework") && segments.length >= 4) {
      return (
        <nav aria-label="Breadcrumb navigation" className={styles.breadcrumbBar}>
          <Link href={`/dashboard/${role}/assignments`} className={styles.backLink}>
            <ArrowLeft size={16} /> Home Work
          </Link>
          <span className={styles.separator}>/</span>
          <span className={styles.currentPage}>Home Work Submissions</span>
        </nav>
      );
    }

    // If it's report-cards individual student
    if (section === "report-cards" && segments.length >= 4) {
      return (
        <nav aria-label="Breadcrumb navigation" className={styles.breadcrumbBar}>
          <Link href={`/dashboard/${role}/report-cards`} className={styles.backLink}>
            <ArrowLeft size={16} /> Report Cards
          </Link>
          <span className={styles.separator}>/</span>
          <span className={styles.currentPage}>Student Report Card</span>
        </nav>
      );
    }

    // If it's subject detail
    if (section === "subjects" && segments.length >= 4) {
      return (
        <nav aria-label="Breadcrumb navigation" className={styles.breadcrumbBar}>
          <Link href={`/dashboard/${role}/subjects`} className={styles.backLink}>
            <ArrowLeft size={16} /> Subjects
          </Link>
          <span className={styles.separator}>/</span>
          <span className={styles.currentPage}>{decodeURIComponent(segments[3])}</span>
        </nav>
      );
    }

    // If it's parent detail
    if (section === "parents" && segments.length >= 4) {
      return (
        <nav aria-label="Breadcrumb navigation" className={styles.breadcrumbBar}>
          <Link href={`/dashboard/${role}/parents`} className={styles.backLink}>
            <ArrowLeft size={16} /> Parents
          </Link>
          <span className={styles.separator}>/</span>
          <span className={styles.currentPage}>Parent Details</span>
        </nav>
      );
    }

    // General fallback for sub-items
    const parentSegments = segments.slice(0, -1);
    const parentHref = "/" + parentSegments.join("/");
    const parentLabel = formatSlug(parentSegments[parentSegments.length - 1]);
    const currentLabel = formatSlug(segments[segments.length - 1]);

    return (
      <nav aria-label="Breadcrumb navigation" className={styles.breadcrumbBar}>
        <Link href={parentHref} className={styles.backLink}>
          <ArrowLeft size={16} /> {parentLabel}
        </Link>
        <span className={styles.separator}>/</span>
        <span className={styles.currentPage}>{currentLabel}</span>
      </nav>
    );
  }

  // Fallback for any other dashboard path
  return (
    <nav aria-label="Breadcrumb navigation" className={styles.breadcrumbBar}>
      <Link href="/dashboard" className={styles.backLink}>
        <ArrowLeft size={16} /> Dashboard
      </Link>
      <span className={styles.separator}>/</span>
      <span className={styles.currentPage}>{formatSlug(segments[segments.length - 1])}</span>
    </nav>
  );
}
