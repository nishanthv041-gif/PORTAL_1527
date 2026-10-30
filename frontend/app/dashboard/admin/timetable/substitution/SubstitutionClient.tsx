"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  UserX,
  UserCheck,
  Clock,
  Sparkles,
  AlertCircle,
  CheckCircle,
  Plus,
  RefreshCw,
  X,
  Loader2,
  FileSpreadsheet,
  MapPin,
  ChevronRight,
  ShieldAlert
} from "lucide-react";
import {
  markTeacherAbsenceAction,
  assignSubstituteAction,
  cancelAbsenceAction,
  autoAssignAllSubstitutionsAction,
  getCandidatesForSubstitutionAction,
  getSubstitutionDataForDateAction,
  type CandidateSubstitute,
  type SubstitutionDataResult
} from "@/backend/api/actions/dashboard/admin/substitution/substitutionActions";

interface TeacherItem {
  id: string;
  name: string;
  email?: string;
  subjects: string[];
}

interface SubstitutionClientProps {
  initialDate: string;
  initialData: SubstitutionDataResult;
  allTeachers: TeacherItem[];
}

export default function SubstitutionClient({
  initialDate,
  initialData,
  allTeachers
}: SubstitutionClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [data, setData] = useState<SubstitutionDataResult>(initialData);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Mark Absence modal state
  const [showMarkModal, setShowMarkModal] = useState(false);
  const [absentTeacherId, setAbsentTeacherId] = useState("");
  const [absenceReason, setAbsenceReason] = useState("Medical Leave");
  const [isFullDay, setIsFullDay] = useState(true);
  const [selectedPeriods, setSelectedPeriods] = useState<number[]>([]);

  // Candidate drawer state for a substitution
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [candidateList, setCandidateList] = useState<CandidateSubstitute[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);

  // Sync date changes
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
  };

  // Open candidate selection for a specific slot
  const handleOpenCandidates = async (slotId: string) => {
    setActiveSlotId(slotId);
    setLoadingCandidates(true);
    setCandidateError(null);
    try {
      const targetSub = data.substitutions.find(s => s.id === slotId);
      if (!targetSub) return;

      // Find original timetable slot id or pass targetSub.id
      // getCandidatesForSubstitutionAction accepts timetableEntryId, let's call action
      // We can pass targetSub.id because we know the substitution record
      const res = await getCandidatesForSubstitutionAction(targetSub.id, selectedDate);
      if (res.success) {
        setCandidateList(res.candidates);
      } else {
        setCandidateError(res.error || "Failed to load candidates");
      }
    } catch (err: any) {
      setCandidateError(err.message || "Failed to fetch candidates");
    } finally {
      setLoadingCandidates(false);
    }
  };

  // Mark absence handler
  const handleMarkAbsence = () => {
    if (!absentTeacherId) {
      setErrorMsg("Please select a teacher to mark absent.");
      return;
    }
    setErrorMsg(null);
    startTransition(async () => {
      const res = await markTeacherAbsenceAction({
        teacherId: absentTeacherId,
        dateStr: selectedDate,
        fullDay: isFullDay,
        periodNumbers: isFullDay ? undefined : selectedPeriods,
        reason: absenceReason
      });

      if (!res.success) {
        setErrorMsg(res.error || "Failed to mark absence");
      } else {
        setSuccessMsg(`Teacher marked absent. Generated ${res.createdCount} substitution requirement(s).`);
        setShowMarkModal(false);
        setAbsentTeacherId("");
        await refreshData();
      }
    });
  };

  // Assign substitute handler
  const handleAssignCandidate = (subId: string, candTeacherId: string, note?: string) => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await assignSubstituteAction({
        substitutionId: subId,
        substituteTeacherId: candTeacherId,
        note
      });

      if (!res.success) {
        setErrorMsg(res.error || "Failed to assign substitute.");
      } else {
        setSuccessMsg("Substitute assigned successfully!");
        setActiveSlotId(null);
        await refreshData();
      }
    });
  };

  // Auto assign all handler
  const handleAutoAssignAll = () => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await autoAssignAllSubstitutionsAction(selectedDate);
      if (!res.success) {
        setErrorMsg(res.error || "Auto-assign failed.");
      } else {
        setSuccessMsg(`Smart Scheduler auto-assigned ${res.count} substitution(s)!`);
        await refreshData();
      }
    });
  };

  // Cancel absence handler
  const handleCancelAbsence = (absenceId: string) => {
    if (!confirm("Are you sure you want to cancel this teacher absence? All associated substitutions will be reverted to the regular timetable.")) {
      return;
    }
    startTransition(async () => {
      const res = await cancelAbsenceAction(absenceId);
      if (!res.success) {
        setErrorMsg(res.error || "Failed to cancel absence");
      } else {
        setSuccessMsg("Absence cancelled. Timetable slots reverted.");
        await refreshData();
      }
    });
  };

  const absences = data.absences || [];
  const substitutions = data.substitutions || [];
  const unassignedCount = substitutions.filter(s => s.status !== "ASSIGNED" || !s.substituteTeacherId).length;
  const assignedCount = substitutions.filter(s => s.status === "ASSIGNED" && s.substituteTeacherId).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
      {/* Alert / Notification banners */}
      {errorMsg && (
        <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "0.875rem 1.25rem", borderRadius: "8px", border: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertCircle size={18} />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><X size={16} /></button>
        </div>
      )}

      {successMsg && (
        <div style={{ background: "rgba(16, 185, 129, 0.1)", color: "#10b981", padding: "0.875rem 1.25rem", borderRadius: "8px", border: "1px solid rgba(16, 185, 129, 0.25)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <CheckCircle size={18} />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><X size={16} /></button>
        </div>
      )}

      {/* Top Controls: Date Selection & Action Buttons */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "1rem", background: "var(--card-bg)", padding: "1.25rem", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <label style={{ fontSize: "0.875rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <CalendarIcon size={16} /> Select Date:
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            disabled={isPending}
            style={{ padding: "0.6rem 0.85rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit" }}
          />
          <button
            type="button"
            onClick={refreshData}
            disabled={isPending}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.6rem 0.85rem", background: "transparent", border: "1px solid var(--border-color)", borderRadius: "8px", cursor: "pointer", color: "inherit", fontSize: "0.85rem" }}
          >
            <RefreshCw size={14} className={isPending ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setShowMarkModal(true)}
            disabled={isPending}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.65rem 1.15rem", background: "var(--danger)", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "0.875rem" }}
          >
            <UserX size={16} /> Mark Teacher Absent
          </button>

          {unassignedCount > 0 && (
            <button
              type="button"
              onClick={handleAutoAssignAll}
              disabled={isPending}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.65rem 1.15rem", background: "var(--primary)", color: "var(--primary-fg)", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "0.875rem" }}
            >
              <Sparkles size={16} /> Auto-Assign All ({unassignedCount})
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
        <div style={{ background: "var(--card-bg)", padding: "1.25rem", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 }}>Absent Teachers</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.25rem", color: absences.length > 0 ? "var(--danger)" : "var(--text-primary)" }}>
            {absences.length}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            {absences.length === 0 ? "All faculty available" : "Requires duty coverage"}
          </div>
        </div>

        <div style={{ background: "var(--card-bg)", padding: "1.25rem", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 }}>Affected Periods</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.25rem" }}>
            {substitutions.length}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Class sessions needing coverage
          </div>
        </div>

        <div style={{ background: "var(--card-bg)", padding: "1.25rem", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 }}>Pending Assignment</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.25rem", color: unassignedCount > 0 ? "#f59e0b" : "var(--success)" }}>
            {unassignedCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: unassignedCount > 0 ? "#f59e0b" : "var(--text-secondary)", marginTop: "0.25rem" }}>
            {unassignedCount > 0 ? "Action required" : "All slots covered!"}
          </div>
        </div>

        <div style={{ background: "var(--card-bg)", padding: "1.25rem", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 }}>Substitutions Assigned</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.25rem", color: "var(--success)" }}>
            {assignedCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Active duty assignments
          </div>
        </div>
      </div>

      {/* Absent Teachers List */}
      {absences.length > 0 && (
        <div style={{ background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--border-color)", padding: "1.25rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <UserX size={18} style={{ color: "var(--danger)" }} />
            Absent Teachers on {selectedDate}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {absences.map(abs => (
              <div
                key={abs.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  padding: "0.85rem 1rem",
                  borderRadius: "8px",
                  background: "rgba(239, 68, 68, 0.05)",
                  border: "1px solid rgba(239, 68, 68, 0.2)"
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{abs.teacherName}</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                    Reason: <span style={{ color: "var(--text-primary)" }}>{abs.reason || "Not specified"}</span>
                    {" • "}
                    Duration: <span style={{ fontWeight: 500 }}>{abs.fullDay ? "Full Day" : `Periods: ${abs.periodNumbers || "Partial"}`}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCancelAbsence(abs.id)}
                  disabled={isPending}
                  style={{
                    padding: "0.4rem 0.85rem",
                    background: "transparent",
                    color: "var(--danger)",
                    border: "1px solid var(--danger)",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                    fontWeight: 600
                  }}
                >
                  Cancel Absence (Revert Slots)
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Substitution Grid / Cards */}
      <div style={{ background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--border-color)", overflow: "hidden" }}>
        <div style={{ padding: "1.25rem", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>Affected Periods & Substitutions</h3>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
              Every assigned substitute immediately receives schedule updates on their dashboard and parent portal.
            </p>
          </div>
        </div>

        {substitutions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 1rem", color: "var(--text-secondary)" }}>
            <CheckCircle size={48} style={{ opacity: 0.3, margin: "0 auto 1rem", color: "var(--success)" }} />
            <p style={{ fontWeight: 600, fontSize: "1.1rem", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
              No substitutions needed for this date
            </p>
            <p style={{ fontSize: "0.875rem" }}>
              All teachers are scheduled normally or no teachers have been marked absent.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {substitutions.map(sub => {
              const isAssigned = sub.status === "ASSIGNED" && sub.substituteTeacherId;

              return (
                <div
                  key={sub.id}
                  style={{
                    padding: "1.25rem",
                    borderBottom: "1px solid var(--border-color)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                    background: isAssigned ? "transparent" : "rgba(245, 158, 11, 0.03)"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "10px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "1rem",
                          background: isAssigned ? "rgba(16, 185, 129, 0.12)" : "rgba(245, 158, 11, 0.15)",
                          color: isAssigned ? "var(--success)" : "#d97706"
                        }}
                      >
                        P{sub.period}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "1rem" }}>
                          {sub.subjectName} • <span style={{ color: "var(--primary)" }}>{sub.className}</span>
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.3rem", marginTop: "0.15rem" }}>
                          <Clock size={12} /> {sub.startTime} - {sub.endTime}
                          {" • "}
                          <span>Original: <strong style={{ color: "var(--text-primary)" }}>{sub.absentTeacherName}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      {isAssigned ? (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.35rem 0.75rem", borderRadius: "999px", background: "rgba(16, 185, 129, 0.12)", color: "var(--success)", fontSize: "0.8rem", fontWeight: 600 }}>
                          <UserCheck size={14} /> Assigned: {sub.substituteTeacherName}
                        </div>
                      ) : (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.35rem 0.75rem", borderRadius: "999px", background: "rgba(245, 158, 11, 0.15)", color: "#d97706", fontSize: "0.8rem", fontWeight: 600 }}>
                          <AlertCircle size={14} /> Unassigned
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => handleOpenCandidates(sub.id)}
                        disabled={isPending}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          padding: "0.45rem 0.85rem",
                          borderRadius: "6px",
                          border: "1px solid var(--border-color)",
                          background: "var(--card-bg)",
                          color: "inherit",
                          cursor: "pointer",
                          fontSize: "0.82rem",
                          fontWeight: 500
                        }}
                      >
                        {isAssigned ? "Change Substitute" : "Assign Substitute"} <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>

                  {sub.note && (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontStyle: "italic", paddingLeft: "3.5rem" }}>
                      Note: {sub.note}
                    </div>
                  )}

                  {/* Inline Candidate Selection Box if active */}
                  {activeSlotId === sub.id && (
                    <div style={{ marginTop: "0.5rem", padding: "1rem", borderRadius: "8px", background: "rgba(0,0,0,0.03)", border: "1px dashed var(--border-color)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                        <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                          Smart Candidate Recommendations for Period {sub.period} ({sub.subjectName}):
                        </span>
                        <button onClick={() => setActiveSlotId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                          <X size={16} />
                        </button>
                      </div>

                      {loadingCandidates ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem", padding: "1rem" }}>
                          <Loader2 size={16} className="animate-spin" /> Calculating free teachers and match scores...
                        </div>
                      ) : candidateError ? (
                        <div style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{candidateError}</div>
                      ) : candidateList.length === 0 ? (
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                          No free teachers found for this period. You can manually assign any teacher below.
                        </div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.75rem" }}>
                          {candidateList.slice(0, 6).map(cand => (
                            <div
                              key={cand.teacherId}
                              style={{
                                padding: "0.85rem",
                                borderRadius: "8px",
                                background: "var(--card-bg)",
                                border: "1px solid var(--border-color)",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "space-between",
                                gap: "0.5rem"
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{cand.teacherName}</div>
                                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                                    {cand.subjectsTaught.join(", ") || "General Faculty"}
                                  </div>
                                </div>
                                <span
                                  style={{
                                    fontSize: "0.7rem",
                                    fontWeight: 700,
                                    padding: "0.2rem 0.5rem",
                                    borderRadius: "4px",
                                    background:
                                      cand.matchBadge === "Best Match"
                                        ? "rgba(16, 185, 129, 0.15)"
                                        : cand.matchBadge === "Subject Specialist"
                                          ? "rgba(99, 102, 241, 0.15)"
                                          : "rgba(107, 114, 128, 0.15)",
                                    color:
                                      cand.matchBadge === "Best Match"
                                        ? "var(--success)"
                                        : cand.matchBadge === "Subject Specialist"
                                          ? "var(--primary)"
                                          : "var(--text-secondary)"
                                  }}
                                >
                                  {cand.matchBadge}
                                </span>
                              </div>

                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.25rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border-color)" }}>
                                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                                  Today: {cand.periodsToday} periods
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleAssignCandidate(sub.id, cand.teacherId, `Covering for ${sub.absentTeacherName}`)}
                                  disabled={isPending}
                                  style={{
                                    padding: "0.35rem 0.75rem",
                                    background: "var(--primary)",
                                    color: "var(--primary-fg)",
                                    border: "none",
                                    borderRadius: "5px",
                                    cursor: "pointer",
                                    fontSize: "0.78rem",
                                    fontWeight: 600
                                  }}
                                >
                                  Assign
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Manual Teacher Fallback Selector */}
                      <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-color)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Or choose manually:</span>
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAssignCandidate(sub.id, e.target.value, `Covering for ${sub.absentTeacherName}`);
                            }
                          }}
                          defaultValue=""
                          style={{ padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.8rem" }}
                        >
                          <option value="">-- Select Any Teacher --</option>
                          {allTeachers.filter(t => t.id !== sub.absentTeacherId).map(t => (
                            <option key={t.id} value={t.id}>{t.name} ({t.subjects.join(", ") || "Teacher"})</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mark Teacher Absent Dialog */}
      {showMarkModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--border-color)", width: "100%", maxWidth: "500px", padding: "1.5rem", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <UserX size={20} style={{ color: "var(--danger)" }} /> Mark Teacher Absent
              </h3>
              <button onClick={() => setShowMarkModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>Select Absent Teacher *</label>
                <select
                  value={absentTeacherId}
                  onChange={(e) => setAbsentTeacherId(e.target.value)}
                  style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.9rem" }}
                >
                  <option value="">-- Choose Teacher --</option>
                  {allTeachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.subjects.join(", ") || "Faculty"})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>Absence Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.9rem" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>Reason for Absence</label>
                <select
                  value={absenceReason}
                  onChange={(e) => setAbsenceReason(e.target.value)}
                  style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.9rem" }}
                >
                  <option value="Medical Leave">Medical Leave / Sick Leave</option>
                  <option value="Personal Emergency">Personal Emergency</option>
                  <option value="Official Duty / Training">Official Duty / Training</option>
                  <option value="Casual Leave">Casual Leave</option>
                  <option value="Bereavement">Bereavement Leave</option>
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  id="fullDayCb"
                  checked={isFullDay}
                  onChange={(e) => setIsFullDay(e.target.checked)}
                />
                <label htmlFor="fullDayCb" style={{ fontSize: "0.875rem", cursor: "pointer", fontWeight: 500 }}>
                  Full day absence (All periods on this date)
                </label>
              </div>

              {!isFullDay && (
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>Select Affected Periods:</label>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(p => {
                      const isSel = selectedPeriods.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => {
                            if (isSel) setSelectedPeriods(prev => prev.filter(x => x !== p));
                            else setSelectedPeriods(prev => [...prev, p]);
                          }}
                          style={{
                            padding: "0.4rem 0.75rem",
                            borderRadius: "6px",
                            border: "1px solid var(--border-color)",
                            background: isSel ? "var(--primary)" : "var(--card-bg)",
                            color: isSel ? "var(--primary-fg)" : "inherit",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                            fontWeight: 600
                          }}
                        >
                          P{p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "1rem" }}>
                <button
                  type="button"
                  onClick={() => setShowMarkModal(false)}
                  disabled={isPending}
                  style={{ padding: "0.65rem 1.15rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "transparent", color: "inherit", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleMarkAbsence}
                  disabled={isPending || !absentTeacherId}
                  style={{
                    padding: "0.65rem 1.25rem",
                    borderRadius: "8px",
                    border: "none",
                    background: "var(--danger)",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem"
                  }}
                >
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : <UserX size={16} />}
                  Mark Absent & Compute Duties
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
