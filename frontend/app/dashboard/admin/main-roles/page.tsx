import Link from "next/link";
import styles from "../../dashboard.module.css";
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
} from "lucide-react";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";

export default async function MainRolesPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") redirect("/login");

  // ── Top-tier management pages ─────────────────────────────────────────────
  const managementLinks = [
    {
      href: "/dashboard/admin/teachers",
      label: "Teacher Management",
      desc: "Edit profiles, credentials, subjects & Google sign-in",
      icon: <UserCog size={28} />,
      color: "#3b82f6",
      bg: "rgba(59, 130, 246, 0.12)",
    },
    {
      href: "/dashboard/admin/students",
      label: "Parent & Student",
      desc: "Manage students, parents, classes & login details",
      icon: <Baby size={28} />,
      color: "#10b981",
      bg: "rgba(16, 185, 129, 0.12)",
    },
    {
      href: "/dashboard/admin/timetable",
      label: "Timetable",
      desc: "Build & publish the school schedule, assign substitutes",
      icon: <Clock size={28} />,
      color: "#f59e0b",
      bg: "rgba(245, 158, 11, 0.12)",
    },
  ];

  // ── Other role & data links ────────────────────────────────────────────────
  const otherLinks = [
    { href: "/dashboard/admin/students",         label: "Students",           icon: <Users size={22} />,       color: "var(--primary)",  bg: "var(--primary-bg)" },
    { href: "/dashboard/admin/teachers",         label: "Teachers",           icon: <GraduationCap size={22} />, color: "var(--success)", bg: "var(--success-bg)" },
    { href: "/dashboard/admin/parents",          label: "Parents",            icon: <Users size={22} />,       color: "var(--warning)",  bg: "var(--warning-bg)" },
    { href: "/dashboard/admin/classes",          label: "Classes",            icon: <GraduationCap size={22} />, color: "#8b5cf6",       bg: "rgba(139,92,246,0.1)" },
    { href: "/dashboard/admin/subjects",         label: "Subjects",           icon: <BookOpen size={22} />,    color: "#ec4899",         bg: "rgba(236,72,153,0.1)" },
    { href: "/dashboard/admin/attendance",       label: "Student Attendance", icon: <UserCheck size={22} />,   color: "var(--primary)",  bg: "var(--primary-bg)" },
    { href: "/dashboard/admin/teacher-attendance", label: "Teacher Attendance", icon: <UserCheck size={22} />, color: "var(--success)", bg: "var(--success-bg)" },
    { href: "/dashboard/admin/performance",      label: "Performance",        icon: <TrendingUp size={22} />,  color: "var(--success)",  bg: "var(--success-bg)" },
    { href: "/dashboard/admin/calendar",         label: "Calendar",           icon: <Calendar size={22} />,    color: "#8b5cf6",         bg: "rgba(139,92,246,0.1)" },
    { href: "/dashboard/admin/complaints",       label: "Complaints",         icon: <FileWarning size={22} />, color: "var(--danger)",   bg: "var(--danger-bg)" },
  ];

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Main Roles &amp; Operations</h1>

      {/* ── Featured Management Cards ──────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        {managementLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div
              style={{
                background: "var(--card-bg)",
                border: `1px solid ${link.color}33`,
                borderRadius: "14px",
                padding: "1.25rem 1.5rem",
                display: "flex",
                alignItems: "flex-start",
                gap: "1rem",
                transition: "box-shadow 0.18s, transform 0.18s",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = `0 6px 24px ${link.color}33`;
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                (e.currentTarget as HTMLDivElement).style.transform = "none";
              }}
            >
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "12px",
                  background: link.bg,
                  color: link.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {link.icon}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "1rem",
                    color: "var(--text-primary)",
                    marginBottom: "0.2rem",
                  }}
                >
                  {link.label}
                </div>
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.4,
                  }}
                >
                  {link.desc}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Other Quick-Access Cards ───────────────────────────────────────── */}
      <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "0.75rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
        Quick Access
      </p>
      <div className={styles.statsGrid}>
        {otherLinks.map((link) => (
          <Link key={link.href} href={link.href} style={{ textDecoration: "none", color: "inherit" }}>
            <div className={styles.navCard}>
              <div className={styles.statIcon} style={{ color: link.color, backgroundColor: link.bg }}>
                {link.icon}
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel} style={{ fontSize: "1rem", fontWeight: 600, opacity: 1 }}>
                  {link.label}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
