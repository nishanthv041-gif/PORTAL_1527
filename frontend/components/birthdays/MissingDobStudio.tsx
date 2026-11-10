"use client";

import React, { useState, useTransition, useMemo } from "react";
import {
  Calendar,
  Check,
  Upload,
  RefreshCw,
  FileSpreadsheet,
  Search,
  Sparkles,
  X,
  Clock,
  ArrowRight,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import {
  AlertCircleIcon as AlertCircle,
  CheckCircle2Icon as CheckCircle2,
  XCircleIcon as XCircle,
  FilterIcon as Filter,
} from "@/frontend/components/birthdays/BirthdayIcons";
import {
  saveStudentDobAction,
  saveMultipleStudentDobsAction,
  previewClassExcelDobAction,
  commitClassExcelDobAction,
  reviewDobChangeApprovalAction,
} from "@/backend/api/actions/dashboard/admin/birthdays/actions";
import { TeacherClass } from "@/lib/teacher/getTeacherClasses";

export interface StudentDobRecord {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  rollNumber: string;
  admissionNo: string;
  dateOfBirth: string | null; // YYYY-MM-DD
  hasDob: boolean;
  parentName: string;
  parentPhone: string | null;
  hasPortalAccount: boolean;
}

interface MissingDobStudioProps {
  userRole: "ADMIN" | "TEACHER";
  classes: TeacherClass[];
  selectedClassId: string;
  initialStudents: StudentDobRecord[];
  initialPercentage: number;
  initialMissingCount: number;
  initialCompletedCount: number;
  settings: {
    teacherCanEditExistingDob: boolean;
    requireAdminApprovalForDobChange: boolean;
    whatsappShortcut?: boolean;
  };
  // Optional admin audit data
  adminLogs?: any[];
  onClassChange?: (classId: string) => void;
}

export default function MissingDobStudio({
  userRole,
  classes,
  selectedClassId,
  initialStudents,
  initialPercentage,
  initialMissingCount,
  initialCompletedCount,
  settings,
  adminLogs = [],
  onClassChange,
}: MissingDobStudioProps) {
  const [currentClassId, setCurrentClassId] = useState(selectedClassId);
  const [students, setStudents] = useState<StudentDobRecord[]>(initialStudents);
  const [activeTab, setActiveTab] = useState<"missing" | "all" | "audit">("missing");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  // Tracking pending edits: map studentId -> draft date string (YYYY-MM-DD)
  const [draftDates, setDraftDates] = useState<{ [studentId: string]: string }>({});
  const [statusMessages, setStatusMessages] = useState<{ [studentId: string]: { type: "success" | "error" | "pending"; text: string } }>({});

  // Excel Modal state
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [excelPreview, setExcelPreview] = useState<{
    valid: Array<{ studentId: string; studentName: string; rollNumber: string; oldDob: string | null; newDob: string }>;
    unchanged: Array<{ studentId: string; studentName: string; rollNumber: string; currentDob: string }>;
    errors: Array<{ rowNumber: number; identifier: string; reason: string }>;
  } | null>(null);

  // Stats calculation
  const missingCount = students.filter((s) => !s.hasDob).length;
  const completedCount = students.length - missingCount;
  const percentage = students.length > 0 ? Math.round((completedCount / students.length) * 100) : 100;

  // Filtered list
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (activeTab === "missing" && s.hasDob) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = s.name.toLowerCase().includes(q);
        const matchRoll = s.rollNumber.toLowerCase().includes(q);
        const matchAdm = s.admissionNo.toLowerCase().includes(q);
        if (!matchName && !matchRoll && !matchAdm) return false;
      }
      return true;
    });
  }, [students, activeTab, searchQuery]);

  const changedCount = Object.keys(draftDates).length;

  const handleDateChange = (studentId: string, val: string) => {
    const original = students.find((s) => s.id === studentId)?.dateOfBirth || "";
    if (val === original) {
      const next = { ...draftDates };
      delete next[studentId];
      setDraftDates(next);
    } else {
      setDraftDates((prev) => ({ ...prev, [studentId]: val }));
    }
  };

  const handleSaveSingle = (studentId: string) => {
    const draftDate = draftDates[studentId];
    if (!draftDate) return;

    startTransition(async () => {
      const res = await saveStudentDobAction({
        studentId,
        classId: currentClassId,
        dateOfBirth: draftDate,
      });

      if (res.error) {
        setStatusMessages((prev) => ({
          ...prev,
          [studentId]: { type: "error", text: res.error || "Save failed" },
        }));
      } else if (res.pendingApproval) {
        setStatusMessages((prev) => ({
          ...prev,
          [studentId]: { type: "pending", text: "Submitted for Admin approval ⏳" },
        }));
        const next = { ...draftDates };
        delete next[studentId];
        setDraftDates(next);
      } else if (res.success) {
        setStudents((prev) =>
          prev.map((s) =>
            s.id === studentId
              ? { ...s, dateOfBirth: draftDate, hasDob: true }
              : s
          )
        );
        setStatusMessages((prev) => ({
          ...prev,
          [studentId]: {
            type: "success",
            text: res.isBirthdayToday ? "Saved & Birthday Wish Sent! 🎂" : "Saved successfully! ✓",
          },
        }));
        const next = { ...draftDates };
        delete next[studentId];
        setDraftDates(next);

        setTimeout(() => {
          setStatusMessages((prev) => {
            const copy = { ...prev };
            delete copy[studentId];
            return copy;
          });
        }, 4000);
      }
    });
  };

  const handleSaveAll = () => {
    const updates = Object.entries(draftDates).map(([studentId, dateOfBirth]) => ({
      studentId,
      dateOfBirth,
    }));
    if (updates.length === 0) return;

    startTransition(async () => {
      const res = await saveMultipleStudentDobsAction({
        classId: currentClassId,
        updates,
      });

      if (res.success) {
        // Optimistically apply all
        setStudents((prev) =>
          prev.map((s) => {
            const update = updates.find((u) => u.studentId === s.id);
            if (update) {
              return { ...s, dateOfBirth: update.dateOfBirth, hasDob: true };
            }
            return s;
          })
        );
        setDraftDates({});
      }
    });
  };

  const handleExcelPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excelFile) return;

    setIsUploading(true);
    const fd = new FormData();
    fd.append("file", excelFile);

    try {
      const res = await previewClassExcelDobAction(fd, currentClassId);
      if (res.error) {
        alert(res.error);
      } else if (res.preview) {
        setExcelPreview(res.preview);
      }
    } catch (err: any) {
      alert(err?.message || "Failed to parse Excel file.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleExcelCommit = async () => {
    if (!excelPreview || excelPreview.valid.length === 0) return;

    setIsUploading(true);
    try {
      const itemsToSave = excelPreview.valid.map((v) => ({
        studentId: v.studentId,
        dateOfBirth: v.newDob,
      }));
      const res = await commitClassExcelDobAction(currentClassId, itemsToSave);
      if (res.success) {
        setStudents((prev) =>
          prev.map((s) => {
            const matched = itemsToSave.find((it) => it.studentId === s.id);
            if (matched) {
              return { ...s, dateOfBirth: matched.dateOfBirth, hasDob: true };
            }
            return s;
          })
        );
        setIsExcelModalOpen(false);
        setExcelFile(null);
        setExcelPreview(null);
      }
    } catch (err: any) {
      alert(err?.message || "Failed to commit dates.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleAdminApprovalDecision = async (changeLogId: string, decision: "APPROVED" | "REJECTED") => {
    startTransition(async () => {
      await reviewDobChangeApprovalAction({ changeLogId, decision });
    });
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-5 sm:p-7 text-white shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-amber-500/5 blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20 text-xs font-semibold mb-2">
              <Sparkles size={14} className="text-amber-400 animate-pulse" />
              <span>Universal Birthday Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Missing Date of Birth</h1>
            <p className="text-slate-300 text-sm mt-1 max-w-xl">
              Dates of birth power automated birthday greetings from SRT School and keep classroom notice board calendars up to date.
            </p>
          </div>

          {/* Class Switcher */}
          <div className="flex flex-wrap items-center gap-3">
            {classes.length > 1 && (
              <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
                <span className="text-xs text-slate-400 font-medium">Class:</span>
                <select
                  value={currentClassId}
                  onChange={(e) => {
                    setCurrentClassId(e.target.value);
                    if (onClassChange) onClassChange(e.target.value);
                  }}
                  className="bg-transparent text-sm font-semibold text-white focus:outline-none cursor-pointer"
                >
                  {classes.map((c) => (
                    <option key={c.classId} value={c.classId} className="bg-slate-900 text-white">
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={() => setIsExcelModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-all shadow-md active:scale-95"
            >
              <FileSpreadsheet size={16} />
              <span>Fill from Excel</span>
            </button>
          </div>
        </div>

        {/* Progress Metric Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center font-bold text-amber-400 text-base">
              {percentage}%
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                {completedCount} of {students.length} students completed
              </div>
              <div className="text-xs text-slate-400">
                {missingCount === 0 ? "All dates recorded! 🎉" : `${missingCount} students need a date of birth`}
              </div>
            </div>
          </div>

          {/* Visual Progress bar */}
          <div className="flex-1 max-w-xs">
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden p-0.5 border border-slate-700">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  percentage === 100 ? "bg-emerald-400" : "bg-gradient-to-r from-amber-400 to-amber-500"
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab("missing")}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
              activeTab === "missing"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            Missing DOB ({missingCount})
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
              activeTab === "all"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            All Students ({students.length})
          </button>
          {userRole === "ADMIN" && (
            <button
              onClick={() => setActiveTab("audit")}
              className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                activeTab === "audit"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              Approval Log ({adminLogs.filter((l) => l.status === "PENDING_APPROVAL").length})
            </button>
          )}
        </div>

        {/* Search */}
        {activeTab !== "audit" && (
          <div className="relative min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by student name or roll #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-slate-900 dark:text-white"
            />
          </div>
        )}
      </div>

      {/* Main Student Cards List */}
      {activeTab !== "audit" && (
        <div className="space-y-3">
          {filteredStudents.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 mx-auto flex items-center justify-center mb-3">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {activeTab === "missing" ? "No missing dates of birth!" : "No students found."}
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {activeTab === "missing"
                  ? "Every student in this class has their date of birth recorded. You can view all students in the 'All Students' tab."
                  : "Try clearing your search query to see students."}
              </p>
            </div>
          ) : (
            filteredStudents.map((student) => {
              const draftVal = draftDates[student.id];
              const isEdited = draftVal !== undefined && draftVal !== (student.dateOfBirth || "");
              const status = statusMessages[student.id];

              return (
                <div
                  key={student.id}
                  className={`bg-white dark:bg-slate-800/90 rounded-2xl p-4 sm:p-5 border transition-all ${
                    isEdited
                      ? "border-amber-400 ring-2 ring-amber-400/20 shadow-md"
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Student Info */}
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-700/80 border border-slate-200 dark:border-slate-600 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 text-sm shrink-0">
                        {student.firstName[0]}
                        {student.lastName ? student.lastName[0] : ""}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900 dark:text-white text-base">
                            {student.name}
                          </h4>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                            #{student.rollNumber}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>Adm: {student.admissionNo}</span>
                          <span>•</span>
                          <span>Parent: {student.parentName}</span>
                        </div>
                      </div>
                    </div>

                    {/* Date Input & Save */}
                    <div className="flex flex-wrap items-center gap-3 self-end sm:self-center w-full sm:w-auto">
                      <div className="flex-1 sm:flex-initial">
                        <input
                          type="date"
                          value={draftVal !== undefined ? draftVal : student.dateOfBirth || ""}
                          onChange={(e) => handleDateChange(student.id, e.target.value)}
                          max={new Date().toISOString().split("T")[0]}
                          className={`w-full sm:w-48 px-3 py-2 text-sm rounded-xl border focus:outline-none font-medium transition-all ${
                            student.hasDob && !isEdited
                              ? "bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                              : isEdited
                              ? "bg-amber-50 dark:bg-amber-950/30 border-amber-400 text-amber-900 dark:text-amber-200"
                              : "bg-orange-50/50 dark:bg-orange-950/20 border-orange-300 dark:border-orange-800 text-orange-900 dark:text-orange-200"
                          }`}
                        />
                      </div>

                      {/* Row Save button */}
                      {isEdited && (
                        <button
                          onClick={() => handleSaveSingle(student.id)}
                          disabled={isPending}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all active:scale-95 flex items-center gap-1.5 shadow-sm"
                        >
                          <Check size={14} />
                          <span>Save</span>
                        </button>
                      )}

                      {!student.hasDob && !isEdited && (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 flex items-center gap-1">
                          <AlertCircle size={12} />
                          <span>Missing</span>
                        </span>
                      )}

                      {student.hasDob && !isEdited && (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                          <Check size={12} />
                          <span>Saved</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Feedback Message Banner */}
                  {status && (
                    <div
                      className={`mt-3 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                        status.type === "success"
                          ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200"
                          : status.type === "pending"
                          ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200"
                          : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200"
                      }`}
                    >
                      {status.type === "success" && <CheckCircle2 size={14} />}
                      {status.type === "pending" && <Clock size={14} />}
                      {status.type === "error" && <XCircle size={14} />}
                      <span>{status.text}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Admin Audit Log Tab */}
      {activeTab === "audit" && userRole === "ADMIN" && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Date of Birth Change Requests</h3>
              <p className="text-xs text-slate-500 mt-0.5">Approve or reject teacher date modification requests.</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
              {adminLogs.filter((l) => l.status === "PENDING_APPROVAL").length} Pending
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {adminLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">No change requests recorded.</div>
            ) : (
              adminLogs.map((log) => (
                <div key={log.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">{log.personName}</span>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {log.personType}
                      </span>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          log.status === "APPROVED"
                            ? "bg-emerald-100 text-emerald-700"
                            : log.status === "PENDING_APPROVAL"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {log.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                      <span>Changed by: {log.changedByName}</span>
                      <span>•</span>
                      <span>From: {log.oldDateStr || "None"}</span>
                      <ArrowRight size={12} />
                      <span className="font-semibold text-slate-700 dark:text-slate-200">To: {log.newDateStr}</span>
                    </div>
                    {log.reason && <p className="text-xs text-slate-400 mt-1 italic">Reason: {log.reason}</p>}
                  </div>

                  {log.status === "PENDING_APPROVAL" && (
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => handleAdminApprovalDecision(log.id, "APPROVED")}
                        disabled={isPending}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all active:scale-95"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleAdminApprovalDecision(log.id, "REJECTED")}
                        disabled={isPending}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all active:scale-95"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Sticky Bottom Bar for Multi-Save */}
      {changedCount > 0 && (
        <div className="fixed bottom-16 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-700 z-40 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4">
          <div>
            <div className="font-bold text-sm text-white">{changedCount} unsaved date changes</div>
            <div className="text-xs text-slate-400">Save all changes at once</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDraftDates({})}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white font-medium"
            >
              Discard
            </button>
            <button
              onClick={handleSaveAll}
              disabled={isPending}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all shadow-md active:scale-95 flex items-center gap-1.5"
            >
              <Check size={14} />
              <span>Save All</span>
            </button>
          </div>
        </div>
      )}

      {/* Excel Upload Modal */}
      {isExcelModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl relative">
            <button
              onClick={() => {
                setIsExcelModalOpen(false);
                setExcelPreview(null);
                setExcelFile(null);
              }}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-full"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">Fill Dates from Excel</h3>
                <p className="text-xs text-slate-500">Upload class mark sheet or student register</p>
              </div>
            </div>

            {!excelPreview ? (
              <form onSubmit={handleExcelPreview} className="space-y-4">
                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center hover:border-amber-500 transition-colors cursor-pointer">
                  <Upload size={32} className="mx-auto text-slate-400 mb-2" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {excelFile ? excelFile.name : "Choose an Excel or CSV file"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Columns recognized: Roll No, Admission No, Student Name, Date of Birth / DOB.
                  </p>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
                    className="mt-3 text-xs text-slate-500 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsExcelModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!excelFile || isUploading}
                    className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isUploading ? "Reading file..." : "Preview Matches"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
                  <div>
                    <span className="font-bold text-emerald-600">{excelPreview.valid.length} updates found</span>
                    <span className="text-slate-400 mx-2">•</span>
                    <span className="text-slate-500">{excelPreview.unchanged.length} already match</span>
                  </div>
                  {excelPreview.errors.length > 0 && (
                    <span className="text-rose-600 font-semibold">{excelPreview.errors.length} unmatched</span>
                  )}
                </div>

                {/* Preview List */}
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {excelPreview.valid.map((v) => (
                    <div
                      key={v.studentId}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">{v.studentName}</div>
                        <div className="text-slate-400 text-[11px]">Roll #{v.rollNumber}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-emerald-600 dark:text-emerald-400">{v.newDob}</div>
                        {v.oldDob && <div className="text-[10px] text-slate-400 line-through">{v.oldDob}</div>}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setExcelPreview(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleExcelCommit}
                    disabled={isUploading || excelPreview.valid.length === 0}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Check size={14} />
                    <span>Apply {excelPreview.valid.length} Updates</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
