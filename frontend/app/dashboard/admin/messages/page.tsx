import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import AdminMessagesClient, { TeacherContact, ParentContact } from "./AdminMessagesClient";

export default async function AdminMessagesPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  const [rawTeachers, rawParents, classes, unreadList] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'TEACHER', status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        teacher: {
          select: {
            classes: { select: { id: true, name: true, section: true } },
            subjects: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { name: 'asc' }
    }),
    prisma.user.findMany({
      where: { role: 'PARENT', status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        parent: {
          select: {
            children: {
              select: {
                student: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    class: { select: { id: true, name: true, section: true } }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    }),
    prisma.class.findMany({
      where: { isActive: true },
      select: { id: true, name: true, section: true },
      orderBy: [{ name: 'asc' }, { section: 'asc' }]
    }),
    prisma.message.findMany({
      where: {
        receiverId: session.user.id,
        isRead: false
      },
      select: { senderId: true }
    })
  ]);

  // Aggregate unread counts by sender ID
  const unreadMap = new Map<string, number>();
  unreadList.forEach(m => {
    unreadMap.set(m.senderId, (unreadMap.get(m.senderId) || 0) + 1);
  });

  const teachers: TeacherContact[] = rawTeachers.map(t => ({
    ...t,
    unreadCount: unreadMap.get(t.id) || 0
  }));

  const parents: ParentContact[] = rawParents.map(p => ({
    ...p,
    unreadCount: unreadMap.get(p.id) || 0
  }));

  const totalUnreadCount = unreadList.length;

  return (
    <div className={styles.dashboard}>
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 className={styles.title} style={{ margin: "0 0 0.5rem" }}>Messages &amp; Communication Center</h1>
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>
          Direct administrative communication channels with faculty teachers and student parents across the institution.
        </p>
      </div>

      <AdminMessagesClient
        teachers={teachers}
        parents={parents}
        classes={classes}
        totalUnreadCount={totalUnreadCount}
      />
    </div>
  );
}
