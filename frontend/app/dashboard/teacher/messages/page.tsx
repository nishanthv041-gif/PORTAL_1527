import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import Link from "next/link";
import styles from "../../dashboard.module.css";
import { MessageSquare, ShieldCheck, Users, ArrowRight } from "lucide-react";

export default async function TeacherMessagesPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const [teacher, adminUsers] = await Promise.all([
    prisma.teacher.findUnique({
      where: { userId: session.user.id },
      include: {
        classes: {
          include: {
            students: {
              include: {
                parents: {
                  include: {
                    parent: {
                      include: {
                        user: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }),
    prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true, name: true, email: true },
      take: 5
    })
  ]);

  if (!teacher) return null;

  // Extract unique parents with student and class info
  const parentMap = new Map();
  teacher.classes.forEach(c => {
    c.students.forEach(s => {
      s.parents.forEach(p => {
        if (!parentMap.has(p.parent.userId)) {
          parentMap.set(p.parent.userId, {
            ...p.parent.user,
            studentName: `${s.firstName} ${s.lastName}`,
            className: `${c.name}-${c.section}`
          });
        }
      });
    });
  });

  const parents = Array.from(parentMap.values());

  return (
    <div className={styles.dashboard}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 className={styles.title} style={{ margin: "0 0 0.5rem" }}>Messages &amp; Communication</h1>
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>
          Communicate directly with School Administration and parents of your students.
        </p>
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

      {/* Student Parents Option */}
      <div className={styles.chartCard}>
        <h3 className={styles.chartHeader} style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#8b5cf6" }}>
          <Users size={18} /> Student Parents &amp; Guardians
        </h3>
        <p style={{ opacity: 0.7, marginBottom: "1.25rem", fontSize: "0.875rem" }}>
          Message parents regarding academic performance, attendance, and feedback.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '1rem', width: '100%', minWidth: 0 }}>
          {parents.map((parentUser) => (
            <Link href={`/dashboard/teacher/messages/${parentUser.id}`} key={parentUser.id} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '10px', backgroundColor: 'var(--background)', transition: 'all 0.2s' }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', backgroundColor: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MessageSquare size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ margin: 0, color: 'var(--foreground)', fontSize: '0.95rem', fontWeight: 700 }}>{parentUser.name}</h4>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: '#8b5cf6', fontWeight: 600 }}>
                    Parent of {parentUser.studentName}
                  </p>
                  <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Class {parentUser.className}
                  </p>
                </div>
                <ArrowRight size={16} color="var(--text-secondary)" />
              </div>
            </Link>
          ))}

          {parents.length === 0 && (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              No parents found for students in your assigned classes.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
