"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  Clock,
  Edit,
  Save,
  Trash2,
  X,
  MapPin,
  Coffee,
  Loader2,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  Settings,
  User,
  Users,
  Grid,
  List,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  HelpCircle,
  RotateCcw
} from "lucide-react";
import {
  createTimetableSlotAction,
  deleteTimetableSlotAction,
  bulkCreateTimetableSlotsAction,
  publishTimetableAction,
  suggestFillTimetableAction,
  clearClassTimetableAction
} from "@/backend/api/actions/dashboard/admin/timetable/actions";
import {
  savePeriodSlotsAction,
  quickGenerateSlotsAction
} from "@/backend/api/actions/dashboard/admin/timetable/periodSlotActions";
import {
  calculateSubjectSummaries,
  calculateTeacherLoads,
  SCHOOL_WORKING_DAYS
} from "@/backend/lib/timetable/timetableCalculations";
import { analyzeTimetableConflicts } from "@/backend/lib/timetable/timetableConflictEngine";
import type {
  PeriodSlotData,
  TimetableSlotEntry,
  PeriodType
} from "@/backend/lib/timetable/timetableTypes";
import TimetableScanModal from "./TimetableScanModal";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const SHORT_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

const SUBJECT_COLOR_PALETTE = [
  { bg: "rgba(59, 130, 246, 0.12)", border: "rgba(59, 130, 246, 0.3)", text: "#3b82f6" },
  { bg: "rgba(16, 185, 129, 0.12)", border: "rgba(16, 185, 129, 0.3)", text: "#10b981" },
  { bg: "rgba(168, 85, 247, 0.12)", border: "rgba(168, 85, 247, 0.3)", text: "#a855f7" },
  { bg: "rgba(249, 115, 22, 0.12)", border: "rgba(249, 115, 22, 0.3)", text: "#f97316" },
  { bg: "rgba(236, 72, 153, 0.12)", border: "rgba(236, 72, 153, 0.3)", text: "#ec4899" },
  { bg: "rgba(14, 165, 233, 0.12)", border: "rgba(14, 165, 233, 0.3)", text: "#0ea5e9" },
  { bg: "rgba(234, 179, 8, 0.12)", border: "rgba(234, 179, 8, 0.3)", text: "#eab308" }
];

export interface TimetableClientProps {
  classes: Array<{ id: string; name: string; section: string }>;
  initialClassId: string;
  timetableData: any[];
  allSchoolSlots: any[];
  availableSubjects: Array<{
    id: string;
    name: string;
    code: string;
    requiredPeriodsPerWeek?: number | null;
    teacherId?: string | null;
    teacher?: { id: string; user?: { name: string } | null } | null;
  }>;
  allTeachers: Array<{
    id: string;
    name: string;
    email?: string;
    maxPeriodsPerDay: number;
    maxPeriodsPerWeek: number;
    subjects: string[];
  }>;
  periodSlots: PeriodSlotData[];
  pendingSubstitutionsCount: number;
  events: any[];
  weekOf: string;
}

