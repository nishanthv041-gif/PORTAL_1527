import Link from "next/link";
import styles from "../../dashboard.module.css";
import { Users, GraduationCap, BookOpen, UserCheck, FileText, TrendingUp, Clock, Calendar, FileWarning } from "lucide-react";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";

export default async function MainRolesPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") redirect("/login");

  const links = [
    { href: "/dashboard/admin/students", label: "Students", icon: <Users size={24} />, color: "var(--primary)", bg: "var(--primary-bg)" },
    { href: "/dashboard/admin/teachers", label: "Teachers", icon: <GraduationCap size={24} />, color: "var(--success)", bg: "var(--success-bg)" },
    { href: "/dashboard/admin/parents", label: "Parents", icon: <Users size={24} />, color: "var(--warning)", bg: "var(--warning-bg)" },
    { href: "/dashboard/admin/classes", label: "Classes", icon: <GraduationCap size={24} />, color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.1)" },
    { href: "/dashboard/admin/subjects", label: "Subjects", icon: <BookOpen size={24} />, color: "#ec4899", bg: "rgba(236, 72, 153, 0.1)" },
    { href: "/dashboard/admin/attendance", label: "Attendance", icon: <UserCheck size={24} />, color: "var(--primary)", bg: "var(--primary-bg)" },
    { href: "/dashboard/admin/performance", label: "Performance", icon: <TrendingUp size={24} />, color: "var(--success)", bg: "var(--success-bg)" },
    { href: "/dashboard/admin/timetable", label: "Timetable", icon: <Clock size={24} />, color: "var(--warning)", bg: "var(--warning-bg)" },
    { href: "/dashboard/admin/calendar", label: "Calendar", icon: <Calendar size={24} />, color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.1)" },
    { href: "/dashboard/admin/complaints", label: "Complaints", icon: <FileWarning size={24} />, color: "var(--danger)", bg: "var(--danger-bg)" },
  ];

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Main Roles & Operations</h1>
      <div className={styles.statsGrid}>
        {links.map((link) => (
          <Link key={link.href} href={link.href} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className={styles.navCard}>
              <div className={styles.statIcon} style={{ color: link.color, backgroundColor: link.bg }}>
                {link.icon}
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel} style={{ fontSize: "1.1rem", fontWeight: 600, opacity: 1 }}>{link.label}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
