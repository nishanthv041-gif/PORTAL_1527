"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Users, CheckCircle2, AlertCircle, Percent, Calendar as CalendarIcon, 
  Search, Check, ArrowRight, X, Sparkles, UserCheck, GraduationCap, 
  Clock, ShieldAlert, Award, Phone, Mail, Loader2
} from "lucide-react";
import styles from "./TeacherAttendance.module.css";
import { 
  adminUpdateTeacherAttendance, 
  adminBulkTeacherAttendance 
} from "@/backend/api/actions/dashboard/admin/teacherAttendance/actions";

export type TeacherRecordItem = {
  id: string;
  phone?: string | null;
  qualification?: string | null;
  joinDate?: Date | null;
  user: {
    id: string;
    name: string;
    email: string;
  };
  classes: { id: string; name: string; section: string }[];
  subjects: { id: string; name: string; code: string }[];
  classTeacherOf?: { id: string; name: string; section: string } | null;
  attendances: {
    id: string;
    date: Date;
    status: string;
    remarks?: string | null;
  }[];
  // Precomputed stats from server
  totalSessions: number;
  presentedDays: number;
  absentedDays: number;
  attendancePercentage: string;
  todayStatus: "PRESENT" | "LEAVE" | "NOT_MARKED";
};

export default function TeacherAttendanceClient({
  teachers,
  initialDate,
}: {
  teachers: TeacherRecordItem[];
  initialDate: string;
}) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PRESENT" | "LEAVE" | "NOT_MARKED">("ALL");
  const [selectedTeacherModal, setSelectedTeacherModal] = useState<TeacherRecordItem | null>(null);

  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("saved");

  // Local attendance mapping: teacherId -> { status, remarks }
  const [localAttendance, setLocalAttendance] = useState<Record<string, { status: string; remarks?: string }>>(() => {
    const map: Record<string, { status: string; remarks?: string }> = {};
    teachers.forEach((t) => {
      map[t.id] = {
        status: t.todayStatus,
        remarks: "",
      };
    });
    return map;
  });

  const isToday = selectedDate === new Date().toISOString().split("T")[0];

  // Dynamic Dashboard Stats based on live local state
  const totalTeachers = teachers.length;
  const todayPresentCount = useMemo(() => {
    return Object.values(localAttendance).filter((a) => a.status === "PRESENT").length;
  }, [localAttendance]);

  const todayAbsentCount = useMemo(() => {
    return Object.values(localAttendance).filter((a) => a.status === "LEAVE" || a.status === "ABSENT").length;
  }, [localAttendance]);

  const overallTodayRate = totalTeachers > 0
    ? ((todayPresentCount / totalTeachers) * 100).toFixed(1)
    : "100.0";

  // Filtered teachers list
  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        t.user.name.toLowerCase().includes(q) ||
        t.user.email.toLowerCase().includes(q) ||
        (t.qualification && t.qualification.toLowerCase().includes(q)) ||
        t.subjects.some(s => s.name.toLowerCase().includes(q));

      const curStatus = localAttendance[t.id]?.status || t.todayStatus;
      const matchesFilter = 
        statusFilter === "ALL" ? true :
        statusFilter === "PRESENT" ? curStatus === "PRESENT" :
        statusFilter === "LEAVE" ? (curStatus === "LEAVE" || curStatus === "ABSENT") :
        curStatus === "NOT_MARKED";

      return matchesSearch && matchesFilter;
    });
  }, [teachers, searchQuery, statusFilter, localAttendance]);

  // Navigate when date changes
  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    router.push(`/dashboard/admin/teacher-attendance?date=${newDate}`);
  };

  // Instant Toggle Status Handler (0ms optimistic UI + live auto-save)
  const handleToggleStatus = (teacherId: string, newStatus: "PRESENT" | "LEAVE") => {
    setLocalAttendance((prev) => ({
      ...prev,
      [teacherId]: {
        ...prev[teacherId],
        status: newStatus,
      },
    }));

    setSaveStatus("saving");

    startTransition(async () => {
      const res = await adminUpdateTeacherAttendance(teacherId, selectedDate, newStatus);
      if (res?.error) {
        setSaveStatus("error");
      } else {
        setSaveStatus("saved");
      }
    });
  };

  // Bulk Mark All Present
  const handleBulkPresent = () => {
    const nextMap: Record<string, { status: string; remarks?: string }> = {};
    const payload: { teacherId: string; date: string; status: string }[] = [];

    teachers.forEach((t) => {
      nextMap[t.id] = { status: "PRESENT", remarks: "Bulk Mark" };
      payload.push({ teacherId: t.id, date: selectedDate, status: "PRESENT" });
    });

    setLocalAttendance(nextMap);
    setSaveStatus("saving");

    startTransition(async () => {
      const res = await adminBulkTeacherAttendance(payload);
      if (res?.error) {
        setSaveStatus("error");
      } else {
        setSaveStatus("saved");
      }
    });
  };

  // Format date display
  const formatDisplayDate = (d: Date | string) => {
    try {
      return new Date(d).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return String(d);
    }
  };

  return (
    <div className={styles.container}>
      {/* Top Header & Hub Navigation */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <h1 className={styles.title}>
              <UserCheck size={28} color="var(--primary)" />
              <span>Teacher Attendance Management</span>
            </h1>
            <p className={styles.subtitle}>
              Monitor faculty presence, register live teacher attendance, and inspect individual attendance percentages.
            </p>
          </div>

          {/* Segmented Switcher for Attendance Hub */}
          <div className={styles.hubNavTabs}>
            <Link 
              href="/dashboard/admin/attendance" 
              prefetch={true} 
              className={styles.hubNavBtn}
            >
              <GraduationCap size={16} />
              <span>Student Attendance</span>
            </Link>
            <Link 
              href="/dashboard/admin/teacher-attendance" 
              prefetch={true} 
              className={`${styles.hubNavBtn} ${styles.hubNavBtnActive}`}
            >
              <UserCheck size={16} />
              <span>Teacher Attendance</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 4 Dashboard Stats Cards (Requested: Total Teachers, Present Count, Absent Count, + Attendance Rate) */}
      <div className={styles.statsGrid}>
        {/* 1. Total Teachers */}
        <div className={`${styles.statCard} ${styles.statTotal}`}>
          <div className={styles.statIcon}>
            <Users size={24} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Teachers</span>
            <span className={styles.statValue}>{totalTeachers}</span>
            <span className={styles.statSubtext}>Registered faculty members</span>
          </div>
        </div>

        {/* 2. Today Present Count */}
        <div className={`${styles.statCard} ${styles.statPresent}`}>
          <div className={styles.statIcon}>
            <CheckCircle2 size={24} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Today Present</span>
            <span className={styles.statValue}>{todayPresentCount}</span>
            <span className={styles.statSubtext}>Staff reported on duty</span>
          </div>
        </div>

        {/* 3. Today Absent Count */}
        <div className={`${styles.statCard} ${styles.statAbsent}`}>
          <div className={styles.statIcon}>
            <AlertCircle size={24} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Absent Count</span>
            <span className={styles.statValue}>{todayAbsentCount}</span>
            <span className={styles.statSubtext}>On leave or absent</span>
          </div>
        </div>

        {/* 4. Staff Attendance Rate */}
        <div className={`${styles.statCard} ${styles.statPercent}`}>
          <div className={styles.statIcon}>
            <Percent size={24} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Today Rate</span>
            <span className={styles.statValue}>{overallTodayRate}%</span>
            <span className={styles.statSubtext}>Overall staff attendance</span>
          </div>
        </div>
      </div>

      {/* Date Filter & Quick Actions Bar */}
      <div className={styles.filterBar}>
        <div className={styles.datePickerGroup}>
          <span className={styles.dateLabel}>
            <CalendarIcon size={16} color="var(--primary)" />
            <span>Attendance Date:</span>
          </span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className={styles.dateInput}
          />
          {!isToday && (
            <button
              type="button"
              onClick={() => handleDateChange(new Date().toISOString().split("T")[0])}
              className={styles.todayBtn}
            >
              Jump to Today
            </button>
          )}
        </div>

        <div className={styles.actionBtnsGroup}>
          <button
            type="button"
            onClick={handleBulkPresent}
            disabled={isPending}
            className={styles.bulkPresentBtn}
            title="Mark all registered teachers as Present for this date"
          >
            <Check size={16} />
            <span>Mark All Present</span>
          </button>

          <div className={styles.statusIndicator}>
            {saveStatus === "saving" && (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Auto-saving...</span>
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <Check size={13} color="var(--success)" />
                <span style={{ color: "var(--success)" }}>All changes saved</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Search and Status Filter Pills */}
      <div className={styles.searchFilterRow}>
        <div className={styles.searchInputWrapper}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search teacher by name, email, subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filterPills}>
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`${styles.filterPill} ${statusFilter === "ALL" ? styles.filterPillActive : ""}`}
          >
            All ({totalTeachers})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("PRESENT")}
            className={`${styles.filterPill} ${statusFilter === "PRESENT" ? styles.filterPillActive : ""}`}
          >
            Present ({todayPresentCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("LEAVE")}
            className={`${styles.filterPill} ${statusFilter === "LEAVE" ? styles.filterPillActive : ""}`}
          >
            Absent / Leave ({todayAbsentCount})
          </button>
        </div>
      </div>

      {/* Teachers Table Card */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Teacher Details</th>
                <th className={styles.th}>Assigned Subjects &amp; Classes</th>
                <th className={styles.th}>Attendance Percentage</th>
                <th className={styles.th}>Status for {formatDisplayDate(selectedDate)}</th>
                <th className={styles.th} style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeachers.map((teacher) => {
                const curStatus = localAttendance[teacher.id]?.status || teacher.todayStatus;
                const isPresent = curStatus === "PRESENT";
                const isLeave = curStatus === "LEAVE" || curStatus === "ABSENT";
                const pctNum = parseFloat(teacher.attendancePercentage);

                const pctClass = 
                  pctNum >= 85 ? styles.pctHigh :
                  pctNum >= 70 ? styles.pctMedium : styles.pctLow;

                return (
                  <tr key={teacher.id} className={styles.tr}>
                    {/* 1. Teacher Profile & Clickable Name */}
                    <td className={styles.td}>
                      <div 
                        className={styles.teacherIdentity}
                        onClick={() => setSelectedTeacherModal(teacher)}
                        title={`Click to view ${teacher.user.name}'s attendance percentage`}
                      >
                        <div className={styles.avatar}>
                          {teacher.user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className={styles.teacherNames}>
                          <span className={styles.teacherName}>{teacher.user.name}</span>
                          <span className={styles.teacherEmail}>{teacher.user.email}</span>
                          {teacher.qualification && (
                            <span style={{ fontSize: "0.725rem", color: "var(--text-secondary)", opacity: 0.85 }}>
                              {teacher.qualification}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 2. Subjects & Classes */}
                    <td className={styles.td}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                        {teacher.subjects.length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                            {teacher.subjects.map((sub) => (
                              <span 
                                key={sub.id} 
                                style={{ 
                                  fontSize: "0.75rem", 
                                  padding: "2px 6px", 
                                  borderRadius: "6px", 
                                  background: "rgba(99, 102, 241, 0.12)", 
                                  color: "var(--primary)",
                                  fontWeight: 600
                                }}
                              >
                                {sub.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                            No subjects assigned
                          </span>
                        )}

                        {teacher.classTeacherOf && (
                          <span style={{ fontSize: "0.725rem", color: "var(--success)", fontWeight: 600 }}>
                            Class Teacher: {teacher.classTeacherOf.name} - {teacher.classTeacherOf.section}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 3. Teacher Attendance Percentage Badge (Clickable) */}
                    <td className={styles.td}>
                      <button
                        type="button"
                        onClick={() => setSelectedTeacherModal(teacher)}
                        className={`${styles.pctPill} ${pctClass}`}
                        title="Click to view full attendance percentage report"
                      >
                        <Award size={13} />
                        <span>{teacher.attendancePercentage}%</span>
                      </button>
                    </td>

                    {/* 4. Live Toggle Status Pills (Auto-registers on click) */}
                    <td className={styles.td}>
                      <div className={styles.statusToggleGroup}>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(teacher.id, "PRESENT")}
                          className={`${styles.statusPillBtn} ${isPresent ? styles.pillPresentActive : ""}`}
                          title="Register Present"
                        >
                          <CheckCircle2 size={13} />
                          <span>Present</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleStatus(teacher.id, "LEAVE")}
                          className={`${styles.statusPillBtn} ${isLeave ? styles.pillLeaveActive : ""}`}
                          title="Register Leave / Absent"
                        >
                          <AlertCircle size={13} />
                          <span>Leave / Absent</span>
                        </button>
                      </div>
                    </td>

                    {/* 5. View Details Action */}
                    <td className={styles.td} style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => setSelectedTeacherModal(teacher)}
                        className={styles.viewDetailsBtn}
                      >
                        <span>View %</span>
                        <ArrowRight size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredTeachers.length === 0 && (
          <div className={styles.emptyState}>
            <Users size={40} style={{ opacity: 0.3, margin: "0 auto 0.5rem" }} />
            <p style={{ margin: 0, fontWeight: 600 }}>No teachers match your search criteria.</p>
            <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", opacity: 0.7 }}>
              Try adjusting the search query or filter.
            </p>
          </div>
        )}
      </div>

      {/* INDIVIDUAL TEACHER ATTENDANCE MODAL (Requested: click one teacher to view attendance percentage) */}
      {selectedTeacherModal && (
        <div className={styles.modalBackdrop} onClick={() => setSelectedTeacherModal(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <div className={styles.avatar}>
                  {selectedTeacherModal.user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--foreground)" }}>
                    {selectedTeacherModal.user.name}
                  </h3>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    Faculty Attendance Profile &amp; Percentage
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTeacherModal(null)}
                className={styles.closeBtn}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className={styles.modalBody}>
              {/* Hero Attendance Percentage Card */}
              <div className={styles.percentageHeroCard}>
                <div className={styles.heroPctGroup}>
                  <span className={styles.heroPctLabel}>Overall Attendance</span>
                  <span className={styles.heroPctValue}>
                    {selectedTeacherModal.attendancePercentage}%
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    Based on {selectedTeacherModal.totalSessions} total recorded academic sessions
                  </span>
                </div>

                <div className={styles.heroMetricsGrid}>
                  <div className={styles.heroMetricBox}>
                    <span className={styles.heroMetricBoxLabel}>Total Days</span>
                    <span className={styles.heroMetricBoxValue}>
                      {selectedTeacherModal.totalSessions}
                    </span>
                  </div>
                  <div className={styles.heroMetricBox}>
                    <span className={styles.heroMetricBoxLabel} style={{ color: "var(--success)" }}>
                      Present
                    </span>
                    <span className={styles.heroMetricBoxValue} style={{ color: "var(--success)" }}>
                      {selectedTeacherModal.presentedDays}
                    </span>
                  </div>
                  <div className={styles.heroMetricBox}>
                    <span className={styles.heroMetricBoxLabel} style={{ color: "#ef4444" }}>
                      Absent / Leave
                    </span>
                    <span className={styles.heroMetricBoxValue} style={{ color: "#ef4444" }}>
                      {selectedTeacherModal.absentedDays}
                    </span>
                  </div>
                </div>
              </div>

              {/* Faculty Contact & Role Meta */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
                <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                    <Mail size={13} />
                    <span>Email Address</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--foreground)", marginTop: "0.2rem" }}>
                    {selectedTeacherModal.user.email}
                  </div>
                </div>

                {selectedTeacherModal.phone && (
                  <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                      <Phone size={13} />
                      <span>Phone Number</span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--foreground)", marginTop: "0.2rem" }}>
                      {selectedTeacherModal.phone}
                    </div>
                  </div>
                )}
              </div>

              {/* Attendance Log History for this Teacher */}
              <div>
                <h4 className={styles.historySectionTitle}>
                  <Clock size={16} color="var(--primary)" />
                  <span>Recent Recorded Sessions</span>
                </h4>
                
                <div className={styles.historyList} style={{ marginTop: "0.6rem" }}>
                  {selectedTeacherModal.attendances.length > 0 ? (
                    selectedTeacherModal.attendances.map((att) => {
                      const isAttPresent = att.status === "PRESENT";
                      return (
                        <div key={att.id} className={styles.historyItem}>
                          <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
                            {formatDisplayDate(att.date)}
                          </span>

                          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                            {att.remarks && (
                              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                                {att.remarks}
                              </span>
                            )}
                            <span 
                              style={{ 
                                padding: "2px 8px", 
                                borderRadius: "12px", 
                                fontSize: "0.75rem", 
                                fontWeight: 700,
                                background: isAttPresent ? "var(--success-bg)" : "rgba(239, 68, 68, 0.12)",
                                color: isAttPresent ? "var(--success)" : "#ef4444",
                                border: isAttPresent ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)"
                              }}
                            >
                              {isAttPresent ? "Present" : "Leave / Absent"}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: "1.25rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                      No attendance sessions recorded yet for this teacher.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
