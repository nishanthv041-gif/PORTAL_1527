"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import AttendanceSessionManager, {
  AttendancePersonItem,
} from "@/frontend/components/attendance/AttendanceSessionManager";
import { saveBulkAttendance } from "@/backend/api/actions/dashboard/teacher/attendance/actions";

export type TeacherStudentItem = {
  id: string;
  name: string;
  rollNumber: string;
  currentStatus: "PRESENT" | "ABSENT" | "LATE" | "LEAVE" | "HALF_DAY" | "NOT_MARKED";
  currentRemarks?: string;
  attendancePercentage: string;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  leaveCount: number;
  lateCount: number;
  halfDayCount: number;
  recentHistory?: {
    id: string;
    date: Date | string;
    status: string;
    remarks?: string | null;
  }[];
};

export default function AttendanceForm({
  myClass,
  students,
  initialDate,
}: {
  myClass: { id: string; name: string; section: string };
  students: TeacherStudentItem[];
  initialDate: string;
}) {
  const router = useRouter();

  const people: AttendancePersonItem[] = useMemo(() => {
    return students.map((s) => ({
      id: s.id,
      name: s.name,
      codeOrRoll: s.rollNumber ? `Roll: ${s.rollNumber}` : "Student",
      category: myClass.id,
      currentStatus: s.currentStatus,
      currentRemarks: s.currentRemarks || "",
      attendancePercentage: s.attendancePercentage,
      totalSessions: s.totalSessions,
      presentCount: s.presentCount,
      absentCount: s.absentCount,
      leaveCount: s.leaveCount,
      lateCount: s.lateCount,
      halfDayCount: s.halfDayCount,
      recentHistory: s.recentHistory,
    }));
  }, [students, myClass.id]);

  const handleDateChange = (newDate: string) => {
    router.push(`/dashboard/teacher/attendance?date=${newDate}`);
  };

  const handleSave = async (
    records: { id: string; status: string; remarks?: string }[],
    date: string,
    session: "FORENOON" | "AFTERNOON"
  ) => {
    const payload = records.map((r) => ({
      studentId: r.id,
      classId: myClass.id,
      date,
      status: r.status,
      remarks: r.remarks ? `${r.remarks} (${session})` : session,
    }));

    const res = await saveBulkAttendance(payload);
    if (!res.success) {
      return { success: false, error: res.error || "Failed to save attendance." };
    }
    return { success: true };
  };

  return (
    <AttendanceSessionManager
      title="Student Attendance"
      subtitle={`${myClass.name} - ${myClass.section}`}
      initialDate={initialDate}
      onDateChange={handleDateChange}
      people={people}
      onSave={handleSave}
    />
  );
}
