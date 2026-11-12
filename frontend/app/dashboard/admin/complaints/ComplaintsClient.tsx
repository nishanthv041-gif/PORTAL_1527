"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  MessageSquare,
  CheckCircle,
  Clock,
  User as UserIcon,
  Trash2,
  PlusCircle,
  Search,
  Filter,
  X,
  Send,
  GraduationCap,
  ShieldAlert,
  CheckCircle2,
  Edit3,
  Loader2
} from "lucide-react";
import {
  createAdminComplaintAction,
  updateComplaintStatusAction,
  deleteComplaintAction
} from "@/backend/api/actions/dashboard/admin/complaints/actions";
import ComplaintConversationModal, { ComplaintMessageItem } from "@/frontend/components/complaints/ComplaintConversationModal";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";
import { SearchBar, ResultsContainer } from "@/frontend/components/ui";
import { SingleSelect } from "@/frontend/components/ui/form";
import styles from "../../dashboard.module.css";

export type StudentLookupOption = {
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

export type AdminComplaintItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  date: string;
  remarks: string | null;
  authorRole: string;
  authorId: string | null;
  teacher: {
    id: string;
    user: { name: string };
  } | null;
  parent: {
    id: string;
    user: { name: string };
  } | null;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    rollNumber: string;
    class: {
      id: string;
      name: string;
      section: string;
    } | null;
    parents: {
      parent: {
        id: string;
        user: { name: string };
      };
    }[];
  };
  messages: ComplaintMessageItem[];
  _count: {
    messages: number;
  };
};

interface ComplaintsClientProps {
  complaints: AdminComplaintItem[];
  studentsList: StudentLookupOption[];
  currentUser: {
    id: string;
    name: string;
    role: string;
  };
}

const CATEGORIES = [
  "ACADEMIC",
  "BEHAVIOR",
  "BULLYING",
  "FACILITIES",
  "TRANSPORT",
  "FEES",
  "STAFF",
  "OTHER"
];

const SEVERITIES = [
  { value: "LOW", label: "Low", color: "#10b981", bg: "rgba(16, 185, 129, 0.12)" },
  { value: "MEDIUM", label: "Medium", color: "#ca8a04", bg: "rgba(234, 179, 8, 0.12)" },
  { value: "HIGH", label: "High", color: "#ea580c", bg: "rgba(249, 115, 22, 0.12)" },
  { value: "CRITICAL", label: "Critical", color: "#ef4444", bg: "rgba(239, 68, 68, 0.12)" }
];

