"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import Link from "next/link";
import { 
  ArrowLeft, Search, RotateCw, Check, AlertCircle, 
  X, Award, Clock, Sparkles, Users, Loader2 
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
  backUrl?: string;
  backLabel?: string;
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
  backUrl,
  backLabel = "Back to Faculty Roster",
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
      if (activeCategoryId && p.category && p.category !== activeCategoryId) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.codeOrRoll.toLowerCase().includes(q)
      );
    });
  }, [people, activeCategoryId, searchQuery]);

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

  // Date Change Handler
  const handleDateChange = (val: string) => {
    setSelectedDate(val);
    onDateChange(val);
  };

  // Change status of one member
  const setMemberStatus = (id: string, newStatus: string, defaultRemark?: string) => {
    setLocalMap((prev) => ({
      ...prev,
      [id]: {
        status: newStatus,
        remarks: defaultRemark !== undefined ? defaultRemark : prev[id]?.remarks || "",
      },
    }));
    setActiveHalfDayPopover(null);
  };

  // Change remarks of one member
  const setMemberRemark = (id: string, text: string) => {
    setLocalMap((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        remarks: text,
      },
    }));
  };

  // Quick Mark All (for filtered people)
  const handleQuickMarkAll = (statusToSet: string) => {
    setLocalMap((prev) => {
      const next = { ...prev };
      filteredPeople.forEach((p) => {
        next[p.id] = {
          ...next[p.id],
          status: statusToSet,
        };
      });
      return next;
    });
  };

  // Discard changes
  const handleDiscard = () => {
    setLocalMap(originalSnapshot);
  };

  // Save changes
  const handleSave = () => {
    const payload = people.map((p) => ({
      id: p.id,
      status: localMap[p.id]?.status || "NOT_MARKED",
      remarks: localMap[p.id]?.remarks || "",
    }));

    startTransition(async () => {
      const res = await onSave(payload, selectedDate, session);
      if (res?.success) {
        setOriginalSnapshot(localMap);
        setSaveSuccessMsg(true);
        setTimeout(() => setSaveSuccessMsg(false), 3000);
      }
    });
  };

  return (
    <div className={styles.pageContainer}>
      {/* 1. Top Header & Back Button */}
      <div className={styles.headerSection}>
        <h1 className={styles.pageTitle}>{title}</h1>
        <p className={styles.pageSubtitle}>{subtitle}</p>

        {backUrl && (
          <Link href={backUrl} prefetch={true} className={styles.backBtn}>
            <ArrowLeft size={15} />
            <span>{backLabel}</span>
          </Link>
        )}
      </div>

      {/* 2. Scope Card: Category Tabs & Search Bar */}
      <div className={styles.scopeCard}>
        {categories.length > 0 && (
          <div className={styles.categoryTabs}>
            {categories.map((cat) => {
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
                onClick={() => handleDateChange(selectedDate)}
                className={styles.refreshBtn}
                title="Refresh attendance"
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

      {/* 4. Table of Members (No extra details, clean status buttons & percentage modal) */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th} style={{ width: "45px" }}>#</th>
                <th className={styles.th}>
                  {title.toLowerCase().includes("teacher") ? "FACULTY MEMBER" : "STUDENT"}
                </th>
                <th className={styles.th}>ATTENDANCE STATUS</th>
                <th className={styles.th}>NOTE / REMARK</th>
              </tr>
            </thead>
            <tbody>
              {filteredPeople.map((person, index) => {
                const cur = localMap[person.id] || { status: "NOT_MARKED", remarks: "" };
                const st = cur.status;

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

                        {/* Percentage View Button / Badge */}
                        <button
                          type="button"
                          onClick={() => setSelectedPersonForModal(person)}
                          className={styles.pctBadge}
                          title="Click to view attendance percentage & breakdown"
                        >
                          <Award size={12} />
                          <span>{person.attendancePercentage}%</span>
                        </button>
                      </div>
                    </td>

                    {/* Attendance Status Buttons: P, A, L, LE, HD */}
                    <td className={styles.td} style={{ position: "relative" }}>
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

                    {/* Note / Remarks Input */}
                    <td className={styles.td}>
                      <input
                        type="text"
                        placeholder="Add note..."
                        value={cur.remarks}
                        onChange={(e) => setMemberRemark(person.id, e.target.value)}
                        className={styles.remarkInput}
                      />
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

      {/* 7. Percentage View Modal (Requested: click option to view that person's percentage) */}
      {selectedPersonForModal && (
        <div className={styles.modalBackdrop} onClick={() => setSelectedPersonForModal(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>
                  {selectedPersonForModal.name}
                </h3>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  {selectedPersonForModal.codeOrRoll}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPersonForModal(null)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Hero Percentage Card */}
            <div className={styles.modalHeroPct}>
              <div>
                <span className={styles.modalHeroLabel}>Overall Attendance</span>
                <div className={styles.modalHeroValue}>
                  {selectedPersonForModal.attendancePercentage}%
                </div>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  Calculated from {selectedPersonForModal.totalSessions} total recorded sessions
                </span>
              </div>

              <Award size={48} color="#2563eb" style={{ opacity: 0.8 }} />
            </div>

            {/* Breakdown Grid */}
            <div className={styles.breakdownGrid}>
              <div className={styles.breakdownBox}>
                <span className={styles.breakdownBoxLabel}>Total Sessions</span>
                <span className={styles.breakdownBoxValue}>{selectedPersonForModal.totalSessions}</span>
              </div>
              <div className={styles.breakdownBox}>
                <span className={styles.breakdownBoxLabel} style={{ color: "var(--success)" }}>Present</span>
                <span className={styles.breakdownBoxValue} style={{ color: "var(--success)" }}>
                  {selectedPersonForModal.presentCount}
                </span>
              </div>
              <div className={styles.breakdownBox}>
                <span className={styles.breakdownBoxLabel} style={{ color: "#dc2626" }}>Absent</span>
                <span className={styles.breakdownBoxValue} style={{ color: "#dc2626" }}>
                  {selectedPersonForModal.absentCount}
                </span>
              </div>
              <div className={styles.breakdownBox}>
                <span className={styles.breakdownBoxLabel} style={{ color: "#7c3aed" }}>On Leave</span>
                <span className={styles.breakdownBoxValue} style={{ color: "#7c3aed" }}>
                  {selectedPersonForModal.leaveCount}
                </span>
              </div>
              <div className={styles.breakdownBox}>
                <span className={styles.breakdownBoxLabel} style={{ color: "#d97706" }}>Late</span>
                <span className={styles.breakdownBoxValue} style={{ color: "#d97706" }}>
                  {selectedPersonForModal.lateCount}
                </span>
              </div>
              <div className={styles.breakdownBox}>
                <span className={styles.breakdownBoxLabel} style={{ color: "#2563eb" }}>Half Day</span>
                <span className={styles.breakdownBoxValue} style={{ color: "#2563eb" }}>
                  {selectedPersonForModal.halfDayCount}
                </span>
              </div>
            </div>

            {/* Recent History */}
            {selectedPersonForModal.recentHistory && selectedPersonForModal.recentHistory.length > 0 && (
              <div>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground)", display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
                  <Clock size={14} color="#2563eb" />
                  Recent Sessions Log
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", maxHeight: "160px", overflowY: "auto" }}>
                  {selectedPersonForModal.recentHistory.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.45rem 0.75rem",
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "7px",
                        fontSize: "0.825rem",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>
                        {new Date(item.date).toLocaleDateString()}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {item.remarks && (
                          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                            {item.remarks}
                          </span>
                        )}
                        <span style={{ fontWeight: 700, fontSize: "0.75rem" }}>
                          {item.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
