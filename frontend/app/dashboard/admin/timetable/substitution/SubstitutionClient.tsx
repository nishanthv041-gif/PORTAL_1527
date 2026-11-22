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
  Square,
  ArrowLeftRight,
  Sparkles
} from "lucide-react";
import {
  markTeacherAbsenceAction,
  getAbsentTeacherPeriodsAction,
  getFreeTeachersForPeriodsAction,
  assignSubstitutesBatchAction,
  undoSubstitutionAssignmentAction,
  cancelAbsenceAction,
  getSubstitutionDataForDateAction,
  getStaffShiftPeriodsWithFreeTeachersAction,
  saveStaffShiftBatchAction,
  type FreeTeacherItem,
  type AbsentPeriodSlot,
  type StaffShiftPeriodSlot
} from "@/backend/api/actions/dashboard/admin/substitution/substitutionActions";
import { formatSchoolDate } from "@/backend/lib/timetable/getEffectiveTimetable";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";

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
  const confirm = useConfirm();

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

  // Staff Shift Changing Modal State
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftTeacherId, setShiftTeacherId] = useState("");
  const [shiftDate, setShiftDate] = useState(selectedDate);
  const [shiftReason, setShiftReason] = useState("Official Duty / Training");
  const [shiftCustomReason, setShiftCustomReason] = useState("");
  const [shiftPeriods, setShiftPeriods] = useState<StaffShiftPeriodSlot[]>([]);
  const [loadingShiftPeriods, setLoadingShiftPeriods] = useState(false);
  const [periodShiftSelections, setPeriodShiftSelections] = useState<Record<string, string>>({});

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

  // Load staff assigned classes and their period-free substitute teachers
  useEffect(() => {
    if (!shiftTeacherId) {
      setShiftPeriods([]);
      setPeriodShiftSelections({});
      return;
    }
    let isCancelled = false;
    setLoadingShiftPeriods(true);
    getStaffShiftPeriodsWithFreeTeachersAction({
      teacherId: shiftTeacherId,
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
  }, [shiftTeacherId, shiftDate]);

  // Submit Staff Shift
  const handleSaveStaffShifts = async () => {
    if (!shiftTeacherId) {
      setErrorMessage("Please select a staff member to shift.");
      return;
    }

    const finalReason = shiftReason === "Other" && shiftCustomReason.trim()
      ? shiftCustomReason.trim()
      : shiftReason;

    // Build shift payload from periodShiftSelections
    const shiftPayload = Object.entries(periodShiftSelections)
      .filter(([_, subVal]) => Boolean(subVal))
      .map(([slotId, subVal]) => ({
        timetableEntryId: slotId,
        substituteTeacherId: subVal === "FREE" ? null : subVal,
        isFreePeriod: subVal === "FREE",
        note: `Staff Shift: ${finalReason}`
      }));

    if (shiftPayload.length === 0) {
      setErrorMessage("Please select at least one substitute staff or Free Period to reassign.");
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      const res = await saveStaffShiftBatchAction({
        teacherId: shiftTeacherId,
        dateStr: shiftDate,
        reason: finalReason,
        shifts: shiftPayload
      });

      if (!res.success) {
        setErrorMessage(res.error || "Failed to save staff shifts.");
      } else {
        setShowShiftModal(false);
        setActiveTeacherId(shiftTeacherId);
        setSelectedDate(shiftDate);
        setToastMessage(`Staff shifts saved successfully for ${shiftPayload.length} period(s)! Timetables updated across portals.`);
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
    const ok = await confirm({
      title: "Cancel Teacher Absence?",
      message: "Are you sure you want to cancel this teacher absence? All associated substitutions will be reverted to the normal schedule.",
      confirmText: "Cancel Absence",
      cancelText: "Keep Absence",
      variant: "danger"
    });
    if (!ok) return;

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
            setShiftDate(selectedDate);
            setShiftTeacherId(activeTeacherId || "");
            setShiftReason("Official Duty / Training");
            setShiftCustomReason("");
            setErrorMessage(null);
            setShowShiftModal(true);
          }}
          disabled={isPending}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.65rem 1.25rem",
            borderRadius: "8px",
            background: "linear-gradient(135deg, #2563eb, #3b82f6)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: "0.875rem",
            boxShadow: "0 2px 8px rgba(37, 99, 235, 0.25)"
          }}
        >
          <ArrowLeftRight size={16} /> Staff Shift Changing
        </button>
      </div>

      {/* MAIN TWO-COLUMN WORKFLOW AREA (Periods on Left, Free Teachers on Right) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: "1.5rem", alignItems: "start" }}>

        {/* LEFT COLUMN: Absent Teacher's Periods Checklist */}
        <div style={{ background: "var(--card-bg)", borderRadius: "14px", border: "1px solid var(--border-color)", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Header & Absent Teacher Selector */}
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "0.35rem" }}>
              Viewing Staff Member / Shifts:
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

      {/* STAFF SHIFT CHANGING DIALOG */}
      {showShiftModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "var(--card-bg)", borderRadius: "16px", border: "1px solid var(--border-color)", width: "100%", maxWidth: "620px", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.4)", overflow: "hidden" }}>

            {/* Modal Header */}
            <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div style={{ padding: "0.45rem", borderRadius: "8px", background: "rgba(99, 102, 241, 0.12)", color: "var(--primary)" }}>
                  <ArrowLeftRight size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Staff Shift Changing</h3>
                  <p style={{ margin: "0.15rem 0 0 0", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                    Reassign teaching classes to available period-free faculty
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

              {/* Staff Selector */}
              <div>
                <label style={{ display: "block", fontSize: "0.825rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                  Select Staff Member to Shift *
                </label>
                <select
                  value={shiftTeacherId}
                  onChange={(e) => setShiftTeacherId(e.target.value)}
                  style={{ width: "100%", padding: "0.65rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontWeight: 700, fontSize: "0.9rem" }}
                >
                  <option value="">-- Choose Staff Member --</option>
                  {allTeachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.subjects.length > 0 ? `(${t.subjects.join(", ")})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date & Shift Reason Row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.825rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                    Shift Date:
                  </label>
                  <input
                    type="date"
                    value={shiftDate}
                    onChange={(e) => setShiftDate(e.target.value)}
                    style={{ width: "100%", padding: "0.55rem 0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.85rem", fontWeight: 600 }}
                  />
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
                    <option value="Departmental Reassignment">Departmental Reassignment</option>
                    <option value="Casual Leave">Casual Leave</option>
                    <option value="Other">Other Reason (Specify below)</option>
                  </select>
                </div>
              </div>

              {shiftReason === "Other" && (
                <div>
                  <input
                    type="text"
                    placeholder="Enter custom staff shift reason..."
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
                    Assigned Classes &amp; Shift Options:
                  </label>
                  {shiftPeriods.length > 0 && (
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {shiftPeriods.length} scheduled class{shiftPeriods.length === 1 ? "" : "es"}
                    </span>
                  )}
                </div>

                {!shiftTeacherId ? (
                  <div style={{ padding: "2rem", textAlign: "center", border: "1px dashed var(--border-color)", borderRadius: "10px", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                    <ArrowLeftRight size={28} style={{ opacity: 0.3, margin: "0 auto 0.5rem" }} />
                    <p style={{ margin: 0 }}>Select a staff member above to view their scheduled classes for this date.</p>
                  </div>
                ) : loadingShiftPeriods ? (
                  <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                    <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto 0.5rem", color: "var(--primary)" }} />
                    Loading assigned classes and period-free teachers...
                  </div>
                ) : shiftPeriods.length === 0 ? (
                  <div style={{ padding: "2rem", textAlign: "center", border: "1px dashed var(--border-color)", borderRadius: "10px", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                    <CheckCircle size={28} style={{ opacity: 0.4, margin: "0 auto 0.5rem", color: "#10b981" }} />
                    <p style={{ margin: 0, fontWeight: 600, color: "var(--text-primary)" }}>No classes scheduled</p>
                    <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8rem" }}>This staff member has no teaching periods on this day of the week.</p>
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
                                Shift To Staff (Timing: {p.startTime} - {p.endTime}):
                              </label>
                              <span style={{ fontSize: "0.72rem", color: hasFreeTeachers ? "#10b981" : "var(--danger)", fontWeight: 700 }}>
                                {hasFreeTeachers ? `✓ ${p.freeTeachers.length} Staff Free in Period ${p.period}` : "⚠️ No Staff Free in this Period"}
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
                              <option value="">-- Keep Original Staff (No Shift) --</option>
                              <option value="FREE">-- Mark as Free / Study Period (No Teacher) --</option>
                              {hasFreeTeachers && (
                                <optgroup label={`Free Staff in Period ${p.period} (${p.freeTeachers.length} Available)`}>
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
                {Object.values(periodShiftSelections).filter(Boolean).length} period(s) marked for shift
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
                  disabled={isPending || !shiftTeacherId || Object.values(periodShiftSelections).filter(Boolean).length === 0}
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
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
                  Confirm &amp; Save Staff Shifts
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
