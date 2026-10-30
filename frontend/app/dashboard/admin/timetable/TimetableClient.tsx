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
  Copy,
  RotateCcw,
  Check,
  Globe
} from "lucide-react";
import {
  createTimetableSlotAction,
  deleteTimetableSlotAction,
  bulkCreateTimetableSlotsAction,
  publishTimetableAction,
  publishAllTimetablesAction,
  unpublishAllTimetablesAction,
  clearClassTimetableAction,
  copyDaySlotsAction
} from "@/backend/api/actions/dashboard/admin/timetable/actions";
import {
  savePeriodSlotsAction,
  quickGenerateSlotsAction
} from "@/backend/api/actions/dashboard/admin/timetable/periodSlotActions";
import type {
  PeriodSlotData,
  TimetableSlotEntry,
  PeriodType
} from "@/backend/lib/timetable/timetableTypes";
import TimetableScanModal from "./TimetableScanModal";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";

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

export interface WeekSubstitutionInfo {
  id: string;
  date: string; // YYYY-MM-DD
  timetableEntryId: string;
  absentTeacherId: string;
  absentTeacherName: string;
  substituteTeacherId: string | null;
  substituteTeacherName: string | null;
  status: string;
  note: string | null;
}

export interface WeekAbsenceInfo {
  id: string;
  date: string;
  teacherId: string;
  teacherName: string;
  fullDay: boolean;
  periodNumbers: number[];
}

export interface TimetableClientProps {
  classes: Array<{ id: string; name: string; section: string }>;
  initialClassId: string;
  timetableData: any[];
  allSchoolSlots: any[];
  availableSubjects: Array<{
    id: string;
    name: string;
    code: string;
    classId?: string | null;
    requiredPeriodsPerWeek?: number | null;
    teacherId?: string | null;
    teacher?: { id: string; user?: { name: string } | null } | null;
  }>;
  allSubjects?: Array<{
    id: string;
    name: string;
    code: string;
    classId?: string | null;
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
  weekLabel?: string;
  weekSubstitutions?: WeekSubstitutionInfo[];
  weekAbsences?: WeekAbsenceInfo[];
}

export default function TimetableClient({
  classes,
  initialClassId,
  timetableData,
  allSchoolSlots,
  availableSubjects,
  allSubjects = [],
  allTeachers,
  periodSlots: initialPeriodSlots,
  pendingSubstitutionsCount,
  events,
  weekOf,
  weekLabel,
  weekSubstitutions = [],
  weekAbsences = []
}: TimetableClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const confirm = useConfirm();

  const [selectedClass, setSelectedClass] = useState(initialClassId);
  const [selectedWeek, setSelectedWeek] = useState(weekOf);
  const [viewMode, setViewMode] = useState<"CLASS" | "TEACHER">("CLASS");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(allTeachers[0]?.id || "");

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

  // Copy Day modal state
  const [copyFromDay, setCopyFromDay] = useState<string | null>(null);
  const [copyTargetDays, setCopyTargetDays] = useState<string[]>([]);

  const selectedClassObj = classes.find(c => c.id === selectedClass);
  const selectedClassName = selectedClassObj ? `${selectedClassObj.name} - ${selectedClassObj.section}` : "";

  // Dynamically resolve subjects for currently selected class, falling back to all subjects
  const currentClassSubjects = useMemo(() => {
    let list: Array<{
      id: string;
      name: string;
      code: string;
      classId?: string | null;
      teacherId?: string | null;
      teacher?: { id: string; user?: { name: string } | null } | null;
    }> = [];

    // 1. If allSubjects is provided, check for subjects matching selectedClass
    if (allSubjects && allSubjects.length > 0) {
      const classSpecific = allSubjects.filter(s => s.classId === selectedClass);
      if (classSpecific.length > 0) list = classSpecific;
    }

    // 2. Check availableSubjects
    if (list.length === 0 && availableSubjects && availableSubjects.length > 0) {
      const classSpecific = availableSubjects.filter(s => !s.classId || s.classId === selectedClass);
      if (classSpecific.length > 0) list = classSpecific;
      else list = availableSubjects;
    }

    // 3. Fallback to distinct subjects across the school so the dropdown is NEVER empty
    if (list.length === 0 && allSubjects && allSubjects.length > 0) {
      const seen = new Set<string>();
      list = allSubjects.filter(s => {
        const key = s.name.trim().toUpperCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    // 4. Default school subjects safety fallback
    if (list.length === 0) {
      list = [
        { id: "fallback-tamil", name: "TAMIL", code: "TAM001", classId: selectedClass, teacherId: null, teacher: null },
        { id: "fallback-english", name: "ENGLISH", code: "ENG002", classId: selectedClass, teacherId: null, teacher: null },
        { id: "fallback-maths", name: "MATHEMATICS", code: "MAT001", classId: selectedClass, teacherId: null, teacher: null },
        { id: "fallback-science", name: "SCIENCE", code: "SCI002", classId: selectedClass, teacherId: null, teacher: null },
        { id: "fallback-social", name: "SOCIAL SCIENCE", code: "SOCI001", classId: selectedClass, teacherId: null, teacher: null },
      ];
    }

    return list;
  }, [allSubjects, availableSubjects, selectedClass]);

  // Assign consistent colors to subjects
  const subjectColorMap = useMemo(() => {
    const map = new Map<string, typeof SUBJECT_COLOR_PALETTE[0]>();
    const pool = (allSubjects && allSubjects.length > 0) ? allSubjects : currentClassSubjects;
    pool.forEach((sub, idx) => {
      map.set(sub.id, SUBJECT_COLOR_PALETTE[idx % SUBJECT_COLOR_PALETTE.length]);
    });
    return map;
  }, [allSubjects, currentClassSubjects]);

  // Navigate weeks
  const changeWeek = (direction: -1 | 1) => {
    const current = new Date(selectedWeek);
    current.setDate(current.getDate() + direction * 7);
    const newWeekStr = current.toISOString().split("T")[0];
    setSelectedWeek(newWeekStr);
    router.push(`/dashboard/admin/timetable?classId=${selectedClass}&weekOf=${newWeekStr}`);
  };

  // Handle Class Switch
  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const classId = e.target.value;
    setSelectedClass(classId);
    setActionError(null);
    setActionSuccess(null);
    setEditingSlot(null);
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
    const pool = [...currentClassSubjects, ...(allSubjects || []), ...availableSubjects];
    const matchedSubject = pool.find(s => s.id === slotData?.subjectId);
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

  // Save slot (Free editing: never blocked by hard clash or warning)
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
        setActionSuccess(`Saved slot for ${day} Period ${period}!`);
        router.refresh();
      }
    });
  };

