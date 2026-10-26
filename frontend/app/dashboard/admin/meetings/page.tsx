import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import MeetingsClient from "./MeetingsClient";

export default async function AdminMeetingsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  const [meetings, teachers, parents, classes] = await Promise.all([
    prisma.meeting.findMany({
      include: {
        teachers: { include: { user: true } },
        parents: { include: { user: true } }
      },
      orderBy: { date: 'desc' }
    }),
    prisma.teacher.findMany({
      where: { isActive: true },
      include: { user: true },
      orderBy: { user: { name: 'asc' } }
    }),
    prisma.parent.findMany({
      where: { isActive: true },
      include: {
        user: true,
        children: {
          include: {
            student: {
              include: {
                class: true
              }
            }
          }
        }
      },
      orderBy: { user: { name: 'asc' } }
    }),
    prisma.class.findMany({
      where: { isActive: true },
      include: {
        teacher: { include: { user: true } },
        _count: { select: { students: true } }
      },
      orderBy: [{ name: 'asc' }, { section: 'asc' }]
    })
  ]);

  return (
    <div className={styles.dashboard}>
      <MeetingsClient
        meetings={meetings}
        teachers={teachers}
        parents={parents}
        classes={classes}
      />
    </div>
  );
}

