"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Plus, LayoutDashboard, Trash2, UserCheck, Check, School, Pencil } from "lucide-react";
import Link from "next/link";
import { createSubjectAction, deleteSubjectGroupByName } from "@/backend/api/actions/dashboard/admin/subjects/actions";
import { Subject, Class, Teacher, User, Student, Mark } from "@prisma/client";
import EditSubjectModal from "./EditSubjectModal";

type TeacherWithUser = Teacher & { user: User };
type SubjectWithRelations = Subject & {
  class: Class & { students: Student[] };
  teacher: TeacherWithUser | null;
  marks: Mark[];
};

export default function SubjectListClient({ 
  subjects, 
  classes, 
  teachers 
}: { 
  subjects: SubjectWithRelations[]; 
  classes: Class[]; 
  teachers: TeacherWithUser[]; 
}) {
  const router = useRouter();
  const [subjectList, setSubjectList] = useState(subjects);
  const [showCreate, setShowCreate] = useState(false);
  const [editingSubject, setEditingSubject] = useState<{ name: string; instances: SubjectWithRelations[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [classStaffMap, setClassStaffMap] = useState<Record<string, string>>({});
  const [subjectName, setSubjectName] = useState("");

  // Sync state if props change
  useState(() => {
    setSubjectList(subjects);
  });

  const toggleClass = (classId: string) => {
    if (selectedClasses.includes(classId)) {
      setSelectedClasses(prev => prev.filter(c => c !== classId));
      setClassStaffMap(prev => {
        const next = { ...prev };
        delete next[classId];
        return next;
      });
    } else {
      setSelectedClasses(prev => [...prev, classId]);
    }
  };

  const handleStaffChange = (classId: string, teacherId: string) => {
    setClassStaffMap(prev => ({
      ...prev,
      [classId]: teacherId
    }));
  };

  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (selectedClasses.length === 0) {
      setError("Please select at least one class for this subject.");
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    // Package class assignments: each class with its chosen teacher
    const assignments = selectedClasses.map(classId => ({
      classId,
      teacherId: classStaffMap[classId] || null
    }));
    formData.set("classAssignments", JSON.stringify(assignments));
    formData.set("classIds", selectedClasses.join(","));

    const result = await createSubjectAction(formData);

    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else {
      setShowCreate(false);
      setSelectedClasses([]);
      setClassStaffMap({});
      setSubjectName("");
      router.refresh();
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSubjectName(e.target.value);
  };

  const handleDeleteSubjectGroup = async (name: string) => {
    if (!confirm(`WARNING: This will permanently delete subject "${name}" across all classes, including associated timetable entries and marks. This cannot be undone. Are you sure?`)) {
      return;
    }

    const previousSubjects = [...subjectList];
    // 0ms instant optimistic removal
    setSubjectList(prev => prev.filter(s => s.name !== name));

    const res = await deleteSubjectGroupByName(name);
    if (res?.error) {
      alert(res.error);
      setSubjectList(previousSubjects); // Rollback on error
    } else {
      router.refresh();
    }
  };

  // Group subjects by shared name across all classes
  const groupedSubjects = subjectList.reduce((acc, curr) => {
    if (!acc[curr.name]) acc[curr.name] = [];
    acc[curr.name].push(curr);
    return acc;
  }, {} as Record<string, SubjectWithRelations[]>);

  return (
    <div>
      {/* Top Action Bar: Add Subject Button (CSV buttons removed) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <button 
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          style={{ 
            padding: '0.75rem 1.5rem', 
            backgroundColor: "var(--primary)", 
            color: "var(--primary-fg, #ffffff)", 
            border: 'none', 
            borderRadius: '8px', 
            fontWeight: 600, 
            cursor: 'pointer', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
            fontSize: '0.875rem'
          }}
        >
          {showCreate ? "Cancel" : <><Plus size={18} /> Add Subject</>}
        </button>
      </div>

      {showCreate && (
        <div style={{ 
          background: 'var(--card-bg)', 
          borderRadius: '16px', 
          padding: '1.75rem', 
          border: '1px solid var(--border-color)', 
          marginBottom: '2rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookOpen size={20} className="text-primary" />
            Add New Subject
          </h2>
          
          {error && (
            <div style={{ 
              background: 'var(--danger-bg)', 
              color: "var(--danger)", 
              padding: '1rem', 
              borderRadius: '8px', 
              marginBottom: '1.5rem', 
              border: '1px solid var(--danger)',
              fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleCreateSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>Subject Name *</label>
              <input 
                required 
                name="name" 
                type="text" 
                placeholder="e.g. Mathematics" 
                value={subjectName}
                onChange={handleNameChange}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} 
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>Subject Code *</label>
              <input 
                required 
                name="code" 
                type="text" 
                placeholder="e.g. MATH101" 
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} 
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>Max Marks</label>
              <input 
                type="number" 
                name="maxMarks" 
                defaultValue="100" 
                min="1"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} 
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>Passing Marks</label>
              <input 
                type="number" 
                name="passMarks" 
                defaultValue="35" 
                min="0"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} 
              />
            </div>

            {/* Class Selection & Teacher Assignment Section */}
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                  Assign to Classes &amp; Teachers * ({selectedClasses.length} selected)
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedClasses(classes.map(c => c.id))}
                    style={{ fontSize: '0.75rem', background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Select All
                  </button>
                  <span style={{ color: 'var(--border-color)' }}>|</span>
                  <button
                    type="button"
                    onClick={() => { setSelectedClasses([]); setClassStaffMap({}); }}
                    style={{ fontSize: '0.75rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Class Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: selectedClasses.length > 0 ? '1rem' : 0 }}>
                {classes.map(cls => {
                  const isSelected = selectedClasses.includes(cls.id);
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => toggleClass(cls.id)}
                      style={{
                        padding: '0.45rem 0.85rem',
                        borderRadius: '8px',
                        border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                        background: isSelected ? 'var(--primary)' : 'transparent',
                        color: isSelected ? '#ffffff' : 'inherit',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {isSelected && <Check size={14} />}
                      {cls.name} - {cls.section}
                    </button>
                  );
                })}
              </div>

              {/* Individual Staff Assignment per Selected Class */}
              {selectedClasses.length > 0 && (
                <div style={{ 
                  background: 'rgba(0,0,0,0.02)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '12px', 
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  maxHeight: '260px',
                  overflowY: 'auto'
                }}>
                  <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Assign a specific teacher for each selected class (optional):
                  </p>
                  {selectedClasses.map(classId => {
                    const cls = classes.find(c => c.id === classId);
                    if (!cls) return null;
                    return (
                      <div key={classId} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        gap: '1rem',
                        padding: '0.5rem 0.75rem',
                        background: 'var(--card-bg)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        flexWrap: 'wrap'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <School size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                            {cls.name} - {cls.section}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '0 0 240px' }}>
                          <UserCheck size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                          <select
                            value={classStaffMap[classId] || ""}
                            onChange={(e) => handleStaffChange(classId, e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.45rem',
                              borderRadius: '6px',
                              border: '1px solid var(--border-color)',
                              background: 'transparent',
                              fontSize: '0.825rem',
                              color: 'inherit'
                            }}
                          >
                            <option value="">No Teacher Assigned</option>
                            {teachers.map(t => (
                              <option key={t.id} value={t.id}>{t.user.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gridColumn: '1 / -1' }}>
              <button 
                type="submit" 
                disabled={isSubmitting}
                style={{ 
                  width: '100%', 
                  padding: '0.85rem', 
                  backgroundColor: "var(--success)", 
                  color: "var(--success-fg, #ffffff)", 
                  border: 'none', 
                  borderRadius: '8px', 
                  fontWeight: 600, 
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  fontSize: '0.95rem'
                }}
              >
                {isSubmitting ? "Creating Subject..." : "Create Subject"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Subject Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '1.25rem', width: '100%', minWidth: 0 }}>
        {Object.keys(groupedSubjects).sort().map(subjectName => {
          const instances = groupedSubjects[subjectName];
          const subjectCode = instances[0]?.code || "";
          
          const teachersSet = new Set<string>();
          instances.forEach((subj) => {
            if (subj.teacher) teachersSet.add(subj.teacher.user.name);
          });
          const teacherNames = Array.from(teachersSet).join(', ') || 'Unassigned';

          return (
            <div 
              key={subjectName} 
              style={{ 
                background: 'var(--card-bg)', 
                borderRadius: '16px', 
                padding: '1.5rem', 
                border: '1px solid var(--border-color)', 
                display: 'flex', 
                flexDirection: 'column',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
              }}
            >
              {/* Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', letterSpacing: '-0.01em' }}>
                    {subjectName}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
                    {subjectCode && (
                      <span style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 600, 
                        background: 'var(--primary-bg)', 
                        color: 'var(--primary)', 
                        padding: '2px 8px', 
                        borderRadius: '6px' 
                      }}>
                        {subjectCode}
                      </span>
                    )}
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      Taught in {instances.length} {instances.length === 1 ? 'class' : 'classes'}
                    </span>
                  </div>
                </div>
                <div style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', padding: '0.6rem', borderRadius: '10px' }}>
                  <BookOpen size={22} />
                </div>
              </div>

              {/* Class Badges */}
              <div style={{ marginBottom: '1.25rem', flex: 1 }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600 }}>Enrolled Classes</p>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {[...instances].sort((a, b) => `${a.class.name}-${a.class.section}`.localeCompare(`${b.class.name}-${b.class.section}`)).map(subj => (
                    <span 
                      key={subj.id}
                      style={{ 
                        fontSize: '0.75rem', 
                        padding: '3px 8px', 
                        background: 'rgba(0,0,0,0.03)', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: '6px',
                        fontWeight: 500
                      }}
                    >
                      {subj.class.name} - {subj.class.section}
                    </span>
                  ))}
                </div>
              </div>

              {/* Teaching Staff */}
              <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, marginBottom: '0.25rem', fontWeight: 600 }}>Teaching Staff</p>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0, color: 'var(--foreground)' }}>
                  {teacherNames}
                </p>
              </div>

              {/* Action Buttons: View Details, Edit, & Instant Delete */}
              <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                <Link 
                  href={`/dashboard/admin/subjects/${encodeURIComponent(subjectName)}`} 
                  style={{ 
                    flex: '1 1 auto', 
                    textAlign: 'center', 
                    padding: '0.6rem 0.75rem', 
                    background: 'var(--primary-bg)', 
                    color: 'var(--primary)', 
                    borderRadius: '8px', 
                    fontSize: '0.85rem', 
                    fontWeight: 600, 
                    textDecoration: 'none', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '0.35rem' 
                  }}
                >
                  <LayoutDashboard size={14} /> View
                </Link>

                <button
                  type="button"
                  onClick={() => setEditingSubject({ name: subjectName, instances })}
                  title={`Edit ${subjectName}`}
                  style={{ 
                    flex: '1 1 auto', 
                    textAlign: 'center', 
                    padding: '0.6rem 0.75rem', 
                    background: 'rgba(234, 179, 8, 0.12)', 
                    color: 'var(--warning, #eab308)', 
                    border: '1px solid rgba(234, 179, 8, 0.25)', 
                    borderRadius: '8px', 
                    fontSize: '0.85rem', 
                    fontWeight: 600, 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '0.35rem',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Pencil size={14} /> Edit
                </button>
                
                <button
                  type="button"
                  onClick={() => handleDeleteSubjectGroup(subjectName)}
                  title={`Delete ${subjectName}`}
                  style={{ 
                    flex: '1 1 auto', 
                    textAlign: 'center', 
                    padding: '0.6rem 0.75rem', 
                    background: 'var(--danger-bg)', 
                    color: "var(--danger)", 
                    border: '1px solid rgba(239, 68, 68, 0.2)', 
                    borderRadius: '8px', 
                    fontSize: '0.85rem', 
                    fontWeight: 600, 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '0.35rem',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          );
        })}

        {Object.keys(groupedSubjects).length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
            <BookOpen size={36} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
            <p style={{ margin: 0, fontWeight: 500 }}>No subjects exist yet. Click &quot;Add Subject&quot; above to create one.</p>
          </div>
        )}
      </div>

      {/* Edit Subject Modal */}
      {editingSubject && (
        <EditSubjectModal
          subjectName={editingSubject.name}
          instances={editingSubject.instances}
          classes={classes}
          teachers={teachers}
          isOpen={true}
          onClose={() => setEditingSubject(null)}
          onSuccess={() => {
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
