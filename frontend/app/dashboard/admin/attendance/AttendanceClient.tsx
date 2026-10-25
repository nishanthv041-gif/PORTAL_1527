"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import AttendanceSessionManager, {
  AttendancePersonItem,
} from "@/frontend/components/attendance/AttendanceSessionManager";
import { adminBulkAttendance } from "@/backend/api/actions/dashboard/admin/attendance/actions";

export type AdminStudentItem = {
  id: string;
  name: string;
  rollNumber: string;
  admissionNo?: string;
  classId: string;
  className: string;
  currentStatus: "PRESENT" | "ABSENT" | "LEAVE" | "NOT_MARKED";
  currentRemarks?: string;
  attendancePercentage: string;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  leaveCount: number;
  recentHistory?: {
    id: string;
    date: Date | string;
    status: string;
    remarks?: string | null;
  }[];
};

export default function AttendanceClient({
  classes,
  students,
  selectedClassId,
  initialDate,
}: {
  classes: { id: string; name: string; section: string }[];
  students: AdminStudentItem[];
  selectedClassId: string;
  initialDate: string;
}) {
  const router = useRouter();

  const categories = useMemo(() => {
    return classes.map((c) => ({
      id: c.id,
      label: `${c.name} - ${c.section}`,
    }));
  }, [classes]);

  const people: AttendancePersonItem[] = useMemo(() => {
    return students.map((s) => {
      const normalizedStatus: AttendancePersonItem["currentStatus"] = 
        s.currentStatus === "PRESENT" ? "PRESENT" :
        s.currentStatus === "ABSENT" ? "ABSENT" :
        s.currentStatus === "LEAVE" ? "LEAVE" :
        "NOT_MARKED";

      return {
        id: s.id,
        name: s.name,
        codeOrRoll: s.rollNumber ? `Roll: ${s.rollNumber}` : s.admissionNo ? `Adm: ${s.admissionNo}` : "Student",
        category: s.classId,
        currentStatus: normalizedStatus,
        currentRemarks: s.currentRemarks || "",
        attendancePercentage: s.attendancePercentage,
        totalSessions: s.totalSessions,
        presentCount: s.presentCount,
        absentCount: s.absentCount,
        leaveCount: s.leaveCount,
        recentHistory: s.recentHistory,
      };
    });
  }, [students]);

  const handleCategoryChange = (newClassId: string) => {
    router.push(`/dashboard/admin/attendance?classId=${newClassId}&date=${initialDate}`);
  };

  const handleDateChange = (newDate: string) => {
    router.push(`/dashboard/admin/attendance?classId=${selectedClassId}&date=${newDate}`);
  };

  const handleSave = async (
    records: { id: string; status: string; remarks?: string }[],
    date: string,
    session: "FORENOON" | "AFTERNOON"
  ) => {
    const payload = records.map((r) => ({
      studentId: r.id,
      classId: selectedClassId,
      date,
      status: r.status,
      remarks: r.remarks ? `${r.remarks} (${session})` : session,
    }));

    const res = await adminBulkAttendance(payload);
    if (res?.error) {
      return { success: false, error: res.error };
    }
    return { success: true };
  };

  return (
    <AttendanceSessionManager
      title="Student Attendance"
      subtitle="Record session & daily attendance status"
      categories={categories}
      activeCategoryId={selectedClassId}
      onCategoryChange={handleCategoryChange}
      initialDate={initialDate}
      onDateChange={handleDateChange}
      people={people}
      onSave={handleSave}
    />
  );
}
