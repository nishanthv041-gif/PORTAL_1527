"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { 
  Search, RotateCw, Check, AlertCircle, 
  X, Award, Users, Loader2, CheckCircle2, 
  XCircle, Clock, Palmtree, Calendar 
} from "lucide-react";
import styles from "./AttendanceSessionManager.module.css";

export type AttendancePersonItem = {
  id: string;
  name: string;
  codeOrRoll: string; // e.g. "EMP-89" or "Roll: 7376252AD114"
  category?: string;
  currentStatus: "PRESENT" | "ABSENT" | "LATE" | "LEAVE" | "HALF_DAY" | "NOT_MARKED";
  currentRemarks?: string;
  attendancePercentage: string;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  leaveCount: number;
  lateCount: number;
  halfDayCount: number;
  recentHistory?: {
    id: string;
    date: Date | string;
    status: string;
    remarks?: string | null;
  }[];
};

export type AttendanceSessionManagerProps = {
  title: string;
  subtitle: string;
  categories?: { id: string; label: string; count?: number }[];
  activeCategoryId?: string;
  onCategoryChange?: (id: string) => void;
  initialDate: string;
  onDateChange: (date: string) => void;
  people: AttendancePersonItem[];
  onSave: (
    records: { id: string; status: string; remarks?: string }[],
    date: string,
    session: "FORENOON" | "AFTERNOON"
  ) => Promise<{ success: boolean; error?: string }>;
};

