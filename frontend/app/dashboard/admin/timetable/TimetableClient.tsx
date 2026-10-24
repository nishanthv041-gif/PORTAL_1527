"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar as CalendarIcon, Clock, Edit, Save, Trash2, X, MapPin, Coffee, Loader2, Upload, FileSpreadsheet, Sparkles } from "lucide-react";
import { createTimetableSlotAction, deleteTimetableSlotAction, bulkCreateTimetableSlotsAction } from "@/backend/api/actions/dashboard/admin/timetable/actions";
import { Class, Timetable, Subject, Teacher, User, CalendarEvent } from "@prisma/client";
import TimetableScanModal from "./TimetableScanModal";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];
const DEFAULT_TIMES = {
  1: { start: "08:00", end: "08:45" },
  2: { start: "08:45", end: "09:30" },
  3: { start: "09:30", end: "10:15" },
  4: { start: "10:30", end: "11:15" },
  5: { start: "11:15", end: "12:00" },
  6: { start: "12:45", end: "13:30" },
  7: { start: "13:30", end: "14:15" },
  8: { start: "14:15", end: "15:00" },
};

type TeacherWithUser = Teacher & { user: User };
type SubjectWithTeacher = Subject & { teacher: TeacherWithUser | null };
type TimetableWithRelations = Timetable & { subject: SubjectWithTeacher | null };

