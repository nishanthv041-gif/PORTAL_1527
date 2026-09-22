import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { Student, Attendance } from "@prisma/client";
import styles from "../../dashboard.module.css";
import AttendanceClient from "./AttendanceClient";

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; date?: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  const resolvedSearchParams = await searchParams;

  const today = resolvedSearchParams.date ? new Date(resolvedSearchParams.date) : new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Fetch all classes for the selector
  const classes = await prisma.class.findMany({
    where: { isActive: true },
    orderBy: [{ name: 'asc' }, { section: 'asc' }]
  });

  // Fetch school-wide summary for the selected date
  const allAttendances = await prisma.attendance.findMany({
    where: {
      date: { gte: today, lt: tomorrow }
    }
  });

  const summary = { present: 0, absent: 0, late: 0, leave: 0, half_day: 0 };
  allAttendances.forEach(a => {
    const s = a.status.toLowerCase();
    if (summary[s as keyof typeof summary] !== undefined) {
      summary[s as keyof typeof summary]++;
    }
  });

  let students: Student[] = [];
  let classAttendances: Attendance[] = [];

  if (resolvedSearchParams.classId && resolvedSearchParams.date) {
    students = await prisma.student.findMany({
      where: { classId: resolvedSearchParams.classId, isActive: true },
      orderBy: { rollNumber: 'asc' }
    });

    classAttendances = await prisma.attendance.findMany({
      where: {
        student: { classId: resolvedSearchParams.classId },
        date: { gte: today, lt: tomorrow }
      }
    });
  }

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>Attendance Overview</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Present</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 600, color: "var(--success)" }}>{summary.present}</p>
        </div>
        <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Absent</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 600, color: "var(--danger)" }}>{summary.absent}</p>
        </div>
        <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Late</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 600, color: "var(--warning)" }}>{summary.late}</p>
        </div>
        <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Leave</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 600, color: '#6366f1' }}>{summary.leave}</p>
        </div>
      </div>

      <AttendanceClient 
        classes={classes} 
        students={students} 
        attendances={classAttendances} 
        initialClassId={resolvedSearchParams.classId || ""}
        initialDate={today.toISOString().split('T')[0]}
      />
    </div>
  );
}
