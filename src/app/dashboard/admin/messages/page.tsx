import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import styles from "../../dashboard.module.css";
import Link from "next/link";
import { MessageSquare } from "lucide-react";

export default async function AdminMessagesPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') return null;

  const teachers = await prisma.user.findMany({
    where: { role: 'TEACHER', status: 'ACTIVE' },
    orderBy: { name: 'asc' }
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>Admin Messages</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Direct messaging with Teachers and read-only oversight of system messages.</p>

      <div style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Contact Teachers</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
          {teachers.map(teacher => (
            <Link href={`/dashboard/admin/messages/${teacher.id}`} key={teacher.id} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', transition: 'border-color 0.2s' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h4 style={{ margin: 0, color: 'var(--foreground)' }}>{teacher.name}</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Teacher</p>
                </div>
              </div>
            </Link>
          ))}
          {teachers.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No active teachers found.</p>}
        </div>
      </div>

    </div>
  );
}
