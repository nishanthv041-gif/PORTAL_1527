import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../dashboard.module.css";
import { Users, GraduationCap, BookOpen, Briefcase, Mail, Phone, CheckCircle2, XCircle, UserCheck } from "lucide-react";
import ClassSelector from "./ClassSelector";
import PassFailChart from "./PassFailChart";
import EditClassModal from "./EditClassModal";
import Link from "next/link";

import { Student, Attendance, Parent, User, Teacher, Class, Subject } from "@prisma/client";

type SelectedClassType = (Class & {
  teacher: (Teacher & { user: User; subjects: Subject[] }) | null;
}) | null;

type StudentWithRelations = Student & {
  parents: { parent: Parent & { user: User } }[];
  attendances: { status: string }[];
};

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") return null;

  const resolvedSearchParams = await searchParams;

  const [totalStudents, totalTeachers, parentRecordCount, parentUserCount, totalClasses, uniqueSubjects, classes] = await Promise.all([
    prisma.student.count({ where: { isActive: true } }),
    prisma.teacher.count({ where: { isActive: true } }),
    prisma.parent.count({ where: { isActive: true } }),
    prisma.user.count({ where: { role: 'PARENT', status: 'ACTIVE' } }),
    prisma.class.count({ where: { isActive: true } }),
    prisma.subject.findMany({ distinct: ['name'], select: { name: true } }),
    prisma.class.findMany({
      where: { isActive: true },
      select: { id: true, name: true, section: true },
      orderBy: [{ name: 'asc' }, { section: 'asc' }]
    })
  ]);

  const totalParents = Math.max(parentRecordCount, parentUserCount);

  const totalSubjects = uniqueSubjects.length;

  let selectedClassData: SelectedClassType = null;
  let studentsData: StudentWithRelations[] = [];
  let teachersData: (Teacher & { user: User })[] = [];
  let passFailStats = null;
  const attendanceStats = { present: 0, absent: 0, total: 0 };
  let sectionCount = 0;
  let classParentsCount = 0;

  if (resolvedSearchParams.classId) {
    const classId = resolvedSearchParams.classId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Fetch class details and related stats simultaneously in parallel
    const [selectedClassDataRes, studentsDataRes, teachersDataRes, todaysAttendancesRes, marksRes] = await Promise.all([
      prisma.class.findUnique({
        where: { id: classId },
        include: {
          teacher: {
            include: { user: true, subjects: true }
          }
        }
      }),
      prisma.student.findMany({
        where: { classId, isActive: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        include: {
          parents: { include: { parent: { include: { user: true } } } },
          attendances: { select: { status: true } }
        }
      }),
      prisma.teacher.findMany({
        where: { isActive: true },
        include: { user: true },
        orderBy: { user: { name: 'asc' } }
      }),
      prisma.attendance.findMany({
        where: {
          OR: [
            { classId },
            { student: { classId } }
          ],
          date: { gte: today, lt: tomorrow }
        },
        select: { status: true }
      }),
      prisma.mark.findMany({
        where: { student: { classId } },
        select: { studentId: true, examId: true, score: true, maxScore: true }
      })
    ]);

    selectedClassData = selectedClassDataRes;

    if (selectedClassData) {
      const targetClassName = selectedClassData.name;
      // Calculate section count from already fetched in-memory classes list (0ms DB cost)
      sectionCount = classes.filter(c => c.name === targetClassName).length;
      studentsData = studentsDataRes;
      teachersData = teachersDataRes;
      const todaysAttendances = todaysAttendancesRes;
      const marks = marksRes;

      attendanceStats.total = studentsData.length;
      todaysAttendances.forEach(att => {
        if (att.status === 'PRESENT' || att.status === 'LATE') attendanceStats.present++;
        if (att.status === 'ABSENT' || att.status === 'LEAVE') attendanceStats.absent++;
      });

      const classParentsSet = new Set<string>();
      studentsData.forEach(s => {
        s.parents.forEach(p => {
          if (p.parent?.id) classParentsSet.add(p.parent.id);
        });
      });
      classParentsCount = classParentsSet.size;

      let passCount = 0;
      let failCount = 0;

      const studentExams = new Map();
      marks.forEach(m => {
        const key = `${m.studentId}-${m.examId}`;
        if (!studentExams.has(key)) studentExams.set(key, { total: 0, max: 0 });
        const curr = studentExams.get(key);
        curr.total += m.score;
        curr.max += m.maxScore;
      });

      studentExams.forEach((val) => {
        const percent = (val.total / val.max) * 100;
        if (percent >= 40) passCount++;
        else failCount++;
      });

      passFailStats = [
        { name: 'Pass', value: passCount, color: "var(--success)" },
        { name: 'Fail', value: failCount, color: "var(--danger)" }
      ];
    }
  }

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Admin Dashboard</h1>

      <div className={styles.statsGrid}>
        <Link href="/dashboard/admin/students" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ backgroundColor: "var(--primary-bg)", color: "var(--primary)" }}>
              <Users size={24} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Total Students</span>
              <span className={styles.statValue}>{totalStudents}</span>
            </div>
          </div>
        </Link>
        <Link href="/dashboard/admin/teachers" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ backgroundColor: "var(--success-bg)", color: "var(--success)" }}>
              <Briefcase size={24} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Total Teachers</span>
              <span className={styles.statValue}>{totalTeachers}</span>
            </div>
          </div>
        </Link>
        <Link href="/dashboard/admin/parents" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ backgroundColor: "var(--warning-bg)", color: "var(--warning)" }}>
              <Users size={24} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Total Parents</span>
              <span className={styles.statValue}>{totalParents}</span>
            </div>
          </div>
        </Link>
        <Link href="/dashboard/admin/classes" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ backgroundColor: "rgba(139, 92, 246, 0.1)", color: "#8b5cf6" }}>
              <GraduationCap size={24} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Total Classes</span>
              <span className={styles.statValue}>{totalClasses}</span>
            </div>
          </div>
        </Link>
        <Link href="/dashboard/admin/subjects" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ backgroundColor: "rgba(236, 72, 153, 0.1)", color: "#ec4899" }}>
              <BookOpen size={24} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Total Subjects</span>
              <span className={styles.statValue}>{totalSubjects}</span>
            </div>
          </div>
        </Link>
        <Link href="/dashboard/admin/teacher-attendance" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ backgroundColor: "var(--success-bg)", color: "var(--success)" }}>
              <UserCheck size={24} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Teacher Attendance</span>
              <span className={styles.statValue}>Manage</span>
            </div>
          </div>
        </Link>
      </div>

      <div style={{ marginTop: "2rem", display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>Class Overview</h2>
        {selectedClassData && (
          <EditClassModal classData={selectedClassData} teachers={teachersData} />
        )}
      </div>
      <div style={{ marginBottom: "2rem" }}>
        <ClassSelector classes={classes} />
      </div>

      {selectedClassData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Class Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem', background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Class Name</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>{selectedClassData.name}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Section</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>{selectedClassData.section}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Total Strength</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>{studentsData.length}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Class Parents</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--primary)' }}>{classParentsCount}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Total Sections for {selectedClassData.name}</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>{sectionCount}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Today&apos;s Attendance</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                {attendanceStats.present} <span style={{ fontSize: '1rem', color: "var(--success)" }}>Present</span> / {attendanceStats.absent} <span style={{ fontSize: '1rem', color: "var(--danger)" }}>Absent</span>
              </p>
            </div>
          </div>

          <div className={styles.chartsContainer}>
            {/* Class Teacher Card */}
            {selectedClassData.teacher && (
              <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)', minWidth: 0, width: '100%', boxSizing: 'border-box' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Briefcase size={20} className="text-indigo-500" />
                  Class Teacher Profile
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', alignItems: 'center' }}>
                  <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: 'var(--primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', color: 'var(--primary)', flexShrink: 0 }}>
                    {selectedClassData.teacher.user.name.charAt(0)}
                  </div>
                  <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <h4 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, overflowWrap: 'anywhere' }}>{selectedClassData.teacher.user.name}</h4>
                    <p style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem', marginBottom: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
                      <Mail size={16} style={{ flexShrink: 0 }} />
                      <span style={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-all' }}>{selectedClassData.teacher.user.email}</span>
                    </p>
                    {selectedClassData.teacher.phone && (
                      <p style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem', marginBottom: 0, minWidth: 0 }}>
                        <Phone size={16} style={{ flexShrink: 0 }} />
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{selectedClassData.teacher.phone}</span>
                      </p>
                    )}
                  </div>
                  <Link href={`/dashboard/admin/teachers?id=${selectedClassData.teacher.id}`} style={{ padding: '0.5rem 1rem', background: "var(--primary)", color: "var(--primary-fg)", borderRadius: '6px', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    View Teacher Details
                  </Link>
                </div>
              </div>
            )}

            {/* Test Overview Chart */}
            <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)', minWidth: 0, width: '100%', boxSizing: 'border-box' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Test Performance Overview</h3>
              <div style={{ height: '200px', minWidth: 0 }}>
                <PassFailChart data={passFailStats} />
              </div>
            </div>
          </div>

          {/* Student Table */}
          <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)', minWidth: 0, width: '100%', boxSizing: 'border-box' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', overflowWrap: 'anywhere' }}>Students in {selectedClassData.name} - {selectedClassData.section}</h3>
            <div style={{ width: '100%', maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Roll No.</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Name</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Linked Parent(s)</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Parent Contact</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Attendance %</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {studentsData.map(student => {
                    const totalDays = student.attendances.length;
                    const presentDays = student.attendances.filter((a) => a.status === 'PRESENT').length;
                    const attPercent = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

                    return (
                      <tr key={student.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem' }}>{student.rollNumber}</td>
                        <td style={{ padding: '0.75rem', fontWeight: 500 }}>
                          <Link href={`/dashboard/admin/students?id=${student.id}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                            {student.firstName} {student.lastName}
                          </Link>
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          {student.parents.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                              {student.parents.map((ps, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ps.parent.user.name}</span>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>({ps.parent.user.email})</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No parent linked</span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          {student.parents.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                              {student.parents.map((ps, idx) => (
                                <div key={idx} style={{ fontSize: '0.85rem' }}>
                                  {ps.parent.phone ? (
                                    <span>{ps.parent.phone}</span>
                                  ) : (
                                    <span style={{ color: 'var(--text-secondary)' }}>-</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)' }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ color: attPercent >= 75 ? "var(--success)" : attPercent >= 60 ? "var(--warning)" : "var(--danger)", fontWeight: 600 }}>
                            {attPercent}%
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          {student.isActive ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: "var(--success)", fontSize: '0.875rem', background: 'var(--success-bg)', padding: '0.25rem 0.5rem', borderRadius: '999px' }}>
                              <CheckCircle2 size={14} /> Active
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: "var(--danger)", fontSize: '0.875rem', background: 'var(--danger-bg)', padding: '0.25rem 0.5rem', borderRadius: '999px' }}>
                              <XCircle size={14} /> Inactive
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {studentsData.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No students found in this class.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
