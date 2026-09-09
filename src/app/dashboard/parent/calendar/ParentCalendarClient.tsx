"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type EventData = {
  id: string, 
  title: string, 
  type: string, 
  date: string, 
  startTime: string, 
  endTime: string, 
  location: string | null, 
  targetClass: string | null, 
  targetSection: string | null, 
  description: string | null, 
  organizer: string | null, 
  audience: string, 
  status: string, 
  isPublished: boolean, 
  createdAt: string, 
  endDate: string | null
};

export default function ParentCalendarClient({ initialEvents }: { initialEvents: EventData[] }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = () => setCurrentDate(new Date());

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

  const getEventsForDay = (day: number) => {
    return initialEvents.filter(e => {
      const eDate = new Date(e.date);
      return eDate.getFullYear() === year && eDate.getMonth() === month && eDate.getDate() === day;
    });
  };

  const isToday = (day: number) => {
    const d = new Date();
    return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>
          {monthNames[month]} {year}
        </h2>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={today} style={{ padding: '0.5rem 1rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'transparent', cursor: 'pointer', fontWeight: 500 }}>
            Today
          </button>
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
            <button onClick={prevMonth} style={{ padding: '0.5rem', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <ChevronLeft size={20} />
            </button>
            <div style={{ width: '1px', background: 'var(--border-color)' }}></div>
            <button onClick={nextMonth} style={{ padding: '0.5rem', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: 'var(--border-color)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
        {/* Day Headers */}
        {dayNames.map(day => (
          <div key={day} style={{ padding: '1rem', background: 'var(--card-bg)', textAlign: 'center', fontWeight: 600, fontSize: '0.875rem' }}>
            {day}
          </div>
        ))}
        
        {/* Empty cells before first day */}
        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
          <div key={`empty-${i}`} style={{ background: 'rgba(0,0,0,0.02)', minHeight: '120px' }}></div>
        ))}

        {/* Days */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dayEvents = getEventsForDay(day);
          const activeToday = isToday(day);

          return (
            <div key={day} style={{ background: 'var(--card-bg)', minHeight: '120px', padding: '0.5rem', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                <span style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  width: '24px', 
                  height: '24px', 
                  borderRadius: '50%', 
                  background: activeToday ? 'var(--primary)' : 'transparent',
                  color: activeToday ? 'white' : 'var(--foreground)',
                  fontWeight: activeToday ? 600 : 400,
                  fontSize: '0.875rem'
                }}>
                  {day}
                </span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto', flex: 1 }}>
                {dayEvents.map(event => (
                  <div key={event.id} title={`${event.title}\n${event.startTime} - ${event.endTime}`} style={{ 
                    padding: '0.25rem 0.5rem', 
                    borderRadius: '4px', 
                    background: `${getEventColor(event.type)}20`, 
                    color: getEventColor(event.type),
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    borderLeft: `3px solid ${getEventColor(event.type)}`
                  }}>
                    {event.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        
        {/* Empty cells after last day to complete grid */}
        {Array.from({ length: (7 - ((firstDayOfMonth + daysInMonth) % 7)) % 7 }).map((_, i) => (
          <div key={`empty-end-${i}`} style={{ background: 'rgba(0,0,0,0.02)', minHeight: '120px' }}></div>
        ))}
      </div>
    </div>
  );
}
