"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import AttendanceSessionManager, {
  AttendancePersonItem,
} from "@/frontend/components/attendance/AttendanceSessionManager";
import { adminBulkTeacherAttendance } from "@/backend/api/actions/dashboard/admin/teacherAttendance/actions";

export type TeacherRecordItem = {
  id: string;
  user: {
    id: string;
    name: string;
    email: string;
    role?: string;
  };
  totalSessions: number;
  presentedDays: number;
  absentedDays: number;
  leaveDays: number;
  attendancePercentage: string;
  todayStatus: "PRESENT" | "ABSENT" | "LEAVE" | "NOT_MARKED";
  todayRemarks?: string;
  attendances: {
    id: string;
    date: Date | string;
    status: string;
    remarks?: string | null;
  }[];
};

export default function TeacherAttendanceClient({
  teachers,
  initialDate,
}: {
  teachers: TeacherRecordItem[];
  initialDate: string;
}) {
  const router = useRouter();

  const people: AttendancePersonItem[] = useMemo(() => {
    return teachers.map((t) => {
      // Normalize any legacy status
      const normalizedStatus: AttendancePersonItem["currentStatus"] = 
        t.todayStatus === "PRESENT" ? "PRESENT" :
        t.todayStatus === "ABSENT" ? "ABSENT" :
        t.todayStatus === "LEAVE" ? "LEAVE" :
        "NOT_MARKED";

      return {
        id: t.id,
        name: t.user.name,
        codeOrRoll: `EMP-${t.id.slice(-4).toUpperCase()}`,
        category: "TEACHERS",
        currentStatus: normalizedStatus,
        currentRemarks: t.todayRemarks || "",
        attendancePercentage: t.attendancePercentage,
        totalSessions: t.totalSessions,
        presentCount: t.presentedDays,
        absentCount: t.absentedDays,
        leaveCount: t.leaveDays,
        recentHistory: t.attendances.slice(0, 15).map((a) => ({
          id: a.id,
          date: a.date,
          status: a.status,
          remarks: a.remarks,
        })),
      };
    });
  }, [teachers]);

  const handleDateChange = (date: string) => {
    router.push(`/dashboard/admin/teacher-attendance?date=${date}`);
  };

  const handleSave = async (
    records: { id: string; status: string; remarks?: string }[],
    date: string,
    session: "FORENOON" | "AFTERNOON"
  ) => {
    const payload = records.map((r) => ({
      teacherId: r.id,
      date,
      status: r.status,
      remarks: r.remarks ? `${r.remarks} (${session})` : session,
    }));

    const res = await adminBulkTeacherAttendance(payload);
    if (res?.error) {
      return { success: false, error: res.error };
    }
    return { success: true };
  };

  return (
    <AttendanceSessionManager
      title="Teacher Attendance"
      subtitle="Record session & daily attendance status"
      initialDate={initialDate}
      onDateChange={handleDateChange}
      people={people}
      onSave={handleSave}
    />
  );
}
