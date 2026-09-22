import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import Link from "next/link";
import styles from "../../../dashboard.module.css";
import { ArrowLeft, User } from "lucide-react";

export default async function TeacherClassRosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const cls = await prisma.class.findUnique({
    where: { id: id },
    include: {
      students: {
        orderBy: { firstName: 'asc' }
      }
    }
  });

  if (!cls) {
    return <p>Class not found.</p>;
  }

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <Link href="/dashboard/teacher/classes" style={{ color: 'var(--foreground)', opacity: 0.7 }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 className={styles.title} style={{ margin: 0 }}>
          {cls.name} - {cls.section} Roster
        </h1>
      </div>
      
      <div className={styles.chartCard}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
          {cls.students.map((student) => (
            <div key={student.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--background)' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                <User size={20} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600 }}>{student.firstName} {student.lastName}</span>
                <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Roll No: {student.rollNumber}</span>
              </div>
            </div>
          ))}

          {cls.students.length === 0 && (
            <p>No students enrolled in this class.</p>
          )}
        </div>
      </div>
    </div>
  );
}