  // Delete slot
  const deleteSlot = async (id: string) => {
    const ok = await confirm({
      title: "Remove Period Slot?",
      message: "Are you sure you want to remove this period slot from the timetable? This cannot be undone.",
      confirmText: "Remove Slot",
      cancelText: "Cancel",
      variant: "danger"
    });
    if (!ok) return;

    startTransition(async () => {
      const res = await deleteTimetableSlotAction(id);
      if (res.error) {
        setActionError(res.error);
      } else {
        setActionSuccess("Slot removed successfully.");
        router.refresh();
      }
    });
  };

  // Publish timetable for currently selected class (zero blocking)
  const handlePublishClass = async () => {
    setActionError(null);
    setActionSuccess(null);
    startTransition(async () => {
      const res = await publishTimetableAction(selectedClass);
      if (!res.success) {
        setActionError(res.error || "Failed to publish timetable.");
      } else {
        setActionSuccess(`Timetable published for ${selectedClassName} (${res.count} slots)!`);
        router.refresh();
      }
    });
  };

  // Publish All Classes at once with one click
  const handlePublishAll = async () => {
    const ok = await confirm({
      title: "Publish All Timetables?",
      message: "Publish timetable for ALL classes? Parents and teachers across all grades will see the published schedule.",
      confirmText: "Publish All",
      cancelText: "Cancel",
      variant: "primary"
    });
    if (!ok) return;

    setActionError(null);
    setActionSuccess(null);
    startTransition(async () => {
      const res = await publishAllTimetablesAction();
      if (!res.success) {
        setActionError(res.error || "Failed to publish all timetables.");
      } else {
        setActionSuccess(`Published all class timetables (${res.count} slots) across the school!`);
        router.refresh();
      }
    });
  };

