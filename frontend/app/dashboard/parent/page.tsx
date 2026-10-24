import { getParentAndSelectedChild } from "./parentChildHelper";
import { prisma } from "@/backend/db/prisma";
import styles from "./ParentDashboard.module.css";
import { 
  Percent, CheckCircle2, AlertCircle, CalendarCheck, 
  GraduationCap, BookOpen, ArrowRight, CalendarDays 
} from "lucide-react";
import ParentChildBanner from "./ParentChildBanner";
import Link from "next/link";
import ExamClassPerformancePieChart from "./ExamClassPerformancePieChart";

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

  // 1. Fetch selected student's attendance records and the latest class exam with marks
  const [attendanceRecords, lastExamWithMarks] = await Promise.all([
    prisma.attendance.findMany({
      where: { studentId: selectedChild.id },
      orderBy: { date: 'desc' },
      take: 60
    }),
    selectedChild.classId ? (
      await prisma.exam.findFirst({
        where: { 
          classId: selectedChild.classId,
          marks: { some: {} }
        },
        orderBy: { date: 'desc' },
        include: {
          marks: {
            include: { subject: true, student: true }
          }
        }
      }) || await prisma.exam.findFirst({
        where: { classId: selectedChild.classId },
        orderBy: { date: 'desc' },
        include: {
          marks: {
            include: { subject: true, student: true }
          }
        }
      })
    ) : Promise.resolve(null)
  ]);

  const childClass = selectedChild.class;

  // 2. Compute student attendance statistics
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

  // 3. Compute last test mark calculation & class overall percentage
  let hasExamData = false;
  let classOverallPercentage = 0;
  let totalStudentsAppeared = 0;
  let passedStudents = 0;
  let failedStudents = 0;
  let passRatePercentage = 0;
  let childPercentage: number | null = null;
  let childScore = 0;
  let childMaxScore = 0;
  let examName = "";
  let examDate = "";
  const subjectBreakdown: { name: string; avgPercentage: number }[] = [];

  if (lastExamWithMarks) {
    examName = lastExamWithMarks.name;
    try {
      examDate = new Date(lastExamWithMarks.date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    } catch {
      examDate = new Date(lastExamWithMarks.date).toLocaleDateString();
    }

    if (lastExamWithMarks.marks.length > 0) {
      hasExamData = true;

      // Total class score vs max score
      const classTotalScore = lastExamWithMarks.marks.reduce((acc, m) => acc + m.score, 0);
      const classTotalMax = lastExamWithMarks.marks.reduce((acc, m) => acc + m.maxScore, 0);
      classOverallPercentage = classTotalMax > 0 
        ? Number(((classTotalScore / classTotalMax) * 100).toFixed(1)) 
        : 0;

      // Group by student for pass/fail calculation
      const studentMap = new Map<string, { score: number; maxScore: number }>();
      lastExamWithMarks.marks.forEach(m => {
        const cur = studentMap.get(m.studentId) || { score: 0, maxScore: 0 };
        cur.score += m.score;
        cur.maxScore += m.maxScore;
        studentMap.set(m.studentId, cur);
      });

      totalStudentsAppeared = studentMap.size;
      studentMap.forEach(s => {
        const pct = s.maxScore > 0 ? (s.score / s.maxScore) * 100 : 0;
        if (pct >= 40) {
          passedStudents++;
        } else {
          failedStudents++;
        }
      });

      passRatePercentage = totalStudentsAppeared > 0 
        ? Number(((passedStudents / totalStudentsAppeared) * 100).toFixed(1)) 
        : 0;

      // Child's specific score on this test
      const childMarks = lastExamWithMarks.marks.filter(m => m.studentId === selectedChild.id);
      if (childMarks.length > 0) {
        childScore = childMarks.reduce((acc, m) => acc + m.score, 0);
        childMaxScore = childMarks.reduce((acc, m) => acc + m.maxScore, 0);
        childPercentage = childMaxScore > 0 
          ? Number(((childScore / childMaxScore) * 100).toFixed(1)) 
          : 0;
      }

      // Subject performance breakdown
      const subjectMap = new Map<string, { name: string; score: number; maxScore: number }>();
      lastExamWithMarks.marks.forEach(m => {
        const cur = subjectMap.get(m.subjectId) || { name: m.subject.name, score: 0, maxScore: 0 };
        cur.score += m.score;
        cur.maxScore += m.maxScore;
        subjectMap.set(m.subjectId, cur);
      });

      subjectMap.forEach(sub => {
        const pct = sub.maxScore > 0 ? Number(((sub.score / sub.maxScore) * 100).toFixed(1)) : 0;
        subjectBreakdown.push({ name: sub.name, avgPercentage: pct });
      });
    }
  }

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

      {/* 5 Stats Cards Grid: Percentage, Presented Days, Absented Days, Class Details, Total Subjects */}
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

        {/* 5. Total Subjects (Replaced timetable option as requested) */}
        <Link 
          href={`/dashboard/parent/classes?childId=${selectedChild.id}`} 
          prefetch={true} 
          className={`${styles.statCard} ${styles.statSubjects}`}
        >
          <div className={styles.statIcon}>
            <BookOpen size={22} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Subjects</span>
            <span className={styles.statValue}>
              {childClass?.subjects ? `${childClass.subjects.length} Subjects` : "0 Subjects"}
            </span>
            <span className={styles.statSubtext}>Curriculum subjects</span>
          </div>
        </Link>
      </div>

      {/* Exam Overall Percentage (Last Test Mark Calculation with Pie Chart) */}
      <ExamClassPerformancePieChart
        hasExamData={hasExamData}
        examName={examName}
        examDate={examDate}
        classNameStr={childClass ? `${childClass.name} - ${childClass.section}` : "Class"}
        classOverallPercentage={classOverallPercentage}
        totalStudentsAppeared={totalStudentsAppeared}
        passedStudents={passedStudents}
        failedStudents={failedStudents}
        passRatePercentage={passRatePercentage}
        childPercentage={childPercentage}
        childScore={childScore}
        childMaxScore={childMaxScore}
        childName={selectedChild.firstName}
        childId={selectedChild.id}
        subjectBreakdown={subjectBreakdown}
      />

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
