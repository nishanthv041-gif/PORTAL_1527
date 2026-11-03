import { getCachedServerSession } from "@/backend/auth/sessionCache";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import ClassListClient from "./ClassListClient";

export default async function AdminClassesPage() {
  const session = await getCachedServerSession();
  if (!session || session.user.role !== 'ADMIN') return null;

  const [classes, teachers] = await Promise.all([
    prisma.class.findMany({
      where: { isActive: true },
      include: {
        teacher: {
          include: { user: true }
        },
        students: {
          where: { isActive: true },
          include: {
            attendances: {
              select: {
                id: true,
                studentId: true,
                status: true,
                date: true,
                remarks: true,
                classId: true
              }
            }
          }
        }
      }
    }),
    prisma.teacher.findMany({
      where: { isActive: true },
      include: { user: true }
    })
  ]);

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Classes</h1>
      
      <ClassListClient classes={classes as any} teachers={teachers} />
    </div>
  );
}
