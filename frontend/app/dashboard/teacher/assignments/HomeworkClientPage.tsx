"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  BookOpen,
  Calendar as CalendarIcon,
  Trash2,
  MessageSquare,
  Sparkles,
  PlusCircle,
  GraduationCap,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Send,
  HeartHandshake,
  ExternalLink,
  History,
  Layers,
  LayoutDashboard,
  ShieldCheck,
  Check,
  UserCheck,
  Loader2
} from "lucide-react";
import { createAssignment, deleteAssignment } from "@/backend/api/actions/dashboard/teacher/assignments/actions";
import WorkConversationModal from "@/frontend/components/homework/WorkConversationModal";
import styles from "../../dashboard.module.css";

export type ClassWithSubjects = {
  id: string;
  name: string;
  section: string;
  subjects: {
    id: string;
    name: string;
    code: string;
    teacherId: string | null;
  }[];
};

export type AssignmentItem = {
  id: string;
  title: string;
  description: string | null;
  deadline: string;
  createdAt: string;
  fileUrl: string | null;
  class: {
    id: string;
    name: string;
    section: string;
  };
  subject: {
    id: string;
    name: string;
    code?: string;
    teacherId?: string | null;
    teacherName?: string | null;
  } | null;
  teacherName?: string;
  teacherId?: string;
  isOwner?: boolean;
  _count: {
    comments: number;
  };
};

interface HomeworkClientPageProps {
  teacher: {
    id: string;
    userId: string;
    name: string;
  };
  classes: ClassWithSubjects[];
  initialAssignments: AssignmentItem[];
  classPortalAssignments?: AssignmentItem[];
  involvedClasses?: { id: string; name: string; section: string }[];
}

