import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import ChildSwitcher from "../ChildSwitcher";
import { Calendar as CalendarIcon, CheckCircle, XCircle, AlertCircle } from "lucide-react";

export default async function ParentAttendancePage({
  searchParams
}: {
  searchParams: Promise<{ childId?: string }>
}) {
  const resolvedSearchParams = await searchParams;
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const parent = await prisma.parent.findUnique({
    where: { userId: session.user.id },
    include: {
      children: {
        include: {
          student: true
        }
      }
    }
  });

  if (!parent || parent.children.length === 0) {
    return <p>No children linked to your account.</p>;
  }

  const children = parent.children.map(s => s.student);
  
  let selectedChild = children[0];
  if (resolvedSearchParams.childId) {
    const found = children.find(c => c.id === resolvedSearchParams.childId);
    if (found) selectedChild = found;
  }

  const attendanceRecords = await prisma.attendance.findMany({
    where: { studentId: selectedChild.id },
    orderBy: { date: 'desc' }
  });

  const presentCount = attendanceRecords.filter(a => a.status === 'PRESENT').length;
  const absentCount = attendanceRecords.filter(a => a.status === 'ABSENT').length;
  const lateCount = attendanceRecords.filter(a => a.status === 'LATE').length;
  
  const total = attendanceRecords.length;
  const percentage = total > 0 ? ((presentCount + lateCount) / total * 100).toFixed(1) : 0;

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 className={styles.title} style={{ margin: 0 }}>Attendance Records</h1>
        <ChildSwitcher studentList={children} selectedChildId={selectedChild.id} />
      </div>

      <div className={styles.statsGrid} style={{ marginTop: '2rem' }}>
        <div className={styles.statCard}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Attendance %</span>
            <span className={styles.statValue} style={{ color: 'var(--primary)' }}>{percentage}%</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Present</span>
            <span className={styles.statValue} style={{ color: "var(--success)" }}>{presentCount}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Absent</span>
            <span className={styles.statValue} style={{ color: "var(--danger)" }}>{absentCount}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Late</span>
            <span className={styles.statValue} style={{ color: "var(--warning)" }}>{lateCount}</span>
          </div>
        </div>
      </div>

      <div className={styles.chartCard} style={{ marginTop: '2rem' }}>
        <h3 className={styles.chartHeader}>Detailed History</h3>
        
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "0.75rem", fontWeight: 600 }}>Date</th>
                <th style={{ padding: "0.75rem", fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {attendanceRecords.map((record) => (
                <tr key={record.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.75rem", display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CalendarIcon size={16} style={{ opacity: 0.5 }} />
                    {new Date(record.date).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "0.75rem" }}>
                    <span style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '0.25rem',
                      padding: '4px 8px', 
                      borderRadius: '12px', 
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      backgroundColor: record.status === 'PRESENT' ? 'var(--success-bg)' : record.status === 'ABSENT' ? 'var(--danger-bg)' : 'var(--warning-bg)',
                      color: record.status === 'PRESENT' ? "var(--success)" : record.status === 'ABSENT' ? "var(--danger)" : "var(--warning)"
                    }}>
                      {record.status === 'PRESENT' && <CheckCircle size={14} />}
                      {record.status === 'ABSENT' && <XCircle size={14} />}
                      {record.status === 'LATE' && <AlertCircle size={14} />}
                      {record.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {attendanceRecords.length === 0 && (
            <p style={{ padding: "1rem", textAlign: "center", opacity: 0.7 }}>No attendance records found.</p>
          )}
        </div>
      </div>
    </div>
  );
}
