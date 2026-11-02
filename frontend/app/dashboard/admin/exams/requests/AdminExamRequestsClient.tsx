"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Check,
  X,
  Search,
  Filter,
  Eye,
  Edit2,
  BookOpen,
  Calendar,
  Users,
  Loader2,
  Send,
  ShieldCheck,
  AlertTriangle
} from "lucide-react";
import styles from "./AdminExamRequests.module.css";
import { Modal } from "@/frontend/components/ui";
import {
  adminApproveExamRequestWorkflowAction,
  adminRejectExamRequestWorkflowAction,
  adminEditExamRequestWorkflowAction,
} from "@/backend/api/actions/exams/examRequestWorkflowActions";

export type AdminExamRequestItem = {
  id: string;
  title: string;
  examType: string;
  classId: string;
  className: string;
  section: string;
  requestedByName: string;
  requestedByEmail?: string | null;
  status: string; // PENDING_ADMIN, APPROVED, REJECTED
  adminRemark?: string | null;
  createdAt: string;
  remarks?: string | null;
  subjects: Array<{
    id: string;
    subjectId: string;
    subjectName: string;
    maxMarks: number;
    passMark: number;
    examDate?: string | null;
    teacherName?: string | null;
  }>;
};

export default function AdminExamRequestsClient({
  requests: initialRequests,
}: {
  requests: AdminExamRequestItem[];
}) {
  const router = useRouter();
  const [requests, setRequests] = useState<AdminExamRequestItem[]>(initialRequests);
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  // Modals
  const [selectedRequest, setSelectedRequest] = useState<AdminExamRequestItem | null>(null);
  const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Reject state
  const [rejectReason, setRejectReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Edit state
  const [editTitle, setEditTitle] = useState("");
  const [editSubjects, setEditSubjects] = useState<
    Array<{ subjectId: string; subjectName: string; maxMarks: number; passMark: number }>
  >([]);

  // Filtered list
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter === "PENDING" && r.status !== "PENDING_ADMIN" && r.status !== "PENDING") {
        return false;
      }
      if (statusFilter === "APPROVED" && r.status !== "APPROVED") {
        return false;
      }
      if (statusFilter === "REJECTED" && r.status !== "REJECTED" && r.status !== "DECLINED") {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = r.title.toLowerCase().includes(q);
        const matchesClass = `${r.className} ${r.section}`.toLowerCase().includes(q);
        const matchesRequester = r.requestedByName.toLowerCase().includes(q);
        if (!matchesTitle && !matchesClass && !matchesRequester) return false;
      }

      return true;
    });
  }, [requests, statusFilter, searchQuery]);

  const handleOpenApprove = (req: AdminExamRequestItem) => {
    setSelectedRequest(req);
    setErrorMessage(null);
    setApproveModalOpen(true);
  };

  const handleConfirmApprove = () => {
    if (!selectedRequest) return;
    setErrorMessage(null);

    startTransition(async () => {
      const res = await adminApproveExamRequestWorkflowAction(selectedRequest.id);
      if (!res.success) {
        setErrorMessage(res.error || "Failed to approve request.");
      } else {
        setApproveModalOpen(false);
        setSelectedRequest(null);
        router.refresh();
      }
    });
  };

  const handleOpenReject = (req: AdminExamRequestItem) => {
    setSelectedRequest(req);
    setRejectReason("");
    setErrorMessage(null);
    setRejectModalOpen(true);
  };

  const handleConfirmReject = () => {
    if (!selectedRequest) return;
    setErrorMessage(null);

    startTransition(async () => {
      const res = await adminRejectExamRequestWorkflowAction(selectedRequest.id, rejectReason.trim());
      if (!res.success) {
        setErrorMessage(res.error || "Failed to reject request.");
      } else {
        setRejectModalOpen(false);
        setSelectedRequest(null);
        router.refresh();
      }
    });
  };

  const handleOpenEdit = (req: AdminExamRequestItem) => {
    setSelectedRequest(req);
    setEditTitle(req.title);
    setEditSubjects(
      req.subjects.map((s) => ({
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        maxMarks: s.maxMarks,
        passMark: s.passMark,
      }))
    );
    setErrorMessage(null);
    setEditModalOpen(true);
  };

  const handleConfirmEdit = () => {
    if (!selectedRequest) return;
    setErrorMessage(null);

    startTransition(async () => {
      const res = await adminEditExamRequestWorkflowAction(selectedRequest.id, {
        title: editTitle.trim(),
        subjects: editSubjects.map((s) => ({
          subjectId: s.subjectId,
          maxMarks: Number(s.maxMarks) || 100,
          passMark: Number(s.passMark) || 35,
        })),
      });

      if (!res.success) {
        setErrorMessage(res.error || "Failed to update request.");
      } else {
        setEditModalOpen(false);
        setSelectedRequest(null);
        router.refresh();
      }
    });
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.headerCard}>
        <div>
          <h1 className={styles.pageTitle}>
            <ShieldCheck size={26} color="#3b82f6" />
            Exam Requests Management
          </h1>
          <p className={styles.pageSubtitle}>
            Review exam requests submitted by class teachers and subject teachers. Approving an exam automatically creates marks-entry tasks for all subject teachers.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className={styles.filterBar}>
        <div className={styles.pillsRow}>
          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground, #fff)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <Filter size={15} /> Status:
          </span>
          <button
            onClick={() => setStatusFilter("PENDING")}
            className={`${styles.pill} ${statusFilter === "PENDING" ? styles.pillActive : ""}`}
          >
            Pending Approval ({requests.filter((r) => r.status === "PENDING_ADMIN" || r.status === "PENDING").length})
          </button>
          <button
            onClick={() => setStatusFilter("APPROVED")}
            className={`${styles.pill} ${statusFilter === "APPROVED" ? styles.pillActive : ""}`}
          >
            Approved ({requests.filter((r) => r.status === "APPROVED").length})
          </button>
          <button
            onClick={() => setStatusFilter("REJECTED")}
            className={`${styles.pill} ${statusFilter === "REJECTED" ? styles.pillActive : ""}`}
          >
            Declined ({requests.filter((r) => r.status === "REJECTED" || r.status === "DECLINED").length})
          </button>
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`${styles.pill} ${statusFilter === "ALL" ? styles.pillActive : ""}`}
          >
            All ({requests.length})
          </button>
        </div>

        <div style={{ position: "relative" }}>
          <input
            type="text"
            placeholder="Search exam, class, teacher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: "var(--card-bg, #1e293b)",
              border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
              color: "var(--foreground, #f8fafc)",
              padding: "0.45rem 0.85rem 0.45rem 2rem",
              borderRadius: "8px",
              fontSize: "0.85rem",
              outline: "none",
            }}
          />
          <Search size={14} style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary, #94a3b8)" }} />
        </div>
      </div>

      {/* Requests Table */}
      <div className={styles.tableCard}>
        {filteredRequests.length > 0 ? (
          <div className={styles.tableResponsive}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Exam Title</th>
                  <th>Class & Section</th>
                  <th>Type</th>
                  <th>Requested By</th>
                  <th>Subjects</th>
                  <th>Submitted Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((req) => {
                  const isPendingAdmin = req.status === "PENDING_ADMIN" || req.status === "PENDING";
                  const isApproved = req.status === "APPROVED";
                  const isRejected = req.status === "REJECTED" || req.status === "DECLINED";

                  return (
                    <tr key={req.id}>
                      <td style={{ fontWeight: 700, color: "var(--foreground, #fff)" }}>
                        {req.title}
                      </td>
                      <td>
                        {req.className} - {req.section}
                      </td>
                      <td style={{ textTransform: "capitalize", fontSize: "0.825rem" }}>
                        {req.examType.toLowerCase().replace("_", " ")}
                      </td>
                      <td style={{ color: "var(--foreground, #fff)", fontWeight: 500 }}>
                        {req.requestedByName}
                      </td>
                      <td>
                        <span style={{ background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", padding: "0.2rem 0.5rem", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600 }}>
                          {req.subjects.length} subjects
                        </span>
                      </td>
                      <td style={{ color: "var(--text-secondary, #94a3b8)", fontSize: "0.8rem" }}>
                        {new Date(req.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        {isPendingAdmin && (
                          <span className={`${styles.statusBadge} ${styles.statusPending}`}>
                            <Clock size={12} /> Pending Admin
                          </span>
                        )}
                        {isApproved && (
                          <span className={`${styles.statusBadge} ${styles.statusApproved}`}>
                            <CheckCircle2 size={12} /> Approved
                          </span>
                        )}
                        {isRejected && (
                          <span className={`${styles.statusBadge} ${styles.statusRejected}`}>
                            <AlertCircle size={12} /> Declined
                          </span>
                        )}
                      </td>
                      <td>
                        <div className={styles.actionBtns}>
                          {isPendingAdmin ? (
                            <>
                              <button
                                onClick={() => handleOpenApprove(req)}
                                className={styles.btnApprove}
                                title="Approve Request & Create Tasks"
                              >
                                <Check size={14} /> Accept
                              </button>
                              <button
                                onClick={() => handleOpenReject(req)}
                                className={styles.btnReject}
                                title="Decline Request"
                              >
                                <X size={14} /> Reject
                              </button>
                              <button
                                onClick={() => handleOpenEdit(req)}
                                className={styles.btnEdit}
                                title="Edit Request Details"
                              >
                                <Edit2 size={14} /> Edit
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedRequest(req);
                                setViewDetailsOpen(true);
                              }}
                              className={styles.btnView}
                            >
                              <Eye size={14} /> View Details
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <AlertTriangle size={42} style={{ opacity: 0.4 }} />
            <h3 style={{ margin: 0, color: "var(--foreground, #fff)" }}>No Exam Requests Found</h3>
            <p style={{ margin: 0, fontSize: "0.875rem" }}>
              {statusFilter === "PENDING"
                ? "There are no pending exam requests awaiting approval."
                : "No requests found for this filter criteria."}
            </p>
          </div>
        )}
      </div>

      {/* Approve Confirmation Modal */}
      <Modal
        isOpen={approveModalOpen}
        onClose={() => setApproveModalOpen(false)}
        title="Approve Exam Request & Create Marks Tasks"
        size="md"
      >
        {selectedRequest && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {errorMessage && (
              <div style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "0.75rem", borderRadius: "8px", color: "#f87171", fontSize: "0.85rem" }}>
                {errorMessage}
              </div>
            )}

            <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--foreground, #fff)" }}>
              Are you sure you want to approve <strong>"{selectedRequest.title}"</strong> for Class <strong>{selectedRequest.className} - {selectedRequest.section}</strong>?
            </p>

            <div style={{ background: "var(--background, #0f172a)", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))", borderRadius: "8px", padding: "0.85rem", fontSize: "0.85rem" }}>
              <div style={{ fontWeight: 700, marginBottom: "0.5rem", color: "var(--text-secondary, #94a3b8)", textTransform: "uppercase", fontSize: "0.75rem" }}>
                Tasks to be created ({selectedRequest.subjects.length} subjects):
              </div>
              <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {selectedRequest.subjects.map((s) => (
                  <li key={s.id} style={{ color: "var(--foreground, #fff)" }}>
                    <strong>{s.subjectName}</strong>: Max {s.maxMarks}m, Pass {s.passMark}m (Assigned Teacher: {s.teacherName || "Assigned by system"})
                  </li>
                ))}
              </ul>
            </div>

            <p style={{ margin: 0, fontSize: "0.825rem", color: "var(--text-secondary, #94a3b8)" }}>
              Upon approval, each subject teacher and the class teacher will receive instant notifications with their assigned marks-entry tasks.
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setApproveModalOpen(false)}
                disabled={isPending}
                style={{ background: "transparent", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.2))", color: "var(--text-secondary, #94a3b8)", padding: "0.5rem 1rem", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApprove}
                disabled={isPending}
                style={{ background: "#10b981", color: "#fff", border: "none", padding: "0.5rem 1.25rem", borderRadius: "8px", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                {isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Confirm Approval
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject Reason Modal */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Decline Exam Request"
        size="md"
      >
        {selectedRequest && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {errorMessage && (
              <div style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "0.75rem", borderRadius: "8px", color: "#f87171", fontSize: "0.85rem" }}>
                {errorMessage}
              </div>
            )}

            <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--foreground, #fff)" }}>
              Provide a reason for declining <strong>"{selectedRequest.title}"</strong> for Class <strong>{selectedRequest.className} - {selectedRequest.section}</strong>. The teacher will be notified with this feedback.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground, #fff)" }}>
                Reason for Rejection *
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Clashes with annual sports meet schedule. Please adjust dates to next week."
                rows={3}
                required
                style={{
                  background: "var(--background, #0f172a)",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                  color: "var(--foreground, #fff)",
                  padding: "0.6rem 0.85rem",
                  borderRadius: "8px",
                  fontSize: "0.875rem",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                disabled={isPending}
                style={{ background: "transparent", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.2))", color: "var(--text-secondary, #94a3b8)", padding: "0.5rem 1rem", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isPending || !rejectReason.trim()}
                style={{ background: "#ef4444", color: "#fff", border: "none", padding: "0.5rem 1.25rem", borderRadius: "8px", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem", opacity: !rejectReason.trim() ? 0.6 : 1 }}
              >
                {isPending ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                Decline Request
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Request Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Exam Request"
        size="md"
      >
        {selectedRequest && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {errorMessage && (
              <div style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "0.75rem", borderRadius: "8px", color: "#f87171", fontSize: "0.85rem" }}>
                {errorMessage}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground, #fff)" }}>
                Exam Title
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                style={{
                  background: "var(--background, #0f172a)",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                  color: "var(--foreground, #fff)",
                  padding: "0.55rem 0.85rem",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground, #fff)", textTransform: "uppercase" }}>
                Subject Marks Configuration
              </label>
              <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))", borderRadius: "8px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ background: "var(--background, #0f172a)", color: "var(--text-secondary, #94a3b8)" }}>
                      <th style={{ padding: "0.5rem 0.75rem", textAlign: "left" }}>Subject</th>
                      <th style={{ padding: "0.5rem 0.75rem", textAlign: "left" }}>Max Marks</th>
                      <th style={{ padding: "0.5rem 0.75rem", textAlign: "left" }}>Pass Mark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editSubjects.map((sub, idx) => (
                      <tr key={sub.subjectId} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                        <td style={{ padding: "0.5rem 0.75rem", color: "var(--foreground, #fff)", fontWeight: 600 }}>
                          {sub.subjectName}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>
                          <input
                            type="number"
                            min={1}
                            max={1000}
                            value={sub.maxMarks}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setEditSubjects((prev) => {
                                const copy = [...prev];
                                copy[idx].maxMarks = val;
                                return copy;
                              });
                            }}
                            style={{
                              width: "70px",
                              padding: "0.3rem 0.5rem",
                              borderRadius: "6px",
                              background: "var(--background, #0f172a)",
                              border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                              color: "var(--foreground, #fff)",
                            }}
                          />
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>
                          <input
                            type="number"
                            min={1}
                            max={sub.maxMarks}
                            value={sub.passMark}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setEditSubjects((prev) => {
                                const copy = [...prev];
                                copy[idx].passMark = val;
                                return copy;
                              });
                            }}
                            style={{
                              width: "70px",
                              padding: "0.3rem 0.5rem",
                              borderRadius: "6px",
                              background: "var(--background, #0f172a)",
                              border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                              color: "var(--foreground, #fff)",
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                disabled={isPending}
                style={{ background: "transparent", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.2))", color: "var(--text-secondary, #94a3b8)", padding: "0.5rem 1rem", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmEdit}
                disabled={isPending}
                style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "0.5rem 1.25rem", borderRadius: "8px", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                {isPending ? <Loader2 size={16} className="animate-spin" /> : <SaveIcon />}
                Save Changes
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* View Details Modal */}
      <Modal
        isOpen={viewDetailsOpen}
        onClose={() => setViewDetailsOpen(false)}
        title="Exam Request Details"
        size="md"
      >
        {selectedRequest && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--foreground, #fff)" }}>
                {selectedRequest.title}
              </h3>
              <span className={`${styles.statusBadge} ${selectedRequest.status === "APPROVED" ? styles.statusApproved : selectedRequest.status === "REJECTED" ? styles.statusRejected : styles.statusPending}`}>
                {selectedRequest.status}
              </span>
            </div>

            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary, #94a3b8)" }}>
              Class: <strong>{selectedRequest.className} - {selectedRequest.section}</strong> • Type: {selectedRequest.examType}
            </p>

            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--foreground, #fff)" }}>
              Requested by: <strong>{selectedRequest.requestedByName}</strong> on {new Date(selectedRequest.createdAt).toLocaleDateString()}
            </p>

            {selectedRequest.remarks && (
              <div style={{ background: "rgba(255, 255, 255, 0.04)", padding: "0.75rem", borderRadius: "8px", fontSize: "0.85rem" }}>
                <strong>Teacher Remarks: </strong> {selectedRequest.remarks}
              </div>
            )}

            {selectedRequest.adminRemark && (
              <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.25)", padding: "0.75rem", borderRadius: "8px", color: "#fca5a5", fontSize: "0.85rem" }}>
                <strong>Admin Feedback: </strong> {selectedRequest.adminRemark}
              </div>
            )}

            <div>
              <div style={{ fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary, #94a3b8)", marginBottom: "0.5rem" }}>
                Configured Subjects ({selectedRequest.subjects.length}):
              </div>
              <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.875rem" }}>
                {selectedRequest.subjects.map((s) => (
                  <li key={s.id} style={{ color: "var(--foreground, #fff)" }}>
                    <strong>{s.subjectName}</strong>: Max {s.maxMarks}m, Pass {s.passMark}m (Teacher: {s.teacherName || "Assigned by system"})
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setViewDetailsOpen(false)}
                style={{ background: "rgba(255, 255, 255, 0.1)", color: "#fff", border: "none", padding: "0.5rem 1.25rem", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function SaveIcon() {
  return <Check size={16} />;
}
