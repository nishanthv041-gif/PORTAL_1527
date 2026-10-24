"use client";

import { useState, useEffect } from "react";
import { 
  Calendar as CalendarIcon, Clock, MapPin, User, 
  BookOpen, Sparkles, CheckCircle2, PlayCircle, 
  CalendarDays, ChevronRight, GraduationCap
} from "lucide-react";

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const SCHOOL_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

type ClassType = {
  id: string;
  name: string;
  section: string;
};

type TimetableSlot = {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  period: number;
  classroom: string | null;
  isBreak: boolean;
  classId: string;
  class: {
    id: string;
    name: string;
    section: string;
  };
  subject: {
    id: string;
    name: string;
    code: string;
    teacher: {
      id: string;
      user: { name: string };
    } | null;
  } | null;
};

export default function TeacherTimetableClient({
  classes,
  initialClassId,
  teacherSchedule,
  classTimetableMap,
  teacherName
}: {
  classes: ClassType[];
  initialClassId: string;
  teacherSchedule: TimetableSlot[];
  classTimetableMap: Record<string, TimetableSlot[]>;
  teacherName: string;
}) {
  const [viewMode, setViewMode] = useState<"class" | "mySchedule">("class");
  const [selectedClassId, setSelectedClassId] = useState<string>(initialClassId || (classes[0]?.id || ""));
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const todayIndex = currentTime.getDay();
  const todayDayName = DAYS[todayIndex];
  const isSchoolDay = SCHOOL_DAYS.includes(todayDayName);
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

  const getSlotMinutes = (timeStr: string) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(":").map(p => parseInt(p, 10));
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  };

  // Active slots depending on view mode
  const currentClassSlots = classTimetableMap[selectedClassId] || [];
  const activeSlots = viewMode === "class" ? currentClassSlots : teacherSchedule;

  const todaySlots = activeSlots
    .filter(s => s.dayOfWeek.toUpperCase() === todayDayName)
    .sort((a, b) => a.period - b.period);

  const currentOngoingSlot = todaySlots.find(slot => {
    const startM = getSlotMinutes(slot.startTime);
    const endM = getSlotMinutes(slot.endTime);
    return currentMinutes >= startM && currentMinutes < endM;
  });

  const nextUpcomingSlot = todaySlots.find(slot => {
    const startM = getSlotMinutes(slot.startTime);
    return currentMinutes < startM;
  });

  const getSlotStatus = (slot: TimetableSlot) => {
    const startM = getSlotMinutes(slot.startTime);
    const endM = getSlotMinutes(slot.endTime);
    if (currentMinutes >= endM) return "COMPLETED";
    if (currentMinutes >= startM && currentMinutes < endM) return "ONGOING";
    return "UPCOMING";
  };

  const selectedClassObj = classes.find(c => c.id === selectedClassId);

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      {/* View Switcher: Class Timetable vs My Teaching Schedule */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem", width: "100%" }}>
        <div style={{ display: "flex", gap: "0.5rem", background: "var(--card-bg)", padding: "0.35rem", borderRadius: "10px", border: "1px solid var(--border-color)", flexWrap: "wrap" }}>
          <button
            onClick={() => setViewMode("class")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.55rem 1.15rem",
              borderRadius: "8px",
              border: "none",
              background: viewMode === "class" ? "var(--primary)" : "transparent",
              color: viewMode === "class" ? "var(--primary-fg)" : "inherit",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer"
            }}
          >
            <GraduationCap size={16} /> Class Timetable
          </button>

          <button
            onClick={() => setViewMode("mySchedule")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.55rem 1.15rem",
              borderRadius: "8px",
              border: "none",
              background: viewMode === "mySchedule" ? "var(--primary)" : "transparent",
              color: viewMode === "mySchedule" ? "var(--primary-fg)" : "inherit",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer"
            }}
          >
            <BookOpen size={16} /> My Teaching Schedule ({teacherSchedule.length})
          </button>
        </div>

        {/* Class Selector for Class Timetable view */}
        {viewMode === "class" && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Select Class:
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              style={{
                padding: "0.55rem 1rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                background: "var(--card-bg)",
                color: "inherit",
                fontSize: "0.875rem",
                fontWeight: 600
              }}
            >
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} - Section {c.section}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

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
                ON-TIME CLASS SCHEDULE
              </span>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                {currentTime.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} • {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <h2 style={{ margin: "0.5rem 0 0.25rem 0", fontSize: "1.25rem", fontWeight: 700 }}>
              {isSchoolDay ? (
                currentOngoingSlot ? (
                  <span>
                    Current Period: <strong style={{ color: "var(--primary)" }}>{currentOngoingSlot.isBreak ? "Break / Recess" : currentOngoingSlot.subject?.name}</strong> (P{currentOngoingSlot.period})
                    {viewMode === "mySchedule" && ` • Class ${currentOngoingSlot.class.name}-${currentOngoingSlot.class.section}`}
                  </span>
                ) : (
                  <span>
                    {viewMode === "mySchedule" ? "Free Period / No Teaching Class Right Now" : `No Active Class for ${selectedClassObj?.name || "Class"} Right Now`}
                  </span>
                )
              ) : (
                <span>Weekend — School Not In Session</span>
              )}
            </h2>

            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              {viewMode === "class" 
                ? `Viewing full timetable & live on-time schedule for ${selectedClassObj?.name || ""} - ${selectedClassObj?.section || ""}`
                : `Teaching schedule for ${teacherName}`
              }
            </p>
          </div>

          {/* Quick Ongoing / Next Cards */}
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
                  {currentOngoingSlot.classroom && ` • Rm ${currentOngoingSlot.classroom}`}
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
                  <Clock size={12} /> Starts {nextUpcomingSlot.startTime}
                  {nextUpcomingSlot.classroom && ` • Rm ${nextUpcomingSlot.classroom}`}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TIMETABLE CONTENT */}
      {activeSlots.length === 0 ? (
        <div style={{ background: "var(--card-bg)", border: "1px dashed var(--border-color)", borderRadius: "12px", padding: "3rem", textAlign: "center" }}>
          <Clock size={40} style={{ opacity: 0.3, marginBottom: "1rem" }} />
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600 }}>
            {viewMode === "class" ? "No Timetable Published for this Class" : "You have no teaching slots assigned yet"}
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", maxWidth: "420px", margin: "0.5rem auto 0" }}>
            {viewMode === "class" 
              ? "The school administrator has not published a timetable for this class yet."
              : "Check with the school administrator to assign your teaching subjects and periods."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
          {SCHOOL_DAYS.map(day => {
            const daySlots = activeSlots
              .filter(s => s.dayOfWeek.toUpperCase() === day)
              .sort((a, b) => a.period - b.period);

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
                  {daySlots.map(slot => {
                    const status = isToday ? getSlotStatus(slot) : "UPCOMING";
                    const isOngoing = status === "ONGOING";
                    const isCompleted = status === "COMPLETED";

                    return (
                      <div
                        key={slot.id}
                        style={{
                          padding: "1rem",
                          backgroundColor: slot.isBreak 
                            ? "rgba(0,0,0,0.02)" 
                            : isOngoing 
                            ? "rgba(16, 185, 129, 0.08)" 
                            : "var(--background)",
                          border: `1px solid ${isOngoing ? "#10b981" : slot.isBreak ? "var(--border-color)" : "rgba(99, 102, 241, 0.15)"}`,
                          borderRadius: "10px",
                          display: "flex",
                          gap: "0.85rem",
                          alignItems: "flex-start",
                          opacity: isCompleted ? 0.75 : 1
                        }}
                      >
                        <div style={{
                          padding: "0.35rem 0.65rem",
                          borderRadius: "6px",
                          backgroundColor: slot.isBreak 
                            ? "rgba(0,0,0,0.06)" 
                            : isOngoing 
                            ? "#10b981" 
                            : "rgba(99, 102, 241, 0.1)",
                          color: slot.isBreak 
                            ? "var(--text-secondary)" 
                            : isOngoing 
                            ? "#ffffff" 
                            : "var(--primary)",
                          fontWeight: 700,
                          fontSize: "0.75rem",
                          minWidth: "48px",
                          textAlign: "center"
                        }}>
                          {slot.isBreak ? "BREAK" : `P${slot.period}`}
                        </div>

                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.4rem" }}>
                            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--foreground)" }}>
                              {slot.isBreak ? "Break / Recess" : (slot.subject?.name || "Subject")}
                            </div>
                            {isOngoing && (
                              <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#10b981", background: "rgba(16, 185, 129, 0.15)", padding: "0.15rem 0.4rem", borderRadius: "4px" }}>
                                LIVE
                              </span>
                            )}
                          </div>

                          {viewMode === "mySchedule" && slot.class && (
                            <div style={{ fontSize: "0.8rem", color: "var(--primary)", fontWeight: 600, marginTop: "0.2rem" }}>
                              Class {slot.class.name} - {slot.class.section}
                            </div>
                          )}

                          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: "0.35rem" }}>
                            <Clock size={13} />
                            <span>{slot.startTime} - {slot.endTime}</span>
                          </div>

                          {viewMode === "class" && slot.subject?.teacher && (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: "0.2rem" }}>
                              <User size={13} />
                              <span>{slot.subject.teacher.user.name}</span>
                            </div>
                          )}

                          {slot.classroom && (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: "0.2rem" }}>
                              <MapPin size={13} />
                              <span>Room {slot.classroom}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
