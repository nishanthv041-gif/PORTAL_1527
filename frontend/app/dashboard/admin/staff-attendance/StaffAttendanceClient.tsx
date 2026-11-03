"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AttendanceSessionManager, {
  AttendancePersonItem,
} from "@/frontend/components/attendance/AttendanceSessionManager";
import { adminBulkStaffAttendance } from "@/backend/api/actions/dashboard/admin/staffAttendance/actions";

export type StaffRecordItem = {
  id: string;
  user: {
    id: string;
    name: string;
    email: string;
    role?: string;
  };
  phone?: string | null;
  designation?: string | null;
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

export default function StaffAttendanceClient({
  staffMembers,
  initialDate,
}: {
  staffMembers: StaffRecordItem[];
  initialDate: string;
}) {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<string>("ALL");

  // Generate dynamic designation categories
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    staffMembers.forEach((s) => {
      const des = (s.designation || "General Staff").trim();
      map.set(des, (map.get(des) || 0) + 1);
    });

    const list: { id: string; label: string; count?: number }[] = [
      { id: "ALL", label: "All Staff", count: staffMembers.length },
    ];

    map.forEach((count, des) => {
      list.push({ id: des, label: des, count });
    });

    return list;
  }, [staffMembers]);

  const people: AttendancePersonItem[] = useMemo(() => {
    return staffMembers.map((s) => {
      const codeOrRoll = s.phone
        ? `${s.designation || "Staff"} • ${s.phone}`
        : `STAFF-${s.id.slice(-4).toUpperCase()}`;

      return {
        id: s.id,
        name: s.user.name,
        codeOrRoll,
        category: (s.designation || "General Staff").trim(),
        forenoonStatus: s.forenoonStatus || "NOT_MARKED",
        forenoonRemarks: s.forenoonRemarks || "",
        afternoonStatus: s.afternoonStatus || "NOT_MARKED",
        afternoonRemarks: s.afternoonRemarks || "",
        currentStatus: s.todayStatus || "NOT_MARKED",
        currentRemarks: s.todayRemarks || "",
        attendancePercentage: s.attendancePercentage,
        totalSessions: s.totalSessions,
        presentCount: s.presentedDays,
        absentCount: s.absentedDays,
        lateCount: s.lateDays,
        leaveCount: s.leaveDays || 0,
        recentHistory: s.attendances.slice(0, 30).map((a) => {
          const isAN =
            a.remarks?.toUpperCase().includes("AFTERNOON") ||
            new Date(a.date).getUTCHours() >= 12;
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
  }, [staffMembers]);

  const handleDateChange = (date: string) => {
    router.push(`/dashboard/admin/staff-attendance?date=${date}`);
  };

  const handleSave = async (
    records: { id: string; status: string; remarks?: string }[],
    date: string,
    session: "FORENOON" | "AFTERNOON"
  ) => {
    const payload = records.map((r) => ({
      staffId: r.id,
      date,
      status: r.status,
      session,
      remarks: r.remarks,
    }));

    const res = await adminBulkStaffAttendance(payload);
    if (res?.error) {
      return { success: false, error: res.error };
    }
    router.refresh();
    return { success: true };
  };

  return (
    <AttendanceSessionManager
      title="Non-Teaching Staff Attendance"
      subtitle="Record and monitor daily Forenoon & Afternoon attendance for school support staff, bus coordinators, and non-teaching personnel."
      categories={categories}
      activeCategoryId={activeCategory === "ALL" ? undefined : activeCategory}
      onCategoryChange={(catId) => setActiveCategory(catId)}
      initialDate={initialDate}
      onDateChange={handleDateChange}
      people={people}
      onSave={handleSave}
    />
  );
}

