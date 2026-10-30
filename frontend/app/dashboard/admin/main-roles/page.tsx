import Link from "next/link";
import styles from "./mainRoles.module.css";
import {
  Users,
  GraduationCap,
  BookOpen,
  UserCheck,
  TrendingUp,
  Clock,
  Calendar,
  FileWarning,
  ArrowRight,
} from "lucide-react";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";

export default async function MainRolesPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") redirect("/login");

  // Core School Roles & Operations
  const roleLinks = [
    { href: "/dashboard/admin/classes", label: "Classes", icon: <GraduationCap size={22} />, color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.1)" },
    { href: "/dashboard/admin/subjects", label: "Subjects", icon: <BookOpen size={22} />, color: "#ec4899", bg: "rgba(236, 72, 153, 0.1)" },
    { href: "/dashboard/admin/attendance", label: "Student Attendance", icon: <UserCheck size={22} />, color: "var(--primary)", bg: "var(--primary-bg)" },
    { href: "/dashboard/admin/teacher-attendance", label: "Teacher Attendance", icon: <UserCheck size={22} />, color: "var(--success)", bg: "var(--success-bg)" },
    { href: "/dashboard/admin/performance", label: "Performance", icon: <TrendingUp size={22} />, color: "var(--success)", bg: "var(--success-bg)" },
    { href: "/dashboard/admin/calendar", label: "Calendar", icon: <Calendar size={22} />, color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.1)" },
    { href: "/dashboard/admin/complaints", label: "Complaints", icon: <FileWarning size={22} />, color: "var(--danger)", bg: "var(--danger-bg)" },
    { href: "/dashboard/admin/students", label: "Students List", icon: <Users size={22} />, color: "var(--primary)", bg: "var(--primary-bg)" },
    { href: "/dashboard/admin/teachers", label: "Teachers List", icon: <GraduationCap size={22} />, color: "var(--success)", bg: "var(--success-bg)" },
    { href: "/dashboard/admin/parents", label: "Parents List", icon: <Users size={22} />, color: "var(--warning)", bg: "var(--warning-bg)" },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Main Roles &amp; Operations</h1>
        <p className={styles.subtitle}>
          Central hub for timetable scheduling, academic roles, and school operations.
        </p>
      </div>

      {/* Featured Timetable Operation (Shifted to Main Roles) */}
      <div>
        <p className={styles.sectionTitle}>Timetable Scheduling &amp; Substitution</p>
        <Link
          href="/dashboard/admin/timetable"
          className={styles.featuredCard}
          style={{ maxWidth: "600px" }}
        >
          <div
            className={styles.featuredIcon}
            style={{ backgroundColor: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" }}
          >
            <Clock size={30} />
          </div>
          <div className={styles.featuredInfo}>
            <div className={styles.featuredLabel} style={{ fontSize: "1.15rem" }}>
              Timetable Management
            </div>
            <div className={styles.featuredDesc}>
              Configure school schedule, period timings, upload schedules, and assign substitute teachers.
            </div>
          </div>
          <ArrowRight size={20} style={{ color: "var(--text-secondary)", flexShrink: 0, opacity: 0.6 }} />
        </Link>
      </div>

      {/* Roles & Operations Grid */}
      <div>
        <p className={styles.sectionTitle}>Roles &amp; Operations</p>
        <div className={styles.rolesGrid}>
          {roleLinks.map((link) => (
            <Link key={link.href} href={link.href} className={styles.roleCard}>
              <div
                className={styles.roleIcon}
                style={{ color: link.color, backgroundColor: link.bg }}
              >
                {link.icon}
              </div>
              <div className={styles.roleLabel}>
                {link.label}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
