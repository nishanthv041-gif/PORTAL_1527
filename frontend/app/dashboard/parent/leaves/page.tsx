import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import ChildSwitcher from "../ChildSwitcher";
import ApplyLeaveForm from "./ApplyLeaveForm";
import { Calendar, Clock, CheckCircle, XCircle } from "lucide-react";

export default async function ParentLeavesPage({
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

  const leaves = await prisma.leaveRequest.findMany({
    where: { studentId: selectedChild.id },
    orderBy: { startDate: 'desc' }
  });

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 className={styles.title} style={{ margin: 0 }}>Leave Applications</h1>
        <ChildSwitcher studentList={children} selectedChildId={selectedChild.id} />
      </div>

      <div className={styles.chartsContainer} style={{ marginTop: '2rem' }}>
        <div className={styles.chartCard}>
          <h3 className={styles.chartHeader}>Leave History</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {leaves.map((leave) => (
              <div key={leave.id} style={{ display: 'flex', flexDirection: 'column', padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--background)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>{leave.reason}</h4>
                  <span style={{ 
                    fontSize: '0.75rem', 
                    fontWeight: 600, 
                    padding: '4px 8px', 
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    backgroundColor: leave.status === 'APPROVED' ? 'var(--success-bg)' : leave.status === 'REJECTED' ? 'var(--danger-bg)' : 'var(--warning-bg)',
                    color: leave.status === 'APPROVED' ? "var(--success)" : leave.status === 'REJECTED' ? "var(--danger)" : "var(--warning)"
                  }}>
                    {leave.status === 'APPROVED' && <CheckCircle size={12} />}
                    {leave.status === 'REJECTED' && <XCircle size={12} />}
                    {leave.status === 'PENDING' && <Clock size={12} />}
                    {leave.status}
                  </span>
                </div>
                
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', opacity: 0.8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Calendar size={14} /> 
                    {new Date(leave.startDate).toLocaleDateString()} to {new Date(leave.endDate).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}

            {leaves.length === 0 && (
              <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>No leave requests found.</p>
            )}
          </div>
        </div>

        <div className={styles.chartCard}>
          <h3 className={styles.chartHeader}>Apply for Leave</h3>
          <ApplyLeaveForm studentId={selectedChild.id} />
        </div>
      </div>
    </div>
  );
}
