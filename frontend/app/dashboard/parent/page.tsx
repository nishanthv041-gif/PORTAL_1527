import { getParentAndSelectedChild } from "./parentChildHelper";
import { prisma } from "@/backend/db/prisma";
import styles from "../dashboard.module.css";
import { 
  BookOpen, Calendar, Bell, FileText, 
  GraduationCap, Clock, Building2, Home 
} from "lucide-react";
import ChildSwitcher from "./ChildSwitcher";
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
      <div className={styles.dashboard}>
        <h1 className={styles.title}>Parent Dashboard</h1>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No children linked to your parent account.</p>
        </div>
      </div>
    );
  }

  if (!selectedChild) return null;

  // Fetch data for selected child
  const [attendance, assignments, reportCards, timetableToday] = await Promise.all([
    prisma.attendance.findMany({
      where: { studentId: selectedChild.id },
      orderBy: { date: 'desc' },
      take: 5
    }),
    prisma.submission.findMany({
      where: { studentId: selectedChild.id },
      include: { assignment: true },
      orderBy: { submittedAt: 'desc' },
      take: 5
    }),
    prisma.reportCard.findMany({
      where: { studentId: selectedChild.id, published: true },
      include: { exam: true },
      orderBy: { exam: { date: 'desc' } },
      take: 2
    }),
    selectedChild.classId ? prisma.timetable.findMany({
      where: { classId: selectedChild.classId },
      include: { subject: true },
      take: 4
    }) : Promise.resolve([])
  ]);

  const childClass = selectedChild.class;
  const isHostel = selectedChild.residenceType?.toUpperCase().includes("HOSTEL");

  return (
    <div className={styles.dashboard}>
      {/* Header with ChildSwitcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>Parent Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
            Viewing academic records for <strong>{selectedChild.firstName} {selectedChild.lastName}</strong>
          </p>
        </div>
        <ChildSwitcher studentList={children} selectedChildId={selectedChild.id} />
      </div>

      <div style={{ marginTop: '1.75rem' }}>
        {/* Child Profile & Class Banner */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(236, 72, 153, 0.08))',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-fg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem',
              fontWeight: 700,
              boxShadow: '0 4px 10px rgba(99, 102, 241, 0.25)'
            }}>
              {selectedChild.firstName[0]}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>
                  {selectedChild.firstName} {selectedChild.lastName}
                </h2>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '0.2rem 0.55rem',
                  borderRadius: '999px',
                  backgroundColor: isHostel ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                  color: isHostel ? 'var(--warning)' : 'var(--primary)'
                }}>
                  {isHostel ? <Building2 size={13} /> : <Home size={13} />}
                  {isHostel ? "Hostel Student" : "Dayscholar"}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.3rem', fontSize: '0.85rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                <span>Class: <strong>{childClass ? `${childClass.name} - Section ${childClass.section}` : 'Not assigned'}</strong></span>
                <span>•</span>
                <span>Roll: <strong>{selectedChild.rollNumber}</strong></span>
                <span>•</span>
                <span>Admission No: <strong>{selectedChild.admissionNo}</strong></span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link 
              href={`/dashboard/parent/classes?childId=${selectedChild.id}`}
              style={{
                padding: '0.55rem 1rem',
                backgroundColor: 'var(--background)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--foreground)',
                textDecoration: 'none',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <GraduationCap size={16} /> Child Class Details
            </Link>
            <Link 
              href={`/dashboard/parent/timetable?childId=${selectedChild.id}`}
              style={{
                padding: '0.55rem 1rem',
                backgroundColor: 'var(--primary)',
                color: 'var(--primary-fg)',
                border: 'none',
                borderRadius: '8px',
                textDecoration: 'none',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <Clock size={16} /> Timetable
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className={styles.statsGrid}>
          <Link href={`/dashboard/parent/classes?childId=${selectedChild.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className={styles.statCard} style={{ cursor: 'pointer', transition: 'transform 0.2s', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
              <div className={styles.statIcon}><GraduationCap size={24} /></div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Enrolled Class</span>
                <span className={styles.statValue} style={{ fontSize: '1.15rem', marginTop: '0.25rem' }}>
                  {childClass ? `${childClass.name} - ${childClass.section}` : 'N/A'}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600, marginTop: '0.25rem', display: 'block' }}>
                  {childClass?.subjects ? `${childClass.subjects.length} Subjects` : 'View Class'}
                </span>
              </div>
            </div>
          </Link>

          <Link href={`/dashboard/parent/attendance?childId=${selectedChild.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className={styles.statCard} style={{ cursor: 'pointer', transition: 'transform 0.2s' }}>
              <div className={styles.statIcon}><Calendar size={24} /></div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Recent Attendance</span>
                <span className={styles.statValue} style={{ fontSize: '1rem', marginTop: '0.5rem' }}>
                  {attendance.length > 0 ? (
                    <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.35rem' }}>
                      {attendance.map(a => (
                        <span key={a.id} title={`${new Date(a.date).toLocaleDateString()} - ${a.status}`} style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: a.status === 'PRESENT' ? "var(--success)" : a.status === 'ABSENT' ? "var(--danger)" : "var(--warning)" }}></span>
                      ))}
                    </div>
                  ) : 'No recent records'}
                </span>
              </div>
            </div>
          </Link>

          <Link href={`/dashboard/parent/assignments?childId=${selectedChild.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className={styles.statCard} style={{ cursor: 'pointer', transition: 'transform 0.2s' }}>
              <div className={styles.statIcon}><BookOpen size={24} /></div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Assignments</span>
                <span className={styles.statValue} style={{ fontSize: '1.25rem' }}>
                  {assignments.length} Submissions
                </span>
              </div>
            </div>
          </Link>

          <Link href={`/dashboard/parent/report-cards?childId=${selectedChild.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className={styles.statCard} style={{ cursor: 'pointer', transition: 'transform 0.2s' }}>
              <div className={styles.statIcon}><FileText size={24} /></div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Latest Grade</span>
                <span className={styles.statValue} style={{ fontSize: '1.5rem', color: 'var(--primary)' }}>
                  {reportCards.length > 0 ? reportCards[0].grade : 'N/A'}
                </span>
              </div>
            </div>
          </Link>

          <Link href={`/dashboard/parent/timetable?childId=${selectedChild.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className={styles.statCard} style={{ cursor: 'pointer', transition: 'transform 0.2s' }}>
              <div className={styles.statIcon}><Clock size={24} /></div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Class Timetable</span>
                <span className={styles.statValue} style={{ fontSize: '1rem', marginTop: '0.25rem' }}>
                  {timetableToday.length > 0 ? `${timetableToday.length} Periods` : 'View Schedule'}
                </span>
              </div>
            </div>
          </Link>

          <Link href="/dashboard/parent/announcements" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className={styles.statCard} style={{ cursor: 'pointer', transition: 'transform 0.2s' }}>
              <div className={styles.statIcon}><Bell size={24} /></div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Notices & Updates</span>
                <span className={styles.statValue} style={{ fontSize: '1rem', marginTop: '0.25rem', color: 'var(--text-secondary)' }}>
                  School Announcements
                </span>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
