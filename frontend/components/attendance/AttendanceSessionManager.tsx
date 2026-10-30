"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { 
  Search, RotateCw, Check, AlertCircle, 
  X, Award, Users, Loader2, CheckCircle2, 
  XCircle, Clock, Calendar 
} from "lucide-react";
import styles from "./AttendanceSessionManager.module.css";
import { SearchBar, ResultsContainer } from "@/frontend/components/ui";

export type AttendancePersonItem = {
  id: string;
  name: string;
  codeOrRoll: string; // e.g. "EMP-89" or "Roll: 7376252AD114"
  category?: string;
  // Session-specific initial statuses
  forenoonStatus?: "PRESENT" | "ABSENT" | "LATE" | "LEAVE" | "NOT_MARKED";
  forenoonRemarks?: string;
  afternoonStatus?: "PRESENT" | "ABSENT" | "LATE" | "LEAVE" | "NOT_MARKED";
  afternoonRemarks?: string;
  // Fallback status
  currentStatus?: "PRESENT" | "ABSENT" | "LATE" | "LEAVE" | "NOT_MARKED";
  currentRemarks?: string;
  attendancePercentage: string;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  leaveCount?: number;
  recentHistory?: {
    id: string;
    date: Date | string;
    session?: string;
    status: string;
    remarks?: string | null;
  }[];
};

