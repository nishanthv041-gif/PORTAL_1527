import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import styles from "../../dashboard.module.css";
import ClassListClient from "./ClassListClient";

export default async function AdminClassesPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') return null;

  const classes = await prisma.class.findMany({
    where: { isActive: true },
    include: {
      teacher: {
        include: { user: true }
      },
      students: {
        where: { isActive: true },
        include: { attendances: true }
      }
    }
  });

  const teachers = await prisma.teacher.findMany({
    where: { isActive: true },
    include: { user: true }
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Classes</h1>
      
      <ClassListClient classes={classes} teachers={teachers} />
    </div>
  );
}
