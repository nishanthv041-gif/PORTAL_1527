import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import AchievementsClient from "./AchievementsClient";

export default async function AdminAchievementsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  const achievements = await prisma.achievement.findMany({
    include: {
      student: { include: { class: true } }
    },
    orderBy: { date: 'desc' }
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1.5rem' }}>Student Achievements</h1>

      <AchievementsClient achievements={achievements} />
    </div>
  );
}
