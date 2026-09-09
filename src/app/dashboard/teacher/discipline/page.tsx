import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import styles from "../../dashboard.module.css";
import CreateDisciplineForm from "./CreateDisciplineForm";
import { AlertTriangle, User, Clock, ShieldAlert } from "lucide-react";

export default async function TeacherDisciplinePage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      classes: {
        include: {
          students: {
            orderBy: { firstName: 'asc' }
          }
        }
      }
    }
  });

  if (!teacher) return null;

  // Extract unique students
  const studentMap = new Map();
  teacher.classes.forEach(c => {
    c.students.forEach(s => {
      if (!studentMap.has(s.id)) {
        studentMap.set(s.id, {
          id: s.id,
          name: `${s.firstName} ${s.lastName}`,
          rollNo: s.rollNumber,
          className: `${c.name} - ${c.section}`
        });
      }
    });
  });

  const students = Array.from(studentMap.values());
  const studentIds = students.map(s => s.id);

  const records = await prisma.disciplineRecord.findMany({
    where: { studentId: { in: studentIds } },
    include: { student: true },
    orderBy: { date: 'desc' }
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Discipline Records</h1>
      
      <div className={styles.chartsContainer}>
        <div className={styles.chartCard}>
          <h3 className={styles.chartHeader}>Recent Records for My Students</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {records.map((record) => (
              <div key={record.id} style={{ display: 'flex', flexDirection: 'column', padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--background)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>{record.incident}</h4>
                  <span style={{ 
                    fontSize: '0.75rem', 
                    fontWeight: 600, 
                    padding: '4px 8px', 
                    borderRadius: '12px',
                    backgroundColor: record.status === 'PENDING' ? 'var(--warning-bg)' : 'var(--success-bg)',
                    color: record.status === 'PENDING' ? "var(--warning)" : "var(--success)"
                  }}>
                    {record.status}
                  </span>
                </div>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.5rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <User size={14} /> Student: {record.student.firstName} {record.student.lastName}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Clock size={14} /> {new Date(record.date).toLocaleDateString()}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: record.severity === 'HIGH' ? "var(--danger)" : record.severity === 'MEDIUM' ? "var(--warning)" : 'inherit' }}>
                    <AlertTriangle size={14} /> Severity: {record.severity}
                  </span>
                </div>
                
                <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', lineHeight: 1.5 }}>
                  {record.description}
                </div>
                
                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--card)', borderRadius: '6px', fontSize: '0.875rem', borderLeft: '3px solid #8b5cf6' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600, marginBottom: '0.25rem', color: '#8b5cf6' }}>
                    <ShieldAlert size={14} /> Action Taken
                  </div>
                  {record.actionTaken}
                </div>
              </div>
            ))}

            {records.length === 0 && (
              <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>No discipline records found for your students.</p>
            )}
          </div>
        </div>

        <div className={styles.chartCard}>
          <h3 className={styles.chartHeader}>Log a Discipline Issue</h3>
          <CreateDisciplineForm students={students} />
        </div>
      </div>
    </div>
  );
}
