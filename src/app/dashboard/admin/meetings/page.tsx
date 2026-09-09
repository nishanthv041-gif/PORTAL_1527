import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import styles from "../../dashboard.module.css";
import MeetingsClient from "./MeetingsClient";

export default async function AdminMeetingsPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') return null;

  const meetings = await prisma.meeting.findMany({
    include: {
      teachers: { include: { user: true } },
      parents: { include: { user: true } }
    },
    orderBy: { date: 'desc' }
  });

  const teachers = await prisma.teacher.findMany({
    where: { isActive: true },
    include: { user: true }
  });

  const parents = await prisma.parent.findMany({
    where: { isActive: true },
    include: { user: true }
  });

  const classes = await prisma.class.findMany({
    where: { isActive: true },
    orderBy: [{ name: 'asc' }, { section: 'asc' }]
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>Parent-Teacher Meetings</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Schedule and manage meetings between teachers and parents.</p>

      <MeetingsClient meetings={meetings} teachers={teachers} parents={parents} classes={classes} />
    </div>
  );
}
