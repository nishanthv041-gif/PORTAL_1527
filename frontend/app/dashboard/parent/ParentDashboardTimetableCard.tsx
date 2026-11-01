"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Clock,
  ArrowRight,
  User,
  MapPin,
  PlayCircle,
  CheckCircle2,
  Calendar,
  Layers,
  ChevronRight,
} from "lucide-react";

const SCHOOL_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

export interface DashboardTimetableSlot {
  id: string;
  dayOfWeek: string;
  period: number;
  startTime: string;
  endTime: string;
  classroom?: string | null;
  isBreak?: boolean;
  subjectName?: string | null;
  subjectCode?: string | null;
  regularTeacherName?: string | null;
  substituteTeacherName?: string | null;
  isFreePeriod?: boolean;
  hasExamOverlap?: boolean;
  examName?: string | null;
}

export interface WeeklyRawSlot {
  id: string;
  dayOfWeek: string;
  period: number;
  startTime: string;
  endTime: string;
  classroom?: string | null;
  isBreak: boolean;
  subject?: {
    name: string;
    code: string;
    teacher?: { user?: { name?: string | null } | null } | null;
  } | null;
}

interface ParentDashboardTimetableCardProps {
  childName: string;
  classNameStr: string;
  childId: string;
  todayDayName: string;
  todaySlots: DashboardTimetableSlot[];
  weeklySlots: WeeklyRawSlot[];
}

