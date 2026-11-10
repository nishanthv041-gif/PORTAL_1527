"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  Calendar,
  Sparkles,
  Download,
  MessageSquare,
  Send,
  Check,
  CheckCircle2,
  Clock,
  AlertCircle,
  Phone,
  ChevronRight,
  Smile,
  X,
} from "lucide-react";
import {
  PartyPopperIcon as PartyPopper,
  Share2Icon as Share2,
} from "@/frontend/components/birthdays/BirthdayIcons";
import {
  BirthdayCelebrantItem,
  sendClassTeacherPersonalNoteAction,
  triggerSendNowForStudentAction,
} from "@/backend/api/actions/dashboard/admin/birthdays/actions";
import { TeacherClass } from "@/lib/teacher/getTeacherClasses";

interface BirthdayWishesStudioProps {
  userRole: "ADMIN" | "TEACHER";
  classes: TeacherClass[];
  selectedClassId: string;
  className: string;
  todayCelebrants: BirthdayCelebrantItem[];
  upcoming7Days: BirthdayCelebrantItem[];
  upcoming30Days: BirthdayCelebrantItem[];
  totalCelebrantsThisMonth: number;
  missingDobCount: number;
  totalStudents: number;
  settings: {
    whatsappShortcut: boolean;
    teacherCanEditExistingDob: boolean;
    notifyClassTeacher: boolean;
  };
  isClassTeacher?: boolean;
  onClassChange?: (classId: string) => void;
}

