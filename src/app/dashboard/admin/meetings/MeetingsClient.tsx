"use client";

import { useState } from "react";
import { Plus, Calendar, Clock, MapPin, Link as LinkIcon, Trash2, Users } from "lucide-react";
import { createMeetingAction, deleteMeetingAction } from "./actions";
import { Meeting, Teacher, Parent, User, Class } from "@prisma/client";

type TeacherWithUser = Teacher & { user: User };
type ParentWithUser = Parent & { user: User };
type MeetingWithRelations = Meeting & {
  teachers: TeacherWithUser[];
  parents: ParentWithUser[];
};

export default function MeetingsClient({ meetings, teachers, parents, classes }: { meetings: MeetingWithRelations[], teachers: TeacherWithUser[], parents: ParentWithUser[], classes: Class[] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [parentMode, setParentMode] = useState<string>("ALL_TEACHERS");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    formData.append("parentMode", parentMode);
    const res = await createMeetingAction(formData);
    setIsSubmitting(false);
    if (res.error) {
      alert(res.error);
    } else {
      setShowCreate(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this meeting?")) {
      const res = await deleteMeetingAction(id);
      if (res.error) alert(res.error);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
        <button 
          onClick={() => setShowCreate(!showCreate)}
          style={{ padding: '0.75rem 1.5rem', backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {showCreate ? "Cancel" : <><Plus size={18} /> Schedule Meeting</>}
        </button>
      </div>

      {showCreate && (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '2rem', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Schedule New Meeting</h2>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Teachers (Multi-select) *</label>
              <select required multiple name="teacherIds" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', minHeight: '100px' }}>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>{t.user.name}</option>
                ))}
              </select>
              <small style={{ color: 'var(--text-secondary)' }}>Hold Ctrl/Cmd to select multiple</small>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Audience Mode *</label>
              <select value={parentMode} onChange={e => setParentMode(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', marginBottom: '1rem' }}>
                <option value="ALL_STUDENTS">All Students</option>
                <option value="ALL_TEACHERS">All Teachers</option>
                <option value="SINGLE_CLASS">Single Class</option>
                <option value="SELECTED_PARENTS">Selected Parents</option>
              </select>
              
              {parentMode === "SINGLE_CLASS" && (
                <>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Select Class *</label>
                  <select required name="classId" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}>
                    <option value="">Choose Class</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name} {c.section}</option>
                    ))}
                  </select>
                </>
              )}

              {parentMode === "SELECTED_PARENTS" && (
                <>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Select Parents (Multi-select) *</label>
                  <select required multiple name="parentIds" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', minHeight: '100px' }}>
                    {parents.map(p => (
                      <option key={p.id} value={p.id}>{p.user.name}</option>
                    ))}
                  </select>
                  <small style={{ color: 'var(--text-secondary)' }}>Hold Ctrl/Cmd to select multiple</small>
                </>
              )}
              
              {parentMode === "ALL_TEACHERS" && (
                <input type="hidden" name="allTeachers" value="true" />
              )}
              {parentMode === "ALL_STUDENTS" && (
                <input type="hidden" name="allStudents" value="true" />
              )}
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Date *</label>
              <input required name="date" type="date" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Time *</label>
              <input required name="time" type="time" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Agenda / Topic *</label>
              <input required name="agenda" type="text" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Location / Room</label>
              <input name="location" type="text" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Meeting Link (Virtual)</label>
              <input name="link" type="url" placeholder="https://..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button disabled={isSubmitting} type="submit" style={{ padding: '0.75rem 2rem', backgroundColor: "var(--success)", color: "var(--success-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}>
                {isSubmitting ? "Scheduling..." : "Schedule Meeting"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
        {meetings.map(meeting => (
          <div key={meeting.id} style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: 'var(--primary)' }}>{meeting.agenda}</h3>
                <button onClick={() => handleDelete(meeting.id)} style={{ background: 'transparent', border: 'none', color: "var(--danger)", cursor: 'pointer', padding: '0.25rem' }}>
                  <Trash2 size={16} />
                </button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                  <Users size={16} color="var(--text-secondary)" style={{ marginTop: '2px' }} />
                  <div>
                    <div style={{ marginBottom: '4px' }}>
                      <strong style={{ color: 'var(--text-secondary)' }}>Teachers:</strong> {meeting.teachers.map(t => t.user.name).join(', ')}
                    </div>
                    {meeting.parents.length > 0 && (
                      <div>
                        <strong style={{ color: 'var(--text-secondary)' }}>Parents:</strong> {meeting.parents.length > 3 ? `${meeting.parents.length} Parents` : meeting.parents.map(p => p.user.name).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  <Calendar size={16} /> {new Date(meeting.date).toLocaleDateString()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  <Clock size={16} /> {meeting.time}
                </div>
                {meeting.location && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    <MapPin size={16} /> {meeting.location}
                  </div>
                )}
                {meeting.link && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: "var(--primary)", fontSize: '0.875rem' }}>
                    <LinkIcon size={16} /> <a href={meeting.link} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Join Meeting</a>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {meetings.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <p>No meetings scheduled.</p>
          </div>
        )}
      </div>
    </div>
  );
}
