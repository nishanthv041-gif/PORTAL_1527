"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { 
  Plus, Calendar, Clock, MapPin, Link as LinkIcon, Trash2, 
  Users, UserCheck, Video, Building2, Bell, Send, CheckCircle, 
  AlertCircle, Search, ArrowLeft, ExternalLink, Copy, Check,
  X, Loader2, Sparkles, Filter, ShieldCheck, AlertTriangle
} from "lucide-react";
import { 
  createMeetingAction, 
  deleteMeetingAction, 
  sendMeetingNotificationAction
} from "@/backend/api/actions/dashboard/admin/meetings/actions";
import { 
  parseTimeToMinutes,
  doTimesOverlap,
  getDayOfWeekFromDate
} from "./meetingUtils";
import { Meeting, Teacher, Parent, User, Class } from "@prisma/client";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";

export type TimetableSlotItem = {
  id: string;
  dayOfWeek: string;
  period: number;
  startTime: string;
  endTime: string;
  classId: string;
  class: { id: string; name: string; section: string };
  subject: {
    id: string;
    name: string;
    code: string;
    teacherId: string | null;
  } | null;
};

type TeacherWithUser = Teacher & { user: User; classes?: Class[] };
type ParentWithUser = Parent & { 
  user: User; 
  children?: { student: { class?: Class | null } }[];
};
type MeetingWithRelations = Meeting & {
  teachers: TeacherWithUser[];
  parents: ParentWithUser[];
};

interface MeetingsClientProps {
  meetings: MeetingWithRelations[];
  teachers: TeacherWithUser[];
  parents: ParentWithUser[];
  classes: (Class & { teacher?: TeacherWithUser | null; _count?: { students: number } })[];
  timetableSlots?: TimetableSlotItem[];
}

