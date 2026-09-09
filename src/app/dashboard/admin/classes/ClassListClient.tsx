"use client";

import { useState } from "react";
import { Plus, Users, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { deleteClassAction, createClassAction, deactivateClassAction } from "./actions";

const CLASS_OPTIONS = Array.from({ length: 10 }, (_, i) => `Class ${i + 1}`);
const SECTION_OPTIONS = ["A", "B", "C", "D"];

import { Class, Teacher, User, Student, Attendance } from "@prisma/client";

type TeacherWithUser = Teacher & { user: User };
type StudentWithRelations = Student & { attendances: Attendance[] };
type ClassWithRelations = Class & { 
  teacher: TeacherWithUser | null;
  students: StudentWithRelations[];
};

export default function ClassListClient({ classes, teachers }: { classes: ClassWithRelations[], teachers: TeacherWithUser[] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [selectedSections, setSelectedSections] = useState<string[]>(["A"]);

  // Group classes by name
  const groupedClasses = classes.reduce((acc, curr) => {
    if (!acc[curr.name]) acc[curr.name] = [];
    acc[curr.name].push(curr);
    return acc;
  }, {} as Record<string, ClassWithRelations[]>);

  const toggleSection = (section: string) => {
    if (selectedSections.includes(section)) {
      if (selectedSections.length > 1) {
        setSelectedSections(selectedSections.filter(s => s !== section));
      }
    } else {
      setSelectedSections([...selectedSections, section].sort());
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    // Append the selected sections as a comma-separated string to match server action expectations
    formData.set("sections", selectedSections.join(","));

    const result = await createClassAction(formData);

    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else {
      setShowCreate(false);
      setSelectedSections(["A"]); // Reset
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
        <button 
          onClick={() => setShowCreate(!showCreate)}
          style={{ padding: '0.75rem 1.5rem', backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {showCreate ? "Cancel" : <><Plus size={18} /> Create Class</>}
        </button>
      </div>

      {showCreate && (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Create New Class</h2>
          
          {error && (
            <div style={{ background: 'var(--danger-bg)', color: "var(--danger)", padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--danger)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleCreateSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Class Name *</label>
              <select required name="name" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
                <option value="">Select a class...</option>
                {CLASS_OPTIONS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Sections *</label>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                {SECTION_OPTIONS.map(section => (
                  <label key={section} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedSections.includes(section)}
                      onChange={() => toggleSection(section)}
                    />
                    {section}
                  </label>
                ))}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                A separate class record will be created for each selected section.
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Max Strength (capacity) *</label>
              <input required name="maxStrength" type="number" min="1" max="100" defaultValue="40" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Default Class Teacher (Optional)</label>
              <select name="teacherId" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
                <option value="">Select a teacher...</option>
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
                {isSubmitting ? "Creating..." : "Create Classes"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {Object.keys(groupedClasses).sort((a, b) => {
           // Sort naturally "Class 1", "Class 2", "Class 10"
           const numA = parseInt(a.replace(/\D/g, '')) || 0;
           const numB = parseInt(b.replace(/\D/g, '')) || 0;
           return numA - numB;
        }).map(className => {
          const sections = groupedClasses[className];
          
          let totalStudents = 0;
          let totalPresent = 0;
          let totalAttendances = 0;
          
          const teachersList = new Set();

          sections.forEach((cls) => {
            totalStudents += cls.students.length;
            if (cls.teacher) teachersList.add(cls.teacher.user.name);

            cls.students.forEach((s) => {
              totalAttendances += s.attendances.length;
              totalPresent += s.attendances.filter((a) => a.status === 'PRESENT').length;
            });
          });

          const attendancePercent = totalAttendances > 0 ? Math.round((totalPresent / totalAttendances) * 100) : 0;
          const teacherNames = Array.from(teachersList).join(', ') || 'None assigned';

          return (
            <div key={className} style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>{className}</h3>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    Section: {sections.sort((a, b) => a.section.localeCompare(b.section)).map((s) => (
                      <span key={s.id} style={{ background: 'rgba(0,0,0,0.05)', padding: '0.125rem 0.5rem', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        {s.section}
                        {s.isActive && (
                          <button 
                            onClick={async () => {
                              if (confirm(`Are you sure you want to deactivate ${className} Section ${s.section}?`)) {
                                const res = await deactivateClassAction(s.id);
                                if (res?.error) alert(res.error);
                              }
                            }}
                            style={{ background: 'transparent', border: 'none', color: 'var(--warning)', cursor: 'pointer', padding: 0, display: 'flex', opacity: 0.7 }}
                            title={`Deactivate Section ${s.section}`}
                          >
                            Disable
                          </button>
                        )}
                        <button 
                          onClick={async () => {
                            if (confirm(`WARNING: This will permanently delete ${className} Section ${s.section}. Are you sure?`)) {
                              const res = await deleteClassAction(s.id);
                              if (res?.error) alert(res.error);
                              else if (res?.message) alert(res.message);
                            }
                          }}
                          style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, display: 'flex', opacity: 0.7 }}
                          title={`Delete Section ${s.section}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ background: 'var(--primary-bg)', color: 'var(--primary)', padding: '0.5rem', borderRadius: '8px' }}>
                  <Users size={24} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', flex: 1 }}>
                <div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Total Strength</p>
                  <p style={{ fontSize: '1.125rem', fontWeight: 600 }}>{totalStudents}</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Avg. Attendance</p>
                  <p style={{ fontSize: '1.125rem', fontWeight: 600, color: attendancePercent >= 75 ? "var(--success)" : attendancePercent >= 60 ? "var(--warning)" : "var(--danger)" }}>
                    {totalAttendances > 0 ? `${attendancePercent}%` : 'N/A'}
                  </p>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Class Teachers</p>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>{teacherNames}</p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <Link href={`/dashboard/admin?classId=${sections[0]?.id}`} style={{ flex: 1, textAlign: 'center', padding: '0.5rem', background: 'var(--primary-bg)', color: 'var(--primary)', borderRadius: '6px', fontSize: '0.875rem', fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <LayoutDashboard size={16} /> Dashboard
                </Link>
              </div>
            </div>
          );
        })}
      </div>
      
      {classes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          <p>No classes exist yet.</p>
          <button onClick={() => setShowCreate(true)} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Create your first class</button>
        </div>
      )}
    </div>
  );
}
