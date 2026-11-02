"use client";

import { useState, useEffect, useMemo } from "react";
import { Users, UserCheck, Info } from "lucide-react";
import styles from "./TeacherAttendanceContainer.module.css";
import AttendanceForm, { TeacherStudentItem } from "./AttendanceForm";
import TeacherPersonalAttendance, { TeacherPersonalAttendanceProps } from "./TeacherPersonalAttendance";
import MobileTabs, { MobileTabItem } from "@/components/ui/MobileTabs";
import { TeacherClassSwitcher } from "@/frontend/components/teacher/TeacherClassSwitcher";
import { formatClassName } from "@/lib/teacher/formatClassName";
import type { TeacherClass } from "@/lib/teacher/getTeacherClasses";

export type TeacherAttendanceContainerProps = {
  classData: {
    myClass: { id: string; name: string; section: string };
    students: TeacherStudentItem[];
    initialDate: string;
  } | null;
  teacherClasses?: TeacherClass[];
  selectedClassId?: string;
  teacherInfo: TeacherPersonalAttendanceProps["teacherInfo"];
  attendanceData: TeacherPersonalAttendanceProps["attendanceData"];
  initialTab?: "class-attendance" | "my-attendance";
};

export default function TeacherAttendanceContainer({
  classData,
  teacherClasses = [],
  selectedClassId = "",
  teacherInfo,
  attendanceData,
  initialTab,
}: TeacherAttendanceContainerProps) {
  // If not a class teacher, default to 'my-attendance'
  const defaultTab = classData ? (initialTab || "class-attendance") : "my-attendance";
  const [activeTab, setActiveTab] = useState<"class-attendance" | "my-attendance">(defaultTab);

  // Sync state with URL without full page reload
  const handleTabChange = (tab: "class-attendance" | "my-attendance") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url.toString());
    }
  };

  // If initialTab changes from server (e.g. date search params update), update
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleClassSelect = (classId: string) => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("classId", classId);
      window.location.href = url.toString();
    }
  };

  const attendanceTabs: MobileTabItem[] = useMemo(() => [
    {
      id: "class-attendance",
      label: "Class Student Attendance",
      mobileLabel: "Class",
      icon: <Users size={17} />,
    },
    {
      id: "my-attendance",
      label: "View My Attendance",
      mobileLabel: "My Attendance",
      icon: <UserCheck size={17} />,
      badge: `${attendanceData.attendancePercentage}%`,
    },
  ], [attendanceData.attendancePercentage]);

  return (
    <div className={styles.wrapper}>
      {classData ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", width: "100%", marginBottom: "1rem" }}>
          {/* Mobile-first horizontal scrolling tabs */}
          <MobileTabs
            tabs={attendanceTabs}
            activeTab={activeTab}
            onChange={(tabId) => handleTabChange(tabId as "class-attendance" | "my-attendance")}
            syncWithUrl={true}
            queryParamName="tab"
          />

          {/* Teacher Class Switcher Banner */}
          {activeTab === "class-attendance" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
              <TeacherClassSwitcher
                classes={teacherClasses}
                selectedClassId={selectedClassId || classData.myClass.id}
                onSelectClass={handleClassSelect}
                teacherId={teacherInfo.id}
              />
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                {classData.students.length} student{classData.students.length !== 1 ? "s" : ""} enrolled
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.facultyNoticeBanner}>
          <Info size={18} />
          <span>Faculty Attendance • You are viewing your personal staff daily attendance.</span>
        </div>
      )}

      {activeTab === "class-attendance" && classData ? (
        <AttendanceForm
          myClass={classData.myClass}
          students={classData.students}
          initialDate={classData.initialDate}
        />
      ) : (
        <TeacherPersonalAttendance
          teacherInfo={teacherInfo}
          attendanceData={attendanceData}
        />
      )}
    </div>
  );
}

