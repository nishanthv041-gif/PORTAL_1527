import { getParentAndSelectedChild } from "../parentChildHelper";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import ChildSwitcher from "../ChildSwitcher";
import ParentChildBanner from "../ParentChildBanner";
import { Calendar as CalendarIcon, Clock, MapPin, User, Building2, Home } from "lucide-react";
import Link from "next/link";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

export default async function ParentTimetablePage({
  searchParams
}: {
  searchParams: Promise<{ childId?: string }>
}) {
  const resolvedSearchParams = await searchParams;
  const { parent, children, selectedChild } = await getParentAndSelectedChild(resolvedSearchParams.childId);

  if (!parent || children.length === 0) {
    return (
      <div className={styles.dashboard}>
        <h1 className={styles.title}>Class Timetable</h1>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No children are linked to your parent account.</p>
        </div>
      </div>
    );
  }

  if (!selectedChild) return null;

  const childClass = selectedChild.class;
  const isHostel = selectedChild.residenceType?.toUpperCase().includes("HOSTEL");

  let scheduleSlots: Array<{
    id: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    period: number;
    classroom: string | null;
    isBreak: boolean;
    subject: {
      name: string;
      code: string;
      teacher: { user: { name: string } } | null;
    } | null;
  }> = [];

  if (selectedChild.classId) {
    scheduleSlots = await prisma.timetable.findMany({
      where: {
        classId: selectedChild.classId
      },
      include: {
        subject: {
          include: {
            teacher: {
              include: { user: true }
            }
          }
        }
      },
      orderBy: [
        { period: 'asc' },
        { startTime: 'asc' }
      ]
    });
  }

  // Group slots by day
  const scheduleByDay: Record<string, typeof scheduleSlots> = {};
  DAYS.forEach(day => {
    scheduleByDay[day] = scheduleSlots.filter(s => s.dayOfWeek.toUpperCase() === day);
  });

  const hasAnySchedule = scheduleSlots.length > 0;

  return (
    <div className={styles.dashboard}>
      {/* Header with ChildSwitcher */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap', 
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <CalendarIcon className="text-primary" size={28} />
            Class Timetable & Schedule
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', marginBottom: 0, fontSize: '0.9rem' }}>
            Weekly period schedule for <strong>{selectedChild.firstName} {selectedChild.lastName}</strong> {childClass ? `(${childClass.name} - ${childClass.section})` : ''}
          </p>
        </div>

        <ChildSwitcher studentList={children} selectedChildId={selectedChild.id} />
      </div>

      {/* Child Class Banner with Child Switching Option */}
      <ParentChildBanner 
        selectedChild={selectedChild} 
        studentList={children} 
        activePage="timetable" 
      />

      {!childClass ? (
        <div style={{ background: 'var(--card-bg)', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
          <Clock size={40} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>No Class Assigned</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            This student has not been assigned to a class, so no timetable is available.
          </p>
        </div>
      ) : !hasAnySchedule ? (
        <div style={{ background: 'var(--card-bg)', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
          <Clock size={40} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>No Timetable Published Yet</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
            The school administrator has not published the schedule for {childClass.name} - Section {childClass.section} yet.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {DAYS.map(day => {
            const slots = scheduleByDay[day] || [];
            if (slots.length === 0) return null;

            return (
              <div 
                key={day}
                style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                  <CalendarIcon size={18} className="text-primary" />
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--primary)' }}>
                    {day}
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                    {slots.length} Periods Scheduled
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                  {slots.map(slot => (
                    <div 
                      key={slot.id}
                      style={{
                        padding: '1rem',
                        backgroundColor: slot.isBreak ? 'rgba(0,0,0,0.03)' : 'var(--background)',
                        border: `1px solid ${slot.isBreak ? 'var(--border-color)' : 'rgba(99, 102, 241, 0.2)'}`,
                        borderRadius: '10px',
                        display: 'flex',
                        gap: '0.85rem',
                        alignItems: 'flex-start'
                      }}
                    >
                      <div style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: '6px',
                        backgroundColor: slot.isBreak ? 'rgba(0,0,0,0.08)' : 'rgba(99, 102, 241, 0.12)',
                        color: slot.isBreak ? 'var(--text-secondary)' : 'var(--primary)',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        minWidth: '48px',
                        textAlign: 'center'
                      }}>
                        {slot.isBreak ? "BREAK" : `P${slot.period}`}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--foreground)' }}>
                          {slot.isBreak ? "Break / Recess" : (slot.subject?.name || "Subject")}
                        </div>

                        {slot.subject && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600, marginTop: '0.15rem' }}>
                            {slot.subject.code}
                          </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                          <Clock size={13} />
                          <span>{slot.startTime} - {slot.endTime}</span>
                        </div>

                        {slot.subject?.teacher && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                            <User size={13} />
                            <span>{slot.subject.teacher.user.name}</span>
                          </div>
                        )}

                        {slot.classroom && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                            <MapPin size={13} />
                            <span>Room: {slot.classroom}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
