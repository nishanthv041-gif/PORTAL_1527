"use client";

import { useState, useMemo } from "react";
import { 
  AlertCircle, 
  PlusCircle, 
  History, 
  MessageSquare, 
  Send, 
  CheckCircle2, 
  Clock, 
  Trash2, 
  User, 
  GraduationCap, 
  ShieldAlert, 
  Check, 
  FileWarning 
} from "lucide-react";
import { 
  submitParentComplaintAction, 
  deleteParentComplaintAction 
} from "@/backend/api/actions/dashboard/parent/complaints/actions";
import ComplaintConversationModal, { ComplaintMessageItem } from "@/frontend/components/complaints/ComplaintConversationModal";
import styles from "../../dashboard.module.css";

export type ParentChildOption = {
  id: string;
  firstName: string;
  lastName: string;
  rollNumber: string;
  class: {
    id: string;
    name: string;
    section: string;
  } | null;
};

export type ParentComplaintItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  date: string;
  remarks: string | null;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    rollNumber: string;
    class: {
      name: string;
      section: string;
    } | null;
  };
  messages: ComplaintMessageItem[];
  _count: {
    messages: number;
  };
};

interface ParentComplaintsClientProps {
  childrenList: ParentChildOption[];
  initialComplaints: ParentComplaintItem[];
  currentUser: {
    id: string;
    name: string;
    role: string;
  };
}

const CATEGORIES = [
  { value: "ACADEMIC", label: "Academic & Curriculum", desc: "Teaching, homework, exam syllabus, learning materials" },
  { value: "BEHAVIOR", label: "Student Behavior & Conduct", desc: "Classroom discipline, peer issues, behavioral concerns" },
  { value: "BULLYING", label: "Bullying & Harassment", desc: "Teasing, safety issues, emotional or physical bullying" },
  { value: "FACILITIES", label: "Campus & Classrooms", desc: "Classroom environment, labs, restrooms, cleanliness" },
  { value: "TRANSPORT", label: "School Bus & Transportation", desc: "Bus route, timing, driver conduct, pick-up/drop-off" },
  { value: "FEES", label: "Fee & Finance Inquiries", desc: "Tuition, payment receipts, fee statements" },
  { value: "STAFF", label: "Teacher or Staff Conduct", desc: "Staff communication, guidance, responsiveness" },
  { value: "OTHER", label: "General Inquiries & Feedback", desc: "Other feedback or miscellaneous suggestions" }
];

const SEVERITIES = [
  { value: "LOW", label: "Low", desc: "Routine question or minor feedback", color: "#10b981", bg: "rgba(16, 185, 129, 0.12)" },
  { value: "MEDIUM", label: "Medium", desc: "Standard concern requiring review", color: "#ca8a04", bg: "rgba(234, 179, 8, 0.12)" },
  { value: "HIGH", label: "High", desc: "Urgent issue impacting your child", color: "#ea580c", bg: "rgba(249, 115, 22, 0.12)" },
  { value: "CRITICAL", label: "Critical", desc: "Immediate safety / emergency priority", color: "#ef4444", bg: "rgba(239, 68, 68, 0.12)" }
];

