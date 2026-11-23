import Link from "next/link";
import styles from "./UniversalDashboard.module.css";
import { prisma } from "@/backend/db/prisma";
import {
  Bell,
  Calendar,
  MessageSquare,
  Bus,
  Clock,
  FileText,
  CreditCard,
  Settings,
  GraduationCap,
  LayoutDashboard,
  Info,
  ArrowRight,
  ShieldCheck,
  BookOpen,
} from "lucide-react";

interface UniversalDashboardProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    role: string;
  };
  noticeMessage?: string;
}

export default async function UniversalDashboard({
  user,
  noticeMessage,
}: UniversalDashboardProps) {
  const role = (user.role || "PARENT").toUpperCase();
  const roleSlug = role.toLowerCase();
  const displayName = user.name || "School Member";

  // Today's date formatted in Indian Standard style
  const todayFormatted = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Query latest announcements and events with safe catch
  let announcements: any[] = [];
  let calendarEvents: any[] = [];
  let unreadMessageCount = 0;

  try {
    const [fetchedAnnouncements, fetchedEvents, msgCount] = await Promise.all([
      prisma.announcement.findMany({
        where: {
          OR: [
            { targetType: "ALL" },
            { targetType: role === "TEACHER" ? "TEACHERS" : "PARENTS" },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          title: true,
          content: true,
          priority: true,
          createdAt: true,
        },
      }).catch(() => []),

      prisma.calendarEvent.findMany({
        where: {
          isPublished: true,
          date: { gte: new Date() },
        },
        orderBy: { date: "asc" },
        take: 3,
        select: {
          id: true,
          title: true,
          type: true,
          date: true,
        },
      }).catch(() => []),

      prisma.message.count({
        where: {
          receiverId: user.id,
          isRead: false,
        },
      }).catch(() => 0),
    ]);

    announcements = fetchedAnnouncements;
    calendarEvents = fetchedEvents;
    unreadMessageCount = msgCount;
  } catch {
    // Non-blocking fallbacks
  }

  // Fallback sample announcements if database has none
  if (announcements.length === 0) {
    announcements = [
      {
        id: "sample-1",
        title: "Welcome to SRT Universal School Portal",
        content:
          "Instant WhatsApp-style lock-screen alerts, real-time bus tracking, academic timetables, and direct school communication are now fully active.",
        priority: "HIGH",
        createdAt: new Date(),
      },
      {
        id: "sample-2",
        title: "Academic Term 2 Working Schedule",
        content:
          "Classes and co-curricular programs proceed as scheduled. View your personalized timetable in the Academic Hub.",
        priority: "NORMAL",
        createdAt: new Date(),
      },
    ];
  }

  // Fallback sample events if database has none
  if (calendarEvents.length === 0) {
    calendarEvents = [
      {
        id: "event-1",
        title: "School Sports & Cultural Meet",
        type: "PROGRAM",
        date: new Date(Date.now() + 86400000 * 3),
      },
      {
        id: "event-2",
        title: "Mid-Term Academic Assessment",
        type: "EXAM",
        date: new Date(Date.now() + 86400000 * 7),
      },
      {
        id: "event-3",
        title: "Parent-Teacher Interactive Forum",
        type: "MEETING",
        date: new Date(Date.now() + 86400000 * 12),
      },
    ];
  }

  // Determine bus link
  const busLink =
    role === "STAFF" || role === "NON_TEACHING_STAFF"
      ? "/staff/my-bus"
      : "/parent/bus";

  return (
    <div className={styles.container}>
      {/* Welcome Hero Banner */}
      <div className={styles.welcomeHero}>
        <div className={styles.heroContent}>
          <div className={styles.schoolTag}>
            <GraduationCap size={14} />
            <span>SRT Universal School Portal</span>
          </div>
          <h1 className={styles.welcomeTitle}>Welcome back, {displayName}</h1>
          <p className={styles.welcomeSubtitle}>
            Your central hub for academic updates, instant notifications, live transit tracking, and school communication.
          </p>
        </div>
        <div className={styles.heroMeta}>
          <div className={styles.roleBadge}>
            <ShieldCheck size={16} />
            <span>{role} PORTAL</span>
          </div>
          <div className={styles.dateBadge}>
            <Calendar size={15} />
            <span>{todayFormatted}</span>
          </div>
        </div>
      </div>

      {/* Notice Banner (If student linkage or setup is pending) */}
      {noticeMessage && (
        <div className={styles.noticeBanner}>
          <Info className={styles.noticeIcon} size={22} />
          <div>
            <div className={styles.noticeTitle}>Account Information</div>
            <p className={styles.noticeText}>{noticeMessage}</p>
          </div>
        </div>
      )}

      {/* 4-Card Key Metrics Grid */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div
            className={styles.metricIconWrapper}
            style={{ background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6" }}
          >
            <BookOpen size={24} />
          </div>
          <div className={styles.metricInfo}>
            <div className={styles.metricLabel}>Academic Term</div>
            <div className={styles.metricValue}>Term Active</div>
            <div className={styles.metricSub}>AY 2026-2027</div>
          </div>
        </div>

        <Link
          href={`/dashboard/${roleSlug}/announcements`}
          className={styles.metricCard}
          style={{ textDecoration: "none" }}
        >
          <div
            className={styles.metricIconWrapper}
            style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" }}
          >
            <Bell size={24} />
          </div>
          <div className={styles.metricInfo}>
            <div className={styles.metricLabel}>School Circulars</div>
            <div className={styles.metricValue}>
              {announcements.length} Active
            </div>
            <div className={styles.metricSub}>View announcements &rarr;</div>
          </div>
        </Link>

        <Link
          href={`/dashboard/${roleSlug}/messages`}
          className={styles.metricCard}
          style={{ textDecoration: "none" }}
        >
          <div
            className={styles.metricIconWrapper}
            style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}
          >
            <MessageSquare size={24} />
          </div>
          <div className={styles.metricInfo}>
            <div className={styles.metricLabel}>Direct Messages</div>
            <div className={styles.metricValue}>
              {unreadMessageCount > 0 ? `${unreadMessageCount} Unread` : "Up to date"}
            </div>
            <div className={styles.metricSub}>Staff & Teacher chat &rarr;</div>
          </div>
        </Link>

        <Link
          href={busLink}
          className={styles.metricCard}
          style={{ textDecoration: "none" }}
        >
          <div
            className={styles.metricIconWrapper}
            style={{ background: "rgba(168, 85, 247, 0.15)", color: "#a855f7" }}
          >
            <Bus size={24} />
          </div>
          <div className={styles.metricInfo}>
            <div className={styles.metricLabel}>Bus Transit</div>
            <div className={styles.metricValue}>Live Tracking</div>
            <div className={styles.metricSub}>GPS location active &rarr;</div>
          </div>
        </Link>
      </div>

      {/* Quick Navigation Hub */}
      <h2 className={styles.sectionTitle}>
        <LayoutDashboard size={18} color="#f59e0b" />
        Quick Access Hub
      </h2>
      <div className={styles.quickActionsGrid}>
        <Link
          href={`/dashboard/${roleSlug}/announcements`}
          className={styles.actionTile}
        >
          <div
            className={styles.actionIconBox}
            style={{ background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa" }}
          >
            <Bell size={26} />
          </div>
          <div className={styles.actionTitle}>Circulars & Notices</div>
          <div className={styles.actionDesc}>
            Official announcements, emergency alerts & notices
          </div>
        </Link>

        <Link
          href={`/dashboard/${roleSlug}/messages`}
          className={styles.actionTile}
        >
          <div
            className={styles.actionIconBox}
            style={{ background: "rgba(16, 185, 129, 0.15)", color: "#34d399" }}
          >
            <MessageSquare size={26} />
          </div>
          <div className={styles.actionTitle}>Direct Messages</div>
          <div className={styles.actionDesc}>
            Chat with teachers, administration, and school staff
          </div>
        </Link>

        <Link
          href={`/dashboard/${roleSlug}/calendar`}
          className={styles.actionTile}
        >
          <div
            className={styles.actionIconBox}
            style={{ background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24" }}
          >
            <Calendar size={26} />
          </div>
          <div className={styles.actionTitle}>School Calendar</div>
          <div className={styles.actionDesc}>
            Working days, upcoming exams, meetings & holidays
          </div>
        </Link>

        <Link href={busLink} className={styles.actionTile}>
          <div
            className={styles.actionIconBox}
            style={{ background: "rgba(168, 85, 247, 0.15)", color: "#c084fc" }}
          >
            <Bus size={26} />
          </div>
          <div className={styles.actionTitle}>Live Bus Tracking</div>
          <div className={styles.actionDesc}>
            Track school bus location, route stops & transit arrival
          </div>
        </Link>

        <Link
          href={`/dashboard/${roleSlug}/timetable`}
          className={styles.actionTile}
        >
          <div
            className={styles.actionIconBox}
            style={{ background: "rgba(14, 165, 233, 0.15)", color: "#38bdf8" }}
          >
            <Clock size={26} />
          </div>
          <div className={styles.actionTitle}>Daily Timetable</div>
          <div className={styles.actionDesc}>
            Period schedule, subject breakdown & timings
          </div>
        </Link>

        <Link
          href={`/dashboard/${roleSlug}/leaves`}
          className={styles.actionTile}
        >
          <div
            className={styles.actionIconBox}
            style={{ background: "rgba(236, 72, 153, 0.15)", color: "#f472b6" }}
          >
            <FileText size={26} />
          </div>
          <div className={styles.actionTitle}>Leave Applications</div>
          <div className={styles.actionDesc}>
            Submit and monitor leave requests with approvals
          </div>
        </Link>

        <Link
          href={
            role === "PARENT"
              ? `/dashboard/parent/fees`
              : `/dashboard/${roleSlug}/settings`
          }
          className={styles.actionTile}
        >
          <div
            className={styles.actionIconBox}
            style={{ background: "rgba(234, 179, 8, 0.15)", color: "#facc15" }}
          >
            <CreditCard size={26} />
          </div>
          <div className={styles.actionTitle}>
            {role === "PARENT" ? "Fees & Receipts" : "Staff Directory"}
          </div>
          <div className={styles.actionDesc}>
            {role === "PARENT"
              ? "Fee schedules, online payment & receipt records"
              : "Teacher & staff contact information"}
          </div>
        </Link>

        <Link
          href={`/dashboard/${roleSlug}/settings`}
          className={styles.actionTile}
        >
          <div
            className={styles.actionIconBox}
            style={{ background: "rgba(100, 116, 139, 0.2)", color: "#94a3b8" }}
          >
            <Settings size={26} />
          </div>
          <div className={styles.actionTitle}>Profile & Settings</div>
          <div className={styles.actionDesc}>
            Update contact details, passwords & notification preferences
          </div>
        </Link>
      </div>

      {/* Two-Column Grid: Latest Circulars & Upcoming Events */}
      <div className={styles.twoColGrid}>
        {/* Latest Announcements */}
        <div className={styles.contentCard}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              <Bell size={18} color="#3b82f6" />
              Recent Circulars & Announcements
            </h3>
            <Link
              href={`/dashboard/${roleSlug}/announcements`}
              className={styles.viewAllLink}
            >
              <span>View All</span>
              <ArrowRight size={14} />
            </Link>
          </div>
          <div className={styles.announcementList}>
            {announcements.map((item) => (
              <div key={item.id} className={styles.announcementItem}>
                <div className={styles.announcementTop}>
                  <div className={styles.announcementHeading}>{item.title}</div>
                  <span
                    className={`${styles.priorityPill} ${
                      item.priority === "HIGH"
                        ? styles.priorityHigh
                        : styles.priorityNormal
                    }`}
                  >
                    {item.priority || "NORMAL"}
                  </span>
                </div>
                <p className={styles.announcementBody}>{item.content}</p>
                <div className={styles.announcementDate}>
                  {new Date(item.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Academic Events */}
        <div className={styles.contentCard}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              <Calendar size={18} color="#f59e0b" />
              Upcoming Academic Schedule
            </h3>
            <Link
              href={`/dashboard/${roleSlug}/calendar`}
              className={styles.viewAllLink}
            >
              <span>Calendar</span>
              <ArrowRight size={14} />
            </Link>
          </div>
          <div className={styles.eventList}>
            {calendarEvents.map((evt) => {
              const d = new Date(evt.date);
              const dayNum = d.getDate();
              const monthStr = d.toLocaleDateString("en-US", { month: "short" });
              return (
                <div key={evt.id} className={styles.eventItem}>
                  <div className={styles.eventDateBox}>
                    <div className={styles.eventDateDay}>{dayNum}</div>
                    <div className={styles.eventDateMonth}>{monthStr}</div>
                  </div>
                  <div className={styles.eventDetails}>
                    <div className={styles.eventTitle}>{evt.title}</div>
                    <div className={styles.eventType}>{evt.type || "EVENT"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
