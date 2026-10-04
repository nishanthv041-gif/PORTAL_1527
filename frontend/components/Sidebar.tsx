"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import styles from "./Sidebar.module.css";
import { 
  Menu,
  Users, 
  GraduationCap, 
  BookOpen, 
  Calendar,
  MessageSquare,
  Settings,
  LayoutDashboard,
  LogOut,
  Video,
  FileWarning,
  AlertTriangle,
  Award,
  CalendarOff,
  Bell,
  Megaphone,
  UserPlus,
  UserCheck,
  FileText,
  TrendingUp,
  Clock,
  Star,
  AlertOctagon
} from "lucide-react";

export default function Sidebar({ role, settings = {} }: { role: string; settings?: Record<string, string> }) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    // Close mobile menu on route change
    const checkbox = document.getElementById("mobile-menu-toggle") as HTMLInputElement | null;
    if (checkbox && checkbox.checked) {
      checkbox.checked = false;
    }
  }, [pathname]);

  const adminLinks = [
    { href: "/dashboard/admin", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
    { href: "/dashboard/admin/main-roles", label: "Main Roles", icon: <Users size={20} /> },
    { href: "/dashboard/admin/activity-centre", label: "Activity Centre", icon: <Star size={20} /> },
    { href: "/dashboard/admin/users", label: "User Management", icon: <UserCheck size={20} /> },
    { href: "/dashboard/admin/create-roles", label: "Create New Roles", icon: <UserPlus size={20} /> },
    { href: "/dashboard/admin/login-status", label: "Log In Status", icon: <Clock size={20} /> },
    { href: "/dashboard/admin/notifications", label: "Notifications", icon: <Bell size={20} /> },
    { href: "/dashboard/admin/settings", label: "Settings", icon: <Settings size={20} /> },
  ];

  let teacherLinks = [
    { href: "/dashboard/teacher", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
    { href: "/dashboard/teacher/classes", label: "My Classes", icon: <GraduationCap size={20} /> },
    { href: "/dashboard/teacher/attendance", label: "Attendance", icon: <Users size={20} /> },
    { href: "/dashboard/teacher/exams", label: "Exams", icon: <BookOpen size={20} /> },
    { href: "/dashboard/teacher/assignments", label: "Assignments", icon: <BookOpen size={20} /> },
    { href: "/dashboard/teacher/report-cards", label: "Report Cards", icon: <BookOpen size={20} /> },
    { href: "/dashboard/teacher/messages", label: "Messages", icon: <MessageSquare size={20} /> },
    { href: "/dashboard/teacher/calendar", label: "Calendar", icon: <Calendar size={20} /> },
    { href: "/dashboard/teacher/meetings", label: "Meetings", icon: <Video size={20} /> },
    { href: "/dashboard/teacher/complaints", label: "Complaints", icon: <FileWarning size={20} /> },
    { href: "/dashboard/teacher/discipline", label: "Discipline", icon: <AlertTriangle size={20} /> },
    { href: "/dashboard/teacher/achievements", label: "Achievements", icon: <Award size={20} /> },
    { href: "/dashboard/teacher/leaves", label: "Leaves", icon: <CalendarOff size={20} /> },
    { href: "/dashboard/teacher/announcements", label: "Announcements", icon: <Megaphone size={20} /> },
    { href: "/dashboard/teacher/notifications", label: "Notifications", icon: <Bell size={20} /> },
    { href: "/dashboard/teacher/settings", label: "Settings", icon: <Settings size={20} /> },
  ];

  if (settings.TEACHER_MANAGE_ATTENDANCE === "false") {
    teacherLinks = teacherLinks.filter(l => l.href !== "/dashboard/teacher/attendance");
  }
  if (settings.TEACHER_MANAGE_MARKS === "false") {
    teacherLinks = teacherLinks.filter(l => !["/dashboard/teacher/exams", "/dashboard/teacher/assignments", "/dashboard/teacher/report-cards"].includes(l.href));
  }

  let parentLinks = [
    { href: "/dashboard/parent", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
    { href: "/dashboard/parent/attendance", label: "Attendance", icon: <Users size={20} /> },
    { href: "/dashboard/parent/exams", label: "Exams", icon: <BookOpen size={20} /> },
    { href: "/dashboard/parent/assignments", label: "Assignments", icon: <BookOpen size={20} /> },
    { href: "/dashboard/parent/report-cards", label: "Report Cards", icon: <BookOpen size={20} /> },
    { href: "/dashboard/parent/messages", label: "Messages", icon: <MessageSquare size={20} /> },
    { href: "/dashboard/parent/fees", label: "Fees", icon: <BookOpen size={20} /> },
    { href: "/dashboard/parent/timetable", label: "Timetable", icon: <Calendar size={20} /> },
    { href: "/dashboard/parent/calendar", label: "Calendar", icon: <Calendar size={20} /> },
    { href: "/dashboard/parent/meetings", label: "Meetings", icon: <Video size={20} /> },
    { href: "/dashboard/parent/complaints", label: "Complaints", icon: <FileWarning size={20} /> },
    { href: "/dashboard/parent/settings", label: "Settings", icon: <Settings size={20} /> },
  ];

  if (settings.PARENT_ATTENDANCE_VISIBILITY === "false") {
    parentLinks = parentLinks.filter(l => l.href !== "/dashboard/parent/attendance");
  }
  if (settings.RESULT_VISIBILITY === "false") {
    parentLinks = parentLinks.filter(l => !["/dashboard/parent/exams", "/dashboard/parent/report-cards"].includes(l.href));
  }

  let links = parentLinks;
  if (role === "ADMIN") links = adminLinks;
  if (role === "TEACHER") links = teacherLinks;

  const schoolName = settings.SCHOOL_NAME || "EduPortal";
  const schoolLogo = settings.SCHOOL_LOGO || null;

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ""}`}>
      <div className={styles.logo}>
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)} 
          className={styles.toggleBtn}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <Menu size={24} />
        </button>
        {!isCollapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
            {schoolLogo && (
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                padding: '2px',
                background: 'linear-gradient(135deg, #3b82f6, #ec4899)',
                boxShadow: '0 4px 12px rgba(236, 72, 153, 0.2)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                flexShrink: 0
              }}>
                <img src={schoolLogo} alt={schoolName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', backgroundColor: 'transparent' }} />
              </div>
            )}
            <span className={styles.logoText} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{schoolName}</span>
          </div>
        )}
      </div>
      <nav className={styles.nav}>
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <div key={link.href} className={styles.navItemWrapper}>
              <Link
                href={link.href}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                title={isCollapsed ? link.label : undefined}
              >
                <div className={styles.iconWrapper}>{link.icon}</div>
                {!isCollapsed && <span className={styles.linkLabel}>{link.label}</span>}
              </Link>
            </div>
          );
        })}
      </nav>
      <div className={styles.logoutWrapper}>
        <button 
          onClick={() => signOut({ callbackUrl: '/' })} 
          className={styles.logoutBtn}
          title={isCollapsed ? "Logout" : undefined}
        >
          <div className={styles.iconWrapper}>
            <LogOut size={20} />
          </div>
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
