"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  UserX,
  UserCheck,
  Clock,
  AlertCircle,
  CheckCircle,
  X,
  Loader2,
  MapPin,
  ChevronRight,
  ShieldAlert,
  Search,
  Undo2,
  Trash2,
  CheckSquare,
  Square
} from "lucide-react";
import {
  markTeacherAbsenceAction,
  getAbsentTeacherPeriodsAction,
  getFreeTeachersForPeriodsAction,
  assignSubstitutesBatchAction,
  undoSubstitutionAssignmentAction,
  cancelAbsenceAction,
  getSubstitutionDataForDateAction,
  type FreeTeacherItem,
  type AbsentPeriodSlot
} from "@/backend/api/actions/dashboard/admin/substitution/substitutionActions";
import { formatSchoolDate } from "@/backend/lib/timetable/getEffectiveTimetable";

interface TeacherItem {
  id: string;
  name: string;
  email?: string;
  subjects: string[];
}

interface SubstitutionClientProps {
  initialDate: string;
  initialTeacherId: string;
  initialData: any;
  initialTeacherPeriods: any;
  allTeachers: TeacherItem[];
}

export default function SubstitutionClient({
  initialDate,
  initialTeacherId,
  initialData,
  initialTeacherPeriods,
  allTeachers
}: SubstitutionClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [data, setData] = useState(initialData);

  // Selected absent teacher to inspect/assign
  const [activeTeacherId, setActiveTeacherId] = useState<string>(
    initialTeacherId || (initialData?.absences?.[0]?.teacherId || "")
  );
  const [teacherPeriods, setTeacherPeriods] = useState<AbsentPeriodSlot[]>(
    initialTeacherPeriods?.periods || []
  );
  const [loadingPeriods, setLoadingPeriods] = useState(false);

  // Period selection state (ticked periods)
  const [selectedPeriodIds, setSelectedPeriodIds] = useState<string[]>([]);

  // Free teachers side-panel / bottom-sheet state
  const [freeTeachers, setFreeTeachers] = useState<FreeTeacherItem[]>([]);
  const [loadingFreeTeachers, setLoadingFreeTeachers] = useState(false);
  const [matchAllPeriods, setMatchAllPeriods] = useState(true);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [selectedSubstituteId, setSelectedSubstituteId] = useState<string | null>(null);
  const [isFreePeriodChoice, setIsFreePeriodChoice] = useState(false);

  // Per-period individual teacher picker map: { timetableEntryId -> substituteTeacherId }
  const [individualAssignments, setIndividualAssignments] = useState<Record<string, string>>({});

  // Confirm dialog and toasts
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [lastAssignedBatch, setLastAssignedBatch] = useState<string[] | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // STEP A: Mark Teacher Absent Modal
  const [showMarkModal, setShowMarkModal] = useState(false);
  const [modalTeacherId, setModalTeacherId] = useState("");
  const [modalDate, setModalDate] = useState(selectedDate);
  const [modalReason, setModalReason] = useState("Medical Leave");
  const [modalFullDay, setModalFullDay] = useState(true);
  const [modalSelectedPeriods, setModalSelectedPeriods] = useState<number[]>([]);
  const [modalTeacherSearch, setModalTeacherSearch] = useState("");
  const [modalPeriodsAvailable, setModalPeriodsAvailable] = useState<number[]>([]);
  const [loadingModalPeriods, setLoadingModalPeriods] = useState(false);

  // Active absence record for current teacher
  const currentAbsence = useMemo(() => {
    return data?.absences?.find((a: any) => a.teacherId === activeTeacherId) || null;
  }, [data, activeTeacherId]);

  // Load periods when activeTeacherId or selectedDate changes
  useEffect(() => {
    if (!activeTeacherId) {
      setTeacherPeriods([]);
      return;
    }
    let isCancelled = false;
    setLoadingPeriods(true);
    getAbsentTeacherPeriodsAction(activeTeacherId, selectedDate).then(res => {
      if (!isCancelled) {
        if (res.success) {
          setTeacherPeriods(res.periods);
        } else {
          setTeacherPeriods([]);
        }
        setSelectedPeriodIds([]);
        setSelectedSubstituteId(null);
        setIsFreePeriodChoice(false);
        setLoadingPeriods(false);
      }
    });
    return () => { isCancelled = true; };
  }, [activeTeacherId, selectedDate]);

  // Load free teachers whenever selected periods or matchAllPeriods changes
  const selectedPeriodNumbers = useMemo(() => {
    return teacherPeriods
      .filter(p => selectedPeriodIds.includes(p.timetableEntryId))
      .map(p => p.period);
  }, [teacherPeriods, selectedPeriodIds]);

  useEffect(() => {
    if (selectedPeriodNumbers.length === 0 || !activeTeacherId) {
      setFreeTeachers([]);
      return;
    }
    let isCancelled = false;
    setLoadingFreeTeachers(true);
    getFreeTeachersForPeriodsAction({
      dateStr: selectedDate,
      periodNumbers: selectedPeriodNumbers,
      absentTeacherId: activeTeacherId,
      matchAllPeriods
    }).then(res => {
      if (!isCancelled) {
        if (res.success) {
          setFreeTeachers(res.freeTeachers);
        } else {
          setFreeTeachers([]);
        }
        setLoadingFreeTeachers(false);
      }
    });
    return () => { isCancelled = true; };
  }, [selectedPeriodNumbers, activeTeacherId, selectedDate, matchAllPeriods]);

  // Handle date change
  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    startTransition(async () => {
      const res = await getSubstitutionDataForDateAction(newDate);
      if (res.success) {
        setData(res);
      }
      router.push(`/dashboard/admin/timetable/substitution?date=${newDate}`);
    });
  };

  const refreshData = async () => {
    const res = await getSubstitutionDataForDateAction(selectedDate);
    if (res.success) {
      setData(res);
    }
    if (activeTeacherId) {
      const pRes = await getAbsentTeacherPeriodsAction(activeTeacherId, selectedDate);
      if (pRes.success) setTeacherPeriods(pRes.periods);
    }
  };

  // Toggle selection for a period checkbox
  const togglePeriodSelection = (entrySlotId: string) => {
    setSelectedPeriodIds(prev =>
      prev.includes(entrySlotId) ? prev.filter(id => id !== entrySlotId) : [...prev, entrySlotId]
    );
  };

  const handleSelectAll = () => {
    setSelectedPeriodIds(teacherPeriods.map(p => p.timetableEntryId));
  };

  const handleClearAll = () => {
    setSelectedPeriodIds([]);
    setSelectedSubstituteId(null);
    setIsFreePeriodChoice(false);
  };

  // When modalTeacherId changes, load their scheduled periods for that day
  useEffect(() => {
    if (!modalTeacherId || modalFullDay) {
      setModalPeriodsAvailable([]);
      return;
    }
    setLoadingModalPeriods(true);
    getAbsentTeacherPeriodsAction(modalTeacherId, modalDate).then(res => {
      if (res.success && res.periods.length > 0) {
        const pNums = res.periods.map(p => p.period);
        setModalPeriodsAvailable(pNums);
        setModalSelectedPeriods(pNums);
      } else {
        setModalPeriodsAvailable([]);
        setModalSelectedPeriods([]);
      }
      setLoadingModalPeriods(false);
    });
  }, [modalTeacherId, modalDate, modalFullDay]);

  // STEP A: Submit Mark Absent
  const handleSaveAbsence = async () => {
    if (!modalTeacherId) {
      setErrorMessage("Please select a teacher to mark absent.");
      return;
    }
    setErrorMessage(null);
    startTransition(async () => {
      const res = await markTeacherAbsenceAction({
        teacherId: modalTeacherId,
        dateStr: modalDate,
        fullDay: modalFullDay,
        periodNumbers: !modalFullDay ? modalSelectedPeriods : undefined,
        reason: modalReason
      });

      if (!res.success) {
        setErrorMessage(res.error || "Failed to mark absence.");
      } else {
        setShowMarkModal(false);
        setActiveTeacherId(modalTeacherId);
        setSelectedDate(modalDate);
        setToastMessage(`Teacher marked absent. Now select periods and assign substitutes.`);
        await refreshData();
      }
    });
  };

  // STEP D: Execute Assignment
  const handleExecuteAssign = () => {
    if (selectedPeriodIds.length === 0) return;
    if (!selectedSubstituteId && !isFreePeriodChoice) return;

    setErrorMessage(null);
    startTransition(async () => {
      const assignmentsPayload = selectedPeriodIds.map(slotId => ({
        timetableEntryId: slotId,
        substituteTeacherId: isFreePeriodChoice ? null : (individualAssignments[slotId] || selectedSubstituteId),
        isFreePeriod: isFreePeriodChoice
      }));

      const res = await assignSubstitutesBatchAction({
        dateStr: selectedDate,
        absentTeacherId: activeTeacherId,
        assignments: assignmentsPayload
      });

      if (!res.success) {
        setErrorMessage(res.error || "Failed to assign substitutes.");
      } else {
        setShowConfirmModal(false);
        const subName = isFreePeriodChoice
          ? "Free Period (No substitute)"
          : allTeachers.find(t => t.id === selectedSubstituteId)?.name || "Substitute Teacher";
        setToastMessage(`Successfully assigned ${subName} to ${selectedPeriodIds.length} period(s)!`);
        setLastAssignedBatch(selectedPeriodIds);
        setSelectedPeriodIds([]);
        setSelectedSubstituteId(null);
        setIsFreePeriodChoice(false);
        await refreshData();
      }
    });
  };

  // Handle Undo Last Assignment
  const handleUndoAssignment = async () => {
    if (!lastAssignedBatch || lastAssignedBatch.length === 0) return;
    startTransition(async () => {
      const res = await undoSubstitutionAssignmentAction(lastAssignedBatch);
      if (res.success) {
        setToastMessage("Last substitution assignment undone.");
        setLastAssignedBatch(null);
        await refreshData();
      }
    });
  };

  // Cancel Absence
  const handleCancelCurrentAbsence = async (absenceId: string) => {
    if (!confirm("Cancel this teacher absence? All associated substitutions will be reverted to the normal schedule.")) {
      return;
    }
    startTransition(async () => {
      const res = await cancelAbsenceAction(absenceId);
      if (!res.success) {
        setErrorMessage(res.error || "Failed to cancel absence.");
      } else {
        setToastMessage("Absence cancelled. All schedule overlays reverted.");
        await refreshData();
      }
    });
  };

  // Filtered free teachers for search
  const filteredFreeTeachers = useMemo(() => {
    if (!teacherSearch.trim()) return freeTeachers;
    const q = teacherSearch.toLowerCase();
    return freeTeachers.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.subjects.some(s => s.toLowerCase().includes(q))
    );
  }, [freeTeachers, teacherSearch]);

  const activeAbsentTeacherObj = allTeachers.find(t => t.id === activeTeacherId);
  const selectedSubTeacherObj = allTeachers.find(t => t.id === selectedSubstituteId);

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      {/* Toast Notification Alert */}
      {toastMessage && (
        <div style={{ background: "rgba(16, 185, 129, 0.12)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "10px", padding: "0.85rem 1.25rem", marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <CheckCircle size={18} />
            <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{toastMessage}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {lastAssignedBatch && (
              <button
                type="button"
                onClick={handleUndoAssignment}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", padding: "0.3rem 0.65rem", borderRadius: "6px", border: "1px solid #10b981", background: "transparent", color: "#10b981", cursor: "pointer", fontSize: "0.78rem", fontWeight: 700 }}
              >
                <Undo2 size={13} /> Undo
              </button>
            )}
            <button onClick={() => setToastMessage(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><X size={16} /></button>
          </div>
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

      {/* TOP CONTROLS: Date Selection & Mark Absent Button */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "1rem", background: "var(--card-bg)", padding: "1.25rem", borderRadius: "12px", border: "1px solid var(--border-color)", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <CalendarIcon size={16} /> Date:
          </span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            disabled={isPending}
            style={{ padding: "0.55rem 0.85rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontWeight: 600 }}
          />
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>
            ({formatSchoolDate(selectedDate)})
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            setModalDate(selectedDate);
            setModalTeacherId("");
            setModalReason("Medical Leave");
            setModalFullDay(true);
            setErrorMessage(null);
            setShowMarkModal(true);
          }}
          disabled={isPending}
          style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", padding: "0.65rem 1.15rem", borderRadius: "8px", background: "var(--danger)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.875rem" }}
        >
          <UserX size={16} /> Mark Teacher Absent
        </button>
      </div>

      {/* MAIN TWO-COLUMN WORKFLOW AREA (Periods on Left, Free Teachers on Right) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: "1.5rem", alignItems: "start" }}>

        {/* LEFT COLUMN: Absent Teacher's Periods Checklist */}
        <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1px solid var(--border-color)", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Header & Absent Teacher Selector */}
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "0.35rem" }}>
              Viewing Absent Teacher:
            </label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={activeTeacherId}
                onChange={(e) => setActiveTeacherId(e.target.value)}
                style={{ flex: 1, minWidth: "220px", padding: "0.6rem 0.85rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontWeight: 700, fontSize: "0.92rem" }}
              >
                <option value="">-- Choose Absent Teacher --</option>
                {allTeachers.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} {data?.absences?.some((a: any) => a.teacherId === t.id) ? "⚠️ (Marked Absent)" : ""}
                  </option>
                ))}
              </select>

              {currentAbsence && (
                <button
                  type="button"
                  onClick={() => handleCancelCurrentAbsence(currentAbsence.id)}
                  disabled={isPending}
                  style={{ padding: "0.55rem 0.85rem", borderRadius: "8px", border: "1px solid var(--danger)", background: "transparent", color: "var(--danger)", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}
                  title="Cancel absence and restore timetable"
                >
                  Cancel Absence
                </button>
              )}
            </div>

            {currentAbsence && (
              <div style={{ marginTop: "0.6rem", padding: "0.6rem 0.85rem", borderRadius: "8px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", fontSize: "0.8rem" }}>
                <div><strong>Reason:</strong> {currentAbsence.reason || "Not specified"}</div>
                <div><strong>Scope:</strong> {currentAbsence.fullDay ? "Full Day" : `Periods: ${currentAbsence.periodNumbers || "Partial"}`}</div>
              </div>
            )}
          </div>

          {/* Periods List & Checklist Controls */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                Periods on {formatSchoolDate(selectedDate)}
                {teacherPeriods.length > 0 && ` (${teacherPeriods.length})`}
              </div>

              {teacherPeriods.length > 0 && (
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    style={{ padding: "0.3rem 0.65rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600 }}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    style={{ padding: "0.3rem 0.65rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: "0.75rem" }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Selection Counter */}
            {selectedPeriodIds.length > 0 && (
              <div style={{ background: "rgba(99, 102, 241, 0.1)", border: "1px solid rgba(99, 102, 241, 0.25)", color: "var(--primary)", padding: "0.45rem 0.75rem", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>✓ {selectedPeriodIds.length} period(s) selected for coverage</span>
                <span>Select a free teacher on the right →</span>
              </div>
            )}

            {/* Period Cards */}
            {loadingPeriods ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                <Loader2 size={20} className="animate-spin" style={{ margin: "0 auto 0.5rem" }} />
                Loading periods...
              </div>
            ) : !activeTeacherId ? (
              <div style={{ padding: "2.5rem 1rem", textAlign: "center", color: "var(--text-secondary)", border: "1px dashed var(--border-color)", borderRadius: "10px" }}>
                <UserX size={32} style={{ opacity: 0.3, margin: "0 auto 0.5rem" }} />
                <p style={{ margin: 0 }}>Please select an absent teacher above.</p>
              </div>
            ) : teacherPeriods.length === 0 ? (
              <div style={{ padding: "2.5rem 1rem", textAlign: "center", color: "var(--text-secondary)", border: "1px dashed var(--border-color)", borderRadius: "10px" }}>
                <CheckCircle size={32} style={{ opacity: 0.3, margin: "0 auto 0.5rem", color: "var(--success)" }} />
                <p style={{ margin: 0, fontWeight: 600, color: "var(--text-primary)" }}>No classes on this day</p>
                <p style={{ fontSize: "0.8rem", margin: "0.25rem 0 0 0" }}>This teacher has no scheduled periods on this day of the week.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {teacherPeriods.map(p => {
                  const isChecked = selectedPeriodIds.includes(p.timetableEntryId);
                  const isAssigned = p.status === "ASSIGNED" && p.substituteTeacherName;
                  const isFree = p.status === "FREE_PERIOD";

                  return (
                    <div
                      key={p.timetableEntryId}
                      onClick={() => togglePeriodSelection(p.timetableEntryId)}
                      style={{
                        padding: "0.85rem",
                        borderRadius: "10px",
                        border: isChecked ? "2px solid var(--primary)" : "1px solid var(--border-color)",
                        background: isChecked ? "rgba(99, 102, 241, 0.05)" : "var(--background)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.85rem",
                        transition: "all 0.15s ease"
                      }}
                    >
                      {/* Big touch target checkbox */}
                      <div style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", color: isChecked ? "var(--primary)" : "var(--text-secondary)" }}>
                        {isChecked ? <CheckSquare size={22} /> : <Square size={22} />}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                            Period {p.period}: {p.subjectName}
                          </span>
                          <span style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", borderRadius: "999px", background: "var(--card-bg)", border: "1px solid var(--border-color)", color: "var(--primary)", fontWeight: 600 }}>
                            {p.className}
                          </span>
                        </div>

                        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.2rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                            <Clock size={12} /> {p.startTime} - {p.endTime}
                          </span>
                          {p.classroom && (
                            <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                              <MapPin size={12} /> {p.classroom}
                            </span>
                          )}
                        </div>

                        {/* Status Label */}
                        <div style={{ marginTop: "0.35rem" }}>
                          {isAssigned ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", padding: "0.2rem 0.55rem", borderRadius: "6px", background: "rgba(16, 185, 129, 0.12)", color: "#10b981", fontSize: "0.75rem", fontWeight: 700 }}>
                              <UserCheck size={12} /> Assigned to {p.substituteTeacherName}
                            </span>
                          ) : isFree ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", padding: "0.2rem 0.55rem", borderRadius: "6px", background: "rgba(107, 114, 128, 0.15)", color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: 600 }}>
                              No substitute (Free Period)
                            </span>
                          ) : (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", padding: "0.2rem 0.55rem", borderRadius: "6px", background: "rgba(245, 158, 11, 0.12)", color: "#d97706", fontSize: "0.75rem", fontWeight: 600 }}>
                              <AlertCircle size={12} /> Not assigned
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
        </div>

        {/* RIGHT COLUMN: Free Teachers Pick & Assign Panel */}
        <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1px solid var(--border-color)", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
              Available Free Teachers
            </h3>
            <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              {selectedPeriodIds.length === 0
                ? "Tick one or more periods on the left to see free teachers."
                : `Showing teachers free during Period(s): ${selectedPeriodNumbers.join(", ")}`}
            </p>
          </div>

          {/* Search & Toggle: Free in ALL vs ANY period */}
          {selectedPeriodIds.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <div style={{ position: "relative" }}>
                <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
                <input
                  type="text"
                  placeholder="Search free teachers by name or subject..."
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  style={{ width: "100%", padding: "0.55rem 0.85rem 0.55rem 2.2rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.85rem" }}
                />
              </div>

              {selectedPeriodIds.length > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--input-bg)", padding: "0.45rem 0.75rem", borderRadius: "8px" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                    {matchAllPeriods ? "Showing teachers free in ALL selected periods" : "Showing teachers free in ANY selected period"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMatchAllPeriods(!matchAllPeriods)}
                    style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontSize: "0.78rem", fontWeight: 700, textDecoration: "underline" }}
                  >
                    {matchAllPeriods ? "Show partial matches" : "Require all periods"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Option: No Substitute (Free Period) */}
          {selectedPeriodIds.length > 0 && (
            <div
              onClick={() => {
                setIsFreePeriodChoice(true);
                setSelectedSubstituteId(null);
              }}
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                border: isFreePeriodChoice ? "2px solid var(--primary)" : "1px dashed var(--border-color)",
                background: isFreePeriodChoice ? "rgba(99, 102, 241, 0.08)" : "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>Mark as Free Period</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>No teacher will be assigned to cover these period(s)</div>
              </div>
              <div style={{ width: "20px", height: "20px", borderRadius: "50%", border: isFreePeriodChoice ? "5px solid var(--primary)" : "2px solid var(--border-color)" }} />
            </div>
          )}

          {/* Teacher List */}
          {selectedPeriodIds.length === 0 ? (
            <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--text-secondary)" }}>
              <Clock size={36} style={{ opacity: 0.25, margin: "0 auto 0.75rem" }} />
              <p style={{ margin: 0, fontWeight: 600 }}>No periods selected yet</p>
              <p style={{ fontSize: "0.8rem", margin: "0.25rem 0 0 0" }}>Check one or more period cards on the left to reveal available free teachers.</p>
            </div>
          ) : loadingFreeTeachers ? (
            <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              <Loader2 size={20} className="animate-spin" style={{ margin: "0 auto 0.5rem" }} />
              Checking teacher schedules and absences...
            </div>
          ) : filteredFreeTeachers.length === 0 ? (
            <div style={{ padding: "2.5rem 1rem", textAlign: "center", color: "var(--text-secondary)", border: "1px dashed var(--border-color)", borderRadius: "10px" }}>
              <p style={{ margin: 0, fontWeight: 600, color: "var(--text-primary)" }}>No free teachers found</p>
              <p style={{ fontSize: "0.8rem", margin: "0.25rem 0 0 0" }}>
                All faculty are either teaching their own classes or on leave during these period(s). You can mark as Free Period above.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "420px", overflowY: "auto" }}>
              {filteredFreeTeachers.map(teacher => {
                const isSelected = selectedSubstituteId === teacher.id && !isFreePeriodChoice;

                return (
                  <div
                    key={teacher.id}
                    onClick={() => {
                      setSelectedSubstituteId(teacher.id);
                      setIsFreePeriodChoice(false);
                    }}
                    style={{
                      padding: "0.75rem 1rem",
                      borderRadius: "8px",
                      border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border-color)",
                      background: isSelected ? "rgba(99, 102, 241, 0.08)" : "var(--background)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.85rem", flexShrink: 0 }}>
                        {teacher.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{teacher.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          {teacher.subjects.join(", ") || "Faculty"}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#10b981", fontWeight: 600, marginTop: "0.1rem" }}>
                          ✓ Free in Period: {teacher.freeInPeriods.join(", ")}
                        </div>
                      </div>
                    </div>

                    <div style={{ width: "20px", height: "20px", borderRadius: "50%", border: isSelected ? "5px solid var(--primary)" : "2px solid var(--border-color)", flexShrink: 0 }} />
                  </div>
                );
              })}
            </div>
          )}

          {/* STEP D: Final Assign Button */}
          <div style={{ marginTop: "auto", paddingTop: "1rem", borderTop: "1px solid var(--border-color)" }}>
            <button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              disabled={isPending || selectedPeriodIds.length === 0 || (!selectedSubstituteId && !isFreePeriodChoice)}
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "8px",
                border: "none",
                background: selectedPeriodIds.length > 0 && (selectedSubstituteId || isFreePeriodChoice) ? "var(--primary)" : "rgba(107, 114, 128, 0.3)",
                color: "#fff",
                fontWeight: 700,
                fontSize: "0.92rem",
                cursor: selectedPeriodIds.length > 0 && (selectedSubstituteId || isFreePeriodChoice) ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem"
              }}
            >
              {isPending ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
              Assign Substitute ({selectedPeriodIds.length} Period{selectedPeriodIds.length === 1 ? "" : "s"})
            </button>
          </div>
        </div>
      </div>

      {/* CONFIRMATION SUMMARY DIALOG */}
      {showConfirmModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1px solid var(--border-color)", width: "100%", maxWidth: "480px", padding: "1.5rem", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                Confirm Substitution Assignment
              </h3>
              <button onClick={() => setShowConfirmModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><X size={18} /></button>
            </div>

            <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "1.25rem" }}>
              Are you sure you want to assign{" "}
              <strong style={{ color: "var(--text-primary)" }}>
                {isFreePeriodChoice ? "Free Period (No substitute)" : selectedSubTeacherObj?.name}
              </strong>{" "}
              to cover the following periods on{" "}
              <strong style={{ color: "var(--text-primary)" }}>{formatSchoolDate(selectedDate)}</strong>?
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", background: "var(--input-bg)", padding: "0.75rem", borderRadius: "8px", maxHeight: "160px", overflowY: "auto", marginBottom: "1.25rem" }}>
              {teacherPeriods.filter(p => selectedPeriodIds.includes(p.timetableEntryId)).map(p => (
                <div key={p.timetableEntryId} style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  • Period {p.period} ({p.startTime} - {p.endTime}): {p.subjectName} ({p.className})
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                style={{ padding: "0.55rem 1rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "transparent", color: "inherit", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAssign}
                disabled={isPending}
                style={{ padding: "0.55rem 1.25rem", borderRadius: "8px", border: "none", background: "var(--primary)", color: "var(--primary-fg)", fontWeight: 700, cursor: "pointer" }}
              >
                {isPending ? "Assigning..." : "Confirm & Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP A: MARK TEACHER ABSENT DIALOG */}
      {showMarkModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1px solid var(--border-color)", width: "100%", maxWidth: "500px", maxHeight: "90vh", overflowY: "auto", padding: "1.5rem", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <UserX size={20} style={{ color: "var(--danger)" }} /> Mark Teacher Absent
              </h3>
              <button onClick={() => setShowMarkModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><X size={18} /></button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Teacher Selector with Search */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Absent Teacher *
                </label>
                <select
                  value={modalTeacherId}
                  onChange={(e) => setModalTeacherId(e.target.value)}
                  style={{ width: "100%", padding: "0.65rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontWeight: 600, fontSize: "0.9rem" }}
                >
                  <option value="">-- Choose Absent Teacher --</option>
                  {allTeachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.subjects.join(", ") || "Faculty"})
                    </option>
                  ))}
                </select>
              </div>

              {/* Absence Date */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Absence Date: <span style={{ color: "var(--primary)" }}>{formatSchoolDate(modalDate)}</span>
                </label>
                <input
                  type="date"
                  value={modalDate}
                  onChange={(e) => setModalDate(e.target.value)}
                  style={{ width: "100%", padding: "0.65rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.9rem" }}
                />
              </div>

              {/* Reason */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Reason for Absence
                </label>
                <select
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  style={{ width: "100%", padding: "0.65rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.9rem" }}
                >
                  <option value="Medical Leave">Medical Leave / Sick Leave</option>
                  <option value="Personal Emergency">Personal Emergency</option>
                  <option value="Official Duty / Training">Official Duty / Training</option>
                  <option value="Casual Leave">Casual Leave</option>
                  <option value="Bereavement">Bereavement Leave</option>
                </select>
              </div>

              {/* Full Day Checkbox */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <input
                  type="checkbox"
                  id="modalFullDayCb"
                  checked={modalFullDay}
                  onChange={(e) => setModalFullDay(e.target.checked)}
                  style={{ width: "16px", height: "16px" }}
                />
                <label htmlFor="modalFullDayCb" style={{ fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}>
                  Full day absence (all scheduled periods on this day)
                </label>
              </div>

              {/* If Full Day is Unchecked: Show Teacher's Periods as Checkboxes */}
              {!modalFullDay && (
                <div style={{ background: "var(--input-bg)", padding: "0.85rem", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                    Select Affected Periods for this date:
                  </label>
                  {loadingModalPeriods ? (
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Loading scheduled periods...</div>
                  ) : modalPeriodsAvailable.length === 0 ? (
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      {modalTeacherId ? "No classes scheduled for this teacher on this day." : "Select a teacher first."}
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {modalPeriodsAvailable.map(p => {
                        const isChecked = modalSelectedPeriods.includes(p);
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              setModalSelectedPeriods(prev =>
                                prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
                              );
                            }}
                            style={{
                              padding: "0.4rem 0.75rem",
                              borderRadius: "6px",
                              border: isChecked ? "1px solid var(--primary)" : "1px solid var(--border-color)",
                              background: isChecked ? "var(--primary)" : "var(--card-bg)",
                              color: isChecked ? "var(--primary-fg)" : "inherit",
                              cursor: "pointer",
                              fontSize: "0.82rem",
                              fontWeight: 700
                            }}
                          >
                            Period {p}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setShowMarkModal(false)}
                  style={{ padding: "0.65rem 1rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "transparent", color: "inherit", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAbsence}
                  disabled={isPending || !modalTeacherId}
                  style={{
                    padding: "0.65rem 1.25rem",
                    borderRadius: "8px",
                    border: "none",
                    background: "var(--danger)",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.45rem"
                  }}
                >
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : <UserX size={16} />}
                  Mark Absent &amp; Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
