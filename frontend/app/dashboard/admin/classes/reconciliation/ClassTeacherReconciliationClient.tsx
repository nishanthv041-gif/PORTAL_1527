"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import {
  ClassReconciliationItem,
  reconcileClassTeacherAction,
} from "@/backend/api/actions/dashboard/admin/classes/classTeacherActions";

interface Props {
  initialData: {
    classes: ClassReconciliationItem[];
    unassignedCount: number;
    discrepancyCount: number;
    matchedCount: number;
    availableTeachers: Array<{ id: string; name: string; email: string }>;
  };
}

export default function ClassTeacherReconciliationClient({ initialData }: Props) {
  const [classes, setClasses] = useState(initialData.classes);
  const [filter, setFilter] = useState<"all" | "attention" | "matched">("attention");
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [selectedTeacherMap, setSelectedTeacherMap] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const filteredClasses = classes.filter((c) => {
    if (filter === "attention") return c.status !== "MATCH";
    if (filter === "matched") return c.status === "MATCH";
    return true;
  });

  const handleConfirm = async (classId: string, teacherId: string | null) => {
    setLoadingMap((prev) => ({ ...prev, [classId]: true }));
    try {
      const res = await reconcileClassTeacherAction(classId, teacherId);
      setFeedback({ message: res.message, type: "success" });
      setTimeout(() => setFeedback(null), 5000);

      // Optimistically update class state
      setClasses((prev) =>
        prev.map((c) => {
          if (c.id === classId) {
            const teacherObj = initialData.availableTeachers.find((t) => t.id === teacherId);
            return {
              ...c,
              sourceBTeacherId: teacherId,
              sourceBTeacherName: teacherObj?.name || null,
              sourceATeacherId: teacherId,
              sourceATeacherName: teacherObj?.name || null,
              status: "MATCH",
              suggestedAction: "IN_SYNC",
            };
          }
          return c;
        })
      );
    } catch (err: unknown) {
      setFeedback({
        message: err instanceof Error ? err.message : "Failed to update Class Teacher.",
        type: "error",
      });
    } finally {
      setLoadingMap((prev) => ({ ...prev, [classId]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Class Teacher Authority &amp; Reconciliation Check
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Ensure each class section has a single canonical Class Teacher for attendance, report cards, and birthday celebrations.
              </p>
            </div>
          </div>

          <Link
            href="/dashboard/admin/classes"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold min-h-[44px] transition-colors self-start sm:self-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Classes &amp; Sections</span>
          </Link>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mt-6 p-4 rounded-2xl border text-xs sm:text-sm flex items-center gap-3 ${
              feedback.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
            <div className="text-xs text-slate-500 dark:text-slate-400">Total Sections</div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {classes.length}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60">
            <div className="text-xs text-emerald-700 dark:text-emerald-400">Properly Linked</div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
              {classes.filter((c) => c.status === "MATCH").length}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60">
            <div className="text-xs text-amber-700 dark:text-amber-400">Needs Confirmation</div>
            <div className="text-xl sm:text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">
              {classes.filter((c) => c.status === "A_ONLY" || c.status === "CONFLICT").length}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
            <div className="text-xs text-slate-500 dark:text-slate-400">Unassigned</div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {classes.filter((c) => c.status === "BOTH_EMPTY").length}
            </div>
          </div>
        </div>
      </div>

      {/* Class 2 - A Highlight Banner if not yet confirmed */}
      {classes.find((c) => c.name === "Class 2" && c.section === "A" && c.status === "A_ONLY") && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent rounded-3xl p-6 border border-amber-500/30 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Class 2 - A Assignment Recommendation
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  Teacher <strong>MOUNITHA V</strong> teaches Mathematics in Class 2 - A (3 students). She was assigned in Classes &amp; Sections, but requires confirmation to become the canonical Class Teacher.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={loadingMap["cmuti0fso0001oedfi2j2xd52"]}
              onClick={() => {
                const c2a = classes.find((c) => c.name === "Class 2" && c.section === "A");
                if (c2a?.sourceATeacherId) {
                  handleConfirm(c2a.id, c2a.sourceATeacherId);
                }
              }}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition-all active:scale-98 min-h-[44px] shrink-0"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm MOUNITHA V as Class Teacher</span>
            </button>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter("attention")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold min-h-[44px] transition-all ${
            filter === "attention"
              ? "bg-amber-500 text-slate-950 shadow-sm"
              : "bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
          }`}
        >
          Needs Attention ({classes.filter((c) => c.status !== "MATCH").length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("matched")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold min-h-[44px] transition-all ${
            filter === "matched"
              ? "bg-amber-500 text-slate-950 shadow-sm"
              : "bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
          }`}
        >
          Properly Linked ({classes.filter((c) => c.status === "MATCH").length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold min-h-[44px] transition-all ${
            filter === "all"
              ? "bg-amber-500 text-slate-950 shadow-sm"
              : "bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
          }`}
        >
          All Classes ({classes.length})
        </button>
      </div>

      {/* Classes Table / Cards */}
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-3xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-lg">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredClasses.map((item) => {
            const isLoading = loadingMap[item.id];
            const currentSelected = selectedTeacherMap[item.id] !== undefined
              ? selectedTeacherMap[item.id]
              : item.sourceBTeacherId || item.sourceATeacherId || "";

            return (
              <div
                key={item.id}
                className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-bold text-base text-slate-900 dark:text-white">
                      {item.displayName}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {item.studentCount} {item.studentCount === 1 ? "student" : "students"}
                    </span>
                    {item.status === "MATCH" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>In Sync</span>
                      </span>
                    )}
                    {item.status === "A_ONLY" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Assigned in Classes only</span>
                      </span>
                    )}
                    {item.status === "CONFLICT" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Conflict: Different Teachers</span>
                      </span>
                    )}
                    {item.status === "BOTH_EMPTY" && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500">
                        Unassigned
                      </span>
                    )}
                  </div>

                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-4">
                    <span>
                      Classes &amp; Sections Teacher:{" "}
                      <strong className="text-slate-700 dark:text-slate-300">
                        {item.sourceATeacherName || "None"}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Canonical Class Teacher:{" "}
                      <strong className="text-slate-700 dark:text-slate-300">
                        {item.sourceBTeacherName || "None"}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                  {item.suggestedAction === "CONFIRM_A" && item.sourceATeacherId && (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleConfirm(item.id, item.sourceATeacherId)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-all min-h-[44px]"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm {item.sourceATeacherName}</span>
                    </button>
                  )}

                  <div className="flex items-center gap-2">
                    <select
                      value={currentSelected}
                      onChange={(e) => setSelectedTeacherMap((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      className="text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    >
                      <option value="">-- No Class Teacher --</option>
                      {initialData.availableTeachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={isLoading || currentSelected === (item.sourceBTeacherId || "")}
                      onClick={() => handleConfirm(item.id, currentSelected || null)}
                      className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-950 font-bold text-xs min-h-[44px] transition-all disabled:opacity-40"
                    >
                      {isLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <span>Save</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