export default function TimetableClient({
  classes,
  initialClassId,
  timetableData,
  allSchoolSlots,
  availableSubjects,
  allTeachers,
  periodSlots: initialPeriodSlots,
  pendingSubstitutionsCount,
  events,
  weekOf
}: TimetableClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedClass, setSelectedClass] = useState(initialClassId);
  const [selectedWeek, setSelectedWeek] = useState(weekOf);
  const [viewMode, setViewMode] = useState<"CLASS" | "TEACHER">("CLASS");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(allTeachers[0]?.id || "");
  const [activeTab, setActiveTab] = useState<"TIMETABLE" | "SUMMARY" | "CONFLICTS">("TIMETABLE");

  // Mobile layout state
  const [activeMobileDay, setActiveMobileDay] = useState<string>(() => {
    const todayIndex = new Date().getDay(); // 0 is Sun, 1 is Mon
    if (todayIndex >= 1 && todayIndex <= 6) {
      return DAYS[todayIndex - 1];
    }
    return "MONDAY";
  });
  const [mobileViewType, setMobileViewType] = useState<"DAY" | "WEEK">("DAY");

  // Period slots management
  const [periodSlots, setPeriodSlots] = useState<PeriodSlotData[]>(initialPeriodSlots);
  const [showPeriodConfigModal, setShowPeriodConfigModal] = useState(false);
  const [editingPeriodSlots, setEditingPeriodSlots] = useState<PeriodSlotData[]>(initialPeriodSlots);

  // Quick generator wizard state
  const [quickGenStartTime, setQuickGenStartTime] = useState("08:00");
  const [quickGenDuration, setQuickGenDuration] = useState(45);
  const [quickGenTotal, setQuickGenTotal] = useState(8);
  const [quickGenBreakPeriod, setQuickGenBreakPeriod] = useState(2);
  const [quickGenBreakDuration, setQuickGenBreakDuration] = useState(15);
  const [quickGenLunchPeriod, setQuickGenLunchPeriod] = useState(5);
  const [quickGenLunchDuration, setQuickGenLunchDuration] = useState(45);

  // Slot editing
  const [editingSlot, setEditingSlot] = useState<{ day: string; period: number } | null>(null);
  const [editData, setEditData] = useState({
    subjectId: "",
    teacherId: "",
    startTime: "",
    endTime: "",
    classroom: "",
    isBreak: false,
    slotType: "LESSON" as PeriodType
  });

  // Modal & Messages
  const [showScanModal, setShowScanModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [suggestPreview, setSuggestPreview] = useState<any[] | null>(null);

  const selectedClassObj = classes.find(c => c.id === selectedClass);
  const selectedClassName = selectedClassObj ? `${selectedClassObj.name} - ${selectedClassObj.section}` : "";

  // Assign consistent colors to subjects
  const subjectColorMap = useMemo(() => {
    const map = new Map<string, typeof SUBJECT_COLOR_PALETTE[0]>();
    availableSubjects.forEach((sub, idx) => {
      map.set(sub.id, SUBJECT_COLOR_PALETTE[idx % SUBJECT_COLOR_PALETTE.length]);
    });
    return map;
  }, [availableSubjects]);

  // Map slots for calculation engine
  const mappedCurrentSlots: TimetableSlotEntry[] = useMemo(() => {
    return timetableData.map(s => ({
      id: s.id,
      classId: s.classId,
      dayOfWeek: s.dayOfWeek,
      period: s.period,
      subjectId: s.subjectId,
      subjectName: s.subject?.name,
      subjectCode: s.subject?.code,
      teacherId: s.teacherId || s.subject?.teacherId,
      teacherName: s.teacher?.user?.name || s.subject?.teacher?.user?.name,
      classroom: s.classroom,
      startTime: s.startTime,
      endTime: s.endTime,
      isBreak: s.isBreak,
      slotType: s.slotType as any,
      status: s.status as any
    }));
  }, [timetableData]);

  const mappedAllSchoolSlots: TimetableSlotEntry[] = useMemo(() => {
    return allSchoolSlots.map(s => ({
      id: s.id,
      classId: s.classId,
      dayOfWeek: s.dayOfWeek,
      period: s.period,
      subjectId: s.subjectId,
      subjectName: s.subject?.name,
      subjectCode: s.subject?.code,
      teacherId: s.teacherId || s.subject?.teacherId,
      teacherName: s.teacher?.user?.name || s.subject?.teacher?.user?.name,
      classroom: s.classroom,
      startTime: s.startTime,
      endTime: s.endTime,
      isBreak: s.isBreak,
      slotType: s.slotType as any,
      status: s.status as any
    }));
  }, [allSchoolSlots]);

  // Live calculations
  const teacherLoads = useMemo(() => {
    return calculateTeacherLoads({
      allSchoolSlots: mappedAllSchoolSlots,
      teachers: allTeachers.map(t => ({
        id: t.id,
        name: t.name,
        maxPeriodsPerDay: t.maxPeriodsPerDay,
        maxPeriodsPerWeek: t.maxPeriodsPerWeek
      }))
    });
  }, [mappedAllSchoolSlots, allTeachers]);

  const subjectSummaries = useMemo(() => {
    return calculateSubjectSummaries({
      classSubjects: availableSubjects.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        requiredPeriodsPerWeek: s.requiredPeriodsPerWeek || 5,
        teacherId: s.teacherId,
        teacherName: s.teacher?.user?.name
      })),
      classSlots: mappedCurrentSlots
    });
  }, [availableSubjects, mappedCurrentSlots]);

  const conflictAnalysis = useMemo(() => {
    return analyzeTimetableConflicts({
      targetClassId: selectedClass,
      allSchoolSlots: mappedAllSchoolSlots,
      periodSlots,
      teacherLoads,
      subjectSummaries
    });
  }, [selectedClass, mappedAllSchoolSlots, periodSlots, teacherLoads, subjectSummaries]);

  // Handle Class Switch
  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const classId = e.target.value;
    setSelectedClass(classId);
    setActionError(null);
    setActionSuccess(null);
    setSuggestPreview(null);
    startTransition(() => {
      router.push(`/dashboard/admin/timetable?classId=${classId}&weekOf=${selectedWeek}`);
    });
  };

  // Start slot editing
  const startEdit = (day: string, period: number, slotData?: any) => {
    setActionError(null);
    setActionSuccess(null);
    setEditingSlot({ day, period });

    const pSlot = periodSlots.find(p => p.order === period);
    const matchedSubject = availableSubjects.find(s => s.id === slotData?.subjectId);
    const assignedTeacherId = slotData?.teacherId || matchedSubject?.teacherId || "";

    setEditData({
      subjectId: slotData?.subjectId || "",
      teacherId: assignedTeacherId,
      startTime: slotData?.startTime || pSlot?.startTime || "08:00",
      endTime: slotData?.endTime || pSlot?.endTime || "08:45",
      classroom: slotData?.classroom || "",
      isBreak: slotData?.isBreak || pSlot?.type === "BREAK" || pSlot?.type === "LUNCH",
      slotType: slotData?.slotType || pSlot?.type || "LESSON"
    });
  };

  // Save slot
  const saveSlot = async (day: string, period: number) => {
    setActionError(null);
    const formData = new FormData();
    formData.set("classId", selectedClass);
    formData.set("dayOfWeek", day);
    formData.set("period", period.toString());
    formData.set("subjectId", editData.subjectId);
    formData.set("teacherId", editData.teacherId);
    formData.set("startTime", editData.startTime);
    formData.set("endTime", editData.endTime);
    formData.set("classroom", editData.classroom);
    formData.set("isBreak", editData.isBreak ? "true" : "false");
    formData.set("slotType", editData.slotType);

    startTransition(async () => {
      const res = await createTimetableSlotAction(formData);
      if (res.error) {
        setActionError(res.error);
      } else {
        setEditingSlot(null);
        router.refresh();
      }
    });
  };

  // Delete slot
  const deleteSlot = async (id: string) => {
    if (confirm("Are you sure you want to remove this slot?")) {
      startTransition(async () => {
        const res = await deleteTimetableSlotAction(id);
        if (res.error) setActionError(res.error);
        else router.refresh();
      });
    }
  };

  // Publish timetable
  const handlePublish = async () => {
    setActionError(null);
    setActionSuccess(null);
    startTransition(async () => {
      const res = await publishTimetableAction(selectedClass);
      if (!res.success) {
        setActionError(res.error || "Failed to publish timetable.");
      } else {
        setActionSuccess(`Timetable successfully published with ${res.count} slots!`);
        router.refresh();
      }
    });
  };

  // Suggest fill
  const handleSuggestFill = async () => {
    setActionError(null);
    setActionSuccess(null);
    startTransition(async () => {
      const res = await suggestFillTimetableAction(selectedClass);
      if (!res.success) {
        setActionError(res.message);
      } else {
        setSuggestPreview(res.suggestedSlots || []);
        setActionSuccess(res.message);
      }
    });
  };

  // Apply suggested fill
  const handleApplySuggestions = async () => {
    if (!suggestPreview || suggestPreview.length === 0) return;
    startTransition(async () => {
      const res = await bulkCreateTimetableSlotsAction(
        selectedClass,
        suggestPreview.map(s => ({
          dayOfWeek: s.dayOfWeek,
          period: s.period,
          subjectId: s.subjectId,
          teacherId: s.teacherId,
          startTime: s.startTime || "08:00",
          endTime: s.endTime || "08:45",
          classroom: s.classroom || "",
          isBreak: Boolean(s.isBreak),
          slotType: s.slotType || "LESSON"
        })),
        "PUBLISHED"
      );
      if (res.error) {
        setActionError(res.error);
      } else {
        setActionSuccess(`Applied ${suggestPreview.length} suggested timetable slots!`);
        setSuggestPreview(null);
        router.refresh();
      }
    });
  };

  // Clear timetable
  const handleClearTimetable = async () => {
    if (!confirm(`Are you sure you want to clear the entire timetable for ${selectedClassName}? This cannot be undone.`)) {
      return;
    }
    startTransition(async () => {
      const res = await clearClassTimetableAction(selectedClass);
      if (!res.success) {
        setActionError(res.error || "Failed to clear timetable.");
      } else {
        setActionSuccess(`Cleared all timetable slots.`);
        router.refresh();
      }
    });
  };

  // Quick generator handler
  const handleExecuteQuickGen = async () => {
    startTransition(async () => {
      const res = await quickGenerateSlotsAction({
        startTime: quickGenStartTime,
        lessonDurationMinutes: Number(quickGenDuration),
        totalPeriods: Number(quickGenTotal),
        breakAfterPeriod: Number(quickGenBreakPeriod),
        breakDurationMinutes: Number(quickGenBreakDuration),
        lunchAfterPeriod: Number(quickGenLunchPeriod),
        lunchDurationMinutes: Number(quickGenLunchDuration),
        classId: null
      });

      if (!res.success) {
        setActionError(res.error || "Failed to generate period slots.");
      } else if (res.slots) {
        setPeriodSlots(res.slots);
        setShowPeriodConfigModal(false);
        setActionSuccess("Period times updated school-wide and synchronized across all timetables!");
        router.refresh();
      }
    });
  };

  // Save customized period slots
  const handleSavePeriodSlots = async () => {
    startTransition(async () => {
      const res = await savePeriodSlotsAction(editingPeriodSlots, null);
      if (!res.success) {
        setActionError(res.error || "Failed to save period slots.");
      } else if (res.slots) {
        setPeriodSlots(res.slots);
        setShowPeriodConfigModal(false);
        setActionSuccess("Period slot times saved successfully!");
        router.refresh();
      }
    });
  };

  // Teacher Schedule View data filter
  const teacherTimetableSlots = useMemo(() => {
    if (viewMode !== "TEACHER" || !selectedTeacherId) return [];
    return mappedAllSchoolSlots.filter(s => s.teacherId === selectedTeacherId);
  }, [viewMode, selectedTeacherId, mappedAllSchoolSlots]);

  // Sorted period slots
  const sortedPeriods = useMemo(() => {
    return [...periodSlots].sort((a, b) => a.order - b.order);
  }, [periodSlots]);

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      {/* Top Transition indicator */}
      {isPending && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "3px", background: "var(--primary)", zIndex: 9999, animation: "pulse 1.5s infinite" }} />
      )}

      {/* Header Banner & Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            Timetable Management
          </h1>
          <p style={{ color: "var(--text-secondary)", margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
            Automated conflict-free scheduling, staff workloads, and parent synchronization.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {/* Absence & Substitution Duty link button */}
          <Link
            href="/dashboard/admin/timetable/substitution"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.6rem 1rem",
              borderRadius: "8px",
              background: pendingSubstitutionsCount > 0 ? "rgba(239, 68, 68, 0.12)" : "var(--card-bg)",
              color: pendingSubstitutionsCount > 0 ? "var(--danger)" : "var(--text-primary)",
              border: `1px solid ${pendingSubstitutionsCount > 0 ? "rgba(239, 68, 68, 0.3)" : "var(--border-color)"}`,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: "0.85rem"
            }}
          >
            <ShieldAlert size={16} />
            <span>Absence & Substitution</span>
            {pendingSubstitutionsCount > 0 && (
              <span style={{ background: "var(--danger)", color: "#fff", padding: "0.15rem 0.5rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700 }}>
                {pendingSubstitutionsCount} Pending
              </span>
            )}
          </Link>

          {/* Period Times Config Button */}
          <button
            type="button"
            onClick={() => {
              setEditingPeriodSlots(periodSlots);
              setShowPeriodConfigModal(true);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.6rem 0.95rem",
              borderRadius: "8px",
              background: "var(--card-bg)",
              border: "1px solid var(--border-color)",
              color: "inherit",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 500
            }}
          >
            <Settings size={16} /> Period Times ({sortedPeriods.length})
          </button>

          {/* Upload & Scan Button */}
          <button
            type="button"
            onClick={() => setShowScanModal(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.6rem 1rem",
              borderRadius: "8px",
              background: "var(--primary)",
              color: "var(--primary-fg)",
              border: "none",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 600
            }}
          >
            <Sparkles size={16} /> Upload & Scan Timetable
          </button>
        </div>
      </div>

      {/* Action / Error Alerts */}
      {actionError && (
        <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "1rem 1.25rem", borderRadius: "10px", border: "1px solid var(--border-color)", marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <AlertCircle size={20} />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><X size={18} /></button>
        </div>
      )}

      {actionSuccess && (
        <div style={{ background: "rgba(16, 185, 129, 0.12)", color: "#10b981", padding: "1rem 1.25rem", borderRadius: "10px", border: "1px solid rgba(16, 185, 129, 0.25)", marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <CheckCircle size={20} />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><X size={18} /></button>
        </div>
      )}

      {/* Suggested Preview Banner */}
      {suggestPreview && suggestPreview.length > 0 && (
        <div style={{ background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.3)", borderRadius: "10px", padding: "1rem 1.25rem", marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <div style={{ fontWeight: 700, color: "var(--primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Sparkles size={18} /> Smart Constraint Solver Generated {suggestPreview.length} Suggested Slots
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
              All slots are verified against teacher clashes, break periods, and subject requirements.
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={() => setSuggestPreview(null)}
              style={{ padding: "0.45rem 0.85rem", background: "transparent", border: "1px solid var(--border-color)", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem" }}
            >
              Dismiss
            </button>
            <button
              onClick={handleApplySuggestions}
              disabled={isPending}
              style={{ padding: "0.45rem 1rem", background: "var(--primary)", color: "var(--primary-fg)", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem" }}
            >
              Apply All to Timetable
            </button>
          </div>
        </div>
      )}

      {/* Control Bar: Class Selector, View Switcher & Actions */}
      <div style={{ background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--border-color)", padding: "1.25rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", flex: "1 1 300px" }}>
            {/* View Mode Toggle */}
            <div style={{ display: "inline-flex", background: "var(--input-bg)", padding: "0.25rem", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
              <button
                type="button"
                onClick={() => setViewMode("CLASS")}
                style={{
                  padding: "0.45rem 0.85rem",
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  background: viewMode === "CLASS" ? "var(--primary)" : "transparent",
                  color: viewMode === "CLASS" ? "var(--primary-fg)" : "var(--text-secondary)"
                }}
              >
                Class View
              </button>
              <button
                type="button"
                onClick={() => setViewMode("TEACHER")}
                style={{
                  padding: "0.45rem 0.85rem",
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  background: viewMode === "TEACHER" ? "var(--primary)" : "transparent",
                  color: viewMode === "TEACHER" ? "var(--primary-fg)" : "var(--text-secondary)"
                }}
              >
                Teacher View
              </button>
            </div>

            {/* Class or Teacher Dropdown */}
            {viewMode === "CLASS" ? (
              <div style={{ minWidth: "220px" }}>
                <select
                  value={selectedClass}
                  onChange={handleClassChange}
                  disabled={isPending}
                  style={{ width: "100%", padding: "0.6rem 0.85rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontWeight: 600 }}
                >
                  <option value="">-- Choose Class --</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name} - {c.section}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ minWidth: "240px" }}>
                <select
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  style={{ width: "100%", padding: "0.6rem 0.85rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontWeight: 600 }}
                >
                  {allTeachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.subjects.join(", ") || "Faculty"})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Action Tools */}
          {viewMode === "CLASS" && selectedClass && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleSuggestFill}
                disabled={isPending}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.55rem 0.9rem",
                  borderRadius: "8px",
                  background: "var(--card-bg)",
                  border: "1px solid var(--border-color)",
                  color: "inherit",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  fontWeight: 600
                }}
              >
                <Sparkles size={15} style={{ color: "var(--primary)" }} /> Suggest Fill
              </button>

              <button
                type="button"
                onClick={handlePublish}
                disabled={isPending || !conflictAnalysis.canPublish}
                title={!conflictAnalysis.canPublish ? conflictAnalysis.publishBlockReasons.join(". ") : "Publish timetable"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.55rem 1rem",
                  borderRadius: "8px",
                  background: conflictAnalysis.canPublish ? "var(--success)" : "rgba(107, 114, 128, 0.4)",
                  color: "#fff",
                  border: "none",
                  cursor: conflictAnalysis.canPublish ? "pointer" : "not-allowed",
                  fontSize: "0.85rem",
                  fontWeight: 600
                }}
              >
                <CheckCircle size={15} /> Publish Timetable
              </button>

              <button
                type="button"
                onClick={handleClearTimetable}
                disabled={isPending || timetableData.length === 0}
                style={{
                  padding: "0.55rem 0.75rem",
                  borderRadius: "8px",
                  background: "transparent",
                  color: "var(--danger)",
                  border: "1px solid var(--border-color)",
                  cursor: "pointer",
                  fontSize: "0.85rem"
                }}
                title="Clear all slots"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Secondary Subtabs: Timetable Grid vs Subject Load & Verification */}
        {viewMode === "CLASS" && selectedClass && (
          <div style={{ display: "flex", gap: "1rem", marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "0.75rem" }}>
            <button
              type="button"
              onClick={() => setActiveTab("TIMETABLE")}
              style={{
                background: "none",
                border: "none",
                borderBottom: activeTab === "TIMETABLE" ? "2px solid var(--primary)" : "2px solid transparent",
                padding: "0.4rem 0.5rem",
                cursor: "pointer",
                fontWeight: activeTab === "TIMETABLE" ? 700 : 500,
                color: activeTab === "TIMETABLE" ? "var(--primary)" : "var(--text-secondary)",
                fontSize: "0.875rem"
              }}
            >
              Timetable Grid ({timetableData.length} Slots)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("SUMMARY")}
              style={{
                background: "none",
                border: "none",
                borderBottom: activeTab === "SUMMARY" ? "2px solid var(--primary)" : "2px solid transparent",
                padding: "0.4rem 0.5rem",
                cursor: "pointer",
                fontWeight: activeTab === "SUMMARY" ? 700 : 500,
                color: activeTab === "SUMMARY" ? "var(--primary)" : "var(--text-secondary)",
                fontSize: "0.875rem",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem"
              }}
            >
              Subject Requirements & Teacher Load
              {conflictAnalysis.softWarnings.length > 0 && (
                <span style={{ background: "#f59e0b", color: "#fff", padding: "0.1rem 0.4rem", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 700 }}>
                  {conflictAnalysis.softWarnings.length}
                </span>
              )}
            </button>
            {conflictAnalysis.hardConflicts.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("CONFLICTS")}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === "CONFLICTS" ? "2px solid var(--danger)" : "2px solid transparent",
                  padding: "0.4rem 0.5rem",
                  cursor: "pointer",
                  fontWeight: 700,
                  color: "var(--danger)",
                  fontSize: "0.875rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem"
                }}
              >
                <AlertTriangle size={15} />
                Hard Clashes ({conflictAnalysis.hardConflicts.length})
              </button>
            )}
          </div>
        )}
      </div>

      {/* SUMMARY TAB: Requirements & Workloads */}
      {viewMode === "CLASS" && activeTab === "SUMMARY" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem", marginBottom: "1.5rem" }}>
          {/* Subject Required vs Scheduled */}
          <div style={{ background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--border-color)", padding: "1.25rem" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, marginBottom: "0.75rem" }}>
              Subject Allocation Summary ({selectedClassName})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {subjectSummaries.map(sub => {
                const color = subjectColorMap.get(sub.subjectId) || SUBJECT_COLOR_PALETTE[0];
                return (
                  <div
                    key={sub.subjectId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "8px",
                      background: color.bg,
                      border: `1px solid ${color.border}`
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", color: color.text }}>{sub.subjectName}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        Teacher: {sub.teacherName || "Unassigned"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                        {sub.scheduledPeriodsPerWeek} / {sub.requiredPeriodsPerWeek} Periods
                      </div>
                      <div
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          color:
                            sub.status === "MATCHED"
                              ? "var(--success)"
                              : sub.status === "DEFICIT"
                                ? "#f59e0b"
                                : "var(--primary)"
                        }}
                      >
                        {sub.status === "MATCHED"
                          ? "✓ Required Met"
                          : sub.status === "DEFICIT"
                            ? `Deficit of ${Math.abs(sub.difference)}`
                            : `Surplus of ${sub.difference}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Teacher Load Overview */}
          <div style={{ background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--border-color)", padding: "1.25rem" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, marginBottom: "0.75rem" }}>
              Faculty Workload & Availability
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "400px", overflowY: "auto" }}>
              {teacherLoads.map(t => (
                <div key={t.teacherId} style={{ padding: "0.65rem 0.85rem", borderRadius: "8px", background: "rgba(0,0,0,0.02)", border: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{t.teacherName}</span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                      {t.totalPeriodsPerWeek} / {t.maxPeriodsPerWeek} pw ({t.utilizationPercentage}%)
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ width: "100%", height: "6px", background: "var(--border-color)", borderRadius: "999px", marginTop: "0.4rem", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.min(100, t.utilizationPercentage)}%`,
                        height: "100%",
                        background: t.isOverloaded ? "var(--danger)" : t.utilizationPercentage > 85 ? "#f59e0b" : "var(--primary)"
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CONFLICTS TAB */}
      {viewMode === "CLASS" && activeTab === "CONFLICTS" && (
        <div style={{ background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--border-color)", padding: "1.25rem", marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--danger)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertTriangle size={20} /> Publishing Blocked: Clashes Detected
          </h3>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            The following hard clashes violate scheduling rules. Resolve these before publishing.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "1rem" }}>
            {conflictAnalysis.hardConflicts.map(c => (
              <div key={c.id} style={{ padding: "0.85rem 1rem", borderRadius: "8px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--danger)", fontSize: "0.9rem" }}>{c.title}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>{c.message}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("TIMETABLE");
                    setActiveMobileDay(c.dayOfWeek);
                    const slot = timetableData.find(t => t.dayOfWeek === c.dayOfWeek && t.period === c.period);
                    startEdit(c.dayOfWeek, c.period, slot);
                  }}
                  style={{ padding: "0.4rem 0.75rem", borderRadius: "6px", background: "var(--card-bg)", border: "1px solid var(--border-color)", color: "inherit", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600 }}
                >
                  Edit Slot
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MAIN TIMETABLE VIEW (Grid on Desktop, Day-Cards on Mobile) */}
      {activeTab === "TIMETABLE" && (
        <>
          {/* MOBILE VIEW (< 768px): Day Selector + Compact Vertical Period Cards */}
          <div className="timetable-mobile-container" style={{ display: "none" }}>
            {/* View Type Toggle: Day Cards vs Week-at-a-glance */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div style={{ display: "inline-flex", background: "var(--card-bg)", borderRadius: "8px", border: "1px solid var(--border-color)", padding: "2px" }}>
                <button
                  type="button"
                  onClick={() => setMobileViewType("DAY")}
                  style={{
                    padding: "0.35rem 0.75rem",
                    borderRadius: "6px",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    background: mobileViewType === "DAY" ? "var(--primary)" : "transparent",
                    color: mobileViewType === "DAY" ? "var(--primary-fg)" : "var(--text-secondary)"
                  }}
                >
                  Day View
                </button>
                <button
                  type="button"
                  onClick={() => setMobileViewType("WEEK")}
                  style={{
                    padding: "0.35rem 0.75rem",
                    borderRadius: "6px",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    background: mobileViewType === "WEEK" ? "var(--primary)" : "transparent",
                    color: mobileViewType === "WEEK" ? "var(--primary-fg)" : "var(--text-secondary)"
                  }}
                >
                  Week at a Glance
                </button>
              </div>
            </div>

            {/* Mobile Day Selector Chips */}
            {mobileViewType === "DAY" && (
              <div style={{ display: "flex", gap: "0.4rem", overflowX: "auto", paddingBottom: "0.5rem", marginBottom: "1rem" }}>
                {DAYS.map(day => {
                  const isSel = activeMobileDay === day;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setActiveMobileDay(day)}
                      style={{
                        padding: "0.5rem 0.85rem",
                        borderRadius: "8px",
                        border: isSel ? "1px solid var(--primary)" : "1px solid var(--border-color)",
                        background: isSel ? "var(--primary)" : "var(--card-bg)",
                        color: isSel ? "var(--primary-fg)" : "inherit",
                        fontWeight: isSel ? 700 : 500,
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {day.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            )}

            {/* If Mobile Week at a glance: Compact Chip Matrix fitting within 360px */}
            {mobileViewType === "WEEK" && (
              <div style={{ background: "var(--card-bg)", borderRadius: "10px", border: "1px solid var(--border-color)", padding: "0.75rem", width: "100%", overflowX: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "40px repeat(6, 1fr)", gap: "4px", textAlign: "center", fontSize: "0.72rem", fontWeight: 700 }}>
                  <div />
                  {SHORT_DAYS.map(d => <div key={d} style={{ color: "var(--text-secondary)" }}>{d}</div>)}

                  {sortedPeriods.map(p => {
                    const isBreak = p.type === "BREAK" || p.type === "LUNCH";
                    return (
                      <div key={p.order} style={{ display: "contents" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "var(--text-secondary)" }}>
                          P{p.order}
                        </div>
                        {DAYS.map(day => {
                          const slot = timetableData.find(t => t.dayOfWeek?.toUpperCase() === day && t.period === p.order);
                          const subColor = slot?.subjectId ? subjectColorMap.get(slot.subjectId) : null;
                          const code = slot?.subject?.code || slot?.subject?.name?.slice(0, 3)?.toUpperCase() || (isBreak ? "BRK" : "-");

                          return (
                            <button
                              key={`${day}-${p.order}`}
                              type="button"
                              onClick={() => {
                                setActiveMobileDay(day);
                                setMobileViewType("DAY");
                              }}
                              style={{
                                padding: "4px 2px",
                                borderRadius: "4px",
                                border: `1px solid ${subColor?.border || "var(--border-color)"}`,
                                background: isBreak ? "rgba(245, 158, 11, 0.1)" : subColor?.bg || "transparent",
                                color: isBreak ? "#d97706" : subColor?.text || "var(--text-secondary)",
                                fontSize: "0.68rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                minHeight: "28px",
                                overflow: "hidden",
                                textOverflow: "ellipsis"
                              }}
                            >
                              {code}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* If Mobile Day View: Vertical Period Cards */}
            {mobileViewType === "DAY" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {sortedPeriods.map(p => {
                  const slot = timetableData.find(t => t.dayOfWeek?.toUpperCase() === activeMobileDay && t.period === p.order);
                  const isBreak = p.type === "BREAK" || p.type === "LUNCH" || slot?.isBreak;
                  const isEditing = editingSlot?.day?.toUpperCase() === activeMobileDay && editingSlot?.period === p.order;
                  const color = slot?.subjectId ? subjectColorMap.get(slot.subjectId) : SUBJECT_COLOR_PALETTE[0];

                  if (isBreak && !isEditing) {
                    return (
                      <div
                        key={p.order}
                        style={{
                          padding: "0.5rem 0.85rem",
                          borderRadius: "8px",
                          background: "rgba(245, 158, 11, 0.08)",
                          border: "1px dashed rgba(245, 158, 11, 0.3)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          color: "#d97706",
                          fontSize: "0.8rem",
                          fontWeight: 600
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <Coffee size={14} /> {p.label || "Break"}
                        </span>
                        <span style={{ fontSize: "0.72rem" }}>
                          {p.startTime} - {p.endTime}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={p.order}
                      style={{
                        background: "var(--card-bg)",
                        borderRadius: "10px",
                        border: `1px solid ${slot ? color?.border || "var(--border-color)" : "var(--border-color)"}`,
                        padding: "0.85rem",
                        boxSizing: "border-box"
                      }}
                    >
                      {isEditing ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--primary)" }}>
                            Editing Period {p.order} ({p.startTime} - {p.endTime})
                          </div>
                          <select
                            value={editData.subjectId}
                            onChange={(e) => {
                              const sId = e.target.value;
                              const matched = availableSubjects.find(s => s.id === sId);
                              setEditData({
                                ...editData,
                                subjectId: sId,
                                teacherId: matched?.teacherId || editData.teacherId
                              });
                            }}
                            style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.85rem" }}
                          >
                            <option value="">-- Select Subject --</option>
                            {availableSubjects.map(s => (
                              <option key={s.id} value={s.id}>{s.name} ({s.teacher?.user?.name || "No Teacher"})</option>
                            ))}
                          </select>

                          <select
                            value={editData.teacherId}
                            onChange={(e) => setEditData({ ...editData, teacherId: e.target.value })}
                            style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.85rem" }}
                          >
                            <option value="">-- Assigned Teacher --</option>
                            {allTeachers.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>

                          <input
                            type="text"
                            placeholder="Classroom / Room (e.g. Room 204)"
                            value={editData.classroom}
                            onChange={(e) => setEditData({ ...editData, classroom: e.target.value })}
                            style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.85rem" }}
                          />

                          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                            <button
                              type="button"
                              onClick={() => saveSlot(activeMobileDay, p.order)}
                              disabled={isPending}
                              style={{ flex: 1, padding: "0.5rem", background: "var(--primary)", color: "var(--primary-fg)", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem" }}
                            >
                              Save Slot
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingSlot(null)}
                              style={{ padding: "0.5rem 1rem", background: "transparent", border: "1px solid var(--border-color)", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : slot ? (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                              <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "0.15rem 0.45rem", borderRadius: "4px", background: "var(--input-bg)", color: "var(--text-secondary)" }}>
                                P{p.order}
                              </span>
                              <span style={{ fontWeight: 700, fontSize: "0.95rem", color: color?.text || "inherit" }}>
                                {slot.subject?.name}
                              </span>
                            </div>

                            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                              <span style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                                <User size={12} /> {slot.teacher?.user?.name || slot.subject?.teacher?.user?.name || "Teacher"}
                              </span>
                              {slot.classroom && (
                                <span style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                                  <MapPin size={12} /> {slot.classroom}
                                </span>
                              )}
                              <span>• {p.startTime} - {p.endTime}</span>
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: "0.35rem" }}>
                            <button
                              type="button"
                              onClick={() => startEdit(activeMobileDay, p.order, slot)}
                              style={{ padding: "0.4rem", background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSlot(slot.id)}
                              style={{ padding: "0.4rem", background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer" }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(activeMobileDay, p.order, undefined)}
                          style={{
                            width: "100%",
                            padding: "0.6rem",
                            background: "transparent",
                            border: "1px dashed var(--border-color)",
                            borderRadius: "6px",
                            color: "var(--text-secondary)",
                            cursor: "pointer",
                            fontSize: "0.85rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.3rem"
                          }}
                        >
                          + Add Period {p.order} ({p.startTime} - {p.endTime})
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* DESKTOP VIEW (>= 768px): Full Table with Sticky Headers & No Sideways Stacking */}
          <div className="timetable-desktop-container" style={{ background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--border-color)", overflow: "hidden", width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
            <div style={{ overflowX: "auto", width: "100%" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: "900px" }}>
                <thead>
                  <tr>
                    {/* Fixed First Column for Day */}
                    <th style={{ width: "130px", minWidth: "130px", padding: "0.85rem 1rem", borderBottom: "2px solid var(--border-color)", borderRight: "1px solid var(--border-color)", background: "var(--card-bg)", position: "sticky", left: 0, zIndex: 10, textAlign: "left", fontSize: "0.85rem", fontWeight: 700 }}>
                      Day / Period
                    </th>

                    {/* Period Columns with Header Times */}
                    {sortedPeriods.map(p => {
                      const isBreak = p.type === "BREAK" || p.type === "LUNCH";
                      return (
                        <th
                          key={p.order}
                          style={{
                            padding: "0.75rem 0.5rem",
                            borderBottom: "2px solid var(--border-color)",
                            borderRight: "1px solid var(--border-color)",
                            background: isBreak ? "rgba(245, 158, 11, 0.05)" : "var(--card-bg)",
                            textAlign: "center",
                            minWidth: isBreak ? "90px" : "135px"
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: "0.85rem", color: isBreak ? "#d97706" : "inherit" }}>
                            {p.label || `Period ${p.order}`}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 500, marginTop: "0.15rem" }}>
                            {p.startTime} - {p.endTime}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {DAYS.map((day, dayIndex) => {
                    const currentDayDate = new Date(selectedWeek);
                    currentDayDate.setDate(currentDayDate.getDate() + dayIndex);

                    return (
                      <tr key={day}>
                        {/* Day Column */}
                        <td
                          style={{
                            padding: "0.85rem 1rem",
                            borderBottom: "1px solid var(--border-color)",
                            borderRight: "1px solid var(--border-color)",
                            background: "var(--card-bg)",
                            position: "sticky",
                            left: 0,
                            zIndex: 5,
                            verticalAlign: "top"
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{day}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.15rem", whiteSpace: "nowrap" }}>
                            {currentDayDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </div>
                        </td>

                        {/* Period Slots */}
                        {sortedPeriods.map(p => {
                          const slot = timetableData.find(t => t.dayOfWeek?.toUpperCase() === day && t.period === p.order);
                          const isBreak = p.type === "BREAK" || p.type === "LUNCH" || slot?.isBreak;
                          const isEditing = editingSlot?.day?.toUpperCase() === day && editingSlot?.period === p.order;
                          const color = slot?.subjectId ? subjectColorMap.get(slot.subjectId) : null;

                          return (
                            <td
                              key={p.order}
                              style={{
                                padding: "0.45rem",
                                borderBottom: "1px solid var(--border-color)",
                                borderRight: "1px solid var(--border-color)",
                                verticalAlign: "top",
                                height: "88px",
                                background: isBreak ? "rgba(245, 158, 11, 0.03)" : "transparent"
                              }}
                            >
                              {isBreak && !isEditing ? (
                                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(245, 158, 11, 0.08)", borderRadius: "6px", color: "#d97706", fontSize: "0.75rem", fontWeight: 600 }}>
                                  <Coffee size={14} />
                                  <span style={{ marginTop: "0.2rem" }}>{p.label || "Break"}</span>
                                </div>
                              ) : isEditing ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", height: "100%" }}>
                                  <select
                                    value={editData.subjectId}
                                    onChange={(e) => {
                                      const sId = e.target.value;
                                      const matched = availableSubjects.find(s => s.id === sId);
                                      setEditData({
                                        ...editData,
                                        subjectId: sId,
                                        teacherId: matched?.teacherId || editData.teacherId
                                      });
                                    }}
                                    style={{ width: "100%", padding: "0.2rem", fontSize: "0.72rem", borderRadius: "4px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit" }}
                                  >
                                    <option value="">Select Subject</option>
                                    {availableSubjects.map(s => (
                                      <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                  </select>

                                  <input
                                    type="text"
                                    placeholder="Room"
                                    value={editData.classroom}
                                    onChange={(e) => setEditData({ ...editData, classroom: e.target.value })}
                                    style={{ width: "100%", padding: "0.2rem", fontSize: "0.72rem", borderRadius: "4px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit" }}
                                  />

                                  <div style={{ display: "flex", gap: "0.2rem", marginTop: "auto" }}>
                                    <button
                                      type="button"
                                      onClick={() => saveSlot(day, p.order)}
                                      disabled={isPending}
                                      style={{ flex: 1, padding: "0.2rem", background: "var(--success)", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.7rem", fontWeight: 700 }}
                                    >
                                      ✓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingSlot(null)}
                                      style={{ flex: 1, padding: "0.2rem", background: "var(--danger)", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.7rem", fontWeight: 700 }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              ) : slot ? (
                                <div
                                  style={{
                                    height: "100%",
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "space-between",
                                    padding: "0.45rem",
                                    borderRadius: "6px",
                                    background: color?.bg || "rgba(79, 70, 229, 0.08)",
                                    border: `1px solid ${color?.border || "rgba(79, 70, 229, 0.25)"}`
                                  }}
                                >
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.2rem" }}>
                                    <span style={{ fontWeight: 700, fontSize: "0.82rem", color: color?.text || "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {slot.subject?.name}
                                    </span>
                                    <div style={{ display: "flex", gap: "2px" }}>
                                      <button
                                        type="button"
                                        onClick={() => startEdit(day, p.order, slot)}
                                        style={{ background: "none", border: "none", padding: "1px", cursor: "pointer", color: "var(--text-secondary)" }}
                                      >
                                        <Edit size={11} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteSlot(slot.id)}
                                        style={{ background: "none", border: "none", padding: "1px", cursor: "pointer", color: "var(--danger)" }}
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                    </div>
                                  </div>

                                  <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {slot.teacher?.user?.name || slot.subject?.teacher?.user?.name || "No Teacher"}
                                  </div>

                                  {slot.classroom && (
                                    <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "2px" }}>
                                      <MapPin size={9} /> {slot.classroom}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startEdit(day, p.order, undefined)}
                                  disabled={isPending}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    background: "transparent",
                                    border: "1px dashed var(--border-color)",
                                    borderRadius: "6px",
                                    color: "var(--text-secondary)",
                                    cursor: "pointer",
                                    fontSize: "0.75rem"
                                  }}
                                >
                                  +
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* TEACHER SCHEDULE VIEW (if viewMode === "TEACHER") */}
      {viewMode === "TEACHER" && (
        <div style={{ background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--border-color)", padding: "1.25rem" }}>
          <div style={{ marginBottom: "1rem" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
              Staff Weekly Schedule: {allTeachers.find(t => t.id === selectedTeacherId)?.name}
            </h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
              Total assigned classes: {teacherTimetableSlots.length} periods per week.
            </p>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "750px" }}>
              <thead>
                <tr>
                  <th style={{ padding: "0.75rem", borderBottom: "1px solid var(--border-color)", textAlign: "left", fontSize: "0.85rem" }}>Day</th>
                  <th style={{ padding: "0.75rem", borderBottom: "1px solid var(--border-color)", textAlign: "left", fontSize: "0.85rem" }}>Period</th>
                  <th style={{ padding: "0.75rem", borderBottom: "1px solid var(--border-color)", textAlign: "left", fontSize: "0.85rem" }}>Time</th>
                  <th style={{ padding: "0.75rem", borderBottom: "1px solid var(--border-color)", textAlign: "left", fontSize: "0.85rem" }}>Class</th>
                  <th style={{ padding: "0.75rem", borderBottom: "1px solid var(--border-color)", textAlign: "left", fontSize: "0.85rem" }}>Subject</th>
                  <th style={{ padding: "0.75rem", borderBottom: "1px solid var(--border-color)", textAlign: "left", fontSize: "0.85rem" }}>Room</th>
                </tr>
              </thead>
              <tbody>
                {teacherTimetableSlots.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
                      No timetable slots scheduled for this teacher yet.
                    </td>
                  </tr>
                ) : (
                  teacherTimetableSlots.map(s => {
                    const cls = classes.find(c => c.id === s.classId);
                    return (
                      <tr key={s.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                        <td style={{ padding: "0.75rem", fontWeight: 600 }}>{s.dayOfWeek}</td>
                        <td style={{ padding: "0.75rem" }}>Period {s.period}</td>
                        <td style={{ padding: "0.75rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{s.startTime} - {s.endTime}</td>
                        <td style={{ padding: "0.75rem", fontWeight: 600, color: "var(--primary)" }}>{cls ? `${cls.name} - ${cls.section}` : s.classId}</td>
                        <td style={{ padding: "0.75rem" }}>{s.subjectName || "Subject"}</td>
                        <td style={{ padding: "0.75rem" }}>{s.classroom || "-"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Period Slots Configuration Modal */}
      {showPeriodConfigModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--border-color)", width: "100%", maxWidth: "700px", maxHeight: "90vh", overflowY: "auto", padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Settings size={20} /> Period Times Configuration
                </h3>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                  Times set here define the period header row across every day and synchronize with teacher & parent dashboards.
                </p>
              </div>
              <button onClick={() => setShowPeriodConfigModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                <X size={20} />
              </button>
            </div>

            {/* Quick Generator Wizard Box */}
            <div style={{ background: "rgba(99, 102, 241, 0.05)", border: "1px solid rgba(99, 102, 241, 0.2)", borderRadius: "10px", padding: "1rem", marginBottom: "1.25rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--primary)", display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.75rem" }}>
                <Sparkles size={16} /> Quick Setup Wizard
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.75rem", fontSize: "0.8rem" }}>
                <div>
                  <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "0.2rem" }}>Start Time</label>
                  <input type="time" value={quickGenStartTime} onChange={e => setQuickGenStartTime(e.target.value)} style={{ width: "100%", padding: "0.4rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit" }} />
                </div>
                <div>
                  <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "0.2rem" }}>Lesson (mins)</label>
                  <input type="number" value={quickGenDuration} onChange={e => setQuickGenDuration(Number(e.target.value))} style={{ width: "100%", padding: "0.4rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit" }} />
                </div>
                <div>
                  <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "0.2rem" }}>Total Periods</label>
                  <input type="number" value={quickGenTotal} onChange={e => setQuickGenTotal(Number(e.target.value))} style={{ width: "100%", padding: "0.4rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit" }} />
                </div>
                <div>
                  <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "0.2rem" }}>Break After P#</label>
                  <input type="number" value={quickGenBreakPeriod} onChange={e => setQuickGenBreakPeriod(Number(e.target.value))} style={{ width: "100%", padding: "0.4rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit" }} />
                </div>
                <div>
                  <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "0.2rem" }}>Lunch After P#</label>
                  <input type="number" value={quickGenLunchPeriod} onChange={e => setQuickGenLunchPeriod(Number(e.target.value))} style={{ width: "100%", padding: "0.4rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit" }} />
                </div>
              </div>
              <div style={{ marginTop: "0.75rem", display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={handleExecuteQuickGen}
                  disabled={isPending}
                  style={{ padding: "0.4rem 0.85rem", background: "var(--primary)", color: "var(--primary-fg)", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "0.8rem" }}
                >
                  Generate & Apply Schedule
                </button>
              </div>
            </div>

            {/* Manual Slot Customization List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {editingPeriodSlots.map((ps, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "60px 1.2fr 100px 100px 110px 30px", gap: "0.5rem", alignItems: "center", padding: "0.5rem", borderRadius: "6px", background: ps.type === "BREAK" || ps.type === "LUNCH" ? "rgba(245, 158, 11, 0.05)" : "rgba(0,0,0,0.02)" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>#{ps.order}</span>
                  <input
                    type="text"
                    value={ps.label}
                    onChange={(e) => {
                      const updated = [...editingPeriodSlots];
                      updated[idx].label = e.target.value;
                      setEditingPeriodSlots(updated);
                    }}
                    style={{ padding: "0.35rem", borderRadius: "4px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.8rem" }}
                  />
                  <input
                    type="time"
                    value={ps.startTime}
                    onChange={(e) => {
                      const updated = [...editingPeriodSlots];
                      updated[idx].startTime = e.target.value;
                      setEditingPeriodSlots(updated);
                    }}
                    style={{ padding: "0.35rem", borderRadius: "4px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.8rem" }}
                  />
                  <input
                    type="time"
                    value={ps.endTime}
                    onChange={(e) => {
                      const updated = [...editingPeriodSlots];
                      updated[idx].endTime = e.target.value;
                      setEditingPeriodSlots(updated);
                    }}
                    style={{ padding: "0.35rem", borderRadius: "4px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.8rem" }}
                  />
                  <select
                    value={ps.type}
                    onChange={(e) => {
                      const updated = [...editingPeriodSlots];
                      updated[idx].type = e.target.value as PeriodType;
                      setEditingPeriodSlots(updated);
                    }}
                    style={{ padding: "0.35rem", borderRadius: "4px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.75rem" }}
                  >
                    <option value="LESSON">Lesson</option>
                    <option value="BREAK">Break</option>
                    <option value="LUNCH">Lunch</option>
                    <option value="ASSEMBLY">Assembly</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPeriodSlots(editingPeriodSlots.filter((_, i) => i !== idx));
                    }}
                    style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: 0 }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.25rem" }}>
              <button
                type="button"
                onClick={() => {
                  const nextOrder = editingPeriodSlots.length + 1;
                  setEditingPeriodSlots([
                    ...editingPeriodSlots,
                    {
                      order: nextOrder,
                      label: `Period ${nextOrder}`,
                      startTime: "15:00",
                      endTime: "15:45",
                      type: "LESSON"
                    }
                  ]);
                }}
                style={{ padding: "0.5rem 0.85rem", background: "transparent", border: "1px dashed var(--border-color)", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem" }}
              >
                + Add Period Slot
              </button>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setShowPeriodConfigModal(false)}
                  style={{ padding: "0.55rem 1rem", background: "transparent", border: "1px solid var(--border-color)", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePeriodSlots}
                  disabled={isPending}
                  style={{ padding: "0.55rem 1.25rem", background: "var(--primary)", color: "var(--primary-fg)", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem" }}
                >
                  Save & Synchronize All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timetable Scan Modal */}
      {showScanModal && selectedClass && (
        <TimetableScanModal
          isOpen={showScanModal}
          selectedClassId={selectedClass}
          selectedClassName={selectedClassName}
          availableSubjects={availableSubjects}
          onClose={() => setShowScanModal(false)}
          onSaveSuccess={() => {
            router.refresh();
          }}
        />
      )}

      {/* Responsive media query styling */}
      <style jsx>{`
        @media (max-width: 767px) {
          .timetable-desktop-container {
            display: none !important;
          }
          .timetable-mobile-container {
            display: block !important;
          }
        }
        @media (min-width: 768px) {
          .timetable-desktop-container {
            display: block !important;
          }
          .timetable-mobile-container {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
