import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import Link from "next/link";
import styles from "../../dashboard.module.css";
import { Users } from "lucide-react";

export default async function TeacherClassesPage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      classes: {
        include: {
          _count: {
            select: { students: true }
          }
        }
      }
    }
  });

  if (!teacher) {
    return <p>Teacher not found.</p>;
  }

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>My Classes</h1>
      
      <div className={styles.statsGrid}>
        {teacher.classes.map((cls) => (
          <Link href={`/dashboard/teacher/classes/${cls.id}`} key={cls.id} style={{ textDecoration: 'none' }}>
            <div className={styles.statCard} style={{ cursor: 'pointer', transition: 'transform 0.2s', border: '1px solid var(--primary)' }}>
              <div className={styles.statIcon}><Users size={24} /></div>
              <div className={styles.statInfo}>
                <span className={styles.statValue} style={{ fontSize: '1.25rem', marginTop: 0 }}>
                  {cls.name} - {cls.section}
                </span>
                <span className={styles.statLabel} style={{ marginTop: '0.25rem' }}>
                  {cls._count.students} Students
                </span>
              </div>
            </div>
          </Link>
        ))}

        {teacher.classes.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--card)', borderRadius: '12px', border: '1px dashed var(--border)' }}>
            <p>You are not assigned to any classes yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
