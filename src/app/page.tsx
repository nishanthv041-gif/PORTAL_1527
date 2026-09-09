import { getServerSession } from "next-auth/next";
import { authOptions } from "./api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen, Users, ShieldAlert, GraduationCap } from "lucide-react";
import styles from "./login/login.module.css";
import ThemeToggle from "@/components/ThemeToggle";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (session) {
    switch (session.user.role) {
      case 'ADMIN':
        redirect("/dashboard/admin");
      case 'TEACHER':
        redirect("/dashboard/teacher");
      case 'PARENT':
        redirect("/dashboard/parent");
      case 'STUDENT':
      default:
        redirect("/dashboard");
    }
  }

  return (
    <div className={styles.container}>
      <div style={{ position: "fixed", top: "1.25rem", right: "1.25rem", zIndex: 50 }}>
        <ThemeToggle />
      </div>

      <div className={styles.card}>
        <div className={styles.headerRow} style={{ justifyContent: "center" }}>
          <div className={styles.headerLogo}>
            <GraduationCap size={24} />
          </div>
          <span className={styles.headerTitle}>SRT Portal</span>
        </div>

        <h1 className={styles.title}>Hi, Welcome Back!</h1>
        <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "0.5rem", marginTop: "-1rem" }}>
          Please select your role to continue
        </p>

        <div className={styles.roleGrid}>
          <Link href="/login/teacher" className={styles.roleCard}>
            <div className={styles.roleIcon}><BookOpen size={24} /></div>
            <div className={styles.roleInfo}>
              <span className={styles.roleName}>Teacher</span>
              <span className={styles.roleDesc}>Access your classes and students</span>
            </div>
          </Link>

          <Link href="/login/parent" className={styles.roleCard}>
            <div className={styles.roleIcon}><Users size={24} /></div>
            <div className={styles.roleInfo}>
              <span className={styles.roleName}>Parent</span>
              <span className={styles.roleDesc}>View your child&apos;s progress</span>
            </div>
          </Link>

          <Link href="/login/admin" className={styles.roleCard}>
            <div className={styles.roleIcon}><ShieldAlert size={24} /></div>
            <div className={styles.roleInfo}>
              <span className={styles.roleName}>Admin</span>
              <span className={styles.roleDesc}>Manage the school system</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
