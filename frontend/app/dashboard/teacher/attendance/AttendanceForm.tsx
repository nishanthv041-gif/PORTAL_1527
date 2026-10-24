"use client";

import { useState, useTransition } from "react";
import { 
  Users, 
  CheckCircle2, 
  CalendarDays, 
  CalendarCheck, 
  Palmtree, 
  Lock, 
  RefreshCw, 
  Check, 
  AlertCircle 
} from "lucide-react";
import styles from "./TeacherAttendance.module.css";
import { 
  updateSingleAttendance, 
  saveBulkAttendance, 
  getClassAttendanceDetails 
} from "@/backend/api/actions/dashboard/teacher/attendance/actions";
import { isDateInCurrentWeek } from "@/frontend/utils/attendanceDateUtils";

interface StudentInfo {
  id: string;
  firstName: string;
  lastName: string;
  rollNumber: string;
}

interface ClassData {
  id: string;
  name: string;
  section: string;
  students: StudentInfo[];
}

interface CalendarStats {
  totalActiveDays: number;
  totalLeaveDays: number;
}

interface AttendanceFormProps {
  myClass: ClassData;
  calendarStats: CalendarStats;
  initialDate: string;
  initialAttendanceMap: Record<string, { status: string; isLeaveApproved: boolean; remarks?: string }>;
  initialLeaveCount: number;
}

