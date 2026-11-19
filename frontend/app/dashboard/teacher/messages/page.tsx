import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import Link from "next/link";
import styles from "../../dashboard.module.css";
import { MessageSquare, ShieldCheck, Users, ArrowRight } from "lucide-react";
import TeacherBroadcastButton from "./TeacherBroadcastButton";
import { getParentsForTeacher } from "@/frontend/lib/directoryResolver";

export default async function TeacherMessagesPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const [{ parents, classes }, adminUsers] = await Promise.all([
    getParentsForTeacher(session.user.id),
    prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true, name: true, email: true },
      take: 5
    })
  ]);

  const teacherClasses = classes.map(c => ({ id: c.id, name: c.name, section: c.section }));

  return (
    <div className={styles.dashboard}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", margin: "0 0 1.5rem" }}>
        <h1 className={styles.title} style={{ margin: 0 }}>Messages &amp; Communication</h1>
        {teacherClasses.length > 0 && <TeacherBroadcastButton classes={teacherClasses} />}
      </div>

      {/* School Administration Option */}
      <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
        <h3 className={styles.chartHeader} style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#6366f1" }}>
          <ShieldCheck size={18} /> School Administration
        </h3>
        <p style={{ opacity: 0.7, marginBottom: "1rem", fontSize: "0.875rem" }}>
          Contact school administrative officers and leadership directly.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '1rem', width: '100%', minWidth: 0 }}>
          {adminUsers.map(admin => (
            <Link href={`/dashboard/teacher/messages/${admin.id}`} key={admin.id} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '10px', backgroundColor: 'var(--background)', transition: 'all 0.2s' }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', backgroundColor: 'rgba(99, 102, 241, 0.12)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShieldCheck size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ margin: 0, color: 'var(--foreground)', fontSize: '0.95rem', fontWeight: 700 }}>{admin.name}</h4>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    School Administration
                  </p>
                </div>
                <ArrowRight size={16} color="var(--text-secondary)" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Class Parents Option */}
      <div className={styles.chartCard}>
        <h3 className={styles.chartHeader} style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#0284c7" }}>
          <Users size={18} /> Student Parents &amp; Guardians
        </h3>
        <p style={{ opacity: 0.7, marginBottom: "1.25rem", fontSize: "0.875rem" }}>
          Direct communication channels with the parents of students in your assigned classes.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '1rem', width: '100%', minWidth: 0 }}>
          {parents.map((parent) => (
            <Link href={`/dashboard/teacher/messages/${parent.id}`} key={parent.id} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '10px', backgroundColor: 'var(--background)', transition: 'all 0.2s' }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', backgroundColor: 'rgba(2, 132, 199, 0.12)', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ margin: 0, color: 'var(--foreground)', fontSize: '0.95rem', fontWeight: 700 }}>{parent.name}</h4>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Parent of: <strong style={{ color: 'var(--foreground)' }}>{parent.studentName}</strong>
                  </p>
                  <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: '#0284c7', fontWeight: 600 }}>
                    Class {parent.className}
                  </p>
                </div>
                <ArrowRight size={16} color="var(--text-secondary)" />
              </div>
            </Link>
          ))}

          {parents.length === 0 && (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              No parents found in your assigned classes yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
