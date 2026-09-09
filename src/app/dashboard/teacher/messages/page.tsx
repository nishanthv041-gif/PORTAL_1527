import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import styles from "../../dashboard.module.css";
import { MessageSquare } from "lucide-react";

export default async function TeacherMessagesPage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  // Find all parents of students in the teacher's classes
  const teacher = await prisma.teacher.findUnique({
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
  });

  if (!teacher) return null;

  // Extract unique parents
  const parentMap = new Map();
  teacher.classes.forEach(c => {
    c.students.forEach(s => {
      s.parents.forEach(p => {
        if (!parentMap.has(p.parent.userId)) {
          parentMap.set(p.parent.userId, p.parent.user);
        }
      });
    });
  });

  const parents = Array.from(parentMap.values());

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Messages</h1>
      
      <div className={styles.chartCard}>
        <h3 className={styles.chartHeader}>Start a Conversation</h3>
        <p style={{ opacity: 0.7, marginBottom: "1.5rem" }}>Select a parent to message them.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {parents.map((parentUser) => (
            <Link href={`/dashboard/teacher/messages/${parentUser.id}`} key={parentUser.id} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--background)', transition: 'border-color 0.2s' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h4 style={{ margin: 0, color: 'var(--foreground)' }}>{parentUser.name}</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7, color: 'var(--foreground)' }}>
                    Parent
                  </p>
                </div>
              </div>
            </Link>
          ))}

          {parents.length === 0 && (
            <p>No parents found for your classes.</p>
          )}
        </div>
      </div>
    </div>
  );
}
