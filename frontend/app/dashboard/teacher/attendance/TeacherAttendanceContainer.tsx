"use client";

import { useState, useEffect } from "react";
import { Users, UserCheck, Info } from "lucide-react";
import styles from "./TeacherAttendanceContainer.module.css";
import AttendanceForm, { TeacherStudentItem } from "./AttendanceForm";
import TeacherPersonalAttendance, { TeacherPersonalAttendanceProps } from "./TeacherPersonalAttendance";

export type TeacherAttendanceContainerProps = {
  classData: {
    myClass: { id: string; name: string; section: string };
    students: TeacherStudentItem[];
    initialDate: string;
  } | null;
  teacherInfo: TeacherPersonalAttendanceProps["teacherInfo"];
  attendanceData: TeacherPersonalAttendanceProps["attendanceData"];
  initialTab?: "class-attendance" | "my-attendance";
};

export default function TeacherAttendanceContainer({
  classData,
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

  return (
    <div className={styles.wrapper}>
      {classData ? (
        <div className={styles.tabBar} role="tablist" aria-label="Attendance Views">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "class-attendance"}
            onClick={() => handleTabChange("class-attendance")}
            className={`${styles.tabBtn} ${activeTab === "class-attendance" ? styles.tabBtnActive : ""}`}
          >
            <Users size={17} />
            <span>Class Student Attendance</span>
            <span className={styles.tabBadge}>
              {classData.myClass.name} - {classData.myClass.section}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "my-attendance"}
            onClick={() => handleTabChange("my-attendance")}
            className={`${styles.tabBtn} ${activeTab === "my-attendance" ? styles.tabBtnActive : ""}`}
          >
            <UserCheck size={17} />
            <span>View My Attendance</span>
            <span className={styles.tabBadge}>
              {attendanceData.attendancePercentage}% Present
            </span>
          </button>
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
