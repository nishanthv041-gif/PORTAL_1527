"use client";

import { useState, useMemo } from "react";
import {
  UserCheck,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  BarChart3,
  Search,
  Filter,
  Check,
  Award,
  Layers,
  ChevronDown
} from "lucide-react";
import styles from "./TeacherPersonalAttendance.module.css";

export type TeacherPersonalAttendanceProps = {
  teacherInfo: {
    id: string;
    name: string;
    email: string;
    employeeId: string;
    qualification?: string | null;
    classTeacherOf?: { id: string; name: string; section: string } | null;
  };
  attendanceData: {
    totalSessions: number;
    presentedDays: number;
    absentedDays: number;
    lateDays: number;
    leaveDays: number;
    attendancePercentage: string;
    todayDate: string;
    forenoonStatus: "PRESENT" | "ABSENT" | "LATE" | "NOT_MARKED";
    forenoonRemarks: string;
    afternoonStatus: "PRESENT" | "ABSENT" | "LATE" | "NOT_MARKED";
    afternoonRemarks: string;
    attendances: Array<{
      id: string;
      date: string; // ISO string
      session: "Forenoon" | "Afternoon";
      status: string;
      remarks?: string | null;
    }>;
  };
};

type GroupedDayRecord = {
  dateStr: string;
  displayDate: string;
  dayOfWeek: string;
  forenoon: { status: string; remarks?: string | null } | null;
  afternoon: { status: string; remarks?: string | null } | null;
  daySummary: "Full Day Present" | "Half Day (FN)" | "Half Day (AN)" | "Full Day Absent" | "Late / Partial" | "Single Session" | "Not Marked";
};

