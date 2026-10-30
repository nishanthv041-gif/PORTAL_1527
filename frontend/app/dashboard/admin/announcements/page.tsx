import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import AnnouncementsClient from "./AnnouncementsClient";

export default async function AdminAnnouncementsPage() {
  const session = await getServerSession(getAuthOptions());
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
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1.5rem' }}>Announcements</h1>

      <AnnouncementsClient announcements={announcements} classes={classes} />
    </div>
  );
}
