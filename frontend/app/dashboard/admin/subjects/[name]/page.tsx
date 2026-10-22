import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../../dashboard.module.css";
import Link from "next/link";
import { ArrowLeft, TrendingUp, BookOpen, CheckCircle2, XCircle, School } from "lucide-react";
import AssignTeacherDropdown from "./AssignTeacherDropdown";

export default async function SubjectDetailsPage({
  params
}: {
  params: Promise<{ name: string }>
}) {
  const session = await getServerSession(getAuthOptions());
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

  // All active teachers available for staff assigning
  const allTeachers = allTeachersRaw.map(t => ({ id: t.id, name: t.user.name }));

  if (subjects.length === 0) {
    return (
      <div className={styles.dashboard}>
        <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--card-bg)', borderRadius: '12px' }}>
          <h2>Subject not found</h2>
          <Link href="/dashboard/admin/subjects" style={{ color: 'var(--primary)', marginTop: '1rem', display: 'inline-block' }}>
            Back to Subjects
          </Link>
        </div>
      </div>
    );
  }

  // Aggregate stats
  let totalMarksSum = 0;
  let totalMarksMax = 0;
  let marksCount = 0;
  
  const classBreakdowns: { [key: string]: { sum: number, max: number, count: number, subjectId: string, teacherId: string | null } } = {};
  const teachers: { teacher: import('@prisma/client').Teacher & { user: import('@prisma/client').User }, classes: string[] }[] = [];
  const teacherIds = new Set<string>();

  subjects.forEach(subj => {
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
  const subjectCode = subjects[0]?.code || "";

  return (
    <div className={styles.dashboard} style={{ maxWidth: '100%', overflowX: 'hidden' }}>
      <Link 
        href="/dashboard/admin/subjects" 
        style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '0.5rem', 
          color: 'var(--text-secondary)', 
          textDecoration: 'none', 
          marginBottom: '1.5rem', 
          fontWeight: 600,
          fontSize: '0.875rem' 
        }}
      >
        <ArrowLeft size={16} /> Back to Subjects
      </Link>

      {/* Header Banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <div style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', padding: '1rem', borderRadius: '14px', flexShrink: 0 }}>
          <BookOpen size={30} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <h1 className={styles.title} style={{ margin: 0, fontSize: 'clamp(1.5rem, 4vw, 2.2rem)' }}>
              {decodedName}
            </h1>
            {subjectCode && (
              <span style={{ 
                fontSize: '0.8rem', 
                fontWeight: 600, 
                background: 'var(--primary-bg)', 
                color: 'var(--primary)', 
                padding: '3px 10px', 
                borderRadius: '8px' 
              }}>
                {subjectCode}
              </span>
            )}
          </div>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
            Subject Details &amp; Class-wise Performance
          </p>
        </div>
      </div>

      {/* Top Metric Cards (Total Enrolled removed per requirement) */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', 
        gap: '1.25rem', 
        marginBottom: '2rem' 
      }}>
        {/* Overall Average */}
        <div style={{ 
          background: 'var(--card-bg)', 
          padding: '1.25rem', 
          borderRadius: '14px', 
          border: '1px solid var(--border-color)', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '1rem',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
        }}>
          <div style={{ background: 'var(--success-bg)', color: "var(--success)", padding: '0.75rem', borderRadius: '10px' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, margin: 0, marginBottom: '0.2rem' }}>Overall Average</p>
            <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
              {marksCount > 0 ? `${overallAverage.toFixed(1)}%` : 'No marks yet'}
            </p>
          </div>
        </div>

        {/* Classes Taught */}
        <div style={{ 
          background: 'var(--card-bg)', 
          padding: '1.25rem', 
          borderRadius: '14px', 
          border: '1px solid var(--border-color)', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '1rem',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
        }}>
          <div style={{ background: 'var(--primary-bg)', color: "var(--primary)", padding: '0.75rem', borderRadius: '10px' }}>
            <School size={24} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, margin: 0, marginBottom: '0.2rem' }}>Classes Taught</p>
            <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
              {subjects.length} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>classes</span>
            </p>
          </div>
        </div>
      </div>

      {/* Main Responsive Grid Layout (Fits PC & Mobile perfectly) */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', 
        gap: '1.5rem', 
        alignItems: 'start' 
      }}>
        {/* Class-wise Performance & Staff Assigning */}
        <div style={{ 
          background: 'var(--card-bg)', 
          padding: '1.5rem', 
          borderRadius: '16px', 
          border: '1px solid var(--border-color)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Class-wise Performance</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
              Assign and edit teaching staff for each class below:
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {Object.keys(classBreakdowns).sort().map(className => {
              const bd = classBreakdowns[className];
              const avg = bd.max > 0 ? (bd.sum / bd.max) * 100 : null;
              
              return (
                <div 
                  key={className} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    flexWrap: 'wrap',
                    gap: '0.85rem',
                    padding: '1rem', 
                    background: 'rgba(0,0,0,0.02)', 
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div style={{ minWidth: '130px' }}>
                    <h4 style={{ fontWeight: 700, margin: 0, fontSize: '0.95rem' }}>{className}</h4>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                      {bd.count} marks recorded
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
                    <AssignTeacherDropdown 
                      subjectId={bd.subjectId} 
                      currentTeacherId={bd.teacherId} 
                      teachers={allTeachers} 
                    />
                    <div style={{ textAlign: 'right', minWidth: '60px' }}>
                      {avg !== null ? (
                        <span style={{ 
                          fontSize: '1.15rem', 
                          fontWeight: 700, 
                          color: avg >= 75 ? "var(--success)" : avg >= 50 ? "var(--warning)" : "var(--danger)" 
                        }}>
                          {avg.toFixed(1)}%
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No Marks</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Assigned Teachers List */}
        <div style={{ 
          background: 'var(--card-bg)', 
          padding: '1.5rem', 
          borderRadius: '16px', 
          border: '1px solid var(--border-color)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, marginBottom: '1.25rem' }}>Assigned Teachers</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {teachers.map((item, i) => (
              <div 
                key={i} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.85rem', 
                  paddingBottom: '0.85rem', 
                  borderBottom: i < teachers.length - 1 ? '1px solid var(--border-color)' : 'none',
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ 
                  width: '38px', 
                  height: '38px', 
                  borderRadius: '50%', 
                  background: 'var(--primary-bg)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontWeight: 700, 
                  color: 'var(--primary)',
                  fontSize: '0.9rem',
                  flexShrink: 0
                }}>
                  {item.teacher.user.name.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: '140px' }}>
                  <h4 style={{ fontWeight: 600, margin: 0, fontSize: '0.925rem' }}>{item.teacher.user.name}</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                    {item.classes.join(', ')}
                  </p>
                </div>
                {item.teacher.isActive ? (
                  <CheckCircle2 size={16} color="var(--success)" style={{ flexShrink: 0 }} />
                ) : (
                  <XCircle size={16} color="var(--danger)" style={{ flexShrink: 0 }} />
                )}
              </div>
            ))}
            {teachers.length === 0 && (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '1.5rem 0', margin: 0, fontSize: '0.875rem' }}>
                No teachers assigned yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
