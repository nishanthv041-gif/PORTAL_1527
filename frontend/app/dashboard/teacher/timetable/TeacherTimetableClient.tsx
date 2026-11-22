"use client";

import { useState, useEffect, useTransition } from "react";
import { useSchoolToday } from "@/frontend/hooks/useSchoolToday";
import {
  Calendar as CalendarIcon, Clock, MapPin, User,
  BookOpen, CheckCircle2, PlayCircle,
  CalendarDays, ChevronRight, GraduationCap,
  ArrowLeftRight, X, Loader2, AlertCircle, Sparkles
} from "lucide-react";
import {
  getStaffShiftPeriodsWithFreeTeachersAction,
  saveStaffShiftBatchAction,
  type StaffShiftPeriodSlot
} from "@/backend/api/actions/dashboard/admin/substitution/substitutionActions";
import { formatSchoolDate } from "@/backend/lib/timetable/getEffectiveTimetable";

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
  teacherId,
  classes,
  initialClassId,
  teacherSchedule,
  assignedSubstitutions = [],
  classTimetableMap,
  teacherName
}: {
  teacherId?: string;
  classes: ClassType[];
  initialClassId: string;
  teacherSchedule: TimetableSlot[];
  assignedSubstitutions?: Array<{
    id: string;
    period: number;
    startTime: string;
    endTime: string;
    className: string;
    subjectName: string;
    classroom?: string | null;
    absentTeacherName: string;
    note?: string | null;
  }>;
  classTimetableMap: Record<string, TimetableSlot[]>;
  teacherName: string;
}) {
  const [viewMode, setViewMode] = useState<"class" | "mySchedule">("class");
  const [selectedClassId, setSelectedClassId] = useState<string>(initialClassId || (classes[0]?.id || ""));
  const schoolTime = useSchoolToday();

  // Staff Shift Changing State
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftDate, setShiftDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [shiftReason, setShiftReason] = useState("Official Duty / Training");
  const [shiftCustomReason, setShiftCustomReason] = useState("");
  const [shiftPeriods, setShiftPeriods] = useState<StaffShiftPeriodSlot[]>([]);
  const [loadingShiftPeriods, setLoadingShiftPeriods] = useState(false);
  const [periodShiftSelections, setPeriodShiftSelections] = useState<Record<string, string>>({});
  const [isShiftPending, startShiftTransition] = useTransition();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch teacher's scheduled periods and strictly period-free teachers
  useEffect(() => {
    if (!showShiftModal) return;
    let isCancelled = false;
    setLoadingShiftPeriods(true);
    getStaffShiftPeriodsWithFreeTeachersAction({
      teacherId,
      dateStr: shiftDate
    }).then(res => {
      if (!isCancelled) {
        if (res.success && res.periods) {
          setShiftPeriods(res.periods);
          const initialMap: Record<string, string> = {};
          res.periods.forEach(p => {
            if (p.status === "ASSIGNED" && p.substituteTeacherId) {
              initialMap[p.timetableEntryId] = p.substituteTeacherId;
            } else if (p.status === "FREE_PERIOD") {
              initialMap[p.timetableEntryId] = "FREE";
            }
          });
          setPeriodShiftSelections(initialMap);
        } else {
          setShiftPeriods([]);
        }
        setLoadingShiftPeriods(false);
      }
    });
    return () => { isCancelled = true; };
  }, [showShiftModal, shiftDate, teacherId]);

  const handleSaveStaffShifts = async () => {
    if (!teacherId) {
      setErrorMessage("Teacher profile identifier not found.");
      return;
    }

    const finalReason = shiftReason === "Other" && shiftCustomReason.trim()
      ? shiftCustomReason.trim()
      : shiftReason;

    const shiftPayload = Object.entries(periodShiftSelections)
      .filter(([_, subVal]) => Boolean(subVal))
      .map(([slotId, subVal]) => ({
        timetableEntryId: slotId,
        substituteTeacherId: subVal === "FREE" ? null : subVal,
        isFreePeriod: subVal === "FREE",
        note: `Staff Shift: ${finalReason}`
      }));

    if (shiftPayload.length === 0) {
      setErrorMessage("Please select at least one substitute staff member or Free Period.");
      return;
    }

    setErrorMessage(null);
    startShiftTransition(async () => {
      const res = await saveStaffShiftBatchAction({
        teacherId,
        dateStr: shiftDate,
        reason: finalReason,
        shifts: shiftPayload
      });

      if (!res.success) {
        setErrorMessage(res.error || "Failed to submit staff shift.");
      } else {
        setShowShiftModal(false);
        setToastMessage(`Staff shift submitted for ${shiftPayload.length} class(es)! Substitute faculty & School Admin notified.`);
      }
    });
  };

  const todayDayName = schoolTime.weekday;
  const isSchoolDay = schoolTime.isSchoolDay;
  const currentMinutes = schoolTime.currentMinutes;

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

        {/* Right Action Controls: Class Selector + Shift Class Assignment Button */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {viewMode === "class" && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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

          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setShowShiftModal(true);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.55rem 1.15rem",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #2563eb, #3b82f6)",
              color: "#ffffff",
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "0.85rem",
              boxShadow: "0 2px 8px rgba(37, 99, 235, 0.25)",
              whiteSpace: "nowrap"
            }}
            title="Shift your assigned classes to an available colleague"
          >
            <ArrowLeftRight size={15} /> Shift Class Assignment
          </button>
        </div>
      </div>

      {/* Toast & Error Alerts */}
      {toastMessage && (
        <div style={{ background: "rgba(16, 185, 129, 0.12)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "10px", padding: "0.85rem 1.25rem", marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <CheckCircle2 size={18} />
            <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><X size={16} /></button>
        </div>
      )}

      {errorMessage && (
        <div style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "0.85rem 1.25rem", marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <AlertCircle size={18} />
            <span style={{ fontSize: "0.9rem" }}>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><X size={16} /></button>
        </div>
      )}

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
                {schoolTime.formattedDate} • {schoolTime.timeStr}
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

      {/* Today's Assigned Substitution Duties Banner */}
      {assignedSubstitutions && assignedSubstitutions.length > 0 && (
        <div style={{ background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "14px", padding: "1.25rem", marginBottom: "1.75rem" }}>
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "#d97706", display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <Clock size={18} /> Today&apos;s Substitution Duty Assignments ({assignedSubstitutions.length})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.75rem" }}>
            {assignedSubstitutions.map(sub => (
              <div key={sub.id} style={{ background: "var(--card-bg)", padding: "0.85rem 1rem", borderRadius: "10px", border: "1px solid var(--border-color)", display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <div style={{ background: "#d97706", color: "#fff", fontWeight: 700, padding: "0.4rem 0.65rem", borderRadius: "6px", fontSize: "0.85rem" }}>
                  P{sub.period}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>{sub.subjectName} • <span style={{ color: "var(--primary)" }}>{sub.className}</span></div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                    Covering for: <strong style={{ color: "var(--text-primary)" }}>{sub.absentTeacherName}</strong> • {sub.startTime} - {sub.endTime}
                    {sub.classroom && ` • Room ${sub.classroom}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

                          {viewMode === "mySchedule" && !slot.isBreak && (
                            <button
                              type="button"
                              onClick={() => {
                                setErrorMessage(null);
                                setShowShiftModal(true);
                              }}
                              style={{
                                marginTop: "0.55rem",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35rem",
                                padding: "0.25rem 0.65rem",
                                borderRadius: "6px",
                                border: "1px solid rgba(99, 102, 241, 0.35)",
                                background: "rgba(99, 102, 241, 0.08)",
                                color: "var(--primary)",
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                cursor: "pointer"
                              }}
                              title="Shift this class to another teacher"
                            >
                              <ArrowLeftRight size={12} /> Shift Class
                            </button>
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

      {/* TEACHER STAFF SHIFT CHANGING MODAL */}
      {showShiftModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1px solid var(--border-color)", width: "100%", maxWidth: "600px", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.4)", overflow: "hidden" }}>

            {/* Modal Header */}
            <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div style={{ padding: "0.45rem", borderRadius: "8px", background: "rgba(99, 102, 241, 0.12)", color: "var(--primary)" }}>
                  <ArrowLeftRight size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Shift Class Assignment</h3>
                  <p style={{ margin: "0.15rem 0 0 0", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                    Reassign your class periods to available period-free colleagues with shift reason
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShiftModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem" }}>

              {/* Date & Shift Reason Row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.825rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                    Class Date:
                  </label>
                  <input
                    type="date"
                    value={shiftDate}
                    onChange={(e) => setShiftDate(e.target.value)}
                    style={{ width: "100%", padding: "0.55rem 0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.85rem", fontWeight: 600 }}
                  />
                  <div style={{ fontSize: "0.75rem", color: "var(--primary)", marginTop: "0.2rem", fontWeight: 600 }}>
                    {formatSchoolDate(shiftDate)}
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.825rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                    Staff Shift Reason *
                  </label>
                  <select
                    value={shiftReason}
                    onChange={(e) => setShiftReason(e.target.value)}
                    style={{ width: "100%", padding: "0.55rem 0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.85rem", fontWeight: 600 }}
                  >
                    <option value="Official Duty / Training">Official Duty / Training (OD)</option>
                    <option value="Medical Leave">Medical Leave / Sick Leave</option>
                    <option value="Personal Emergency">Personal Emergency</option>
                    <option value="Exam Invigilation Duty">Exam Invigilation Duty</option>
                    <option value="School Event / Activity">School Event / Activity</option>
                    <option value="Casual Leave">Casual Leave</option>
                    <option value="Other">Other Reason (Specify below)</option>
                  </select>
                </div>
              </div>

              {shiftReason === "Other" && (
                <div>
                  <input
                    type="text"
                    placeholder="Please specify shift reason..."
                    value={shiftCustomReason}
                    onChange={(e) => setShiftCustomReason(e.target.value)}
                    style={{ width: "100%", padding: "0.55rem 0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.85rem" }}
                  />
                </div>
              )}

              {/* Class-by-Class Shift Section */}
              <div style={{ marginTop: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Your Scheduled Classes &amp; Shift Options:
                  </label>
                  {shiftPeriods.length > 0 && (
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {shiftPeriods.length} class{shiftPeriods.length === 1 ? "" : "es"}
                    </span>
                  )}
                </div>

                {loadingShiftPeriods ? (
                  <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                    <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto 0.5rem", color: "var(--primary)" }} />
                    Loading your assigned classes &amp; available colleagues...
                  </div>
                ) : shiftPeriods.length === 0 ? (
                  <div style={{ padding: "2rem", textAlign: "center", border: "1px dashed var(--border-color)", borderRadius: "10px", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                    <CheckCircle2 size={28} style={{ opacity: 0.4, margin: "0 auto 0.5rem", color: "#10b981" }} />
                    <p style={{ margin: 0, fontWeight: 600, color: "var(--text-primary)" }}>No classes scheduled on this day</p>
                    <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8rem" }}>You do not have any teaching classes on this day of the week.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {shiftPeriods.map(p => {
                      const selectedVal = periodShiftSelections[p.timetableEntryId] || "";
                      const hasFreeTeachers = p.freeTeachers.length > 0;

                      return (
                        <div
                          key={p.timetableEntryId}
                          style={{
                            background: "var(--input-bg)",
                            border: `1px solid ${selectedVal ? "var(--primary)" : "var(--border-color)"}`,
                            borderRadius: "10px",
                            padding: "0.85rem",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.5rem"
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.4rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <span style={{ fontWeight: 800, fontSize: "0.85rem", background: "var(--card-bg)", padding: "0.2rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                                Period {p.period}
                              </span>
                              <span style={{ fontWeight: 700, fontSize: "0.92rem" }}>
                                {p.subjectName}
                              </span>
                              <span style={{ fontSize: "0.75rem", background: "rgba(99, 102, 241, 0.12)", color: "var(--primary)", padding: "0.15rem 0.5rem", borderRadius: "999px", fontWeight: 700 }}>
                                {p.className}
                              </span>
                            </div>

                            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                              <Clock size={12} /> {p.startTime} - {p.endTime}
                              {p.classroom && <span>• Rm {p.classroom}</span>}
                            </div>
                          </div>

                          {/* Substitute selector - ONLY shows that period's free teachers! */}
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                                Select Substitute Staff (Timing: {p.startTime} - {p.endTime}):
                              </label>
                              <span style={{ fontSize: "0.72rem", color: hasFreeTeachers ? "#10b981" : "var(--danger)", fontWeight: 700 }}>
                                {hasFreeTeachers ? `✓ ${p.freeTeachers.length} Colleague(s) Free in Period ${p.period}` : "⚠️ No Staff Free in this Period"}
                              </span>
                            </div>

                            <select
                              value={selectedVal}
                              onChange={(e) => setPeriodShiftSelections(prev => ({
                                ...prev,
                                [p.timetableEntryId]: e.target.value
                              }))}
                              style={{
                                width: "100%",
                                padding: "0.55rem 0.75rem",
                                borderRadius: "8px",
                                border: selectedVal ? "1.5px solid var(--primary)" : "1px solid var(--border-color)",
                                background: "var(--card-bg)",
                                color: "inherit",
                                fontSize: "0.85rem",
                                fontWeight: 600
                              }}
                            >
                              <option value="">-- Keep My Class (No Shift) --</option>
                              {hasFreeTeachers && (
                                <optgroup label={`Available Free Staff in Period ${p.period} (${p.freeTeachers.length})`}>
                                  {p.freeTeachers.map(ft => (
                                    <option key={ft.id} value={ft.id}>
                                      {ft.name} {ft.subjects.length > 0 ? `• [${ft.subjects.join(", ")}]` : ""}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--card-bg)" }}>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {Object.values(periodShiftSelections).filter(Boolean).length} period(s) selected to shift
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setShowShiftModal(false)}
                  style={{ padding: "0.55rem 1rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "transparent", color: "inherit", cursor: "pointer", fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveStaffShifts}
                  disabled={isShiftPending || Object.values(periodShiftSelections).filter(Boolean).length === 0}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    padding: "0.55rem 1.25rem",
                    borderRadius: "8px",
                    border: "none",
                    background: Object.values(periodShiftSelections).filter(Boolean).length > 0 ? "linear-gradient(135deg, #2563eb, #3b82f6)" : "rgba(107, 114, 128, 0.3)",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: Object.values(periodShiftSelections).filter(Boolean).length > 0 ? "pointer" : "not-allowed"
                  }}
                >
                  {isShiftPending ? <Loader2 size={16} className="animate-spin" /> : <User size={16} />}
                  Confirm &amp; Submit Staff Shift
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
