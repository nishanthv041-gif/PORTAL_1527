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
    select: {
      id: true,
      rollNumber: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      gender: true,
      bloodGroup: true,
      address: true,
      photo: true,
      isActive: true,
      batch: true,
      residenceType: true,
      classId: true,
      class: {
        select: {
          id: true,
          name: true,
          section: true,
        },
      },
      parents: {
        select: {
          parent: {
            select: {
              id: true,
              userId: true,
              phone: true,
              alternatePhone: true,
              occupation: true,
              isActive: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  googleEmail: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
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
