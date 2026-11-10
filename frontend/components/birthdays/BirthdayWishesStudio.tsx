"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  Calendar,
  Download,
  MessageSquare,
  Send,
  Check,
  CheckCircle2,
  Clock,
  AlertCircle,
  Phone,
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
import styles from "./BirthdayStudio.module.css";

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

  // Resend state
  const [resendingMap, setResendingMap] = useState<{ [studentId: string]: boolean }>({});
  const [resendSuccessMap, setResendSuccessMap] = useState<{ [studentId: string]: boolean }>({});

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

      if (res.success) {
        setLocalNotes((prev) => ({
          ...prev,
          [activeNoteStudent.id]: noteMessage.trim(),
        }));
        setActiveNoteStudent(null);
        setNoteMessage("");
      } else {
        alert(res.error || "Failed to save message.");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to save personal note.");
    } finally {
      setNoteSending(false);
    }
  };

  const handleResendWish = async (celebrant: BirthdayCelebrantItem) => {
    setResendingMap((prev) => ({ ...prev, [celebrant.id]: true }));
    try {
      const res = await triggerSendNowForStudentAction({
        studentId: celebrant.id,
        classId: currentClassId,
      });
      if (res.success) {
        setResendSuccessMap((prev) => ({ ...prev, [celebrant.id]: true }));
        setTimeout(() => {
          setResendSuccessMap((prev) => ({ ...prev, [celebrant.id]: false }));
        }, 4000);
      } else {
        alert(res.message || "Failed to send greeting.");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to trigger greeting.");
    } finally {
      setResendingMap((prev) => ({ ...prev, [celebrant.id]: false }));
    }
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

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const completionPercent = totalStudents > 0 
    ? Math.round(((totalStudents - missingDobCount) / totalStudents) * 100) 
    : 100;

  return (
    <div className={styles.container}>
      {/* Hero Celebration Banner */}
      <section className={styles.heroBanner}>
        <div className={styles.heroContent}>
          <div className={styles.heroText}>
            <div className={styles.badgePill}>
              <PartyPopper size={14} />
              <span>SRT Public School • Celebrations</span>
            </div>
            <h1 className={styles.heroTitle}>Birthday Wishes &amp; Celebrations</h1>
            <p className={styles.heroSubtitle}>
              Celebrate student birthdays across your classroom with official SRT greetings, personal teacher notes, and printable notice board schedules.
            </p>
          </div>

          <div className={styles.heroActions}>
            {classes.length > 1 && (
              <div className={styles.classSelectWrapper}>
                <span className={styles.classSelectLabel}>Class:</span>
                <select
                  value={currentClassId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setCurrentClassId(newId);
                    if (onClassChange) onClassChange(newId);
                  }}
                  className={styles.classSelect}
                >
                  {classes.map((c) => (
                    <option key={c.classId} value={c.classId}>
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
              className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
            >
              <Download size={16} />
              <span>Notice Board PDF</span>
            </a>

            {missingDobCount > 0 && (
              <Link
                href={
                  userRole === "ADMIN"
                    ? `/dashboard/admin/birthdays/missing?view=class&classId=${currentClassId}`
                    : `/dashboard/teacher/birthdays/missing?classId=${currentClassId}`
                }
                prefetch={true}
                className={`${styles.actionBtn} ${styles.actionBtnWarning}`}
              >
                <AlertCircle size={16} />
                <span>{missingDobCount} Missing Dates</span>
              </Link>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={`${styles.statValue} ${styles.statValueGold}`}>{todayCelebrants.length}</span>
            <span className={styles.statLabel}>Celebrating Today 🎂</span>
          </div>
          <div className={styles.statCard}>
            <span className={`${styles.statValue} ${styles.statValueBlue}`}>{upcoming7Days.length}</span>
            <span className={styles.statLabel}>Next 7 Days 🎈</span>
          </div>
          <div className={styles.statCard}>
            <span className={`${styles.statValue} ${styles.statValueIndigo}`}>{totalCelebrantsThisMonth}</span>
            <span className={styles.statLabel}>This Month 📅</span>
          </div>
          <div className={styles.statCard}>
            <span className={`${styles.statValue} ${styles.statValueEmerald}`}>{completionPercent}%</span>
            <span className={styles.statLabel}>Directory Completed</span>
          </div>
        </div>
      </section>

      {/* Tabs Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <div className={styles.tabBar}>
          <button
            onClick={() => startTransition(() => setActiveTab("today"))}
            className={`${styles.tabBtn} ${activeTab === "today" ? styles.tabBtnActive : ""}`}
          >
            <span>Today&apos;s Birthdays</span>
            {todayCelebrants.length > 0 && (
              <span className={`${styles.tabBadge} ${activeTab === "today" ? "" : styles.tabBadgeAlert}`}>
                {todayCelebrants.length}
              </span>
            )}
          </button>
          <button
            onClick={() => startTransition(() => setActiveTab("upcoming"))}
            className={`${styles.tabBtn} ${activeTab === "upcoming" ? styles.tabBtnActive : ""}`}
          >
            <span>Upcoming</span>
            <span className={styles.tabBadge}>
              {upcoming7Days.length + upcoming30Days.length}
            </span>
          </button>
        </div>

        {activeTab === "upcoming" && (
          <div className={styles.tabBar}>
            <button
              onClick={() => startTransition(() => setUpcomingFilter("7days"))}
              className={`${styles.tabBtn} ${upcomingFilter === "7days" ? styles.tabBtnActive : ""}`}
              style={{ fontSize: "0.785rem", padding: "0.4rem 0.75rem", minHeight: "34px" }}
            >
              Next 7 Days ({upcoming7Days.length})
            </button>
            <button
              onClick={() => startTransition(() => setUpcomingFilter("30days"))}
              className={`${styles.tabBtn} ${upcomingFilter === "30days" ? styles.tabBtnActive : ""}`}
              style={{ fontSize: "0.785rem", padding: "0.4rem 0.75rem", minHeight: "34px" }}
            >
              Next 30 Days ({upcoming30Days.length})
            </button>
          </div>
        )}
      </div>

      {/* TODAY CELEBRATIONS */}
      {activeTab === "today" && (
        <>
          {todayCelebrants.length === 0 ? (
            <div className={styles.emptyState}>
              <div style={{ fontSize: "2.5rem" }}>🎂</div>
              <h3 className={styles.emptyTitle}>No Birthdays in {className} Today</h3>
              <p className={styles.emptyDesc}>
                {upcoming7Days.length > 0
                  ? `The next birthday celebration in this class is ${upcoming7Days[0].name} in ${upcoming7Days[0].daysUntil} day${upcoming7Days[0].daysUntil > 1 ? "s" : ""}.`
                  : "All birthday wishes for this month will appear here when their special day arrives."}
              </p>
            </div>
          ) : (
            <div className={styles.cardsGrid}>
              {todayCelebrants.map((celebrant) => {
                const note = localNotes[celebrant.id] || celebrant.teacherNote;
                const isResending = resendingMap[celebrant.id];
                const resendSuccess = resendSuccessMap[celebrant.id];

                return (
                  <div key={celebrant.id} className={`${styles.celebrantCard} ${styles.celebrantCardToday}`}>
                    <div className={styles.celebrantHeader}>
                      <div className={styles.avatarCircle}>{getInitials(celebrant.name)}</div>
                      <div className={styles.celebrantMeta}>
                        <h3 className={styles.celebrantName}>{celebrant.name}</h3>
                        <div className={styles.celebrantRoll}>Roll #{celebrant.rollNumber}</div>
                        <div style={{ marginTop: "0.35rem" }}>
                          <span className={styles.celebrationBadge}>
                            <span>🎂 Birthday Today ({celebrant.birthdayFormatted})</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Parent Info Row */}
                    <div className={styles.parentRow}>
                      <div className={styles.parentInfo}>
                        <span className={styles.parentLabel}>Parent / Guardian</span>
                        <span className={styles.parentName}>{celebrant.parentName}</span>
                      </div>
                      <div className={styles.contactActions}>
                        {settings.whatsappShortcut && celebrant.parentPhone && (
                          <a
                            href={buildWhatsAppLink(celebrant)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${styles.iconBtn} ${styles.iconBtnWhatsApp}`}
                            title="Send WhatsApp Greeting to Parent"
                          >
                            <Share2 size={16} />
                          </a>
                        )}
                        {celebrant.parentPhone && (
                          <a
                            href={`tel:${celebrant.parentPhone}`}
                            className={styles.iconBtn}
                            title={`Call parent (${celebrant.parentPhone})`}
                          >
                            <Phone size={16} />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Delivery Status */}
                    <div className={styles.statusRow}>
                      <span className={`${styles.statusPill} ${celebrant.wishSent ? styles.statusPillSuccess : ""}`}>
                        {celebrant.wishSent ? (
                          <>
                            <CheckCircle2 size={14} />
                            <span>SRT School Wish Sent</span>
                          </>
                        ) : (
                          <>
                            <Clock size={14} />
                            <span>Scheduled for Dispatch</span>
                          </>
                        )}
                      </span>

                      {note && (
                        <span className={`${styles.statusPill} ${styles.statusPillSuccess}`}>
                          <Check size={14} />
                          <span>Teacher Note Added</span>
                        </span>
                      )}
                    </div>

                    {/* Teacher Note Preview */}
                    {note && (
                      <div
                        style={{
                          padding: "0.75rem",
                          borderRadius: "10px",
                          background: "var(--primary-bg)",
                          border: "1px solid var(--border-color)",
                          fontSize: "0.825rem",
                          lineHeight: "1.4",
                        }}
                      >
                        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--primary)", marginBottom: "0.2rem" }}>
                          YOUR PERSONAL MESSAGE:
                        </div>
                        <em>&ldquo;{note}&rdquo;</em>
                      </div>
                    )}

                    {/* Card Actions */}
                    {isClassTeacher && (
                      <div className={styles.cardFooter}>
                        <button
                          onClick={() => handleOpenNoteModal(celebrant)}
                          className={styles.footerBtn}
                        >
                          <MessageSquare size={15} />
                          <span>{note ? "Edit Message" : "Add Personal Note"}</span>
                        </button>

                        <button
                          onClick={() => handleResendWish(celebrant)}
                          disabled={isResending}
                          className={`${styles.footerBtn} ${styles.footerBtnPrimary}`}
                        >
                          {isResending ? (
                            <>
                              <Clock size={14} className={styles.spin} />
                              <span>Sending...</span>
                            </>
                          ) : resendSuccess ? (
                            <>
                              <Check size={14} />
                              <span>Sent!</span>
                            </>
                          ) : (
                            <>
                              <Send size={14} />
                              <span>Resend Greeting</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* UPCOMING CELEBRATIONS */}
      {activeTab === "upcoming" && (
        <>
          {displayedUpcoming.length === 0 ? (
            <div className={styles.emptyState}>
              <div style={{ fontSize: "2.5rem" }}>🎈</div>
              <h3 className={styles.emptyTitle}>
                No Upcoming Birthdays in {upcomingFilter === "7days" ? "the Next 7 Days" : "the Next 30 Days"}
              </h3>
              <p className={styles.emptyDesc}>
                We will notify you and the student&apos;s parents when an upcoming birthday approaches.
              </p>
            </div>
          ) : (
            <div className={styles.cardsGrid}>
              {displayedUpcoming.map((celebrant) => (
                <div key={celebrant.id} className={styles.celebrantCard}>
                  <div className={styles.celebrantHeader}>
                    <div className={styles.avatarCircle}>{getInitials(celebrant.name)}</div>
                    <div className={styles.celebrantMeta}>
                      <h3 className={styles.celebrantName}>{celebrant.name}</h3>
                      <div className={styles.celebrantRoll}>Roll #{celebrant.rollNumber}</div>
                      <div style={{ marginTop: "0.35rem" }}>
                        <span className={styles.celebrationBadge}>
                          <span>
                            {celebrant.daysUntil === 1
                              ? "Tomorrow 🎈"
                              : `In ${celebrant.daysUntil} Days (${celebrant.birthdayFormatted})`}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.parentRow}>
                    <div className={styles.parentInfo}>
                      <span className={styles.parentLabel}>Parent / Guardian</span>
                      <span className={styles.parentName}>{celebrant.parentName}</span>
                    </div>
                    {celebrant.parentPhone && (
                      <a
                        href={`tel:${celebrant.parentPhone}`}
                        className={styles.iconBtn}
                        title={`Call parent (${celebrant.parentPhone})`}
                      >
                        <Phone size={16} />
                      </a>
                    )}
                  </div>

                  {isClassTeacher && (
                    <div className={styles.cardFooter}>
                      <button
                        onClick={() => handleOpenNoteModal(celebrant)}
                        className={styles.footerBtn}
                      >
                        <MessageSquare size={15} />
                        <span>Pre-write Birthday Note</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* PERSONAL NOTE MODAL */}
      {activeNoteStudent && (
        <div className={styles.modalOverlay} onClick={() => setActiveNoteStudent(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Personal Teacher Message</h3>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                  For {activeNoteStudent.name} (Roll #{activeNoteStudent.rollNumber})
                </div>
              </div>
              <button
                onClick={() => setActiveNoteStudent(null)}
                className={styles.iconBtn}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.4rem" }}>
                  QUICK CELEBRATION TEMPLATES:
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {quickTemplates.map((tpl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setNoteMessage(tpl.replace("{name}", activeNoteStudent.firstName))}
                      className={styles.templateChip}
                    >
                      {tpl.replace("{name}", activeNoteStudent.firstName)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.4rem" }}>
                  MESSAGE CONTENT:
                </label>
                <textarea
                  value={noteMessage}
                  onChange={(e) => setNoteMessage(e.target.value)}
                  placeholder="Type a warm birthday message to your student..."
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "0.85rem",
                    borderRadius: "12px",
                    border: "1px solid var(--border-color)",
                    background: "var(--input-bg, var(--card-bg))",
                    color: "var(--foreground)",
                    fontSize: "0.9rem",
                    lineHeight: "1.5",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                onClick={() => setActiveNoteStudent(null)}
                className={styles.footerBtn}
              >
                Cancel
              </button>
              <button
                onClick={handleSendNote}
                disabled={noteSending || !noteMessage.trim()}
                className={`${styles.footerBtn} ${styles.footerBtnPrimary}`}
              >
                {noteSending ? "Saving..." : "Save Message"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
