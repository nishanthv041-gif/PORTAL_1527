"use client";

import { useState, useTransition } from "react";
import { 
  Layers, Plus, ArrowRight, Sparkles, GraduationCap, Users, 
  Calendar, Check, AlertCircle, RefreshCw, Star, ShieldCheck, 
  Clock, BookOpen, X, Loader2, Edit3, Trash2, History
} from "lucide-react";
import PromotionWizardModal from "./PromotionWizardModal";
import GraduatedStudentsTable from "./GraduatedStudentsTable";
import { 
  createBatchAction, 
  setCurrentBatchAction, 
  assignClassesToBatchAction,
  getPromotionAuditHistoryAction,
  updateBatchDatesAction,
  deleteBatchAction
} from "@/backend/api/actions/dashboard/admin/batches/actions";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";

interface BatchClassItem {
  id: string;
  name: string;
  section: string;
  _count: {
    students: number;
  };
}

interface BatchItem {
  id: string;
  name: string;
  academicYear: string | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
  isCurrent: boolean;
  status: string;
  createdAt: Date | string;
  classes: BatchClassItem[];
  _count: {
    promotionsFrom: number;
    promotionsTo: number;
  };
}

interface BatchManagementClientProps {
  batches: BatchItem[];
  currentBatch: BatchItem | null;
  unassignedClasses: { id: string; name: string; section: string }[];
}