export default function TeacherPersonalAttendance({
  teacherInfo,
  attendanceData,
}: TeacherPersonalAttendanceProps) {
  const [selectedDate, setSelectedDate] = useState<string>(attendanceData.todayDate);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [monthFilter, setMonthFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Compute daily status for the actively selected date
  const selectedDayStatus = useMemo(() => {
    const records = attendanceData.attendances.filter((a) => {
      const d = a.date.split("T")[0];
      return d === selectedDate;
    });

    const fn = records.find((r) => r.session === "Forenoon");
    const an = records.find((r) => r.session === "Afternoon");

    const fnStatus = fn?.status || (selectedDate === attendanceData.todayDate ? attendanceData.forenoonStatus : "NOT_MARKED");
    const fnRemarks = fn?.remarks || (selectedDate === attendanceData.todayDate ? attendanceData.forenoonRemarks : "");

    const anStatus = an?.status || (selectedDate === attendanceData.todayDate ? attendanceData.afternoonStatus : "NOT_MARKED");
    const anRemarks = an?.remarks || (selectedDate === attendanceData.todayDate ? attendanceData.afternoonRemarks : "");

    let summary: { text: string; type: "present" | "absent" | "late" | "neutral" } = {
      text: "Not Marked",
      type: "neutral",
    };

    if (fnStatus === "PRESENT" && anStatus === "PRESENT") {
      summary = { text: "Full Day Present", type: "present" };
    } else if (fnStatus === "PRESENT" && anStatus === "ABSENT") {
      summary = { text: "Half Day (Forenoon Only)", type: "late" };
    } else if (fnStatus === "ABSENT" && anStatus === "PRESENT") {
      summary = { text: "Half Day (Afternoon Only)", type: "late" };
    } else if (fnStatus === "ABSENT" && anStatus === "ABSENT") {
      summary = { text: "Full Day Absent", type: "absent" };
    } else if (fnStatus === "LATE" || anStatus === "LATE") {
      summary = { text: "Late / Partial Session", type: "late" };
    } else if (fnStatus === "PRESENT" && anStatus === "NOT_MARKED") {
      summary = { text: "Forenoon Present (AN Pending)", type: "present" };
    } else if (fnStatus === "ABSENT" && anStatus === "NOT_MARKED") {
      summary = { text: "Forenoon Absent", type: "absent" };
    }

    return {
      forenoonStatus: fnStatus,
      forenoonRemarks: fnRemarks,
      afternoonStatus: anStatus,
      afternoonRemarks: anRemarks,
      summary,
    };
  }, [attendanceData, selectedDate]);

  // Group all attendance records by unique day
  const groupedDays = useMemo<GroupedDayRecord[]>(() => {
    const dayMap = new Map<string, { forenoon?: { status: string; remarks?: string | null }; afternoon?: { status: string; remarks?: string | null } }>();

    attendanceData.attendances.forEach((a) => {
      const dateKey = a.date.split("T")[0];
      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, {});
      }
      const dayObj = dayMap.get(dateKey)!;
      if (a.session === "Forenoon") {
        dayObj.forenoon = { status: a.status, remarks: a.remarks };
      } else {
        dayObj.afternoon = { status: a.status, remarks: a.remarks };
      }
    });

    // Ensure selected date / today is included if marked
    if (!dayMap.has(attendanceData.todayDate) && (attendanceData.forenoonStatus !== "NOT_MARKED" || attendanceData.afternoonStatus !== "NOT_MARKED")) {
      dayMap.set(attendanceData.todayDate, {
        forenoon: attendanceData.forenoonStatus !== "NOT_MARKED" ? { status: attendanceData.forenoonStatus, remarks: attendanceData.forenoonRemarks } : undefined,
        afternoon: attendanceData.afternoonStatus !== "NOT_MARKED" ? { status: attendanceData.afternoonStatus, remarks: attendanceData.afternoonRemarks } : undefined,
      });
    }

    const result: GroupedDayRecord[] = [];
    const sortedKeys = Array.from(dayMap.keys()).sort((a, b) => b.localeCompare(a));

    for (const key of sortedKeys) {
      const entry = dayMap.get(key)!;
      const dateParts = key.split("-").map(Number);
      const dObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);

      const displayDate = dObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const dayOfWeek = dObj.toLocaleDateString("en-US", { weekday: "short" });

      const fn = entry.forenoon || null;
      const an = entry.afternoon || null;

      let daySummary: GroupedDayRecord["daySummary"] = "Not Marked";
      if (fn?.status === "PRESENT" && an?.status === "PRESENT") {
        daySummary = "Full Day Present";
      } else if (fn?.status === "PRESENT" && an?.status === "ABSENT") {
        daySummary = "Half Day (FN)";
      } else if (fn?.status === "ABSENT" && an?.status === "PRESENT") {
        daySummary = "Half Day (AN)";
      } else if (fn?.status === "ABSENT" && an?.status === "ABSENT") {
        daySummary = "Full Day Absent";
      } else if (fn?.status === "LATE" || an?.status === "LATE") {
        daySummary = "Late / Partial";
      } else if (fn || an) {
        daySummary = "Single Session";
      }

      result.push({
        dateStr: key,
        displayDate,
        dayOfWeek,
        forenoon: fn,
        afternoon: an,
        daySummary,
      });
    }

    return result;
  }, [attendanceData]);

  // Extract available months for the dropdown
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    groupedDays.forEach((g) => {
      const [y, m] = g.dateStr.split("-");
      months.add(`${y}-${m}`);
    });
    // Add current month if not present
    const currentMonth = attendanceData.todayDate.slice(0, 7);
    months.add(currentMonth);

    return Array.from(months).sort((a, b) => b.localeCompare(a)).map((ym) => {
      const [year, month] = ym.split("-").map(Number);
      const dateObj = new Date(year, month - 1, 1);
      return {
        key: ym,
        label: dateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      };
    });
  }, [groupedDays, attendanceData.todayDate]);

  // Filtered rows for the history table
  const filteredHistory = useMemo(() => {
    return groupedDays.filter((row) => {
      // Month filter
      if (monthFilter !== "ALL" && !row.dateStr.startsWith(monthFilter)) {
        return false;
      }

      // Status filter
      if (statusFilter === "PRESENT") {
        const isPres = row.forenoon?.status === "PRESENT" || row.afternoon?.status === "PRESENT";
        if (!isPres) return false;
      } else if (statusFilter === "ABSENT") {
        const isAbs = row.forenoon?.status === "ABSENT" || row.afternoon?.status === "ABSENT";
        if (!isAbs) return false;
      } else if (statusFilter === "LATE") {
        const isLate = row.forenoon?.status === "LATE" || row.afternoon?.status === "LATE" || row.daySummary.includes("Half Day");
        if (!isLate) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesDate = row.dateStr.includes(q) || row.displayDate.toLowerCase().includes(q) || row.dayOfWeek.toLowerCase().includes(q);
        const matchesRemarks = (row.forenoon?.remarks || "").toLowerCase().includes(q) || (row.afternoon?.remarks || "").toLowerCase().includes(q);
        const matchesSummary = row.daySummary.toLowerCase().includes(q);
        if (!matchesDate && !matchesRemarks && !matchesSummary) return false;
      }

      return true;
    });
  }, [groupedDays, monthFilter, statusFilter, searchQuery]);

  const percentageNum = parseFloat(attendanceData.attendancePercentage) || 0;
  const progressColor = percentageNum >= 85 ? "#10b981" : percentageNum >= 75 ? "#f59e0b" : "#ef4444";

  const getStatusBadge = (status?: string | null) => {
    switch (status) {
      case "PRESENT":
        return <span className={`${styles.sessionBadge} ${styles.statusPresent}`}><CheckCircle2 size={13} /> Present</span>;
      case "ABSENT":
        return <span className={`${styles.sessionBadge} ${styles.statusAbsent}`}><XCircle size={13} /> Absent</span>;
      case "LATE":
        return <span className={`${styles.sessionBadge} ${styles.statusLate}`}><Clock size={13} /> Late</span>;
      default:
        return <span className={`${styles.sessionBadge} ${styles.statusNotMarked}`}>Not Marked</span>;
    }
  };

  const getDaySummaryBadge = (summary: GroupedDayRecord["daySummary"]) => {
    switch (summary) {
      case "Full Day Present":
        return <span className={`${styles.daySummaryPill} ${styles.statusPresent}`}><CheckCircle2 size={13} /> Full Day Present</span>;
      case "Full Day Absent":
        return <span className={`${styles.daySummaryPill} ${styles.statusAbsent}`}><XCircle size={13} /> Absent</span>;
      case "Half Day (FN)":
        return <span className={`${styles.daySummaryPill} ${styles.statusLate}`}><Clock size={13} /> Half Day (FN)</span>;
      case "Half Day (AN)":
        return <span className={`${styles.daySummaryPill} ${styles.statusLate}`}><Clock size={13} /> Half Day (AN)</span>;
      case "Late / Partial":
        return <span className={`${styles.daySummaryPill} ${styles.statusLate}`}><Clock size={13} /> Late / Partial</span>;
      default:
        return <span className={`${styles.daySummaryPill} ${styles.statusNotMarked}`}>Partial / Single</span>;
    }
  };

  return (
    <div className={styles.container}>
      {/* Teacher Profile & Date Selector Header */}
      <div className={styles.headerCard}>
        <div className={styles.teacherProfile}>
          <div className={styles.avatarBox}>
            {teacherInfo.name.charAt(0).toUpperCase()}
          </div>
          <div className={styles.profileInfo}>
            <h2 className={styles.profileName}>
              {teacherInfo.name}
              <span className={styles.empBadge}>{teacherInfo.employeeId}</span>
            </h2>
            <p className={styles.profileSubtitle}>
              {teacherInfo.classTeacherOf
                ? `Class Teacher of ${teacherInfo.classTeacherOf.name} - ${teacherInfo.classTeacherOf.section}`
                : "Faculty Member"}
              {teacherInfo.qualification ? ` • ${teacherInfo.qualification}` : ""}
            </p>
          </div>
        </div>

        <div className={styles.datePickerWrapper}>
          <span className={styles.datePickerLabel}>
            <Calendar size={15} /> Check Date:
          </span>
          <input
            type="date"
            className={styles.dateInput}
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

      {/* Top Stat Cards Grid */}
      <div className={styles.statsGrid}>
        {/* Attendance Rate */}
        <div className={`${styles.statCard} ${styles.statRate}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Attendance Rate</span>
            <div className={styles.statIcon}><BarChart3 size={18} /></div>
          </div>
          <div className={styles.statValue}>{attendanceData.attendancePercentage}%</div>
          <div className={styles.progressBarBg}>
            <div
              className={styles.progressBarFill}
              style={{ width: `${Math.min(percentageNum, 100)}%`, backgroundColor: progressColor }}
            />
          </div>
          <div className={styles.statSubtext}>
            {percentageNum >= 85 ? "Excellent Standing" : percentageNum >= 75 ? "Satisfactory" : "Below 75% Requirement"}
          </div>
        </div>

        {/* Present Sessions */}
        <div className={`${styles.statCard} ${styles.statPresent}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Present Sessions</span>
            <div className={styles.statIcon}><CheckCircle2 size={18} /></div>
          </div>
          <div className={styles.statValue}>{attendanceData.presentedDays}</div>
          <div className={styles.statSubtext}>Forenoon & Afternoon sessions</div>
        </div>

        {/* Absent Sessions */}
        <div className={`${styles.statCard} ${styles.statAbsent}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Absent Sessions</span>
            <div className={styles.statIcon}><XCircle size={18} /></div>
          </div>
          <div className={styles.statValue}>{attendanceData.absentedDays}</div>
          <div className={styles.statSubtext}>Unattended sessions</div>
        </div>

        {/* Late / Half-Day */}
        <div className={`${styles.statCard} ${styles.statLate}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Late / Leaves</span>
            <div className={styles.statIcon}><Clock size={18} /></div>
          </div>
          <div className={styles.statValue}>{attendanceData.lateDays + attendanceData.leaveDays}</div>
          <div className={styles.statSubtext}>Recorded late or on leave</div>
        </div>

        {/* Total Working Sessions */}
        <div className={`${styles.statCard} ${styles.statTotal}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Total Sessions</span>
            <div className={styles.statIcon}><Layers size={18} /></div>
          </div>
          <div className={styles.statValue}>{attendanceData.totalSessions}</div>
          <div className={styles.statSubtext}>Official school working sessions</div>
        </div>
      </div>

      {/* Selected Date Status Card */}
      <div className={styles.todayCard}>
        <div className={styles.cardTitleRow}>
          <h3 className={styles.cardTitle}>
            <Calendar size={18} />
            Daily Status for{" "}
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </h3>
          <div className={`${styles.daySummaryPill} ${
            selectedDayStatus.summary.type === "present"
              ? styles.statusPresent
              : selectedDayStatus.summary.type === "absent"
              ? styles.statusAbsent
              : selectedDayStatus.summary.type === "late"
              ? styles.statusLate
              : styles.statusNotMarked
          }`}>
            {selectedDayStatus.summary.type === "present" && <CheckCircle2 size={14} />}
            {selectedDayStatus.summary.type === "absent" && <XCircle size={14} />}
            {selectedDayStatus.summary.type === "late" && <Clock size={14} />}
            {selectedDayStatus.summary.text}
          </div>
        </div>

        <div className={styles.sessionsRow}>
          {/* Forenoon Session */}
          <div className={styles.sessionBox}>
            <div className={styles.sessionHeader}>
              <span className={styles.sessionName}>
                <Clock size={16} /> Forenoon Session (FN)
              </span>
              {getStatusBadge(selectedDayStatus.forenoonStatus)}
            </div>
            <div className={styles.sessionRemarks}>
              <strong>Remarks: </strong>
              {selectedDayStatus.forenoonRemarks ? selectedDayStatus.forenoonRemarks : "No specific remarks entered."}
            </div>
          </div>

          {/* Afternoon Session */}
          <div className={styles.sessionBox}>
            <div className={styles.sessionHeader}>
              <span className={styles.sessionName}>
                <Clock size={16} /> Afternoon Session (AN)
              </span>
              {getStatusBadge(selectedDayStatus.afternoonStatus)}
            </div>
            <div className={styles.sessionRemarks}>
              <strong>Remarks: </strong>
              {selectedDayStatus.afternoonRemarks ? selectedDayStatus.afternoonRemarks : "No specific remarks entered."}
            </div>
          </div>
        </div>
      </div>

      {/* Daily Attendance History Section */}
      <div className={styles.historyCard}>
        <div className={styles.filterBar}>
          <div className={styles.filterGroup}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground, #fff)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <Filter size={15} /> Filter:
            </span>
            <button
              onClick={() => setStatusFilter("ALL")}
              className={`${styles.filterPill} ${statusFilter === "ALL" ? styles.filterPillActive : ""}`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter("PRESENT")}
              className={`${styles.filterPill} ${statusFilter === "PRESENT" ? styles.filterPillActive : ""}`}
            >
              Present
            </button>
            <button
              onClick={() => setStatusFilter("ABSENT")}
              className={`${styles.filterPill} ${statusFilter === "ABSENT" ? styles.filterPillActive : ""}`}
            >
              Absent
            </button>
            <button
              onClick={() => setStatusFilter("LATE")}
              className={`${styles.filterPill} ${statusFilter === "LATE" ? styles.filterPillActive : ""}`}
            >
              Late / Half-Day
            </button>
          </div>

          <div className={styles.filterGroup}>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className={styles.monthSelect}
              aria-label="Filter by month"
            >
              <option value="ALL">All Months</option>
              {availableMonths.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>

            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Search history..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: "var(--background, #0f172a)",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                  color: "var(--foreground, #f8fafc)",
                  padding: "0.45rem 0.85rem 0.45rem 2rem",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  outline: "none",
                }}
              />
              <Search size={14} style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary, #94a3b8)" }} />
            </div>
          </div>
        </div>

        {/* Table of Records */}
        {filteredHistory.length > 0 ? (
          <div className={styles.tableResponsive}>
            <table className={styles.historyTable}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day</th>
                  <th>Forenoon (FN)</th>
                  <th>Afternoon (AN)</th>
                  <th>Day Summary</th>
                  <th>Remarks / Source</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((row) => (
                  <tr key={row.dateStr}>
                    <td className={styles.dateCell}>
                      <Calendar size={14} style={{ opacity: 0.7 }} />
                      {row.displayDate}
                    </td>
                    <td>{row.dayOfWeek}</td>
                    <td>
                      {getStatusBadge(row.forenoon?.status)}
                    </td>
                    <td>
                      {getStatusBadge(row.afternoon?.status)}
                    </td>
                    <td>
                      {getDaySummaryBadge(row.daySummary)}
                    </td>
                    <td style={{ color: "var(--text-secondary, #94a3b8)", fontSize: "0.8rem", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {row.forenoon?.remarks || row.afternoon?.remarks || "Admin Recorded"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <AlertCircle size={40} className={styles.emptyIcon} />
            <p style={{ margin: 0, fontWeight: 600 }}>No attendance records match your filter criteria.</p>
            <span style={{ fontSize: "0.825rem", color: "var(--text-secondary, #94a3b8)" }}>
              Try selecting another month or clearing search filters.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
