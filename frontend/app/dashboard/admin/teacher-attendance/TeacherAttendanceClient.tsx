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
  lateDays: number;
  leaveDays?: number;
  attendancePercentage: string;
  forenoonStatus?: "PRESENT" | "ABSENT" | "LATE" | "NOT_MARKED";
  forenoonRemarks?: string;
  afternoonStatus?: "PRESENT" | "ABSENT" | "LATE" | "NOT_MARKED";
  afternoonRemarks?: string;
  todayStatus?: "PRESENT" | "ABSENT" | "LATE" | "NOT_MARKED";
  todayRemarks?: string;
  attendances: {
    id: string;
    date: Date | string;
    session?: string;
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
      return {
        id: t.id,
        name: t.user.name,
        codeOrRoll: `EMP-${t.id.slice(-4).toUpperCase()}`,
        category: "TEACHERS",
        forenoonStatus: t.forenoonStatus || "NOT_MARKED",
        forenoonRemarks: t.forenoonRemarks || "",
        afternoonStatus: t.afternoonStatus || "NOT_MARKED",
        afternoonRemarks: t.afternoonRemarks || "",
        currentStatus: t.todayStatus || "NOT_MARKED",
        currentRemarks: t.todayRemarks || "",
        attendancePercentage: t.attendancePercentage,
        totalSessions: t.totalSessions,
        presentCount: t.presentedDays,
        absentCount: t.absentedDays,
        lateCount: t.lateDays,
        leaveCount: t.leaveDays || 0,
        recentHistory: t.attendances.slice(0, 30).map((a) => {
          const isAN = a.remarks?.toUpperCase().includes("AFTERNOON") || new Date(a.date).getUTCHours() >= 12;
          return {
            id: a.id,
            date: a.date,
            session: isAN ? "Afternoon" : "Forenoon",
            status: a.status === "LEAVE" ? "LATE" : a.status,
            remarks: a.remarks,
          };
        }),
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
      session,
      remarks: r.remarks,
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
