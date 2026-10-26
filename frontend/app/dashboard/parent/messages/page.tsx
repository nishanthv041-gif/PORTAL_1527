import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import Link from "next/link";
import styles from "../../dashboard.module.css";
import { MessageSquare, ShieldCheck, UserCheck, ArrowRight } from "lucide-react";

export default async function ParentMessagesPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const [parent, adminUsers] = await Promise.all([
    prisma.parent.findUnique({
      where: { userId: session.user.id },
      include: {
        children: {
          include: {
            student: {
              include: {
                class: {
                  include: {
                    teacher: {
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

  if (!parent) return null;

  // Extract unique teachers for their children
  const teacherMap = new Map();
  parent.children.forEach(s => {
    if (s.student.class?.teacher) {
      teacherMap.set(s.student.class.teacher.userId, {
        ...s.student.class.teacher.user,
        className: `${s.student.class.name}-${s.student.class.section}`,
        childName: `${s.student.firstName} ${s.student.lastName}`
      });
    }
  });

  const teachers = Array.from(teacherMap.values());

  return (
    <div className={styles.dashboard}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 className={styles.title} style={{ margin: "0 0 0.5rem" }}>Messages &amp; Communication</h1>
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>
          Reach out directly to your children&apos;s teachers or the School Administration office.
        </p>
      </div>

      {/* School Administration Option */}
      <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
        <h3 className={styles.chartHeader} style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#6366f1" }}>
          <ShieldCheck size={18} /> School Administration
        </h3>
        <p style={{ opacity: 0.7, marginBottom: "1rem", fontSize: "0.875rem" }}>
          Direct communication with the school admin office, principal, and administrative desk.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '1rem', width: '100%', minWidth: 0 }}>
          {adminUsers.map(admin => (
            <Link href={`/dashboard/parent/messages/${admin.id}`} key={admin.id} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '10px', backgroundColor: 'var(--background)', transition: 'all 0.2s' }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', backgroundColor: 'rgba(99, 102, 241, 0.12)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShieldCheck size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ margin: 0, color: 'var(--foreground)', fontSize: '0.95rem', fontWeight: 700 }}>{admin.name}</h4>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    School Admin Office
                  </p>
                </div>
                <ArrowRight size={16} color="var(--text-secondary)" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Class Teachers Option */}
      <div className={styles.chartCard}>
        <h3 className={styles.chartHeader} style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#8b5cf6" }}>
          <UserCheck size={18} /> Class Teachers &amp; Faculty
        </h3>
        <p style={{ opacity: 0.7, marginBottom: "1.25rem", fontSize: "0.875rem" }}>
          Message teachers regarding your children&apos;s academic progress and school activities.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '1rem', width: '100%', minWidth: 0 }}>
          {teachers.map((teacherUser) => (
            <Link href={`/dashboard/parent/messages/${teacherUser.id}`} key={teacherUser.id} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '10px', backgroundColor: 'var(--background)', transition: 'all 0.2s' }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', backgroundColor: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MessageSquare size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ margin: 0, color: 'var(--foreground)', fontSize: '0.95rem', fontWeight: 700 }}>{teacherUser.name}</h4>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: '#8b5cf6', fontWeight: 600 }}>
                    Class {teacherUser.className}
                  </p>
                  <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Student: {teacherUser.childName}
                  </p>
                </div>
                <ArrowRight size={16} color="var(--text-secondary)" />
              </div>
            </Link>
          ))}

          {teachers.length === 0 && (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              No class teachers assigned for your children yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