export default function TimetableClient({
  classes,
  initialClassId,
  timetableData,
  availableSubjects,
  events,
  weekOf
}: {
  classes: Class[];
  initialClassId: string;
  timetableData: TimetableWithRelations[];
  availableSubjects: SubjectWithTeacher[];
  events: CalendarEvent[];
  weekOf: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedClass, setSelectedClass] = useState(initialClassId);
  const [selectedWeek, setSelectedWeek] = useState(weekOf);
  const [editingSlot, setEditingSlot] = useState<{ day: string, period: number } | null>(null);
  const [editData, setEditData] = useState({ subjectId: "", startTime: "", endTime: "", classroom: "", isBreak: false });
  const [actionError, setActionError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(timetableData.length > 0);
  const [showScanModal, setShowScanModal] = useState(false);

  const selectedClassObj = classes.find(c => c.id === selectedClass);
  const selectedClassName = selectedClassObj ? `${selectedClassObj.name} - ${selectedClassObj.section}` : "";

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const classId = e.target.value;
    setSelectedClass(classId);
    startTransition(() => {
      router.push(`/dashboard/admin/timetable?classId=${classId}&weekOf=${selectedWeek}`);
    });
  };

  const handleWeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const week = e.target.value;
    setSelectedWeek(week);
    startTransition(() => {
      router.push(`/dashboard/admin/timetable?classId=${selectedClass}&weekOf=${week}`);
    });
  };

  const startEdit = (day: string, period: number, slotData: TimetableWithRelations | undefined) => {
    setActionError(null);
    setEditingSlot({ day, period });
    setEditData({
      subjectId: slotData?.subjectId || "",
      startTime: slotData?.startTime || DEFAULT_TIMES[period as keyof typeof DEFAULT_TIMES].start,
      endTime: slotData?.endTime || DEFAULT_TIMES[period as keyof typeof DEFAULT_TIMES].end,
      classroom: slotData?.classroom || "",
      isBreak: slotData?.isBreak || false
    });
  };

  const saveSlot = async (day: string, period: number) => {
    setActionError(null);
    const formData = new FormData();
    formData.set("classId", selectedClass);
    formData.set("dayOfWeek", day);
    formData.set("period", period.toString());
    formData.set("subjectId", editData.subjectId);
    formData.set("startTime", editData.startTime);
    formData.set("endTime", editData.endTime);
    formData.set("classroom", editData.classroom);
    formData.set("isBreak", editData.isBreak ? "true" : "false");

    startTransition(async () => {
      const res = await createTimetableSlotAction(formData);
      if (res.error) {
        setActionError(res.error);
      } else {
        setEditingSlot(null);
      }
    });
  };

  const deleteSlot = async (id: string) => {
    if (confirm("Are you sure you want to remove this slot?")) {
      startTransition(async () => {
        const res = await deleteTimetableSlotAction(id);
        if (res.error) setActionError(res.error);
      });
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      {isPending && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: "var(--primary)", animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite', zIndex: 50 }} />
      )}
      
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '2rem', background: 'var(--card-bg)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', flexWrap: 'wrap', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Select Class</label>
          <select 
            value={selectedClass} 
            onChange={handleClassChange}
            disabled={isPending}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--input-bg)', color: 'inherit' }}
          >
            <option value="">-- Choose Class --</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name} - {c.section}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Week Of (Monday)</label>
          <input 
            type="date"
            value={selectedWeek}
            onChange={handleWeekChange}
            disabled={isPending}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--input-bg)', color: 'inherit', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {selectedClass ? (
        !isInitialized && timetableData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <CalendarIcon size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
            <p style={{ marginBottom: '1rem' }}>No timetable set up for this class yet.</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button 
                onClick={() => setIsInitialized(true)}
                style={{ padding: '0.75rem 1.5rem', background: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}
              >
                Create Timetable
              </button>
              <button
                type="button"
                onClick={() => setShowScanModal(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', background: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}
              >
                <Sparkles size={18} style={{ color: 'var(--primary)' }} /> Upload & Scan Timetable
              </button>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.01)' }}>
              <button
                type="button"
                onClick={() => setShowScanModal(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'var(--primary)', color: 'var(--primary-fg)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem' }}
              >
                <Sparkles size={16} /> Upload & Scan File (Photo, PDF, Excel, Word)
              </button>
            </div>
            {actionError && (
              <div style={{ background: 'var(--danger-bg)', color: "var(--danger)", padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{actionError}</span>
                <button onClick={() => setActionError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><X size={16} /></button>
              </div>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.02)' }}>Day / Period</th>
                  {PERIODS.map(p => (
                    <th key={p} style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', borderRight: p < 8 ? '1px solid var(--border-color)' : 'none', background: 'rgba(0,0,0,0.02)', textAlign: 'center', minWidth: '150px' }}>
                      Period {p}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400, marginTop: '0.25rem' }}>
                        {DEFAULT_TIMES[p as keyof typeof DEFAULT_TIMES].start} - {DEFAULT_TIMES[p as keyof typeof DEFAULT_TIMES].end}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day, dayIndex) => {
                  const currentDayDate = new Date(selectedWeek);
                  currentDayDate.setDate(currentDayDate.getDate() + dayIndex);
                  
                  const dayEvents = events.filter(e => {
                    const s = new Date(e.date);
                    s.setHours(0,0,0,0);
                    const d = new Date(currentDayDate);
                    d.setHours(0,0,0,0);
                    
                    if (e.endDate) {
                      const end = new Date(e.endDate);
                      end.setHours(0,0,0,0);
                      return d >= s && d <= end;
                    }
                    return d.getTime() === s.getTime();
                  });

                  return (
                    <tr key={day} style={{ backgroundColor: dayEvents.length > 0 ? 'rgba(99, 102, 241, 0.02)' : 'transparent' }}>
                      <td style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontWeight: 600, background: dayEvents.length > 0 ? 'rgba(99, 102, 241, 0.05)' : 'rgba(0,0,0,0.02)', verticalAlign: 'top' }}>
                        <div>{day}</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                          {currentDayDate.toLocaleDateString()}
                        </div>
                        {dayEvents.length > 0 && (
                          <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            {dayEvents.map(e => (
                              <div
                                key={e.id}
                                title={`${e.title} (${e.startTime} - ${e.endTime || ''})`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  fontSize: '0.72rem',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '6px',
                                  background: 'rgba(99, 102, 241, 0.12)',
                                  color: 'var(--primary)',
                                  border: '1px solid rgba(99, 102, 241, 0.25)',
                                  fontWeight: 600,
                                  lineHeight: 1.2
                                }}
                              >
                                <span>📅</span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}>
                                  {e.title}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      {PERIODS.map(p => {
                        const slot = timetableData.find(t => t.dayOfWeek?.toUpperCase() === day.toUpperCase() && t.period === p);
                        const isEditing = editingSlot?.day?.toUpperCase() === day.toUpperCase() && editingSlot?.period === p;
                        const hasEventOverlap = dayEvents.length > 0;

                        return (
                          <td key={p} style={{
                            padding: '0.75rem',
                            borderBottom: '1px solid var(--border-color)',
                            borderRight: p < 8 ? '1px solid var(--border-color)' : 'none',
                            verticalAlign: 'top',
                            position: 'relative',
                            height: '110px',
                            background: hasEventOverlap ? 'rgba(99, 102, 241, 0.02)' : 'transparent'
                          }}>
                            {/* Delicate light accent for event day */}
                            {hasEventOverlap && (
                              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'rgba(99, 102, 241, 0.35)', pointerEvents: 'none' }} />
                            )}
                            
                            <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
                            {isEditing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', height: '100%', justifyContent: 'flex-start' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
                                <input type="checkbox" checked={editData.isBreak} onChange={(e) => setEditData({...editData, isBreak: e.target.checked})} />
                                Is Break
                              </label>
                              {!editData.isBreak && (
                                <select 
                                  value={editData.subjectId}
                                  onChange={(e) => setEditData({...editData, subjectId: e.target.value})}
                                  style={{ width: '100%', padding: '0.25rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                                >
                                  <option value="">Select Subject</option>
                                  {availableSubjects.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.teacher?.user?.name || 'No Teacher'})</option>
                                  ))}
                                </select>
                              )}
                              <input type="text" placeholder="Room/Location" value={editData.classroom} onChange={(e) => setEditData({...editData, classroom: e.target.value})} style={{ width: '100%', padding: '0.25rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }} />
                              <div style={{ display: 'flex', gap: '0.25rem' }}>
                                <input type="time" value={editData.startTime} onChange={(e) => setEditData({...editData, startTime: e.target.value})} style={{ width: '50%', padding: '0.25rem', fontSize: '0.75rem' }} />
                                <input type="time" value={editData.endTime} onChange={(e) => setEditData({...editData, endTime: e.target.value})} style={{ width: '50%', padding: '0.25rem', fontSize: '0.75rem' }} />
                              </div>
                              <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'space-between' }}>
                                <button onClick={() => saveSlot(day, p)} disabled={isPending} style={{ flex: 1, padding: '0.25rem', background: "var(--success)", color: "var(--success-fg)", border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
                                  {isPending ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }}/> : <Save size={12} />}
                                </button>
                                <button onClick={() => setEditingSlot(null)} disabled={isPending} style={{ flex: 1, padding: '0.25rem', background: "var(--danger)", color: "var(--danger-fg)", border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}><X size={12} /></button>
                              </div>
                            </div>
                          ) : slot ? (
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: slot.isBreak ? 'rgba(245, 158, 11, 0.05)' : 'rgba(79, 70, 229, 0.05)', borderRadius: '6px', padding: '0.5rem', border: `1px solid ${slot.isBreak ? 'rgba(245, 158, 11, 0.2)' : 'rgba(79, 70, 229, 0.2)'}` }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: slot.isBreak ? '#d97706' : 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                  {slot.isBreak ? <><Coffee size={14}/> Break</> : slot.subject?.name}
                                </span>
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                  <button onClick={() => startEdit(day, p, slot)} disabled={isPending} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: "var(--text-secondary)" }}><Edit size={12} /></button>
                                  <button onClick={() => deleteSlot(slot.id)} disabled={isPending} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: "var(--danger)" }}><Trash2 size={12} /></button>
                                </div>
                              </div>
                              {!slot.isBreak && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  {slot.subject?.teacher?.user?.name || 'No Teacher'}
                                </span>
                              )}
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <Clock size={10} /> {slot.startTime} - {slot.endTime}
                              </span>
                              {slot.classroom && (
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <MapPin size={10} /> {slot.classroom}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <button onClick={() => startEdit(day, p, undefined)} disabled={isPending} style={{ background: 'transparent', border: '1px dashed var(--border-color)', color: 'var(--text-secondary)', borderRadius: '6px', padding: '0.5rem', width: '100%', height: '100%', cursor: 'pointer', fontSize: '0.875rem', transition: 'all 0.2s ease' }}>
                                + Add
                              </button>
                            </div>
                            )}
                            </div>
                          </td>
                        );
                      })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <CalendarIcon size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
          <p>Please select a class to manage its timetable.</p>
        </div>
      )}

      {showScanModal && selectedClass && (
        <TimetableScanModal
          isOpen={showScanModal}
          selectedClassId={selectedClass}
          selectedClassName={selectedClassName}
          availableSubjects={availableSubjects}
          onClose={() => setShowScanModal(false)}
          onSaveSuccess={() => {
            setIsInitialized(true);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
