import Link from "next/link";
import styles from "../../dashboard.module.css";
import { Star, Video, AlertOctagon, Award, Megaphone, MessageSquare } from "lucide-react";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";

export default async function ActivityCentrePage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") redirect("/login");

  const links = [
    { href: "/dashboard/admin/programs", label: "School Programs", icon: <Star size={24} />, color: "var(--primary)", bg: "var(--primary-bg)" },
    { href: "/dashboard/admin/meetings", label: "Meetings", icon: <Video size={24} />, color: "var(--success)", bg: "var(--success-bg)" },
    { href: "/dashboard/admin/discipline", label: "Discipline", icon: <AlertOctagon size={24} />, color: "var(--danger)", bg: "var(--danger-bg)" },
    { href: "/dashboard/admin/achievements", label: "Achievements", icon: <Award size={24} />, color: "var(--warning)", bg: "var(--warning-bg)" },
    { href: "/dashboard/admin/announcements", label: "Announcements", icon: <Megaphone size={24} />, color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.1)" },
    { href: "/dashboard/admin/messages", label: "Messages", icon: <MessageSquare size={24} />, color: "#ec4899", bg: "rgba(236, 72, 153, 0.1)" },
  ];

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Activity Centre</h1>
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
