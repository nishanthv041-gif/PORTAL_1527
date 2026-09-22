import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import TeacherAnnouncementsClient from "./TeacherAnnouncementsClient";

export default async function TeacherAnnouncementsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'TEACHER') return null;

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: { classes: true }
  });

  if (!teacher) return null;

  const announcements = await prisma.announcement.findMany({
    where: {
      OR: [
        { targetType: 'TEACHERS' },
        { targetType: 'ALL' },
        { authorId: session.user.id }
      ]
    },
    orderBy: [
      { priority: 'asc' }, // Assuming HIGH is sorted appropriately, or maybe sort by createdAt?
      { createdAt: 'desc' }
    ]
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>Announcements</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Stay updated with the latest news and post announcements for your classes.</p>

      <TeacherAnnouncementsClient announcements={announcements} classes={teacher.classes} currentUserId={session.user.id} />
    </div>
  );
}
