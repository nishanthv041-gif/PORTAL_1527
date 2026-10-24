"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  CalendarDays, 
  CalendarCheck, 
  Palmtree, 
  ShieldCheck, 
  RefreshCw, 
  Check 
} from "lucide-react";
import styles from "@/frontend/app/dashboard/teacher/attendance/TeacherAttendance.module.css";
import { adminUpdateAttendance, adminBulkAttendance } from "@/backend/api/actions/dashboard/admin/attendance/actions";
import { Class, Student, Attendance } from "@prisma/client";

interface CalendarStats {
  totalActiveDays: number;
  totalLeaveDays: number;
}

export default function AttendanceClient({
  classes,
  students,
  attendances,
  initialClassId,
  initialDate,
  calendarStats,
}: {
  classes: Class[];
  students: Student[];
  attendances: Attendance[];
  initialClassId: string;
  initialDate: string;
  calendarStats: CalendarStats;
  initialLeaveCount: number;
}) {
  const router = useRouter();
  const [selectedClass, setSelectedClass] = useState(initialClassId);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("saved");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Local attendance state mapping studentId -> status (normalize ABSENT to LEAVE)
  const [localAttendance, setLocalAttendance] = useState<Record<string, { status: string; remarks?: string }>>(() => {
    const map: Record<string, { status: string; remarks?: string }> = {};
    students.forEach((s) => {
      const att = attendances.find((a) => a.studentId === s.id);
      const effectiveStatus = (att?.status === "LEAVE" || att?.status === "ABSENT") ? "LEAVE" : (att?.status || "NOT_MARKED");
      map[s.id] = {
        status: effectiveStatus,
        remarks: att?.remarks || "",
      };
    });
    return map;
  });

  const isToday = selectedDate === new Date().toISOString().split("T")[0];

  const totalStudents = students.length;
  const presentCount = Object.values(localAttendance).filter((a) => a.status === "PRESENT").length;
  const leaveCount = Object.values(localAttendance).filter((a) => a.status === "LEAVE").length;

  // Format date as DD-MM-YYYY
  const formatDisplayDate = (isoStr: string) => {
    try {
      const parts = isoStr.split("-");
      if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
      return isoStr;
    } catch {
      return isoStr;
    }
  };

  const handleFilter = (newClassId: string, newDate: string) => {
    setSelectedClass(newClassId);
    setSelectedDate(newDate);
    const url = `/dashboard/admin/attendance?classId=${newClassId}&date=${newDate}`;
    router.push(url);
  };

  // Live Auto-Register for Admin: click Present or Leave (Absent removed)
  const handleToggleStatus = (studentId: string, newStatus: "PRESENT" | "LEAVE") => {
    // Optimistic UI update
    setLocalAttendance((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status: newStatus,
      },
    }));

    setSaveStatus("saving");
    setErrorMessage(null);

    startTransition(async () => {
      const remarks = localAttendance[studentId]?.remarks || "";
      const res = await adminUpdateAttendance(studentId, selectedDate, newStatus, remarks);

      if (res.success) {
        setSaveStatus("saved");
      } else {
        setSaveStatus("error");
        setErrorMessage(res.error || "Failed to update attendance.");
      }
    });
  };

  // Quick Mark for Admin: All Present
  const handleAllPresent = () => {
    if (students.length === 0) return;

    const newMap = { ...localAttendance };
    const bulkData: { studentId: string; status: string; date: string; classId: string }[] = [];

    students.forEach((s) => {
      newMap[s.id] = { ...newMap[s.id], status: "PRESENT" };
      bulkData.push({
        studentId: s.id,
        classId: selectedClass,
        date: selectedDate,
        status: "PRESENT",
      });
    });

    setLocalAttendance(newMap);
    setSaveStatus("saving");
    setErrorMessage(null);

    startTransition(async () => {
      const res = await adminBulkAttendance(bulkData);
      if (res.success) {
        setSaveStatus("saved");
      } else {
        setSaveStatus("error");
        setErrorMessage(res.error || "Failed to save bulk attendance.");
      }
    });
  };

  // Quick Mark for Admin: All Leave
  const handleAllLeave = () => {
    if (students.length === 0) return;

    const newMap = { ...localAttendance };
    const bulkData: { studentId: string; status: string; date: string; classId: string }[] = [];

    students.forEach((s) => {
      newMap[s.id] = { ...newMap[s.id], status: "LEAVE" };
      bulkData.push({
        studentId: s.id,
        classId: selectedClass,
        date: selectedDate,
        status: "LEAVE",
      });
    });

    setLocalAttendance(newMap);
    setSaveStatus("saving");
    setErrorMessage(null);

    startTransition(async () => {
      const res = await adminBulkAttendance(bulkData);
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
      {/* 1. TOP 5 CARDS (Matching user sketch with optimized desktop sizes) */}
      <div className={styles.topCardsGrid}>
        {/* Card 1: Present total */}
        <div className={`${styles.metricCard} ${styles.metricPresent}`}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>
              {isToday ? "Present total - today" : `Present total (${formatDisplayDate(selectedDate)})`}
            </span>
            <CheckCircle2 size={18} color="var(--success)" />
          </div>
          <div className={styles.metricValue}>{presentCount}</div>
          <div className={styles.metricSubtext}>
            {totalStudents > 0 ? `${((presentCount / totalStudents) * 100).toFixed(0)}% in selected class` : "No students"}
          </div>
        </div>

        {/* Card 2: No. of. student in class */}
        <div className={`${styles.metricCard} ${styles.metricTotalStudents}`}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>No. of. student in class</span>
            <Users size={18} color="var(--primary)" />
          </div>
          <div className={styles.metricValue}>{totalStudents}</div>
          <div className={styles.metricSubtext}>Selected Class strength</div>
        </div>

        {/* Card 3: Leave total for selected date only */}
        <div className={`${styles.metricCard} ${styles.metricLeaveToday}`}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>
              {isToday ? "Leave total today" : `Leave total (${formatDisplayDate(selectedDate)})`}
            </span>
            <CalendarCheck size={18} color="#8b5cf6" />
          </div>
          <div className={styles.metricValue}>{leaveCount}</div>
          <div className={styles.metricSubtext}>
            {isToday ? "Approved leave requests today" : `Leaves on ${formatDisplayDate(selectedDate)} only`}
          </div>
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

      {/* 2. MARK / OVERRIDE ATTENDANCE SECTION */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionTitle}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>Mark / Manage Attendance</span>
            <span
              style={{
                fontSize: "0.75rem",
                padding: "3px 8px",
                borderRadius: "12px",
                backgroundColor: "rgba(99, 102, 241, 0.1)",
                color: "var(--primary)",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
              }}
            >
              <ShieldCheck size={12} /> Admin Mode (Full Academic Year Access)
            </span>
          </div>

          {/* Real-time status badge */}
          <div className={styles.autoSaveStatus}>
            {saveStatus === "saving" && (
              <span className={styles.statusSaving} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
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

        {/* Filters: Class selector & Date picker */}
        <div className={styles.filterBar}>
          <div className={styles.fieldGroup} style={{ flex: "1 1 240px" }}>
            <label className={styles.fieldLabel}>Select Class</label>
            <select
              value={selectedClass}
              onChange={(e) => handleFilter(e.target.value, selectedDate)}
              className={styles.dateInput}
            >
              <option value="">-- Choose Class --</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} - {c.section}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldGroup} style={{ flex: "1 1 220px" }}>
            <label className={styles.fieldLabel}>
              Date <span style={{ fontSize: "0.75rem", opacity: 0.6, fontWeight: 400 }}>({formatDisplayDate(selectedDate)})</span>
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleFilter(selectedClass, e.target.value)}
              className={styles.dateInput}
            />
          </div>
        </div>

        {/* Quick Mark: All Present & All Leave (Absent removed) */}
        {selectedClass && students.length > 0 && (
          <div className={styles.quickMarkRow}>
            <div className={styles.quickMarkActions}>
              <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>Quick Mark :-</span>
              <button
                type="button"
                onClick={handleAllPresent}
                disabled={isPending}
                className={styles.quickBtnPresent}
              >
                <CheckCircle2 size={15} /> All Present
              </button>
              <button
                type="button"
                onClick={handleAllLeave}
                disabled={isPending}
                className={styles.quickBtnLeave}
              >
                <CalendarCheck size={15} /> All Leave
              </button>
            </div>

            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              * Instant live auto-register enabled. Admin can edit any date in the academic year.
            </div>
          </div>
        )}

        {/* Attendance Table with Desktop Layout */}
        {selectedClass && students.length > 0 ? (
          <div className={styles.attendanceTableWrapper}>
            <table className={styles.attendanceTable}>
              <thead>
                <tr className={styles.tableHeaderRow}>
                  <th className={styles.thRoll}>Roll No</th>
                  <th className={styles.thName}>Student Name</th>
                  <th className={styles.thStatus}>Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const currentStatus = localAttendance[student.id]?.status || "NOT_MARKED";
                  const isPresent = currentStatus === "PRESENT";
                  const isLeave = currentStatus === "LEAVE";

                  return (
                    <tr key={student.id} className={styles.tableRow}>
                      <td className={styles.tdRoll}>
                        {student.rollNumber || "-"}
                      </td>
                      <td className={styles.tdName}>
                        {student.firstName} {student.lastName}
                      </td>
                      <td className={styles.tdStatus}>
                        <div className={styles.statusButtonGroup}>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleToggleStatus(student.id, "PRESENT")}
                            className={`${styles.statusBtn} ${isPresent ? styles.statusBtnPresentActive : ""}`}
                          >
                            <CheckCircle2 size={14} /> Present
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleToggleStatus(student.id, "LEAVE")}
                            className={`${styles.statusBtn} ${isLeave ? styles.statusBtnLeaveActive : ""}`}
                          >
                            <CalendarCheck size={14} /> Leave
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : selectedClass ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
            <p>No students found in this class.</p>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
            <p>Please select a class to view attendance.</p>
          </div>
        )}
      </div>
    </div>
  );
}