export default function ComplaintsClient({
  complaints: initialComplaints,
  studentsList,
  currentUser
}: ComplaintsClientProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [complaints, setComplaints] = useState<AdminComplaintItem[]>(initialComplaints);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setComplaints(initialComplaints);
  }, [initialComplaints]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [isPendingSearch, setIsPendingSearch] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "UNDER_REVIEW" | "RESOLVED">("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  // Modal 1: Log Complaint for Any Student
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createStudentSearch, setCreateStudentSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createCategory, setCreateCategory] = useState("BEHAVIOR");
  const [createSeverity, setCreateSeverity] = useState("MEDIUM");
  const [createDescription, setCreateDescription] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");

  // Modal 2: Update Status & Remarks
  const [statusModalComplaint, setStatusModalComplaint] = useState<AdminComplaintItem | null>(null);
  const [editStatus, setEditStatus] = useState("OPEN");
  const [editRemarks, setEditRemarks] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  // Modal 3: Complaint Conversation Thread
  const [conversationComplaint, setConversationComplaint] = useState<AdminComplaintItem | null>(null);

  // Overall Stats
  const openCount = useMemo(() => complaints.filter(c => c.status === "OPEN").length, [complaints]);
  const reviewCount = useMemo(() => complaints.filter(c => c.status === "UNDER_REVIEW").length, [complaints]);
  const resolvedCount = useMemo(() => complaints.filter(c => c.status === "RESOLVED").length, [complaints]);

  // Filtered Students for the Searchable Selector in Create Modal
  const filteredStudents = useMemo(() => {
    if (!createStudentSearch.trim()) return studentsList.slice(0, 50);
    const q = createStudentSearch.toLowerCase();
    return studentsList.filter(s =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
      s.rollNumber.toLowerCase().includes(q) ||
      (s.class && `${s.class.name} ${s.class.section}`.toLowerCase().includes(q))
    ).slice(0, 50);
  }, [studentsList, createStudentSearch]);

  // Filtered complaints for table/grid
  const filteredComplaints = useMemo(() => {
    return complaints.filter(c => {
      if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
      if (severityFilter !== "ALL" && c.severity !== severityFilter) return false;
      if (categoryFilter !== "ALL" && c.category !== categoryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const studentName = `${c.student.firstName} ${c.student.lastName}`.toLowerCase();
        const title = c.title.toLowerCase();
        const desc = c.description.toLowerCase();
        const parentName = c.parent?.user.name.toLowerCase() || "";
        if (!studentName.includes(q) && !title.includes(q) && !desc.includes(q) && !parentName.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [complaints, statusFilter, severityFilter, categoryFilter, searchQuery]);

  // Handle Admin Complaint Creation
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) {
      setCreateError("Please select a student.");
      return;
    }
    if (!createTitle.trim() || !createDescription.trim()) {
      setCreateError("Please provide both a title and description.");
      return;
    }

    const selectedStudent = studentsList.find(s => s.id === selectedStudentId);
    const tempId = `temp_${Date.now()}`;
    const tempComplaint: AdminComplaintItem = {
      id: tempId,
      title: createTitle.trim(),
      description: createDescription.trim(),
      category: createCategory,
      severity: createSeverity,
      status: "OPEN",
      date: new Date().toISOString(),
      remarks: null,
      authorRole: "ADMIN",
      authorId: currentUser.id,
      teacher: null,
      parent: null,
      student: selectedStudent ? {
        id: selectedStudent.id,
        firstName: selectedStudent.firstName,
        lastName: selectedStudent.lastName,
        rollNumber: selectedStudent.rollNumber,
        class: selectedStudent.class,
        parents: []
      } : {
        id: selectedStudentId,
        firstName: "Student",
        lastName: "",
        rollNumber: "",
        class: null,
        parents: []
      },
      messages: [],
      _count: { messages: 0 }
    };

    // 0ms instant optimistic addition
    setComplaints(prev => [tempComplaint, ...prev]);
    setShowCreateModal(false);
    setSelectedStudentId("");
    setCreateTitle("");
    setCreateDescription("");
    setCreateStudentSearch("");

    setCreateSubmitting(true);
    setCreateError("");

    const formData = new FormData();
    formData.append("studentId", selectedStudentId);
    formData.append("title", tempComplaint.title);
    formData.append("category", createCategory);
    formData.append("severity", createSeverity);
    formData.append("description", tempComplaint.description);
    formData.append("status", "OPEN");

    try {
      const res = await createAdminComplaintAction(formData);
      setCreateSubmitting(false);

      if (res.success) {
        router.refresh();
      } else {
        // Rollback
        setComplaints(prev => prev.filter(c => c.id !== tempId));
        alert(res.error || "Failed to create complaint.");
      }
    } catch (err: any) {
      setCreateSubmitting(false);
      setComplaints(prev => prev.filter(c => c.id !== tempId));
      alert(err?.message || "Failed to create complaint.");
    }
  };

  // Handle Status Update
  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusModalComplaint) return;

    setStatusSubmitting(true);
    const res = await updateComplaintStatusAction(statusModalComplaint.id, editStatus, editRemarks);

    if (res.success) {
      setComplaints(prev => prev.map(c => c.id === statusModalComplaint.id ? {
        ...c,
        status: editStatus,
        remarks: editRemarks || null
      } : c));
      setStatusModalComplaint(null);
    } else {
      alert(res.error || "Failed to update status.");
    }

    setStatusSubmitting(false);
  };

  // Handle Delete
  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Delete Complaint?",
      message: "Are you sure you want to delete this complaint record? All linked responses and audit logs will be permanently removed.",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger"
    });
    if (!ok) return;

    const previousList = [...complaints];
    // 0ms instant optimistic removal
    setComplaints(prev => prev.filter(c => c.id !== id));
    setDeletingId(id);

    try {
      const res = await deleteComplaintAction(id);
      setDeletingId(null);
      if (res.success) {
        router.refresh();
      } else {
        // Rollback on server error
        setComplaints(previousList);
        alert(res.error || "Failed to delete complaint");
      }
    } catch (err: any) {
      setDeletingId(null);
      setComplaints(previousList);
      alert(err?.message || "Failed to delete complaint");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case "OPEN": return { text: "var(--danger)", bg: "rgba(239, 68, 68, 0.12)" };
      case "UNDER_REVIEW": return { text: "#ca8a04", bg: "rgba(234, 179, 8, 0.12)" };
      case "RESOLVED": return { text: "var(--success)", bg: "rgba(16, 185, 129, 0.12)" };
      default: return { text: "var(--text-secondary)", bg: "rgba(100, 116, 139, 0.12)" };
    }
  };

  const getSeverityInfo = (sev: string) => {
    return SEVERITIES.find(s => s.value === sev.toUpperCase()) || SEVERITIES[1];
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* =========================================================
          PAGE HEADER & SUMMARY CARDS
         ========================================================= */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>Complaints & Feedback</h1>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            padding: "0.65rem 1.25rem",
            borderRadius: "10px",
            border: "none",
            backgroundColor: "var(--primary)",
            color: "var(--primary-fg)",
            fontWeight: 700,
            fontSize: "0.9rem",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(99, 102, 241, 0.25)"
          }}
        >
          <PlusCircle size={17} />
          <span>Log Complaint for a Student</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
        <div className={styles.chartCard} style={{ padding: "1.25rem", border: "1px solid var(--border)", borderRadius: "12px" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>Total Complaints</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--foreground)", marginTop: "0.2rem" }}>
            {complaints.length}
          </div>
        </div>

        <div className={styles.chartCard} style={{ padding: "1.25rem", border: "1px solid var(--border)", borderRadius: "12px" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--danger)", fontWeight: 600 }}>Open Issues</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--danger)", marginTop: "0.2rem" }}>
            {openCount}
          </div>
        </div>

        <div className={styles.chartCard} style={{ padding: "1.25rem", border: "1px solid var(--border)", borderRadius: "12px" }}>
          <div style={{ fontSize: "0.8rem", color: "#ca8a04", fontWeight: 600 }}>Under Review</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#ca8a04", marginTop: "0.2rem" }}>
            {reviewCount}
          </div>
        </div>

        <div className={styles.chartCard} style={{ padding: "1.25rem", border: "1px solid var(--border)", borderRadius: "12px" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--success)", fontWeight: 600 }}>Resolved</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--success)", marginTop: "0.2rem" }}>
            {resolvedCount}
          </div>
        </div>
      </div>

      {/* =========================================================
          SEARCH & FILTERS BAR
         ========================================================= */}
      <div
        className={styles.chartCard}
        style={{
          padding: "1rem 1.25rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", flex: "1 1 300px" }}>
          {/* Search Box */}
          <div style={{ flex: "1 1 220px", maxWidth: "340px", minWidth: "180px" }}>
            <SearchBar
              placeholder="Search student, title, description..."
              value={searchQuery}
              onChange={(val) => setSearchQuery(val)}
              onPendingChange={(pending) => setIsPendingSearch(pending)}
              style={{ maxWidth: "100%" }}
            />
          </div>

          {/* Status Filter */}
          <div style={{ minWidth: "160px" }}>
            <SingleSelect
              value={statusFilter}
              onChange={(val) => setStatusFilter(val as any)}
              options={[
                { value: "ALL", label: "All Statuses" },
                { value: "OPEN", label: `Open (${openCount})` },
                { value: "UNDER_REVIEW", label: `Under Review (${reviewCount})` },
                { value: "RESOLVED", label: `Resolved (${resolvedCount})` },
              ]}
              searchable={false}
              placeholder="Status..."
            />
          </div>

          {/* Severity Filter */}
          <div style={{ minWidth: "160px" }}>
            <SingleSelect
              value={severityFilter}
              onChange={setSeverityFilter}
              options={[
                { value: "ALL", label: "All Priorities" },
                ...SEVERITIES.map((s) => ({ value: s.value, label: s.label })),
              ]}
              searchable={false}
              placeholder="Priority..."
            />
          </div>

          {/* Category Filter */}
          <div style={{ minWidth: "170px" }}>
            <SingleSelect
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: "ALL", label: "All Categories" },
                ...CATEGORIES.map((c) => ({ value: c, label: c })),
              ]}
              searchable={false}
              placeholder="Category..."
            />
          </div>
        </div>

        <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>
          Showing {filteredComplaints.length} of {complaints.length}
        </span>
      </div>

      {/* =========================================================
          COMPLAINTS GRID / CARDS
         ========================================================= */}
      <ResultsContainer
        isPending={isPendingSearch}
        isEmpty={filteredComplaints.length === 0}
        emptyTitle="No Complaints Found"
        emptyMessage="No complaints match your search query or active filter criteria."
        onReset={() => {
          setSearchQuery("");
          setStatusFilter("ALL");
          setSeverityFilter("ALL");
          setCategoryFilter("ALL");
        }}
        resetLabel="Reset Filters"
      >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 360px), 1fr))", gap: "1.25rem" }}>
        {filteredComplaints.map((item) => {
          const stColors = getStatusColor(item.status);
          const sevInfo = getSeverityInfo(item.severity);

          // Determine reporter description
          let reporterLabel = "Logged by Administration";
          if (item.authorRole === "PARENT") {
            const parentName = item.parent?.user.name || item.student.parents?.[0]?.parent?.user.name || "Parent";
            reporterLabel = `Reported by Parent (${parentName})`;
          } else if (item.authorRole === "TEACHER") {
            reporterLabel = `Reported by Teacher (${item.teacher?.user.name || "Staff"})`;
          }

          return (
            <div
              key={item.id}
              className={styles.chartCard}
              style={{
                borderRadius: "14px",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding: "1.25rem 1.5rem",
                  borderBottom: "1px solid var(--border)",
                  backgroundColor: "var(--background)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "0.75rem"
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
                    {/* Status */}
                    <span
                      style={{
                        fontSize: "0.75rem",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        backgroundColor: stColors.bg,
                        color: stColors.text,
                        fontWeight: 700
                      }}
                    >
                      {item.status.replace("_", " ")}
                    </span>

                    {/* Severity */}
                    <span
                      style={{
                        fontSize: "0.75rem",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        backgroundColor: sevInfo.bg,
                        color: sevInfo.color,
                        fontWeight: 700
                      }}
                    >
                      {sevInfo.label} Priority
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
                  </div>

                  <h3 style={{ margin: "0.25rem 0 0 0", fontSize: "1.15rem", fontWeight: 700, color: "var(--foreground)" }}>
                    {item.title}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingId === item.id}
                  title="Delete complaint"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--danger)",
                    cursor: deletingId === item.id ? "not-allowed" : "pointer",
                    padding: "4px",
                    opacity: deletingId === item.id ? 0.4 : 0.7
                  }}
                >
                  {deletingId === item.id ? (
                    <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: "1.25rem 1.5rem", flex: 1, display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {item.description}
                </p>

                {/* Student Box */}
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    borderRadius: "8px",
                    backgroundColor: "rgba(0,0,0,0.02)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.5rem"
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Reported Student</div>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--foreground)" }}>
                      {item.student.firstName} {item.student.lastName}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    <div>{item.student.class ? `${item.student.class.name} - ${item.student.class.section}` : "No Class"}</div>
                    <div>Roll: {item.student.rollNumber}</div>
                  </div>
                </div>

                {/* Reporter / Date meta */}
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                  <span>{reporterLabel}</span>
                  <span>Reported on: {new Date(item.date).toLocaleDateString()}</span>
                </div>

                {/* Admin Remarks if set */}
                {item.remarks && (
                  <div
                    style={{
                      padding: "0.6rem 0.85rem",
                      borderRadius: "8px",
                      backgroundColor: "rgba(99, 102, 241, 0.08)",
                      borderLeft: "3px solid var(--primary)",
                      fontSize: "0.825rem",
                      marginTop: "auto"
                    }}
                  >
                    <span style={{ fontWeight: 700, color: "var(--primary)" }}>Resolution Remarks: </span>
                    <span>{item.remarks}</span>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div
                style={{
                  padding: "1rem 1.5rem",
                  borderTop: "1px solid var(--border)",
                  backgroundColor: "var(--background)",
                  display: "flex",
                  gap: "0.6rem"
                }}
              >
                <button
                  type="button"
                  onClick={() => setConversationComplaint(item)}
                  style={{
                    flex: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.4rem",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "8px",
                    backgroundColor: "var(--primary)",
                    color: "var(--primary-fg)",
                    border: "none",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  <MessageSquare size={15} />
                  <span>Conversation ({item.messages.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStatusModalComplaint(item);
                    setEditStatus(item.status);
                    setEditRemarks(item.remarks || "");
                  }}
                  style={{
                    flex: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.4rem",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "8px",
                    backgroundColor: "transparent",
                    color: "var(--foreground)",
                    border: "1px solid var(--border)",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  <Edit3 size={15} />
                  <span>Update Status</span>
                </button>
              </div>
            </div>
          );
        })}

        {filteredComplaints.length === 0 && (
          <div
            style={{
              gridColumn: "1 / -1",
              textAlign: "center",
              padding: "4rem 1.5rem",
              color: "var(--text-secondary)",
              backgroundColor: "var(--card)",
              borderRadius: "14px",
              border: "1px solid var(--border)"
            }}
          >
            <MessageSquare size={44} style={{ opacity: 0.3, margin: "0 auto 0.75rem" }} />
            <h4 style={{ margin: "0 0 0.4rem 0", color: "var(--foreground)", fontSize: "1.1rem" }}>
              No Complaints Found
            </h4>
            <p style={{ margin: 0, fontSize: "0.85rem" }}>
              {complaints.length === 0
                ? "No complaints have been recorded yet."
                : "No complaints match your search or filter criteria."}
            </p>
          </div>
        )}
      </div>
      </ResultsContainer>

      {/* =========================================================
          MODAL 1: LOG / DESCRIBE COMPLAINT FOR ANY STUDENT
         ========================================================= */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            padding: "1rem"
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateModal(false);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "600px",
              maxHeight: "90vh",
              overflowY: "auto",
              backgroundColor: "var(--card)",
              borderRadius: "16px",
              border: "1px solid var(--border)",
              boxShadow: "0 24px 48px rgba(0,0,0,0.3)",
              padding: "2rem"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--foreground)" }}>
                  Log / Describe Complaint for a Student
                </h3>
                <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                  Select any student in the school to describe a complaint. The student&apos;s parents will be notified.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            {createError && (
              <div style={{ padding: "0.75rem", borderRadius: "8px", backgroundColor: "rgba(239, 68, 68, 0.12)", color: "var(--danger)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Student Search & Select */}
              <div>
                <SingleSelect
                  label="1. Choose Student"
                  required={true}
                  value={selectedStudentId}
                  onChange={setSelectedStudentId}
                  options={studentsList.map((s) => ({
                    value: s.id,
                    label: `${s.firstName} ${s.lastName}`,
                    subLabel: `Roll: ${s.rollNumber}`,
                    badge: s.class ? `${s.class.name}-${s.class.section}` : "No Class",
                  }))}
                  searchable={true}
                  placeholder="-- Search & select a student --"
                  searchPlaceholder="Type name, roll number, or class..."
                />
              </div>

              {/* Category & Severity */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <SingleSelect
                    label="Category"
                    required={true}
                    value={createCategory}
                    onChange={setCreateCategory}
                    options={CATEGORIES.map((cat) => ({ value: cat, label: cat }))}
                    searchable={false}
                  />
                </div>

                <div>
                  <SingleSelect
                    label="Priority / Severity"
                    required={true}
                    value={createSeverity}
                    onChange={setCreateSeverity}
                    options={SEVERITIES.map((sev) => ({ value: sev.value, label: sev.label }))}
                    searchable={false}
                  />
                </div>
              </div>

              {/* Title */}
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 700, marginBottom: "0.4rem" }}>
                  Subject / Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Repeated classroom disturbance / Incomplete homework"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--background)",
                    color: "var(--foreground)",
                    fontSize: "0.85rem",
                    outline: "none"
                  }}
                />
              </div>

              {/* Description */}
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 700, marginBottom: "0.4rem" }}>
                  Detailed Description *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Provide incident details, observations, or directives..."
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--background)",
                    color: "var(--foreground)",
                    fontSize: "0.85rem",
                    outline: "none",
                    resize: "vertical"
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: "0.65rem 1.25rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    backgroundColor: "transparent",
                    color: "var(--foreground)",
                    cursor: "pointer",
                    fontSize: "0.85rem"
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  style={{
                    padding: "0.65rem 1.5rem",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "var(--primary)",
                    color: "var(--primary-fg)",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    cursor: createSubmitting ? "not-allowed" : "pointer"
                  }}
                >
                  {createSubmitting ? "Logging Complaint..." : "Submit Complaint"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: UPDATE STATUS & REMARKS
         ========================================================= */}
      {statusModalComplaint && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            padding: "1rem"
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setStatusModalComplaint(null);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "480px",
              backgroundColor: "var(--card)",
              borderRadius: "16px",
              border: "1px solid var(--border)",
              boxShadow: "0 24px 48px rgba(0,0,0,0.3)",
              padding: "1.75rem"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>Update Complaint Status</h3>
              <button
                type="button"
                onClick={() => setStatusModalComplaint(null)}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "0.75rem", borderRadius: "8px", backgroundColor: "var(--background)", marginBottom: "1rem", fontSize: "0.85rem" }}>
              <strong>{statusModalComplaint.title}</strong>
              <div style={{ color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                Student: {statusModalComplaint.student.firstName} {statusModalComplaint.student.lastName}
              </div>
            </div>

            <form onSubmit={handleStatusSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <SingleSelect
                  label="Status"
                  required={true}
                  value={editStatus}
                  onChange={setEditStatus}
                  options={[
                    { value: "OPEN", label: "Open" },
                    { value: "UNDER_REVIEW", label: "Under Review" },
                    { value: "RESOLVED", label: "Resolved" },
                  ]}
                  searchable={false}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                  Resolution Remarks / Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Add resolution details or directives for parents..."
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--background)",
                    color: "var(--foreground)",
                    fontSize: "0.85rem",
                    outline: "none",
                    resize: "vertical"
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setStatusModalComplaint(null)}
                  style={{
                    padding: "0.65rem 1.25rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    backgroundColor: "transparent",
                    color: "var(--foreground)",
                    cursor: "pointer",
                    fontSize: "0.85rem"
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={statusSubmitting}
                  style={{
                    padding: "0.65rem 1.5rem",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "var(--success)",
                    color: "var(--success-fg)",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    cursor: statusSubmitting ? "not-allowed" : "pointer"
                  }}
                >
                  {statusSubmitting ? "Updating..." : "Save Status"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 3: COMPLAINT CONVERSATION MODAL
         ========================================================= */}
      {conversationComplaint && (
        <ComplaintConversationModal
          isOpen={true}
          onClose={() => setConversationComplaint(null)}
          complaintId={conversationComplaint.id}
          complaintTitle={conversationComplaint.title}
          studentName={`${conversationComplaint.student.firstName} ${conversationComplaint.student.lastName}`}
          studentClass={conversationComplaint.student.class ? `${conversationComplaint.student.class.name} - ${conversationComplaint.student.class.section}` : null}
          category={conversationComplaint.category}
          severity={conversationComplaint.severity}
          status={conversationComplaint.status}
          currentUser={currentUser}
          initialMessages={conversationComplaint.messages}
          onMessageAdded={(newMsg) => {
            setComplaints(prev => prev.map(c => c.id === conversationComplaint.id ? {
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