export default function MeetingsClient({ 
  meetings: initialMeetings, 
  teachers, 
  parents, 
  classes,
  timetableSlots = []
}: MeetingsClientProps) {
  // Navigation / Page Tab State: "PARENTS" or "TEACHERS"
  const [activeTab, setActiveTab] = useState<"PARENTS" | "TEACHERS">("PARENTS");
  const confirm = useConfirm();

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "UPCOMING" | "PAST" | "ONLINE" | "OFFLINE">("ALL");

  // Modal State
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [modalMeetingType, setModalMeetingType] = useState<"PARENTS" | "TEACHERS">("PARENTS");
  const [modalMode, setModalMode] = useState<"OFFLINE" | "ONLINE">("OFFLINE");

  // Form Field State
  const [formTopic, setFormTopic] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formStartTime, setFormStartTime] = useState("");
  const [formEndTime, setFormEndTime] = useState("");
  const [formPlace, setFormPlace] = useState("");
  const [formLink, setFormLink] = useState("");
  const [formStaffInchargeId, setFormStaffInchargeId] = useState("");
  const [formParentAudience, setFormParentAudience] = useState<"ALL" | "CLASS" | "SELECTED">("ALL");
  const [formClassId, setFormClassId] = useState("");
  const [formSelectedParentIds, setFormSelectedParentIds] = useState<string[]>([]);
  const [formTeacherAudience, setFormTeacherAudience] = useState<"ALL" | "SELECTED">("ALL");
  const [formSelectedTeacherIds, setFormSelectedTeacherIds] = useState<string[]>([]);
  const [formNotifyAttendees, setFormNotifyAttendees] = useState(true);
  const [formSyncCalendar, setFormSyncCalendar] = useState(true);

  // Status & Feedback
  const [isPending, startTransition] = useTransition();
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  // Selected Teacher and Day of Week for Timetable Overlap Detection
  const selectedDayOfWeek = formDate ? getDayOfWeekFromDate(formDate) : "";
  const selectedTeacher = teachers.find(t => t.id === formStaffInchargeId);

  // Teaching slots for the selected teacher on the target day of week
  const teacherDaySlots = (formStaffInchargeId && selectedDayOfWeek)
    ? timetableSlots.filter(s => 
        s.subject?.teacherId === formStaffInchargeId &&
        s.dayOfWeek?.toUpperCase() === selectedDayOfWeek.toUpperCase()
      ).sort((a, b) => a.period - b.period)
    : [];

  // Teaching slots that clash with the proposed meeting timing
  const clashingSlots = (formStartTime && teacherDaySlots.length > 0)
    ? teacherDaySlots.filter(s => doTimesOverlap(formStartTime, formEndTime, s.startTime, s.endTime))
    : [];

  // Helper: Parse structured summary or plain text
  const parseMeetingMeta = (meeting: MeetingWithRelations) => {
    let meta: any = {};
    if (meeting.summary) {
      try {
        meta = JSON.parse(meeting.summary);
      } catch {
        meta = { description: meeting.summary };
      }
    }

    const meetingType = meta.meetingType || (meeting.parents.length > 0 ? "PARENTS" : "TEACHERS");
    const mode = meta.mode || (meeting.link ? "ONLINE" : "OFFLINE");
    const place = meta.place || (mode === "OFFLINE" ? meeting.location : "");
    const link = meta.link || meeting.link || "";
    const description = meta.description || "";
    const startTime = meta.startTime || meeting.time.split("-")[0]?.trim() || meeting.time;
    const endTime = meta.endTime || meeting.time.split("-")[1]?.trim() || "";
    const staffInchargeName = meta.staffInchargeName || (meeting.teachers[0]?.user.name || "Designated Faculty");
    const audienceLabel = meta.audienceDescription || (
      meetingType === "PARENTS"
        ? (meeting.parents.length > 0 ? `${meeting.parents.length} Parents` : "All Parents")
        : (meeting.teachers.length > 0 ? `${meeting.teachers.length} Faculty Members` : "All Teachers")
    );
    const timetableOverlaps: {
      period: number;
      subjectName: string;
      className: string;
      startTime: string;
      endTime: string;
    }[] = meta.timetableOverlaps || [];
    const meetingDayOfWeek: string = meta.meetingDayOfWeek || "";

    return {
      meetingType,
      mode,
      place,
      link,
      description,
      startTime,
      endTime,
      staffInchargeName,
      audienceLabel,
      timetableOverlaps,
      meetingDayOfWeek
    };
  };

  // Classify meetings into Parents vs Teachers
  const categorizedMeetings = initialMeetings.map(m => {
    const meta = parseMeetingMeta(m);
    const meetingDate = new Date(m.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isUpcoming = meetingDate >= today;

    return {
      meeting: m,
      meta,
      isUpcoming
    };
  });

  const parentsMeetings = categorizedMeetings.filter(item => item.meta.meetingType === "PARENTS");
  const teachersMeetings = categorizedMeetings.filter(item => item.meta.meetingType === "TEACHERS");

  // Metrics
  const totalCount = categorizedMeetings.length;
  const parentsCount = parentsMeetings.length;
  const teachersCount = teachersMeetings.length;
  const onlineCount = categorizedMeetings.filter(item => item.meta.mode === "ONLINE").length;
  const offlineCount = categorizedMeetings.filter(item => item.meta.mode === "OFFLINE").length;

  // Current tab items
  const currentTabItems = activeTab === "PARENTS" ? parentsMeetings : teachersMeetings;

  // Filter & Search
  const filteredItems = currentTabItems.filter(({ meeting, meta, isUpcoming }) => {
    // Status Filter
    if (statusFilter === "UPCOMING" && !isUpcoming) return false;
    if (statusFilter === "PAST" && isUpcoming) return false;
    if (statusFilter === "ONLINE" && meta.mode !== "ONLINE") return false;
    if (statusFilter === "OFFLINE" && meta.mode !== "OFFLINE") return false;

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const topicMatch = meeting.agenda.toLowerCase().includes(q);
      const descMatch = meta.description.toLowerCase().includes(q);
      const inchargeMatch = meta.staffInchargeName.toLowerCase().includes(q);
      const placeMatch = (meta.place || "").toLowerCase().includes(q);
      const linkMatch = (meta.link || "").toLowerCase().includes(q);
      return topicMatch || descMatch || inchargeMatch || placeMatch || linkMatch;
    }

    return true;
  });

  // Open modal with pre-selected tab
  const handleOpenSchedule = (type?: "PARENTS" | "TEACHERS") => {
    const targetType = type || activeTab;
    setModalMeetingType(targetType);
    setModalMode("OFFLINE");
    setFormTopic("");
    setFormDescription("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormStartTime("10:00");
    setFormEndTime("11:00");
    setFormPlace("");
    setFormLink("");
    setFormStaffInchargeId(teachers[0]?.id || "");
    setFormParentAudience("ALL");
    setFormClassId(classes[0]?.id || "");
    setFormSelectedParentIds([]);
    setFormTeacherAudience("ALL");
    setFormSelectedTeacherIds([]);
    setFormNotifyAttendees(true);
    setFormSyncCalendar(true);
    setFeedbackError(null);
    setShowScheduleModal(true);
  };

  // Handle Form Submission
  const handleSubmitSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackError(null);
    setFeedbackSuccess(null);

    if (!formTopic.trim()) {
      setFeedbackError("Please enter a meeting topic/agenda.");
      return;
    }
    if (!formStaffInchargeId) {
      setFeedbackError("Please select a Staff In-charge for this meeting.");
      return;
    }
    if (modalMode === "OFFLINE" && !formPlace.trim()) {
      setFeedbackError("Please enter the meeting venue/place for offline meeting.");
      return;
    }
    if (modalMode === "ONLINE" && !formLink.trim()) {
      setFeedbackError("Please enter or paste the online meeting link URL.");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("meetingType", modalMeetingType);
      formData.set("mode", modalMode);
      formData.set("topic", formTopic.trim());
      formData.set("description", formDescription.trim());
      formData.set("date", formDate);
      formData.set("startTime", formStartTime);
      formData.set("endTime", formEndTime);
      formData.set("place", formPlace.trim());
      formData.set("link", formLink.trim());
      formData.set("staffInchargeId", formStaffInchargeId);

      if (modalMeetingType === "PARENTS") {
        formData.set("parentAudienceType", formParentAudience);
        if (formParentAudience === "CLASS") {
          formData.set("classId", formClassId);
        } else if (formParentAudience === "SELECTED") {
          formSelectedParentIds.forEach(id => formData.append("parentIds", id));
        }
      } else {
        formData.set("teacherAudienceType", formTeacherAudience);
        if (formTeacherAudience === "SELECTED") {
          formSelectedTeacherIds.forEach(id => formData.append("selectedTeacherIds", id));
        }
      }

      formData.set("notifyAttendees", String(formNotifyAttendees));
      formData.set("syncCalendar", String(formSyncCalendar));

      const res = await createMeetingAction(formData);
      if (res.success) {
        setFeedbackSuccess(
          `${modalMeetingType === "PARENTS" ? "Parents Meeting" : "Teachers Meeting"} scheduled successfully!` +
          (res.notificationsCreated ? ` Dispatched real-time notification pop-up to ${res.notificationsCreated} attendee(s).` : "")
        );
        setShowScheduleModal(false);
      } else {
        setFeedbackError(res.error || "Failed to schedule meeting.");
      }
    });
  };

  // Handle Send Real-time Notification Pop-up
  const handleSendNotification = (meetingId: string, topic: string) => {
    setNotifyingId(meetingId);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const res = await sendMeetingNotificationAction(meetingId);
      setNotifyingId(null);
      if (res.success) {
        setFeedbackSuccess(`Real-time notification pop-up dispatched to ${res.count} attendees for '${topic}'!`);
      } else {
        setFeedbackError(res.error || "Failed to send notification pop-up.");
      }
    });
  };

  // Handle Delete Meeting
  const handleDeleteMeeting = async (meetingId: string, topic: string) => {
    const ok = await confirm({
      title: `Delete Meeting: "${topic}"?`,
      message: `Are you sure you want to delete the meeting '${topic}'? This will also remove any linked calendar events and notifications. This cannot be undone.`,
      confirmText: "Delete Meeting",
      cancelText: "Cancel",
      variant: "danger"
    });
    if (!ok) return;

    setDeletingId(meetingId);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const res = await deleteMeetingAction(meetingId);
      setDeletingId(null);
      if (res.success) {
        setFeedbackSuccess(`Meeting '${topic}' deleted successfully.`);
      } else {
        setFeedbackError(res.error || "Failed to delete meeting.");
      }
    });
  };

  // Handle Copy Link
  const handleCopyLink = (meetingId: string, url: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedLinkId(meetingId);
    setTimeout(() => setCopiedLinkId(null), 2500);
  };

  // Helper to paste link from clipboard
  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setFormLink(text.trim());
      }
    } catch {
      // Ignore if clipboard permission not granted
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem", width: "100%", maxWidth: "1400px", margin: "0 auto" }}>
      
      {/* ======================================================== */}
      {/* BREADCRUMB & HEADER */}
      {/* ======================================================== */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.875rem", fontWeight: 800, color: "var(--foreground)", letterSpacing: "-0.02em" }}>
              Meeting Management Centre
            </h1>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={() => handleOpenSchedule(activeTab)}
              style={{
                padding: "0.75rem 1.4rem",
                borderRadius: "10px",
                border: "none",
                backgroundColor: activeTab === "PARENTS" ? "#8b5cf6" : "var(--primary, #6366f1)",
                color: "#ffffff",
                fontSize: "0.9375rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                boxShadow: "0 4px 14px rgba(99, 102, 241, 0.25)",
                transition: "all 0.2s ease"
              }}
            >
              <Plus size={18} /> Schedule {activeTab === "PARENTS" ? "Parents Meeting" : "Teachers Meeting"}
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* FEEDBACK BANNERS */}
      {/* ======================================================== */}
      {feedbackSuccess && (
        <div style={{
          padding: "0.9rem 1.25rem",
          borderRadius: "10px",
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          border: "1px solid rgba(16, 185, 129, 0.3)",
          color: "#10b981",
          fontSize: "0.875rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <CheckCircle size={18} />
            <span>{feedbackSuccess}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setFeedbackSuccess(null)}
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {feedbackError && (
        <div style={{
          padding: "0.9rem 1.25rem",
          borderRadius: "10px",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          color: "#ef4444",
          fontSize: "0.875rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertCircle size={18} />
            <span>{feedbackError}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setFeedbackError(null)}
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* METRICS OVERVIEW */}
      {/* ======================================================== */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "1rem"
      }}>
        <div style={{
          padding: "1.25rem",
          borderRadius: "12px",
          border: "1px solid var(--border-color)",
          backgroundColor: "var(--card-bg, #ffffff)",
          display: "flex",
          alignItems: "center",
          gap: "1rem"
        }}>
          <div style={{
            padding: "0.75rem",
            borderRadius: "10px",
            backgroundColor: "rgba(99, 102, 241, 0.1)",
            color: "var(--primary, #6366f1)"
          }}>
            <Calendar size={22} />
          </div>
          <div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 600 }}>Total Meetings</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--foreground)" }}>{totalCount}</div>
          </div>
        </div>

        <div style={{
          padding: "1.25rem",
          borderRadius: "12px",
          border: "1px solid var(--border-color)",
          backgroundColor: "var(--card-bg, #ffffff)",
          display: "flex",
          alignItems: "center",
          gap: "1rem"
        }}>
          <div style={{
            padding: "0.75rem",
            borderRadius: "10px",
            backgroundColor: "rgba(139, 92, 246, 0.1)",
            color: "#8b5cf6"
          }}>
            <Users size={22} />
          </div>
          <div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 600 }}>Parents Meetings</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--foreground)" }}>{parentsCount}</div>
          </div>
        </div>

        <div style={{
          padding: "1.25rem",
          borderRadius: "12px",
          border: "1px solid var(--border-color)",
          backgroundColor: "var(--card-bg, #ffffff)",
          display: "flex",
          alignItems: "center",
          gap: "1rem"
        }}>
          <div style={{
            padding: "0.75rem",
            borderRadius: "10px",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            color: "#10b981"
          }}>
            <UserCheck size={22} />
          </div>
          <div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 600 }}>Teachers Meetings</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--foreground)" }}>{teachersCount}</div>
          </div>
        </div>

        <div style={{
          padding: "1.25rem",
          borderRadius: "12px",
          border: "1px solid var(--border-color)",
          backgroundColor: "var(--card-bg, #ffffff)",
          display: "flex",
          alignItems: "center",
          gap: "1rem"
        }}>
          <div style={{
            padding: "0.75rem",
            borderRadius: "10px",
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            color: "#3b82f6"
          }}>
            <Video size={22} />
          </div>
          <div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 600 }}>Online Virtual</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--foreground)" }}>{onlineCount}</div>
          </div>
        </div>

        <div style={{
          padding: "1.25rem",
          borderRadius: "12px",
          border: "1px solid var(--border-color)",
          backgroundColor: "var(--card-bg, #ffffff)",
          display: "flex",
          alignItems: "center",
          gap: "1rem"
        }}>
          <div style={{
            padding: "0.75rem",
            borderRadius: "10px",
            backgroundColor: "rgba(245, 158, 11, 0.1)",
            color: "#f59e0b"
          }}>
            <Building2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 600 }}>In-Person Offline</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--foreground)" }}>{offlineCount}</div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* DEDICATED TABS: PARENTS MEETINGS vs TEACHERS MEETINGS */}
      {/* ======================================================== */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        borderBottom: "2px solid var(--border-color)",
        paddingBottom: "0.25rem"
      }}>
        <button
          type="button"
          onClick={() => setActiveTab("PARENTS")}
          style={{
            padding: "0.75rem 1.5rem",
            borderRadius: "10px 10px 0 0",
            border: "none",
            backgroundColor: activeTab === "PARENTS" ? "rgba(139, 92, 246, 0.12)" : "transparent",
            color: activeTab === "PARENTS" ? "#8b5cf6" : "var(--text-secondary)",
            fontWeight: 800,
            fontSize: "1rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            borderBottom: activeTab === "PARENTS" ? "3px solid #8b5cf6" : "3px solid transparent",
            marginBottom: "-2px",
            transition: "all 0.2s ease"
          }}
        >
          <Users size={18} /> Parents Meetings ({parentsCount})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("TEACHERS")}
          style={{
            padding: "0.75rem 1.5rem",
            borderRadius: "10px 10px 0 0",
            border: "none",
            backgroundColor: activeTab === "TEACHERS" ? "rgba(99, 102, 241, 0.12)" : "transparent",
            color: activeTab === "TEACHERS" ? "var(--primary, #6366f1)" : "var(--text-secondary)",
            fontWeight: 800,
            fontSize: "1rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            borderBottom: activeTab === "TEACHERS" ? "3px solid var(--primary, #6366f1)" : "3px solid transparent",
            marginBottom: "-2px",
            transition: "all 0.2s ease"
          }}
        >
          <UserCheck size={18} /> Teachers Meetings ({teachersCount})
        </button>
      </div>

      {/* ======================================================== */}
      {/* CONTROLS: SEARCH & STATUS FILTERS */}
      {/* ======================================================== */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "1rem"
      }}>
        <div style={{
          position: "relative",
          minWidth: "260px",
          flex: "1 1 300px",
          maxWidth: "450px"
        }}>
          <Search size={16} style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
          <input
            type="text"
            placeholder={`Search ${activeTab === "PARENTS" ? "parents" : "teachers"} meetings by topic, staff, venue...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "0.65rem 0.85rem 0.65rem 2.4rem",
              borderRadius: "10px",
              border: "1px solid var(--border-color)",
              backgroundColor: "var(--card-bg, #ffffff)",
              color: "var(--foreground)",
              fontSize: "0.875rem",
              outline: "none"
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
          {(["ALL", "UPCOMING", "PAST", "ONLINE", "OFFLINE"] as const).map(pill => {
            const isActive = statusFilter === pill;
            const labels: Record<string, string> = {
              ALL: "All",
              UPCOMING: "Upcoming",
              PAST: "Past",
              ONLINE: "🌐 Online",
              OFFLINE: "🏢 In-Person"
            };

            return (
              <button
                key={pill}
                type="button"
                onClick={() => setStatusFilter(pill)}
                style={{
                  padding: "0.45rem 0.85rem",
                  borderRadius: "20px",
                  border: isActive ? "1px solid transparent" : "1px solid var(--border-color)",
                  backgroundColor: isActive ? "var(--foreground)" : "transparent",
                  color: isActive ? "var(--card-bg, #ffffff)" : "var(--text-secondary)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
              >
                {labels[pill]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* MEETINGS GRID */}
      {/* ======================================================== */}
      {filteredItems.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "4rem 2rem",
          borderRadius: "16px",
          border: "1px dashed var(--border-color)",
          backgroundColor: "var(--card-bg, #ffffff)",
          color: "var(--text-secondary)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1rem"
        }}>
          <div style={{
            padding: "1rem",
            borderRadius: "50%",
            backgroundColor: "rgba(99, 102, 241, 0.08)",
            color: "var(--primary)"
          }}>
            <Calendar size={36} />
          </div>
          <div>
            <h3 style={{ margin: "0 0 0.35rem", fontSize: "1.125rem", fontWeight: 700, color: "var(--foreground)" }}>
              No {activeTab === "PARENTS" ? "Parents" : "Teachers"} Meetings Found
            </h3>
            <p style={{ margin: 0, fontSize: "0.875rem" }}>
              {searchQuery || statusFilter !== "ALL"
                ? "No meetings match your current search or filter criteria."
                : `No ${activeTab === "PARENTS" ? "parents" : "teachers"} meetings have been scheduled yet.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleOpenSchedule(activeTab)}
            style={{
              marginTop: "0.5rem",
              padding: "0.6rem 1.25rem",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "var(--primary, #6366f1)",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem"
            }}
          >
            <Plus size={16} /> Schedule First Meeting
          </button>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 360px), 1fr))",
          gap: "1.25rem"
        }}>
          {filteredItems.map(({ meeting, meta, isUpcoming }) => {
            const meetingDate = new Date(meeting.date);
            const dateStr = meetingDate.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric"
            });

            const isOnline = meta.mode === "ONLINE";
            const isParents = meta.meetingType === "PARENTS";
            const isCopied = copiedLinkId === meeting.id;
            const isNotifyingThis = notifyingId === meeting.id;
            const isDeletingThis = deletingId === meeting.id;

            return (
              <div
                key={meeting.id}
                style={{
                  borderRadius: "16px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--card-bg, #ffffff)",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.04)",
                  transition: "transform 0.15s ease, box-shadow 0.15s ease"
                }}
              >
                {/* Card Header Bar */}
                <div style={{
                  padding: "1rem 1.25rem",
                  borderBottom: "1px solid var(--border-color)",
                  backgroundColor: isParents ? "rgba(139, 92, 246, 0.04)" : "rgba(99, 102, 241, 0.04)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                    <span style={{
                      padding: "0.25rem 0.6rem",
                      borderRadius: "6px",
                      fontSize: "0.75rem",
                      fontWeight: 800,
                      backgroundColor: isParents ? "rgba(139, 92, 246, 0.15)" : "rgba(99, 102, 241, 0.15)",
                      color: isParents ? "#8b5cf6" : "#6366f1"
                    }}>
                      {isParents ? "Parents Meeting" : "Teachers Meeting"}
                    </span>

                    <span style={{
                      padding: "0.25rem 0.6rem",
                      borderRadius: "6px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      backgroundColor: isOnline ? "rgba(59, 130, 246, 0.12)" : "rgba(245, 158, 11, 0.12)",
                      color: isOnline ? "#3b82f6" : "#d97706",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem"
                    }}>
                      {isOnline ? <Video size={12} /> : <Building2 size={12} />}
                      {isOnline ? "Online" : "In-Person"}
                    </span>
                  </div>

                  <span style={{
                    padding: "0.2rem 0.55rem",
                    borderRadius: "12px",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    backgroundColor: isUpcoming ? "rgba(16, 185, 129, 0.12)" : "rgba(107, 114, 128, 0.12)",
                    color: isUpcoming ? "#10b981" : "#6b7280"
                  }}>
                    {isUpcoming ? "Upcoming" : "Past"}
                  </span>
                </div>

                {/* Card Content */}
                <div style={{ padding: "1.25rem", flex: 1, display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div>
                    <h3 style={{
                      margin: "0 0 0.35rem",
                      fontSize: "1.1rem",
                      fontWeight: 700,
                      color: "var(--foreground)",
                      lineHeight: 1.35
                    }}>
                      {meeting.agenda}
                    </h3>

                    {meta.description && (
                      <p style={{
                        margin: 0,
                        fontSize: "0.85rem",
                        color: "var(--text-secondary)",
                        lineHeight: 1.45,
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden"
                      }}>
                        {meta.description}
                      </p>
                    )}
                  </div>

                  {/* Schedule Details Grid */}
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.55rem",
                    padding: "0.85rem 1rem",
                    borderRadius: "10px",
                    backgroundColor: "rgba(0, 0, 0, 0.02)",
                    border: "1px solid var(--border-color)",
                    fontSize: "0.8125rem"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--foreground)" }}>
                      <Calendar size={14} color="var(--primary)" />
                      <strong style={{ minWidth: "40px" }}>Date:</strong> {dateStr}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--foreground)" }}>
                      <Clock size={14} color="var(--primary)" />
                      <strong style={{ minWidth: "40px" }}>Time:</strong> {meeting.time}
                    </div>

                    {!isOnline && meta.place && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--foreground)" }}>
                        <MapPin size={14} color="#d97706" />
                        <strong style={{ minWidth: "40px" }}>Place:</strong> {meta.place}
                      </div>
                    )}

                    {isOnline && meta.link && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, overflow: "hidden" }}>
                          <LinkIcon size={14} color="#3b82f6" />
                          <strong style={{ minWidth: "40px" }}>Link:</strong>
                          <a
                            href={meta.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "#3b82f6",
                              textDecoration: "underline",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                          >
                            Join Online Meeting
                          </a>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyLink(meeting.id, meta.link)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: isCopied ? "#10b981" : "var(--text-secondary)",
                            cursor: "pointer",
                            padding: "0.2rem",
                            display: "flex",
                            alignItems: "center"
                          }}
                          title="Copy meeting link"
                        >
                          {isCopied ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Staff In-charge & Audience Badges */}
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.45rem",
                    fontSize: "0.8125rem",
                    paddingTop: "0.5rem",
                    borderTop: "1px dashed var(--border-color)"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", color: "var(--text-secondary)" }}>
                      <UserCheck size={14} color="var(--primary)" />
                      <span>Staff In-charge:</span>
                      <strong style={{ color: "var(--foreground)" }}>{meta.staffInchargeName}</strong>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", color: "var(--text-secondary)" }}>
                      <Users size={14} color="#8b5cf6" />
                      <span>Audience:</span>
                      <span style={{ color: "var(--foreground)", fontWeight: 600 }}>{meta.audienceLabel}</span>
                    </div>

                    {meta.timetableOverlaps && meta.timetableOverlaps.length > 0 && (
                      <div style={{
                        marginTop: "0.25rem",
                        padding: "0.45rem 0.65rem",
                        borderRadius: "8px",
                        backgroundColor: "rgba(239, 68, 68, 0.08)",
                        border: "1px solid rgba(239, 68, 68, 0.25)",
                        color: "#ef4444",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem"
                      }}>
                        <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                        <span>
                          Timetable Overlap: Period {meta.timetableOverlaps.map((o: any) => o.period).join(", ")} ({meta.timetableOverlaps.map((o: any) => o.subjectName).join(", ")})
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Footer */}
                <div style={{
                  padding: "0.85rem 1.25rem",
                  borderTop: "1px solid var(--border-color)",
                  backgroundColor: "rgba(0, 0, 0, 0.015)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem"
                }}>
                  {/* Push Real-time Notification Pop-up Button */}
                  <button
                    type="button"
                    onClick={() => handleSendNotification(meeting.id, meeting.agenda)}
                    disabled={isPending || isNotifyingThis}
                    style={{
                      padding: "0.45rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid rgba(99, 102, 241, 0.3)",
                      backgroundColor: "rgba(99, 102, 241, 0.08)",
                      color: "var(--primary, #6366f1)",
                      fontSize: "0.785rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      transition: "all 0.15s ease"
                    }}
                    title="Send real-time notification pop-up to all attendees now"
                  >
                    {isNotifyingThis ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Bell size={13} />
                    )}
                    Send Pop-up Alert
                  </button>

                  {/* Delete Meeting */}
                  <button
                    type="button"
                    onClick={() => handleDeleteMeeting(meeting.id, meeting.agenda)}
                    disabled={isPending || isDeletingThis}
                    style={{
                      padding: "0.45rem 0.75rem",
                      borderRadius: "8px",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      backgroundColor: "rgba(239, 68, 68, 0.08)",
                      color: "#ef4444",
                      fontSize: "0.785rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem"
                    }}
                    title="Delete meeting"
                  >
                    {isDeletingThis ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ======================================================== */}
      {/* SCHEDULE MEETING MODAL */}
      {/* ======================================================== */}
      {showScheduleModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.65)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: "1rem"
        }}>
          <div style={{
            backgroundColor: "var(--card-bg, #ffffff)",
            borderRadius: "18px",
            border: "1px solid var(--border-color)",
            width: "100%",
            maxWidth: "640px",
            maxHeight: "90vh",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }}>
            {/* Modal Header */}
            <div style={{
              padding: "1.25rem 1.5rem",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "var(--foreground)" }}>
                  Schedule New Meeting
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSubmitSchedule} style={{ padding: "1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              
              {/* Type Switcher: Parents Meeting vs Teachers Meeting */}
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.5rem" }}>
                  1. Meeting Target *
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <button
                    type="button"
                    onClick={() => setModalMeetingType("PARENTS")}
                    style={{
                      padding: "0.75rem",
                      borderRadius: "10px",
                      border: modalMeetingType === "PARENTS" ? "2px solid #8b5cf6" : "1px solid var(--border-color)",
                      backgroundColor: modalMeetingType === "PARENTS" ? "rgba(139, 92, 246, 0.12)" : "transparent",
                      color: modalMeetingType === "PARENTS" ? "#8b5cf6" : "var(--foreground)",
                      fontWeight: 700,
                      fontSize: "0.875rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem"
                    }}
                  >
                    <Users size={16} /> Parents Meeting (PTM)
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalMeetingType("TEACHERS")}
                    style={{
                      padding: "0.75rem",
                      borderRadius: "10px",
                      border: modalMeetingType === "TEACHERS" ? "2px solid var(--primary, #6366f1)" : "1px solid var(--border-color)",
                      backgroundColor: modalMeetingType === "TEACHERS" ? "rgba(99, 102, 241, 0.12)" : "transparent",
                      color: modalMeetingType === "TEACHERS" ? "var(--primary, #6366f1)" : "var(--foreground)",
                      fontWeight: 700,
                      fontSize: "0.875rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem"
                    }}
                  >
                    <UserCheck size={16} /> Teachers Meeting (Staff)
                  </button>
                </div>
              </div>

              {/* Mode Switcher: Offline vs Online */}
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.5rem" }}>
                  2. Meeting Mode *
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <button
                    type="button"
                    onClick={() => setModalMode("OFFLINE")}
                    style={{
                      padding: "0.7rem",
                      borderRadius: "10px",
                      border: modalMode === "OFFLINE" ? "2px solid #f59e0b" : "1px solid var(--border-color)",
                      backgroundColor: modalMode === "OFFLINE" ? "rgba(245, 158, 11, 0.12)" : "transparent",
                      color: modalMode === "OFFLINE" ? "#d97706" : "var(--foreground)",
                      fontWeight: 700,
                      fontSize: "0.875rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem"
                    }}
                  >
                    <Building2 size={16} /> 🏢 In-Person (Offline)
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalMode("ONLINE")}
                    style={{
                      padding: "0.7rem",
                      borderRadius: "10px",
                      border: modalMode === "ONLINE" ? "2px solid #3b82f6" : "1px solid var(--border-color)",
                      backgroundColor: modalMode === "ONLINE" ? "rgba(59, 130, 246, 0.12)" : "transparent",
                      color: modalMode === "ONLINE" ? "#3b82f6" : "var(--foreground)",
                      fontWeight: 700,
                      fontSize: "0.875rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem"
                    }}
                  >
                    <Video size={16} /> 🌐 Virtual (Online)
                  </button>
                </div>
              </div>

              {/* Topic / Agenda Title */}
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                  Meeting Topic / Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder={modalMeetingType === "PARENTS" ? "e.g. Term 1 Academic Progress & PTA Consultation" : "e.g. Monthly Curriculum Alignment & Faculty Assembly"}
                  value={formTopic}
                  onChange={(e) => setFormTopic(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "transparent",
                    color: "var(--foreground)",
                    fontSize: "0.9375rem"
                  }}
                />
              </div>

              {/* Staff In-Charge Selector */}
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                  Staff In-charge (Faculty Lead) *
                </label>
                <select
                  required
                  value={formStaffInchargeId}
                  onChange={(e) => setFormStaffInchargeId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--card-bg, #ffffff)",
                    color: "var(--foreground)",
                    fontSize: "0.875rem"
                  }}
                >
                  <option value="">-- Choose Staff In-charge --</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.user.name} ({t.user.email})
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem", display: "block" }}>
                  This staff member is designated in-charge and will be notified with primary lead responsibility.
                </span>
              </div>

              {/* Date, Start Time & End Time */}
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.75rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "transparent",
                      color: "var(--foreground)",
                      fontSize: "0.875rem"
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                    Start Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.75rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "transparent",
                      color: "var(--foreground)",
                      fontSize: "0.875rem"
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                    End Time
                  </label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.75rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "transparent",
                      color: "var(--foreground)",
                      fontSize: "0.875rem"
                    }}
                  />
                </div>
              </div>

              {/* Teacher Today's Schedule & Timetable Overlap Checker */}
              {formDate && formStaffInchargeId ? (
                <div style={{
                  padding: "0.9rem 1rem",
                  borderRadius: "10px",
                  border: clashingSlots.length > 0 ? "2px solid #ef4444" : "1px solid var(--border-color)",
                  backgroundColor: clashingSlots.length > 0 ? "rgba(239, 68, 68, 0.05)" : "rgba(0, 0, 0, 0.02)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem"
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground)" }}>
                      <Calendar size={15} color="var(--primary)" />
                      <span>{selectedTeacher?.user.name}&apos;s Schedule on {selectedDayOfWeek}</span>
                    </div>

                    <span style={{
                      padding: "0.2rem 0.55rem",
                      borderRadius: "12px",
                      fontSize: "0.725rem",
                      fontWeight: 700,
                      backgroundColor: clashingSlots.length > 0 ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                      color: clashingSlots.length > 0 ? "#dc2626" : "#059669",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem"
                    }}>
                      {clashingSlots.length > 0 ? (
                        <>
                          <AlertTriangle size={12} /> {clashingSlots.length} Timetable Clash{clashingSlots.length > 1 ? "es" : ""}!
                        </>
                      ) : (
                        <>
                          <CheckCircle size={12} /> No Timing Clashes
                        </>
                      )}
                    </span>
                  </div>

                  {/* Overlap Alert Notice */}
                  {clashingSlots.length > 0 && (
                    <div style={{
                      padding: "0.65rem 0.85rem",
                      borderRadius: "8px",
                      backgroundColor: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      fontSize: "0.8rem",
                      color: "#b91c1c",
                      lineHeight: 1.4
                    }}>
                      <strong>⚠️ TIMETABLE OVERLAP DETECTED:</strong> Proposed meeting time ({formStartTime}{formEndTime ? ` - ${formEndTime}` : ""}) clashes with {selectedTeacher?.user.name}&apos;s active teaching period(s):
                      <ul style={{ margin: "0.35rem 0 0 1.2rem", padding: 0 }}>
                        {clashingSlots.map(cs => (
                          <li key={cs.id}>
                            <strong>Period {cs.period} ({cs.startTime} - {cs.endTime}):</strong> {cs.subject?.name || "Subject"} for {cs.class.name} - {cs.class.section}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Periods on this day */}
                  {teacherDaySlots.length === 0 ? (
                    <div style={{ fontSize: "0.8rem", color: "#059669", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <CheckCircle size={14} /> Teacher has NO scheduled classes on {selectedDayOfWeek}. Free all day!
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                        All Teaching Periods on {selectedDayOfWeek} ({teacherDaySlots.length} periods):
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "0.5rem" }}>
                        {teacherDaySlots.map(slot => {
                          const isClash = clashingSlots.some(cs => cs.id === slot.id);
                          return (
                            <div
                              key={slot.id}
                              style={{
                                padding: "0.45rem 0.65rem",
                                borderRadius: "8px",
                                border: isClash ? "1.5px solid #ef4444" : "1px solid var(--border-color)",
                                backgroundColor: isClash ? "rgba(239, 68, 68, 0.12)" : "var(--card-bg, #ffffff)",
                                fontSize: "0.75rem",
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.15rem"
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <strong style={{ color: isClash ? "#dc2626" : "var(--foreground)" }}>
                                  P{slot.period}: {slot.startTime}-{slot.endTime}
                                </strong>
                                {isClash && (
                                  <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#dc2626" }}>CLASH</span>
                                )}
                              </div>
                              <span style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {slot.subject?.name || "Class"} • {slot.class.name}-{slot.class.section}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{
                  padding: "0.65rem 0.85rem",
                  borderRadius: "8px",
                  border: "1px dashed var(--border-color)",
                  fontSize: "0.785rem",
                  color: "var(--text-secondary)",
                  backgroundColor: "rgba(0,0,0,0.01)"
                }}>
                  💡 Select Date and Staff In-charge to automatically display their timetable schedule for that day and check for overlaps.
                </div>
              )}

              {/* Place (if Offline) OR Meeting Link (if Online) */}
              {modalMode === "OFFLINE" ? (
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                    Place / Venue / Room *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Main Auditorium, School Conference Hall 2, Room 104"
                    value={formPlace}
                    onChange={(e) => setFormPlace(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "transparent",
                      color: "var(--foreground)",
                      fontSize: "0.875rem"
                    }}
                  />
                </div>
              ) : (
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                    Meeting Link (Paste URL) *
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input
                      type="url"
                      required
                      placeholder="https://meet.google.com/... or https://zoom.us/..."
                      value={formLink}
                      onChange={(e) => setFormLink(e.target.value)}
                      style={{
                        flex: 1,
                        padding: "0.65rem 0.85rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)",
                        backgroundColor: "transparent",
                        color: "var(--foreground)",
                        fontSize: "0.875rem"
                      }}
                    />
                    <button
                      type="button"
                      onClick={handlePasteFromClipboard}
                      style={{
                        padding: "0.65rem 0.9rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)",
                        backgroundColor: "transparent",
                        color: "var(--foreground)",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.3rem"
                      }}
                    >
                      <Copy size={13} /> Paste
                    </button>
                  </div>
                </div>
              )}

              {/* Target Audience Controls */}
              {modalMeetingType === "PARENTS" ? (
                <div style={{
                  padding: "1rem",
                  borderRadius: "10px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "rgba(139, 92, 246, 0.04)"
                }}>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.5rem" }}>
                    Target Parents Audience *
                  </label>
                  <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="parentAudience"
                        checked={formParentAudience === "ALL"}
                        onChange={() => setFormParentAudience("ALL")}
                      />
                      All Parents (School-wide)
                    </label>

                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="parentAudience"
                        checked={formParentAudience === "CLASS"}
                        onChange={() => setFormParentAudience("CLASS")}
                      />
                      Specific Class Parents
                    </label>

                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="parentAudience"
                        checked={formParentAudience === "SELECTED"}
                        onChange={() => setFormParentAudience("SELECTED")}
                      />
                      Selected Parents Only
                    </label>
                  </div>

                  {formParentAudience === "CLASS" && (
                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Select Class *
                      </label>
                      <select
                        value={formClassId}
                        onChange={(e) => setFormClassId(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "0.6rem 0.75rem",
                          borderRadius: "8px",
                          border: "1px solid var(--border-color)",
                          backgroundColor: "var(--card-bg, #ffffff)",
                          color: "var(--foreground)",
                          fontSize: "0.875rem"
                        }}
                      >
                        {classes.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.section} ({c._count?.students || 0} students)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formParentAudience === "SELECTED" && (
                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Select Parents (Hold Ctrl/Cmd to select multiple) *
                      </label>
                      <select
                        multiple
                        value={formSelectedParentIds}
                        onChange={(e) => {
                          const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                          setFormSelectedParentIds(selected);
                        }}
                        style={{
                          width: "100%",
                          padding: "0.5rem",
                          borderRadius: "8px",
                          border: "1px solid var(--border-color)",
                          backgroundColor: "var(--card-bg, #ffffff)",
                          color: "var(--foreground)",
                          fontSize: "0.8125rem",
                          minHeight: "110px"
                        }}
                      >
                        {parents.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.user.name} ({p.user.email})
                          </option>
                        ))}
                      </select>
                      <span style={{ fontSize: "0.725rem", color: "var(--text-secondary)", marginTop: "0.2rem", display: "block" }}>
                        {formSelectedParentIds.length} parents selected
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{
                  padding: "1rem",
                  borderRadius: "10px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "rgba(99, 102, 241, 0.04)"
                }}>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.5rem" }}>
                    Target Teachers Audience *
                  </label>
                  <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="teacherAudience"
                        checked={formTeacherAudience === "ALL"}
                        onChange={() => setFormTeacherAudience("ALL")}
                      />
                      All Teachers &amp; Faculty ({teachers.length})
                    </label>

                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="teacherAudience"
                        checked={formTeacherAudience === "SELECTED"}
                        onChange={() => setFormTeacherAudience("SELECTED")}
                      />
                      Select Specific Teachers
                    </label>
                  </div>

                  {formTeacherAudience === "SELECTED" && (
                    <div>
                      <select
                        multiple
                        value={formSelectedTeacherIds}
                        onChange={(e) => {
                          const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                          setFormSelectedTeacherIds(selected);
                        }}
                        style={{
                          width: "100%",
                          padding: "0.5rem",
                          borderRadius: "8px",
                          border: "1px solid var(--border-color)",
                          backgroundColor: "var(--card-bg, #ffffff)",
                          color: "var(--foreground)",
                          fontSize: "0.8125rem",
                          minHeight: "110px"
                        }}
                      >
                        {teachers.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.user.name} ({t.user.email})
                          </option>
                        ))}
                      </select>
                      <span style={{ fontSize: "0.725rem", color: "var(--text-secondary)", marginTop: "0.2rem", display: "block" }}>
                        {formSelectedTeacherIds.length} teachers selected (plus Staff In-charge)
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Description & Agenda */}
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                  Description &amp; Agenda Details
                </label>
                <textarea
                  rows={3}
                  placeholder="Outline key discussion points, instructions, materials to bring, or meeting notes..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "transparent",
                    color: "var(--foreground)",
                    fontSize: "0.875rem",
                    resize: "vertical"
                  }}
                />
              </div>

              {/* Notification & Calendar Options */}
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
                padding: "0.85rem 1rem",
                borderRadius: "10px",
                backgroundColor: "rgba(0, 0, 0, 0.02)",
                border: "1px solid var(--border-color)"
              }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer", fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={formNotifyAttendees}
                    onChange={(e) => setFormNotifyAttendees(e.target.checked)}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <span>🔔 Send Real-Time Notification Pop-up immediately to all attendees</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer", fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={formSyncCalendar}
                    onChange={(e) => setFormSyncCalendar(e.target.checked)}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <span>📅 Synchronize to School Calendar as an official meeting event</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "0.75rem",
                paddingTop: "1rem",
                borderTop: "1px solid var(--border-color)"
              }}>
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  disabled={isPending}
                  style={{
                    padding: "0.6rem 1.25rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "transparent",
                    color: "var(--foreground)",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    padding: "0.6rem 1.4rem",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: modalMeetingType === "PARENTS" ? "#8b5cf6" : "var(--primary, #6366f1)",
                    color: "#ffffff",
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem"
                  }}
                >
                  {isPending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Scheduling...
                    </>
                  ) : (
                    <>
                      <Send size={16} /> Schedule &amp; Send Pop-up
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
