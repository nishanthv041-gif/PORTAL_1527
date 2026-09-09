import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import styles from "../../dashboard.module.css";
import AnnouncementsClient from "./AnnouncementsClient";

export default async function AdminAnnouncementsPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') return null;

  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: 'desc' }
  });

  const classes = await prisma.class.findMany({
    where: { isActive: true },
    orderBy: [{ name: 'asc' }, { section: 'asc' }]
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>Announcements</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Broadcast messages to the entire school, specific classes, parents, or teachers.</p>

      <AnnouncementsClient announcements={announcements} classes={classes} />
    </div>
  );
}
