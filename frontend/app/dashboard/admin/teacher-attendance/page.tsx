import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import TeacherAttendanceClient, { TeacherRecordItem } from "./TeacherAttendanceClient";

export default async function AdminTeacherAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") return null;

  const resolvedSearchParams = await searchParams;
  const todayStr = resolvedSearchParams?.date || new Date().toISOString().split("T")[0];

  const [year, month, day] = todayStr.split("-").map(Number);
  const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  // Fetch all active teachers and today's attendance records
  const [teachers, dateAttendances] = await Promise.all([
    prisma.teacher.findMany({
      where: { isActive: true },
      include: {
        user: true,
        classes: true,
        subjects: true,
        classTeacherOf: true,
        attendances: {
          orderBy: { date: "desc" },
          take: 60,
        },
      },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.teacherAttendance.findMany({
      where: {
        date: { gte: startOfDay, lte: endOfDay },
      },
    }),
  ]);

  // Precompute statistics for each teacher
  const serializedTeachers: TeacherRecordItem[] = teachers.map((teacher) => {
    const todayRecord = dateAttendances.find((a) => a.teacherId === teacher.id);
    const todayStatus: "PRESENT" | "LEAVE" | "NOT_MARKED" = todayRecord
      ? todayRecord.status === "PRESENT"
        ? "PRESENT"
        : "LEAVE"
      : "NOT_MARKED";

    const totalSessions = teacher.attendances.length;
    const presentedDays = teacher.attendances.filter((a) => a.status === "PRESENT").length;
    const absentedDays = teacher.attendances.filter(
      (a) => a.status === "LEAVE" || a.status === "ABSENT"
    ).length;

    const attendancePercentage =
      totalSessions > 0
        ? ((presentedDays / totalSessions) * 100).toFixed(1)
        : "100.0";

    return {
      id: teacher.id,
      phone: teacher.phone,
      qualification: teacher.qualification,
      joinDate: teacher.joinDate,
      user: {
        id: teacher.user.id,
        name: teacher.user.name,
        email: teacher.user.email,
      },
      classes: teacher.classes.map((c) => ({
        id: c.id,
        name: c.name,
        section: c.section,
      })),
      subjects: teacher.subjects.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
      })),
      classTeacherOf: teacher.classTeacherOf
        ? {
            id: teacher.classTeacherOf.id,
            name: teacher.classTeacherOf.name,
            section: teacher.classTeacherOf.section,
          }
        : null,
      attendances: teacher.attendances.map((a) => ({
        id: a.id,
        date: a.date,
        status: a.status,
        remarks: a.remarks,
      })),
      totalSessions,
      presentedDays,
      absentedDays,
      attendancePercentage,
      todayStatus,
    };
  });

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <TeacherAttendanceClient
        teachers={serializedTeachers}
        initialDate={todayStr}
      />
    </div>
  );
}
