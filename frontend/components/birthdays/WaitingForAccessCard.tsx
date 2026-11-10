"use client";

import React, { useState } from "react";
import Link from "next/link";
import { GraduationCap, ArrowLeft, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { submitClassTeacherRequestAction } from "@/backend/api/actions/dashboard/teacher/classTeacherRequestActions";
import type { TeacherClass } from "@/lib/teacher/getTeacherClasses";

interface WaitingForAccessCardProps {
  taughtClasses: TeacherClass[];
  pendingClassIds?: string[];
  canViewBirthdays?: boolean;
}

export default function WaitingForAccessCard({
  taughtClasses = [],
  pendingClassIds = [],
  canViewBirthdays = false,
}: WaitingForAccessCardProps) {
  const [pendingMap, setPendingMap] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    pendingClassIds.forEach((id) => {
      init[id] = true;
    });
    return init;
  });
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleRequest = async (classId: string, className: string) => {
    setLoadingMap((prev) => ({ ...prev, [classId]: true }));
    try {
      const res = await submitClassTeacherRequestAction(classId);
      if (res.isPending || res.success) {
        setPendingMap((prev) => ({ ...prev, [classId]: true }));
        setSuccessMessage(`Request submitted for ${className}. School administrator will be notified.`);
        setTimeout(() => setSuccessMessage(null), 5000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [classId]: false }));
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8 sm:py-12">
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xl text-left">
        {/* Header Icon + Title */}
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              You&apos;re not set as a class teacher yet
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
              Student Date of Birth records and classroom birthday celebrations are managed by each section&apos;s designated Class Teacher.
            </p>
          </div>
        </div>

        {successMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-sm flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Classes List */}
        <div className="mt-6 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Your Assigned Classes ({taughtClasses.length})
          </h2>

          {taughtClasses.length === 0 ? (
            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                No classes are currently assigned to your teacher profile. Please contact the school administrator.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {taughtClasses.map((cls) => {
                const isPending = pendingMap[cls.classId];
                const isLoading = loadingMap[cls.classId];
                const subjectsText = cls.subjects && cls.subjects.length > 0 ? cls.subjects.join(", ") : "Class Subjects";

                return (
                  <div
                    key={cls.classId}
                    className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-slate-300 dark:hover:border-slate-600"
                  >
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="font-bold text-base text-slate-900 dark:text-white">
                          {cls.displayName}
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          {cls.isClassTeacher ? "Class Teacher" : "Subject Teacher"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {subjectsText} · {cls.studentCount} {cls.studentCount === 1 ? "student" : "students"}
                      </p>
                    </div>

                    {!cls.isClassTeacher && (
                      <div className="shrink-0">
                        {isPending ? (
                          <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                            <Clock className="w-4 h-4 animate-spin text-amber-500" />
                            <span>Request Pending</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => handleRequest(cls.classId, cls.displayName)}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-bold text-xs shadow-sm transition-all min-h-[44px]"
                          >
                            <Sparkles className="w-4 h-4" />
                            <span>{isLoading ? "Submitting..." : `Ask Admin for ${cls.displayName}`}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* View-Only Option if enabled */}
        {canViewBirthdays && (
          <div className="mt-6 pt-5 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              You have view-only access to see today&apos;s celebrants in the classes you teach.
            </p>
            <Link
              href="/dashboard/teacher/birthdays"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold min-h-[44px] transition-colors"
            >
              <span>See Today&apos;s Birthdays</span>
            </Link>
          </div>
        )}

        {/* Footer Back Link */}
        <div className="mt-6 pt-5 border-t border-slate-200/80 dark:border-slate-800 flex justify-between items-center text-xs">
          <Link
            href="/dashboard/teacher"
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white font-medium py-2 min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
          <span className="text-slate-400 dark:text-slate-500">
            SRT School Portal
          </span>
        </div>
      </div>
    </div>
  );
}

