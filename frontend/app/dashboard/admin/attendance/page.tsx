import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { Student, Attendance } from "@prisma/client";
import styles from "../../dashboard.module.css";
import AttendanceClient from "./AttendanceClient";
import { getSchoolCalendarStats } from "@/backend/api/actions/dashboard/attendance/calendarStats";

import Link from "next/link";
import { GraduationCap, UserCheck } from "lucide-react";

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; date?: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") return null;

  const resolvedSearchParams = await searchParams;

  const today = resolvedSearchParams.date ? new Date(resolvedSearchParams.date) : new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Fetch all active classes for the selector
  const classes = await prisma.class.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }, { section: "asc" }],
  });

  // Calculate calendar stats from Admin Calendar
  const calendarStats = await getSchoolCalendarStats(today);

  let students: Student[] = [];
  let classAttendances: Attendance[] = [];
  let leaveCount = 0;

  const selectedClassId = resolvedSearchParams.classId || (classes.length > 0 ? classes[0].id : "");

  if (selectedClassId) {
    students = await prisma.student.findMany({
      where: { classId: selectedClassId, isActive: true },
      orderBy: { rollNumber: "asc" },
    });

    const studentIds = students.map((s) => s.id);

    classAttendances = await prisma.attendance.findMany({
      where: {
        studentId: { in: studentIds },
        date: { gte: today, lt: tomorrow },
      },
    });

    // Check approved leaves for this class on this date
    const approvedLeaves = await prisma.leaveRequest.findMany({
      where: {
        studentId: { in: studentIds },
        status: "APPROVED",
        startDate: { lte: tomorrow },
        endDate: { gte: today },
      },
    });

    leaveCount = approvedLeaves.length;
  }

  return (
    <div className={styles.dashboard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0, marginBottom: "0.25rem" }}>
            Attendance Management
          </h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Full administrative attendance overview and editing access across the entire academic year.
          </p>
        </div>

        {/* Hub Switcher: Student Attendance vs Teacher Attendance */}
        <div style={{ display: "inline-flex", background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border-color)", padding: "4px", borderRadius: "12px", gap: "4px" }}>
          <Link 
            href="/dashboard/admin/attendance" 
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.55rem 1.15rem", fontSize: "0.85rem", fontWeight: 600, borderRadius: "9px", textDecoration: "none", background: "var(--primary)", color: "#fff" }}
          >
            <GraduationCap size={16} />
            <span>Student Attendance</span>
          </Link>
          <Link 
            href="/dashboard/admin/teacher-attendance" 
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.55rem 1.15rem", fontSize: "0.85rem", fontWeight: 600, borderRadius: "9px", textDecoration: "none", color: "var(--text-secondary)" }}
          >
            <UserCheck size={16} />
            <span>Teacher Attendance</span>
          </Link>
        </div>
      </div>

      <AttendanceClient
        classes={classes}
        students={students}
        attendances={classAttendances}
        initialClassId={selectedClassId}
        initialDate={today.toISOString().split("T")[0]}
        calendarStats={calendarStats}
        initialLeaveCount={leaveCount}
      />
    </div>
  );
}