export default function BirthdayWishesStudio({
  userRole,
  classes,
  selectedClassId,
  className,
  todayCelebrants,
  upcoming7Days,
  upcoming30Days,
  totalCelebrantsThisMonth,
  missingDobCount,
  totalStudents,
  settings,
  isClassTeacher = true,
  onClassChange,
}: BirthdayWishesStudioProps) {
  const [activeTab, setActiveTab] = useState<"today" | "upcoming">("today");
  const [upcomingFilter, setUpcomingFilter] = useState<"7days" | "30days">("7days");
  const [currentClassId, setCurrentClassId] = useState(selectedClassId);
  const [isPending, startTransition] = useTransition();

  // Note Modal state
  const [activeNoteStudent, setActiveNoteStudent] = useState<BirthdayCelebrantItem | null>(null);
  const [noteMessage, setNoteMessage] = useState("");
  const [noteSending, setNoteSending] = useState(false);
  const [localNotes, setLocalNotes] = useState<{ [studentId: string]: string }>({});

  const displayedUpcoming = upcomingFilter === "7days" ? upcoming7Days : upcoming30Days;

  const quickTemplates = [
    "Wishing you a joyful birthday, dear {name}! Keep shining and learning with enthusiasm. 🌟",
    "Happy Birthday, {name}! May this year bring you great happiness, health, and success! 🎈",
    "Have a wonderful celebration today, {name}! We are so proud to have you in our class. 🎂",
  ];

  const handleOpenNoteModal = (celebrant: BirthdayCelebrantItem) => {
    setActiveNoteStudent(celebrant);
    setNoteMessage(localNotes[celebrant.id] || celebrant.teacherNote || "");
  };

  const handleSendNote = async () => {
    if (!activeNoteStudent || !noteMessage.trim()) return;

    setNoteSending(true);
    try {
      const res = await sendClassTeacherPersonalNoteAction({
        studentId: activeNoteStudent.id,
        classId: currentClassId,
        message: noteMessage.trim(),
      });

      if (res.error) {
        alert(res.error);
      } else {
        setLocalNotes((prev) => ({
          ...prev,
          [activeNoteStudent.id]: noteMessage.trim(),
        }));
        setActiveNoteStudent(null);
        setNoteMessage("");
      }
    } catch (err: any) {
      alert(err?.message || "Failed to send note.");
    } finally {
      setNoteSending(false);
    }
  };

  const handleForceSendNow = (studentId: string) => {
    startTransition(async () => {
      const res = await triggerSendNowForStudentAction({
        studentId,
        classId: currentClassId,
      });
      alert(res.message);
    });
  };

  const buildWhatsAppLink = (celebrant: BirthdayCelebrantItem) => {
    if (!celebrant.parentPhone) return "#";
    const cleanPhone = celebrant.parentPhone.replace(/[^0-9]/g, "");
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const text = encodeURIComponent(
      `Dear Parent, wishing ${celebrant.name} a very Happy Birthday from all of us at SRT School! 🎂🎉`
    );
    return `https://wa.me/${formattedPhone}?text=${text}`;
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Top Banner Card */}
      <div className="bg-gradient-to-r from-amber-900 via-rose-950 to-slate-900 rounded-3xl p-5 sm:p-7 text-white shadow-xl relative overflow-hidden border border-amber-900/40">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-amber-400/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-xs font-semibold mb-2">
              <PartyPopper size={14} className="text-amber-400" />
              <span>Universal Birthday Greetings</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Birthday Wishes &amp; Celebrations</h1>
            <p className="text-amber-100/80 text-sm mt-1 max-w-xl">
              Automatic greetings from SRT School are sent to celebrating students and parents. Add personal teacher messages and download notice board lists.
            </p>
          </div>

          {/* Actions & Switcher */}
          <div className="flex flex-wrap items-center gap-3">
            {classes.length > 1 && (
              <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-700">
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

            <a
              href={`/api/pdf/birthdays?classId=${currentClassId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-all border border-white/20 shadow-sm active:scale-95"
            >
              <Download size={15} />
              <span>Notice Board PDF</span>
            </a>

            {missingDobCount > 0 && (
              <Link
                href={
                  userRole === "ADMIN"
                    ? `/dashboard/admin/birthdays/missing?view=class&classId=${currentClassId}`
                    : `/dashboard/teacher/birthdays/missing?classId=${currentClassId}`
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all shadow-md active:scale-95"
              >
                <AlertCircle size={14} />
                <span>{missingDobCount} Missing Dates</span>
              </Link>
            )}
          </div>
        </div>

        {/* Quick Highlights Bar */}
        <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
            <div className="text-2xl font-bold text-amber-300">{todayCelebrants.length}</div>
            <div className="text-xs text-amber-100/70">Celebrating Today 🎂</div>
          </div>
          <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
            <div className="text-2xl font-bold text-white">{upcoming7Days.length}</div>
            <div className="text-xs text-amber-100/70">Next 7 Days 🎈</div>
          </div>
          <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
            <div className="text-2xl font-bold text-white">{totalCelebrantsThisMonth}</div>
            <div className="text-xs text-amber-100/70">This Month 📅</div>
          </div>
          <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
            <div className="text-2xl font-bold text-white">
              {totalStudents > 0 ? Math.round(((totalStudents - missingDobCount) / totalStudents) * 100) : 100}%
            </div>
            <div className="text-xs text-amber-100/70">DOB Completion ✨</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab("today")}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === "today"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            <span>Today&apos;s Birthdays</span>
            {todayCelebrants.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-bold text-[11px] flex items-center justify-center">
                {todayCelebrants.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("upcoming")}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === "upcoming"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            <span>Coming Up</span>
            <span className="text-xs px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 font-semibold text-slate-700 dark:text-slate-300">
              {upcoming7Days.length + upcoming30Days.length}
            </span>
          </button>
        </div>

        {activeTab === "upcoming" && (
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setUpcomingFilter("7days")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                upcomingFilter === "7days"
                  ? "bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Next 7 Days ({upcoming7Days.length})
            </button>
            <button
              onClick={() => setUpcomingFilter("30days")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                upcomingFilter === "30days"
                  ? "bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Next 30 Days ({upcoming30Days.length})
            </button>
          </div>
        )}
      </div>

      {/* TODAY TAB */}
      {activeTab === "today" && (
        <div className="space-y-4">
          {todayCelebrants.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-800/60 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center mb-3">
                <PartyPopper size={30} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                No Birthdays in {className} Today
              </h3>
              <p className="text-slate-500 text-xs sm:text-sm mt-1 max-w-sm mx-auto">
                {upcoming7Days.length > 0
                  ? `The next birthday celebration in this class is ${upcoming7Days[0].name} in ${upcoming7Days[0].daysUntil} day${
                      upcoming7Days[0].daysUntil > 1 ? "s" : ""
                    } (${upcoming7Days[0].birthdayFormatted}).`
                  : "Check the 'Coming Up' tab or download the notice board list for the full classroom calendar."}
              </p>
            </div>
          ) : (
            todayCelebrants.map((celebrant) => {
              const personalNote = localNotes[celebrant.id] || celebrant.teacherNote;

              return (
                <div
                  key={celebrant.id}
                  className="bg-white dark:bg-slate-800 rounded-3xl p-5 sm:p-6 border-2 border-amber-300 dark:border-amber-500/30 shadow-md relative overflow-hidden"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    {/* Celebrant Info */}
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-rose-400 text-slate-950 font-extrabold text-lg flex items-center justify-center shrink-0 shadow-sm">
                        {celebrant.name[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                            {celebrant.name}
                          </h3>
                          <span className="text-xs px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300 font-semibold">
                            Roll #{celebrant.rollNumber}
                          </span>
                        </div>
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-0.5 flex items-center gap-1.5">
                          <PartyPopper size={14} />
                          <span>Birthday Today ({celebrant.birthdayFormatted}) 🎂</span>
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Parent: {celebrant.parentName} {celebrant.parentPhone ? `• ${celebrant.parentPhone}` : ""}
                        </p>
                      </div>
                    </div>

                    {/* Delivery Status Badges */}
                    <div className="flex flex-wrap items-center gap-2 self-start">
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 size={13} />
                        <span>SRT School Wish Sent</span>
                      </span>

                      {celebrant.hasPortalAccount ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          <Check size={12} />
                          <span>Parent Notified</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400">
                          <Clock size={12} />
                          <span>No Portal Account</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Personal Teacher Note Bubble */}
                  {personalNote && (
                    <div className="mt-4 p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 flex items-start gap-3">
                      <MessageSquare size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-xs font-bold text-amber-900 dark:text-amber-300">
                          Your Personal Birthday Note:
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 italic">
                          &quot;{personalNote}&quot;
                        </p>
                      </div>
                      <button
                        onClick={() => handleOpenNoteModal(celebrant)}
                        className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline shrink-0"
                      >
                        Edit
                      </button>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-3">
                    {isClassTeacher ? (
                      <>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenNoteModal(celebrant)}
                            className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-semibold text-xs transition-all active:scale-95 flex items-center gap-1.5"
                          >
                            <MessageSquare size={14} />
                            <span>{personalNote ? "Edit My Note" : "Add My Personal Message"}</span>
                          </button>

                          {settings.whatsappShortcut && celebrant.parentPhone && (
                            <a
                              href={buildWhatsAppLink(celebrant)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all active:scale-95 flex items-center gap-1.5 shadow-sm"
                            >
                              <Share2 size={13} />
                              <span>Wish on WhatsApp</span>
                            </a>
                          )}
                        </div>

                        <button
                          onClick={() => handleForceSendNow(celebrant.id)}
                          disabled={isPending}
                          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-medium"
                        >
                          Resend Notification
                        </button>
                      </>
                    ) : (
                      <div className="text-xs text-slate-500 dark:text-slate-400 italic">
                        View-only mode: Classroom birthday greetings and messages are managed by the section&apos;s Class Teacher.
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* UPCOMING TAB */}
      {activeTab === "upcoming" && (
        <div className="space-y-3">
          {displayedUpcoming.length === 0 ? (
            <div className="text-center py-10 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6">
              <Calendar size={28} className="mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                No birthdays in the next {upcomingFilter === "7days" ? "7" : "30"} days.
              </p>
            </div>
          ) : (
            displayedUpcoming.map((st) => (
              <div
                key={st.id}
                className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 text-sm">
                    {st.name[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">{st.name}</span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        #{st.rollNumber}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Parent: {st.parentName}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
                    {st.birthdayFormatted}
                  </div>
                  <div className="text-xs text-slate-500">
                    {st.daysUntil === 1 ? "Tomorrow" : `in ${st.daysUntil} days`}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Personal Note Modal / Bottom Sheet */}
      {activeNoteStudent && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl relative">
            <button
              onClick={() => setActiveNoteStudent(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                <MessageSquare size={20} />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Add Personal Note for {activeNoteStudent.name}
                </h3>
                <p className="text-xs text-slate-500">Sent directly to student &amp; parent notification inbox</p>
              </div>
            </div>

            {/* Quick Templates */}
            <div className="space-y-1.5 mb-3">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Quick Templates
              </label>
              <div className="space-y-1">
                {quickTemplates.map((t, idx) => {
                  const rendered = t.replace(/{name}/g, activeNoteStudent.firstName);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setNoteMessage(rendered)}
                      className="w-full text-left text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/30 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                    >
                      &quot;{rendered}&quot;
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Your Message</label>
                <span className="text-[11px] text-slate-400">{noteMessage.length} / 200</span>
              </div>
              <textarea
                value={noteMessage}
                onChange={(e) => setNoteMessage(e.target.value.slice(0, 200))}
                rows={3}
                placeholder="Write a warm birthday greeting..."
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-slate-900 dark:text-white resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveNoteStudent(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendNote}
                disabled={noteSending || !noteMessage.trim()}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Send size={14} />
                <span>{noteSending ? "Sending..." : "Send Note"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
