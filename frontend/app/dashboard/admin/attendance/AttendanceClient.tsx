"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { 
  Users, 
  CheckCircle2, 
  XCircle, 
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
  initialLeaveCount,
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

  // Local attendance state mapping studentId -> status
  const [localAttendance, setLocalAttendance] = useState<Record<string, { status: string; remarks?: string }>>(() => {
    const map: Record<string, { status: string; remarks?: string }> = {};
    students.forEach((s) => {
      const att = attendances.find((a) => a.studentId === s.id);
      map[s.id] = {
        status: att?.status || "NOT_MARKED",
        remarks: att?.remarks || "",
      };
    });
    return map;
  });

  const totalStudents = students.length;
  const presentCount = Object.values(localAttendance).filter((a) => a.status === "PRESENT").length;
  const leaveCount = Object.values(localAttendance).filter((a) => a.status === "LEAVE").length;

  const handleFilter = (newClassId: string, newDate: string) => {
    setSelectedClass(newClassId);
    setSelectedDate(newDate);
    const url = `/dashboard/admin/attendance?classId=${newClassId}&date=${newDate}`;
    router.push(url);
  };

  // Live Auto-Register for Admin: click Present or Absent
  const handleToggleStatus = (studentId: string, newStatus: string) => {
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
        setErrorMessage(res.error || "Failed to save attendance.");
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

  // Quick Mark for Admin: All Absent
  const handleAllAbsent = () => {
    if (students.length === 0) return;

    const newMap = { ...localAttendance };
    const bulkData: { studentId: string; status: string; date: string; classId: string }[] = [];

    students.forEach((s) => {
      newMap[s.id] = { ...newMap[s.id], status: "ABSENT" };
      bulkData.push({
        studentId: s.id,
        classId: selectedClass,
        date: selectedDate,
        status: "ABSENT",
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

        {/* Card 3: Leave total today */}
        <div className={`${styles.metricCard} ${styles.metricLeaveToday}`}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Leave total today</span>
            <CalendarCheck size={18} color="#8b5cf6" />
          </div>
          <div className={styles.metricValue}>{leaveCount}</div>
          <div className={styles.metricSubtext}>Approved leave requests</div>
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
            <label className={styles.fieldLabel}>Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleFilter(selectedClass, e.target.value)}
              className={styles.dateInput}
            />
          </div>
        </div>

        {/* Quick Mark: All Present & All Absent */}
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
                onClick={handleAllAbsent}
                disabled={isPending}
                className={styles.quickBtnAbsent}
              >
                <AlertCircle size={15} /> All Absent
              </button>
            </div>

            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              * Instant live auto-register enabled. Admin can edit any date in the academic year.
            </div>
          </div>
        )}

        {/* Attendance Table */}
        {selectedClass && students.length > 0 ? (
          <div style={{ overflowX: "auto", width: "100%", maxWidth: "100%", minWidth: 0, WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "550px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border-color)", background: "rgba(0,0,0,0.02)" }}>
                  <th style={{ padding: "0.85rem 1rem", fontWeight: 600, width: "120px" }}>Roll No</th>
                  <th style={{ padding: "0.85rem 1rem", fontWeight: 600 }}>Student Name</th>
                  <th style={{ padding: "0.85rem 1rem", fontWeight: 600, width: "280px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const currentStatus = localAttendance[student.id]?.status || "NOT_MARKED";
                  const isPresent = currentStatus === "PRESENT";
                  const isAbsent = currentStatus === "ABSENT";
                  const isLeave = currentStatus === "LEAVE";

                  return (
                    <tr key={student.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                      <td style={{ padding: "0.85rem 1rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                        {student.rollNumber || "-"}
                      </td>
                      <td style={{ padding: "0.85rem 1rem", fontWeight: 600 }}>
                        {student.firstName} {student.lastName}
                      </td>
                      <td style={{ padding: "0.85rem 1rem" }}>
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
                            onClick={() => handleToggleStatus(student.id, "ABSENT")}
                            className={`${styles.statusBtn} ${isAbsent ? styles.statusBtnAbsentActive : ""}`}
                          >
                            <XCircle size={14} /> Absent
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
