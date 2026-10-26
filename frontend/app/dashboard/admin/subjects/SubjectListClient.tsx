"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Plus, LayoutDashboard, Trash2, UserCheck, Check, School, FileSpreadsheet, Download } from "lucide-react";
import Link from "next/link";
import { createSubjectAction, deleteSubjectGroupByName, importSubjectsFromCsvAction } from "@/backend/api/actions/dashboard/admin/subjects/actions";
import { Subject, Class, Teacher, User, Student, Mark } from "@prisma/client";

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
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvMessage, setCsvMessage] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
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

  const handleCsvSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) return;
    setCsvLoading(true);
    setCsvError(null);
    setCsvMessage(null);
    const fd = new FormData();
    fd.set("file", csvFile);
    const res = await importSubjectsFromCsvAction(fd);
    setCsvLoading(false);
    if (res.error) {
      setCsvError(res.error);
    } else {
      setCsvMessage(`Successfully imported/updated ${res.count} subject(s)!`);
      setCsvFile(null);
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <a 
          href="/templates/subject_upload_template.csv" 
          download="subject_upload_template.csv"
          style={{ 
            padding: '0.75rem 1.25rem', 
            background: 'var(--card-bg)', 
            color: 'inherit', 
            border: '1px solid var(--border-color)', 
            borderRadius: '8px', 
            fontWeight: 600, 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            textDecoration: 'none',
            fontSize: '0.875rem'
          }}
        >
          <Download size={16} /> Download CSV Template
        </a>
        <button 
          type="button"
          onClick={() => { setShowCsvUpload(!showCsvUpload); setShowCreate(false); }}
          style={{ 
            padding: '0.75rem 1.25rem', 
            background: showCsvUpload ? 'var(--primary)' : 'rgba(99, 102, 241, 0.1)', 
            color: showCsvUpload ? '#ffffff' : 'var(--primary)', 
            border: '1px solid var(--primary)', 
            borderRadius: '8px', 
            fontWeight: 600, 
            cursor: 'pointer', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            fontSize: '0.875rem'
          }}
        >
          <FileSpreadsheet size={16} /> {showCsvUpload ? "Close CSV Import" : "Import via CSV"}
        </button>
        <button 
          type="button"
          onClick={() => { setShowCreate(!showCreate); setShowCsvUpload(false); }}
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

      {showCsvUpload && (
        <div style={{
          background: 'var(--card-bg)',
          borderRadius: '16px',
          padding: '1.75rem',
          border: '1px solid var(--border-color)',
          marginBottom: '2rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileSpreadsheet size={20} className="text-primary" />
            Bulk Import Subjects via CSV / Excel
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            Upload a CSV containing <code>name, code, maxMarks, passMarks, class, teacherEmail</code> to batch activate subjects and assign teachers.
          </p>

          {csvError && (
            <div style={{ background: 'var(--danger-bg)', color: "var(--danger)", padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid var(--danger)', fontSize: '0.875rem' }}>
              {csvError}
            </div>
          )}
          {csvMessage && (
            <div style={{ background: 'var(--success-bg)', color: "var(--success)", padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid var(--success)', fontSize: '0.875rem' }}>
              {csvMessage}
            </div>
          )}

          <form onSubmit={handleCsvSubmit} style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input 
              type="file" 
              accept=".csv,.xlsx,.xls" 
              required
              onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              style={{ padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'transparent' }} 
            />
            <button 
              type="submit" 
              disabled={csvLoading || !csvFile}
              style={{
                padding: '0.65rem 1.5rem',
                backgroundColor: 'var(--primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {csvLoading ? "Uploading..." : "Upload & Activate Subjects"}
            </button>
          </form>
        </div>
      )}

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
                value={subjectName} 
                onChange={handleNameChange} 
                type="text" 
                placeholder="e.g. Science" 
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'inherit' }} 
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>Subject Code *</label>
              <input 
                required 
                name="code" 
                type="text" 
                defaultValue={subjectName ? subjectName.substring(0, 3).toUpperCase() : ""} 
                placeholder="e.g. SCI" 
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'inherit' }} 
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>Max Marks *</label>
              <input 
                required 
                name="maxMarks" 
                type="number" 
                defaultValue="100" 
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'inherit' }} 
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>Pass Marks *</label>
              <input 
                required 
                name="passMarks" 
                type="number" 
                defaultValue="35" 
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'inherit' }} 
              />
            </div>

            {/* Class Selecting Option with Inline Staff Assigning */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Select Classes & Assign Teaching Staff *
              </label>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Click to select each class where this subject is taught, and assign the teaching staff for that class.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: '0.85rem', width: '100%', minWidth: 0 }}>
                {classes.map(c => {
                  const isSelected = selectedClasses.includes(c.id);

                  return (
                    <div 
                      key={c.id} 
                      style={{ 
                        border: isSelected ? '1.5px solid var(--primary)' : '1px solid var(--border-color)', 
                        background: isSelected ? 'rgba(99, 102, 241, 0.04)' : 'var(--card-bg)', 
                        borderRadius: '10px', 
                        padding: '0.85rem',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem'
                      }}
                    >
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => toggleClass(c.id)}
                          style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                        />
                        <School size={16} color="var(--primary)" />
                        <span>{c.name} - Section {c.section}</span>
                      </label>

                      {isSelected && (
                        <div style={{ paddingLeft: '1.6rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <UserCheck size={12} /> Assign Teaching Staff:
                          </span>
                          <select
                            value={classStaffMap[c.id] || ""}
                            onChange={(e) => handleStaffChange(c.id, e.target.value)}
                            style={{ 
                              width: '100%', 
                              padding: '0.45rem 0.65rem', 
                              borderRadius: '6px', 
                              border: '1px solid var(--border-color)', 
                              background: 'var(--card-bg)', 
                              color: 'inherit',
                              fontSize: '0.8rem' 
                            }}
                          >
                            <option value="">Leave Unassigned</option>
                            {teachers.map(t => (
                              <option key={t.id} value={t.id}>{t.user.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
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

              {/* Action Buttons: View Details & Instant Delete */}
              <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <Link 
                  href={`/dashboard/admin/subjects/${encodeURIComponent(subjectName)}`} 
                  style={{ 
                    flex: 1, 
                    textAlign: 'center', 
                    padding: '0.65rem 1rem', 
                    background: 'var(--primary-bg)', 
                    color: 'var(--primary)', 
                    borderRadius: '8px', 
                    fontSize: '0.875rem', 
                    fontWeight: 600, 
                    textDecoration: 'none', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '0.5rem' 
                  }}
                >
                  <LayoutDashboard size={15} /> View Details
                </Link>
                
                <button
                  type="button"
                  onClick={() => handleDeleteSubjectGroup(subjectName)}
                  title={`Delete ${subjectName}`}
                  style={{ 
                    flex: 1, 
                    textAlign: 'center', 
                    padding: '0.65rem 1rem', 
                    background: 'var(--danger-bg)', 
                    color: "var(--danger)", 
                    border: '1px solid rgba(239, 68, 68, 0.2)', 
                    borderRadius: '8px', 
                    fontSize: '0.875rem', 
                    fontWeight: 600, 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '0.5rem',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Trash2 size={15} /> Delete
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
    </div>
  );
}
