"use client";

import { useState } from "react";
import { BookOpen, Users, TrendingUp, Plus, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { createSubjectAction } from "@/backend/actions/dashboard/admin/subjects/actions";
import { Subject, Class, Teacher, User, Student, Mark } from "@prisma/client";

type TeacherWithUser = Teacher & { user: User };
type SubjectWithRelations = Subject & {
  class: Class & { students: Student[] };
  teacher: TeacherWithUser | null;
  marks: Mark[];
};

export default function SubjectListClient({ subjects, classes, teachers }: { subjects: SubjectWithRelations[], classes: Class[], teachers: TeacherWithUser[] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [subjectName, setSubjectName] = useState("");

  const toggleClass = (classId: string) => {
    if (selectedClasses.includes(classId)) {
      setSelectedClasses(selectedClasses.filter(c => c !== classId));
    } else {
      setSelectedClasses([...selectedClasses, classId]);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    formData.set("classIds", selectedClasses.join(","));

    const result = await createSubjectAction(formData);

    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else {
      setShowCreate(false);
      setSelectedClasses([]);
      setSubjectName("");
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSubjectName(e.target.value);
  };

  // Group subjects by shared name across all classes
  const groupedSubjects = subjects.reduce((acc, curr) => {
    if (!acc[curr.name]) acc[curr.name] = [];
    acc[curr.name].push(curr);
    return acc;
  }, {} as Record<string, SubjectWithRelations[]>);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
        <button 
          onClick={() => setShowCreate(!showCreate)}
          style={{ padding: '0.75rem 1.5rem', backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {showCreate ? "Cancel" : <><Plus size={18} /> Add Subject</>}
        </button>
      </div>

      {showCreate && (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Add New Subject</h2>
          
          {error && (
            <div style={{ background: 'var(--danger-bg)', color: "var(--danger)", padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--danger)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleCreateSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Subject Name *</label>
              <input required name="name" value={subjectName} onChange={handleNameChange} type="text" placeholder="e.g. Mathematics" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Subject Code *</label>
              <input required name="code" type="text" defaultValue={subjectName ? subjectName.substring(0, 3).toUpperCase() : ""} placeholder="e.g. MAT" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Classes *</label>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                {classes.map(c => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', background: 'var(--card-bg)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedClasses.includes(c.id)}
                      onChange={() => toggleClass(c.id)}
                    />
                    {c.name} - {c.section}
                  </label>
                ))}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                A separate subject record will be created for each selected class.
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Max Marks *</label>
              <input required name="maxMarks" type="number" defaultValue="100" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Pass Marks *</label>
              <input required name="passMarks" type="number" defaultValue="35" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Default Teacher (Optional)</label>
              <select name="teacherId" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
                <option value="">Leave Unassigned</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>{t.user.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gridColumn: '1 / -1' }}>
              <button 
                type="submit" 
                disabled={isSubmitting}
                style={{ width: '100%', padding: '0.75rem', backgroundColor: "var(--success)", color: "var(--success-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
              >
                {isSubmitting ? "Creating..." : "Add Subject"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
        {Object.keys(groupedSubjects).sort().map(subjectName => {
          const instances = groupedSubjects[subjectName];
          
          let totalStudents = 0;
          const teachersSet = new Set<string>();
          
          let totalMarksSum = 0;
          let totalMarksMax = 0;
          let highest = 0;
          let lowest = 100;
          let passCount = 0;
          let marksCount = 0;

          instances.forEach((subj) => {
            totalStudents += subj.class.students.length;
            if (subj.teacher) teachersSet.add(subj.teacher.user.name);

            subj.marks.forEach((m) => {
              marksCount++;
              const percent = (m.score / m.maxScore) * 100;
              totalMarksSum += m.score;
              totalMarksMax += m.maxScore;
              
              if (percent > highest) highest = percent;
              if (percent < lowest) lowest = percent;
              if (percent >= 40) passCount++;
            });
          });

          if (marksCount === 0) lowest = 0;
          const overallAverage = totalMarksMax > 0 ? (totalMarksSum / totalMarksMax) * 100 : 0;
          const passRate = marksCount > 0 ? (passCount / marksCount) * 100 : 0;
          const teacherNames = Array.from(teachersSet).join(', ') || 'Unassigned';

          return (
            <div key={subjectName} style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {subjectName}
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>Taught in {instances.length} classes</p>
                </div>
                <div style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', padding: '0.5rem', borderRadius: '8px' }}>
                  <BookOpen size={24} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Users size={16} color="var(--text-secondary)" />
                  <div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.1rem' }}>Total Students</p>
                    <p style={{ fontSize: '1rem', fontWeight: 600 }}>{totalStudents}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <TrendingUp size={16} color="var(--text-secondary)" />
                  <div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.1rem' }}>Pass Rate</p>
                    <p style={{ fontSize: '1rem', fontWeight: 600, color: passRate >= 75 ? "var(--success)" : passRate >= 50 ? "var(--warning)" : "var(--danger)" }}>
                      {marksCount > 0 ? `${passRate.toFixed(1)}%` : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Performance Stats (Overall)</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span>Avg: <strong>{marksCount > 0 ? `${overallAverage.toFixed(1)}%` : 'No marks yet'}</strong></span>
                  <span>High: <strong style={{ color: "var(--success)" }}>{marksCount > 0 ? `${highest.toFixed(1)}%` : '-'}</strong></span>
                  <span>Low: <strong style={{ color: "var(--danger)" }}>{marksCount > 0 ? `${lowest.toFixed(1)}%` : '-'}</strong></span>
                </div>
              </div>

              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Teaching Staff</p>
                <p style={{ fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.4, marginBottom: '1rem' }}>{teacherNames}</p>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <Link href={`/dashboard/admin/subjects/${encodeURIComponent(subjectName)}`} style={{ flex: 1, textAlign: 'center', padding: '0.5rem', background: 'var(--primary-bg)', color: 'var(--primary)', borderRadius: '6px', fontSize: '0.875rem', fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <LayoutDashboard size={16} /> View Details
                </Link>
                <button
                  onClick={async () => {
                    if (confirm("Are you sure you want to deactivate this subject?")) {
                      for (const subj of instances) {
                        if (subj.isActive) {
                          const { deactivateSubject } = await import("@/backend/actions/dashboard/admin/subjects/actions");
                          const res = await deactivateSubject(subj.id);
                          if (res?.error) {
                            alert(res.error);
                            break;
                          }
                        }
                      }
                    }
                  }}
                  style={{ flex: 1, textAlign: 'center', padding: '0.5rem', background: 'rgba(245, 158, 11, 0.1)', color: "var(--warning)", border: 'none', borderRadius: '6px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  Disable
                </button>
                <button
                  onClick={async () => {
                    if (confirm("WARNING: This will permanently delete this subject. This cannot be undone.")) {
                      for (const subj of instances) {
                        const { deleteSubject } = await import("@/backend/actions/dashboard/admin/subjects/actions");
                        const res = await deleteSubject(subj.id);
                        if (res.error) {
                          alert(res.error);
                          break;
                        } else if (res.message) {
                          alert(res.message);
                        }
                      }
                    }
                  }}
                  style={{ flex: 1, textAlign: 'center', padding: '0.5rem', background: 'var(--danger-bg)', color: "var(--danger)", border: 'none', borderRadius: '6px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}

        {Object.keys(groupedSubjects).length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <p>No subjects exist yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