export default function HomeworkClientPage({
  teacher,
  classes,
  initialAssignments,
  classPortalAssignments = [],
  involvedClasses = []
}: HomeworkClientPageProps) {
  // Tabs: CREATE, TODAY (Class Portal View), HISTORY
  const [activeTab, setActiveTab] = useState<"CREATE" | "TODAY" | "HISTORY">("TODAY");
  const [assignments, setAssignments] = useState<AssignmentItem[]>(initialAssignments);
  const [portalAssignments, setPortalAssignments] = useState<AssignmentItem[]>(classPortalAssignments);

  // Creator form state
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [startConversation, setStartConversation] = useState(true);
  const [shareWithParents, setShareWithParents] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createFeedback, setCreateFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Deleting state & modal
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<AssignmentItem | null>(null);

  // Active Work Conversation Modal state
  const [activeConversationItem, setActiveConversationItem] = useState<AssignmentItem | null>(null);

  // Filter state for Today's Class Portal View
  const [portalClassFilter, setPortalClassFilter] = useState<string>("ALL");
  const [portalTimeFilter, setPortalTimeFilter] = useState<"ALL" | "TODAY_GIVEN" | "TODAY_DUE">("ALL");

  // Filter state for history
  const [historyClassFilter, setHistoryClassFilter] = useState<string>("ALL");
  const [historySubjectFilter, setHistorySubjectFilter] = useState<string>("ALL");

  // Greeting generator based on local time
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: "Good morning", icon: "🌅", quote: "Inspire your students with meaningful learning today." };
    if (hour < 17) return { text: "Good afternoon", icon: "☀️", quote: "Celebrate today's lesson milestones and reinforce concepts." };
    return { text: "Good evening", icon: "🌙", quote: "Plan ahead and keep students and parents connected effortlessly." };
  }, []);

  // Filtered subjects for the selected class in creator (ONLY subjects assigned to this teacher!)
  const availableSubjectsForSelectedClass = useMemo(() => {
    if (!selectedClassId) return [];
    const cls = classes.find(c => c.id === selectedClassId);
    if (!cls) return [];

    // Strict isolation: only return subjects where this teacher is the assigned teacher
    return cls.subjects.filter(s => s.teacherId === teacher.id);
  }, [selectedClassId, classes, teacher.id]);

  // Handle Class change in Creator
  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId);
    const cls = classes.find(c => c.id === classId);
    if (cls) {
      const teacherSubjects = cls.subjects.filter(s => s.teacherId === teacher.id);
      if (teacherSubjects.length > 0) {
        setSelectedSubjectId(teacherSubjects[0].id);
      } else {
        setSelectedSubjectId("");
      }
    } else {
      setSelectedSubjectId("");
    }
  };

  // Quick deadline setter helper
  const setQuickDeadline = (daysAhead: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    setDeadline(d.toISOString().split("T")[0]);
  };

  // Check if dates are today
  const isDateToday = (dateString: string) => {
    const d = new Date(dateString);
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  };

  // Form submission handler
  const handleCreateHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;

    if (!selectedClassId || !selectedSubjectId || !title.trim() || !deadline) {
      setCreateFeedback({
        type: "error",
        text: "Please select an assigned class, select your subject, provide a title, and pick a due date."
      });
      return;
    }

    setCreating(true);
    setCreateFeedback(null);

    const formData = new FormData();
    formData.append("title", title.trim());
    formData.append("description", description.trim());
    formData.append("deadline", deadline);
    formData.append("classId", selectedClassId);
    formData.append("subjectId", selectedSubjectId);
    formData.append("teacherId", teacher.id);
    formData.append("startConversation", String(startConversation));

    const res = await createAssignment(formData);

    if (res.success && res.assignmentId) {
      const cls = classes.find(c => c.id === selectedClassId);
      const subj = cls?.subjects.find(s => s.id === selectedSubjectId);

      const newItem: AssignmentItem = {
        id: res.assignmentId,
        title: title.trim(),
        description: description.trim() || null,
        deadline: new Date(deadline.includes("T") ? deadline : `${deadline}T23:59:59`).toISOString(),
        createdAt: new Date().toISOString(),
        fileUrl: null,
        class: {
          id: selectedClassId,
          name: cls?.name || "Class",
          section: cls?.section || ""
        },
        subject: subj ? {
          id: subj.id,
          name: subj.name,
          code: subj.code,
          teacherId: teacher.id,
          teacherName: teacher.name
        } : null,
        teacherName: teacher.name,
        teacherId: teacher.id,
        isOwner: true,
        _count: {
          comments: startConversation ? 1 : 0
        }
      };

      setAssignments([newItem, ...assignments]);
      setPortalAssignments([newItem, ...portalAssignments]);
      setCreateFeedback({ type: "success", text: "✨ Home Work successfully assigned and sent to parents!" });

      // Reset form fields
      setTitle("");
      setDescription("");
      setDeadline("");

      // Switch to Today's Portal tab after a moment so teacher sees it
      setTimeout(() => {
        setActiveTab("TODAY");
      }, 1000);
    } else {
      setCreateFeedback({ type: "error", text: res.error || "Failed to create home work." });
    }

    setCreating(false);
  };

  // Individual Manual Delete Handler
  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setDeletingId(itemToDelete.id);

    const res = await deleteAssignment(itemToDelete.id);
    if (res.success) {
      setAssignments(prev => prev.filter(a => a.id !== itemToDelete.id));
      setPortalAssignments(prev => prev.filter(a => a.id !== itemToDelete.id));
      setItemToDelete(null);
    } else {
      alert("Failed to delete home work: " + (res.error || "Unknown error"));
    }
    setDeletingId(null);
  };

  // Filtered assignments for History tab
  const filteredHistoryAssignments = useMemo(() => {
    return assignments.filter(item => {
      if (historyClassFilter !== "ALL" && item.class.id !== historyClassFilter) return false;
      if (historySubjectFilter !== "ALL" && item.subject?.id !== historySubjectFilter) return false;
      return true;
    });
  }, [assignments, historyClassFilter, historySubjectFilter]);

  // Filtered assignments for Today's Class Portal tab
  const filteredPortalAssignments = useMemo(() => {
    return portalAssignments.filter(item => {
      if (portalClassFilter !== "ALL" && item.class.id !== portalClassFilter) return false;
      if (portalTimeFilter === "TODAY_GIVEN" && !isDateToday(item.createdAt)) return false;
      if (portalTimeFilter === "TODAY_DUE" && !isDateToday(item.deadline)) return false;
      return true;
    });
  }, [portalAssignments, portalClassFilter, portalTimeFilter]);

  // Unique subjects for history filter
  const historySubjectOptions = useMemo(() => {
    const map = new Map<string, string>();
    assignments.forEach(a => {
      if (a.subject) map.set(a.subject.id, a.subject.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [assignments]);

  // Counts for today's summary
  const todayGivenCount = useMemo(() => {
    return portalAssignments.filter(a => isDateToday(a.createdAt)).length;
  }, [portalAssignments]);

  const todayDueCount = useMemo(() => {
    return portalAssignments.filter(a => isDateToday(a.deadline)).length;
  }, [portalAssignments]);

  return (
    <div className={styles.dashboard}>
      {/* =========================================================
          PAGE HEADER WITH TOP TABS NAVIGATION
         ========================================================= */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "0.5rem" }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span>Home Work</span>
            <span style={{ fontSize: "0.75rem", padding: "3px 10px", borderRadius: "12px", backgroundColor: "rgba(99, 102, 241, 0.15)", color: "var(--primary)", fontWeight: 700 }}>
              Staff & Class Portal
            </span>
          </h1>
          <p style={{ margin: "0.25rem 0 0 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Assign subject tasks, view today&apos;s class homework, and converse directly with parents.
          </p>
        </div>

        {/* Top 3 Tab Switchers */}
        <div
          style={{
            display: "inline-flex",
            padding: "4px",
            backgroundColor: "var(--card)",
            borderRadius: "12px",
            border: "1px solid var(--border)",
            gap: "4px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.04)"
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("TODAY")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: activeTab === "TODAY" ? "var(--primary)" : "transparent",
              color: activeTab === "TODAY" ? "var(--primary-fg)" : "var(--foreground)",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            <LayoutDashboard size={15} />
            <span>Today&apos;s Home Work</span>
            {portalAssignments.length > 0 && (
              <span
                style={{
                  padding: "2px 6px",
                  borderRadius: "10px",
                  backgroundColor: activeTab === "TODAY" ? "rgba(255,255,255,0.25)" : "rgba(99, 102, 241, 0.15)",
                  color: activeTab === "TODAY" ? "#fff" : "var(--primary)",
                  fontSize: "0.75rem"
                }}
              >
                {portalAssignments.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("CREATE")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: activeTab === "CREATE" ? "var(--primary)" : "transparent",
              color: activeTab === "CREATE" ? "var(--primary-fg)" : "var(--foreground)",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            <PlusCircle size={15} />
            <span>Create Home Work</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("HISTORY")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: activeTab === "HISTORY" ? "var(--primary)" : "transparent",
              color: activeTab === "HISTORY" ? "var(--primary-fg)" : "var(--foreground)",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            <History size={15} />
            <span>My Subject History</span>
            {assignments.length > 0 && (
              <span
                style={{
                  padding: "2px 6px",
                  borderRadius: "10px",
                  backgroundColor: activeTab === "HISTORY" ? "rgba(255,255,255,0.25)" : "rgba(99, 102, 241, 0.15)",
                  color: activeTab === "HISTORY" ? "#fff" : "var(--primary)",
                  fontSize: "0.75rem"
                }}
              >
                {assignments.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* =========================================================
          TAB 1: TODAY'S HOME WORK (CLASS PORTAL VIEW)
         ========================================================= */}
      {activeTab === "TODAY" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Top Quick Stats Card */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1rem"
            }}
          >
            <div
              className={styles.chartCard}
              style={{
                padding: "1.25rem",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                borderRadius: "12px",
                border: "1px solid var(--border)"
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "12px",
                  backgroundColor: "rgba(99, 102, 241, 0.12)",
                  color: "var(--primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <BookOpen size={24} />
              </div>
              <div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>Total Active Tasks</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--foreground)", lineHeight: 1.1 }}>
                  {portalAssignments.length}
                </div>
              </div>
            </div>

            <div
              className={styles.chartCard}
              style={{
                padding: "1.25rem",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                borderRadius: "12px",
                border: "1px solid var(--border)"
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "12px",
                  backgroundColor: "rgba(16, 185, 129, 0.12)",
                  color: "var(--success)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Sparkles size={24} />
              </div>
              <div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>Assigned Today</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--success)", lineHeight: 1.1 }}>
                  {todayGivenCount}
                </div>
              </div>
            </div>

            <div
              className={styles.chartCard}
              style={{
                padding: "1.25rem",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                borderRadius: "12px",
                border: "1px solid var(--border)"
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "12px",
                  backgroundColor: "rgba(234, 179, 8, 0.12)",
                  color: "#ca8a04",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Clock size={24} />
              </div>
              <div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>Due Today</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#ca8a04", lineHeight: 1.1 }}>
                  {todayDueCount}
                </div>
              </div>
            </div>
          </div>

          {/* Filter Bar for Class Portal View */}
          <div
            className={styles.chartCard}
            style={{
              padding: "0.85rem 1.25rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                Class Portal Filter:
              </span>

              <select
                value={portalClassFilter}
                onChange={(e) => setPortalClassFilter(e.target.value)}
                style={{
                  padding: "0.45rem 0.85rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--background)",
                  color: "var(--foreground)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  outline: "none"
                }}
              >
                <option value="ALL">All My Classes ({involvedClasses.length})</option>
                {involvedClasses.map(c => (
                  <option key={c.id} value={c.id}>{c.name} - {c.section}</option>
                ))}
              </select>

              <select
                value={portalTimeFilter}
                onChange={(e) => setPortalTimeFilter(e.target.value as any)}
                style={{
                  padding: "0.45rem 0.85rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--background)",
                  color: "var(--foreground)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  outline: "none"
                }}
              >
                <option value="ALL">All Active Tasks</option>
                <option value="TODAY_GIVEN">Given Today ({todayGivenCount})</option>
                <option value="TODAY_DUE">Due Today ({todayDueCount})</option>
              </select>
            </div>

            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <Clock size={14} style={{ color: "#ca8a04" }} />
              <span>Homework automatically cleans up once deadline passes</span>
            </div>
          </div>

          {/* Today's Tasks List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {filteredPortalAssignments.map((item) => {
              const createdToday = isDateToday(item.createdAt);
              const dueToday = isDateToday(item.deadline);

              return (
                <div
                  key={item.id}
                  className={styles.chartCard}
                  style={{
                    padding: "1.25rem 1.5rem",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: "1rem",
                    transition: "transform 0.15s, box-shadow 0.15s"
                  }}
                >
                  <div style={{ flex: "1 1 350px", minWidth: "260px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                      {/* Subject Badge */}
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          padding: "3px 10px",
                          borderRadius: "12px",
                          backgroundColor: "rgba(99, 102, 241, 0.12)",
                          color: "var(--primary)",
                          fontSize: "0.75rem",
                          fontWeight: 700
                        }}
                      >
                        <BookOpen size={13} />
                        {item.subject?.name || "General Subject"}
                      </span>

                      {/* Class Badge */}
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          padding: "3px 10px",
                          borderRadius: "12px",
                          backgroundColor: "rgba(16, 185, 129, 0.12)",
                          color: "var(--success)",
                          fontSize: "0.75rem",
                          fontWeight: 700
                        }}
                      >
                        <GraduationCap size={13} />
                        {item.class.name} - {item.class.section}
                      </span>

                      {/* Staff in Charge Badge */}
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          padding: "3px 10px",
                          borderRadius: "12px",
                          backgroundColor: "rgba(100, 116, 139, 0.1)",
                          color: "var(--text-secondary)",
                          fontSize: "0.75rem",
                          fontWeight: 600
                        }}
                      >
                        <UserCheck size={12} />
                        Staff: {item.subject?.teacherName || item.teacherName}
                      </span>

                      {/* Today Status Pill */}
                      {createdToday && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            padding: "3px 9px",
                            borderRadius: "12px",
                            backgroundColor: "rgba(16, 185, 129, 0.15)",
                            color: "var(--success)",
                            fontSize: "0.75rem",
                            fontWeight: 700
                          }}
                        >
                          ✨ Given Today
                        </span>
                      )}

                      {dueToday && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            padding: "3px 9px",
                            borderRadius: "12px",
                            backgroundColor: "rgba(234, 179, 8, 0.15)",
                            color: "#ca8a04",
                            fontSize: "0.75rem",
                            fontWeight: 700
                          }}
                        >
                          ⚠️ Due Today
                        </span>
                      )}
                    </div>

                    <h3 style={{ margin: "0.35rem 0", fontSize: "1.15rem", fontWeight: 700, color: "var(--foreground)" }}>
                      {item.title}
                    </h3>

                    <p style={{ margin: "0.25rem 0 0.5rem 0", fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {item.description || "No specific instructions provided."}
                    </p>

                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                        <CalendarIcon size={13} />
                        Assigned: {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: 600, color: dueToday ? "#ca8a04" : "var(--foreground)" }}>
                        <Clock size={13} />
                        Due: {new Date(item.deadline).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Actions Area */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", alignSelf: "center" }}>
                    <button
                      type="button"
                      onClick={() => setActiveConversationItem(item)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        padding: "7px 14px",
                        borderRadius: "8px",
                        backgroundColor: "rgba(99, 102, 241, 0.12)",
                        border: "1px solid rgba(99, 102, 241, 0.25)",
                        color: "var(--primary)",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      <MessageSquare size={15} />
                      <span>Work Conversation ({item._count.comments})</span>
                    </button>

                    <Link
                      href={`/dashboard/teacher/assignments/${item.id}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        padding: "7px 14px",
                        borderRadius: "8px",
                        backgroundColor: "var(--background)",
                        border: "1px solid var(--border)",
                        color: "var(--foreground)",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        textDecoration: "none"
                      }}
                    >
                      <ExternalLink size={14} />
                      <span>Open Console</span>
                    </Link>

                    {/* Delete Option: Only available if the teacher is the assigned staff or admin */}
                    {item.isOwner ? (
                      <button
                        type="button"
                        onClick={() => setItemToDelete(item)}
                        title="Delete Home Work"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "7px 10px",
                          borderRadius: "8px",
                          backgroundColor: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid rgba(239, 68, 68, 0.25)",
                          color: "var(--danger)",
                          cursor: "pointer"
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : (
                      <span
                        title="Controlled by assigned subject teacher"
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-secondary)",
                          fontStyle: "italic",
                          padding: "4px 8px"
                        }}
                      >
                        View Only
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredPortalAssignments.length === 0 && (
              <div
                className={styles.chartCard}
                style={{ textAlign: "center", padding: "3rem 1.5rem", color: "var(--text-secondary)" }}
              >
                <FileText size={44} style={{ opacity: 0.3, margin: "0 auto 0.75rem" }} />
                <h4 style={{ margin: "0 0 0.4rem 0", color: "var(--foreground)", fontSize: "1.1rem" }}>
                  No Active Home Work Found for Today
                </h4>
                <p style={{ margin: "0 0 1rem 0", fontSize: "0.85rem" }}>
                  {portalClassFilter !== "ALL"
                    ? "No homework has been assigned for this class yet."
                    : "Create homework from the 'Create Home Work' tab to notify parents and start the work conversation."}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("CREATE")}
                  style={{
                    padding: "0.6rem 1.25rem",
                    borderRadius: "8px",
                    backgroundColor: "var(--primary)",
                    color: "var(--primary-fg)",
                    border: "none",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    cursor: "pointer"
                  }}
                >
                  ➕ Assign Home Work Now
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================
          TAB 2: CREATE HOME WORK (TEACHER UI/UX GREETING CREATOR)
         ========================================================= */}
      {activeTab === "CREATE" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Friendly Free Greeting Banner */}
          <div
            style={{
              padding: "1.75rem 2rem",
              borderRadius: "16px",
              background: "linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(168, 85, 247, 0.1) 100%)",
              border: "1px solid rgba(99, 102, 241, 0.25)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1.25rem"
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                <span style={{ fontSize: "1.6rem" }}>{greeting.icon}</span>
                <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "var(--foreground)" }}>
                  {greeting.text}, {teacher.name}!
                </h2>
              </div>
              <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--text-secondary)", maxWidth: "600px" }}>
                {greeting.quote} Select your assigned class and subject below to assign today&apos;s tasks directly to students and parents.
              </p>
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "8px 16px",
                borderRadius: "10px",
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                color: "var(--success)",
                fontWeight: 700,
                fontSize: "0.85rem"
              }}
            >
              <ShieldCheck size={18} />
              <span>Subject Staff Authorized</span>
            </div>
          </div>

          {/* Form Card */}
          <div className={styles.chartCard} style={{ padding: "2rem" }}>
            <div style={{ marginBottom: "1.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "var(--foreground)" }}>
                Assign New Home Work
              </h3>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Strict Subject Control: You can only create homework for subjects and classes assigned to you. When staff assignments change in Admin, control transfers automatically.
              </p>
            </div>

            {classes.length === 0 ? (
              <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--text-secondary)" }}>
                <AlertCircle size={40} style={{ color: "#ca8a04", margin: "0 auto 0.75rem" }} />
                <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--foreground)", fontSize: "1.1rem" }}>
                  No Assigned Subjects Found
                </h4>
                <p style={{ margin: 0, fontSize: "0.9rem", maxWidth: "500px", marginLeft: "auto", marginRight: "auto" }}>
                  You are not currently assigned as the subject staff for any class subjects. Only assigned subject teachers can send homework. Please contact the administrator to assign your subjects.
                </p>
              </div>
            ) : (
              <form onSubmit={handleCreateHomework} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                {createFeedback && (
                  <div
                    style={{
                      padding: "0.85rem 1.25rem",
                      borderRadius: "8px",
                      backgroundColor: createFeedback.type === "success" ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                      color: createFeedback.type === "success" ? "var(--success)" : "var(--danger)",
                      border: `1px solid ${createFeedback.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                      fontSize: "0.9rem",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem"
                    }}
                  >
                    {createFeedback.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    <span>{createFeedback.text}</span>
                  </div>
                )}

                {/* Class & Subject Selectors */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 700, marginBottom: "0.4rem", color: "var(--foreground)" }}>
                      1. Select Class *
                    </label>
                    <select
                      value={selectedClassId}
                      onChange={(e) => handleClassChange(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: "0.75rem 1rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        backgroundColor: "var(--background)",
                        color: "var(--foreground)",
                        fontSize: "0.95rem",
                        outline: "none"
                      }}
                    >
                      <option value="">-- Choose Assigned Class --</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} - Section {c.section} ({c.subjects.length} assigned subject{c.subjects.length > 1 ? "s" : ""})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 700, marginBottom: "0.4rem", color: "var(--foreground)" }}>
                      2. Assigned Subject *
                    </label>
                    <select
                      value={selectedSubjectId}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
                      disabled={!selectedClassId || availableSubjectsForSelectedClass.length === 0}
                      required
                      style={{
                        width: "100%",
                        padding: "0.75rem 1rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        backgroundColor: "var(--background)",
                        color: "var(--foreground)",
                        fontSize: "0.95rem",
                        outline: "none",
                        opacity: !selectedClassId ? 0.6 : 1
                      }}
                    >
                      <option value="">-- Choose Subject --</option>
                      {availableSubjectsForSelectedClass.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code}) - Assigned to You
                        </option>
                      ))}
                    </select>
                    {selectedClassId && availableSubjectsForSelectedClass.length > 0 && (
                      <span style={{ fontSize: "0.75rem", color: "var(--success)", display: "inline-flex", alignItems: "center", gap: "0.25rem", marginTop: "0.25rem" }}>
                        <Check size={12} /> Assigned Staff: You ({teacher.name})
                      </span>
                    )}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 700, marginBottom: "0.4rem", color: "var(--foreground)" }}>
                    3. Home Work Title / Topic *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Mathematics: Chapter 5 Exercise Sums 1 to 10"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "0.75rem 1rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      backgroundColor: "var(--background)",
                      color: "var(--foreground)",
                      fontSize: "0.95rem",
                      outline: "none"
                    }}
                  />
                </div>

                {/* Deadline with Quick Shortcut Badges */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.4rem" }}>
                    <label style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
                      4. Due Date / Deadline *
                    </label>
                    <div style={{ display: "flex", gap: "0.35rem" }}>
                      <button
                        type="button"
                        onClick={() => setQuickDeadline(1)}
                        style={{
                          padding: "3px 8px",
                          borderRadius: "6px",
                          border: "1px solid var(--border)",
                          backgroundColor: "var(--background)",
                          color: "var(--text-secondary)",
                          fontSize: "0.75rem",
                          cursor: "pointer"
                        }}
                      >
                        Tomorrow (+1 Day)
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickDeadline(2)}
                        style={{
                          padding: "3px 8px",
                          borderRadius: "6px",
                          border: "1px solid var(--border)",
                          backgroundColor: "var(--background)",
                          color: "var(--text-secondary)",
                          fontSize: "0.75rem",
                          cursor: "pointer"
                        }}
                      >
                        +2 Days
                      </button>
                    </div>
                  </div>
                  <input
                    type="date"
                    value={deadline}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setDeadline(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "0.75rem 1rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      backgroundColor: "var(--background)",
                      color: "var(--foreground)",
                      fontSize: "0.95rem",
                      outline: "none"
                    }}
                  />
                </div>

                {/* Instructions / Description */}
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 700, marginBottom: "0.4rem", color: "var(--foreground)" }}>
                    5. Instructions & Details for Students & Parents
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Provide specific exercises, page numbers, or notes for parents to guide their child..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.75rem 1rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      backgroundColor: "var(--background)",
                      color: "var(--foreground)",
                      fontSize: "0.95rem",
                      outline: "none",
                      resize: "vertical"
                    }}
                  />
                </div>

                {/* Conversation Switch */}
                <div
                  style={{
                    padding: "1rem",
                    borderRadius: "10px",
                    backgroundColor: "var(--background)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1rem"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "8px", backgroundColor: "rgba(99, 102, 241, 0.12)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <HeartHandshake size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--foreground)" }}>
                        Start Work Conversation with Parents
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        Posts an immediate friendly greeting and open forum for parents to ask questions about this homework.
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={startConversation}
                    onChange={(e) => setStartConversation(e.target.checked)}
                    style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "var(--primary)" }}
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={creating}
                  style={{
                    padding: "0.85rem 1.75rem",
                    borderRadius: "10px",
                    border: "none",
                    backgroundColor: "var(--primary)",
                    color: "var(--primary-fg)",
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    cursor: creating ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    marginTop: "0.5rem",
                    boxShadow: "0 4px 12px rgba(99, 102, 241, 0.25)",
                    opacity: creating ? 0.75 : 1
                  }}
                >
                  {creating ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Sending Home Work...</span>
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      <span>Send Home Work to Class & Parents</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* =========================================================
          TAB 3: MY SUBJECT HISTORY & CONTROL
         ========================================================= */}
      {activeTab === "HISTORY" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Filters Bar */}
          <div
            className={styles.chartCard}
            style={{
              padding: "0.85rem 1.25rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                Filter History:
              </span>

              {/* Class Filter */}
              <select
                value={historyClassFilter}
                onChange={(e) => setHistoryClassFilter(e.target.value)}
                style={{
                  padding: "0.45rem 0.85rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--background)",
                  color: "var(--foreground)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  outline: "none"
                }}
              >
                <option value="ALL">All Assigned Classes ({classes.length})</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name} - {c.section}</option>
                ))}
              </select>

              {/* Subject Filter */}
              <select
                value={historySubjectFilter}
                onChange={(e) => setHistorySubjectFilter(e.target.value)}
                style={{
                  padding: "0.45rem 0.85rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--background)",
                  color: "var(--foreground)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  outline: "none"
                }}
              >
                <option value="ALL">All Subjects ({historySubjectOptions.length})</option>
                {historySubjectOptions.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <Clock size={14} style={{ color: "#ca8a04" }} />
              <span>Each homework automatically cleans up when its deadline expires</span>
            </div>
          </div>

          {/* History List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {filteredHistoryAssignments.map((item) => (
              <div
                key={item.id}
                className={styles.chartCard}
                style={{
                  padding: "1.25rem 1.5rem",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: "1rem"
                }}
              >
                <div style={{ flex: "1 1 350px", minWidth: "260px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "3px 10px",
                        borderRadius: "12px",
                        backgroundColor: "rgba(99, 102, 241, 0.12)",
                        color: "var(--primary)",
                        fontSize: "0.75rem",
                        fontWeight: 700
                      }}
                    >
                      <BookOpen size={13} />
                      {item.subject?.name || "General Subject"}
                    </span>

                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "3px 10px",
                        borderRadius: "12px",
                        backgroundColor: "rgba(16, 185, 129, 0.12)",
                        color: "var(--success)",
                        fontSize: "0.75rem",
                        fontWeight: 700
                      }}
                    >
                      <GraduationCap size={13} />
                      {item.class.name} - {item.class.section}
                    </span>

                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "3px 10px",
                        borderRadius: "12px",
                        backgroundColor: "rgba(100, 116, 139, 0.1)",
                        color: "var(--text-secondary)",
                        fontSize: "0.75rem",
                        fontWeight: 600
                      }}
                    >
                      <UserCheck size={12} />
                      Staff: {item.subject?.teacherName || item.teacherName}
                    </span>
                  </div>

                  <h3 style={{ margin: "0.35rem 0", fontSize: "1.15rem", fontWeight: 700, color: "var(--foreground)" }}>
                    {item.title}
                  </h3>

                  <p style={{ margin: "0.25rem 0 0.5rem 0", fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {item.description || "No specific instructions provided."}
                  </p>

                  <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                      <CalendarIcon size={13} />
                      Assigned: {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: 600, color: "var(--foreground)" }}>
                      <Clock size={13} />
                      Due: {new Date(item.deadline).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Actions Area */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", alignSelf: "center" }}>
                  <button
                    type="button"
                    onClick={() => setActiveConversationItem(item)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      padding: "7px 14px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(99, 102, 241, 0.12)",
                      border: "1px solid rgba(99, 102, 241, 0.25)",
                      color: "var(--primary)",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    <MessageSquare size={15} />
                    <span>Work Conversation ({item._count.comments})</span>
                  </button>

                  <Link
                    href={`/dashboard/teacher/assignments/${item.id}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      padding: "7px 14px",
                      borderRadius: "8px",
                      backgroundColor: "var(--background)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      textDecoration: "none"
                    }}
                  >
                    <ExternalLink size={14} />
                    <span>Open Console</span>
                  </Link>

                  {/* Individual Delete Option */}
                  <button
                    type="button"
                    onClick={() => setItemToDelete(item)}
                    title="Manual Delete Option"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      padding: "7px 12px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid rgba(239, 68, 68, 0.25)",
                      color: "var(--danger)",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    <Trash2 size={15} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))}

            {filteredHistoryAssignments.length === 0 && (
              <div
                className={styles.chartCard}
                style={{ textAlign: "center", padding: "3rem 1.5rem", color: "var(--text-secondary)" }}
              >
                <FileText size={44} style={{ opacity: 0.3, margin: "0 auto 0.75rem" }} />
                <h4 style={{ margin: "0 0 0.4rem 0", color: "var(--foreground)", fontSize: "1.1rem" }}>
                  No Home Work Found in History
                </h4>
                <p style={{ margin: 0, fontSize: "0.85rem" }}>
                  {assignments.length === 0
                    ? "Active home work will appear here until its deadline expires."
                    : "No home work records match the selected class or subject filters."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================
          INDIVIDUAL MANUAL DELETE CONFIRMATION MODAL
         ========================================================= */}
      {itemToDelete && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "1rem"
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setItemToDelete(null);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "460px",
              backgroundColor: "var(--card)",
              borderRadius: "16px",
              border: "1px solid var(--border)",
              boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
              padding: "1.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ width: 44, height: 44, borderRadius: "12px", backgroundColor: "rgba(239, 68, 68, 0.15)", color: "var(--danger)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Trash2 size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "var(--foreground)" }}>
                  Delete Home Work?
                </h3>
                <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                  This action is permanent and removes this homework for parents immediately.
                </p>
              </div>
            </div>

            <div style={{ padding: "0.85rem", borderRadius: "10px", backgroundColor: "var(--background)", border: "1px solid var(--border)", fontSize: "0.9rem" }}>
              <div style={{ fontWeight: 700, color: "var(--foreground)" }}>{itemToDelete.title}</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                Class: {itemToDelete.class.name} - {itemToDelete.class.section} • Subject: {itemToDelete.subject?.name || "General"}
              </div>
            </div>

            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Deleting this home work will remove it from both your dashboard and parents&apos; portals immediately.
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                disabled={deletingId !== null}
                style={{
                  padding: "0.65rem 1.25rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  backgroundColor: "transparent",
                  color: "var(--foreground)",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.9rem"
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deletingId !== null}
                style={{
                  padding: "0.65rem 1.25rem",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "var(--danger)",
                  color: "#fff",
                  cursor: deletingId !== null ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem"
                }}
              >
                <Trash2 size={15} />
                {deletingId !== null ? "Deleting..." : "Yes, Delete Home Work"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          WORK CONVERSATION MODAL
         ========================================================= */}
      {activeConversationItem && (
        <WorkConversationModal
          isOpen={true}
          onClose={() => setActiveConversationItem(null)}
          assignmentId={activeConversationItem.id}
          assignmentTitle={activeConversationItem.title}
          subjectName={activeConversationItem.subject?.name}
          className={`${activeConversationItem.class.name} - ${activeConversationItem.class.section}`}
          teacherName={activeConversationItem.subject?.teacherName || activeConversationItem.teacherName || teacher.name}
          currentUser={{
            id: teacher.userId,
            name: teacher.name,
            role: "TEACHER"
          }}
          onCommentsUpdated={(newCount: number) => {
            setAssignments(prev => prev.map(a => a.id === activeConversationItem.id ? {
              ...a,
              _count: { comments: newCount }
            } : a));
            setPortalAssignments(prev => prev.map(a => a.id === activeConversationItem.id ? {
              ...a,
              _count: { comments: newCount }
            } : a));
          }}
        />
      )}
    </div>
  );
}
