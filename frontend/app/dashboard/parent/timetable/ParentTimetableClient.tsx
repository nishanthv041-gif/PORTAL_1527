"use client";

import { useState, useEffect } from "react";
import {
  Calendar as CalendarIcon, Clock, MapPin, User,
  Sparkles, CheckCircle2, PlayCircle, AlertCircle,
  CalendarDays, ChevronRight
} from "lucide-react";

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const SCHOOL_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

type SlotType = {
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
};

export default function ParentTimetableClient({
  childName,
  className,
  scheduleSlots,
  activeSubstitutions = {},
}: {
  childName: string;
  className: string;
  scheduleSlots: SlotType[];
  activeSubstitutions?: Record<string, {
    substituteTeacherName: string;
    absentTeacherName: string;
    note?: string | null;
  }>;
}) {
  const [activeTab, setActiveTab] = useState<"today" | "week">("today");
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const todayIndex = currentTime.getDay(); // 0 is Sunday
  const todayDayName = DAYS[todayIndex];
  const isSchoolDay = SCHOOL_DAYS.includes(todayDayName);

  // Filter slots for today
  const todaySlots = scheduleSlots
    .filter(s => s.dayOfWeek.toUpperCase() === todayDayName)
    .sort((a, b) => a.period - b.period);

  // Group slots by day for full week
  const scheduleByDay: Record<string, SlotType[]> = {};
  SCHOOL_DAYS.forEach(day => {
    scheduleByDay[day] = scheduleSlots
      .filter(s => s.dayOfWeek.toUpperCase() === day)
      .sort((a, b) => a.period - b.period);
  });

  // Calculate ongoing period right now
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

  const getSlotMinutes = (timeStr: string) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(":").map(p => parseInt(p, 10));
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  };

  const currentOngoingSlot = todaySlots.find(slot => {
    const startM = getSlotMinutes(slot.startTime);
    const endM = getSlotMinutes(slot.endTime);
    return currentMinutes >= startM && currentMinutes < endM;
  });

  const nextUpcomingSlot = todaySlots.find(slot => {
    const startM = getSlotMinutes(slot.startTime);
    return currentMinutes < startM;
  });

  const getSlotStatus = (slot: SlotType) => {
    const startM = getSlotMinutes(slot.startTime);
    const endM = getSlotMinutes(slot.endTime);
    if (currentMinutes >= endM) return "COMPLETED";
    if (currentMinutes >= startM && currentMinutes < endM) return "ONGOING";
    return "UPCOMING";
  };

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      {/* Live On-Time Class Tracker Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.08) 100%)",
          border: "1px solid rgba(99, 102, 241, 0.25)",
          borderRadius: "16px",
          padding: "1.5rem",
          marginBottom: "1.75rem",
          boxShadow: "0 4px 15px rgba(99, 102, 241, 0.05)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                background: currentOngoingSlot ? "#10b981" : "var(--primary)",
                color: "#ffffff",
                fontSize: "0.75rem",
                fontWeight: 700,
                padding: "0.25rem 0.65rem",
                borderRadius: "20px"
              }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#ffffff", animation: "pulse 2s infinite" }} />
                LIVE ON-TIME TRACKER
              </span>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                {currentTime.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} • {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <h2 style={{ margin: "0.5rem 0 0.25rem 0", fontSize: "1.25rem", fontWeight: 700 }}>
              {isSchoolDay ? (
                currentOngoingSlot ? (
                  <span>
                    Currently in: <strong style={{ color: "var(--primary)" }}>{currentOngoingSlot.isBreak ? "Break / Recess" : currentOngoingSlot.subject?.name}</strong> (Period {currentOngoingSlot.period})
                  </span>
                ) : (
                  <span>
                    No Active Class Right Now ({todaySlots.length} periods scheduled for today)
                  </span>
                )
              ) : (
                <span>Weekend — No Classes Scheduled Today</span>
              )}
            </h2>

            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              Live class schedule for <strong>{childName}</strong> • {className}
            </p>
          </div>

          {/* Quick Status Cards */}
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            {currentOngoingSlot && (
              <div style={{ background: "var(--card-bg)", padding: "0.75rem 1.25rem", borderRadius: "10px", border: "1px solid var(--border-color)", minWidth: "160px" }}>
                <div style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <PlayCircle size={14} /> ONGOING NOW
                </div>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", marginTop: "0.2rem" }}>
                  {currentOngoingSlot.isBreak ? "Break Time" : currentOngoingSlot.subject?.name}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.25rem", marginTop: "0.2rem" }}>
                  <Clock size={12} /> {currentOngoingSlot.startTime} - {currentOngoingSlot.endTime}
                  {currentOngoingSlot.classroom && ` • Room ${currentOngoingSlot.classroom}`}
                </div>
              </div>
            )}

            {nextUpcomingSlot && (
              <div style={{ background: "var(--card-bg)", padding: "0.75rem 1.25rem", borderRadius: "10px", border: "1px solid var(--border-color)", minWidth: "160px" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--primary)", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <ChevronRight size={14} /> UPCOMING NEXT
                </div>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", marginTop: "0.2rem" }}>
                  {nextUpcomingSlot.isBreak ? "Break" : nextUpcomingSlot.subject?.name} (P{nextUpcomingSlot.period})
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.25rem", marginTop: "0.2rem" }}>
                  <Clock size={12} /> Starts at {nextUpcomingSlot.startTime}
                  {nextUpcomingSlot.classroom && ` • Room ${nextUpcomingSlot.classroom}`}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs: Today's Schedule (On-Time) vs Full Weekly Timetable */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>
        <button
          onClick={() => setActiveTab("today")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.6rem 1.25rem",
            borderRadius: "8px",
            border: "none",
            background: activeTab === "today" ? "var(--primary)" : "transparent",
            color: activeTab === "today" ? "var(--primary-fg)" : "var(--text-secondary)",
            fontWeight: 600,
            fontSize: "0.9rem",
            cursor: "pointer"
          }}
        >
          <Clock size={16} /> Today&apos;s Class Schedule ({todaySlots.length})
        </button>

        <button
          onClick={() => setActiveTab("week")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.6rem 1.25rem",
            borderRadius: "8px",
            border: "none",
            background: activeTab === "week" ? "var(--primary)" : "transparent",
            color: activeTab === "week" ? "var(--primary-fg)" : "var(--text-secondary)",
            fontWeight: 600,
            fontSize: "0.9rem",
            cursor: "pointer"
          }}
        >
          <CalendarDays size={16} /> Full Weekly Timetable
        </button>
      </div>

      {/* TAB 1: TODAY'S ON-TIME SCHEDULE */}
      {activeTab === "today" && (
        <div>
          {todaySlots.length === 0 ? (
            <div style={{ background: "var(--card-bg)", border: "1px dashed var(--border-color)", borderRadius: "12px", padding: "3rem", textAlign: "center" }}>
              <Clock size={40} style={{ opacity: 0.3, marginBottom: "1rem" }} />
              <h3 style={{ fontSize: "1.1rem", fontWeight: 600 }}>No classes scheduled for {todayDayName}</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", maxWidth: "400px", margin: "0.5rem auto 1rem" }}>
                Switch to the Full Weekly Timetable tab to view schedules for other days.
              </p>
              <button
                onClick={() => setActiveTab("week")}
                style={{ padding: "0.5rem 1rem", background: "var(--primary)", color: "var(--primary-fg)", border: "none", borderRadius: "6px", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}
              >
                View Full Week
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {todaySlots.map(slot => {
                const status = getSlotStatus(slot);
                const isOngoing = status === "ONGOING";
                const isCompleted = status === "COMPLETED";

                return (
                  <div
                    key={slot.id}
                    style={{
                      background: isOngoing
                        ? "linear-gradient(90deg, rgba(16, 185, 129, 0.08) 0%, var(--card-bg) 100%)"
                        : "var(--card-bg)",
                      border: `1px solid ${isOngoing ? "#10b981" : "var(--border-color)"}`,
                      borderRadius: "12px",
                      padding: "1.25rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "1.25rem",
                      boxShadow: isOngoing ? "0 4px 12px rgba(16, 185, 129, 0.12)" : "none",
                      opacity: isCompleted ? 0.75 : 1
                    }}
                  >
                    {/* Period Badge */}
                    <div
                      style={{
                        padding: "0.6rem 0.85rem",
                        borderRadius: "10px",
                        background: slot.isBreak
                          ? "rgba(0,0,0,0.06)"
                          : isOngoing
                            ? "#10b981"
                            : "rgba(99, 102, 241, 0.12)",
                        color: slot.isBreak
                          ? "var(--text-secondary)"
                          : isOngoing
                            ? "#ffffff"
                            : "var(--primary)",
                        fontWeight: 700,
                        fontSize: "0.85rem",
                        textAlign: "center",
                        minWidth: "62px"
                      }}
                    >
                      {slot.isBreak ? "BREAK" : `P${slot.period}`}
                    </div>

                    {/* Class Details */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
                          {slot.isBreak ? "Break / Recess" : (slot.subject?.name || "Subject")}
                        </h4>
                        {slot.subject?.code && (
                          <span style={{ fontSize: "0.75rem", color: "var(--primary)", fontWeight: 600, padding: "0.15rem 0.45rem", background: "rgba(99, 102, 241, 0.08)", borderRadius: "4px" }}>
                            {slot.subject.code}
                          </span>
                        )}
                        {isOngoing && (
                          <span style={{ background: "#10b981", color: "#ffffff", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.55rem", borderRadius: "12px" }}>
                            🔴 ONGOING NOW
                          </span>
                        )}
                        {isCompleted && (
                          <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.2rem" }}>
                            <CheckCircle2 size={13} style={{ color: "#10b981" }} /> Completed
                          </span>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginTop: "0.4rem", fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                          <Clock size={13} /> {slot.startTime} - {slot.endTime}
                        </span>

                        {activeSubstitutions[slot.id] ? (
                          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: "#d97706", fontWeight: 600 }}>
                            <User size={13} /> Substitute: <strong>{activeSubstitutions[slot.id].substituteTeacherName}</strong> (covering for {activeSubstitutions[slot.id].absentTeacherName})
                          </span>
                        ) : slot.subject?.teacher ? (
                          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            <User size={13} /> Teacher: <strong>{slot.subject.teacher.user.name}</strong>
                          </span>
                        ) : null}

                        {slot.classroom && (
                          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            <MapPin size={13} /> Room: <strong>{slot.classroom}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: FULL WEEKLY TIMETABLE */}
      {activeTab === "week" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
          {SCHOOL_DAYS.map(day => {
            const daySlots = scheduleByDay[day] || [];
            if (daySlots.length === 0) return null;
            const isToday = day === todayDayName;

            return (
              <div
                key={day}
                style={{
                  background: "var(--card-bg)",
                  border: `1px solid ${isToday ? "var(--primary)" : "var(--border-color)"}`,
                  borderRadius: "14px",
                  padding: "1.5rem",
                  boxShadow: isToday ? "0 4px 15px rgba(99, 102, 241, 0.08)" : "none"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <CalendarIcon size={18} className="text-primary" />
                    <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: isToday ? "var(--primary)" : "inherit" }}>
                      {day} {isToday ? "(Today)" : ""}
                    </h3>
                  </div>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    {daySlots.length} periods
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))", gap: "1rem", width: "100%", minWidth: 0 }}>
                  {daySlots.map(slot => (
                    <div
                      key={slot.id}
                      style={{
                        padding: "1rem",
                        backgroundColor: slot.isBreak ? "rgba(0,0,0,0.02)" : "var(--background)",
                        border: `1px solid ${slot.isBreak ? "var(--border-color)" : "rgba(99, 102, 241, 0.15)"}`,
                        borderRadius: "10px",
                        display: "flex",
                        gap: "0.85rem",
                        alignItems: "flex-start"
                      }}
                    >
                      <div style={{
                        padding: "0.35rem 0.65rem",
                        borderRadius: "6px",
                        backgroundColor: slot.isBreak ? "rgba(0,0,0,0.06)" : "rgba(99, 102, 241, 0.1)",
                        color: slot.isBreak ? "var(--text-secondary)" : "var(--primary)",
                        fontWeight: 700,
                        fontSize: "0.75rem",
                        minWidth: "48px",
                        textAlign: "center"
                      }}>
                        {slot.isBreak ? "BREAK" : `P${slot.period}`}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--foreground)" }}>
                          {slot.isBreak ? "Break / Recess" : (slot.subject?.name || "Subject")}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: "0.4rem" }}>
                          <Clock size={13} />
                          <span>{slot.startTime} - {slot.endTime}</span>
                        </div>

                        {isToday && activeSubstitutions[slot.id] ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "#d97706", fontSize: "0.8rem", marginTop: "0.2rem", fontWeight: 600 }}>
                            <User size={13} />
                            <span>Substitute: {activeSubstitutions[slot.id].substituteTeacherName} (covering for {activeSubstitutions[slot.id].absentTeacherName})</span>
                          </div>
                        ) : slot.subject?.teacher ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: "0.2rem" }}>
                            <User size={13} />
                            <span>{slot.subject.teacher.user.name}</span>
                          </div>
                        ) : null}

                        {slot.classroom && (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: "0.2rem" }}>
                            <MapPin size={13} />
                            <span>Room {slot.classroom}</span>
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
