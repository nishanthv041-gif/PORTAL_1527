"use client";

import { useState, useEffect } from "react";
import { Plus, Eye, EyeOff, Calendar as CalendarIcon, MapPin, Clock, Trash2, ChevronDown, ChevronUp, History, Bell, Send } from "lucide-react";
import { createProgramAction, updateProgramStatusAction, deleteProgramAction, sendProgramNotificationToAllAction } from "@/backend/api/actions/dashboard/admin/programs/actions";
import { CalendarEvent } from "@prisma/client";

export default function ProgramsClient({ 
  programs,
  classes = []
}: { 
  programs: CalendarEvent[];
  classes?: Array<{ id: string; name: string; section: string }>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("ALL");
  // Track which card has its action menu open
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

  // Close action menu when clicking outside anywhere on the page or pressing Escape
  useEffect(() => {
    if (!openMenuId) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-action-menu-container]')) {
        return;
      }
      setOpenMenuId(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuId]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filteredPrograms = programs.filter(p => {
    if (selectedClassFilter === "ALL") return true;
    return p.targetClass === selectedClassFilter || p.targetClass === "ALL" || !p.targetClass;
  });

  const upcomingPrograms = filteredPrograms.filter(p => new Date(p.date) >= today);
  const previousPrograms = filteredPrograms.filter(p => new Date(p.date) < today);

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

  const handleSendNotification = async (id: string, title: string) => {
    if (!confirm(`Send school program notification for "${title}" to everyone (all parents, teachers & staff)?`)) return;
    setNotifyingId(id);
    setOpenMenuId(null);
    const res = await sendProgramNotificationToAllAction(id);
    setNotifyingId(null);
    if (res.error) {
      alert(res.error);
    } else {
      alert(`✅ Notification sent to everyone! (${res.count ?? "all"} users notified)`);
    }
  };

  const togglePublish = async (id: string, currentStatus: boolean) => {
    const res = await updateProgramStatusAction(id, !currentStatus);
    if (res.error) alert(res.error);
    setOpenMenuId(null);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?\n\nThis action cannot be undone.`)) return;
    setDeletingId(id);
    setOpenMenuId(null);
    const res = await deleteProgramAction(id);
    setDeletingId(null);
    if (res.error) alert(res.error);
  };

  const toggleMenu = (id: string) => {
    setOpenMenuId(prev => (prev === id ? null : id));
  };

  const ProgramCard = ({ prog }: { prog: CalendarEvent }) => {
    const isPast = new Date(prog.date) < today;
    const isMenuOpen = openMenuId === prog.id;
    const isDeleting = deletingId === prog.id;

    return (
      <div
        key={prog.id}
        style={{
          background: 'var(--card-bg)',
          borderRadius: '12px',
          border: `1px solid ${isPast ? 'var(--border-color)' : 'var(--border-color)'}`,
          overflow: 'visible',
          display: 'flex',
          flexDirection: 'column',
          opacity: isDeleting ? 0.5 : 1,
          transition: 'opacity 0.2s ease',
          position: 'relative'
        }}
      >
        <div style={{ padding: '1.5rem', flex: 1 }}>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, flex: 1, marginRight: '0.75rem' }}>{prog.title}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                <span style={{
                  fontSize: '0.72rem',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '12px',
                  background: isPast
                    ? 'rgba(107, 114, 128, 0.1)'
                    : prog.status === 'UPCOMING'
                      ? 'var(--primary-bg)'
                      : 'rgba(107, 114, 128, 0.1)',
                  color: isPast
                    ? 'var(--text-secondary)'
                    : prog.status === 'UPCOMING'
                      ? 'var(--primary)'
                      : 'var(--text-secondary)',
                  fontWeight: 600,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.03em'
                }}>
                  {isPast ? 'Past' : prog.status}
                </span>

                {/* Options Menu Button */}
                <div data-action-menu-container={prog.id} style={{ position: 'relative' }}>
                  <button
                    onClick={() => toggleMenu(prog.id)}
                    title="Options"
                    disabled={isDeleting}
                    style={{
                      background: isMenuOpen ? 'var(--primary-bg)' : 'rgba(0,0,0,0.04)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      color: isMenuOpen ? 'var(--primary)' : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.2rem',
                      padding: '0.3rem 0.55rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Options
                    {isMenuOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>

                  {/* Dropdown menu */}
                  {isMenuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
                      background: 'var(--card-bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      zIndex: 50,
                      minWidth: '180px',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Send Notification to All */}
                    <button
                      onClick={() => handleSendNotification(prog.id, prog.title)}
                      disabled={notifyingId === prog.id}
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        padding: '0.6rem 1rem',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: 'var(--primary)',
                        transition: 'background 0.12s ease'
                      }}
                      onMouseOver={e => e.currentTarget.style.background = 'var(--primary-bg)'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Bell size={15} />
                      {notifyingId === prog.id ? 'Sending...' : 'Send Notification to All'}
                    </button>

                    <div style={{ height: '1px', background: 'var(--border-color)', margin: '0 0.5rem' }} />

                    {/* Publish / Unpublish */}
                    <button
                      onClick={() => togglePublish(prog.id, prog.isPublished)}
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        padding: '0.6rem 1rem',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        color: prog.isPublished ? 'var(--success)' : 'var(--text-secondary)',
                        transition: 'background 0.12s ease'
                      }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {prog.isPublished ? <><Eye size={15} /> Unpublish</> : <><EyeOff size={15} /> Publish</>}
                    </button>

                    <div style={{ height: '1px', background: 'var(--border-color)', margin: '0 0.5rem' }} />

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(prog.id, prog.title)}
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        padding: '0.6rem 1rem',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: 'var(--danger)',
                        transition: 'background 0.12s ease'
                      }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(239,68,68,0.07)'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Trash2 size={15} />
                      Delete Program
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.45rem', marginBottom: '0.85rem' }}>
            <span style={{
              fontSize: '0.75rem',
              padding: '0.2rem 0.55rem',
              borderRadius: '6px',
              background: (!prog.targetClass || prog.targetClass === 'ALL') ? 'rgba(99, 102, 241, 0.08)' : 'rgba(16, 185, 129, 0.08)',
              color: (!prog.targetClass || prog.targetClass === 'ALL') ? 'var(--primary)' : '#10b981',
              border: `1px solid ${(!prog.targetClass || prog.targetClass === 'ALL') ? 'rgba(99, 102, 241, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem'
            }}>
              {(!prog.targetClass || prog.targetClass === 'ALL') ? '🌐 All Classes' : `🏫 ${prog.targetClass}`}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: prog.description ? '1rem' : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              <CalendarIcon size={15} /> {new Date(prog.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              <Clock size={15} /> {prog.startTime} – {prog.endTime}
            </div>
            {prog.location && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                <MapPin size={15} /> {prog.location}
              </div>
            )}
          </div>

          {prog.description && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.55, background: 'rgba(0,0,0,0.02)', padding: '0.85rem 1rem', borderRadius: '8px', margin: '1rem 0 0 0' }}>
              {prog.description}
            </p>
          )}
        </div>

        {/* Card Footer — publish status indicator */}
        <div style={{ padding: '0.75rem 1.5rem', background: 'rgba(0,0,0,0.02)', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: prog.isPublished ? 'var(--success)' : 'var(--text-secondary)' }}>
          {prog.isPublished ? <Eye size={14} /> : <EyeOff size={14} />}
          <span style={{ fontWeight: 600 }}>{prog.isPublished ? 'Published' : 'Draft — Not visible to parents/teachers'}</span>
          {notifyingId === prog.id && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>Notifying all...</span>}
          {isDeleting && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 600 }}>Deleting...</span>}
        </div>
      </div>
    );
  };

  return (
    <div onClick={() => { if (openMenuId) setOpenMenuId(null); }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.75rem' }}>
        {/* Class Filter Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginRight: '0.25rem' }}>
            Filter by Class:
          </span>
          <button
            type="button"
            onClick={() => setSelectedClassFilter("ALL")}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '8px',
              border: 'none',
              background: selectedClassFilter === "ALL" ? 'var(--primary)' : 'var(--card-bg)',
              color: selectedClassFilter === "ALL" ? 'var(--primary-fg)' : 'inherit',
              boxShadow: selectedClassFilter === "ALL" ? '0 2px 6px rgba(99,102,241,0.25)' : 'none',
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            All Classes ({programs.length})
          </button>
          {classes.map(c => {
            const cName = `${c.name} - ${c.section}`;
            const count = programs.filter(p => p.targetClass === cName).length;
            const isSelected = selectedClassFilter === cName;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedClassFilter(cName)}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: isSelected ? 'var(--primary)' : 'var(--card-bg)',
                  color: isSelected ? 'var(--primary-fg)' : 'inherit',
                  boxShadow: isSelected ? '0 2px 6px rgba(99,102,241,0.25)' : 'none',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {cName} {count > 0 ? `(${count})` : ''}
              </button>
            );
          })}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); setShowCreate(!showCreate); }}
          style={{ padding: '0.75rem 1.5rem', backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {showCreate ? "Cancel" : <><Plus size={18} /> Add Program</>}
        </button>
      </div>

      {showCreate && (
        <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '2rem', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Add New Program</h2>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Program Title *</label>
              <input required name="title" type="text" placeholder="e.g. Annual Day, Science Exhibition" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
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
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Class Selection (Target Audience) *
              </label>
              <select
                name="targetClass"
                defaultValue="ALL"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'inherit', fontWeight: 500 }}
              >
                <option value="ALL">🌐 All Classes (Entire School)</option>
                {classes.length > 0 && (
                  <optgroup label="Select Individual Class">
                    {classes.map(c => {
                      const cName = `${c.name} - ${c.section}`;
                      return (
                        <option key={c.id} value={cName}>
                          🏫 {cName}
                        </option>
                      );
                    })}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Location / Venue</label>
              <input name="location" type="text" placeholder="e.g. School Auditorium, Ground" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Description</label>
              <textarea name="description" rows={3} placeholder="Program details, instructions, or agenda..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', resize: 'vertical' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Organizer (Optional)</label>
              <input name="organizer" type="text" placeholder="e.g. Cultural Committee" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.5rem' }}>
              <input type="checkbox" name="isPublished" value="true" defaultChecked style={{ width: '1rem', height: '1rem' }} />
              <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Publish immediately</label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', gridColumn: '1 / -1', padding: '0.75rem 1rem', background: 'rgba(99, 102, 241, 0.06)', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
              <input type="checkbox" id="notifyAllCheck" name="notifyAll" value="true" defaultChecked style={{ width: '1.1rem', height: '1.1rem', cursor: 'pointer' }} />
              <label htmlFor="notifyAllCheck" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Bell size={16} /> Send notification to parents, teachers &amp; staff
              </label>
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button disabled={isSubmitting} type="submit" style={{ padding: '0.75rem 2rem', backgroundColor: "var(--success)", color: "var(--success-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}>
                {isSubmitting ? "Saving..." : "Save Program"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Upcoming Programs ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
        {upcomingPrograms.map(prog => (
          <div key={prog.id} onClick={e => e.stopPropagation()}>
            <ProgramCard prog={prog} />
          </div>
        ))}
        {upcomingPrograms.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <p>No upcoming programs scheduled.</p>
          </div>
        )}
      </div>

      {/* ── Previous / Past Programs ──────────────────────────── */}
      {previousPrograms.length > 0 && (
        <div style={{ marginTop: '3rem' }}>
          <button
            onClick={e => { e.stopPropagation(); setShowPrevious(v => !v); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '1rem',
              fontWeight: 700,
              padding: '0.5rem 0',
              marginBottom: '1.25rem',
              transition: 'color 0.15s ease'
            }}
            onMouseOver={e => e.currentTarget.style.color = 'var(--foreground)'}
            onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            <History size={18} />
            Previous Programs ({previousPrograms.length})
            {showPrevious ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showPrevious && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
              {previousPrograms.map(prog => (
                <div key={prog.id} onClick={e => e.stopPropagation()}>
                  <ProgramCard prog={prog} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
