import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../dashboard.module.css";
import { Users, GraduationCap, BookOpen, Briefcase, Mail, Phone, CheckCircle2, XCircle } from "lucide-react";
import ClassSelector from "./ClassSelector";
import PassFailChart from "./PassFailChart";
import EditClassModal from "./EditClassModal";
import Link from "next/link";

import { Student, Attendance, Parent, User, Teacher } from "@prisma/client";

type StudentWithRelations = Student & {
  parents: { parent: Parent & { user: User } }[];
  attendances: Attendance[];
};

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") return null;

  const resolvedSearchParams = await searchParams;

  const [totalStudents, totalTeachers, totalParents, totalClasses, uniqueSubjects, classes] = await Promise.all([
    prisma.student.count({ where: { isActive: true } }),
    prisma.teacher.count({ where: { isActive: true } }),
    prisma.parent.count({ where: { isActive: true } }),
    prisma.class.count({ where: { isActive: true } }),
    prisma.subject.findMany({ distinct: ['name'], select: { name: true } }),
    prisma.class.findMany({
      where: { isActive: true },
      select: { id: true, name: true, section: true },
      orderBy: [{ name: 'asc' }, { section: 'asc' }]
    })
  ]);

  const totalSubjects = uniqueSubjects.length;

  let selectedClassData = null;
  let studentsData: StudentWithRelations[] = [];
  let teachersData: (Teacher & { user: User })[] = [];
  let passFailStats = null;
  const attendanceStats = { present: 0, absent: 0, total: 0 };
  let sectionCount = 0;

  if (resolvedSearchParams.classId) {
    const classId = resolvedSearchParams.classId;

    selectedClassData = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        teacher: {
          include: { user: true, subjects: true }
        }
      }
    });

    if (selectedClassData) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [sectionCountRes, studentsDataRes, teachersDataRes, todaysAttendancesRes, marksRes] = await Promise.all([
        prisma.class.count({ where: { name: selectedClassData.name, isActive: true } }),
        prisma.student.findMany({
          where: { classId, isActive: true },
          include: {
            parents: { include: { parent: { include: { user: true } } } },
            attendances: true
          }
        }),
        prisma.teacher.findMany({
          where: { isActive: true },
          include: { user: true },
          orderBy: { user: { name: 'asc' } }
        }),
        prisma.attendance.findMany({
          where: {
            student: { classId },
            date: { gte: today, lt: tomorrow }
          }
        }),
        prisma.mark.findMany({
          where: { student: { classId } },
        })
      ]);

      sectionCount = sectionCountRes;
      studentsData = studentsDataRes;
      teachersData = teachersDataRes;
      const todaysAttendances = todaysAttendancesRes;
      const marks = marksRes;

      attendanceStats.total = studentsData.length;
      todaysAttendances.forEach(att => {
        if (att.status === 'PRESENT') attendanceStats.present++;
        if (att.status === 'ABSENT' || att.status === 'LEAVE') attendanceStats.absent++;
      });

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
      </div>

      <div style={{ marginTop: "2rem", display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "1rem" }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
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
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Total Sections for {selectedClassData.name}</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>{sectionCount}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Today&apos;s Attendance</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                {attendanceStats.present} <span style={{fontSize:'1rem', color: "var(--success)"}}>Present</span> / {attendanceStats.absent} <span style={{fontSize:'1rem', color: "var(--danger)"}}>Absent</span>
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
            {/* Class Teacher Card */}
            {selectedClassData.teacher && (
              <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Briefcase size={20} className="text-indigo-500" />
                  Class Teacher Profile
                </h3>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                  <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', color: 'var(--primary)' }}>
                    {selectedClassData.teacher.user.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{selectedClassData.teacher.user.name}</h4>
                    <p style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <Mail size={16} /> {selectedClassData.teacher.user.email}
                    </p>
                    {selectedClassData.teacher.phone && (
                      <p style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <Phone size={16} /> {selectedClassData.teacher.phone}
                      </p>
                    )}
                  </div>
                  <Link href={`/dashboard/admin/teachers?id=${selectedClassData.teacher.id}`} style={{ padding: '0.5rem 1rem', background: "var(--primary)", color: "var(--primary-fg)", borderRadius: '6px', textDecoration: 'none', fontSize: '0.875rem' }}>
                    View Teacher Details
                  </Link>
                </div>
              </div>
            )}

            {/* Test Overview Chart */}
            <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Test Performance Overview</h3>
              <div style={{ height: '200px' }}>
                <PassFailChart data={passFailStats} />
              </div>
            </div>
          </div>

          {/* Student Table */}
          <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Students in {selectedClassData.name} - {selectedClassData.section}</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>Roll No.</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>Name</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>Parent Name</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>Parent Phone</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>Attendance %</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {studentsData.map(student => {
                    const totalDays = student.attendances.length;
                    const presentDays = student.attendances.filter((a) => a.status === 'PRESENT').length;
                    const attPercent = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;
                    
                    const parent = student.parents[0]?.parent;

                    return (
                      <tr key={student.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem' }}>{student.rollNumber}</td>
                        <td style={{ padding: '0.75rem', fontWeight: 500 }}>
                          <Link href={`/dashboard/admin/students?id=${student.id}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                            {student.firstName} {student.lastName}
                          </Link>
                        </td>
                        <td style={{ padding: '0.75rem' }}>{parent?.user.name || '-'}</td>
                        <td style={{ padding: '0.75rem' }}>{parent?.phone || '-'}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ color: attPercent >= 75 ? "var(--success)" : attPercent >= 60 ? "var(--warning)" : "var(--danger)" }}>
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