export default function ParentDashboardTimetableCard({
  childName,
  classNameStr,
  childId,
  todayDayName,
  todaySlots,
  weeklySlots,
}: ParentDashboardTimetableCardProps) {
  const [activeTab, setActiveTab] = useState<"today" | "weekly">("today");
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>("ALL");
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const isTodaySchoolDay = SCHOOL_DAYS.includes(todayDayName.toUpperCase());

  // Ongoing time calculation
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const getSlotMinutes = (timeStr: string) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(":").map((p) => parseInt(p, 10));
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  };

  const getSlotStatus = (slot: { startTime: string; endTime: string }) => {
    const startM = getSlotMinutes(slot.startTime);
    const endM = getSlotMinutes(slot.endTime);
    if (currentMinutes >= endM) return "COMPLETED";
    if (currentMinutes >= startM && currentMinutes < endM) return "ONGOING";
    return "UPCOMING";
  };

  // Group weekly slots by day
  const scheduleByDay: Record<string, WeeklyRawSlot[]> = {};
  SCHOOL_DAYS.forEach((d) => {
    scheduleByDay[d] = weeklySlots
      .filter((s) => s.dayOfWeek.toUpperCase() === d)
      .sort((a, b) => a.period - b.period);
  });

  // Effective days to display in weekly view
  const daysToShow =
    selectedDayFilter === "ALL"
      ? SCHOOL_DAYS.filter((d) => (scheduleByDay[d] || []).length > 0)
      : [selectedDayFilter];

  return (
    <div
      style={{
        background: "var(--card-bg, #151f32)",
        border: "1px solid var(--border-color, rgba(255, 255, 255, 0.12))",
        borderRadius: "16px",
        padding: "1.35rem 1.6rem",
        marginBottom: "1.75rem",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
      }}
    >
      {/* Header: Title, Description, and Link */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.25rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <CalendarDays size={22} color="var(--primary, #6366f1)" />
            <h3
              style={{
                margin: 0,
                fontSize: "1.15rem",
                fontWeight: 700,
                color: "var(--foreground, #ffffff)",
              }}
            >
              Class Timetable &amp; Schedule
            </h3>
          </div>
          <p
            style={{
              margin: "0.25rem 0 0 0",
              fontSize: "0.85rem",
              color: "var(--text-secondary, #94a3b8)",
            }}
          >
            Daily periods and weekly timetable for <strong>{childName}</strong>{" "}
            {classNameStr ? `(${classNameStr})` : ""}
          </p>
        </div>

        <Link
          href={`/dashboard/parent/timetable?childId=${childId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.45rem 0.95rem",
            borderRadius: "8px",
            backgroundColor: "rgba(99, 102, 241, 0.12)",
            color: "var(--primary, #6366f1)",
            fontSize: "0.825rem",
            fontWeight: 700,
            textDecoration: "none",
            transition: "all 0.15s ease",
          }}
        >
          <span>Full Timetable Page</span>
          <ArrowRight size={14} />
        </Link>
      </div>

      {/* Tabs: "Today's Schedule" vs "Weekly Timetable" */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
          paddingBottom: "0.85rem",
          borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
          marginBottom: "1.25rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => setActiveTab("today")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              border: "none",
              fontSize: "0.875rem",
              fontWeight: activeTab === "today" ? 700 : 500,
              backgroundColor:
                activeTab === "today" ? "var(--primary, #6366f1)" : "rgba(255, 255, 255, 0.05)",
              color: activeTab === "today" ? "#ffffff" : "var(--text-secondary, #94a3b8)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <Clock size={15} />
            <span>
              Today&apos;s Schedule ({todayDayName}
              {isTodaySchoolDay ? ` • ${todaySlots.length} Periods` : ""})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("weekly")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              border: "none",
              fontSize: "0.875rem",
              fontWeight: activeTab === "weekly" ? 700 : 500,
              backgroundColor:
                activeTab === "weekly" ? "var(--primary, #6366f1)" : "rgba(255, 255, 255, 0.05)",
              color: activeTab === "weekly" ? "#ffffff" : "var(--text-secondary, #94a3b8)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <Calendar size={15} />
            <span>Weekly Timetable</span>
          </button>
        </div>

        {/* Day Pills when in Weekly tab */}
        {activeTab === "weekly" && (
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setSelectedDayFilter("ALL")}
              style={{
                padding: "0.25rem 0.65rem",
                borderRadius: "6px",
                border: "none",
                fontSize: "0.75rem",
                fontWeight: selectedDayFilter === "ALL" ? 700 : 500,
                backgroundColor:
                  selectedDayFilter === "ALL"
                    ? "var(--primary, #6366f1)"
                    : "rgba(255, 255, 255, 0.06)",
                color: selectedDayFilter === "ALL" ? "#ffffff" : "var(--text-secondary, #94a3b8)",
                cursor: "pointer",
              }}
            >
              All Days
            </button>
            {SCHOOL_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDayFilter(d)}
                style={{
                  padding: "0.25rem 0.65rem",
                  borderRadius: "6px",
                  border: "none",
                  fontSize: "0.75rem",
                  fontWeight: selectedDayFilter === d ? 700 : 500,
                  backgroundColor:
                    selectedDayFilter === d
                      ? "var(--primary, #6366f1)"
                      : "rgba(255, 255, 255, 0.06)",
                  color: selectedDayFilter === d ? "#ffffff" : "var(--text-secondary, #94a3b8)",
                  cursor: "pointer",
                }}
              >
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── TAB 1: TODAY'S SCHEDULE ────────────────────────────────────────────── */}
      {activeTab === "today" && (
        <div>
          {todaySlots.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: "0.85rem",
              }}
            >
              {todaySlots.map((s) => {
                const status = isTodaySchoolDay ? getSlotStatus(s) : "UPCOMING";
                const isOngoing = status === "ONGOING";
                const isCompleted = status === "COMPLETED";
                const isSub = Boolean(s.substituteTeacherName);
                const isFree = Boolean(s.isFreePeriod);
                const isExam = Boolean(s.hasExamOverlap);

                return (
                  <div
                    key={s.id}
                    style={{
                      padding: "1rem",
                      borderRadius: "12px",
                      background: isOngoing
                        ? "linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, var(--card-bg, #151f32) 100%)"
                        : isSub
                          ? "rgba(245, 158, 11, 0.06)"
                          : isFree
                            ? "rgba(239, 68, 68, 0.05)"
                            : isExam
                              ? "rgba(168, 85, 247, 0.08)"
                              : "rgba(0, 0, 0, 0.2)",
                      border: `1px solid ${
                        isOngoing
                          ? "#10b981"
                          : isSub
                            ? "rgba(245, 158, 11, 0.35)"
                            : isFree
                              ? "rgba(239, 68, 68, 0.3)"
                              : isExam
                                ? "rgba(168, 85, 247, 0.35)"
                                : "var(--border-color, rgba(255, 255, 255, 0.08))"
                      }`,
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.45rem",
                      opacity: isCompleted ? 0.75 : 1,
                      boxShadow: isOngoing ? "0 4px 15px rgba(16, 185, 129, 0.15)" : "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {/* Period header */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: "0.78rem",
                            padding: "0.2rem 0.55rem",
                            borderRadius: "6px",
                            backgroundColor: s.isBreak
                              ? "rgba(255, 255, 255, 0.08)"
                              : isOngoing
                                ? "#10b981"
                                : "rgba(99, 102, 241, 0.15)",
                            color: s.isBreak
                              ? "var(--text-secondary, #94a3b8)"
                              : isOngoing
                                ? "#ffffff"
                                : "var(--primary, #818cf8)",
                          }}
                        >
                          {s.isBreak ? "BREAK" : `Period ${s.period}`}
                        </span>

                        {isOngoing && (
                          <span
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 800,
                              color: "#10b981",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                            }}
                          >
                            <span
                              style={{
                                width: "6px",
                                height: "6px",
                                borderRadius: "50%",
                                backgroundColor: "#10b981",
                              }}
                            />
                            ONGOING
                          </span>
                        )}

                        {isCompleted && (
                          <span
                            style={{
                              fontSize: "0.68rem",
                              color: "#10b981",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.2rem",
                            }}
                          >
                            <CheckCircle2 size={12} /> Done
                          </span>
                        )}
                      </div>

                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-secondary, #94a3b8)",
                          fontWeight: 500,
                        }}
                      >
                        {s.startTime} - {s.endTime}
                      </span>
                    </div>

                    {/* Subject title */}
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "0.98rem",
                        color: "var(--foreground, #ffffff)",
                      }}
                    >
                      {isExam
                        ? s.examName || "Scheduled Exam"
                        : s.isBreak
                          ? "Break / Recess"
                          : s.subjectName || "Subject"}
                    </div>

                    {/* Teacher & Room Details */}
                    {isSub ? (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "#d97706",
                          fontWeight: 600,
                          lineHeight: 1.35,
                        }}
                      >
                        ⚡ Substitute: <strong>{s.substituteTeacherName}</strong> (covering for{" "}
                        {s.regularTeacherName || "Teacher"})
                      </div>
                    ) : isFree ? (
                      <div style={{ fontSize: "0.75rem", color: "#f87171", fontWeight: 600 }}>
                        Teacher absent, free period
                      </div>
                    ) : s.regularTeacherName ? (
                      <div
                        style={{
                          fontSize: "0.76rem",
                          color: "var(--text-secondary, #94a3b8)",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <User size={13} />
                        <span>Teacher: {s.regularTeacherName}</span>
                      </div>
                    ) : null}

                    {s.classroom && (
                      <div
                        style={{
                          fontSize: "0.74rem",
                          color: "var(--text-secondary, #94a3b8)",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <MapPin size={12} />
                        <span>Room: {s.classroom}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                borderRadius: "12px",
                backgroundColor: "rgba(0, 0, 0, 0.15)",
                border: "1px dashed var(--border-color, rgba(255, 255, 255, 0.1))",
              }}
            >
              <Clock
                size={34}
                style={{
                  color: "var(--text-secondary, #94a3b8)",
                  opacity: 0.5,
                  marginBottom: "0.6rem",
                }}
              />
              <h4
                style={{
                  margin: "0 0 0.4rem 0",
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: "var(--foreground, #ffffff)",
                }}
              >
                {!isTodaySchoolDay
                  ? `Weekend (${todayDayName}) — No Classes Scheduled Today`
                  : `No Classes Scheduled for ${todayDayName}`}
              </h4>
              <p
                style={{
                  margin: "0 0 1rem 0",
                  fontSize: "0.85rem",
                  color: "var(--text-secondary, #94a3b8)",
                }}
              >
                Switch to the <strong>Weekly Timetable</strong> tab to view schedules for the upcoming school week.
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("weekly");
                  setSelectedDayFilter("MONDAY");
                }}
                style={{
                  padding: "0.45rem 1rem",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "var(--primary, #6366f1)",
                  color: "#ffffff",
                  fontSize: "0.825rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                View Monday&apos;s Schedule
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: WEEKLY TIMETABLE ────────────────────────────────────────────── */}
      {activeTab === "weekly" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {daysToShow.length === 0 ? (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                borderRadius: "12px",
                backgroundColor: "rgba(0, 0, 0, 0.15)",
                color: "var(--text-secondary, #94a3b8)",
              }}
            >
              No timetable records found for the selected view.
            </div>
          ) : (
            daysToShow.map((day) => {
              const slots = scheduleByDay[day] || [];
              const isCurrentDay = day.toUpperCase() === todayDayName.toUpperCase();

              return (
                <div
                  key={day}
                  style={{
                    borderRadius: "12px",
                    backgroundColor: "rgba(0, 0, 0, 0.18)",
                    border: `1px solid ${
                      isCurrentDay
                        ? "var(--primary, #6366f1)"
                        : "var(--border-color, rgba(255, 255, 255, 0.08))"
                    }`,
                    padding: "1.1rem 1.25rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "0.85rem",
                      paddingBottom: "0.5rem",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Calendar size={16} color="var(--primary, #6366f1)" />
                      <h4
                        style={{
                          margin: 0,
                          fontSize: "0.95rem",
                          fontWeight: 700,
                          color: isCurrentDay ? "var(--primary, #818cf8)" : "var(--foreground, #ffffff)",
                        }}
                      >
                        {day} {isCurrentDay ? "(Today)" : ""}
                      </h4>
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary, #94a3b8)" }}>
                      {slots.length} periods
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
                      gap: "0.65rem",
                    }}
                  >
                    {slots.map((slot) => (
                      <div
                        key={slot.id}
                        style={{
                          padding: "0.75rem",
                          borderRadius: "8px",
                          backgroundColor: slot.isBreak
                            ? "rgba(255, 255, 255, 0.03)"
                            : "var(--card-bg, #151f32)",
                          border: "1px solid rgba(255, 255, 255, 0.06)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.25rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              padding: "0.15rem 0.45rem",
                              borderRadius: "4px",
                              backgroundColor: slot.isBreak
                                ? "rgba(255, 255, 255, 0.06)"
                                : "rgba(99, 102, 241, 0.12)",
                              color: slot.isBreak
                                ? "var(--text-secondary, #94a3b8)"
                                : "var(--primary, #818cf8)",
                            }}
                          >
                            {slot.isBreak ? "BREAK" : `P${slot.period}`}
                          </span>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--text-secondary, #94a3b8)",
                            }}
                          >
                            {slot.startTime} - {slot.endTime}
                          </span>
                        </div>

                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: "0.875rem",
                            color: "var(--foreground, #ffffff)",
                            marginTop: "0.15rem",
                          }}
                        >
                          {slot.isBreak ? "Break / Recess" : slot.subject?.name || "Subject"}
                        </div>

                        {slot.subject?.teacher?.user?.name && !slot.isBreak && (
                          <div
                            style={{
                              fontSize: "0.72rem",
                              color: "var(--text-secondary, #94a3b8)",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.25rem",
                            }}
                          >
                            <User size={11} />
                            <span>{slot.subject.teacher.user.name}</span>
                          </div>
                        )}

                        {slot.classroom && (
                          <div
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--text-secondary, #94a3b8)",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.25rem",
                            }}
                          >
                            <MapPin size={11} />
                            <span>{slot.classroom}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