export default function ParentComplaintsClient({
  childrenList,
  initialComplaints,
  currentUser
}: ParentComplaintsClientProps) {
  const [activeTab, setActiveTab] = useState<"CREATE" | "HISTORY">(
    initialComplaints.length > 0 ? "HISTORY" : "CREATE"
  );
  const [complaints, setComplaints] = useState<ParentComplaintItem[]>(initialComplaints);

  // Form states - Multi-choice student selection
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(
    childrenList.length > 0 ? [childrenList[0].id] : []
  );
  const [category, setCategory] = useState("ACADEMIC");
  const [severity, setSeverity] = useState("MEDIUM");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Active Conversation Modal
  const [activeComplaintForChat, setActiveComplaintForChat] = useState<ParentComplaintItem | null>(null);

  // Filters for History
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "UNDER_REVIEW" | "RESOLVED">("ALL");
  const [childFilter, setChildFilter] = useState<string>("ALL");

  // Toggle student selection (multi-choice options)
  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds(prev => {
      if (prev.includes(studentId)) {
        // Keep at least one student selected if possible
        if (prev.length === 1) return prev;
        return prev.filter(id => id !== studentId);
      } else {
        return [...prev, studentId];
      }
    });
  };

  const handleCreateComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStudentIds.length === 0) {
      setFeedback({ type: "error", text: "Please select at least one student for this complaint." });
      return;
    }
    if (!title.trim() || !description.trim()) {
      setFeedback({ type: "error", text: "Please fill in both the subject title and detailed description." });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    const formData = new FormData();
    selectedStudentIds.forEach(id => formData.append("studentIds", id));
    formData.append("title", title.trim());
    formData.append("category", category);
    formData.append("severity", severity);
    formData.append("description", description.trim());

    const res = await submitParentComplaintAction(formData);

    if (res.success) {
      setFeedback({
        type: "success",
        text: `✨ Complaint submitted successfully! Administration has been notified.`
      });
      setTitle("");
      setDescription("");

      // Refresh / redirect to history tab after 1 second
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      setFeedback({ type: "error", text: res.error || "Failed to submit complaint" });
    }

    setIsSubmitting(false);
  };

  const handleDeleteComplaint = async (id: string) => {
    if (!confirm("Are you sure you want to withdraw and delete this complaint?")) return;

    const res = await deleteParentComplaintAction(id);
    if (res.success) {
      setComplaints(prev => prev.filter(c => c.id !== id));
    } else {
      alert(res.error || "Failed to delete complaint");
    }
  };

  // Filtered complaints for history
  const filteredComplaints = useMemo(() => {
    return complaints.filter(c => {
      if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
      if (childFilter !== "ALL" && c.student.id !== childFilter) return false;
      return true;
    });
  }, [complaints, statusFilter, childFilter]);

  const getStatusBadge = (st: string) => {
    switch (st.toUpperCase()) {
      case "RESOLVED":
        return { label: "Resolved", bg: "rgba(16, 185, 129, 0.15)", text: "var(--success)" };
      case "UNDER_REVIEW":
        return { label: "Under Review", bg: "rgba(234, 179, 8, 0.15)", text: "#ca8a04" };
      default:
        return { label: "Open", bg: "rgba(239, 68, 68, 0.15)", text: "var(--danger)" };
    }
  };

  return (
    <div className={styles.dashboard}>
      {/* Top Header & Tab Switcher */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span>Complaints & Inquiries</span>
            <span style={{ fontSize: "0.75rem", padding: "3px 10px", borderRadius: "12px", backgroundColor: "rgba(99, 102, 241, 0.15)", color: "var(--primary)", fontWeight: 700 }}>
              Parent Portal
            </span>
          </h1>
          <p style={{ margin: "0.25rem 0 0 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Submit concerns regarding your children, track progress, and converse with school administration.
          </p>
        </div>

        {/* Tab Buttons */}
        <div style={{ display: "inline-flex", padding: "4px", backgroundColor: "var(--card)", borderRadius: "12px", border: "1px solid var(--border)", gap: "4px" }}>
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
            <span>File a Complaint</span>
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
            <span>Complaint History</span>
            {complaints.length > 0 && (
              <span
                style={{
                  padding: "2px 6px",
                  borderRadius: "10px",
                  backgroundColor: activeTab === "HISTORY" ? "rgba(255,255,255,0.25)" : "rgba(99, 102, 241, 0.15)",
                  color: activeTab === "HISTORY" ? "#fff" : "var(--primary)",
                  fontSize: "0.75rem"
                }}
              >
                {complaints.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* =========================================================
          TAB 1: FILE A COMPLAINT (PARENT CREATING PAGE)
         ========================================================= */}
      {activeTab === "CREATE" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div className={styles.chartCard} style={{ padding: "2rem" }}>
            <div style={{ marginBottom: "1.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "var(--foreground)" }}>
                Submit a New Complaint or Inquiry
              </h3>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Your complaint is directly received by the School Administration. Notifications are dispatched immediately.
              </p>
            </div>

            {feedback && (
              <div
                style={{
                  padding: "0.85rem 1.25rem",
                  borderRadius: "8px",
                  backgroundColor: feedback.type === "success" ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                  color: feedback.type === "success" ? "var(--success)" : "var(--danger)",
                  border: `1px solid ${feedback.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "1.25rem"
                }}
              >
                {feedback.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <span>{feedback.text}</span>
              </div>
            )}

            <form onSubmit={handleCreateComplaint} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {/* 1. SELECT STUDENT (MULTIPLE CHOICE OPTIONS) */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
                  <label style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
                    1. Select Student(s) *
                  </label>
                  <span style={{ fontSize: "0.75rem", color: "var(--primary)", fontWeight: 600 }}>
                    {selectedStudentIds.length} student{selectedStudentIds.length !== 1 ? "s" : ""} selected
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.85rem" }}>
                  {childrenList.map((child) => {
                    const isSelected = selectedStudentIds.includes(child.id);

                    return (
                      <div
                        key={child.id}
                        onClick={() => toggleStudentSelection(child.id)}
                        style={{
                          padding: "1rem",
                          borderRadius: "12px",
                          border: `2px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                          backgroundColor: isSelected ? "rgba(99, 102, 241, 0.06)" : "var(--background)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.75rem",
                          transition: "all 0.15s"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: "50%",
                              backgroundColor: isSelected ? "var(--primary)" : "rgba(100, 116, 139, 0.15)",
                              color: isSelected ? "#fff" : "var(--text-secondary)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              fontSize: "0.95rem"
                            }}
                          >
                            {child.firstName[0]}
                          </div>

                          <div>
                            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--foreground)" }}>
                              {child.firstName} {child.lastName}
                            </div>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                              <GraduationCap size={13} />
                              <span>{child.class ? `${child.class.name} - ${child.class.section}` : "No Class"}</span>
                              <span>•</span>
                              <span>Roll: {child.rollNumber}</span>
                            </div>
                          </div>
                        </div>

                        {/* Multi-choice Checkbox Indicator */}
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "6px",
                            border: `2px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                            backgroundColor: isSelected ? "var(--primary)" : "transparent",
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                        >
                          {isSelected && <Check size={14} strokeWidth={3} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. CATEGORY SELECTOR */}
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--foreground)" }}>
                  2. Complaint Category *
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.6rem" }}>
                  {CATEGORIES.map(cat => {
                    const isSelected = category === cat.value;
                    return (
                      <div
                        key={cat.value}
                        onClick={() => setCategory(cat.value)}
                        style={{
                          padding: "0.75rem 1rem",
                          borderRadius: "10px",
                          border: `1.5px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                          backgroundColor: isSelected ? "rgba(99, 102, 241, 0.08)" : "var(--background)",
                          cursor: "pointer",
                          transition: "all 0.15s"
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: "0.875rem", color: isSelected ? "var(--primary)" : "var(--foreground)" }}>
                          {cat.label}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                          {cat.desc}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. SEVERITY SELECTOR */}
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--foreground)" }}>
                  3. Severity Level *
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.6rem" }}>
                  {SEVERITIES.map(sev => {
                    const isSelected = severity === sev.value;
                    return (
                      <div
                        key={sev.value}
                        onClick={() => setSeverity(sev.value)}
                        style={{
                          padding: "0.75rem 1rem",
                          borderRadius: "10px",
                          border: `2px solid ${isSelected ? sev.color : "var(--border)"}`,
                          backgroundColor: isSelected ? sev.bg : "var(--background)",
                          cursor: "pointer",
                          transition: "all 0.15s"
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: "0.9rem", color: isSelected ? sev.color : "var(--foreground)" }}>
                          {sev.label}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                          {sev.desc}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. TITLE */}
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.4rem", color: "var(--foreground)" }}>
                  4. Subject / Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Bus route 4 pick-up delay in the mornings"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
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

              {/* 5. DESCRIPTION */}
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.4rem", color: "var(--foreground)" }}>
                  5. Detailed Description *
                </label>
                <textarea
                  required
                  rows={5}
                  placeholder="Please provide full details of the issue, dates, locations, and any specific assistance needed..."
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

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  padding: "0.85rem 1.75rem",
                  borderRadius: "10px",
                  border: "none",
                  backgroundColor: "var(--primary)",
                  color: "var(--primary-fg)",
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  boxShadow: "0 4px 12px rgba(99, 102, 241, 0.25)"
                }}
              >
                <Send size={16} />
                <span>{isSubmitting ? "Submitting Complaint..." : "Submit Complaint to Administration"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          TAB 2: COMPLAINT HISTORY & LIVE CONVERSATIONS
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
                Filter Complaints:
              </span>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
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
                <option value="ALL">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="RESOLVED">Resolved</option>
              </select>

              {/* Child Filter (if multiple children) */}
              {childrenList.length > 1 && (
                <select
                  value={childFilter}
                  onChange={(e) => setChildFilter(e.target.value)}
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
                  <option value="ALL">All Children ({childrenList.length})</option>
                  {childrenList.map(c => (
                    <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                  ))}
                </select>
              )}
            </div>

            <button
              type="button"
              onClick={() => setActiveTab("CREATE")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "6px 14px",
                borderRadius: "8px",
                backgroundColor: "var(--primary)",
                color: "var(--primary-fg)",
                border: "none",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: "pointer"
              }}
            >
              <PlusCircle size={15} />
              <span>File New Complaint</span>
            </button>
          </div>

          {/* Complaints List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {filteredComplaints.map((item) => {
              const stBadge = getStatusBadge(item.status);
              const sev = SEVERITIES.find(s => s.value === item.severity) || SEVERITIES[1];

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
                    gap: "1rem"
                  }}
                >
                  <div style={{ flex: "1 1 350px", minWidth: "260px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
                      {/* Status */}
                      <span
                        style={{
                          fontSize: "0.75rem",
                          padding: "2px 8px",
                          borderRadius: "10px",
                          backgroundColor: stBadge.bg,
                          color: stBadge.text,
                          fontWeight: 700
                        }}
                      >
                        {stBadge.label}
                      </span>

                      {/* Severity */}
                      <span
                        style={{
                          fontSize: "0.75rem",
                          padding: "2px 8px",
                          borderRadius: "10px",
                          backgroundColor: sev.bg,
                          color: sev.color,
                          fontWeight: 700
                        }}
                      >
                        {sev.label} Priority
                      </span>

                      {/* Category */}
                      <span
                        style={{
                          fontSize: "0.75rem",
                          padding: "2px 8px",
                          borderRadius: "10px",
                          backgroundColor: "rgba(99, 102, 241, 0.12)",
                          color: "var(--primary)",
                          fontWeight: 700
                        }}
                      >
                        {item.category}
                      </span>

                      {/* Student info */}
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          fontSize: "0.75rem",
                          color: "var(--text-secondary)",
                          fontWeight: 600
                        }}
                      >
                        <User size={12} /> {item.student.firstName} {item.student.lastName}
                        {item.student.class ? ` (${item.student.class.name} - ${item.student.class.section})` : ""}
                      </span>
                    </div>

                    <h3 style={{ margin: "0.35rem 0", fontSize: "1.15rem", fontWeight: 700, color: "var(--foreground)" }}>
                      {item.title}
                    </h3>

                    <p style={{ margin: "0.25rem 0 0.5rem 0", fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {item.description}
                    </p>

                    {item.remarks && (
                      <div
                        style={{
                          margin: "0.5rem 0",
                          padding: "0.6rem 0.85rem",
                          borderRadius: "8px",
                          backgroundColor: "rgba(99, 102, 241, 0.08)",
                          borderLeft: "3px solid var(--primary)",
                          fontSize: "0.85rem"
                        }}
                      >
                        <span style={{ fontWeight: 700, color: "var(--primary)" }}>Admin Remarks: </span>
                        <span>{item.remarks}</span>
                      </div>
                    )}

                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.35rem" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                        <Clock size={13} /> Reported on {new Date(item.date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Actions Area */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", alignSelf: "center" }}>
                    <button
                      type="button"
                      onClick={() => setActiveComplaintForChat(item)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.45rem",
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
                      <span>Conversation ({item.messages.length})</span>
                    </button>

                    {item.status === "OPEN" && (
                      <button
                        type="button"
                        onClick={() => handleDeleteComplaint(item.id)}
                        title="Withdraw complaint"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
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
                        <span>Withdraw</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredComplaints.length === 0 && (
              <div
                className={styles.chartCard}
                style={{ textAlign: "center", padding: "3rem 1.5rem", color: "var(--text-secondary)" }}
              >
                <FileWarning size={44} style={{ opacity: 0.3, margin: "0 auto 0.75rem" }} />
                <h4 style={{ margin: "0 0 0.4rem 0", color: "var(--foreground)", fontSize: "1.1rem" }}>
                  No Complaints Found
                </h4>
                <p style={{ margin: 0, fontSize: "0.85rem" }}>
                  {complaints.length === 0
                    ? "You haven't submitted any complaints or feedback yet."
                    : "No complaints match the selected status or child filter."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================
          LIVE COMPLAINT CONVERSATION MODAL
         ========================================================= */}
      {activeComplaintForChat && (
        <ComplaintConversationModal
          isOpen={true}
          onClose={() => setActiveComplaintForChat(null)}
          complaintId={activeComplaintForChat.id}
          complaintTitle={activeComplaintForChat.title}
          studentName={`${activeComplaintForChat.student.firstName} ${activeComplaintForChat.student.lastName}`}
          studentClass={activeComplaintForChat.student.class ? `${activeComplaintForChat.student.class.name} - ${activeComplaintForChat.student.class.section}` : null}
          category={activeComplaintForChat.category}
          severity={activeComplaintForChat.severity}
          status={activeComplaintForChat.status}
          currentUser={currentUser}
          initialMessages={activeComplaintForChat.messages}
          onMessageAdded={(newMsg) => {
            setComplaints(prev => prev.map(c => c.id === activeComplaintForChat.id ? {
              ...c,
              messages: [...c.messages, newMsg],
              _count: { messages: c._count.messages + 1 }
            } : c));
          }}
        />
      )}
    </div>
  );
}