export default function AttendanceSessionManager({
  title,
  subtitle,
  categories = [],
  activeCategoryId,
  onCategoryChange,
  initialDate,
  onDateChange,
  people,
  onSave,
}: AttendanceSessionManagerProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [session, setSession] = useState<"FORENOON" | "AFTERNOON">("FORENOON");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeHalfDayPopover, setActiveHalfDayPopover] = useState<string | null>(null);
  const [selectedPersonForModal, setSelectedPersonForModal] = useState<AttendancePersonItem | null>(null);

  // Local attendance state: id -> { status, remarks }
  const [localMap, setLocalMap] = useState<Record<string, { status: string; remarks: string }>>(() => {
    const map: Record<string, { status: string; remarks: string }> = {};
    people.forEach((p) => {
      map[p.id] = {
        status: p.currentStatus,
        remarks: p.currentRemarks || "",
      };
    });
    return map;
  });

  // Track original snapshot to know if there are unsaved changes
  const [originalSnapshot, setOriginalSnapshot] = useState(localMap);
  const [isPending, startTransition] = useTransition();
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  // Filter out any "Administrators" category completely
  const filteredCategories = useMemo(() => {
    return categories.filter(
      (c) => c.id !== "ADMINS" && !c.label.toLowerCase().includes("administrator")
    );
  }, [categories]);

  // Update when people / initialDate props change
  useEffect(() => {
    setSelectedDate(initialDate);
    const map: Record<string, { status: string; remarks: string }> = {};
    people.forEach((p) => {
      map[p.id] = {
        status: p.currentStatus,
        remarks: p.currentRemarks || "",
      };
    });
    setLocalMap(map);
    setOriginalSnapshot(map);
  }, [people, initialDate]);

  // Determine if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    for (const p of people) {
      const cur = localMap[p.id];
      const orig = originalSnapshot[p.id];
      if (!orig || !cur) continue;
      if (cur.status !== orig.status || cur.remarks !== orig.remarks) {
        return true;
      }
    }
    return false;
  }, [people, localMap, originalSnapshot]);

  // Filtered members list based on category & search
  const filteredPeople = useMemo(() => {
    return people.filter((p) => {
      if (activeCategoryId && p.category && p.category !== activeCategoryId && filteredCategories.length > 1) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.codeOrRoll.toLowerCase().includes(q)
      );
    });
  }, [people, activeCategoryId, searchQuery, filteredCategories.length]);

  // Dynamic counter pills based on localMap
  const counters = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let leave = 0;
    let halfDay = 0;
    let marked = 0;

    Object.values(localMap).forEach(({ status }) => {
      if (status === "PRESENT") present++;
      else if (status === "ABSENT") absent++;
      else if (status === "LATE") late++;
      else if (status === "LEAVE") leave++;
      else if (status === "HALF_DAY") halfDay++;

      if (status !== "NOT_MARKED" && status !== "") {
        marked++;
      }
    });

    return {
      present,
      absent,
      late,
      leave,
      halfDay,
      marked,
      total: people.length,
    };
  }, [localMap, people.length]);

  // Calculate dynamic live percentage & breakdown connected to database state
  const getLivePersonStats = (person: AttendancePersonItem) => {
    const curStatus = localMap[person.id]?.status || person.currentStatus;
    const origStatus = originalSnapshot[person.id]?.status || person.currentStatus;

    // Check if the initial database record already had a marked status today
    const wasAlreadyMarkedInDb = origStatus !== "NOT_MARKED" && origStatus !== "";

    // Baseline sessions count from DB without today's slot
    const baseTotalSessions = wasAlreadyMarkedInDb
      ? Math.max(0, person.totalSessions - 1)
      : person.totalSessions;

    // Baseline counts from DB without today's slot
    let basePresent = person.presentCount - (wasAlreadyMarkedInDb && origStatus === "PRESENT" ? 1 : 0);
    let baseAbsent = person.absentCount - (wasAlreadyMarkedInDb && origStatus === "ABSENT" ? 1 : 0);
    let baseLate = person.lateCount - (wasAlreadyMarkedInDb && origStatus === "LATE" ? 1 : 0);
    let baseLeave = person.leaveCount - (wasAlreadyMarkedInDb && origStatus === "LEAVE" ? 1 : 0);
    let baseHalfDay = person.halfDayCount - (wasAlreadyMarkedInDb && origStatus === "HALF_DAY" ? 1 : 0);

    basePresent = Math.max(0, basePresent);
    baseAbsent = Math.max(0, baseAbsent);
    baseLate = Math.max(0, baseLate);
    baseLeave = Math.max(0, baseLeave);
    baseHalfDay = Math.max(0, baseHalfDay);

    // Apply the active live choice:
    // PRESENT = 1.0 day credit
    // LATE = 1.0 day credit
    // HALF_DAY = 0.5 day credit
    // ABSENT = 0.0 day credit
    // LEAVE = 0.0 day credit
    let livePresent = basePresent;
    let liveAbsent = baseAbsent;
    let liveLate = baseLate;
    let liveLeave = baseLeave;
    let liveHalfDay = baseHalfDay;
    let liveTotalSessions = baseTotalSessions;

    if (curStatus === "PRESENT") {
      livePresent += 1;
      liveTotalSessions += 1;
    } else if (curStatus === "ABSENT") {
      liveAbsent += 1;
      liveTotalSessions += 1;
    } else if (curStatus === "LATE") {
      liveLate += 1;
      liveTotalSessions += 1;
    } else if (curStatus === "LEAVE") {
      liveLeave += 1;
      liveTotalSessions += 1;
    } else if (curStatus === "HALF_DAY") {
      liveHalfDay += 1;
      liveTotalSessions += 1;
    }

    const totalCredits = (livePresent * 1.0) + (liveLate * 1.0) + (liveHalfDay * 0.5);
    const percentage = liveTotalSessions > 0
      ? ((totalCredits / liveTotalSessions) * 100).toFixed(1)
      : "100.0";

    return {
      percentage,
      totalSessions: liveTotalSessions,
      presentCount: livePresent,
      absentCount: liveAbsent,
      lateCount: liveLate,
      leaveCount: liveLeave,
      halfDayCount: liveHalfDay,
      currentStatus: curStatus,
    };
  };

  // Toggle single member status (PRESENT, ABSENT, LATE, LEAVE, HALF_DAY)
  const setMemberStatus = (
    personId: string,
    newStatus: "PRESENT" | "ABSENT" | "LATE" | "LEAVE" | "HALF_DAY",
    remarks?: string
  ) => {
    setActiveHalfDayPopover(null);
    setLocalMap((prev) => ({
      ...prev,
      [personId]: {
        status: newStatus,
        remarks: remarks !== undefined ? remarks : prev[personId]?.remarks || "",
      },
    }));
  };

  // Quick mark all currently filtered members
  const handleQuickMarkAll = (status: "PRESENT" | "ABSENT" | "LATE") => {
    setLocalMap((prev) => {
      const updated = { ...prev };
      filteredPeople.forEach((p) => {
        updated[p.id] = {
          status,
          remarks: prev[p.id]?.remarks || "",
        };
      });
      return updated;
    });
  };

  // Date Change Handler
  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    onDateChange(newDate);
  };

  // Discard changes and revert to original snapshot
  const handleDiscard = () => {
    setLocalMap(originalSnapshot);
  };

  // Save changes to database
  const handleSave = () => {
    startTransition(async () => {
      const recordsToSave = Object.entries(localMap).map(([id, item]) => ({
        id,
        status: item.status,
        remarks: item.remarks,
      }));

      const res = await onSave(recordsToSave, selectedDate, session);
      if (res.success) {
        setOriginalSnapshot(localMap);
        setSaveSuccessMsg(true);
        setTimeout(() => setSaveSuccessMsg(false), 3000);
      }
    });
  };

  return (
    <div className={styles.pageContainer}>
      {/* 1. Top Header (Clean - No unwanted back button) */}
      <div className={styles.headerSection}>
        <h1 className={styles.pageTitle}>{title}</h1>
        <p className={styles.pageSubtitle}>{subtitle}</p>
      </div>

      {/* 2. Scope Card: Search Bar (and Category Tabs only if multiple classes exist) */}
      <div className={styles.scopeCard}>
        {filteredCategories.length > 1 && (
          <div className={styles.categoryTabs}>
            {filteredCategories.map((cat) => {
              const isActive = activeCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onCategoryChange && onCategoryChange(cat.id)}
                  className={`${styles.categoryTab} ${isActive ? styles.categoryTabActive : ""}`}
                >
                  {cat.label} {cat.count !== undefined ? `(${cat.count})` : ""}
                </button>
              );
            })}
          </div>
        )}

        <div className={styles.searchWrapper}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            placeholder={title.toLowerCase().includes("teacher") ? "Search teachers..." : "Search students..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      {/* 3. Date & Session Card */}
      <div className={styles.controlCard}>
        <div className={styles.controlRow}>
          {/* Attendance Date */}
          <div className={styles.dateBlock}>
            <span className={styles.controlLabel}>Attendance Date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className={styles.dateInput}
            />
          </div>

          {/* Session Switcher: Forenoon / Afternoon */}
          <div className={styles.dateBlock}>
            <span className={styles.controlLabel}>Session</span>
            <div className={styles.sessionBlock}>
              <div className={styles.sessionBtnGroup}>
                <button
                  type="button"
                  onClick={() => setSession("FORENOON")}
                  className={`${styles.sessionBtn} ${session === "FORENOON" ? styles.sessionBtnActive : ""}`}
                >
                  Forenoon
                </button>
                <button
                  type="button"
                  onClick={() => setSession("AFTERNOON")}
                  className={`${styles.sessionBtn} ${session === "AFTERNOON" ? styles.sessionBtnActive : ""}`}
                >
                  Afternoon
                </button>
              </div>

              <button
                type="button"
                onClick={() => onDateChange(selectedDate)}
                className={styles.refreshBtn}
                title="Refresh Attendance"
              >
                <RotateCw size={15} />
              </button>
            </div>
          </div>

          {/* Unsaved Changes Indicator */}
          {hasUnsavedChanges && (
            <div className={styles.unsavedBadge}>
              <AlertCircle size={13} />
              <span>Unsaved changes</span>
            </div>
          )}
        </div>

        {/* Status Counter Pills Row */}
        <div className={styles.metricsRow}>
          <span className={`${styles.metricPill} ${styles.pillPresent}`}>
            Present: {counters.present}
          </span>
          <span className={`${styles.metricPill} ${styles.pillAbsent}`}>
            Absent: {counters.absent}
          </span>
          <span className={`${styles.metricPill} ${styles.pillLate}`}>
            Late: {counters.late}
          </span>
          <span className={`${styles.metricPill} ${styles.pillLeave}`}>
            On Leave: {counters.leave}
          </span>
          <span className={`${styles.metricPill} ${styles.pillHalfDay}`}>
            Half Day: {counters.halfDay}
          </span>
          <span className={styles.pillTotalCount}>
            <Users size={14} />
            <span>{counters.marked}/{counters.total}</span>
          </span>
        </div>

        {/* Quick Mark All Row: P / A / L */}
        <div className={styles.markAllRow}>
          <span>Mark all:</span>
          <button
            type="button"
            onClick={() => handleQuickMarkAll("PRESENT")}
            className={`${styles.quickBtn} ${styles.quickP}`}
            title="Mark all as Present"
          >
            P
          </button>
          <button
            type="button"
            onClick={() => handleQuickMarkAll("ABSENT")}
            className={`${styles.quickBtn} ${styles.quickA}`}
            title="Mark all as Absent"
          >
            A
          </button>
          <button
            type="button"
            onClick={() => handleQuickMarkAll("LATE")}
            className={`${styles.quickBtn} ${styles.quickL}`}
            title="Mark all as Late"
          >
            L
          </button>
        </div>
      </div>

      {/* 4. Table of Members (Clean 3-column table - Note/Remark removed) */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th} style={{ width: "50px" }}>#</th>
                <th className={styles.th}>
                  {title.toLowerCase().includes("teacher") ? "FACULTY MEMBER" : "STUDENT"}
                </th>
                <th className={styles.th} style={{ textAlign: "center" }}>ATTENDANCE STATUS</th>
              </tr>
            </thead>
            <tbody>
              {filteredPeople.map((person, index) => {
                const cur = localMap[person.id] || { status: "NOT_MARKED", remarks: "" };
                const st = cur.status;
                const liveStats = getLivePersonStats(person);

                return (
                  <tr key={person.id} className={styles.tr}>
                    {/* Index */}
                    <td className={styles.td} style={{ color: "var(--text-secondary)", fontWeight: 600 }}>
                      {index + 1}
                    </td>

                    {/* Member Name + Code / Roll + Percentage Click Option */}
                    <td className={styles.td}>
                      <div className={styles.personCol}>
                        <div className={styles.personInfo}>
                          <span 
                            className={styles.personName}
                            onClick={() => setSelectedPersonForModal(person)}
                            title="Click to view overall attendance percentage"
                          >
                            {person.name}
                          </span>
                          <span className={styles.personCode}>
                            {person.codeOrRoll}
                          </span>
                        </div>

                        {/* Live Recalculated Percentage View Button / Badge */}
                        <button
                          type="button"
                          onClick={() => setSelectedPersonForModal(person)}
                          className={styles.pctBadge}
                          title="Click to view detailed attendance breakdown"
                        >
                          <Award size={12} />
                          <span>{liveStats.percentage}%</span>
                        </button>
                      </div>
                    </td>

                    {/* Attendance Status Buttons: P, A, L, LE, HD */}
                    <td className={styles.td} style={{ position: "relative", textAlign: "center" }}>
                      <div className={styles.statusButtonGroup}>
                        {/* P: Present */}
                        <button
                          type="button"
                          onClick={() => setMemberStatus(person.id, "PRESENT")}
                          className={`${styles.statusBtn} ${st === "PRESENT" ? styles.btnP_active : styles.btnP_inactive}`}
                          title="Present"
                        >
                          P
                        </button>

                        {/* A: Absent */}
                        <button
                          type="button"
                          onClick={() => setMemberStatus(person.id, "ABSENT")}
                          className={`${styles.statusBtn} ${st === "ABSENT" ? styles.btnA_active : styles.btnA_inactive}`}
                          title="Absent"
                        >
                          A
                        </button>

                        {/* L: Late */}
                        <button
                          type="button"
                          onClick={() => setMemberStatus(person.id, "LATE")}
                          className={`${styles.statusBtn} ${st === "LATE" ? styles.btnL_active : styles.btnL_inactive}`}
                          title="Late"
                        >
                          L
                        </button>

                        {/* LE: Leave */}
                        <button
                          type="button"
                          onClick={() => setMemberStatus(person.id, "LEAVE")}
                          className={`${styles.statusBtn} ${st === "LEAVE" ? styles.btnLE_active : styles.btnLE_inactive}`}
                          title="On Leave"
                        >
                          LE
                        </button>

                        {/* HD: Half Day */}
                        <button
                          type="button"
                          onClick={() => {
                            if (activeHalfDayPopover === person.id) {
                              setActiveHalfDayPopover(null);
                            } else {
                              setActiveHalfDayPopover(person.id);
                            }
                          }}
                          className={`${styles.statusBtn} ${st === "HALF_DAY" ? styles.btnHD_active : styles.btnHD_inactive}`}
                          title="Half Day"
                          style={{ minWidth: st === "HALF_DAY" && cur.remarks.startsWith("HD:") ? "55px" : "34px", fontSize: "0.72rem" }}
                        >
                          {st === "HALF_DAY" && cur.remarks === "HD:AN" ? "HD-AN" : st === "HALF_DAY" && cur.remarks === "HD:FN" ? "HD-FN" : "HD"}
                        </button>
                      </div>

                      {/* Half-Day Popover: Forenoon vs Afternoon */}
                      {activeHalfDayPopover === person.id && (
                        <div className={styles.halfDayPopover}>
                          <span style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)" }}>
                            Choose Session
                          </span>
                          <button
                            type="button"
                            className={styles.halfDayOption}
                            onClick={() => setMemberStatus(person.id, "HALF_DAY", "HD:FN")}
                          >
                            Forenoon (FN)
                          </button>
                          <button
                            type="button"
                            className={styles.halfDayOption}
                            onClick={() => setMemberStatus(person.id, "HALF_DAY", "HD:AN")}
                          >
                            Afternoon (AN)
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Session Overview Card (Bottom) */}
      <div className={styles.overviewCard}>
        <h3 className={styles.overviewTitle}>Session Overview</h3>
        <div className={styles.overviewGrid}>
          {/* Forenoon */}
          <div className={styles.sessionCard}>
            <span className={styles.sessionCardHeader}>Forenoon</span>
            <span className={styles.sessionCardCount}>
              {session === "FORENOON" ? counters.marked : 0}/{counters.total}
            </span>
            <div className={styles.progressBarTrack}>
              <div 
                className={styles.progressBarFill} 
                style={{ width: `${counters.total > 0 ? ((session === "FORENOON" ? counters.marked : 0) / counters.total) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Afternoon */}
          <div className={styles.sessionCard}>
            <span className={styles.sessionCardHeader}>Afternoon</span>
            <span className={styles.sessionCardCount}>
              {session === "AFTERNOON" ? counters.marked : 0}/{counters.total}
            </span>
            <div className={styles.progressBarTrack}>
              <div 
                className={styles.progressBarFill} 
                style={{ width: `${counters.total > 0 ? ((session === "AFTERNOON" ? counters.marked : 0) / counters.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 6. Floating Bottom Action Bar: Discard & Save Attendance */}
      <div className={styles.bottomActionBar}>
        <button
          type="button"
          onClick={handleDiscard}
          disabled={!hasUnsavedChanges || isPending}
          className={styles.discardBtn}
          style={{ opacity: hasUnsavedChanges ? 1 : 0.5 }}
        >
          Discard
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
          {saveSuccessMsg && (
            <span style={{ fontSize: "0.825rem", color: "var(--success)", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
              <Check size={14} /> Saved!
            </span>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className={styles.saveBtn}
          >
            {isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check size={16} strokeWidth={2.5} />
                <span>Save Attendance</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 7. Percentage View Modal with Box Viewing & Beautiful Table */}
      {selectedPersonForModal && (() => {
        const liveModalStats = getLivePersonStats(selectedPersonForModal);

        return (
          <div className={styles.modalBackdrop} onClick={() => setSelectedPersonForModal(null)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div className={styles.modalHeader}>
                <div className={styles.modalHeaderInfo}>
                  <div className={styles.modalAvatar}>
                    {selectedPersonForModal.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className={styles.modalPersonName}>
                      {selectedPersonForModal.name}
                    </h3>
                    <span className={styles.modalPersonCode}>
                      {selectedPersonForModal.codeOrRoll}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPersonForModal(null)}
                  className={styles.modalCloseBtn}
                  title="Close"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Hero Overall Attendance Card */}
              <div className={styles.modalHeroCard}>
                <div className={styles.modalHeroContent}>
                  <span className={styles.modalHeroLabel}>Overall Attendance</span>
                  <div className={styles.modalHeroValueRow}>
                    <span className={styles.modalHeroValue}>{liveModalStats.percentage}%</span>
                    <span className={styles.modalHeroBadge}>
                      {Number(liveModalStats.percentage) >= 75 ? "Good Standing" : "Needs Attention"}
                    </span>
                  </div>
                  <p className={styles.modalHeroSubtext}>
                    Calculated from <strong>{liveModalStats.totalSessions}</strong> total recorded sessions
                  </p>
                </div>
                <div className={styles.modalHeroIconWrapper}>
                  <Award size={48} className={styles.modalHeroIcon} />
                </div>
              </div>

              {/* 1. Box Viewing: Attendance Summary Boxes */}
              <div className={styles.boxViewingSection}>
                <h4 className={styles.sectionHeading}>Attendance Summary</h4>
                <div className={styles.statsBoxesGrid}>
                  {/* Box 1: Present */}
                  <div className={`${styles.statBox} ${styles.boxPresent}`}>
                    <div className={styles.boxHeader}>
                      <span className={styles.boxLabel}>Present</span>
                      <CheckCircle2 size={16} className={styles.boxIcon} />
                    </div>
                    <div className={styles.boxValue}>{liveModalStats.presentCount}</div>
                    <span className={styles.boxSubtext}>Full Attendance</span>
                  </div>

                  {/* Box 2: Half Day */}
                  <div className={`${styles.statBox} ${styles.boxHalfDay}`}>
                    <div className={styles.boxHeader}>
                      <span className={styles.boxLabel}>Half Day</span>
                      <Clock size={16} className={styles.boxIcon} />
                    </div>
                    <div className={styles.boxValue}>{liveModalStats.halfDayCount}</div>
                    <span className={styles.boxSubtext}>0.5 Day Credit</span>
                  </div>

                  {/* Box 3: Absent */}
                  <div className={`${styles.statBox} ${styles.boxAbsent}`}>
                    <div className={styles.boxHeader}>
                      <span className={styles.boxLabel}>Absent</span>
                      <XCircle size={16} className={styles.boxIcon} />
                    </div>
                    <div className={styles.boxValue}>{liveModalStats.absentCount}</div>
                    <span className={styles.boxSubtext}>Unexcused</span>
                  </div>

                  {/* Box 4: Late */}
                  <div className={`${styles.statBox} ${styles.boxLate}`}>
                    <div className={styles.boxHeader}>
                      <span className={styles.boxLabel}>Late</span>
                      <AlertCircle size={16} className={styles.boxIcon} />
                    </div>
                    <div className={styles.boxValue}>{liveModalStats.lateCount}</div>
                    <span className={styles.boxSubtext}>Delayed Entry</span>
                  </div>

                  {/* Box 5: On Leave */}
                  <div className={`${styles.statBox} ${styles.boxLeave}`}>
                    <div className={styles.boxHeader}>
                      <span className={styles.boxLabel}>On Leave</span>
                      <Palmtree size={16} className={styles.boxIcon} />
                    </div>
                    <div className={styles.boxValue}>{liveModalStats.leaveCount}</div>
                    <span className={styles.boxSubtext}>Approved Leave</span>
                  </div>
                </div>
              </div>

              {/* 2. Table Viewing with Beautiful Options: Recent Attendance Log Table */}
              <div className={styles.tableViewingSection}>
                <div className={styles.tableSectionHeader}>
                  <h4 className={styles.sectionHeading}>Recent Attendance Log</h4>
                  <span className={styles.tableBadge}>
                    {selectedPersonForModal.recentHistory?.length || 0} Records
                  </span>
                </div>

                <div className={styles.modalTableCard}>
                  {selectedPersonForModal.recentHistory && selectedPersonForModal.recentHistory.length > 0 ? (
                    <div className={styles.modalTableWrapper}>
                      <table className={styles.modalTable}>
                        <thead>
                          <tr>
                            <th className={styles.modalTh} style={{ width: "40px" }}>#</th>
                            <th className={styles.modalTh}>Date</th>
                            <th className={styles.modalTh}>Session</th>
                            <th className={styles.modalTh} style={{ textAlign: "center" }}>Status</th>
                            <th className={styles.modalTh}>Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPersonForModal.recentHistory.map((item, idx) => {
                            const itemDate = new Date(item.date);
                            const formattedDate = itemDate.toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            });
                            const weekday = itemDate.toLocaleDateString("en-GB", { weekday: "short" });
                            const sessionName = item.remarks?.includes("HD:FN") || item.remarks?.includes("FORENOON")
                              ? "Forenoon"
                              : item.remarks?.includes("HD:AN") || item.remarks?.includes("AFTERNOON")
                              ? "Afternoon"
                              : "Full Day";

                            return (
                              <tr key={item.id || idx} className={styles.modalTr}>
                                <td className={styles.modalTd} style={{ color: "var(--text-secondary)", fontWeight: 600 }}>
                                  {idx + 1}
                                </td>
                                <td className={styles.modalTd}>
                                  <div className={styles.dateCol}>
                                    <span className={styles.dateMain}>{formattedDate}</span>
                                    <span className={styles.dateSub}>{weekday}</span>
                                  </div>
                                </td>
                                <td className={styles.modalTd}>
                                  <span className={styles.sessionPill}>{sessionName}</span>
                                </td>
                                <td className={styles.modalTd} style={{ textAlign: "center" }}>
                                  {item.status === "PRESENT" && (
                                    <span className={`${styles.statusPill} ${styles.pillStatusPresent}`}>
                                      <CheckCircle2 size={12} /> Present
                                    </span>
                                  )}
                                  {item.status === "HALF_DAY" && (
                                    <span className={`${styles.statusPill} ${styles.pillStatusHalfDay}`}>
                                      <Clock size={12} /> Half Day
                                    </span>
                                  )}
                                  {item.status === "ABSENT" && (
                                    <span className={`${styles.statusPill} ${styles.pillStatusAbsent}`}>
                                      <XCircle size={12} /> Absent
                                    </span>
                                  )}
                                  {item.status === "LATE" && (
                                    <span className={`${styles.statusPill} ${styles.pillStatusLate}`}>
                                      <AlertCircle size={12} /> Late
                                    </span>
                                  )}
                                  {item.status === "LEAVE" && (
                                    <span className={`${styles.statusPill} ${styles.pillStatusLeave}`}>
                                      <Palmtree size={12} /> Leave
                                    </span>
                                  )}
                                  {!["PRESENT", "HALF_DAY", "ABSENT", "LATE", "LEAVE"].includes(item.status) && (
                                    <span className={styles.statusPill}>
                                      {item.status}
                                    </span>
                                  )}
                                </td>
                                <td className={styles.modalTd}>
                                  <span className={styles.remarksText}>
                                    {item.remarks || "—"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={styles.modalEmptyState}>
                      <Calendar size={28} style={{ color: "var(--text-secondary)", opacity: 0.6 }} />
                      <p>No historical attendance records found</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
