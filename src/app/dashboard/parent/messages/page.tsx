import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import Link from "next/link";
import styles from "../../dashboard.module.css";
import { MessageSquare } from "lucide-react";

export default async function ParentMessagesPage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const parent = await prisma.parent.findUnique({
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
  });

  if (!parent) return null;

  // Extract unique teachers for their children
  const teacherMap = new Map();
  parent.children.forEach(s => {
    if (s.student.class?.teacher) {
      teacherMap.set(s.student.class.teacher.userId, s.student.class.teacher.user);
    }
  });

  const teachers = Array.from(teacherMap.values());

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Messages</h1>
      
      <div className={styles.chartCard}>
        <h3 className={styles.chartHeader}>Start a Conversation</h3>
        <p style={{ opacity: 0.7, marginBottom: "1.5rem" }}>Select a teacher to message them.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {teachers.map((teacherUser) => (
            <Link href={`/dashboard/parent/messages/${teacherUser.id}`} key={teacherUser.id} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--background)', transition: 'border-color 0.2s' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h4 style={{ margin: 0, color: 'var(--foreground)' }}>{teacherUser.name}</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7, color: 'var(--foreground)' }}>
                    Class Teacher
                  </p>
                </div>
              </div>
            </Link>
          ))}

          {teachers.length === 0 && (
            <p>No teachers found for your children&apos;s classes.</p>
          )}
        </div>
      </div>
    </div>
  );
}
