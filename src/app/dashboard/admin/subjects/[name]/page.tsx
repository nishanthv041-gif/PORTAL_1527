import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../../dashboard.module.css";
import Link from "next/link";
import { ArrowLeft, Users, TrendingUp, BookOpen, CheckCircle2, XCircle } from "lucide-react";
import AssignTeacherDropdown from "./AssignTeacherDropdown";

export default async function SubjectDetailsPage({
  params
}: {
  params: Promise<{ name: string }>
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') return null;

  const resolvedParams = await params;
  const decodedName = decodeURIComponent(resolvedParams.name);

  const [subjects, allTeachersRaw] = await Promise.all([
    prisma.subject.findMany({
      where: { name: decodedName },
      include: {
        class: {
          include: { students: true }
        },
        teacher: {
          include: { user: true }
        },
        marks: true
      }
    }),
    prisma.teacher.findMany({
      where: { isActive: true },
      include: { user: true, subjects: { select: { name: true } } },
      orderBy: { user: { name: 'asc' } }
    })
  ]);

  const targetSubjLower = decodedName.toLowerCase();
  
  // Filter by qualification containing subject name, or if they already teach a subject with this name
  const filteredTeachersRaw = allTeachersRaw.filter(t => {
    const qual = (t.qualification || "").toLowerCase();
    if (qual.includes(targetSubjLower)) return true;
    if (t.subjects.some(s => s.name.toLowerCase() === targetSubjLower)) return true;
    return false;
  });

  // Fallback: If no teacher perfectly matches, just show all active teachers so admin isn't stuck.
  const displayTeachers = filteredTeachersRaw.length > 0 ? filteredTeachersRaw : allTeachersRaw;
  const allTeachers = displayTeachers.map(t => ({ id: t.id, name: t.user.name }));

  if (subjects.length === 0) {
    return (
      <div className={styles.dashboard}>
        <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--card-bg)', borderRadius: '12px' }}>
          <h2>Subject not found</h2>
          <Link href="/dashboard/admin/subjects" style={{ color: 'var(--primary)', marginTop: '1rem', display: 'inline-block' }}>Back to Subjects</Link>
        </div>
      </div>
    );
  }

  // Aggregate stats
  let totalStudents = 0;
  let totalMarksSum = 0;
  let totalMarksMax = 0;
  let marksCount = 0;
  
  const classBreakdowns: { [key: string]: { sum: number, max: number, count: number, subjectId: string, teacherId: string | null } } = {};
  const teachers: { teacher: import('@prisma/client').Teacher & { user: import('@prisma/client').User }, classes: string[] }[] = [];
  const teacherIds = new Set<string>();

  subjects.forEach(subj => {
    totalStudents += subj.class.students.length;
    
    if (subj.teacher && !teacherIds.has(subj.teacher.id)) {
      teacherIds.add(subj.teacher.id);
      teachers.push({
        teacher: subj.teacher,
        classes: subjects.filter(s => s.teacherId === subj.teacher?.id).map(s => `${s.class.name} - ${s.class.section}`)
      });
    }

    const className = `${subj.class.name} - ${subj.class.section}`;
    if (!classBreakdowns[className]) {
      classBreakdowns[className] = { sum: 0, max: 0, count: 0, subjectId: subj.id, teacherId: subj.teacherId };
    }

    subj.marks.forEach(m => {
      marksCount++;
      totalMarksSum += m.score;
      totalMarksMax += m.maxScore;
      
      classBreakdowns[className].sum += m.score;
      classBreakdowns[className].max += m.maxScore;
      classBreakdowns[className].count++;
    });
  });

  const overallAverage = totalMarksMax > 0 ? (totalMarksSum / totalMarksMax) * 100 : 0;

  return (
    <div className={styles.dashboard}>
      <Link href="/dashboard/admin/subjects" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '1.5rem', fontWeight: 500 }}>
        <ArrowLeft size={16} /> Back to Subjects
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', padding: '1rem', borderRadius: '12px' }}>
          <BookOpen size={32} />
        </div>
        <div>
          <h1 className={styles.title} style={{ margin: 0, fontSize: '2rem' }}>{decodedName}</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Subject Details & Performance</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'var(--primary-bg)', color: "var(--primary)", padding: '0.75rem', borderRadius: '8px' }}>
            <Users size={24} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Total Enrolled</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>{totalStudents} <span style={{ fontSize: '0.875rem', fontWeight: 400, color: 'var(--text-secondary)' }}>students</span></p>
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'var(--success-bg)', color: "var(--success)", padding: '0.75rem', borderRadius: '8px' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Overall Average</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>
              {marksCount > 0 ? `${overallAverage.toFixed(1)}%` : 'No marks yet'}
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', alignItems: 'start' }}>
        {/* Class Breakdown */}
        <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Class-wise Performance</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {Object.keys(classBreakdowns).sort().map(className => {
              const bd = classBreakdowns[className];
              const avg = bd.max > 0 ? (bd.sum / bd.max) * 100 : null;
              
              return (
                <div key={className} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                  <div>
                    <h4 style={{ fontWeight: 600, margin: 0 }}>{className}</h4>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>{bd.count} marks recorded</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <AssignTeacherDropdown 
                      subjectId={bd.subjectId} 
                      currentTeacherId={bd.teacherId} 
                      teachers={allTeachers} 
                    />
                    <div style={{ textAlign: 'right', minWidth: '60px' }}>
                      {avg !== null ? (
                        <span style={{ fontSize: '1.25rem', fontWeight: 600, color: avg >= 75 ? "var(--success)" : avg >= 50 ? "var(--warning)" : "var(--danger)" }}>
                          {avg.toFixed(1)}%
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>N/A</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Teachers */}
        <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Assigned Teachers</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {teachers.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingBottom: '1rem', borderBottom: i < teachers.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: 'var(--primary)' }}>
                  {item.teacher.user.name.charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontWeight: 600, margin: 0 }}>{item.teacher.user.name}</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, marginTop: '0.25rem' }}>
                    {item.classes.join(', ')}
                  </p>
                </div>
                {item.teacher.isActive ? (
                  <CheckCircle2 size={16} color="var(--success)" />
                ) : (
                  <XCircle size={16} color="var(--danger)" />
                )}
              </div>
            ))}
            {teachers.length === 0 && (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem 0' }}>No teachers assigned yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
