"use client";

import { useState, useMemo } from "react";
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
  lateDays: number;
  halfDayDays: number;
  attendancePercentage: string;
  todayStatus: "PRESENT" | "ABSENT" | "LATE" | "LEAVE" | "HALF_DAY" | "NOT_MARKED";
  todayRemarks?: string;
  category: "TEACHERS" | "ADMINS";
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
  const [activeCategory, setActiveCategory] = useState<string>("TEACHERS");

  const people: AttendancePersonItem[] = useMemo(() => {
    return teachers.map((t) => ({
      id: t.id,
      name: t.user.name,
      codeOrRoll: `EMP-${t.id.slice(-4).toUpperCase()}`,
      category: t.category,
      currentStatus: t.todayStatus,
      currentRemarks: t.todayRemarks || "",
      attendancePercentage: t.attendancePercentage,
      totalSessions: t.totalSessions,
      presentCount: t.presentedDays,
      absentCount: t.absentedDays,
      leaveCount: t.leaveDays,
      lateCount: t.lateDays,
      halfDayCount: t.halfDayDays,
      recentHistory: t.attendances.slice(0, 15).map((a) => ({
        id: a.id,
        date: a.date,
        status: a.status,
        remarks: a.remarks,
      })),
    }));
  }, [teachers]);

  const teacherCount = people.filter((p) => p.category === "TEACHERS").length;
  const adminCount = people.filter((p) => p.category === "ADMINS").length;

  const categories = [
    { id: "TEACHERS", label: "Teachers", count: teacherCount },
    { id: "ADMINS", label: "Administrators", count: adminCount },
  ];

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
      title="Mark Attendance — Teachers"
      subtitle="Record session & daily attendance status for faculty members"
      backUrl="/dashboard/admin/teachers"
      backLabel="← Back to Faculty Roster"
      categories={categories}
      activeCategoryId={activeCategory}
      onCategoryChange={setActiveCategory}
      initialDate={initialDate}
      onDateChange={handleDateChange}
      people={people}
      onSave={handleSave}
    />
  );
}
