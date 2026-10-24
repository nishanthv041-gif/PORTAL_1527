import { getParentAndSelectedChild } from "./parentChildHelper";
import { prisma } from "@/backend/db/prisma";
import styles from "./ParentDashboard.module.css";
import { 
  Percent, CheckCircle2, AlertCircle, CalendarCheck, 
  GraduationCap, Clock, ArrowRight, CalendarDays 
} from "lucide-react";
import ParentChildBanner from "./ParentChildBanner";
import Link from "next/link";

export default async function ParentDashboard({
  searchParams
}: {
  searchParams: Promise<{ childId?: string }>
}) {
  const resolvedSearchParams = await searchParams;
  const { parent, children, selectedChild } = await getParentAndSelectedChild(resolvedSearchParams?.childId);

  if (!parent || children.length === 0) {
    return (
      <div className={styles.container}>
        <h1 className={styles.pageTitle}>Parent Dashboard</h1>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No children linked to your parent account.</p>
        </div>
      </div>
    );
  }

  if (!selectedChild) return null;

  // Fetch selected student's attendance records and daily timetable
  const [attendanceRecords, timetableToday] = await Promise.all([
    prisma.attendance.findMany({
      where: { studentId: selectedChild.id },
      orderBy: { date: 'desc' },
      take: 60
    }),
    selectedChild.classId ? prisma.timetable.findMany({
      where: { classId: selectedChild.classId },
      include: { subject: true },
      take: 4
    }) : Promise.resolve([])
  ]);

  const childClass = selectedChild.class;

  // Compute student-specific statistics
  const totalSessions = attendanceRecords.length;
  const presentedDays = attendanceRecords.filter((a) => a.status === "PRESENT").length;
  const absentedDays = attendanceRecords.filter((a) => a.status === "ABSENT" || a.status === "LEAVE").length;
  const attendancePercentage = totalSessions > 0
    ? ((presentedDays / totalSessions) * 100).toFixed(1)
    : "100.0";

  // Recent attendance entries (last 5 recorded days)
  const recentAttendance = attendanceRecords.slice(0, 5);

  const formatDisplayDate = (d: Date) => {
    try {
      return new Date(d).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return new Date(d).toLocaleDateString();
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>Parent Dashboard</h1>
          <p className={styles.pageSubtitle}>
            Viewing academic records for <strong>{selectedChild.firstName} {selectedChild.lastName}</strong>
          </p>
        </div>
      </div>

      {/* Child Profile Banner with Multi-Child Switcher (viewable only for parents with 2+ children) */}
      <ParentChildBanner 
        selectedChild={selectedChild} 
        studentList={children} 
        activePage="dashboard" 
      />

      {/* 5 Stats Cards Grid: Percentage, Presented Days, Absented Days, Class Details, Timetable */}
      <div className={styles.statsGrid}>
        {/* 1. Student Attendance Percentage */}
        <Link 
          href={`/dashboard/parent/attendance?childId=${selectedChild.id}`} 
          prefetch={true} 
          className={`${styles.statCard} ${styles.statPercentage}`}
        >
          <div className={styles.statIcon}>
            <Percent size={22} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Attendance %</span>
            <span className={styles.statValue}>{attendancePercentage}%</span>
            <span className={styles.statSubtext}>Based on recorded sessions</span>
          </div>
        </Link>

        {/* 2. Total Presented Days */}
        <Link 
          href={`/dashboard/parent/attendance?childId=${selectedChild.id}`} 
          prefetch={true} 
          className={`${styles.statCard} ${styles.statPresent}`}
        >
          <div className={styles.statIcon}>
            <CheckCircle2 size={22} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Presented Days</span>
            <span className={styles.statValue}>{presentedDays} Days</span>
            <span className={styles.statSubtext}>Attended school sessions</span>
          </div>
        </Link>

        {/* 3. Absented Days */}
        <Link 
          href={`/dashboard/parent/attendance?childId=${selectedChild.id}`} 
          prefetch={true} 
          className={`${styles.statCard} ${styles.statAbsent}`}
        >
          <div className={styles.statIcon}>
            <AlertCircle size={22} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Absented Days</span>
            <span className={styles.statValue}>{absentedDays} Days</span>
            <span className={styles.statSubtext}>Approved leaves &amp; absences</span>
          </div>
        </Link>

        {/* 4. Enrolled Class (Class Details) */}
        <Link 
          href={`/dashboard/parent/classes?childId=${selectedChild.id}`} 
          prefetch={true} 
          className={`${styles.statCard} ${styles.statClass}`}
        >
          <div className={styles.statIcon}>
            <GraduationCap size={22} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Class Details</span>
            <span className={styles.statValue}>
              {childClass ? `${childClass.name} - ${childClass.section}` : "N/A"}
            </span>
            <span className={styles.statSubtext}>
              {childClass?.subjects ? `${childClass.subjects.length} Subjects • View Class` : "View Class Details"}
            </span>
          </div>
        </Link>

        {/* 5. Class Timetable */}
        <Link 
          href={`/dashboard/parent/timetable?childId=${selectedChild.id}`} 
          prefetch={true} 
          className={`${styles.statCard} ${styles.statTimetable}`}
        >
          <div className={styles.statIcon}>
            <Clock size={22} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Class Timetable</span>
            <span className={styles.statValue}>
              {timetableToday.length > 0 ? `${timetableToday.length} Periods` : "View Schedule"}
            </span>
            <span className={styles.statSubtext}>Daily periods &amp; timing</span>
          </div>
        </Link>
      </div>

      {/* Recent Attendance Section with direct View Attendance action */}
      <div className={styles.recentAttendanceCard}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitleGroup}>
            <h3 className={styles.sectionTitle}>
              <CalendarDays size={20} color="var(--primary)" />
              Recent Attendance
            </h3>
            <p className={styles.sectionSubtext}>
              Latest recorded school attendance for <strong>{selectedChild.firstName} {selectedChild.lastName}</strong>
            </p>
          </div>

          <Link 
            href={`/dashboard/parent/attendance?childId=${selectedChild.id}`}
            prefetch={true}
            className={styles.viewAttendanceBtn}
          >
            <span>View Full Attendance</span>
            <ArrowRight size={15} />
          </Link>
        </div>

        {recentAttendance.length > 0 ? (
          <div className={styles.attendanceTableWrapper}>
            <table className={styles.attendanceTable}>
              <thead>
                <tr>
                  <th className={styles.thDate}>Date</th>
                  <th className={styles.thStatus}>Status</th>
                  <th className={styles.thRemarks}>Remarks / Notes</th>
                </tr>
              </thead>
              <tbody>
                {recentAttendance.map((record) => {
                  const isPresent = record.status === "PRESENT";
                  const isLeave = record.status === "LEAVE" || record.status === "ABSENT";

                  return (
                    <tr key={record.id} className={styles.tableRow}>
                      <td className={styles.tdDate}>
                        {formatDisplayDate(record.date)}
                      </td>

                      <td className={styles.tdStatus}>
                        {isPresent && (
                          <span className={styles.badgePresent}>
                            <CheckCircle2 size={13} />
                            Present
                          </span>
                        )}
                        {isLeave && (
                          <span className={styles.badgeLeave}>
                            <CalendarCheck size={13} />
                            Leave / Absent
                          </span>
                        )}
                        {!isPresent && !isLeave && (
                          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                            {record.status}
                          </span>
                        )}
                      </td>

                      <td className={styles.tdRemarks}>
                        {record.remarks || (isPresent ? "Regular class attendance" : "Reported leave / absent")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <CalendarDays size={36} style={{ opacity: 0.3, margin: "0 auto 0.5rem" }} />
            <p style={{ margin: 0, fontWeight: 500 }}>No attendance records recorded yet.</p>
            <p style={{ margin: "0.25rem 0 1rem 0", fontSize: "0.85rem", opacity: 0.7 }}>
              Attendance will be updated as the Class Teacher registers daily attendance.
            </p>
            <Link 
              href={`/dashboard/parent/attendance?childId=${selectedChild.id}`} 
              prefetch={true}
              className={styles.viewAttendanceBtn}
              style={{ display: "inline-flex" }}
            >
              <span>Open Attendance Page</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