  // Unpublish all classes (revert to Draft)
  const handleUnpublishAll = async () => {
    const ok = await confirm({
      title: "Revert to Draft?",
      message: "Revert all timetables to DRAFT? Schedules will be hidden from parent & student views until published again.",
      confirmText: "Revert to Draft",
      cancelText: "Cancel",
      variant: "warning"
    });
    if (!ok) return;

    setActionError(null);
    setActionSuccess(null);
    startTransition(async () => {
      const res = await unpublishAllTimetablesAction();
      if (!res.success) {
        setActionError(res.error || "Failed to unpublish timetables.");
      } else {
        setActionSuccess(`Reverted all timetables (${res.count} slots) to Draft.`);
        router.refresh();
      }
    });
  };

  // Clear timetable for selected class
  const handleClearTimetable = async () => {
    const ok = await confirm({
      title: `Clear Timetable for ${selectedClassName}?`,
      message: `Are you sure you want to clear the entire timetable for ${selectedClassName}? All scheduled lessons and assignments will be removed. This cannot be undone.`,
      confirmText: "Clear Timetable",
      cancelText: "Cancel",
      variant: "danger"
    });
    if (!ok) return;

    startTransition(async () => {
      const res = await clearClassTimetableAction(selectedClass);
      if (!res.success) {
        setActionError(res.error || "Failed to clear timetable.");
      } else {
        setActionSuccess(`Cleared all timetable slots for ${selectedClassName}.`);
        router.refresh();
      }
    });
  };

