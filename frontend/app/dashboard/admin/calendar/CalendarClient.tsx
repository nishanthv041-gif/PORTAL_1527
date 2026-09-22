"use client";

import { useState } from "react";
import { Plus, Trash2, Calendar as CalendarIcon, MapPin, Clock, Users } from "lucide-react";
import { createEventAction, deleteEventAction } from "@/backend/api/actions/dashboard/admin/calendar/actions";

import { CalendarEvent } from "@prisma/client";

export default function CalendarClient({ events }: { events: CalendarEvent[] }) {
  const [view, setView] = useState<'Day' | 'Week' | 'Month'>('Day');
  const [showCreate, setShowCreate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filteredEvents = events.filter(e => {
    const eventDate = new Date(e.date);
    eventDate.setHours(0,0,0,0);
    
    if (view === 'Day') return eventDate.getTime() === today.getTime();
    if (view === 'Week') {
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);
      return eventDate >= today && eventDate <= nextWeek;
    }
    if (view === 'Month') {
      return eventDate.getMonth() === today.getMonth() && eventDate.getFullYear() === today.getFullYear();
    }
    return true;
  });

  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const result = await createEventAction(formData);

    setIsSubmitting(false);

    if (result?.error) {
      setError(result.error);
    } else {
      setShowCreate(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this event?")) {
      await deleteEventAction(id);
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'EXAM': return "var(--danger)";
      case 'HOLIDAY': return "var(--success)";
      case 'PROGRAM': return '#8b5cf6';
      case 'MEETING': return "var(--warning)";
      case 'COMPETITION': return '#ec4899';
      default: return "var(--primary)";
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          {['Day', 'Week', 'Month'].map(v => (
            <button
              key={v}
              onClick={() => setView(v as 'Day' | 'Week' | 'Month')}
              style={{
                padding: '0.5rem 1rem',
                background: view === v ? 'var(--primary)' : 'transparent',
                color: view === v ? 'white' : 'var(--foreground)',
                border: 'none',
                cursor: 'pointer',
                fontWeight: view === v ? 600 : 400
              }}
            >
              {v}
            </button>
          ))}
        </div>

        <button 
          onClick={() => setShowCreate(!showCreate)}
          style={{ padding: '0.75rem 1.5rem', backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {showCreate ? "Cancel" : <><Plus size={18} /> Create Event</>}
        </button>
      </div>

      {showCreate && (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Create New Event</h2>
          
          {error && (
            <div style={{ background: 'var(--danger-bg)', color: "var(--danger)", padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--danger)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleCreateSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Event Title *</label>
              <input required name="title" type="text" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Event Type *</label>
              <select required name="type" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}>
                <option value="EXAM">Exam</option>
                <option value="HOLIDAY">Holiday</option>
                <option value="PROGRAM">School Program</option>
                <option value="SPORTS">Sports</option>
                <option value="CULTURAL">Cultural</option>
                <option value="MEETING">Meeting</option>
                <option value="WORKSHOP">Workshop</option>
                <option value="COMPETITION">Competition</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Start Date *</label>
              <input required name="date" type="date" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>End Date (Optional)</label>
              <input name="endDate" type="date" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Audience *</label>
              <select required name="audience" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}>
                <option value="ALL">All (Everyone)</option>
                <option value="STUDENTS">Students Only</option>
                <option value="TEACHERS">Teachers Only</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Start Time *</label>
              <input required name="startTime" type="time" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>End Time *</label>
              <input required name="endTime" type="time" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Venue / Location</label>
              <input name="location" type="text" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Target Class (Optional)</label>
              <input name="targetClass" type="text" placeholder="e.g. Grade 10" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Description</label>
              <textarea name="description" rows={3} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}></textarea>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gridColumn: 'span 2' }}>
              <button 
                type="submit" 
                disabled={isSubmitting}
                style={{ padding: '0.75rem 2rem', backgroundColor: "var(--success)", color: "var(--success-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
              >
                {isSubmitting ? "Creating..." : "Save Event"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {filteredEvents.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
            <CalendarIcon size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
            <p>No events found for the selected {view.toLowerCase()}.</p>
          </div>
        )}

        {filteredEvents.map(event => {
          const color = getEventColor(event.type);
          return (
            <div key={event.id} style={{ display: 'flex', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
              <div style={{ width: '8px', background: color }}></div>
              <div style={{ padding: '1.5rem', flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', background: `${color}20`, color: color }}>
                      {event.type}
                    </span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <CalendarIcon size={14} /> {new Date(event.date).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>{event.title}</h3>
                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Clock size={16} /> {event.startTime} - {event.endTime}
                    </span>
                    {event.location && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <MapPin size={16} /> {event.location}
                      </span>
                    )}
                    {event.targetClass && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Users size={16} /> {event.targetClass} {event.targetSection}
                      </span>
                    )}
                  </div>
                  {event.description && (
                    <p style={{ fontSize: '0.875rem', marginTop: '0.75rem', opacity: 0.8 }}>{event.description}</p>
                  )}
                </div>
                
                <button 
                  onClick={() => handleDelete(event.id)}
                  style={{ background: 'none', border: 'none', color: "var(--danger)", cursor: 'pointer', padding: '0.5rem', borderRadius: '8px' }}
                  title="Delete Event"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
