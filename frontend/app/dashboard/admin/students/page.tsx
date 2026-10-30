import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import StudentListClient from "./StudentListClient";
import SettingsNavSwitcher from "@/frontend/components/admin/SettingsNavSwitcher";

export default async function AdminStudentsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user?.role !== 'ADMIN') redirect("/login");

  const students = await prisma.student.findMany({
    orderBy: { firstName: 'asc' },
    include: {
      class: true,
      parents: {
        include: {
          parent: {
            include: {
              user: true
            }
          }
        }
      },
      attendances: {
        select: { status: true }
      }
    }
  });

  const classes = await prisma.class.findMany({
    where: { isActive: true },
    orderBy: [{ name: 'asc' }, { section: 'asc' }],
    include: {
      classTeacher: {
        include: {
          user: {
            select: { name: true }
          }
        }
      }
    }
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1.25rem' }}>Parent &amp; Student Management</h1>

      {/* Switcher Option between Settings, Teacher Management, and Parent & Student */}
      <SettingsNavSwitcher />

      <StudentListClient students={students as any} classes={classes as any} />
    </div>
  );
}
