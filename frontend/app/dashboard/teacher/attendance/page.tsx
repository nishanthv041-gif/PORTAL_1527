import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import AttendanceForm from "./AttendanceForm";

export default async function TeacherAttendancePage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      classTeacherOf: {
        include: {
          students: {
            orderBy: { firstName: 'asc' }
          }
        }
      }
    }
  });

  if (!teacher || !teacher.classTeacherOf) {
    return (
      <div className={styles.dashboard}>
        <h1 className={styles.title}>Attendance</h1>
        <p>You are not assigned as a Class Teacher to any class.</p>
      </div>
    );
  }

  const myClass = teacher.classTeacherOf;

  // Calculate today's summary across all their classes
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const todaysAttendance = await prisma.attendance.findMany({
    where: {
      date: {
        gte: startOfDay,
        lte: endOfDay
      },
      student: {
        classId: myClass.id
      }
    }
  });

  const presentCount = todaysAttendance.filter(a => a.status === "PRESENT").length;
  const absentCount = todaysAttendance.filter(a => a.status === "ABSENT").length;
  const lateCount = todaysAttendance.filter(a => a.status === "LATE").length;

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Attendance</h1>
      
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Present Today</span>
            <span className={styles.statValue} style={{ color: "var(--success)" }}>{presentCount}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Absent Today</span>
            <span className={styles.statValue} style={{ color: "var(--danger)" }}>{absentCount}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Late Today</span>
            <span className={styles.statValue} style={{ color: "var(--warning)" }}>{lateCount}</span>
          </div>
        </div>
      </div>

      <div className={styles.chartCard}>
        <h3 className={styles.chartHeader}>Mark Attendance</h3>
        <AttendanceForm myClass={myClass} />
      </div>
    </div>
  );
}