  // Execute Day Copy
  const handleExecuteCopyDay = async () => {
    if (!copyFromDay || copyTargetDays.length === 0) return;
    setActionError(null);
    startTransition(async () => {
      const res = await copyDaySlotsAction(selectedClass, copyFromDay, copyTargetDays);
      if (!res.success) {
        setActionError(res.error || "Failed to copy day schedule.");
      } else {
        setActionSuccess(`Successfully copied ${res.count} slots from ${copyFromDay} to ${copyTargetDays.join(", ")}!`);
        setCopyFromDay(null);
        setCopyTargetDays([]);
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

  // Helper to resolve substitutions/absences on a specific day & slot
  const getSlotOverlay = (slotId: string, dayIndex: number, periodOrder: number, teacherId?: string | null) => {
    const currentDayDate = new Date(selectedWeek);
    currentDayDate.setDate(currentDayDate.getDate() + dayIndex);
    const dateStr = currentDayDate.toISOString().split("T")[0];

    const sub = weekSubstitutions.find(s => s.timetableEntryId === slotId && s.date === dateStr);
    const abs = teacherId
      ? weekAbsences.find(a => a.teacherId === teacherId && a.date === dateStr && (a.fullDay || a.periodNumbers.includes(periodOrder)))
      : null;

    if (sub && sub.substituteTeacherName) {
      return {
        type: "SUBSTITUTE" as const,
        substituteName: sub.substituteTeacherName,
        absentName: sub.absentTeacherName
      };
    }
    if ((sub && sub.status === "UNASSIGNED") || (abs && !sub?.substituteTeacherName)) {
      return {
        type: "FREE_PERIOD" as const,
        absentName: abs?.teacherName || sub?.absentTeacherName || "Teacher"
      };
    }
    return null;
  };

  // Teacher Schedule View data filter
  const teacherTimetableSlots = useMemo(() => {
    if (viewMode !== "TEACHER" || !selectedTeacherId) return [];
    return allSchoolSlots.filter(s => s.teacherId === selectedTeacherId || s.subject?.teacherId === selectedTeacherId);
  }, [viewMode, selectedTeacherId, allSchoolSlots]);

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            Timetable Management
          </h1>
          <p style={{ color: "var(--text-secondary)", margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
            School schedule, period timings, and pick-and-assign substitution.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          {/* Mark Teacher Absent Button (Pick-and-Assign Flow) */}
          <Link
            href="/dashboard/admin/timetable/substitution"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.6rem 1rem",
              borderRadius: "8px",
              background: pendingSubstitutionsCount > 0 ? "rgba(239, 68, 68, 0.12)" : "rgba(245, 158, 11, 0.1)",
              color: pendingSubstitutionsCount > 0 ? "var(--danger)" : "#d97706",
              border: `1px solid ${pendingSubstitutionsCount > 0 ? "rgba(239, 68, 68, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
              textDecoration: "none",
              fontWeight: 700,
              fontSize: "0.85rem"
            }}
          >
            <ShieldAlert size={16} />
            <span>Mark Teacher Absent</span>
            {pendingSubstitutionsCount > 0 && (
              <span style={{ background: "var(--danger)", color: "#fff", padding: "0.15rem 0.5rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700 }}>
                {pendingSubstitutionsCount}
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
              background: "var(--card-bg)",
              color: "var(--primary)",
              border: "1px solid var(--border-color)",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 600
            }}
          >
            <Sparkles size={16} /> Upload &amp; Scan
          </button>

          {/* Publish All Classes (Single button, no blocking) */}
          <div style={{ display: "inline-flex", alignItems: "center", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border-color)" }}>
            <button
              type="button"
              onClick={handlePublishAll}
              disabled={isPending}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.6rem 1rem",
                background: "var(--primary)",
                color: "var(--primary-fg)",
                border: "none",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 700
              }}
              title="Publish all class timetables to students, teachers, and parents"
            >
              <Globe size={15} /> Publish All
            </button>
            <button
              type="button"
              onClick={handleUnpublishAll}
              disabled={isPending}
              style={{
                padding: "0.6rem 0.65rem",
                background: "rgba(0,0,0,0.15)",
                color: "var(--primary-fg)",
                border: "none",
                borderLeft: "1px solid rgba(255,255,255,0.2)",
                cursor: "pointer",
                fontSize: "0.75rem",
                fontWeight: 600
              }}
              title="Revert all timetables to Draft"
            >
              Unpublish
            </button>
          </div>
        </div>
      </div>

      {/* Action / Error Alerts */}
      {actionError && (
        <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "0.85rem 1.15rem", borderRadius: "10px", border: "1px solid var(--border-color)", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <AlertCircle size={18} />
            <span style={{ fontSize: "0.875rem" }}>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><X size={16} /></button>
        </div>
      )}

      {actionSuccess && (
        <div style={{ background: "rgba(16, 185, 129, 0.12)", color: "#10b981", padding: "0.85rem 1.15rem", borderRadius: "10px", border: "1px solid rgba(16, 185, 129, 0.25)", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <CheckCircle size={18} />
            <span style={{ fontSize: "0.875rem" }}>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><X size={16} /></button>
        </div>
      )}

      {/* Control Bar: Class Selector, Week Navigator & Actions */}
      <div style={{ background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--border-color)", padding: "1rem 1.25rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            {/* View Mode Toggle */}
            <div style={{ display: "inline-flex", background: "var(--input-bg)", padding: "0.2rem", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
              <button
                type="button"
                onClick={() => setViewMode("CLASS")}
                style={{
                  padding: "0.4rem 0.8rem",
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
                  padding: "0.4rem 0.8rem",
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
                  style={{ width: "100%", padding: "0.55rem 0.8rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontWeight: 600, fontSize: "0.875rem" }}
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
                  style={{ width: "100%", padding: "0.55rem 0.8rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontWeight: 600, fontSize: "0.875rem" }}
                >
                  {allTeachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.subjects.join(", ") || "Faculty"})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Week Navigator with unambiguous date format: "26 Oct to 31 Oct 2026" */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "var(--input-bg)", padding: "0.25rem 0.5rem", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
              <button
                type="button"
                onClick={() => changeWeek(-1)}
                disabled={isPending}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "0.25rem", display: "flex", alignItems: "center" }}
                title="Previous Week"
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, padding: "0 0.35rem", color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                {weekLabel || "Week Schedule"}
              </span>
              <button
                type="button"
                onClick={() => changeWeek(1)}
                disabled={isPending}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "0.25rem", display: "flex", alignItems: "center" }}
                title="Next Week"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Single Class Publish & Clear Actions */}
          {viewMode === "CLASS" && selectedClass && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handlePublishClass}
                disabled={isPending}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.5rem 0.9rem",
                  borderRadius: "8px",
                  background: "var(--success)",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                  fontWeight: 600
                }}
                title="Publish timetable for this class"
              >
                <Check size={14} /> Publish This Class
              </button>

              <button
                type="button"
                onClick={handleClearTimetable}
                disabled={isPending || timetableData.length === 0}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "8px",
                  background: "transparent",
                  color: "var(--danger)",
                  border: "1px solid var(--border-color)",
                  cursor: "pointer",
                  fontSize: "0.82rem"
                }}
                title="Clear all slots for this class"
              >
                <Trash2 size={15} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MAIN TIMETABLE VIEW */}
      {viewMode === "CLASS" && (
        <>
          {/* MOBILE VIEW (< 768px): Day Selector + Compact Vertical Period Cards */}
          <div className="timetable-mobile-container" style={{ display: "none" }}>
            {/* View Type Toggle: Day Cards vs Week Matrix */}
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

              {mobileViewType === "DAY" && (
                <button
                  type="button"
                  onClick={() => {
                    setCopyFromDay(activeMobileDay);
                    setCopyTargetDays([]);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    padding: "0.35rem 0.7rem",
                    borderRadius: "6px",
                    background: "var(--card-bg)",
                    border: "1px solid var(--border-color)",
                    color: "inherit",
                    fontSize: "0.78rem",
                    cursor: "pointer"
                  }}
                >
                  <Copy size={13} /> Copy {activeMobileDay.slice(0, 3)}
                </button>
              )}
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

            {/* If Mobile Week at a glance: Compact Chip Matrix */}
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
                        {DAYS.map((day, dayIdx) => {
                          const slot = timetableData.find(t => t.dayOfWeek?.toUpperCase() === day && t.period === p.order);
                          const subColor = slot?.subjectId ? subjectColorMap.get(slot.subjectId) : null;
                          const code = slot?.subject?.code || slot?.subject?.name?.slice(0, 3)?.toUpperCase() || (isBreak ? "BRK" : "-");

                          const overlay = slot ? getSlotOverlay(slot.id, dayIdx, p.order, slot.teacherId || slot.subject?.teacherId) : null;

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
                                border: `1px solid ${overlay ? "rgba(245, 158, 11, 0.4)" : subColor?.border || "var(--border-color)"}`,
                                background: overlay ? "rgba(245, 158, 11, 0.15)" : isBreak ? "rgba(245, 158, 11, 0.1)" : subColor?.bg || "transparent",
                                color: overlay ? "#d97706" : isBreak ? "#d97706" : subColor?.text || "var(--text-secondary)",
                                fontSize: "0.68rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                minHeight: "28px",
                                overflow: "hidden",
                                textOverflow: "ellipsis"
                              }}
                            >
                              {overlay ? "SUB" : code}
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
                  const dayIdx = DAYS.indexOf(activeMobileDay);
                  const slot = timetableData.find(t => t.dayOfWeek?.toUpperCase() === activeMobileDay && t.period === p.order);
                  const isBreak = p.type === "BREAK" || p.type === "LUNCH" || slot?.isBreak;
                  const isEditing = editingSlot?.day?.toUpperCase() === activeMobileDay && editingSlot?.period === p.order;
                  const color = slot?.subjectId ? subjectColorMap.get(slot.subjectId) : SUBJECT_COLOR_PALETTE[0];

                  const overlay = slot ? getSlotOverlay(slot.id, dayIdx, p.order, slot.teacherId || slot.subject?.teacherId) : null;

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
                        border: `1px solid ${overlay ? "rgba(245, 158, 11, 0.4)" : slot ? color?.border || "var(--border-color)" : "var(--border-color)"}`,
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
                              const pool = [...currentClassSubjects, ...(allSubjects || []), ...availableSubjects];
                              const matched = pool.find(s => s.id === sId);
                              setEditData({
                                ...editData,
                                subjectId: sId,
                                teacherId: matched?.teacherId || editData.teacherId
                              });
                            }}
                            style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontSize: "0.85rem" }}
                          >
                            <option value="">-- Select Subject --</option>
                            {currentClassSubjects.map(s => (
                              <option key={s.id} value={s.id}>{s.name} {s.code ? `(${s.code})` : ""}</option>
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
                            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "0.15rem 0.45rem", borderRadius: "4px", background: "var(--input-bg)", color: "var(--text-secondary)" }}>
                                P{p.order}
                              </span>
                              <span style={{ fontWeight: 700, fontSize: "0.95rem", color: color?.text || "inherit" }}>
                                {slot.subject?.name}
                              </span>
                              {overlay && overlay.type === "SUBSTITUTE" && (
                                <span style={{ background: "rgba(245, 158, 11, 0.15)", color: "#d97706", padding: "0.1rem 0.4rem", borderRadius: "4px", fontSize: "0.72rem", fontWeight: 700 }}>
                                  Sub: {overlay.substituteName}
                                </span>
                              )}
                              {overlay && overlay.type === "FREE_PERIOD" && (
                                <span style={{ background: "rgba(239, 68, 68, 0.12)", color: "var(--danger)", padding: "0.1rem 0.4rem", borderRadius: "4px", fontSize: "0.72rem", fontWeight: 700 }}>
                                  Free Period
                                </span>
                              )}
                            </div>

                            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
                              {overlay && overlay.type === "SUBSTITUTE" ? (
                                <span style={{ textDecoration: "line-through", opacity: 0.6 }}>
                                  {slot.teacher?.user?.name || slot.subject?.teacher?.user?.name}
                                </span>
                              ) : (
                                <span style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                                  <User size={12} /> {slot.teacher?.user?.name || slot.subject?.teacher?.user?.name || "Teacher"}
                                </span>
                              )}
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
                              title="Edit slot"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSlot(slot.id)}
                              style={{ padding: "0.4rem", background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer" }}
                              title="Delete slot"
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

          {/* DESKTOP VIEW (>= 768px): Sticky First Column, Clean Grid, 88px cell height */}
          <div className="timetable-desktop-container" style={{ background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--border-color)", overflow: "hidden", width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
            <div style={{ overflowX: "auto", width: "100%" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: "900px" }}>
                <thead>
                  <tr>
                    {/* Fixed First Column for Day */}
                    <th style={{ width: "135px", minWidth: "135px", padding: "0.85rem 1rem", borderBottom: "2px solid var(--border-color)", borderRight: "1px solid var(--border-color)", background: "var(--card-bg)", position: "sticky", left: 0, zIndex: 10, textAlign: "left", fontSize: "0.85rem", fontWeight: 700 }}>
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
                            padding: "0.75rem 0.9rem",
                            borderBottom: "1px solid var(--border-color)",
                            borderRight: "1px solid var(--border-color)",
                            background: "var(--card-bg)",
                            position: "sticky",
                            left: 0,
                            zIndex: 5,
                            verticalAlign: "top"
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>{day}</div>
                              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.15rem", whiteSpace: "nowrap" }}>
                                {currentDayDate.toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setCopyFromDay(day);
                                setCopyTargetDays([]);
                              }}
                              style={{
                                background: "none",
                                border: "none",
                                padding: "2px",
                                cursor: "pointer",
                                color: "var(--text-secondary)"
                              }}
                              title={`Copy ${day}'s schedule to other days`}
                            >
                              <Copy size={13} />
                            </button>
                          </div>
                        </td>

                        {/* Period Slots */}
                        {sortedPeriods.map(p => {
                          const slot = timetableData.find(t => t.dayOfWeek?.toUpperCase() === day && t.period === p.order);
                          const isBreak = p.type === "BREAK" || p.type === "LUNCH" || slot?.isBreak;
                          const isEditing = editingSlot?.day?.toUpperCase() === day && editingSlot?.period === p.order;
                          const color = slot?.subjectId ? subjectColorMap.get(slot.subjectId) : null;

                          const overlay = slot ? getSlotOverlay(slot.id, dayIndex, p.order, slot.teacherId || slot.subject?.teacherId) : null;

                          return (
                            <td
                              key={p.order}
                              style={{
                                padding: "0.4rem",
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
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", height: "100%" }}>
                                  <select
                                    value={editData.subjectId}
                                    onChange={(e) => {
                                      const sId = e.target.value;
                                      const pool = [...currentClassSubjects, ...(allSubjects || []), ...availableSubjects];
                                      const matched = pool.find(s => s.id === sId);
                                      setEditData({
                                        ...editData,
                                        subjectId: sId,
                                        teacherId: matched?.teacherId || editData.teacherId
                                      });
                                    }}
                                    style={{ width: "100%", padding: "0.25rem", fontSize: "0.74rem", borderRadius: "4px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit", fontWeight: 600 }}
                                  >
                                    <option value="">Select Subject</option>
                                    {currentClassSubjects.map(s => (
                                      <option key={s.id} value={s.id}>{s.name} {s.code ? `(${s.code})` : ""}</option>
                                    ))}
                                  </select>

                                  <select
                                    value={editData.teacherId}
                                    onChange={(e) => setEditData({ ...editData, teacherId: e.target.value })}
                                    style={{ width: "100%", padding: "0.2rem", fontSize: "0.72rem", borderRadius: "4px", border: "1px solid var(--border-color)", background: "var(--input-bg)", color: "inherit" }}
                                  >
                                    <option value="">Select Teacher</option>
                                    {allTeachers.map(t => (
                                      <option key={t.id} value={t.id}>{t.name}</option>
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
                                      title="Save"
                                    >
                                      ✓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingSlot(null)}
                                      style={{ flex: 1, padding: "0.2rem", background: "var(--danger)", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.7rem", fontWeight: 700 }}
                                      title="Cancel"
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
                                    background: overlay ? "rgba(245, 158, 11, 0.08)" : color?.bg || "rgba(79, 70, 229, 0.08)",
                                    border: `1px solid ${overlay ? "rgba(245, 158, 11, 0.35)" : color?.border || "rgba(79, 70, 229, 0.25)"}`
                                  }}
                                >
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.2rem" }}>
                                    <span style={{ fontWeight: 700, fontSize: "0.82rem", color: overlay ? "#d97706" : color?.text || "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {slot.subject?.name}
                                    </span>
                                    <div style={{ display: "flex", gap: "2px" }}>
                                      <button
                                        type="button"
                                        onClick={() => startEdit(day, p.order, slot)}
                                        style={{ background: "none", border: "none", padding: "1px", cursor: "pointer", color: "var(--text-secondary)" }}
                                        title="Edit"
                                      >
                                        <Edit size={11} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteSlot(slot.id)}
                                        style={{ background: "none", border: "none", padding: "1px", cursor: "pointer", color: "var(--danger)" }}
                                        title="Delete"
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Substitute / Absent Overlay indicator */}
                                  {overlay && overlay.type === "SUBSTITUTE" ? (
                                    <div style={{ fontSize: "0.7rem", color: "#d97706", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      Sub: {overlay.substituteName}
                                      <span style={{ textDecoration: "line-through", opacity: 0.6, marginLeft: "4px", fontWeight: 400 }}>
                                        {slot.teacher?.user?.name || slot.subject?.teacher?.user?.name}
                                      </span>
                                    </div>
                                  ) : overlay && overlay.type === "FREE_PERIOD" ? (
                                    <div style={{ fontSize: "0.68rem", color: "var(--danger)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      Teacher Absent (Free)
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {slot.teacher?.user?.name || slot.subject?.teacher?.user?.name || "Unassigned"}
                                    </div>
                                  )}

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
                                    fontSize: "0.85rem",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center"
                                  }}
                                  title="Add slot"
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

      {/* TEACHER SCHEDULE VIEW */}
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
                        <td style={{ padding: "0.75rem" }}>{s.subject?.name || "Subject"}</td>
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

      {/* Copy Day Modal */}
      {copyFromDay && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--border-color)", width: "100%", maxWidth: "460px", padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Copy size={18} /> Copy {copyFromDay}&apos;s Schedule
              </h3>
              <button onClick={() => setCopyFromDay(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              Select target days to duplicate {copyFromDay}&apos;s period slots into {selectedClassName}:
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.25rem" }}>
              {DAYS.filter(d => d !== copyFromDay).map(day => {
                const isSelected = copyTargetDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setCopyTargetDays(copyTargetDays.filter(d => d !== day));
                      } else {
                        setCopyTargetDays([...copyTargetDays, day]);
                      }
                    }}
                    style={{
                      padding: "0.5rem 0.85rem",
                      borderRadius: "8px",
                      border: isSelected ? "1px solid var(--primary)" : "1px solid var(--border-color)",
                      background: isSelected ? "rgba(79, 70, 229, 0.15)" : "var(--input-bg)",
                      color: isSelected ? "var(--primary)" : "inherit",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      fontWeight: isSelected ? 700 : 500
                    }}
                  >
                    {isSelected ? "✓ " : ""}{day}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setCopyFromDay(null)}
                style={{ padding: "0.5rem 1rem", background: "transparent", border: "1px solid var(--border-color)", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteCopyDay}
                disabled={isPending || copyTargetDays.length === 0}
                style={{
                  padding: "0.5rem 1.25rem",
                  background: copyTargetDays.length > 0 ? "var(--primary)" : "rgba(107, 114, 128, 0.4)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  cursor: copyTargetDays.length > 0 ? "pointer" : "not-allowed",
                  fontWeight: 600,
                  fontSize: "0.85rem"
                }}
              >
                Copy to {copyTargetDays.length} Days
              </button>
            </div>
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
                  Times set here define the period header row across every day and synchronize with teacher &amp; parent dashboards.
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
                  Generate &amp; Apply Schedule
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
                  Save &amp; Synchronize All
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
          availableSubjects={currentClassSubjects}
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
