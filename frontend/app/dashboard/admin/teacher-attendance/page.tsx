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

  // Precompute baseline statistics for each teacher (Present, Absent, Leave)
  const serializedTeachers: TeacherRecordItem[] = teachers.map((teacher) => {
    const todayRecord = dateAttendances.find((a) => a.teacherId === teacher.id);
    const rawStatus = todayRecord?.status;
    const todayStatus: "PRESENT" | "ABSENT" | "LEAVE" | "NOT_MARKED" = 
      rawStatus === "PRESENT" ? "PRESENT" :
      rawStatus === "ABSENT" ? "ABSENT" :
      rawStatus === "LEAVE" ? "LEAVE" :
      "NOT_MARKED";

    const totalSessions = teacher.attendances.length;
    const presentedDays = teacher.attendances.filter((a) => a.status === "PRESENT").length;
    const absentedDays = teacher.attendances.filter((a) => a.status === "ABSENT").length;
    const leaveDays = teacher.attendances.filter((a) => a.status === "LEAVE").length;

    const attendancePercentage =
      totalSessions > 0
        ? ((presentedDays / totalSessions) * 100).toFixed(1)
        : "100.0";

    return {
      id: teacher.id,
      user: {
        id: teacher.user.id,
        name: teacher.user.name,
        email: teacher.user.email,
        role: teacher.user.role,
      },
      totalSessions,
      presentedDays,
      absentedDays,
      leaveDays,
      attendancePercentage,
      todayStatus,
      todayRemarks: todayRecord?.remarks || "",
      attendances: teacher.attendances.map((a) => ({
        id: a.id,
        date: a.date,
        status: a.status,
        remarks: a.remarks,
      })),
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
