import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import { Calendar as CalendarIcon, CheckCircle, XCircle, Clock, CalendarDays, Award } from "lucide-react";
import { getSystemSetting } from "@/backend/api/actions/dashboard/admin/settings/actions";
import { getParentAndSelectedChild } from "../parentChildHelper";
import { getSchoolCalendarStats } from "@/backend/api/actions/dashboard/attendance/calendarStats";
import { calculateAttendancePercentage, isForenoonRecord, isAfternoonRecord } from "@/backend/lib/services/attendanceCalculation";

interface DayAttendanceGroup {
  dateStr: string;
  dateObj: Date;
  forenoon?: { id: string; status: string; remarks?: string | null };
  afternoon?: { id: string; status: string; remarks?: string | null };
}

export default async function ParentAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const { session, parent, children, selectedChild } = await getParentAndSelectedChild(resolvedSearchParams?.childId);
  if (!session) return null;

  const canManage = await getSystemSetting("PARENT_ATTENDANCE_VISIBILITY", "true");
  if (canManage === "false") {
    return (
      <div className={styles.dashboard}>
        <h1 className={styles.title}>Attendance Records</h1>
        <p style={{ color: "var(--danger)" }}>Attendance visibility has been disabled by the administrator.</p>
      </div>
    );
  }

  if (!parent || children.length === 0 || !selectedChild) {
    return (
      <div className={styles.dashboard}>
        <h1 className={styles.title}>Attendance Records</h1>
        <p>No children linked to your account.</p>
      </div>
    );
  }

  // Fetch Calendar stats and attendance records concurrently
  const [calendarStats, attendanceRecords] = await Promise.all([
    getSchoolCalendarStats(new Date(), selectedChild.classId),
    prisma.attendance.findMany({
      where: { studentId: selectedChild.id },
      orderBy: { date: "desc" },
      select: { id: true, date: true, status: true, remarks: true }
    })
  ]);

  const presentCount = attendanceRecords.filter((a) => a.status === "PRESENT").length;
  const absentCount = attendanceRecords.filter((a) => a.status === "ABSENT").length;
  const lateCount = attendanceRecords.filter((a) => a.status === "LATE").length;
  const legacyLeaveCount = attendanceRecords.filter((a) => a.status === "LEAVE").length;

  // Each school worked day in the calendar consists of 2 sessions: Forenoon and Afternoon
  const officialWorkingSessions = calendarStats.totalActiveDays * 2;
  const totalRecordedSessions = presentCount + absentCount + lateCount + legacyLeaveCount;
  const totalWorkingSessions = Math.max(officialWorkingSessions, totalRecordedSessions, 1);

  // Present and Late are counted in attendance percentage; Late tracks punctuality
  const attendedSessions = presentCount + lateCount;
  const percentage = calculateAttendancePercentage(attendedSessions, totalWorkingSessions);

  // Group records by calendar day (YYYY-MM-DD) into Forenoon and Afternoon
  const daysMap = new Map<string, DayAttendanceGroup>();

  for (const record of attendanceRecords) {
    const d = new Date(record.date);
    const dateStr = d.toISOString().split("T")[0];

    if (!daysMap.has(dateStr)) {
      daysMap.set(dateStr, {
        dateStr,
        dateObj: d,
      });
    }

    const group = daysMap.get(dateStr)!;
    if (isForenoonRecord(record)) {
      group.forenoon = {
        id: record.id,
        status: record.status === "LEAVE" ? "LATE" : record.status,
        remarks: record.remarks,
      };
    } else {
      group.afternoon = {
        id: record.id,
        status: record.status === "LEAVE" ? "LATE" : record.status,
        remarks: record.remarks,
      };
    }
  }

  const groupedDays = Array.from(daysMap.values()).sort(
    (a, b) => b.dateObj.getTime() - a.dateObj.getTime()
  );

  const getStatusBadge = (status?: string) => {
    if (!status || status === "NOT_MARKED") {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            padding: "4px 8px",
            borderRadius: "12px",
            fontSize: "0.75rem",
            fontWeight: 600,
            backgroundColor: "rgba(0,0,0,0.05)",
            color: "var(--text-secondary)",
          }}
        >
          Not Marked
        </span>
      );
    }

    if (status === "PRESENT") {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            padding: "4px 8px",
            borderRadius: "12px",
            fontSize: "0.75rem",
            fontWeight: 600,
            backgroundColor: "var(--success-bg)",
            color: "var(--success)",
          }}
        >
          <CheckCircle size={13} /> Present
        </span>
      );
    }

    if (status === "LATE") {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            padding: "4px 8px",
            borderRadius: "12px",
            fontSize: "0.75rem",
            fontWeight: 600,
            backgroundColor: "rgba(217, 119, 6, 0.12)",
            color: "#d97706",
          }}
        >
          <Clock size={13} /> Late
        </span>
      );
    }

    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.25rem",
          padding: "4px 8px",
          borderRadius: "12px",
          fontSize: "0.75rem",
          fontWeight: 600,
          backgroundColor: "var(--danger-bg)",
          color: "var(--danger)",
        }}
      >
        <XCircle size={13} /> Absent
      </span>
    );
  };

  const getDaySummary = (fn?: string, an?: string) => {
    if (!fn && !an) return "No Records";
    if (fn === "PRESENT" && an === "PRESENT") return "Full Day Present";
    if (fn === "ABSENT" && an === "ABSENT") return "Full Day Absent";
    if (fn === "LATE" && an === "LATE") return "Late (Both Sessions)";
    if (fn === "LATE" && an === "PRESENT") return "Late (Forenoon)";
    if (fn === "PRESENT" && an === "LATE") return "Late (Afternoon)";
    if ((fn === "PRESENT" || fn === "LATE") && an === "ABSENT") return "Half Day (Morning)";
    if (fn === "ABSENT" && (an === "PRESENT" || an === "LATE")) return "Half Day (Afternoon)";
    return "Partial Record";
  };

  return (
    <div className={styles.dashboard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>Attendance Records</h1>
          <p style={{ color: "var(--text-secondary)", margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
            Viewing academic records for <strong>{selectedChild.firstName} {selectedChild.lastName}</strong>
          </p>
        </div>
      </div>

      {/* 5 Stats Cards: Percentage, Present, Late, Absent, Calendar Working Days */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: "1rem", marginTop: "2rem" }}>
        {/* 1. Overall Attendance % */}
        <div className={styles.statCard} style={{ borderLeft: "4px solid var(--primary)" }}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Attendance %</span>
            <span className={styles.statValue} style={{ color: "var(--primary)" }}>{percentage}%</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
              Based on {calendarStats.totalActiveDays} calendar days
            </span>
          </div>
        </div>

        {/* 2. Present Sessions */}
        <div className={styles.statCard} style={{ borderLeft: "4px solid var(--success)" }}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Present Sessions</span>
            <span className={styles.statValue} style={{ color: "var(--success)" }}>{presentCount}</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
              On-time attendance
            </span>
          </div>
        </div>

        {/* 3. Late Sessions (Replaced Leave) */}
        <div className={styles.statCard} style={{ borderLeft: "4px solid #d97706" }}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Late Sessions</span>
            <span className={styles.statValue} style={{ color: "#d97706" }}>{lateCount}</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
              Late arrival sessions
            </span>
          </div>
        </div>

        {/* 4. Absent Sessions */}
        <div className={styles.statCard} style={{ borderLeft: "4px solid var(--danger)" }}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Absent Sessions</span>
            <span className={styles.statValue} style={{ color: "var(--danger)" }}>{absentCount}</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
              Unexcused absences
            </span>
          </div>
        </div>

        {/* 5. School Calendar Working Days */}
        <div className={styles.statCard} style={{ borderLeft: "4px solid #06b6d4" }}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>School Working Days</span>
            <span className={styles.statValue} style={{ color: "#06b6d4" }}>{calendarStats.totalActiveDays}</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
              {calendarStats.totalActiveDays * 2} sessions from calendar
            </span>
          </div>
        </div>
      </div>

      {/* Detailed Attendance History Table divided into Forenoon & Afternoon */}
      <div className={styles.chartCard} style={{ marginTop: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h3 className={styles.chartHeader} style={{ margin: 0 }}>Detailed Attendance History</h3>
            <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Daily attendance divided into Forenoon &amp; Afternoon sessions
            </p>
          </div>
          <span style={{ fontSize: "0.8rem", padding: "4px 10px", borderRadius: "12px", background: "rgba(0,0,0,0.04)", fontWeight: 600 }}>
            {groupedDays.length} Recorded Days
          </span>
        </div>

        <div style={{ overflowX: "auto", width: "100%", maxWidth: "100%", minWidth: 0, WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "600px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "rgba(0,0,0,0.02)" }}>
                <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Date</th>
                <th style={{ padding: "0.75rem 1rem", fontWeight: 600, textAlign: "center" }}>Forenoon</th>
                <th style={{ padding: "0.75rem 1rem", fontWeight: 600, textAlign: "center" }}>Afternoon</th>
                <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Day Summary</th>
                <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {groupedDays.map((dayGroup) => {
                const fnStatus = dayGroup.forenoon?.status;
                const anStatus = dayGroup.afternoon?.status;
                const summary = getDaySummary(fnStatus, anStatus);
                const remarksText = [dayGroup.forenoon?.remarks, dayGroup.afternoon?.remarks]
                  .filter(Boolean)
                  .join(" | ");

                return (
                  <tr key={dayGroup.dateStr} style={{ borderBottom: "1px solid var(--border)" }}>
                    {/* Date */}
                    <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <CalendarIcon size={16} style={{ opacity: 0.5 }} />
                        <span style={{ fontWeight: 600 }}>
                          {dayGroup.dateObj.toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          ({dayGroup.dateObj.toLocaleDateString("en-GB", { weekday: "short" })})
                        </span>
                      </div>
                    </td>

                    {/* Forenoon Session */}
                    <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                      {getStatusBadge(fnStatus)}
                    </td>

                    {/* Afternoon Session */}
                    <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                      {getStatusBadge(anStatus)}
                    </td>

                    {/* Day Summary */}
                    <td style={{ padding: "0.75rem 1rem", fontSize: "0.85rem", fontWeight: 500 }}>
                      <span
                        style={{
                          color:
                            summary.includes("Full Day Present")
                              ? "var(--success)"
                              : summary.includes("Absent")
                              ? "var(--danger)"
                              : summary.includes("Late")
                              ? "#d97706"
                              : "var(--foreground)",
                        }}
                      >
                        {summary}
                      </span>
                    </td>

                    {/* Remarks */}
                    <td style={{ padding: "0.75rem 1rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      {remarksText || "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {groupedDays.length === 0 && (
            <p style={{ padding: "2rem", textAlign: "center", opacity: 0.7 }}>No attendance records found yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
