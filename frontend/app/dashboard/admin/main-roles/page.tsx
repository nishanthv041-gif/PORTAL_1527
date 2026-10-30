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
  UserCog,
  Baby,
  ArrowRight,
} from "lucide-react";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";

export default async function MainRolesPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") redirect("/login");

  // Featured Priority Operations
  const featuredLinks = [
    {
      href: "/dashboard/admin/timetable",
      label: "Timetable Management",
      desc: "School schedule, period timings, and pick-and-assign substitution",
      icon: <Clock size={28} />,
      color: "#f59e0b",
      bg: "rgba(245, 158, 11, 0.12)",
    },
    {
      href: "/dashboard/admin/teachers",
      label: "Teacher Management",
      desc: "Manage teachers, subjects, credentials & Google SSO",
      icon: <UserCog size={28} />,
      color: "#3b82f6",
      bg: "rgba(59, 130, 246, 0.12)",
    },
    {
      href: "/dashboard/admin/students",
      label: "Parent & Student",
      desc: "Manage classes, student rosters, parents & credentials",
      icon: <Baby size={28} />,
      color: "#10b981",
      bg: "rgba(16, 185, 129, 0.12)",
    },
  ];

  // Core School Roles & Operations
  const roleLinks = [
    { href: "/dashboard/admin/students", label: "Students", icon: <Users size={22} />, color: "var(--primary)", bg: "var(--primary-bg)" },
    { href: "/dashboard/admin/teachers", label: "Teachers", icon: <GraduationCap size={22} />, color: "var(--success)", bg: "var(--success-bg)" },
    { href: "/dashboard/admin/parents", label: "Parents", icon: <Users size={22} />, color: "var(--warning)", bg: "var(--warning-bg)" },
    { href: "/dashboard/admin/classes", label: "Classes", icon: <GraduationCap size={22} />, color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.1)" },
    { href: "/dashboard/admin/subjects", label: "Subjects", icon: <BookOpen size={22} />, color: "#ec4899", bg: "rgba(236, 72, 153, 0.1)" },
    { href: "/dashboard/admin/attendance", label: "Student Attendance", icon: <UserCheck size={22} />, color: "var(--primary)", bg: "var(--primary-bg)" },
    { href: "/dashboard/admin/teacher-attendance", label: "Teacher Attendance", icon: <UserCheck size={22} />, color: "var(--success)", bg: "var(--success-bg)" },
    { href: "/dashboard/admin/performance", label: "Performance", icon: <TrendingUp size={22} />, color: "var(--success)", bg: "var(--success-bg)" },
    { href: "/dashboard/admin/calendar", label: "Calendar", icon: <Calendar size={22} />, color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.1)" },
    { href: "/dashboard/admin/complaints", label: "Complaints", icon: <FileWarning size={22} />, color: "var(--danger)", bg: "var(--danger-bg)" },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Main Roles &amp; Operations</h1>
        <p className={styles.subtitle}>
          Central hub for school scheduling, staff, student rosters, and daily operations.
        </p>
      </div>

      {/* Featured Management Section */}
      <div>
        <p className={styles.sectionTitle}>Featured Operations</p>
        <div className={styles.featuredGrid}>
          {featuredLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={styles.featuredCard}
            >
              <div
                className={styles.featuredIcon}
                style={{ backgroundColor: link.bg, color: link.color }}
              >
                {link.icon}
              </div>
              <div className={styles.featuredInfo}>
                <div className={styles.featuredLabel}>{link.label}</div>
                <div className={styles.featuredDesc}>{link.desc}</div>
              </div>
              <ArrowRight size={18} style={{ color: "var(--text-secondary)", flexShrink: 0, opacity: 0.6 }} />
            </Link>
          ))}
        </div>
      </div>

      {/* Roles & Operations Grid */}
      <div>
        <p className={styles.sectionTitle}>All Roles &amp; Operations</p>
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
