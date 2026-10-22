"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Plus, Users, LayoutDashboard, Trash2, Edit3, 
  School, UserCheck, X, Check, Loader2 
} from "lucide-react";
import Link from "next/link";
import { 
  createClassAction, 
  editClassGroupAction,
  deleteClassAction, 
  deleteClassGroupByNameAction 
} from "@/backend/api/actions/dashboard/admin/classes/actions";
import { Class, Teacher, User, Student, Attendance } from "@prisma/client";

const CLASS_OPTIONS = Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`);
const SECTION_OPTIONS = ["A", "B", "C", "D", "E"];

type TeacherWithUser = Teacher & { user: User };
type StudentWithRelations = Student & { attendances: Attendance[] };
type ClassWithRelations = Class & { 
  teacher: TeacherWithUser | null;
  students: StudentWithRelations[];
};

export default function ClassListClient({ 
  classes, 
  teachers 
}: { 
  classes: ClassWithRelations[]; 
  teachers: TeacherWithUser[]; 
}) {
  const router = useRouter();
  const [classList, setClassList] = useState(classes);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Create Class State
  const [classNameInput, setClassNameInput] = useState("");
  const [customClassName, setCustomClassName] = useState("");
  const [selectedSections, setSelectedSections] = useState<string[]>(["A"]);
  const [sectionStaffMap, setSectionStaffMap] = useState<Record<string, string>>({});
  const [createMaxStrength, setCreateMaxStrength] = useState(40);

  // Edit Class State
  const [editingClassName, setEditingClassName] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSections, setEditSections] = useState<{ id: string; section: string; maxStrength: number; teacherId: string | null }[]>([]);

  // Sync state if server props change
  useState(() => {
    setClassList(classes);
  });

  // Group classes by name
  const groupedClasses = classList.reduce((acc, curr) => {
    if (!acc[curr.name]) acc[curr.name] = [];
    acc[curr.name].push(curr);
    return acc;
  }, {} as Record<string, ClassWithRelations[]>);

  const toggleSection = (section: string) => {
    if (selectedSections.includes(section)) {
      if (selectedSections.length > 1) {
        setSelectedSections(selectedSections.filter(s => s !== section));
        setSectionStaffMap(prev => {
          const next = { ...prev };
          delete next[section];
          return next;
        });
      }
    } else {
      setSelectedSections([...selectedSections, section].sort());
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const finalClassName = classNameInput === "CUSTOM" ? customClassName.trim() : classNameInput.trim();
    if (!finalClassName) {
      setError("Please select or enter a class name.");
      return;
    }

    if (selectedSections.length === 0) {
      setError("Please select at least one section.");
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.set("name", finalClassName);
    formData.set("maxStrength", createMaxStrength.toString());

    // Package section assignments with their assigned class teacher
    const assignments = selectedSections.map(sec => ({
      section: sec,
      teacherId: sectionStaffMap[sec] || null,
      maxStrength: createMaxStrength
    }));
    formData.set("sectionAssignments", JSON.stringify(assignments));

    const result = await createClassAction(formData);

    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else {
      setShowCreate(false);
      setSelectedSections(["A"]);
      setSectionStaffMap({});
      setClassNameInput("");
      setCustomClassName("");
      router.refresh();
    }
  };

  // Start editing a class
  const handleOpenEdit = (className: string) => {
    const sections = groupedClasses[className] || [];
    setEditingClassName(className);
    setEditName(className);
    setEditSections(sections.map(s => ({
      id: s.id,
      section: s.section,
      maxStrength: s.maxStrength || 40,
      teacherId: s.teacherId || null
    })));
  };

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingClassName || !editName.trim()) return;

    setIsSubmitting(true);
    const formData = new FormData();
    formData.set("oldName", editingClassName);
    formData.set("newName", editName.trim());
    formData.set("sections", JSON.stringify(editSections));

    const res = await editClassGroupAction(formData);
    setIsSubmitting(false);

    if (res?.error) {
      alert(res.error);
    } else {
      setEditingClassName(null);
      router.refresh();
    }
  };

  // Class-wise Delete (Deletes entire class group)
  const handleDeleteClassGroup = async (className: string) => {
    if (!confirm(`WARNING: This will permanently delete "${className}" and all its sections. Enrolled students will be preserved and unassigned. This cannot be undone. Are you sure?`)) {
      return;
    }

    const previousList = [...classList];
    // 0ms instant optimistic removal
    setClassList(prev => prev.filter(c => c.name !== className));

    const res = await deleteClassGroupByNameAction(className);
    if (res?.error) {
      alert(res.error);
      setClassList(previousList); // Rollback on error
    } else {
      router.refresh();
    }
  };

  // Section-wise Delete
  const handleDeleteSection = async (sectionId: string, className: string, sectionName: string) => {
    if (!confirm(`WARNING: Are you sure you want to permanently delete ${className} - Section ${sectionName}?`)) {
      return;
    }

    const previousList = [...classList];
    setClassList(prev => prev.filter(c => c.id !== sectionId));

    const res = await deleteClassAction(sectionId);
    if (res?.error) {
      alert(res.error);
      setClassList(previousList);
    } else {
      router.refresh();
    }
  };

  return (
    <div>
      {/* Top Header Action */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
        <button 
          onClick={() => setShowCreate(!showCreate)}
          style={{ 
            padding: '0.75rem 1.5rem', 
            backgroundColor: "var(--primary)", 
            color: "var(--primary-fg, #ffffff)", 
            border: 'none', 
            borderRadius: '10px', 
            fontWeight: 600, 
            cursor: 'pointer', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
          }}
        >
          {showCreate ? "Cancel" : <><Plus size={18} /> Create Class</>}
        </button>
      </div>

      {/* Create New Class Modal / Card */}
      {showCreate && (
        <div style={{ 
          background: 'var(--card-bg)', 
          borderRadius: '16px', 
          padding: '1.75rem', 
          border: '1px solid var(--border-color)', 
          marginBottom: '2rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <School size={22} className="text-primary" />
            Create New Class
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
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>Class Name *</label>
              <select 
                required 
                value={classNameInput} 
                onChange={(e) => setClassNameInput(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'inherit' }}
              >
                <option value="">Select a class...</option>
                {CLASS_OPTIONS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value="CUSTOM">+ Custom Class Name...</option>
              </select>
              {classNameInput === "CUSTOM" && (
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. Pre-KG, Kindergarten, Grade 12"
                  value={customClassName}
                  onChange={(e) => setCustomClassName(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'inherit', marginTop: '0.5rem' }}
                />
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>Max Capacity (per section) *</label>
              <input 
                required 
                type="number" 
                min="1" 
                max="200" 
                value={createMaxStrength} 
                onChange={(e) => setCreateMaxStrength(parseInt(e.target.value) || 40)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'inherit' }} 
              />
            </div>

            {/* Sections Selection */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>Select Sections *</label>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                {SECTION_OPTIONS.map(section => {
                  const isChecked = selectedSections.includes(section);
                  return (
                    <button
                      key={section}
                      type="button"
                      onClick={() => toggleSection(section)}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        border: isChecked ? '1.5px solid var(--primary)' : '1px solid var(--border-color)',
                        background: isChecked ? 'rgba(99, 102, 241, 0.1)' : 'var(--card-bg)',
                        color: isChecked ? 'var(--primary)' : 'inherit',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                      }}
                    >
                      {isChecked && <Check size={14} />}
                      Section {section}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Class Teacher Assigning Option (Per Section) */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Class Teacher Assigning Option
              </label>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Assign the respective class teacher for each selected section:
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
                {selectedSections.map(sec => (
                  <div 
                    key={sec} 
                    style={{ 
                      padding: '0.85rem 1rem', 
                      background: 'rgba(0,0,0,0.02)', 
                      borderRadius: '10px', 
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem'
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <UserCheck size={14} color="var(--primary)" />
                      Section {sec} Class Teacher:
                    </span>
                    <select
                      value={sectionStaffMap[sec] || ""}
                      onChange={(e) => setSectionStaffMap({ ...sectionStaffMap, [sec]: e.target.value })}
                      style={{ 
                        width: '100%', 
                        padding: '0.5rem', 
                        borderRadius: '6px', 
                        border: '1px solid var(--border-color)', 
                        background: 'var(--card-bg)', 
                        color: 'inherit',
                        fontSize: '0.825rem' 
                      }}
                    >
                      <option value="">No Class Teacher (Unassigned)</option>
                      {teachers.map(t => (
                        <option key={t.id} value={t.id}>{t.user.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
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
                  borderRadius: '10px', 
                  fontWeight: 600, 
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  fontSize: '0.95rem'
                }}
              >
                {isSubmitting ? "Creating Classes..." : "Create Classes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Class Modal */}
      {editingClassName && (
        <div style={{ 
          position: 'fixed', 
          inset: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', 
          backdropFilter: 'blur(4px)', 
          zIndex: 100, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          padding: '1rem' 
        }}>
          <div style={{ 
            background: 'var(--card-bg)', 
            borderRadius: '16px', 
            padding: '1.75rem', 
            maxWidth: '650px', 
            width: '100%', 
            maxHeight: '90vh', 
            overflowY: 'auto', 
            border: '1px solid var(--border-color)',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit3 size={20} className="text-primary" />
                Edit Class: {editingClassName}
              </h2>
              <button 
                onClick={() => setEditingClassName(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Class Name *
                </label>
                <input 
                  type="text" 
                  required 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'inherit' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Sections, Max Strength &amp; Assigned Class Teachers
                </label>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {editSections.map((sec, idx) => (
                    <div 
                      key={sec.id} 
                      style={{ 
                        padding: '1rem', 
                        background: 'rgba(0,0,0,0.02)', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: '10px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: '0.75rem',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>Section</span>
                        <input 
                          type="text" 
                          required 
                          value={sec.section}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase();
                            setEditSections(prev => prev.map((s, i) => i === idx ? { ...s, section: val } : s));
                          }}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'inherit', fontWeight: 600 }}
                        />
                      </div>

                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>Capacity</span>
                        <input 
                          type="number" 
                          min="1" 
                          max="200"
                          value={sec.maxStrength}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 40;
                            setEditSections(prev => prev.map((s, i) => i === idx ? { ...s, maxStrength: val } : s));
                          }}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'inherit' }}
                        />
                      </div>

                      <div style={{ gridColumn: 'span 2' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>Class Teacher</span>
                        <select
                          value={sec.teacherId || ""}
                          onChange={(e) => {
                            const val = e.target.value || null;
                            setEditSections(prev => prev.map((s, i) => i === idx ? { ...s, teacherId: val } : s));
                          }}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'inherit', fontSize: '0.825rem' }}
                        >
                          <option value="">No Class Teacher (Unassigned)</option>
                          {teachers.map(t => (
                            <option key={t.id} value={t.id}>{t.user.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <button 
                  type="button" 
                  onClick={() => setEditingClassName(null)}
                  style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'inherit', fontWeight: 500 }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  style={{ 
                    padding: '0.75rem 1.5rem', 
                    background: 'var(--primary)', 
                    color: 'var(--primary-fg, #ffffff)', 
                    border: 'none', 
                    borderRadius: '8px', 
                    fontWeight: 600, 
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {isSubmitting ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Classes Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {Object.keys(groupedClasses).sort((a, b) => {
           const numA = parseInt(a.replace(/\D/g, '')) || 0;
           const numB = parseInt(b.replace(/\D/g, '')) || 0;
           return numA - numB;
        }).map(className => {
          const sections = groupedClasses[className];
          
          let totalStudents = 0;
          let totalPresent = 0;
          let totalAttendances = 0;
          
          const teachersList = new Set<string>();

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
            <div 
              key={className} 
              style={{ 
                background: 'var(--card-bg)', 
                borderRadius: '16px', 
                padding: '1.5rem', 
                border: '1px solid var(--border-color)', 
                display: 'flex', 
                flexDirection: 'column',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
              }}
            >
              {/* Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>{className}</h3>
                  
                  {/* Sections List without Disable button */}
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>Sections:</span>
                    {sections.sort((a, b) => a.section.localeCompare(b.section)).map((s) => (
                      <span 
                        key={s.id} 
                        style={{ 
                          background: 'rgba(99, 102, 241, 0.08)', 
                          color: 'var(--primary)',
                          padding: '0.2rem 0.55rem', 
                          borderRadius: '6px', 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '0.4rem',
                          fontWeight: 600,
                          fontSize: '0.8rem'
                        }}
                      >
                        Sec {s.section}
                        {sections.length > 1 && (
                          <button 
                            type="button"
                            onClick={() => handleDeleteSection(s.id, className, s.section)}
                            style={{ 
                              background: 'transparent', 
                              border: 'none', 
                              color: 'var(--danger)', 
                              cursor: 'pointer', 
                              padding: 0, 
                              display: 'flex', 
                              alignItems: 'center',
                              opacity: 0.7 
                            }}
                            title={`Delete Section ${s.section}`}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ background: 'var(--primary-bg)', color: 'var(--primary)', padding: '0.6rem', borderRadius: '10px' }}>
                  <Users size={22} />
                </div>
              </div>

              {/* Stats & Class Teacher Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem', flex: 1 }}>
                <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, marginBottom: '0.2rem', fontWeight: 600 }}>Total Students</p>
                  <p style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>{totalStudents}</p>
                </div>
                <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, marginBottom: '0.2rem', fontWeight: 600 }}>Avg. Attendance</p>
                  <p style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: attendancePercent >= 75 ? "var(--success)" : attendancePercent >= 60 ? "var(--warning)" : "var(--danger)" }}>
                    {totalAttendances > 0 ? `${attendancePercent}%` : 'N/A'}
                  </p>
                </div>
                <div style={{ gridColumn: 'span 2', padding: '0.75rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, marginBottom: '0.25rem', fontWeight: 600 }}>Class Teachers</p>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0, color: 'var(--foreground)' }}>{teacherNames}</p>
                </div>
              </div>

              {/* Action Buttons: Dashboard, Edit Class, Delete Class */}
              <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                <Link 
                  href={`/dashboard/admin?classId=${sections[0]?.id}`} 
                  style={{ 
                    flex: '1 1 90px', 
                    textAlign: 'center', 
                    padding: '0.55rem 0.75rem', 
                    background: 'var(--primary-bg)', 
                    color: 'var(--primary)', 
                    borderRadius: '8px', 
                    fontSize: '0.85rem', 
                    fontWeight: 600, 
                    textDecoration: 'none', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '0.4rem' 
                  }}
                >
                  <LayoutDashboard size={15} /> Dashboard
                </Link>

                {/* Edit Class Button */}
                <button
                  type="button"
                  onClick={() => handleOpenEdit(className)}
                  title={`Edit ${className}`}
                  style={{ 
                    flex: '1 1 80px', 
                    textAlign: 'center', 
                    padding: '0.55rem 0.75rem', 
                    background: 'rgba(99, 102, 241, 0.1)', 
                    color: 'var(--primary)', 
                    border: '1px solid rgba(99, 102, 241, 0.2)', 
                    borderRadius: '8px', 
                    fontSize: '0.85rem', 
                    fontWeight: 600, 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '0.4rem' 
                  }}
                >
                  <Edit3 size={15} /> Edit
                </button>

                {/* Class-wise Delete Button */}
                <button
                  type="button"
                  onClick={() => handleDeleteClassGroup(className)}
                  title={`Delete ${className}`}
                  style={{ 
                    flex: '1 1 80px', 
                    textAlign: 'center', 
                    padding: '0.55rem 0.75rem', 
                    background: 'var(--danger-bg)', 
                    color: 'var(--danger)', 
                    border: '1px solid rgba(239, 68, 68, 0.2)', 
                    borderRadius: '8px', 
                    fontSize: '0.85rem', 
                    fontWeight: 600, 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '0.4rem' 
                  }}
                >
                  <Trash2 size={15} /> Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
      
      {classList.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
          <School size={36} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <p style={{ margin: 0, fontWeight: 500 }}>No classes exist yet.</p>
          <button 
            onClick={() => setShowCreate(true)} 
            style={{ marginTop: '1rem', padding: '0.6rem 1.25rem', background: "var(--primary)", color: "var(--primary-fg, #ffffff)", border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
          >
            Create your first class
          </button>
        </div>
      )}
    </div>
  );
}
