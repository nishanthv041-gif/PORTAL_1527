import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import { Calendar as CalendarIcon, CheckCircle, XCircle, AlertCircle, CalendarCheck, CalendarDays, Palmtree } from "lucide-react";
import { getSystemSetting } from "@/backend/api/actions/dashboard/admin/settings/actions";
import { getParentAndSelectedChild } from "../parentChildHelper";
import { getSchoolCalendarStats } from "@/backend/api/actions/dashboard/attendance/calendarStats";

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

  // Get Calendar stats from Admin Calendar
  const calendarStats = await getSchoolCalendarStats();

  const attendanceRecords = await prisma.attendance.findMany({
    where: { studentId: selectedChild.id },
    orderBy: { date: "desc" },
  });

  const presentCount = attendanceRecords.filter((a) => a.status === "PRESENT").length;
  const absentCount = attendanceRecords.filter((a) => a.status === "ABSENT").length;
  const leaveCount = attendanceRecords.filter((a) => a.status === "LEAVE").length;

  const total = attendanceRecords.length;
  const percentage = calendarStats.totalActiveDays > 0
    ? ((presentCount / calendarStats.totalActiveDays) * 100).toFixed(1)
    : total > 0
    ? ((presentCount / total) * 100).toFixed(1)
    : "100.0";

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

      {/* 5 Stats Cards matching portal design */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: "1rem", marginTop: "2rem" }}>
        <div className={styles.statCard} style={{ borderLeft: "4px solid var(--primary)" }}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Attendance %</span>
            <span className={styles.statValue} style={{ color: "var(--primary)" }}>{percentage}%</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Based on active days</span>
          </div>
        </div>

        <div className={styles.statCard} style={{ borderLeft: "4px solid var(--success)" }}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Present Days</span>
            <span className={styles.statValue} style={{ color: "var(--success)" }}>{presentCount}</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Attended school</span>
          </div>
        </div>

        <div className={styles.statCard} style={{ borderLeft: "4px solid #8b5cf6" }}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Leave Days</span>
            <span className={styles.statValue} style={{ color: "#8b5cf6" }}>{leaveCount}</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Approved requests</span>
          </div>
        </div>

        <div className={styles.statCard} style={{ borderLeft: "4px solid #06b6d4" }}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total School Active Days</span>
            <span className={styles.statValue} style={{ color: "#06b6d4" }}>{calendarStats.totalActiveDays}</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>From Admin Calendar</span>
          </div>
        </div>

        <div className={styles.statCard} style={{ borderLeft: "4px solid var(--warning)" }}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Leave Days</span>
            <span className={styles.statValue} style={{ color: "var(--warning)" }}>{calendarStats.totalLeaveDays}</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Admin scheduled holidays</span>
          </div>
        </div>
      </div>

      <div className={styles.chartCard} style={{ marginTop: "2rem" }}>
        <h3 className={styles.chartHeader}>Detailed Attendance History</h3>

        <div style={{ overflowX: "auto", width: "100%", maxWidth: "100%", minWidth: 0, WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "400px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "rgba(0,0,0,0.02)" }}>
                <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Date</th>
                <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {attendanceRecords.map((record) => (
                <tr key={record.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <CalendarIcon size={16} style={{ opacity: 0.5 }} />
                    {new Date(record.date).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        padding: "4px 8px",
                        borderRadius: "12px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        backgroundColor:
                          record.status === "PRESENT"
                            ? "var(--success-bg)"
                            : record.status === "ABSENT"
                            ? "var(--danger-bg)"
                            : "rgba(139, 92, 246, 0.12)",
                        color:
                          record.status === "PRESENT"
                            ? "var(--success)"
                            : record.status === "ABSENT"
                            ? "var(--danger)"
                            : "#8b5cf6",
                      }}
                    >
                      {record.status === "PRESENT" && <CheckCircle size={14} />}
                      {record.status === "ABSENT" && <XCircle size={14} />}
                      {record.status === "LEAVE" && <CalendarCheck size={14} />}
                      {record.status}
                    </span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    {record.remarks || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {attendanceRecords.length === 0 && (
            <p style={{ padding: "2rem", textAlign: "center", opacity: 0.7 }}>No attendance records found yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
