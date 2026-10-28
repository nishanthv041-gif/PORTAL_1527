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
  Users,
  Send,
  HeartHandshake
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
    code: string;
  } | null;
  _count: {
    submissions: number;
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
}

export default function HomeworkClientPage({
  teacher,
  classes,
  initialAssignments
}: HomeworkClientPageProps) {
  const [assignments, setAssignments] = useState<AssignmentItem[]>(initialAssignments);
  
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

  // Filter state for history
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "PAST_DUE">("ALL");
  const [classFilter, setClassFilter] = useState<string>("ALL");
  const [subjectFilter, setSubjectFilter] = useState<string>("ALL");

  // Greeting generator based on local time
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: "Good morning", icon: "🌅", quote: "Inspire your students with meaningful learning today." };
    if (hour < 17) return { text: "Good afternoon", icon: "☀️", quote: "Celebrate today's lesson milestones and reinforce concepts." };
    return { text: "Good evening", icon: "🌙", quote: "Plan ahead and keep students and parents connected effortlessly." };
  }, []);

  // Filtered subjects for the selected class in creator
  const availableSubjectsForSelectedClass = useMemo(() => {
    if (!selectedClassId) return [];
    const cls = classes.find(c => c.id === selectedClassId);
    if (!cls) return [];
    
    // Filter subjects taught by this teacher in this class
    const teacherSubjects = cls.subjects.filter(s => s.teacherId === teacher.id);
    return teacherSubjects.length > 0 ? teacherSubjects : cls.subjects;
  }, [selectedClassId, classes, teacher.id]);

  // Handle Class change in Creator
  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId);
    const cls = classes.find(c => c.id === classId);
    if (cls) {
      const teacherSubjects = cls.subjects.filter(s => s.teacherId === teacher.id);
      if (teacherSubjects.length === 1) {
        setSelectedSubjectId(teacherSubjects[0].id);
      } else if (teacherSubjects.length > 0) {
        setSelectedSubjectId(teacherSubjects[0].id);
      } else if (cls.subjects.length > 0) {
        setSelectedSubjectId(cls.subjects[0].id);
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

  // Form submission handler
  const handleCreateHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassId || !title.trim() || !deadline) {
      setCreateFeedback({ type: "error", text: "Please choose a class, provide a title, and select a due date." });
      return;
    }

    setCreating(true);
    setCreateFeedback(null);

    const formData = new FormData();
    formData.append("title", title.trim());
    formData.append("description", description.trim());
    formData.append("deadline", deadline);
    formData.append("classId", selectedClassId);
    if (selectedSubjectId) {
      formData.append("subjectId", selectedSubjectId);
    }
    formData.append("teacherId", teacher.id);
    formData.append("startConversation", startConversation ? "true" : "false");

    const res = await createAssignment(formData);

    if (res.success && res.assignmentId) {
      const currentClass = classes.find(c => c.id === selectedClassId);
      const currentSubject = currentClass?.subjects.find(s => s.id === selectedSubjectId);

      const newItem: AssignmentItem = {
        id: res.assignmentId,
        title: title.trim(),
        description: description.trim() || null,
        deadline: new Date(deadline).toISOString(),
        createdAt: new Date().toISOString(),
        fileUrl: null,
        class: {
          id: selectedClassId,
          name: currentClass?.name || "Class",
          section: currentClass?.section || ""
        },
        subject: currentSubject ? {
          id: currentSubject.id,
          name: currentSubject.name,
          code: currentSubject.code
        } : null,
        _count: {
          submissions: 0,
          comments: startConversation ? 1 : 0
        }
      };

      setAssignments([newItem, ...assignments]);
      setCreateFeedback({ type: "success", text: "✨ Home Work successfully assigned and sent to students & parents!" });
      
      // Reset form fields
      setTitle("");
      setDescription("");
      setDeadline("");
    } else {
      setCreateFeedback({ type: "error", text: res.error || "Failed to create home work." });
    }

    setCreating(false);
  };

  // Individual Delete Handler
  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setDeletingId(itemToDelete.id);

    const res = await deleteAssignment(itemToDelete.id);
    if (res.success) {
      setAssignments(assignments.filter(a => a.id !== itemToDelete.id));
      setItemToDelete(null);
    } else {
      alert("Failed to delete home work: " + res.error);
    }
    setDeletingId(null);
  };

  // Filtered list of assignments for history
  const filteredAssignments = useMemo(() => {
    return assignments.filter(item => {
      const now = new Date();
      const isPastDue = new Date(item.deadline) < now;

      if (statusFilter === "ACTIVE" && isPastDue) return false;
      if (statusFilter === "PAST_DUE" && !isPastDue) return false;
      if (classFilter !== "ALL" && item.class.id !== classFilter) return false;
      if (subjectFilter !== "ALL" && item.subject?.id !== subjectFilter) return false;

      return true;
    });
  }, [assignments, statusFilter, classFilter, subjectFilter]);

  // Unique subjects for filter
  const allSubjects = useMemo(() => {
    const map = new Map<string, string>();
    classes.forEach(c => {
      c.subjects.forEach(s => {
        if (!map.has(s.id)) map.set(s.id, s.name);
      });
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [classes]);

  return (
    <div className={styles.dashboard}>
      {/* Friendly Free Greeting with UI/UX for Teacher */}
      <div
        style={{
          borderRadius: "16px",
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(168, 85, 247, 0.12) 50%, rgba(236, 72, 153, 0.08) 100%)",
          border: "1px solid rgba(99, 102, 241, 0.25)",
          padding: "1.75rem 2rem",
          boxShadow: "0 4px 20px rgba(99, 102, 241, 0.06)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1.5rem"
        }}
      >
        <div style={{ flex: "1 1 340px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "4px 12px", borderRadius: "20px", backgroundColor: "rgba(99, 102, 241, 0.15)", color: "var(--primary)", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.6rem" }}>
            <Sparkles size={14} />
            <span>Teacher Workspace • Home Work Portal</span>
          </div>

          <h1 style={{ margin: "0 0 0.4rem 0", fontSize: "1.85rem", fontWeight: 800, color: "var(--foreground)" }}>
            {greeting.icon} {greeting.text}, {teacher.name}!
          </h1>
          <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {greeting.quote} Select your assigned class & subject below to send homework and connect with parents.
          </p>
        </div>

        {/* Quick Teacher Metrics */}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ padding: "0.75rem 1.25rem", borderRadius: "12px", backgroundColor: "var(--card)", border: "1px solid var(--border)", textAlign: "center", minWidth: "105px" }}>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--primary)" }}>{classes.length}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Classes</div>
          </div>
          <div style={{ padding: "0.75rem 1.25rem", borderRadius: "12px", backgroundColor: "var(--card)", border: "1px solid var(--border)", textAlign: "center", minWidth: "105px" }}>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--success)" }}>{allSubjects.length}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Subjects</div>
          </div>
          <div style={{ padding: "0.75rem 1.25rem", borderRadius: "12px", backgroundColor: "var(--card)", border: "1px solid var(--border)", textAlign: "center", minWidth: "105px" }}>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#ec4899" }}>{assignments.length}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Home Works</div>
          </div>
        </div>
      </div>

      {/* Main Grid: Home Creater (Left) + Home Work History (Right) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))", gap: "1.75rem", alignItems: "start" }}>
        
        {/* =========================================
            SECTION 1: THE HOME WORK CREATOR
           ========================================= */}
        <div className={styles.chartCard} style={{ padding: "1.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
            <div style={{ width: 36, height: 36, borderRadius: "10px", backgroundColor: "rgba(99, 102, 241, 0.15)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <PlusCircle size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, color: "var(--foreground)" }}>
                Home Work Creator
              </h2>
              <p style={{ margin: 0, fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                Assign homework to your class and link it to subject discussions
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateHomework} style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginTop: "1rem" }}>
            
            {/* Class & Subject Selector Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              {/* Class Dropdown */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)" }}>
                  1. Select Class <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => handleClassChange(e.target.value)}
                  required
                  style={{
                    padding: "0.75rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--background)",
                    color: "var(--foreground)",
                    fontSize: "0.9rem",
                    outline: "none"
                  }}
                >
                  <option value="">-- Choose Assigned Class --</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} - {c.section}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject Dropdown */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)" }}>
                  2. Select Subject <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  disabled={!selectedClassId}
                  required
                  style={{
                    padding: "0.75rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    backgroundColor: selectedClassId ? "var(--background)" : "rgba(0,0,0,0.04)",
                    color: "var(--foreground)",
                    fontSize: "0.9rem",
                    outline: "none",
                    cursor: selectedClassId ? "pointer" : "not-allowed"
                  }}
                >
                  {!selectedClassId ? (
                    <option value="">(Select class first)</option>
                  ) : availableSubjectsForSelectedClass.length === 0 ? (
                    <option value="">No subjects found</option>
                  ) : (
                    availableSubjectsForSelectedClass.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.teacherId === teacher.id ? "⭐ (Your Subject)" : ""}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* Helper note */}
            {selectedClassId && availableSubjectsForSelectedClass.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", color: "var(--primary)" }}>
                <CheckCircle2 size={13} />
                <span>Selected subject will connect this homework to the class work conversation.</span>
              </div>
            )}

            {/* Title */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)" }}>
                Home Work Title <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g. Chapter 4 Exercises: Questions 1 to 10"
                style={{
                  padding: "0.75rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--background)",
                  color: "var(--foreground)",
                  fontSize: "0.9rem",
                  outline: "none"
                }}
              />
            </div>

            {/* Due Date & Quick Presets */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)" }}>
                  Submission Deadline <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  <button
                    type="button"
                    onClick={() => setQuickDeadline(1)}
                    style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: "12px", border: "1px solid var(--border)", backgroundColor: "var(--card)", cursor: "pointer", color: "var(--text-secondary)" }}
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickDeadline(3)}
                    style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: "12px", border: "1px solid var(--border)", backgroundColor: "var(--card)", cursor: "pointer", color: "var(--text-secondary)" }}
                  >
                    In 3 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickDeadline(7)}
                    style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: "12px", border: "1px solid var(--border)", backgroundColor: "var(--card)", cursor: "pointer", color: "var(--text-secondary)" }}
                  >
                    Next Week
                  </button>
                </div>
              </div>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                required
                style={{
                  padding: "0.75rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--background)",
                  color: "var(--foreground)",
                  fontSize: "0.9rem",
                  outline: "none"
                }}
              />
            </div>

            {/* Description / Instructions */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)" }}>
                Instructions & Homework Details
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Mention textbook pages, special guidelines, or questions for students and parents..."
                style={{
                  padding: "0.75rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--background)",
                  color: "var(--foreground)",
                  fontSize: "0.9rem",
                  outline: "none",
                  resize: "vertical"
                }}
              />
            </div>

            {/* Connected Work Conversation & Parents toggles */}
            <div
              style={{
                padding: "0.85rem 1rem",
                borderRadius: "10px",
                backgroundColor: "rgba(99, 102, 241, 0.05)",
                border: "1px solid rgba(99, 102, 241, 0.15)",
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem"
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.85rem", color: "var(--foreground)", fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={startConversation}
                  onChange={(e) => setStartConversation(e.target.checked)}
                  style={{ accentColor: "var(--primary)", width: 16, height: 16 }}
                />
                <span>💬 Start Home Work Discussion thread with parents and students</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.85rem", color: "var(--foreground)", fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={shareWithParents}
                  onChange={(e) => setShareWithParents(e.target.checked)}
                  style={{ accentColor: "var(--primary)", width: 16, height: 16 }}
                />
                <span>👨‍👩‍👧‍👦 Visible to Parents on their Home Work page + Notification</span>
              </label>
            </div>

            {/* Feedback message */}
            {createFeedback && (
              <div
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  backgroundColor: createFeedback.type === "success" ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                  color: createFeedback.type === "success" ? "var(--success)" : "var(--danger)",
                  border: `1px solid ${createFeedback.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                  fontSize: "0.85rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem"
                }}
              >
                {createFeedback.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{createFeedback.text}</span>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={creating}
              style={{
                padding: "0.9rem",
                borderRadius: "8px",
                backgroundColor: "var(--primary)",
                color: "var(--primary-fg)",
                border: "none",
                fontWeight: 700,
                fontSize: "0.95rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                cursor: creating ? "not-allowed" : "pointer",
                opacity: creating ? 0.7 : 1,
                boxShadow: "0 2px 8px rgba(99, 102, 241, 0.2)"
              }}
            >
              <Send size={16} />
              {creating ? "Assigning Home Work..." : "Assign & Send Home Work"}
            </button>
          </form>
        </div>

        {/* =========================================
            SECTION 2: HOME WORK HISTORY & DELETE
           ========================================= */}
        <div className={styles.chartCard} style={{ padding: "1.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Clock size={20} style={{ color: "var(--primary)" }} />
                <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, color: "var(--foreground)" }}>
                  Home Work History
                </h2>
              </div>
              <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                Saved records with individual delete and conversation access ({filteredAssignments.length} shown)
              </p>
            </div>

            {/* Status Pills */}
            <div style={{ display: "flex", gap: "0.3rem", backgroundColor: "var(--background)", padding: "3px", borderRadius: "8px", border: "1px solid var(--border)" }}>
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: statusFilter === "ALL" ? "var(--primary)" : "transparent",
                  color: statusFilter === "ALL" ? "var(--primary-fg)" : "var(--text-secondary)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("ACTIVE")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: statusFilter === "ACTIVE" ? "var(--primary)" : "transparent",
                  color: statusFilter === "ACTIVE" ? "var(--primary-fg)" : "var(--text-secondary)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("PAST_DUE")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: statusFilter === "PAST_DUE" ? "var(--primary)" : "transparent",
                  color: statusFilter === "PAST_DUE" ? "var(--primary-fg)" : "var(--text-secondary)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Past Due
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              style={{
                flex: "1 1 140px",
                padding: "0.45rem 0.65rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--background)",
                color: "var(--foreground)",
                fontSize: "0.8rem",
                outline: "none"
              }}
            >
              <option value="ALL">All Classes</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name} - {c.section}</option>
              ))}
            </select>

            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              style={{
                flex: "1 1 140px",
                padding: "0.45rem 0.65rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--background)",
                color: "var(--foreground)",
                fontSize: "0.8rem",
                outline: "none"
              }}
            >
              <option value="ALL">All Subjects</option>
              {allSubjects.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* History Cards List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxHeight: "650px", overflowY: "auto", paddingRight: "4px" }}>
            {filteredAssignments.map((item) => {
              const isPastDue = new Date(item.deadline) < new Date();

              return (
                <div
                  key={item.id}
                  style={{
                    padding: "1.2rem",
                    borderRadius: "12px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--background)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.8rem",
                    transition: "all 0.2s ease"
                  }}
                >
                  {/* Card Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                      <span
                        style={{
                          padding: "3px 9px",
                          borderRadius: "12px",
                          backgroundColor: "rgba(99, 102, 241, 0.14)",
                          color: "var(--primary)",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem"
                        }}
                      >
                        <BookOpen size={12} />
                        {item.subject?.name || "General"}
                      </span>

                      <span
                        style={{
                          padding: "3px 9px",
                          borderRadius: "12px",
                          backgroundColor: "rgba(16, 185, 129, 0.14)",
                          color: "var(--success)",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem"
                        }}
                      >
                        <GraduationCap size={12} />
                        {item.class.name} - {item.class.section}
                      </span>

                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: "12px",
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          backgroundColor: isPastDue ? "rgba(156, 163, 175, 0.15)" : "rgba(34, 197, 94, 0.15)",
                          color: isPastDue ? "var(--text-secondary)" : "var(--success)"
                        }}
                      >
                        {isPastDue ? "Past Due" : "Active"}
                      </span>
                    </div>

                    {/* Individual Delete Option */}
                    <button
                      type="button"
                      onClick={() => setItemToDelete(item)}
                      title="Delete this Home Work"
                      style={{
                        background: "rgba(239, 68, 68, 0.08)",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                        color: "var(--danger)",
                        padding: "5px 8px",
                        borderRadius: "8px",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        transition: "background 0.15s ease"
                      }}
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 style={{ margin: "0 0 0.3rem 0", fontSize: "1.05rem", fontWeight: 700, color: "var(--foreground)" }}>
                      {item.title}
                    </h3>
                    {item.description && (
                      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* Meta: Due date & Assigned date */}
                  <div style={{ display: "flex", gap: "1.25rem", fontSize: "0.8rem", color: "var(--text-secondary)", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <CalendarIcon size={14} style={{ color: "var(--primary)" }} />
                      <span>Due: <strong>{new Date(item.deadline).toLocaleDateString()}</strong></span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <Clock size={14} />
                      <span>Assigned: {new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Action Bar: Submissions + Work Conversation */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingTop: "0.75rem",
                      borderTop: "1px solid var(--border)",
                      flexWrap: "wrap",
                      gap: "0.75rem"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", color: "var(--success)", fontWeight: 600 }}>
                      <HeartHandshake size={14} />
                      <span>Visible to Parents</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      {/* Work Conversation Button */}
                      <button
                        type="button"
                        onClick={() => setActiveConversationItem(item)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          padding: "5px 12px",
                          borderRadius: "8px",
                          backgroundColor: "rgba(99, 102, 241, 0.12)",
                          color: "var(--primary)",
                          border: "1px solid rgba(99, 102, 241, 0.25)",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer"
                        }}
                      >
                        <MessageSquare size={14} />
                        <span>Work Conversation</span>
                        {item._count.comments > 0 && (
                          <span style={{ padding: "1px 6px", borderRadius: "10px", backgroundColor: "var(--primary)", color: "var(--primary-fg)", fontSize: "0.7rem" }}>
                            {item._count.comments}
                          </span>
                        )}
                      </button>

                      {/* Submissions link */}
                      <Link
                        href={`/dashboard/teacher/assignments/${item.id}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          padding: "5px 12px",
                          borderRadius: "8px",
                          backgroundColor: "var(--card)",
                          color: "var(--foreground)",
                          border: "1px solid var(--border)",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          textDecoration: "none"
                        }}
                      >
                        <Users size={14} />
                        <span>Submissions ({item._count.submissions})</span>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredAssignments.length === 0 && (
              <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-secondary)" }}>
                <FileText size={44} style={{ opacity: 0.3, margin: "0 auto 0.75rem" }} />
                <h4 style={{ margin: "0 0 0.4rem 0", color: "var(--foreground)", fontSize: "1rem" }}>
                  No home work records found
                </h4>
                <p style={{ margin: 0, fontSize: "0.85rem" }}>
                  {assignments.length === 0 
                    ? "Create your first home work above to start assigning and communicating with parents!" 
                    : "No home works match the selected filters."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================
          INDIVIDUAL DELETE CONFIRMATION MODAL
         ========================================= */}
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
                  This action is permanent and cannot be undone.
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
              Deleting this home work will remove all associated student submissions and the work conversation thread from both your dashboard and parents&apos; portals.
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

      {/* =========================================
          WORK CONVERSATION MODAL
         ========================================= */}
      {activeConversationItem && (
        <WorkConversationModal
          isOpen={true}
          onClose={() => setActiveConversationItem(null)}
          assignmentId={activeConversationItem.id}
          assignmentTitle={activeConversationItem.title}
          subjectName={activeConversationItem.subject?.name}
          className={`${activeConversationItem.class.name} - ${activeConversationItem.class.section}`}
          teacherName={teacher.name}
          currentUser={{
            id: teacher.userId,
            name: teacher.name,
            role: "TEACHER"
          }}
          onCommentsUpdated={(newCount: number) => {
            setAssignments(prev => prev.map(a => a.id === activeConversationItem.id ? {
              ...a,
              _count: { ...a._count, comments: newCount }
            } : a));
          }}
        />
      )}
    </div>
  );
}