export default function AttendanceForm({
  myClass,
  calendarStats,
  initialDate,
  initialAttendanceMap,
  initialLeaveCount,
}: AttendanceFormProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [attendanceMap, setAttendanceMap] = useState(initialAttendanceMap);
  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("saved");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check if current date is within the allowed week for Class Teachers
  const isEditable = isDateInCurrentWeek(selectedDate);

  // Calculate live counts dynamically from attendanceMap
  const totalStudents = myClass.students.length;
  const presentCount = Object.values(attendanceMap).filter(
    (a) => a.status === "PRESENT"
  ).length;
  const leaveCount = Object.values(attendanceMap).filter(
    (a) => a.status === "LEAVE"
  ).length;

  // Format date display as DD-MM-YYYY
  const formatDisplayDate = (isoStr: string) => {
    try {
      const parts = isoStr.split("-");
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return isoStr;
    } catch {
      return isoStr;
    }
  };

  // Date change handler: loads data for selected date and recalculates
  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    setSaveStatus("saving");
    setErrorMessage(null);

    startTransition(async () => {
      const res = await getClassAttendanceDetails(myClass.id, newDate);
      if (res.success && res.attendanceMap) {
        setAttendanceMap(res.attendanceMap);
        setSaveStatus("saved");
      } else {
        setSaveStatus("error");
        setErrorMessage(res.error || "Failed to load date attendance.");
      }
    });
  };

  // Live Auto-Register: Toggle Present, Absent, or Leave for a single student
  const handleToggleStatus = (studentId: string, newStatus: "PRESENT" | "ABSENT" | "LEAVE") => {
    if (!isEditable) return;

    const prevAtt = attendanceMap[studentId];
    const willBeLeave = newStatus === "LEAVE";

    // Optimistic UI update
    setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status: newStatus,
        isLeaveApproved: willBeLeave ? (prev[studentId]?.isLeaveApproved ?? true) : false,
      },
    }));

    setSaveStatus("saving");
    setErrorMessage(null);

    startTransition(async () => {
      const res = await updateSingleAttendance({
        studentId,
        classId: myClass.id,
        date: selectedDate,
        status: newStatus,
        remarks: willBeLeave ? (prevAtt?.remarks || "Leave marked by Class Teacher") : "",
      });

      if (res.success) {
        setSaveStatus("saved");
      } else {
        setSaveStatus("error");
        setErrorMessage(res.error || "Failed to save attendance.");
      }
    });
  };

  // Quick Mark: All Present
  const handleAllPresent = () => {
    if (!isEditable) return;

    const newMap = { ...attendanceMap };
    const bulkData: { studentId: string; status: string; date: string; classId: string }[] = [];

    myClass.students.forEach((student) => {
      // Do not overwrite students who have an approved leave request!
      if (!newMap[student.id]?.isLeaveApproved) {
        newMap[student.id] = { status: "PRESENT", isLeaveApproved: false };
        bulkData.push({
          studentId: student.id,
          classId: myClass.id,
          date: selectedDate,
          status: "PRESENT",
        });
      }
    });

    setAttendanceMap(newMap);
    setSaveStatus("saving");
    setErrorMessage(null);

    startTransition(async () => {
      const res = await saveBulkAttendance(bulkData);
      if (res.success) {
        setSaveStatus("saved");
      } else {
        setSaveStatus("error");
        setErrorMessage(res.error || "Failed to save bulk attendance.");
      }
    });
  };

  // Quick Mark: All Absent
  const handleAllAbsent = () => {
    if (!isEditable) return;

    const newMap = { ...attendanceMap };
    const bulkData: { studentId: string; status: string; date: string; classId: string }[] = [];

    myClass.students.forEach((student) => {
      // Do not overwrite students who have an approved leave request!
      if (!newMap[student.id]?.isLeaveApproved) {
        newMap[student.id] = { status: "ABSENT", isLeaveApproved: false };
        bulkData.push({
          studentId: student.id,
          classId: myClass.id,
          date: selectedDate,
          status: "ABSENT",
        });
      }
    });

    setAttendanceMap(newMap);
    setSaveStatus("saving");
    setErrorMessage(null);

    startTransition(async () => {
      const res = await saveBulkAttendance(bulkData);
      if (res.success) {
        setSaveStatus("saved");
      } else {
        setSaveStatus("error");
        setErrorMessage(res.error || "Failed to save bulk attendance.");
      }
    });
  };

  return (
    <div className={styles.container}>
      {/* 1. TOP 5 CARDS (Matching the drawing layout) */}
      <div className={styles.topCardsGrid}>
        {/* Card 1: Present total - today */}
        <div className={`${styles.metricCard} ${styles.metricPresent}`}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Present total - today</span>
            <CheckCircle2 size={18} color="var(--success)" />
          </div>
          <div className={styles.metricValue}>{presentCount}</div>
          <div className={styles.metricSubtext}>
            {totalStudents > 0 ? `${((presentCount / totalStudents) * 100).toFixed(0)}% attendance` : "No students"}
          </div>
        </div>

        {/* Card 2: No. of. student in Class */}
        <div className={`${styles.metricCard} ${styles.metricTotalStudents}`}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>No. of. student in Class</span>
            <Users size={18} color="var(--primary)" />
          </div>
          <div className={styles.metricValue}>{totalStudents}</div>
          <div className={styles.metricSubtext}>{myClass.name} - {myClass.section}</div>
        </div>

        {/* Card 3: Leave total today */}
        <div className={`${styles.metricCard} ${styles.metricLeaveToday}`}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Leave total today</span>
            <CalendarCheck size={18} color="#8b5cf6" />
          </div>
          <div className={styles.metricValue}>{leaveCount}</div>
          <div className={styles.metricSubtext}>Accepted teacher leaves</div>
        </div>

        {/* Card 4: Total School active days */}
        <div className={`${styles.metricCard} ${styles.metricActiveDays}`}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Total School active days</span>
            <CalendarDays size={18} color="#06b6d4" />
          </div>
          <div className={styles.metricValue}>{calendarStats.totalActiveDays}</div>
          <div className={styles.metricSubtext}>From Admin Calendar</div>
        </div>

        {/* Card 5: Total leave days */}
        <div className={`${styles.metricCard} ${styles.metricTotalLeaveDays}`}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Total leave days</span>
            <Palmtree size={18} color="var(--warning)" />
          </div>
          <div className={styles.metricValue}>{calendarStats.totalLeaveDays}</div>
          <div className={styles.metricSubtext}>Admin scheduled holidays</div>
        </div>
      </div>

      {/* 2. MARK ATTENDANCE SECTION */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionTitle}>
          <span>Mark Attendance</span>

          {/* Real-Time Auto-Register Status Badge */}
          <div className={styles.autoSaveStatus}>
            {saveStatus === "saving" && (
              <span className={styles.statusSaving} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <RefreshCw size={14} className="spin-animation" style={{ animation: "spin 1s linear infinite" }} />
                Registering changes...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className={styles.statusSaved} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <Check size={15} />
                All changes registered
              </span>
            )}
            {saveStatus === "error" && (
              <span className={styles.statusError} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <AlertCircle size={15} />
                {errorMessage || "Save failed"}
              </span>
            )}
          </div>
        </div>

        {/* Weekly restriction notice banner if viewing outside current week */}
        {!isEditable && (
          <div className={styles.lockNoticeBanner}>
            <Lock size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Editing Locked for {formatDisplayDate(selectedDate)}:</strong> Class Teachers can only edit attendance for the current calendar week. Past or future week records are read-only. Contact an Administrator to adjust historical records.
            </div>
          </div>
        )}

        {/* Filter Bar: Class & Date */}
        <div className={styles.filterBar}>
          <div className={styles.fieldGroup} style={{ flex: "1 1 200px" }}>
            <label className={styles.fieldLabel}>Class</label>
            <div className={styles.classBadge}>
              <Users size={16} color="var(--primary)" />
              {myClass.name} - {myClass.section}
            </div>
          </div>

          <div className={styles.fieldGroup} style={{ flex: "1 1 220px" }}>
            <label className={styles.fieldLabel}>
              Date <span style={{ fontSize: "0.75rem", opacity: 0.6, fontWeight: 400 }}>({formatDisplayDate(selectedDate)})</span>
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className={styles.dateInput}
            />
          </div>
        </div>

        {/* Quick Mark Row: [All Present] [All Absent] */}
        <div className={styles.quickMarkRow}>
          <div className={styles.quickMarkActions}>
            <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>Quick Mark :-</span>
            <button
              type="button"
              onClick={handleAllPresent}
              disabled={!isEditable || isPending || totalStudents === 0}
              className={styles.quickBtnPresent}
              title={!isEditable ? "Editing locked for this date" : "Mark all active students as present"}
            >
              <CheckCircle2 size={15} />
              All Present
            </button>
            <button
              type="button"
              onClick={handleAllAbsent}
              disabled={!isEditable || isPending || totalStudents === 0}
              className={styles.quickBtnAbsent}
              title={!isEditable ? "Editing locked for this date" : "Mark all active students as absent"}
            >
              <AlertCircle size={15} />
              All Absent
            </button>
          </div>

          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            * Instant auto-registration enabled. Changes apply immediately.
          </div>
        </div>

        {/* 3. ATTENDANCE TABLE (Roll No | Student Name | Status) */}
        <div style={{ overflowX: "auto", width: "100%", maxWidth: "100%", minWidth: 0, WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "480px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border-color)", background: "rgba(0,0,0,0.02)" }}>
                <th style={{ padding: "0.85rem 1rem", fontWeight: 600, width: "120px" }}>Roll No</th>
                <th style={{ padding: "0.85rem 1rem", fontWeight: 600 }}>Student Name</th>
                <th style={{ padding: "0.85rem 1rem", fontWeight: 600, width: "300px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {myClass.students.map((student) => {
                const studentAtt = attendanceMap[student.id];
                const isLeave = studentAtt?.status === "LEAVE";
                const isPresent = studentAtt?.status === "PRESENT";
                const isAbsent = studentAtt?.status === "ABSENT";
                const hasLeaveRequest = studentAtt?.isLeaveApproved;

                return (
                  <tr key={student.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                    <td style={{ padding: "0.85rem 1rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                      {student.rollNumber || "-"}
                    </td>

                    <td style={{ padding: "0.85rem 1rem", fontWeight: 600 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span>{student.firstName} {student.lastName}</span>
                        {hasLeaveRequest && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              padding: "2px 7px",
                              borderRadius: "12px",
                              backgroundColor: "rgba(139, 92, 246, 0.12)",
                              color: "#8b5cf6",
                              border: "1px solid rgba(139, 92, 246, 0.25)",
                            }}
                            title={studentAtt?.remarks || "Leave Request Accepted"}
                          >
                            Leave Approved
                          </span>
                        )}
                      </div>
                    </td>

                    <td style={{ padding: "0.85rem 1rem" }}>
                      <div className={styles.statusButtonGroup}>
                        <button
                          type="button"
                          disabled={!isEditable || isPending}
                          onClick={() => handleToggleStatus(student.id, "PRESENT")}
                          className={`${styles.statusBtn} ${isPresent ? styles.statusBtnPresentActive : ""}`}
                          title={!isEditable ? "Editing locked for this date" : "Mark Present"}
                        >
                          <CheckCircle2 size={14} />
                          Present
                        </button>

                        <button
                          type="button"
                          disabled={!isEditable || isPending}
                          onClick={() => handleToggleStatus(student.id, "ABSENT")}
                          className={`${styles.statusBtn} ${isAbsent ? styles.statusBtnAbsentActive : ""}`}
                          title={!isEditable ? "Editing locked for this date" : "Mark Absent"}
                        >
                          <AlertCircle size={14} />
                          Absent
                        </button>

                        <button
                          type="button"
                          disabled={!isEditable || isPending}
                          onClick={() => handleToggleStatus(student.id, "LEAVE")}
                          className={`${styles.statusBtn} ${isLeave ? styles.statusBtnLeaveActive : ""}`}
                          title={!isEditable ? "Editing locked for this date" : "Mark Leave"}
                        >
                          <CalendarCheck size={14} />
                          Leave
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {myClass.students.length === 0 && (
            <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-secondary)" }}>
              <Users size={32} style={{ opacity: 0.3, margin: "0 auto 0.5rem" }} />
              <p style={{ margin: 0 }}>No students enrolled in this class.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