export default function BatchManagementClient({
  batches: initialBatches,
  currentBatch: initialCurrentBatch,
  unassignedClasses: initialUnassignedClasses
}: BatchManagementClientProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<"OVERVIEW" | "ALL_BATCHES" | "ALUMNI" | "AUDIT">("OVERVIEW");
  const [showWizard, setShowWizard] = useState<boolean>(false);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);

  // Edit Batch Dates State
  const [editingBatch, setEditingBatch] = useState<BatchItem | null>(null);
  const [editBatchName, setEditBatchName] = useState<string>("");
  const [editBatchAcademicYear, setEditBatchAcademicYear] = useState<string>("");
  const [editBatchStartDate, setEditBatchStartDate] = useState<string>("");
  const [editBatchEndDate, setEditBatchEndDate] = useState<string>("");

  // Delete Batch Confirmation Modal State
  const [deletingBatch, setDeletingBatch] = useState<BatchItem | null>(null);

  // Helper to format dates cleanly
  const formatDateDisplay = (date: Date | string | null | undefined) => {
    if (!date) return null;
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return null;
    }
  };

  const handleOpenEditDates = (batch: BatchItem) => {
    setEditingBatch(batch);
    setEditBatchName(batch.name);
    setEditBatchAcademicYear(batch.academicYear || "");
    setEditBatchStartDate(batch.startDate ? new Date(batch.startDate).toISOString().split("T")[0] : "");
    setEditBatchEndDate(batch.endDate ? new Date(batch.endDate).toISOString().split("T")[0] : "");
  };

  const handleSaveEditDates = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBatch) return;

    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const res = await updateBatchDatesAction({
        batchId: editingBatch.id,
        name: editBatchName,
        academicYear: editBatchAcademicYear,
        startDate: editBatchStartDate || null,
        endDate: editBatchEndDate || null
      });

      if (res.success) {
        setFeedbackSuccess(`Batch '${editBatchName}' dates and details updated.`);
        setEditingBatch(null);
        router.refresh();
      } else {
        setFeedbackError(res.error || "Failed to update batch dates.");
      }
    });
  };

  const handleConfirmDeleteBatch = () => {
    if (!deletingBatch) return;

    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const res = await deleteBatchAction(deletingBatch.id);
      if (res.success) {
        setFeedbackSuccess(`Batch '${deletingBatch.name}' has been deleted.`);
        setDeletingBatch(null);
        router.refresh();
      } else {
        setFeedbackError(res.error || "Failed to delete batch.");
      }
    });
  };

  // Create Batch Form State
  const [newBatchName, setNewBatchName] = useState<string>("");
  const [newBatchAcademicYear, setNewBatchAcademicYear] = useState<string>("");
  const [newBatchIsCurrent, setNewBatchIsCurrent] = useState<boolean>(false);
  const [newBatchStartDate, setNewBatchStartDate] = useState<string>("");
  const [newBatchEndDate, setNewBatchEndDate] = useState<string>("");

  // Audit History State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);

  const [isPending, startTransition] = useTransition();
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  const currentBatch = initialBatches.find(b => b.isCurrent) || initialCurrentBatch || initialBatches[0] || null;
  const previousBatches = initialBatches.filter(b => !b.isCurrent);

  // Total metrics
  const totalStudentsInCurrentBatch = (currentBatch?.classes || []).reduce((acc, c) => acc + c._count.students, 0);

  // Handle Create Batch Submission
  const handleCreateBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatchName.trim()) {
      setFeedbackError("Batch name is required (e.g. '25-26' or '2025-2026').");
      return;
    }

    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("name", newBatchName.trim());
      formData.set("academicYear", newBatchAcademicYear.trim() || newBatchName.trim());
      formData.set("isCurrent", String(newBatchIsCurrent));
      formData.set("startDate", newBatchStartDate);
      formData.set("endDate", newBatchEndDate);

      const res = await createBatchAction(formData);
      if (res.success) {
        setFeedbackSuccess(`Batch '${newBatchName}' created successfully.`);
        setShowCreateModal(false);
        setNewBatchName("");
        setNewBatchAcademicYear("");
        router.refresh();
      } else {
        setFeedbackError(res.error || "Failed to create batch.");
      }
    });
  };

  // Handle Set Current Batch
  const handleSetCurrent = async (batchId: string, batchName: string) => {
    const ok = await confirm({
      title: `Set Active Session: ${batchName}?`,
      message: `Are you sure you want to set Batch '${batchName}' as the active academic session? Portal promotions, classes, and records will reference this session.`,
      confirmText: "Set Active",
      cancelText: "Cancel",
      variant: "primary"
    });
    if (!ok) return;

    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const res = await setCurrentBatchAction(batchId);
      if (res.success) {
        setFeedbackSuccess(`Batch '${batchName}' is now the active academic session.`);
        router.refresh();
      } else {
        setFeedbackError(res.error || "Failed to set active batch.");
      }
    });
  };

  // Handle Assign All Unlinked Classes to Current Batch
  const handleAssignUnlinkedClasses = () => {
    if (!currentBatch || initialUnassignedClasses.length === 0) return;

    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const classIds = initialUnassignedClasses.map(c => c.id);
      const res = await assignClassesToBatchAction(currentBatch.id, classIds);
      if (res.success) {
        setFeedbackSuccess(`Assigned ${classIds.length} classes to Batch '${currentBatch.name}'.`);
        router.refresh();
      } else {
        setFeedbackError(res.error || "Failed to assign classes.");
      }
    });
  };

  // Fetch Audit Logs when tab selected
  const handleSelectAuditTab = async () => {
    setActiveTab("AUDIT");
    setLoadingAudit(true);
    try {
      const res = await getPromotionAuditHistoryAction();
      if (res.success && res.history) {
        setAuditLogs(res.history);
      }
    } finally {
      setLoadingAudit(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* ======================================================== */}
      {/* HEADER BAR WITH PRIMARY ACTIONS */}
      {/* ======================================================== */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1.25rem",
        padding: "1.75rem 2rem",
        backgroundColor: "var(--card-bg, #ffffff)",
        border: "1px solid var(--border-color, #e5e7eb)",
        borderRadius: "16px",
        background: "linear-gradient(to right, rgba(99, 102, 241, 0.05), transparent)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            backgroundColor: "rgba(99, 102, 241, 0.15)",
            color: "#6366f1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <Layers size={26} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, color: "var(--foreground)" }}>
                Academic Batches & Student Promotion
              </h2>
              {currentBatch && (
                <span style={{
                  padding: "0.2rem 0.65rem",
                  borderRadius: "20px",
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  backgroundColor: "rgba(16, 185, 129, 0.15)",
                  color: "#10b981",
                  border: "1px solid rgba(16, 185, 129, 0.3)"
                }}>
                  Active: Batch {currentBatch.name}
                </span>
              )}
            </div>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              Manage school batches, increment classes annually, and advance students with Class 12 alumni graduation.
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: "0.65rem 1.25rem",
              borderRadius: "10px",
              border: "1px solid var(--border-color, #e5e7eb)",
              backgroundColor: "transparent",
              color: "var(--foreground)",
              fontWeight: 700,
              fontSize: "0.875rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem"
            }}
          >
            <Plus size={16} /> Create Batch
          </button>

          <button
            type="button"
            onClick={() => setShowWizard(true)}
            style={{
              padding: "0.65rem 1.35rem",
              borderRadius: "10px",
              border: "none",
              backgroundColor: "var(--primary, #6366f1)",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "0.875rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              boxShadow: "0 2px 10px rgba(99, 102, 241, 0.35)"
            }}
          >
            <Sparkles size={16} /> Promote to Next Batch
          </button>
        </div>
      </div>

      {/* Feedback Alerts */}
      {feedbackError && (
        <div style={{
          padding: "0.85rem 1.25rem",
          backgroundColor: "rgba(239, 68, 68, 0.12)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "10px",
          color: "#ef4444",
          fontSize: "0.875rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem"
        }}>
          <AlertCircle size={18} /> {feedbackError}
        </div>
      )}

      {feedbackSuccess && (
        <div style={{
          padding: "0.85rem 1.25rem",
          backgroundColor: "rgba(16, 185, 129, 0.12)",
          border: "1px solid rgba(16, 185, 129, 0.3)",
          borderRadius: "10px",
          color: "#10b981",
          fontSize: "0.875rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem"
        }}>
          <Check size={18} /> {feedbackSuccess}
        </div>
      )}

      {/* ======================================================== */}
      {/* TOP METRICS STATS */}
      {/* ======================================================== */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "1.25rem"
      }}>
        <div style={{
          padding: "1.25rem 1.5rem",
          borderRadius: "14px",
          backgroundColor: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border-color, #e5e7eb)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: "0.5rem"
        }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>
                Active Session Batch
              </div>
              {currentBatch && (
                <button
                  type="button"
                  onClick={() => handleOpenEditDates(currentBatch)}
                  style={{
                    padding: "0.25rem 0.5rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "transparent",
                    color: "var(--foreground)",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.3rem"
                  }}
                  title="Edit batch dates and academic year"
                >
                  <Edit3 size={12} /> Edit Dates
                </button>
              )}
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, marginTop: "0.35rem", color: "var(--foreground)" }}>
              {currentBatch ? currentBatch.name : "None Configured"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#10b981", marginTop: "0.25rem", fontWeight: 600 }}>
              ● Primary school academic year
            </div>
          </div>

          <div style={{
            fontSize: "0.75rem",
            color: "var(--text-secondary)",
            paddingTop: "0.4rem",
            borderTop: "1px dashed var(--border-color)",
            display: "flex",
            alignItems: "center",
            gap: "0.35rem"
          }}>
            <Calendar size={13} color="var(--primary)" />
            {currentBatch?.startDate || currentBatch?.endDate ? (
              <span>
                <strong>Timeline:</strong> {formatDateDisplay(currentBatch.startDate) || "Start TBD"} – {formatDateDisplay(currentBatch.endDate) || "End TBD"}
              </span>
            ) : (
              <span style={{ fontStyle: "italic", opacity: 0.85 }}>Timeline dates not set (click &apos;Edit Dates&apos;)</span>
            )}
          </div>
        </div>

        <div style={{
          padding: "1.25rem 1.5rem",
          borderRadius: "14px",
          backgroundColor: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border-color, #e5e7eb)"
        }}>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>
            Classes in Active Batch
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, marginTop: "0.35rem", color: "var(--foreground)" }}>
            {currentBatch ? currentBatch.classes.length : 0}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Active grade sections
          </div>
        </div>

        <div style={{
          padding: "1.25rem 1.5rem",
          borderRadius: "14px",
          backgroundColor: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border-color, #e5e7eb)"
        }}>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>
            Active Students
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, marginTop: "0.35rem", color: "var(--foreground)" }}>
            {totalStudentsInCurrentBatch}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Enrolled in current classes
          </div>
        </div>

        <div style={{
          padding: "1.25rem 1.5rem",
          borderRadius: "14px",
          backgroundColor: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border-color, #e5e7eb)"
        }}>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>
            Total Batches Registered
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, marginTop: "0.35rem", color: "var(--foreground)" }}>
            {initialBatches.length}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Historical & upcoming cohorts
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TABS NAVIGATION */}
      {/* ======================================================== */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        borderBottom: "1px solid var(--border-color, #e5e7eb)",
        paddingBottom: "0.5rem",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        whiteSpace: "nowrap",
        maxWidth: "100%",
        scrollbarWidth: "none"
      }}>
        <button
          type="button"
          onClick={() => setActiveTab("OVERVIEW")}
          style={{
            padding: "0.6rem 1.15rem",
            borderRadius: "8px",
            border: "none",
            backgroundColor: activeTab === "OVERVIEW" ? "rgba(99, 102, 241, 0.15)" : "transparent",
            color: activeTab === "OVERVIEW" ? "var(--primary, #6366f1)" : "var(--text-secondary)",
            fontWeight: 700,
            fontSize: "0.875rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem"
          }}
        >
          <BookOpen size={16} /> Batch Overview & Classes
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ALL_BATCHES")}
          style={{
            padding: "0.6rem 1.15rem",
            borderRadius: "8px",
            border: "none",
            backgroundColor: activeTab === "ALL_BATCHES" ? "rgba(99, 102, 241, 0.15)" : "transparent",
            color: activeTab === "ALL_BATCHES" ? "var(--primary, #6366f1)" : "var(--text-secondary)",
            fontWeight: 700,
            fontSize: "0.875rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem"
          }}
        >
          <Layers size={16} /> All Batches ({initialBatches.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ALUMNI")}
          style={{
            padding: "0.6rem 1.15rem",
            borderRadius: "8px",
            border: "none",
            backgroundColor: activeTab === "ALUMNI" ? "rgba(245, 158, 11, 0.15)" : "transparent",
            color: activeTab === "ALUMNI" ? "#f59e0b" : "var(--text-secondary)",
            fontWeight: 700,
            fontSize: "0.875rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem"
          }}
        >
          <GraduationCap size={16} /> Graduated Alumni (Class 12)
        </button>

        <button
          type="button"
          onClick={handleSelectAuditTab}
          style={{
            padding: "0.6rem 1.15rem",
            borderRadius: "8px",
            border: "none",
            backgroundColor: activeTab === "AUDIT" ? "rgba(99, 102, 241, 0.15)" : "transparent",
            color: activeTab === "AUDIT" ? "var(--primary, #6366f1)" : "var(--text-secondary)",
            fontWeight: 700,
            fontSize: "0.875rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem"
          }}
        >
          <Clock size={16} /> Promotion Audit Trail
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: OVERVIEW & CLASSES IN CURRENT BATCH */}
      {/* ======================================================== */}
      {activeTab === "OVERVIEW" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Unassigned Classes Notice (if any) */}
          {initialUnassignedClasses.length > 0 && currentBatch && (
            <div style={{
              padding: "1rem 1.25rem",
              backgroundColor: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.25)",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem"
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--foreground)" }}>
                  ⚠️ {initialUnassignedClasses.length} Active Class(es) Not Linked to a Batch
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                  Link these classes to Batch '{currentBatch.name}' so they are included in attendance rolls and automatic batch promotions.
                </div>
              </div>
              <button
                type="button"
                onClick={handleAssignUnlinkedClasses}
                disabled={isPending}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "#f59e0b",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem"
                }}
              >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Link to Batch {currentBatch.name}
              </button>
            </div>
          )}

          {/* Classes in Current Batch */}
          {(!currentBatch || currentBatch.classes.length === 0) ? (
            <div style={{
              textAlign: "center",
              padding: "3.5rem 2rem",
              border: "1px dashed var(--border-color)",
              borderRadius: "14px",
              color: "var(--text-secondary)"
            }}>
              <BookOpen size={44} style={{ opacity: 0.4, marginBottom: "0.5rem" }} />
              <h4 style={{ margin: "0 0 0.25rem", color: "var(--foreground)" }}>No Classes In Current Batch</h4>
              <p style={{ margin: 0, fontSize: "0.875rem" }}>
                Create classes or link existing classes to Batch {currentBatch?.name || ""} to see them listed here.
              </p>
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "1.25rem"
            }}>
              {currentBatch.classes.map((cls) => {
                const isGrade12 = cls.name.includes("12") || cls.name.toUpperCase().includes("XII");

                return (
                  <div
                    key={cls.id}
                    style={{
                      padding: "1.25rem 1.5rem",
                      borderRadius: "14px",
                      backgroundColor: "var(--card-bg, #ffffff)",
                      border: `1px solid ${isGrade12 ? "rgba(245, 158, 11, 0.4)" : "var(--border-color, #e5e7eb)"}`,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "1rem",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                        <span style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--foreground)" }}>
                          {cls.name} - Section {cls.section}
                        </span>
                        {isGrade12 && (
                          <span style={{
                            padding: "0.15rem 0.5rem",
                            borderRadius: "12px",
                            backgroundColor: "rgba(245, 158, 11, 0.15)",
                            color: "#f59e0b",
                            fontSize: "0.7rem",
                            fontWeight: 800
                          }}>
                            🎓 Graduating Grade
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        Batch: <strong>{currentBatch.name}</strong>
                      </div>
                    </div>

                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingTop: "0.75rem",
                      borderTop: "1px solid var(--border-color, #e5e7eb)",
                      fontSize: "0.875rem"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--text-secondary)" }}>
                        <Users size={16} /> Enrolled Students:
                      </div>
                      <div style={{ fontWeight: 800, color: "var(--foreground)", fontSize: "1rem" }}>
                        {cls._count.students}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ======================================================== */}
          {/* PREVIOUS BATCHES & ACADEMIC YEARS DELETION & MANAGEMENT */}
          {/* ======================================================== */}
          <div style={{
            marginTop: "0.5rem",
            padding: "1.5rem",
            borderRadius: "16px",
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--card-bg, #ffffff)",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div style={{
                  padding: "0.5rem",
                  borderRadius: "10px",
                  backgroundColor: "rgba(99, 102, 241, 0.1)",
                  color: "var(--primary, #6366f1)"
                }}>
                  <History size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--foreground)" }}>
                    Previous Batches &amp; Academic Years
                  </h3>
                  <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                    Manage or permanently delete past batches and academic years. Unlinks assigned classes while protecting enrolled student records.
                  </p>
                </div>
              </div>

              <div style={{
                fontSize: "0.8125rem",
                fontWeight: 700,
                padding: "0.35rem 0.75rem",
                borderRadius: "20px",
                backgroundColor: previousBatches.length > 0 ? "rgba(239, 68, 68, 0.1)" : "rgba(107, 114, 128, 0.1)",
                color: previousBatches.length > 0 ? "#ef4444" : "var(--text-secondary)"
              }}>
                {previousBatches.length} Previous Batch{previousBatches.length === 1 ? "" : "es"}
              </div>
            </div>

            {previousBatches.length === 0 ? (
              <div style={{
                textAlign: "center",
                padding: "2rem",
                borderRadius: "12px",
                border: "1px dashed var(--border-color)",
                color: "var(--text-secondary)",
                fontSize: "0.875rem"
              }}>
                No previous batches found. When new batches are created or rotated, older academic sessions will appear here with deletion options.
              </div>
            ) : (
              <div style={{ width: "100%", overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: "650px", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-color)", textAlign: "left", color: "var(--text-secondary)", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      <th style={{ padding: "0.75rem 1rem", fontWeight: 700 }}>Batch Name</th>
                      <th style={{ padding: "0.75rem 1rem", fontWeight: 700 }}>Academic Year</th>
                      <th style={{ padding: "0.75rem 1rem", fontWeight: 700 }}>Calendar Dates</th>
                      <th style={{ padding: "0.75rem 1rem", fontWeight: 700 }}>Classes &amp; Students</th>
                      <th style={{ padding: "0.75rem 1rem", fontWeight: 700, textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previousBatches.map((b) => {
                      const totalStudents = b.classes.reduce((sum, c) => sum + c._count.students, 0);
                      return (
                        <tr key={b.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                          <td style={{ padding: "0.85rem 1rem" }}>
                            <div style={{ fontWeight: 700, color: "var(--foreground)" }}>{b.name}</div>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Status: {b.status}</span>
                          </td>
                          <td style={{ padding: "0.85rem 1rem", color: "var(--text-secondary)" }}>
                            {b.academicYear || "—"}
                          </td>
                          <td style={{ padding: "0.85rem 1rem" }}>
                            {b.startDate || b.endDate ? (
                              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8125rem" }}>
                                <Calendar size={13} color="var(--primary)" />
                                <span>{formatDateDisplay(b.startDate) || "TBD"} – {formatDateDisplay(b.endDate) || "TBD"}</span>
                              </div>
                            ) : (
                              <span style={{ fontStyle: "italic", opacity: 0.6 }}>Not set</span>
                            )}
                          </td>
                          <td style={{ padding: "0.85rem 1rem" }}>
                            <div>{b.classes.length} class{b.classes.length === 1 ? "" : "es"}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{totalStudents} student{totalStudents === 1 ? "" : "s"}</div>
                          </td>
                          <td style={{ padding: "0.85rem 1rem", textAlign: "right" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.5rem" }}>
                              <button
                                type="button"
                                onClick={() => handleSetCurrent(b.id, b.name)}
                                disabled={isPending}
                                style={{
                                  padding: "0.4rem 0.75rem",
                                  borderRadius: "6px",
                                  border: "1px solid var(--border-color)",
                                  backgroundColor: "transparent",
                                  color: "var(--foreground)",
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                  cursor: "pointer"
                                }}
                              >
                                Restore Active
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditDates(b)}
                                disabled={isPending}
                                style={{
                                  padding: "0.4rem 0.75rem",
                                  borderRadius: "6px",
                                  border: "1px solid var(--border-color)",
                                  backgroundColor: "transparent",
                                  color: "var(--foreground)",
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.3rem"
                                }}
                              >
                                <Edit3 size={13} /> Dates
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingBatch(b)}
                                disabled={isPending}
                                style={{
                                  padding: "0.4rem 0.85rem",
                                  borderRadius: "6px",
                                  border: "1px solid rgba(239, 68, 68, 0.4)",
                                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                                  color: "#ef4444",
                                  fontSize: "0.75rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.35rem"
                                }}
                                title="Permanently delete this previous batch and its academic year"
                              >
                                <Trash2 size={13} /> Delete Batch &amp; Year
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: ALL BATCHES TABLE */}
      {/* ======================================================== */}
      {activeTab === "ALL_BATCHES" && (
        <div style={{
          border: "1px solid var(--border-color, #e5e7eb)",
          borderRadius: "14px",
          backgroundColor: "var(--card-bg, #ffffff)",
          overflow: "hidden",
          width: "100%",
          maxWidth: "100%"
        }}>
          <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", minWidth: "750px", borderCollapse: "collapse", fontSize: "0.875rem", textAlign: "left" }}>
              <thead>
                <tr style={{ backgroundColor: "rgba(0,0,0,0.02)", borderBottom: "1px solid var(--border-color)" }}>
                  <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Batch Name</th>
                  <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Academic Year</th>
                  <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Start &amp; End Dates</th>
                  <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Classes Linked</th>
                  <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Students</th>
                  <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Status</th>
                  <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {initialBatches.map((b) => {
                  const totalStudents = b.classes.reduce((sum, c) => sum + c._count.students, 0);

                  return (
                    <tr key={b.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                      <td style={{ padding: "0.85rem 1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <strong>{b.name}</strong>
                          {b.isCurrent && (
                            <span style={{
                              padding: "0.15rem 0.5rem",
                              borderRadius: "12px",
                              backgroundColor: "rgba(16, 185, 129, 0.15)",
                              color: "#10b981",
                              fontSize: "0.7rem",
                              fontWeight: 800
                            }}>
                              Current Active
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "0.85rem 1rem", color: "var(--text-secondary)" }}>
                        {b.academicYear || b.name}
                      </td>
                      <td style={{ padding: "0.85rem 1rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        {b.startDate || b.endDate ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                            <Calendar size={13} color="var(--primary)" />
                            <span>{formatDateDisplay(b.startDate) || "TBD"} – {formatDateDisplay(b.endDate) || "TBD"}</span>
                          </div>
                        ) : (
                          <span style={{ fontStyle: "italic", opacity: 0.6 }}>Not set</span>
                        )}
                      </td>
                      <td style={{ padding: "0.85rem 1rem" }}>
                        {b.classes.length} class{b.classes.length === 1 ? "" : "es"}
                      </td>
                      <td style={{ padding: "0.85rem 1rem", fontWeight: 600 }}>
                        {totalStudents} student{totalStudents === 1 ? "" : "s"}
                      </td>
                      <td style={{ padding: "0.85rem 1rem" }}>
                        <span style={{
                          padding: "0.2rem 0.5rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          backgroundColor: b.status === "ACTIVE" ? "rgba(16, 185, 129, 0.1)" : (b.status === "COMPLETED" ? "rgba(107, 114, 128, 0.1)" : "rgba(99, 102, 241, 0.1)"),
                          color: b.status === "ACTIVE" ? "#10b981" : (b.status === "COMPLETED" ? "#6b7280" : "#6366f1")
                        }}>
                          {b.status}
                        </span>
                      </td>
                      <td style={{ padding: "0.85rem 1rem", textAlign: "right" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.45rem", flexWrap: "wrap" }}>
                          {!b.isCurrent && (
                            <button
                              type="button"
                              onClick={() => handleSetCurrent(b.id, b.name)}
                              disabled={isPending}
                              style={{
                                padding: "0.35rem 0.65rem",
                                borderRadius: "6px",
                                border: "1px solid var(--border-color)",
                                backgroundColor: "transparent",
                                color: "var(--foreground)",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                cursor: "pointer",
                                whiteSpace: "nowrap"
                              }}
                            >
                              Set Active
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEditDates(b)}
                            disabled={isPending}
                            style={{
                              padding: "0.35rem 0.65rem",
                              borderRadius: "6px",
                              border: "1px solid var(--border-color)",
                              backgroundColor: "transparent",
                              color: "var(--foreground)",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              whiteSpace: "nowrap"
                            }}
                            title="Edit batch duration and dates"
                          >
                            <Edit3 size={12} /> Dates
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingBatch(b)}
                            disabled={isPending}
                            style={{
                              padding: "0.35rem 0.65rem",
                              borderRadius: "6px",
                              border: "1px solid rgba(239, 68, 68, 0.3)",
                              backgroundColor: "rgba(239, 68, 68, 0.08)",
                              color: "#ef4444",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              whiteSpace: "nowrap"
                            }}
                            title="Delete this batch"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: GRADUATED STUDENTS (ALUMNI) */}
      {/* ======================================================== */}
      {activeTab === "ALUMNI" && (
        <GraduatedStudentsTable />
      )}

      {/* ======================================================== */}
      {/* TAB 4: PROMOTION AUDIT TRAIL */}
      {/* ======================================================== */}
      {activeTab === "AUDIT" && (
        <div style={{
          border: "1px solid var(--border-color, #e5e7eb)",
          borderRadius: "14px",
          backgroundColor: "var(--card-bg, #ffffff)",
          overflow: "hidden"
        }}>
          {loadingAudit ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
              <Loader2 size={30} className="animate-spin" style={{ color: "var(--primary)" }} />
              <p style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>Loading promotion logs...</p>
            </div>
          ) : auditLogs.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: "3.5rem 2rem",
              color: "var(--text-secondary)"
            }}>
              <Clock size={40} style={{ opacity: 0.4, marginBottom: "0.5rem" }} />
              <h4 style={{ margin: "0 0 0.25rem", color: "var(--foreground)" }}>No Promotion Logs Recorded Yet</h4>
              <p style={{ margin: 0, fontSize: "0.875rem" }}>
                Every batch promotion action, class advancement, and Class 12 graduation is tracked here.
              </p>
            </div>
          ) : (
            <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", minWidth: "680px", borderCollapse: "collapse", fontSize: "0.875rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ backgroundColor: "rgba(0,0,0,0.02)", borderBottom: "1px solid var(--border-color)" }}>
                    <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Timestamp</th>
                    <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Student</th>
                    <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>From ➔ To Batch</th>
                    <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Class Progression</th>
                    <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                      <td style={{ padding: "0.85rem 1rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        {new Date(log.promotedAt).toLocaleString()}
                      </td>
                      <td style={{ padding: "0.85rem 1rem" }}>
                        <strong>{log.student?.firstName} {log.student?.lastName}</strong>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Roll: {log.student?.rollNumber}</div>
                      </td>
                      <td style={{ padding: "0.85rem 1rem" }}>
                        {log.fromBatchName} ➔ <strong>{log.toBatchName}</strong>
                      </td>
                      <td style={{ padding: "0.85rem 1rem" }}>
                        {log.fromClassName} ➔ <strong style={{ color: log.action === "GRADUATED" ? "#f59e0b" : "#10b981" }}>{log.toClassName}</strong>
                      </td>
                      <td style={{ padding: "0.85rem 1rem" }}>
                        <span style={{
                          padding: "0.2rem 0.5rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          backgroundColor: log.action === "GRADUATED" ? "rgba(245, 158, 11, 0.15)" : "rgba(16, 185, 129, 0.15)",
                          color: log.action === "GRADUATED" ? "#f59e0b" : "#10b981"
                        }}>
                          {log.action}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* PROMOTION WIZARD MODAL */}
      {/* ======================================================== */}
      {showWizard && (
        <PromotionWizardModal
          batches={initialBatches}
          currentBatch={currentBatch}
          onClose={() => setShowWizard(false)}
          onSuccess={() => {
            router.refresh();
          }}
        />
      )}

      {/* ======================================================== */}
      {/* CREATE BATCH MODAL */}
      {/* ======================================================== */}
      {showCreateModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: "1rem"
        }}>
          <div style={{
            backgroundColor: "var(--card-bg, #ffffff)",
            borderRadius: "16px",
            border: "1px solid var(--border-color)",
            width: "100%",
            maxWidth: "500px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
            overflow: "hidden"
          }}>
            <div style={{
              padding: "1.25rem 1.5rem",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Plus size={18} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>Create New Academic Batch</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateBatch} style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                  Batch Name (e.g. "25-26" or "2025-2026") *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 25-26 or 2026-2027"
                  value={newBatchName}
                  onChange={(e) => setNewBatchName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "transparent",
                    color: "var(--foreground)",
                    fontSize: "0.9375rem"
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                  Academic Year Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Academic Year 2026-2027"
                  value={newBatchAcademicYear}
                  onChange={(e) => setNewBatchAcademicYear(e.target.value)}
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={newBatchStartDate}
                    onChange={(e) => setNewBatchStartDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "transparent",
                      color: "var(--foreground)",
                      fontSize: "0.875rem"
                    }}
                  />
                  <span style={{ display: "block", fontSize: "0.725rem", color: "var(--text-secondary)", marginTop: "0.3rem", lineHeight: 1.35 }}>
                    📅 <strong>Calendar &amp; Attendance:</strong> Connects to School Calendar and starts day-to-day working day attendance count from this date.
                  </span>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    value={newBatchEndDate}
                    onChange={(e) => setNewBatchEndDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "transparent",
                      color: "var(--foreground)",
                      fontSize: "0.875rem"
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                <input
                  type="checkbox"
                  id="batchIsCurrentCheckbox"
                  checked={newBatchIsCurrent}
                  onChange={(e) => setNewBatchIsCurrent(e.target.checked)}
                  style={{ width: "16px", height: "16px", cursor: "pointer" }}
                />
                <label htmlFor="batchIsCurrentCheckbox" style={{ fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}>
                  Set as current active academic session immediately
                </label>
              </div>

              <div style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.75rem",
                marginTop: "0.5rem",
                paddingTop: "1rem",
                borderTop: "1px solid var(--border-color)"
              }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isPending}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "transparent",
                    color: "var(--foreground)",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    fontWeight: 600
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    padding: "0.5rem 1.25rem",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "var(--primary, #6366f1)",
                    color: "#ffffff",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem"
                  }}
                >
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Create Batch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* EDIT BATCH DATES & DETAILS MODAL */}
      {/* ======================================================== */}
      {editingBatch && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: "1rem"
        }}>
          <div style={{
            backgroundColor: "var(--card-bg, #ffffff)",
            borderRadius: "16px",
            border: "1px solid var(--border-color)",
            width: "100%",
            maxWidth: "500px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
            overflow: "hidden"
          }}>
            <div style={{
              padding: "1.25rem 1.5rem",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Edit3 size={18} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>
                  Edit Dates &amp; Details: Batch {editingBatch.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingBatch(null)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEditDates} style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                  Batch Name *
                </label>
                <input
                  type="text"
                  required
                  value={editBatchName}
                  onChange={(e) => setEditBatchName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "transparent",
                    color: "var(--foreground)",
                    fontSize: "0.9375rem"
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                  Academic Year Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Academic Year 2026-2027"
                  value={editBatchAcademicYear}
                  onChange={(e) => setEditBatchAcademicYear(e.target.value)}
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={editBatchStartDate}
                    onChange={(e) => setEditBatchStartDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "transparent",
                      color: "var(--foreground)",
                      fontSize: "0.875rem"
                    }}
                  />
                  <span style={{ display: "block", fontSize: "0.725rem", color: "var(--text-secondary)", marginTop: "0.3rem", lineHeight: 1.35 }}>
                    📅 <strong>Calendar &amp; Attendance:</strong> Syncs with School Calendar and calculates attendance working days starting from this date.
                  </span>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    value={editBatchEndDate}
                    onChange={(e) => setEditBatchEndDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "transparent",
                      color: "var(--foreground)",
                      fontSize: "0.875rem"
                    }}
                  />
                </div>
              </div>

              <div style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.75rem",
                marginTop: "0.5rem",
                paddingTop: "1rem",
                borderTop: "1px solid var(--border-color)"
              }}>
                <button
                  type="button"
                  onClick={() => setEditingBatch(null)}
                  disabled={isPending}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "transparent",
                    color: "var(--foreground)",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    fontWeight: 600
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    padding: "0.5rem 1.25rem",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "var(--primary, #6366f1)",
                    color: "#ffffff",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem"
                  }}
                >
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* DELETE BATCH CONFIRMATION MODAL */}
      {/* ======================================================== */}
      {deletingBatch && (
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
            borderRadius: "16px",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            width: "100%",
            maxWidth: "460px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.25)",
            overflow: "hidden"
          }}>
            <div style={{
              padding: "1.25rem 1.5rem",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Trash2 size={20} color="#ef4444" />
                <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, color: "#ef4444" }}>
                  Delete Batch &amp; Academic Year ({deletingBatch.name})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDeletingBatch(null)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <p style={{ margin: 0, fontSize: "0.9375rem", color: "var(--foreground)", lineHeight: 1.5 }}>
                Are you sure you want to permanently delete <strong>Batch &apos;{deletingBatch.name}&apos;</strong> and its academic year data?
              </p>
              
              <div style={{
                padding: "0.85rem 1rem",
                borderRadius: "10px",
                backgroundColor: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                fontSize: "0.8125rem",
                color: "var(--text-secondary)",
                lineHeight: 1.5
              }}>
                ⚠️ <strong>Safety guarantee:</strong> Any classes linked to this batch ({deletingBatch.classes.length} class{deletingBatch.classes.length === 1 ? "" : "es"}) will be safely unassigned so that no classes, teacher assignments, or student accounts are lost.
              </div>

              {deletingBatch.isCurrent && (
                <div style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  backgroundColor: "rgba(245, 158, 11, 0.1)",
                  border: "1px solid rgba(245, 158, 11, 0.25)",
                  fontSize: "0.8125rem",
                  color: "#d97706"
                }}>
                  Note: This is currently the active academic batch. A fallback batch will automatically be designated as active.
                </div>
              )}

              <div style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.75rem",
                marginTop: "0.5rem",
                paddingTop: "1rem",
                borderTop: "1px solid var(--border-color)"
              }}>
                <button
                  type="button"
                  onClick={() => setDeletingBatch(null)}
                  disabled={isPending}
                  style={{
                    padding: "0.55rem 1.15rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "transparent",
                    color: "var(--foreground)",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    fontWeight: 600
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteBatch}
                  disabled={isPending}
                  style={{
                    padding: "0.55rem 1.25rem",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#ef4444",
                    color: "#ffffff",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem"
                  }}
                >
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Delete Batch &amp; Year
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