export type AttendanceSessionManagerProps = {
  title: string;
  subtitle?: string;
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
  const [isPendingSearch, setIsPendingSearch] = useState(false);
  const [selectedPersonForModal, setSelectedPersonForModal] = useState<AttendancePersonItem | null>(null);

  // Maintain separate, independent local state for FORENOON and AFTERNOON
  const [sessionMap, setSessionMap] = useState<{
    FORENOON: Record<string, { status: string; remarks: string }>;
    AFTERNOON: Record<string, { status: string; remarks: string }>;
  }>(() => {
    const fn: Record<string, { status: string; remarks: string }> = {};
    const an: Record<string, { status: string; remarks: string }> = {};
    people.forEach((p) => {
      const fnStatus = p.forenoonStatus || (p.currentStatus === "LEAVE" ? "LATE" : p.currentStatus) || "NOT_MARKED";
      const anStatus = p.afternoonStatus || (p.currentStatus === "LEAVE" ? "LATE" : p.currentStatus) || "NOT_MARKED";
      fn[p.id] = { status: fnStatus, remarks: p.forenoonRemarks || p.currentRemarks || "" };
      an[p.id] = { status: anStatus, remarks: p.afternoonRemarks || p.currentRemarks || "" };
    });
    return { FORENOON: fn, AFTERNOON: an };
  });

  // Track original snapshot for each session
  const [originalSnapshot, setOriginalSnapshot] = useState(sessionMap);
  const [isPending, startTransition] = useTransition();
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  // Filter out any "Administrators" category completely
  const filteredCategories = useMemo(() => {
    return categories.filter(
      (c) => c.id !== "ADMINS" && !c.label.toLowerCase().includes("administrator")
    );
  }, [categories]);

  // Update session maps when `people` or `initialDate` props change
  useEffect(() => {
    setSelectedDate(initialDate);
    const fn: Record<string, { status: string; remarks: string }> = {};
    const an: Record<string, { status: string; remarks: string }> = {};
    people.forEach((p) => {
      const fnStatus = p.forenoonStatus || (p.currentStatus === "LEAVE" ? "LATE" : p.currentStatus) || "NOT_MARKED";
      const anStatus = p.afternoonStatus || (p.currentStatus === "LEAVE" ? "LATE" : p.currentStatus) || "NOT_MARKED";
      fn[p.id] = { status: fnStatus, remarks: p.forenoonRemarks || p.currentRemarks || "" };
      an[p.id] = { status: anStatus, remarks: p.afternoonRemarks || p.currentRemarks || "" };
    });
    const newSessionMap = { FORENOON: fn, AFTERNOON: an };
    setSessionMap(newSessionMap);
    setOriginalSnapshot(newSessionMap);
  }, [people, initialDate]);

  // Determine if there are unsaved changes in the currently active session
  const hasUnsavedChanges = useMemo(() => {
    const activeMap = sessionMap[session];
    const origMap = originalSnapshot[session];
    for (const p of people) {
      const cur = activeMap[p.id];
      const orig = origMap[p.id];
      if (!orig || !cur) continue;
      if (cur.status !== orig.status || cur.remarks !== orig.remarks) {
        return true;
      }
    }
    return false;
  }, [people, sessionMap, originalSnapshot, session]);

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

  // Dynamic counter pills based on currently active session (Present, Absent, Late)
  const counters = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let marked = 0;

    const activeMap = sessionMap[session] || {};
    Object.values(activeMap).forEach(({ status }) => {
      if (status === "PRESENT") present++;
      else if (status === "ABSENT") absent++;
      else if (status === "LATE") late++;

      if (status !== "NOT_MARKED" && status !== "") {
        marked++;
      }
    });

    return {
      present,
      absent,
      late,
      marked,
      total: people.length,
    };
  }, [sessionMap, session, people.length]);

  // Separate session progress counts for overview
  const sessionOverviewCounts = useMemo(() => {
    let fnMarked = 0;
    let anMarked = 0;

    Object.values(sessionMap.FORENOON || {}).forEach(({ status }) => {
      if (status && status !== "NOT_MARKED") fnMarked++;
    });
    Object.values(sessionMap.AFTERNOON || {}).forEach(({ status }) => {
      if (status && status !== "NOT_MARKED") anMarked++;
    });

    return {
      fnMarked,
      anMarked,
      total: people.length,
    };
  }, [sessionMap, people.length]);

  // Calculate dynamic live percentage & breakdown connected to database state
  const getLivePersonStats = (person: AttendancePersonItem) => {
    // DB status at page load for Forenoon and Afternoon
    const fnInDb = originalSnapshot.FORENOON[person.id]?.status;
    const anInDb = originalSnapshot.AFTERNOON[person.id]?.status;

    // Baseline counts from DB strictly prior to today's date
    const dbFnPresent = fnInDb === "PRESENT" ? 1 : 0;
    const dbFnAbsent = fnInDb === "ABSENT" ? 1 : 0;
    const dbFnLate = fnInDb === "LATE" ? 1 : 0;

    const dbAnPresent = anInDb === "PRESENT" ? 1 : 0;
    const dbAnAbsent = anInDb === "ABSENT" ? 1 : 0;
    const dbAnLate = anInDb === "LATE" ? 1 : 0;

    const priorPresent = Math.max(0, person.presentCount - dbFnPresent - dbAnPresent);
    const priorAbsent = Math.max(0, person.absentCount - dbFnAbsent - dbAnAbsent);
    const priorLate = Math.max(0, person.lateCount - dbFnLate - dbAnLate);

    // Active live selections for Forenoon and Afternoon
    const fnLive = sessionMap.FORENOON[person.id]?.status || fnInDb || "NOT_MARKED";
    const anLive = sessionMap.AFTERNOON[person.id]?.status || anInDb || "NOT_MARKED";

    let livePresent = priorPresent;
    let liveAbsent = priorAbsent;
    let liveLate = priorLate;

    if (fnLive === "PRESENT") livePresent += 1;
    else if (fnLive === "ABSENT") liveAbsent += 1;
    else if (fnLive === "LATE") liveLate += 1;

    if (anLive === "PRESENT") livePresent += 1;
    else if (anLive === "ABSENT") liveAbsent += 1;
    else if (anLive === "LATE") liveLate += 1;

    // Both Present and Late count as attended session for overall percentage
    const attendedSessions = livePresent + liveLate;
    const totalRecordedSessions = livePresent + liveAbsent + liveLate;
    const liveTotalSessions = Math.max(person.totalSessions, totalRecordedSessions, 1);

    const percentage = ((attendedSessions / liveTotalSessions) * 100).toFixed(1);

    const curStatus = session === "FORENOON" ? fnLive : anLive;

    return {
      percentage,
      totalSessions: liveTotalSessions,
      presentCount: livePresent,
      absentCount: liveAbsent,
      lateCount: liveLate,
      currentStatus: curStatus,
    };
  };

  // Toggle single member status (PRESENT, ABSENT, LATE)
  const setMemberStatus = (
    personId: string,
    newStatus: "PRESENT" | "ABSENT" | "LATE",
    remarks?: string
  ) => {
    setSessionMap((prev) => {
      const activeMap = { ...prev[session] };
      activeMap[personId] = {
        status: newStatus,
        remarks: remarks !== undefined ? remarks : activeMap[personId]?.remarks || "",
      };
      return {
        ...prev,
        [session]: activeMap,
      };
    });
  };

  // Quick mark all currently filtered members in active session (P, A, or L)
  const handleQuickMarkAll = (status: "PRESENT" | "ABSENT" | "LATE") => {
    setSessionMap((prev) => {
      const activeMap = { ...prev[session] };
      filteredPeople.forEach((p) => {
        activeMap[p.id] = {
          status,
          remarks: activeMap[p.id]?.remarks || "",
        };
      });
      return {
        ...prev,
        [session]: activeMap,
      };
    });
  };

  // Date Change Handler
  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    onDateChange(newDate);
  };

  // Discard changes and revert to original snapshot for active session
  const handleDiscard = () => {
    setSessionMap((prev) => ({
      ...prev,
      [session]: { ...originalSnapshot[session] },
    }));
  };

  // Save changes to database for active session
  const handleSave = () => {
    startTransition(async () => {
      const activeMap = sessionMap[session];
      const recordsToSave = Object.entries(activeMap).map(([id, item]) => ({
        id,
        status: item.status,
        remarks: item.remarks,
      }));

      const res = await onSave(recordsToSave, selectedDate, session);
      if (res.success) {
        setOriginalSnapshot((prev) => ({
          ...prev,
          [session]: { ...activeMap },
        }));
        setSaveSuccessMsg(true);
        setTimeout(() => setSaveSuccessMsg(false), 3000);
      }
    });
  };

  return (
    <div className={styles.pageContainer}>
      {/* 1. Top Header */}
      <div className={styles.headerSection}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {subtitle ? <p className={styles.pageSubtitle}>{subtitle}</p> : null}
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

        <div style={{ width: "100%", maxWidth: "340px", minWidth: "220px" }}>
          <SearchBar
            placeholder={title.toLowerCase().includes("teacher") ? "Search teachers by name/code..." : "Search students by name/roll..."}
            value={searchQuery}
            onChange={(val) => setSearchQuery(val)}
            onPendingChange={(pending) => setIsPendingSearch(pending)}
            style={{ maxWidth: "100%" }}
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
              <span>Unsaved changes ({session === "FORENOON" ? "Forenoon" : "Afternoon"})</span>
            </div>
          )}

          {saveSuccessMsg && (
            <div className={styles.unsavedBadge} style={{ background: "rgba(5, 150, 105, 0.15)", color: "#059669" }}>
              <Check size={13} />
              <span>{session === "FORENOON" ? "Forenoon" : "Afternoon"} saved successfully!</span>
            </div>
          )}
        </div>

        {/* Status Counter Pills Row (Present, Absent, Late, Total) */}
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
          <span className={styles.pillTotalCount}>
            <Users size={14} />
            <span>{counters.marked}/{counters.total}</span>
          </span>
        </div>

        {/* Quick Mark All Row: P / A / L */}
        <div className={styles.markAllRow}>
          <span>Mark all {session === "FORENOON" ? "Forenoon" : "Afternoon"}:</span>
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

      {/* 4. Table of Members (Clean 3-column table: #, Member, Status: P, A, L) */}
      <ResultsContainer
        isPending={isPendingSearch}
        isEmpty={filteredPeople.length === 0}
        emptyTitle={title.toLowerCase().includes("teacher") ? "No faculty members found" : "No students found"}
        emptyMessage="Try adjusting your search query or class category."
        onReset={() => setSearchQuery("")}
        resetLabel="Clear Search"
      >
      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th} style={{ width: "50px" }}>#</th>
                <th className={styles.th}>
                  {title.toLowerCase().includes("teacher") ? "FACULTY MEMBER" : "STUDENT"}
                </th>
                <th className={styles.th} style={{ textAlign: "center" }}>
                  {session === "FORENOON" ? "FORENOON STATUS" : "AFTERNOON STATUS"}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPeople.map((person, index) => {
                const cur = sessionMap[session][person.id] || { status: "NOT_MARKED", remarks: "" };
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
                            title="Click to view overall attendance breakdown"
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

                    {/* Attendance Status Buttons: P, A, L */}
                    <td className={styles.td} style={{ textAlign: "center" }}>
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

                        {/* L: Late (Replaced Leave) */}
                        <button
                          type="button"
                          onClick={() => setMemberStatus(person.id, "LATE")}
                          className={`${styles.statusBtn} ${st === "LATE" ? styles.btnL_active : styles.btnL_inactive}`}
                          title="Late"
                        >
                          L
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </ResultsContainer>

      {/* 5. Session Overview Card (Bottom) */}
      <div className={styles.overviewCard}>
        <h3 className={styles.overviewTitle}>Session Overview</h3>
        <div className={styles.overviewGrid}>
          {/* Forenoon */}
          <div className={styles.sessionCard}>
            <span className={styles.sessionCardHeader}>Forenoon</span>
            <span className={styles.sessionCardCount}>
              {sessionOverviewCounts.fnMarked}/{sessionOverviewCounts.total}
            </span>
            <div className={styles.progressBarTrack}>
              <div 
                className={styles.progressBarFill} 
                style={{ width: `${sessionOverviewCounts.total > 0 ? (sessionOverviewCounts.fnMarked / sessionOverviewCounts.total) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Afternoon */}
          <div className={styles.sessionCard}>
            <span className={styles.sessionCardHeader}>Afternoon</span>
            <span className={styles.sessionCardCount}>
              {sessionOverviewCounts.anMarked}/{sessionOverviewCounts.total}
            </span>
            <div className={styles.progressBarTrack}>
              <div 
                className={styles.progressBarFill} 
                style={{ width: `${sessionOverviewCounts.total > 0 ? (sessionOverviewCounts.anMarked / sessionOverviewCounts.total) * 100 : 0}%` }}
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

        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className={styles.saveBtn}
        >
          {isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Saving {session === "FORENOON" ? "Forenoon" : "Afternoon"}...</span>
            </>
          ) : (
            <>
              <Check size={16} strokeWidth={2.5} />
              <span>Save {session === "FORENOON" ? "Forenoon" : "Afternoon"}</span>
            </>
          )}
        </button>
      </div>

      {/* 7. Percentage View Modal with Box Viewing & Beautiful Table (Present, Absent, Late) */}
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
                    Calculated from <strong>{liveModalStats.totalSessions}</strong> official school working sessions
                  </p>
                </div>
                <div className={styles.modalHeroIconWrapper}>
                  <Award size={48} className={styles.modalHeroIcon} />
                </div>
              </div>

              {/* 1. Box Viewing: Attendance Summary Boxes (Present, Absent, Late) */}
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
                    <span className={styles.boxSubtext}>On-Time Sessions</span>
                  </div>

                  {/* Box 2: Absent */}
                  <div className={`${styles.statBox} ${styles.boxAbsent}`}>
                    <div className={styles.boxHeader}>
                      <span className={styles.boxLabel}>Absent</span>
                      <XCircle size={16} className={styles.boxIcon} />
                    </div>
                    <div className={styles.boxValue}>{liveModalStats.absentCount}</div>
                    <span className={styles.boxSubtext}>Unexcused</span>
                  </div>

                  {/* Box 3: Late */}
                  <div className={`${styles.statBox} ${styles.boxLate}`}>
                    <div className={styles.boxHeader}>
                      <span className={styles.boxLabel}>Late</span>
                      <Clock size={16} className={styles.boxIcon} />
                    </div>
                    <div className={styles.boxValue}>{liveModalStats.lateCount}</div>
                    <span className={styles.boxSubtext}>Late Arrival</span>
                  </div>
                </div>
              </div>

              {/* 2. Table Viewing: Recent Attendance Log Table */}
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
                            const sessionName = item.session ? item.session : (
                              item.remarks?.toUpperCase().includes("AFTERNOON") || itemDate.getUTCHours() >= 12
                                ? "Afternoon"
                                : "Forenoon"
                            );

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
                                  {item.status === "ABSENT" && (
                                    <span className={`${styles.statusPill} ${styles.pillStatusAbsent}`}>
                                      <XCircle size={12} /> Absent
                                    </span>
                                  )}
                                  {item.status === "LATE" && (
                                    <span className={`${styles.statusPill} ${styles.pillStatusLate}`}>
                                      <Clock size={12} /> Late
                                    </span>
                                  )}
                                  {item.status === "LEAVE" && (
                                    <span className={`${styles.statusPill} ${styles.pillStatusLate}`}>
                                      <Clock size={12} /> Late / Leave
                                    </span>
                                  )}
                                  {!["PRESENT", "ABSENT", "LATE", "LEAVE"].includes(item.status) && (
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
