"use client";

import { useRouter, usePathname } from "next/navigation";
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
  const router = useRouter();
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

  let parentHref = "/dashboard";
  let currentLabel = "";

  // 1. Direct match in ROUTE_MAP
  if (ROUTE_MAP[cleanPath]) {
    const info = ROUTE_MAP[cleanPath];
    parentHref = info.parentHref;
    currentLabel = info.currentLabel;
  } else {
    // 2. Dynamic sub-route detection (e.g., /messages/[id], /exams/[id], /classes/[id], etc.)
    const segments = cleanPath.split("/").filter(Boolean);

    if (segments.length >= 3) {
      const role = segments[1]; // "admin", "teacher", "parent"
      const section = segments[2]; // "messages", "exams", "classes", etc.

      if (section === "messages" && segments.length >= 4) {
        parentHref = `/dashboard/${role}/messages`;
        currentLabel = "Direct Conversation";
      } else if (section === "exams" && segments.length >= 4) {
        parentHref = `/dashboard/${role}/exams`;
        currentLabel = "Exam Details";
      } else if (section === "classes" && segments.length >= 4) {
        parentHref = `/dashboard/${role}/classes`;
        currentLabel = "Class Roster";
      } else if ((section === "assignments" || section === "homework") && segments.length >= 4) {
        parentHref = `/dashboard/${role}/assignments`;
        currentLabel = "Home Work Console";
      } else if (section === "report-cards" && segments.length >= 4) {
        parentHref = `/dashboard/${role}/report-cards`;
        currentLabel = "Student Report Card";
      } else if (section === "subjects" && segments.length >= 4) {
        parentHref = `/dashboard/${role}/subjects`;
        currentLabel = decodeURIComponent(segments[3]);
      } else if (section === "parents" && segments.length >= 4) {
        parentHref = `/dashboard/${role}/parents`;
        currentLabel = "Parent Details";
      } else {
        const parentSegments = segments.slice(0, -1);
        parentHref = "/" + parentSegments.join("/");
        currentLabel = formatSlug(segments[segments.length - 1]);
      }
    } else if (segments.length > 0) {
      parentHref = "/dashboard";
      currentLabel = formatSlug(segments[segments.length - 1]);
    }
  }

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(parentHref);
    }
  };

  return (
    <nav aria-label="Breadcrumb navigation" className={styles.breadcrumbBar}>
      <button
        type="button"
        onClick={handleBack}
        className={styles.backLink}
        title="Go back to previous page"
        aria-label="Back to previous page"
      >
        <ArrowLeft size={16} /> Back
      </button>
      <span className={styles.separator}>/</span>
      <span className={styles.currentPage}>{currentLabel}</span>
    </nav>
  );
}
