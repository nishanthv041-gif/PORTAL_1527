import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import AttendanceClient, { AdminStudentItem } from "./AttendanceClient";

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; date?: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") return null;

  const resolvedSearchParams = await searchParams;

  const todayStr = resolvedSearchParams?.date || new Date().toISOString().split("T")[0];
  const [year, month, day] = todayStr.split("-").map(Number);
  const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  // Fetch all active classes
  const classes = await prisma.class.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }, { section: "asc" }],
    select: { id: true, name: true, section: true },
  });

  const selectedClassId = resolvedSearchParams?.classId || (classes.length > 0 ? classes[0].id : "");

  let serializedStudents: AdminStudentItem[] = [];

  if (selectedClassId) {
    const rawStudents = await prisma.student.findMany({
      where: { classId: selectedClassId, isActive: true },
      include: {
        class: { select: { id: true, name: true, section: true } },
        attendances: {
          orderBy: { date: "desc" },
          take: 60,
        },
      },
      orderBy: { rollNumber: "asc" },
    });

    serializedStudents = rawStudents.map((s) => {
      const todayRecord = s.attendances.find((a) => {
        const attDate = new Date(a.date).toISOString().split("T")[0];
        return attDate === todayStr;
      });

      const totalSessions = s.attendances.length;
      const presentCount = s.attendances.filter((a) => a.status === "PRESENT").length;
      const absentCount = s.attendances.filter((a) => a.status === "ABSENT").length;
      const leaveCount = s.attendances.filter((a) => a.status === "LEAVE").length;
      const lateCount = s.attendances.filter((a) => a.status === "LATE").length;
      const halfDayCount = s.attendances.filter((a) => a.status === "HALF_DAY").length;

      const totalCredits = (presentCount * 1.0) + (lateCount * 1.0) + (halfDayCount * 0.5);
      const attendancePercentage =
        totalSessions > 0
          ? ((totalCredits / totalSessions) * 100).toFixed(1)
          : "100.0";

      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        rollNumber: s.rollNumber,
        admissionNo: s.admissionNo,
        classId: s.classId || selectedClassId,
        className: s.class ? `${s.class.name} - ${s.class.section}` : "",
        currentStatus: todayRecord
          ? (todayRecord.status as any) || "NOT_MARKED"
          : "NOT_MARKED",
        currentRemarks: todayRecord?.remarks || "",
        attendancePercentage,
        totalSessions,
        presentCount,
        absentCount,
        leaveCount,
        lateCount,
        halfDayCount,
        recentHistory: s.attendances.slice(0, 15).map((a) => ({
          id: a.id,
          date: a.date,
          status: a.status,
          remarks: a.remarks,
        })),
      };
    });
  }

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <AttendanceClient
        classes={classes}
        students={serializedStudents}
        selectedClassId={selectedClassId}
        initialDate={todayStr}
      />
    </div>
  );
}
