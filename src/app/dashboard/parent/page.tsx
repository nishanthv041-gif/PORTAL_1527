import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import styles from "../dashboard.module.css";
import { BookOpen, Calendar, Bell, IndianRupee, FileText } from "lucide-react";
import ChildSwitcher from "./ChildSwitcher";
import Link from "next/link";

export default async function ParentDashboard({
  searchParams
}: {
  searchParams: Promise<{ childId?: string }>
}) {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const resolvedSearchParams = await searchParams;

  const parent = await prisma.parent.findUnique({
    where: { userId: session.user.id },
    include: {
      children: {
        include: {
          student: {
            include: {
              class: true
            }
          }
        }
      }
    }
  });

  if (!parent || parent.children.length === 0) {
    return (
      <div className={styles.dashboard}>
        <h1 className={styles.title}>Parent Dashboard</h1>
        <p>No children linked to your account.</p>
      </div>
    );
  }

  const children = parent.children.map(s => s.student);
  
  // Determine which child is currently selected
  let selectedChild = children[0];
  if (resolvedSearchParams.childId) {
    const found = children.find(c => c.id === resolvedSearchParams.childId);
    if (found) selectedChild = found;
  }

  // Fetch data for selected child
  const [attendance, assignments, reportCards] = await Promise.all([
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
    })
  ]);

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 className={styles.title} style={{ margin: 0 }}>Parent Dashboard</h1>
        <ChildSwitcher studentList={children} selectedChildId={selectedChild.id} />
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--foreground)' }}>
          Overview for {selectedChild.firstName} {selectedChild.lastName} {selectedChild.class ? `(${selectedChild.class.name} - ${selectedChild.class.section})` : ''}
        </h2>

        <div className={styles.statsGrid}>
          <Link href="/dashboard/parent/attendance" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className={styles.statCard} style={{ cursor: 'pointer', transition: 'transform 0.2s' }}>
              <div className={styles.statIcon}><Calendar size={24} /></div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Recent Attendance</span>
                <span className={styles.statValue} style={{ fontSize: '1rem', marginTop: '0.5rem' }}>
                  {attendance.length > 0 ? (
                    <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.5rem' }}>
                      {attendance.map(a => (
                        <span key={a.id} title={new Date(a.date).toLocaleDateString()} style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: a.status === 'PRESENT' ? "var(--success)" : a.status === 'ABSENT' ? "var(--danger)" : "var(--warning)" }}></span>
                      ))}
                    </div>
                  ) : 'No recent records'}
                </span>
              </div>
            </div>
          </Link>

          <Link href="/dashboard/parent/assignments" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className={styles.statCard} style={{ cursor: 'pointer', transition: 'transform 0.2s' }}>
              <div className={styles.statIcon}><BookOpen size={24} /></div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Recent Assignments</span>
                <span className={styles.statValue} style={{ fontSize: '1.25rem' }}>
                  {assignments.length} Submissions
                </span>
              </div>
            </div>
          </Link>

          <Link href="/dashboard/parent/report-cards" style={{ textDecoration: 'none', color: 'inherit' }}>
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

          <Link href="/dashboard/parent/calendar" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className={styles.statCard} style={{ cursor: 'pointer', transition: 'transform 0.2s' }}>
              <div className={styles.statIcon}><Calendar size={24} /></div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>School Calendar</span>
                <span className={styles.statValue} style={{ fontSize: '1rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
                  View Events
                </span>
              </div>
            </div>
          </Link>

          <Link href="/dashboard/parent/fees" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className={styles.statCard} style={{ cursor: 'pointer', transition: 'transform 0.2s' }}>
              <div className={styles.statIcon}><IndianRupee size={24} /></div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Fee Status</span>
                <span className={styles.statValue} style={{ fontSize: '1rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
                  Check Dues
                </span>
              </div>
            </div>
          </Link>

          <Link href="/dashboard/parent/announcements" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className={styles.statCard} style={{ cursor: 'pointer', transition: 'transform 0.2s' }}>
              <div className={styles.statIcon}><Bell size={24} /></div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Notices</span>
                <span className={styles.statValue} style={{ fontSize: '1rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
                  School Updates
                </span>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
