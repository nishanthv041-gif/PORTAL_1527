"use client";

import { useState } from "react";
import { Plus, Eye, EyeOff, Calendar as CalendarIcon, MapPin, Clock, Trash2 } from "lucide-react";
import { createProgramAction, updateProgramStatusAction, deleteProgramAction } from "@/backend/api/actions/dashboard/admin/programs/actions";
import { CalendarEvent } from "@prisma/client";

export default function ProgramsClient({ programs }: { programs: CalendarEvent[] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const res = await createProgramAction(formData);
    setIsSubmitting(false);
    if (res.error) {
      alert(res.error);
    } else {
      setShowCreate(false);
    }
  };

  const togglePublish = async (id: string, currentStatus: boolean) => {
    const res = await updateProgramStatusAction(id, !currentStatus);
    if (res.error) alert(res.error);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this program?")) {
      const res = await deleteProgramAction(id);
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
          {showCreate ? "Cancel" : <><Plus size={18} /> Add Program</>}
        </button>
      </div>

      {showCreate && (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '2rem', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Add New Program</h2>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Program Title *</label>
              <input required name="title" type="text" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Date *</label>
              <input required name="date" type="date" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Start Time *</label>
              <input required name="startTime" type="time" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>End Time *</label>
              <input required name="endTime" type="time" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Location / Venue</label>
              <input name="location" type="text" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Description</label>
              <textarea name="description" rows={3} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', resize: 'vertical' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Organizer (Optional)</label>
              <input name="organizer" type="text" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.5rem' }}>
              <input type="checkbox" name="isPublished" value="true" defaultChecked style={{ width: '1rem', height: '1rem' }} />
              <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Publish immediately</label>
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button disabled={isSubmitting} type="submit" style={{ padding: '0.75rem 2rem', backgroundColor: "var(--success)", color: "var(--success-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}>
                {isSubmitting ? "Saving..." : "Save Program"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
        {programs.map(prog => (
          <div key={prog.id} style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{prog.title}</h3>
                <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderRadius: '12px', background: prog.status === 'UPCOMING' ? 'var(--primary-bg)' : 'rgba(107, 114, 128, 0.1)', color: prog.status === 'UPCOMING' ? 'var(--primary)' : "var(--text-secondary)", fontWeight: 600 }}>
                  {prog.status}
                </span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  <CalendarIcon size={16} /> {new Date(prog.date).toLocaleDateString()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  <Clock size={16} /> {prog.startTime} - {prog.endTime}
                </div>
                {prog.location && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    <MapPin size={16} /> {prog.location}
                  </div>
                )}
              </div>
              
              {prog.description && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5, background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: '8px', margin: 0 }}>
                  {prog.description}
                </p>
              )}
            </div>
            
            <div style={{ padding: '1rem 1.5rem', background: 'rgba(0,0,0,0.02)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button 
                onClick={() => togglePublish(prog.id, prog.isPublished)}
                style={{ 
                  background: 'transparent', 
                  color: prog.isPublished ? "var(--success)" : "var(--text-secondary)", 
                  border: 'none', 
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                {prog.isPublished ? <><Eye size={16} /> Published</> : <><EyeOff size={16} /> Draft</>}
              </button>
              
              <button onClick={() => handleDelete(prog.id)} style={{ background: 'transparent', border: 'none', color: "var(--danger)", cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {programs.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <p>No programs scheduled.</p>
          </div>
        )}
      </div>
    </div>
  );
}
