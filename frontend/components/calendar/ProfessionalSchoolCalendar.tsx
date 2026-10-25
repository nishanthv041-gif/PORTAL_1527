"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./ProfessionalSchoolCalendar.module.css";
import {
  MonthCalendarData,
  CalendarDayModel,
  SerializedCalendarEvent,
} from "@/backend/lib/services/calendarDataService";
import {
  setSchoolDayStatusAction,
  deleteSchoolDayStatusAction,
  batchSetSchoolDaysAction,
  createEventAction,
  deleteEventAction,
} from "@/backend/api/actions/dashboard/admin/calendar/actions";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CalendarOff,
  Sparkles,
  Plus,
  X,
  Trash2,
  Loader2,
  Clock,
  MapPin,
  CalendarDays,
  ShieldAlert,
  Sun,
  Filter,
} from "lucide-react";

interface ProfessionalSchoolCalendarProps {
  initialData: MonthCalendarData;
  role: "ADMIN" | "TEACHER" | "PARENT" | "STUDENT";
  baseRoute: string;
}

export default function ProfessionalSchoolCalendar({
  initialData,
  role,
  baseRoute,
}: ProfessionalSchoolCalendarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isAdmin = role === "ADMIN";

  // Filter state
  const [activeFilter, setActiveFilter] = useState<"ALL" | "WORKING" | "LEAVE" | "EVENTS">("ALL");

  // Day detail / edit modal state
  const [selectedDay, setSelectedDay] = useState<CalendarDayModel | null>(null);
  const [editStatus, setEditStatus] = useState<"WORKING_DAY" | "LEAVE_DAY">("WORKING_DAY");
  const [editTitle, setEditTitle] = useState("");
  const [editReason, setEditReason] = useState("");
  const [modalFeedback, setModalFeedback] = useState<string | null>(null);

  // Quick batch set modal
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchActionType, setBatchActionType] = useState<"SUNDAYS" | "WEEKDAYS" | "RANGE">("SUNDAYS");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [rangeStatus, setRangeStatus] = useState<"WORKING_DAY" | "LEAVE_DAY">("LEAVE_DAY");
  const [rangeTitle, setRangeTitle] = useState("Vacation / Leave");

  // Create Event modal
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventDate, setEventDate] = useState("");

  const navigateMonth = (direction: -1 | 1) => {
    let newMonth = initialData.month + direction;
    let newYear = initialData.year;

    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }

    startTransition(() => {
      router.push(`${baseRoute}?year=${newYear}&month=${newMonth}`);
    });
  };

  const jumpToToday = () => {
    const today = new Date();
    startTransition(() => {
      router.push(`${baseRoute}?year=${today.getFullYear()}&month=${today.getMonth()}`);
    });
  };

  const handleOpenDayModal = (day: CalendarDayModel) => {
    setSelectedDay(day);
    setEditStatus(day.status);
    setEditTitle(day.title || "");
    setEditReason(day.reason || "");
    setModalFeedback(null);
  };

  const handleSaveDayStatus = () => {
    if (!selectedDay || !isAdmin) return;
    setModalFeedback(null);

    startTransition(async () => {
      const res = await setSchoolDayStatusAction({
        date: selectedDay.dateStr,
        status: editStatus,
        title: editTitle.trim() || undefined,
        reason: editReason.trim() || undefined,
      });

      if (res.success) {
        setModalFeedback("Updated successfully!");
        setTimeout(() => {
          setSelectedDay(null);
          setModalFeedback(null);
          router.refresh();
        }, 600);
      } else {
        setModalFeedback(res.error || "Failed to update day status");
      }
    });
  };

  const handleResetDayDefault = () => {
    if (!selectedDay || !isAdmin) return;
    if (!confirm("Reset this date back to default calendar rules?")) return;

    startTransition(async () => {
      const res = await deleteSchoolDayStatusAction(selectedDay.dateStr);
      if (res.success) {
        setSelectedDay(null);
        router.refresh();
      }
    });
  };

  const handleDeleteEvent = (id: string) => {
    if (!isAdmin) return;
    if (!confirm("Are you sure you want to delete this event?")) return;

    startTransition(async () => {
      await deleteEventAction(id);
      if (selectedDay) {
        setSelectedDay({
          ...selectedDay,
          events: selectedDay.events.filter((e) => e.id !== id),
        });
      }
      router.refresh();
    });
  };

  const handleExecuteBatch = () => {
    if (!isAdmin) return;

    startTransition(async () => {
      if (batchActionType === "SUNDAYS") {
        // Find all Sundays in this month
        const sundays = initialData.days
          .filter((d) => d.dayOfWeek === 0)
          .map((d) => ({
            date: d.dateStr,
            status: "LEAVE_DAY" as const,
            title: "Sunday - Weekend Holiday",
            reason: "Standard Weekend",
          }));
        await batchSetSchoolDaysAction(sundays);
      } else if (batchActionType === "WEEKDAYS") {
        // Mark all Mon-Fri as Working Days
        const weekdays = initialData.days
          .filter((d) => d.dayOfWeek >= 1 && d.dayOfWeek <= 5)
          .map((d) => ({
            date: d.dateStr,
            status: "WORKING_DAY" as const,
            title: "Regular Working Day",
            reason: "School Academic Schedule",
          }));
        await batchSetSchoolDaysAction(weekdays);
      } else if (batchActionType === "RANGE") {
        if (!rangeStart || !rangeEnd) {
          alert("Please select both start and end dates.");
          return;
        }
        const start = new Date(rangeStart);
        const end = new Date(rangeEnd);
        if (start > end) {
          alert("Start date must be before or equal to end date.");
          return;
        }

        const daysToSet: { date: string; status: "WORKING_DAY" | "LEAVE_DAY"; title: string }[] = [];
        const cur = new Date(start);
        while (cur <= end) {
          const dateStr = cur.toISOString().split("T")[0];
          daysToSet.push({
            date: dateStr,
            status: rangeStatus,
            title: rangeTitle,
          });
          cur.setDate(cur.getDate() + 1);
        }

        await batchSetSchoolDaysAction(daysToSet);
      }

      setShowBatchModal(false);
      router.refresh();
    });
  };

  const handleCreateEventSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isAdmin) return;

    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createEventAction(formData);
      if (res?.error) {
        alert(res.error);
      } else {
        setShowEventModal(false);
        router.refresh();
      }
    });
  };

  const dayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Pre-pad empty cells before 1st day of month
  const emptyPreSlots = Array.from({ length: initialData.firstDayOfWeek });

  return (
    <div className={styles.calendarContainer}>
      {/* 1. Top Header Bar */}
      <div className={styles.headerBar}>
        <div className={styles.headerTitleBlock}>
          <h1 className={styles.mainTitle}>
            <CalendarIcon size={28} color="#2563eb" />
            School Academic Calendar
          </h1>
          <p className={styles.subTitle}>
            {isAdmin
              ? "Official school schedule. Mark working days and holidays to calculate attendance automatically."
              : "Official school schedule with working days, holidays, exams, and events."}
          </p>
        </div>

        {isAdmin && (
          <div className={styles.headerActionGroup}>
            <button
              type="button"
              onClick={() => {
                const today = new Date().toISOString().split("T")[0];
                setEventDate(today);
                setShowEventModal(true);
              }}
              className={styles.btnPrimary}
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>Add Event</span>
            </button>

            <button
              type="button"
              onClick={() => setShowBatchModal(true)}
              className={styles.btnSecondary}
              title="Quick setup for recurring days or vacation ranges"
            >
              <Sparkles size={16} color="#9333ea" />
              <span>Quick Set Days</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Top Metric Cards */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrap} ${styles.metricIconWorking}`}>
            <CheckCircle2 size={22} />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricValue}>{initialData.stats.workingDays}</span>
            <span className={styles.metricLabel}>Working Days ({initialData.monthName})</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrap} ${styles.metricIconLeave}`}>
            <CalendarOff size={22} />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricValue}>{initialData.stats.leaveDays}</span>
            <span className={styles.metricLabel}>Leave / Holidays ({initialData.monthName})</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrap} ${styles.metricIconAcademic}`}>
            <CalendarDays size={22} />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricValue}>{initialData.academicStats.academicWorkingDaysToDate}</span>
            <span className={styles.metricLabel}>Total Working Days (To Date)</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrap} ${styles.metricIconEvents}`}>
            <Sparkles size={22} />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricValue}>{initialData.stats.eventsCount}</span>
            <span className={styles.metricLabel}>Scheduled Events ({initialData.monthName})</span>
          </div>
        </div>
      </div>

      {/* 3. Navigation Toolbar & Filters */}
      <div className={styles.navToolbar}>
        <div className={styles.monthNavGroup}>
          <button
            type="button"
            onClick={() => navigateMonth(-1)}
            disabled={isPending}
            className={styles.navArrowBtn}
            aria-label="Previous Month"
          >
            <ChevronLeft size={20} />
          </button>

          <h2 className={styles.currentMonthTitle}>
            {initialData.monthName} {initialData.year}
          </h2>

          <button
            type="button"
            onClick={() => navigateMonth(1)}
            disabled={isPending}
            className={styles.navArrowBtn}
            aria-label="Next Month"
          >
            <ChevronRight size={20} />
          </button>

          <button
            type="button"
            onClick={jumpToToday}
            disabled={isPending}
            className={styles.todayBtn}
          >
            Today
          </button>

          {isPending && <Loader2 size={16} className="animate-spin text-primary" />}
        </div>

        {/* Legend / Filter Pills */}
        <div className={styles.filterPillsGroup}>
          <button
            type="button"
            onClick={() => setActiveFilter("ALL")}
            className={`${styles.filterPill} ${activeFilter === "ALL" ? styles.filterPillActive : ""}`}
          >
            All Days
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("WORKING")}
            className={`${styles.filterPill} ${activeFilter === "WORKING" ? styles.filterPillActive : ""}`}
          >
            <span style={{ color: "#10b981" }}>●</span> Working Days
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("LEAVE")}
            className={`${styles.filterPill} ${activeFilter === "LEAVE" ? styles.filterPillActive : ""}`}
          >
            <span style={{ color: "#ef4444" }}>●</span> Leave / Holidays
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("EVENTS")}
            className={`${styles.filterPill} ${activeFilter === "EVENTS" ? styles.filterPillActive : ""}`}
          >
            <span style={{ color: "#8b5cf6" }}>●</span> Events Only
          </button>
        </div>
      </div>

      {/* 4. Full Professional Interactive Calendar Grid */}
      <div className={styles.calendarCard}>
        <div className={styles.gridScrollWrapper}>
          <div className={styles.gridContainer}>
            {/* Weekday Headers */}
            {dayHeaders.map((dh, idx) => (
              <div
                key={dh}
                className={`${styles.weekdayHeader} ${idx === 0 || idx === 6 ? styles.weekdayWeekend : ""}`}
              >
                {dh}
              </div>
            ))}

            {/* Empty padding cells before first day */}
            {emptyPreSlots.map((_, i) => (
              <div key={`empty-pre-${i}`} className={styles.dayCellEmpty} />
            ))}

            {/* Real Month Days */}
            {initialData.days.map((day) => {
              const isWorking = day.status === "WORKING_DAY";
              const matchesFilter =
                activeFilter === "ALL" ||
                (activeFilter === "WORKING" && isWorking) ||
                (activeFilter === "LEAVE" && !isWorking) ||
                (activeFilter === "EVENTS" && day.events.length > 0);

              const cellStyle = !matchesFilter ? { opacity: 0.35 } : {};

              return (
                <div
                  key={day.dateStr}
                  className={`${styles.dayCell} ${
                    isWorking ? styles.dayCellWorking : styles.dayCellLeave
                  } ${day.isToday ? styles.dayCellToday : ""}`}
                  style={cellStyle}
                  onClick={() => handleOpenDayModal(day)}
                  title={`${day.dateStr}: ${day.title || (isWorking ? "Working Day" : "Leave Day")}${
                    isAdmin ? " (Click to edit)" : ""
                  }`}
                >
                  {/* Top row in cell: day number and status badge */}
                  <div className={styles.dayTopRow}>
                    <span
                      className={`${styles.dayNumber} ${
                        day.isToday ? styles.dayNumberToday : ""
                      }`}
                    >
                      {day.dayNumber}
                    </span>

                    <span
                      className={`${styles.dayStatusBadge} ${
                        isWorking ? styles.badgeWorking : styles.badgeLeave
                      }`}
                    >
                      {isWorking ? "Working" : "Leave"}
                      {day.isCustom && <span className={styles.customMarkDot} title="Admin Custom Marked" />}
                    </span>
                  </div>

                  {/* Day Title / Reason snippet */}
                  <div className={styles.dayTitleText} title={day.title || undefined}>
                    {day.title || (isWorking ? "Working Day" : "Holiday")}
                  </div>

                  {/* Events list */}
                  {day.events.length > 0 && (
                    <div className={styles.eventsList}>
                      {day.events.slice(0, 2).map((ev) => {
                        let evClass = styles.eventOther;
                        if (ev.type === "EXAM") evClass = styles.eventExam;
                        else if (ev.type === "HOLIDAY") evClass = styles.eventHoliday;
                        else if (ev.type === "PROGRAM") evClass = styles.eventProgram;
                        else if (ev.type === "MEETING") evClass = styles.eventMeeting;

                        return (
                          <div
                            key={ev.id}
                            className={`${styles.eventPill} ${evClass}`}
                            title={`${ev.title} (${ev.type}) - ${ev.startTime || ""}`}
                          >
                            <span>●</span>
                            <span>{ev.title}</span>
                          </div>
                        );
                      })}

                      {day.events.length > 2 && (
                        <div className={styles.moreEventsBadge}>
                          +{day.events.length - 2} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5. Day Detail & Admin Edit Modal */}
      {selectedDay && (
        <div className={styles.modalOverlay} onClick={() => setSelectedDay(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalDateTitle}>
                  {new Date(selectedDay.dateStr).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </h3>
                <p className={styles.modalDateSubtitle}>
                  {isAdmin
                    ? "Set working or leave status anytime. Working days are factored into attendance percentage calculation."
                    : "School Academic Calendar schedule."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className={styles.closeBtn}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Admin Edit Controls OR Read-only display for Teacher/Parent */}
            {isAdmin ? (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>School Day Status</label>
                  <div className={styles.statusSelector}>
                    <button
                      type="button"
                      onClick={() => setEditStatus("WORKING_DAY")}
                      className={`${styles.statusOptionBtn} ${
                        editStatus === "WORKING_DAY" ? styles.statusOptionWorkingActive : ""
                      }`}
                    >
                      <CheckCircle2
                        size={24}
                        color={editStatus === "WORKING_DAY" ? "#059669" : "var(--text-secondary)"}
                      />
                      <span className={styles.statusOptionLabel}>School Working Day</span>
                      <span className={styles.statusOptionHint}>
                        Counted in student & teacher attendance calculations
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditStatus("LEAVE_DAY")}
                      className={`${styles.statusOptionBtn} ${
                        editStatus === "LEAVE_DAY" ? styles.statusOptionLeaveActive : ""
                      }`}
                    >
                      <CalendarOff
                        size={24}
                        color={editStatus === "LEAVE_DAY" ? "#dc2626" : "var(--text-secondary)"}
                      />
                      <span className={styles.statusOptionLabel}>School Leave / Holiday</span>
                      <span className={styles.statusOptionHint}>
                        School closed. Excluded from absence calculation
                      </span>
                    </button>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Title / Label</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="e.g. Regular Working Day, Republic Day, Special Saturday Working Day"
                    className={styles.formInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Reason / Remarks (Optional)</label>
                  <input
                    type="text"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    placeholder="e.g. National Holiday, Weekend, Term Exam Day"
                    className={styles.formInput}
                  />
                </div>

                {modalFeedback && (
                  <div
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: modalFeedback.includes("success") ? "#059669" : "#dc2626",
                    }}
                  >
                    {modalFeedback}
                  </div>
                )}

                <div className={styles.modalActionRow}>
                  {selectedDay.isCustom ? (
                    <button
                      type="button"
                      onClick={handleResetDayDefault}
                      disabled={isPending}
                      className={styles.resetBtn}
                    >
                      Reset to Default
                    </button>
                  ) : (
                    <div />
                  )}

                  <button
                    type="button"
                    onClick={handleSaveDayStatus}
                    disabled={isPending}
                    className={styles.btnPrimary}
                  >
                    {isPending ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>Save Day Status</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              /* Read-only view for Teacher and Parent */
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div
                  style={{
                    padding: "1rem",
                    borderRadius: "12px",
                    background:
                      selectedDay.status === "WORKING_DAY"
                        ? "rgba(16, 185, 129, 0.1)"
                        : "rgba(239, 68, 68, 0.1)",
                    border: `1px solid ${
                      selectedDay.status === "WORKING_DAY"
                        ? "rgba(16, 185, 129, 0.3)"
                        : "rgba(239, 68, 68, 0.3)"
                    }`,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                  }}
                >
                  {selectedDay.status === "WORKING_DAY" ? (
                    <CheckCircle2 size={24} color="#059669" />
                  ) : (
                    <CalendarOff size={24} color="#dc2626" />
                  )}
                  <div>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: "0.95rem",
                        color: selectedDay.status === "WORKING_DAY" ? "#059669" : "#dc2626",
                      }}
                    >
                      {selectedDay.status === "WORKING_DAY"
                        ? "Official School Working Day"
                        : "School Leave / Holiday"}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      {selectedDay.title ||
                        (selectedDay.status === "WORKING_DAY"
                          ? "Academic classes scheduled"
                          : "School closed")}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: "0.775rem",
                    color: "var(--text-secondary)",
                    fontStyle: "italic",
                  }}
                >
                  * School calendar status is managed by School Administration.
                </div>
              </div>
            )}

            {/* Scheduled Events for this date */}
            <div className={styles.modalEventsSection}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground)" }}>
                  Scheduled Events ({selectedDay.events.length})
                </span>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setEventDate(selectedDay.dateStr);
                      setShowEventModal(true);
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#2563eb",
                      fontSize: "0.775rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                  >
                    <Plus size={14} /> Add Event
                  </button>
                )}
              </div>

              {selectedDay.events.length === 0 ? (
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--text-secondary)",
                    padding: "0.5rem 0",
                  }}
                >
                  No special events or exams scheduled on this date.
                </div>
              ) : (
                selectedDay.events.map((ev) => (
                  <div key={ev.id} className={styles.modalEventRow}>
                    <div>
                      <div className={styles.modalEventTitle}>
                        {ev.title} <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>({ev.type})</span>
                      </div>
                      <div className={styles.modalEventMeta}>
                        <Clock size={11} style={{ display: "inline", marginRight: "3px" }} />
                        {ev.startTime} - {ev.endTime}
                        {ev.location && ` | ${ev.location}`}
                      </div>
                    </div>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteEvent(ev.id)}
                        disabled={isPending}
                        className={styles.deleteEventBtn}
                        title="Delete event"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. Admin Batch Setup Modal */}
      {showBatchModal && isAdmin && (
        <div className={styles.modalOverlay} onClick={() => setShowBatchModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalDateTitle}>Quick Set School Days</h3>
                <p className={styles.modalDateSubtitle}>
                  Bulk configure calendar working days and holiday schedules in one click.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className={styles.closeBtn}
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Choose Batch Operation</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="batchType"
                    checked={batchActionType === "SUNDAYS"}
                    onChange={() => setBatchActionType("SUNDAYS")}
                  />
                  <span>Mark all Sundays in {initialData.monthName} as Leave Days (Weekend Holidays)</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="batchType"
                    checked={batchActionType === "WEEKDAYS"}
                    onChange={() => setBatchActionType("WEEKDAYS")}
                  />
                  <span>Mark all Mon-Fri in {initialData.monthName} as School Working Days</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="batchType"
                    checked={batchActionType === "RANGE"}
                    onChange={() => setBatchActionType("RANGE")}
                  />
                  <span>Mark a specific Date Range (e.g. Vacation / Exam Period)</span>
                </label>
              </div>
            </div>

            {batchActionType === "RANGE" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "0.75rem", background: "var(--background)", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>From Date</label>
                    <input
                      type="date"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      className={styles.formInput}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>To Date</label>
                    <input
                      type="date"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className={styles.formInput}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Status for Selected Range</label>
                  <select
                    value={rangeStatus}
                    onChange={(e) => setRangeStatus(e.target.value as "WORKING_DAY" | "LEAVE_DAY")}
                    className={styles.formInput}
                  >
                    <option value="LEAVE_DAY">School Leave / Holiday</option>
                    <option value="WORKING_DAY">School Working Day</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Title / Label</label>
                  <input
                    type="text"
                    value={rangeTitle}
                    onChange={(e) => setRangeTitle(e.target.value)}
                    placeholder="e.g. Diwali Vacation, Summer Break, Exam Week"
                    className={styles.formInput}
                  />
                </div>
              </div>
            )}

            <div className={styles.modalActionRow}>
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className={styles.btnSecondary}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleExecuteBatch}
                disabled={isPending}
                className={styles.btnPrimary}
              >
                {isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Applying...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Apply Batch Schedule</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Admin Create Event Modal */}
      {showEventModal && isAdmin && (
        <div className={styles.modalOverlay} onClick={() => setShowEventModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalDateTitle}>Create School Event</h3>
                <p className={styles.modalDateSubtitle}>
                  Publish school events, exams, programs, and holiday notices.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEventModal(false)}
                className={styles.closeBtn}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateEventSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Event Title *</label>
                <input
                  type="text"
                  name="title"
                  required
                  placeholder="e.g. Annual Sports Meet, Term-1 Mathematics Exam"
                  className={styles.formInput}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Event Type *</label>
                  <select name="type" required className={styles.formInput}>
                    <option value="EXAM">Exam</option>
                    <option value="PROGRAM">Program / Function</option>
                    <option value="HOLIDAY">Holiday / Leave</option>
                    <option value="MEETING">Meeting</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Audience</label>
                  <select name="audience" defaultValue="ALL" className={styles.formInput}>
                    <option value="ALL">All (Students, Parents, Teachers)</option>
                    <option value="STUDENT">Students & Parents</option>
                    <option value="TEACHER">Teachers & Staff Only</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Date *</label>
                  <input
                    type="date"
                    name="date"
                    required
                    defaultValue={eventDate}
                    className={styles.formInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>End Date (Optional)</label>
                  <input type="date" name="endDate" className={styles.formInput} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Start Time</label>
                  <input
                    type="time"
                    name="startTime"
                    defaultValue="09:00"
                    className={styles.formInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>End Time</label>
                  <input
                    type="time"
                    name="endTime"
                    defaultValue="16:00"
                    className={styles.formInput}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Location / Venue</label>
                <input
                  type="text"
                  name="location"
                  placeholder="e.g. Main Auditorium, School Grounds"
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Description</label>
                <textarea
                  name="description"
                  rows={3}
                  placeholder="Additional details regarding this event..."
                  className={styles.formInput}
                  style={{ resize: "vertical" }}
                />
              </div>

              <div className={styles.modalActionRow}>
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className={styles.btnSecondary}
                >
                  Cancel
                </button>

                <button type="submit" disabled={isPending} className={styles.btnPrimary}>
                  {isPending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>Publish Event</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
