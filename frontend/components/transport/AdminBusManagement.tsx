"use client";

import React, { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bus,
  Plus,
  AlertTriangle,
  Clock,
  Users,
  Phone,
  UserCheck,
  Send,
  Trash2,
  Edit,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  Bell,
  MapPin,
  ShieldAlert,
  ChevronRight,
  Info,
  Calendar,
  Layers,
  ArrowRight,
  UserPlus,
} from "lucide-react";
import Modal from "@/frontend/components/ui/Modal";
import SearchBar from "@/frontend/components/ui/SearchBar";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";
import {
  createBusAction,
  updateBusAction,
  deleteBusAction,
  assignStudentsToBusAction,
  removeStudentFromBusAction,
  updateBusStatusAction,
  sendBusMessageAction,
  getBusDetailAction,
} from "@/backend/api/actions/dashboard/admin/transport/actions";

interface AdminBusManagementProps {
  initialBuses: any[];
  staffList: any[];
  classes: any[];
  recentMessages: any[];
  recentStatusLogs: any[];
  currentUserName: string;
}

export default function AdminBusManagement({
  initialBuses,
  staffList,
  classes,
  recentMessages,
  recentStatusLogs,
  currentUserName,
}: AdminBusManagementProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  const [buses, setBuses] = useState<any[]>(initialBuses || []);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  // ==========================================
  // BUS DETAIL SELECTION & TABS
  // ==========================================
  const [selectedBusId, setSelectedBusId] = useState<string | null>(
    initialBuses.length > 0 ? initialBuses[0].id : null
  );
  const [busDetailData, setBusDetailData] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<"STUDENTS" | "INCHARGE" | "STATUS" | "MESSAGES">("STUDENTS");

  // Load selected bus full details
  const loadBusDetail = async (busId: string) => {
    setSelectedBusId(busId);
    setIsLoadingDetail(true);
    const res = await getBusDetailAction(busId);
    setIsLoadingDetail(false);
    if (res.success && res.bus) {
      setBusDetailData(res.bus);
    } else {
      showToast("error", res.error || "Failed to load bus details.");
    }
  };

  // Load detail on first render
  React.useEffect(() => {
    if (selectedBusId) {
      loadBusDetail(selectedBusId);
    }
  }, []);

  // ==========================================
  // MODAL 1: CREATE / EDIT BUS
  // ==========================================
  const [isBusModalOpen, setIsBusModalOpen] = useState(false);
  const [editingBus, setEditingBus] = useState<any | null>(null);
  const [busForm, setBusForm] = useState({
    busNumber: "",
    registrationNo: "",
    name: "",
    capacity: 40,
    driverName: "",
    driverPhone: "",
    routeDescription: "",
    status: "RUNNING",
    inChargeStaffId: "",
  });

  const handleOpenCreateBus = () => {
    setEditingBus(null);
    setBusForm({
      busNumber: "",
      registrationNo: "",
      name: "",
      capacity: 40,
      driverName: "",
      driverPhone: "",
      routeDescription: "",
      status: "RUNNING",
      inChargeStaffId: "",
    });
    setIsBusModalOpen(true);
  };

  const handleOpenEditBus = (bus: any) => {
    setEditingBus(bus);
    setBusForm({
      busNumber: bus.busNumber || "",
      registrationNo: bus.registrationNo || "",
      name: bus.name || "",
      capacity: bus.capacity || 40,
      driverName: bus.driverName || "",
      driverPhone: bus.driverPhone || "",
      routeDescription: bus.routeDescription || "",
      status: bus.status || "RUNNING",
      inChargeStaffId: bus.inChargeStaffId || "",
    });
    setIsBusModalOpen(true);
  };

  const handleSaveBus = async (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      if (editingBus) {
        const res = await updateBusAction(editingBus.id, {
          ...busForm,
          capacity: Number(busForm.capacity),
          inChargeStaffId: busForm.inChargeStaffId || null,
        });
        if (res.error) {
          showToast("error", res.error);
        } else {
          showToast("success", `Bus ${res.bus?.busNumber} updated successfully.`);
          setIsBusModalOpen(false);
          router.refresh();
          if (selectedBusId === editingBus.id) {
            loadBusDetail(editingBus.id);
          }
        }
      } else {
        const res = await createBusAction({
          ...busForm,
          capacity: Number(busForm.capacity),
          inChargeStaffId: busForm.inChargeStaffId || null,
        });
        if (res.error) {
          showToast("error", res.error);
        } else {
          showToast("success", `Bus ${res.bus?.busNumber} registered into school fleet.`);
          setIsBusModalOpen(false);
          router.refresh();
          if (res.bus?.id) {
            loadBusDetail(res.bus.id);
          }
        }
      }
    });
  };

  const handleDeleteBus = async (bus: any) => {
    const ok = await confirm({
      title: `Delete Bus ${bus.busNumber}?`,
      message: `Are you sure you want to delete ${bus.busNumber} (${bus.name})? All students will be safely unassigned from this route. This action cannot be undone.`,
      confirmText: "Delete Bus",
      variant: "danger",
    });
    if (!ok) return;

    startTransition(async () => {
      const res = await deleteBusAction(bus.id);
      if (res.error) {
        showToast("error", res.error);
      } else {
        showToast("success", res.message || "Bus deleted safely.");
        setBuses((prev) => prev.filter((b) => b.id !== bus.id));
        if (selectedBusId === bus.id) {
          setSelectedBusId(null);
          setBusDetailData(null);
        }
        router.refresh();
      }
    });
  };

  // ==========================================
  // TAB 1: ADD & REMOVE STUDENTS
  // ==========================================
  const [selectedClassId, setSelectedClassId] = useState<string>("ALL");
  const [studentPickerQuery, setStudentPickerQuery] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [pickupPointInput, setPickupPointInput] = useState("");
  const [dropPointInput, setDropPointInput] = useState("");

  const availableStudents = useMemo(() => {
    let list: any[] = [];
    classes.forEach((cls: any) => {
      if (selectedClassId === "ALL" || cls.id === selectedClassId) {
        (cls.students || []).forEach((st: any) => {
          list.push({ ...st, className: `${cls.name} - ${cls.section}` });
        });
      }
    });

    if (studentPickerQuery.trim()) {
      const q = studentPickerQuery.toLowerCase();
      list = list.filter(
        (st) =>
          st.firstName.toLowerCase().includes(q) ||
          st.lastName.toLowerCase().includes(q) ||
          st.rollNumber.toLowerCase().includes(q) ||
          st.admissionNo.toLowerCase().includes(q)
      );
    }
    return list;
  }, [classes, selectedClassId, studentPickerQuery]);

  const toggleStudentSelection = (stId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(stId) ? prev.filter((id) => id !== stId) : [...prev, stId]
    );
  };

  const handleAssignStudents = async () => {
    if (!selectedBusId) return;
    if (selectedStudentIds.length === 0) {
      showToast("error", "Please select at least one student to assign.");
      return;
    }

    startTransition(async () => {
      const payload = {
        students: selectedStudentIds.map((id) => ({
          studentId: id,
          pickupPoint: pickupPointInput.trim() || undefined,
          dropPoint: dropPointInput.trim() || undefined,
        })),
        academicYear: "2025-2026",
      };

      const res = await assignStudentsToBusAction(selectedBusId, payload);
      if (res.error) {
        showToast("error", res.error);
      } else {
        showToast("success", res.message || "Students assigned successfully.");
        setSelectedStudentIds([]);
        loadBusDetail(selectedBusId);
        router.refresh();
      }
    });
  };

  const handleRemoveStudent = async (busStudentId: string, studentName: string) => {
    const ok = await confirm({
      title: `Unassign ${studentName}?`,
      message: `Are you sure you want to remove ${studentName} from this bus route? The student record will remain intact in the school system.`,
      confirmText: "Unassign Student",
      variant: "danger",
    });
    if (!ok) return;

    startTransition(async () => {
      const res = await removeStudentFromBusAction(busStudentId);
      if (res.error) {
        showToast("error", res.error);
      } else {
        showToast("success", res.message || "Student unassigned.");
        if (selectedBusId) loadBusDetail(selectedBusId);
        router.refresh();
      }
    });
  };

  // ==========================================
  // TAB 2: IN-CHARGE REASSIGNMENT
  // ==========================================
  const [selectedNewStaffId, setSelectedNewStaffId] = useState("");

  const handleUpdateIncharge = async () => {
    if (!selectedBusId || !selectedNewStaffId) return;
    startTransition(async () => {
      const res = await updateBusAction(selectedBusId, {
        inChargeStaffId: selectedNewStaffId,
      });
      if (res.error) {
        showToast("error", res.error);
      } else {
        showToast("success", "Staff in-charge updated successfully.");
        loadBusDetail(selectedBusId);
        router.refresh();
      }
    });
  };

  // ==========================================
  // TAB 3: STATUS CONTROL & ISSUE REPORTING
  // ==========================================
  const [statusInput, setStatusInput] = useState<string>("RUNNING");
  const [issueTypeInput, setIssueTypeInput] = useState<string>("BREAKDOWN");
  const [issueDescriptionInput, setIssueDescriptionInput] = useState("");

  const handleUpdateStatus = async (newStatus?: string) => {
    if (!selectedBusId) return;
    const targetStatus = newStatus || statusInput;

    if (targetStatus !== "RUNNING" && !issueDescriptionInput.trim()) {
      showToast("error", "Please provide a description explaining the issue or delay.");
      return;
    }

    startTransition(async () => {
      const res = await updateBusStatusAction(selectedBusId, {
        status: targetStatus,
        issueType: targetStatus === "RUNNING" ? null : issueTypeInput,
        description: issueDescriptionInput.trim() || `Bus status updated to ${targetStatus}.`,
      });

      if (res.error) {
        showToast("error", res.error);
      } else {
        showToast("success", res.message || "Status updated.");
        setIssueDescriptionInput("");
        loadBusDetail(selectedBusId);
        router.refresh();
      }
    });
  };

  // ==========================================
  // TAB 4: SEND MESSAGE (COMMON / INDIVIDUAL)
  // ==========================================
  const [messageType, setMessageType] = useState<"COMMON" | "INDIVIDUAL">("COMMON");
  const [targetStudentId, setTargetStudentId] = useState("");
  const [messageTitle, setMessageTitle] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [messagePriority, setMessagePriority] = useState<"NORMAL" | "URGENT">("NORMAL");

  // Recipient Count Preview
  const previewRecipientCount = useMemo(() => {
    if (!busDetailData?.students) return 0;
    if (messageType === "COMMON") {
      // Unique parents of all enrolled students
      const pIds = new Set<string>();
      busDetailData.students.forEach((item: any) => {
        (item.student?.parents || []).forEach((p: any) => {
          if (p.parent?.user?.id) pIds.add(p.parent.user.id);
        });
      });
      return pIds.size;
    } else {
      if (!targetStudentId) return 0;
      const targetItem = busDetailData.students.find((item: any) => item.student?.id === targetStudentId);
      return targetItem?.student?.parents?.length || 0;
    }
  }, [busDetailData, messageType, targetStudentId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusId) return;
    if (!messageTitle.trim() || !messageContent.trim()) {
      showToast("error", "Title and message content are required.");
      return;
    }
    if (messageType === "INDIVIDUAL" && !targetStudentId) {
      showToast("error", "Please select a target student for the individual message.");
      return;
    }

    startTransition(async () => {
      const res = await sendBusMessageAction(selectedBusId, {
        type: messageType,
        title: messageTitle.trim(),
        message: messageContent.trim(),
        priority: messagePriority,
        targetStudentId: messageType === "INDIVIDUAL" ? targetStudentId : null,
      });

      if (res.error) {
        showToast("error", res.error);
      } else {
        showToast("success", res.message || "Message dispatched successfully.");
        setMessageTitle("");
        setMessageContent("");
        loadBusDetail(selectedBusId);
        router.refresh();
      }
    });
  };

  // Filtered bus list
  const filteredBuses = useMemo(() => {
    return buses.filter((bus) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        bus.busNumber.toLowerCase().includes(q) ||
        bus.registrationNo.toLowerCase().includes(q) ||
        bus.name.toLowerCase().includes(q) ||
        bus.driverName.toLowerCase().includes(q) ||
        bus.inChargeStaff?.user?.name?.toLowerCase().includes(q);

      const matchStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ISSUES" && bus.status !== "RUNNING") ||
        bus.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [buses, searchQuery, statusFilter]);

  // Metrics
  const issueBuses = buses.filter((b) => b.status !== "RUNNING");
  const totalEnrolled = buses.reduce((acc, b) => acc + (b._count?.students || 0), 0);

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Toast Feedback */}
      {feedback && (
        <div
          role="alert"
          style={{
            padding: "0.85rem 1.25rem",
            borderRadius: "8px",
            backgroundColor: feedback.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
            color: feedback.type === "success" ? "var(--success)" : "var(--danger)",
            border: `1px solid ${feedback.type === "success" ? "var(--success)" : "var(--danger)"}`,
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            fontSize: "0.95rem",
            fontWeight: 500,
          }}
        >
          {feedback.type === "success" ? <CheckCircle2 size={20} /> : <AlertOctagon size={20} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Active Issues Warning Banner */}
      {issueBuses.length > 0 && (
        <div
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            borderRadius: "12px",
            padding: "1rem 1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span
              style={{
                display: "inline-flex",
                padding: "8px",
                borderRadius: "50%",
                backgroundColor: "rgba(239, 68, 68, 0.2)",
                color: "#ef4444",
              }}
            >
              <AlertTriangle size={24} />
            </span>
            <div>
              <strong style={{ color: "var(--foreground)", fontSize: "1.05rem" }}>
                Active Transit Alerts ({issueBuses.length} Bus{issueBuses.length > 1 ? "es" : ""} with Issues)
              </strong>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "2px" }}>
                {issueBuses.map((b) => `${b.busNumber}: ${b.status}`).join(" • ")}
              </div>
            </div>
          </div>
          <button
            onClick={() => setStatusFilter("ISSUES")}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "6px",
              backgroundColor: "#ef4444",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.875rem",
            }}
          >
            Filter Issue Buses
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
          gap: "1rem",
        }}
      >
        <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ width: "42px", height: "42px", borderRadius: "10px", backgroundColor: "rgba(37, 99, 235, 0.12)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Bus size={22} />
          </div>
          <div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Total Fleet Buses</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--foreground)" }}>{buses.length}</div>
          </div>
        </div>

        <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ width: "42px", height: "42px", borderRadius: "10px", backgroundColor: "rgba(16, 185, 129, 0.12)", color: "var(--success)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Running on Schedule</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--foreground)" }}>{buses.filter((b) => b.status === "RUNNING").length}</div>
          </div>
        </div>

        <div style={{ backgroundColor: "var(--card)", border: issueBuses.length > 0 ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid var(--border)", borderRadius: "12px", padding: "1.1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ width: "42px", height: "42px", borderRadius: "10px", backgroundColor: issueBuses.length > 0 ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.12)", color: issueBuses.length > 0 ? "#ef4444" : "var(--warning)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Issues / Delays</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: issueBuses.length > 0 ? "#ef4444" : "var(--foreground)" }}>{issueBuses.length}</div>
          </div>
        </div>

        <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ width: "42px", height: "42px", borderRadius: "10px", backgroundColor: "rgba(139, 92, 246, 0.12)", color: "#8b5cf6", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Users size={22} />
          </div>
          <div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Assigned Students</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--foreground)" }}>{totalEnrolled}</div>
          </div>
        </div>
      </div>

      {/* Control Header & Action Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: "1 1 300px", maxWidth: "480px" }}>
          <SearchBar
            placeholder="Search bus no, registration, route, driver, in-charge..."
            value={searchQuery}
            onChange={(val) => setSearchQuery(val)}
            syncWithUrl={false}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Status:</span>
          {["ALL", "RUNNING", "DELAYED", "NOT_RUNNING", "MAINTENANCE"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              style={{
                padding: "0.4rem 0.8rem",
                borderRadius: "6px",
                fontSize: "0.8rem",
                fontWeight: 500,
                cursor: "pointer",
                border: "1px solid var(--border)",
                backgroundColor: statusFilter === st ? "var(--primary)" : "var(--card)",
                color: statusFilter === st ? "#fff" : "var(--foreground)",
              }}
            >
              {st.replace("_", " ")}
            </button>
          ))}

          <button
            onClick={handleOpenCreateBus}
            style={{
              padding: "0.55rem 1.1rem",
              borderRadius: "8px",
              backgroundColor: "var(--primary)",
              color: "#fff",
              border: "none",
              fontWeight: 600,
              fontSize: "0.9rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              boxShadow: "0 2px 6px rgba(37, 99, 235, 0.2)",
            }}
          >
            <Plus size={18} />
            <span>Create New Bus</span>
          </button>
        </div>
      </div>

      {/* Two-Column Responsive Layout: Fleet Selector (Left) & Bus Management Console (Right) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* Left Column: Bus Fleet List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", color: "var(--foreground)" }}>
              School Bus Fleet ({filteredBuses.length})
            </h3>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Click a bus to manage</span>
          </div>

          {filteredBuses.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2.5rem 1rem", backgroundColor: "var(--card)", borderRadius: "10px", border: "1px solid var(--border)" }}>
              <Bus size={36} style={{ opacity: 0.3, margin: "0 auto 0.5rem" }} />
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>No buses match current filter.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "650px", overflowY: "auto" }}>
              {filteredBuses.map((bus) => {
                const isSelected = selectedBusId === bus.id;
                const assigned = bus._count?.students || 0;
                const capacity = bus.capacity || 40;
                const percent = Math.min(100, Math.round((assigned / capacity) * 100));

                return (
                  <div
                    key={bus.id}
                    onClick={() => loadBusDetail(bus.id)}
                    style={{
                      padding: "1rem",
                      borderRadius: "10px",
                      border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border)",
                      backgroundColor: isSelected ? "rgba(37, 99, 235, 0.05)" : "var(--card)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                      transition: "all 0.15s ease",
                      boxShadow: isSelected ? "0 4px 12px rgba(37, 99, 235, 0.12)" : "0 1px 3px rgba(0,0,0,0.02)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--foreground)" }}>
                            {bus.busNumber}
                          </span>
                          <span style={{ fontSize: "0.75rem", padding: "2px 6px", borderRadius: "4px", backgroundColor: "rgba(0,0,0,0.06)", fontFamily: "monospace" }}>
                            {bus.registrationNo}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                          {bus.name}
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "10px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          backgroundColor:
                            bus.status === "RUNNING"
                              ? "rgba(16, 185, 129, 0.15)"
                              : bus.status === "DELAYED"
                              ? "rgba(245, 158, 11, 0.18)"
                              : "rgba(239, 68, 68, 0.18)",
                          color:
                            bus.status === "RUNNING"
                              ? "var(--success)"
                              : bus.status === "DELAYED"
                              ? "#f59e0b"
                              : "#ef4444",
                          border: `1px solid ${
                            bus.status === "RUNNING" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"
                          }`,
                        }}
                      >
                        {bus.status.replace("_", " ")}
                      </span>
                    </div>

                    {/* In-Charge & Driver Info */}
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", justifyContent: "space-between" }}>
                      <span>In-charge: <strong>{bus.inChargeStaff?.user?.name || "Unassigned"}</strong></span>
                      <span>Driver: <strong>{bus.driverName}</strong></span>
                    </div>

                    {/* Capacity Bar */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "3px" }}>
                        <span>Capacity</span>
                        <span>{assigned} / {capacity} seats ({percent}%)</span>
                      </div>
                      <div style={{ width: "100%", height: "5px", borderRadius: "3px", backgroundColor: "var(--border)", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${percent}%`,
                            height: "100%",
                            backgroundColor: percent > 90 ? "var(--danger)" : percent > 70 ? "#f59e0b" : "var(--primary)",
                            borderRadius: "3px",
                          }}
                        />
                      </div>
                    </div>

                    {/* Quick card action buttons */}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem", paddingTop: "0.4rem", borderTop: "1px solid var(--border)" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditBus(bus);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-secondary)",
                          cursor: "pointer",
                          fontSize: "0.78rem",
                          display: "flex",
                          alignItems: "center",
                          gap: "3px",
                          padding: "2px 6px",
                        }}
                      >
                        <Edit size={12} /> Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBus(bus);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--danger)",
                          cursor: "pointer",
                          fontSize: "0.78rem",
                          display: "flex",
                          alignItems: "center",
                          gap: "3px",
                          padding: "2px 6px",
                        }}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Detailed Bus Workspace (4 Tabs) */}
        <div
          style={{
            backgroundColor: "var(--card)",
            borderRadius: "12px",
            border: "1px solid var(--border)",
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}
        >
          {!selectedBusId || !busDetailData ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
              <Bus size={44} style={{ opacity: 0.3, margin: "0 auto 0.75rem" }} />
              <p>Select a bus from the fleet roster to manage assignments, in-charge, status, and messages.</p>
            </div>
          ) : (
            <>
              {/* Selected Bus Workspace Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  borderBottom: "1px solid var(--border)",
                  paddingBottom: "1rem",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <h2 style={{ margin: 0, fontSize: "1.35rem", color: "var(--foreground)" }}>
                      {busDetailData.busNumber}
                    </h2>
                    <span style={{ fontSize: "0.8rem", padding: "2px 8px", borderRadius: "4px", backgroundColor: "rgba(0,0,0,0.06)", fontFamily: "monospace" }}>
                      {busDetailData.registrationNo}
                    </span>
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: "12px",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        backgroundColor:
                          busDetailData.status === "RUNNING"
                            ? "rgba(16, 185, 129, 0.15)"
                            : busDetailData.status === "DELAYED"
                            ? "rgba(245, 158, 11, 0.18)"
                            : "rgba(239, 68, 68, 0.18)",
                        color:
                          busDetailData.status === "RUNNING"
                            ? "var(--success)"
                            : busDetailData.status === "DELAYED"
                            ? "#f59e0b"
                            : "#ef4444",
                      }}
                    >
                      {busDetailData.status.replace("_", " ")}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                    {busDetailData.name} • Driver: <strong>{busDetailData.driverName}</strong> ({busDetailData.driverPhone})
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={() => handleOpenEditBus(busDetailData)}
                    style={{
                      padding: "0.45rem 0.9rem",
                      borderRadius: "6px",
                      backgroundColor: "var(--card)",
                      color: "var(--foreground)",
                      border: "1px solid var(--border)",
                      fontSize: "0.85rem",
                      fontWeight: 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Edit size={14} /> Edit Bus
                  </button>
                </div>
              </div>

              {/* 4 Detail Workspace Tabs */}
              <div style={{ display: "flex", borderBottom: "1px solid var(--border)", gap: "0.25rem", overflowX: "auto" }}>
                {[
                  { id: "STUDENTS", label: `Students (${busDetailData.students?.length || 0})`, icon: <Users size={16} /> },
                  { id: "INCHARGE", label: "In-Charge Staff", icon: <UserCheck size={16} /> },
                  { id: "STATUS", label: "Status & Issues", icon: <AlertTriangle size={16} /> },
                  { id: "MESSAGES", label: `Messages (${busDetailData.messages?.length || 0})`, icon: <Send size={16} /> },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveDetailTab(tab.id as any)}
                    style={{
                      padding: "0.6rem 1rem",
                      border: "none",
                      background: "none",
                      borderBottom: activeDetailTab === tab.id ? "2px solid var(--primary)" : "none",
                      color: activeDetailTab === tab.id ? "var(--primary)" : "var(--text-secondary)",
                      fontWeight: 600,
                      fontSize: "0.88rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* ======================================================== */}
              {/* TAB 1: STUDENTS (ROSTER & ADD)                           */}
              {/* ======================================================== */}
              {activeDetailTab === "STUDENTS" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  {/* Capacity Bar */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "4px" }}>
                      <span style={{ color: "var(--text-secondary)" }}>Seating Capacity:</span>
                      <strong style={{ color: "var(--foreground)" }}>
                        {busDetailData.students?.length || 0} / {busDetailData.capacity} Assigned (
                        {Math.round(((busDetailData.students?.length || 0) / busDetailData.capacity) * 100)}%)
                      </strong>
                    </div>
                    <div style={{ width: "100%", height: "8px", borderRadius: "4px", backgroundColor: "var(--border)", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${Math.min(100, Math.round(((busDetailData.students?.length || 0) / busDetailData.capacity) * 100))}%`,
                          height: "100%",
                          backgroundColor:
                            (busDetailData.students?.length || 0) >= busDetailData.capacity ? "var(--danger)" : "var(--primary)",
                        }}
                      />
                    </div>
                  </div>

                  {/* Section A: Enrolled Students Roster */}
                  <div>
                    <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--foreground)", fontSize: "0.95rem" }}>
                      Enrolled Students
                    </h4>
                    {(!busDetailData.students || busDetailData.students.length === 0) ? (
                      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        No students enrolled yet. Use the assignment picker below to add students.
                      </p>
                    ) : (
                      <div style={{ maxHeight: "260px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                        {busDetailData.students.map((item: any) => {
                          const st = item.student;
                          const stName = `${st.firstName} ${st.lastName}`;
                          const pPhone = st.parents?.[0]?.parent?.phone;

                          return (
                            <div
                              key={item.id}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "0.6rem 0.85rem",
                                borderRadius: "8px",
                                border: "1px solid var(--border)",
                                backgroundColor: "rgba(0,0,0,0.02)",
                                fontSize: "0.88rem",
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 600, color: "var(--foreground)" }}>{stName}</div>
                                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                                  Class: {st.class ? `${st.class.name} - ${st.class.section}` : "N/A"} • Roll: {st.rollNumber}
                                  {item.pickupPoint ? ` • Pickup: ${item.pickupPoint}` : ""}
                                  {pPhone ? ` • Parent: ${pPhone}` : ""}
                                </div>
                              </div>
                              <button
                                onClick={() => handleRemoveStudent(item.id, stName)}
                                style={{
                                  padding: "0.3rem 0.6rem",
                                  borderRadius: "4px",
                                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                                  color: "var(--danger)",
                                  border: "1px solid rgba(239, 68, 68, 0.25)",
                                  fontSize: "0.75rem",
                                  fontWeight: 500,
                                  cursor: "pointer",
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Section B: Add Students Picker */}
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      paddingTop: "1rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    <h4 style={{ margin: 0, color: "var(--foreground)", fontSize: "0.95rem" }}>
                      + Add Students from School Classes
                    </h4>

                    {/* Presets: Pickup & Drop Points */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "3px" }}>
                          Pickup Point Landmark
                        </label>
                        <input
                          type="text"
                          value={pickupPointInput}
                          onChange={(e) => setPickupPointInput(e.target.value)}
                          placeholder="e.g. West Campus Gate (07:30 AM)"
                          style={{
                            width: "100%",
                            padding: "0.45rem",
                            borderRadius: "4px",
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--card)",
                            color: "var(--foreground)",
                            fontSize: "0.85rem",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "3px" }}>
                          Drop Point Landmark
                        </label>
                        <input
                          type="text"
                          value={dropPointInput}
                          onChange={(e) => setDropPointInput(e.target.value)}
                          placeholder="e.g. West Campus Gate (04:30 PM)"
                          style={{
                            width: "100%",
                            padding: "0.45rem",
                            borderRadius: "4px",
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--card)",
                            color: "var(--foreground)",
                            fontSize: "0.85rem",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    </div>

                    {/* Class Filter & Search */}
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <select
                        value={selectedClassId}
                        onChange={(e) => setSelectedClassId(e.target.value)}
                        style={{
                          padding: "0.45rem",
                          borderRadius: "6px",
                          border: "1px solid var(--border)",
                          backgroundColor: "var(--card)",
                          color: "var(--foreground)",
                          fontSize: "0.85rem",
                        }}
                      >
                        <option value="ALL">All Classes</option>
                        {classes.map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            {cls.name} - {cls.section}
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        value={studentPickerQuery}
                        onChange={(e) => setStudentPickerQuery(e.target.value)}
                        placeholder="Search student by name or roll..."
                        style={{
                          flex: 1,
                          minWidth: "160px",
                          padding: "0.45rem",
                          borderRadius: "6px",
                          border: "1px solid var(--border)",
                          backgroundColor: "var(--card)",
                          color: "var(--foreground)",
                          fontSize: "0.85rem",
                        }}
                      />
                    </div>

                    {/* Student Multi-Select List */}
                    <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {availableStudents.map((st) => {
                        const isSelected = selectedStudentIds.includes(st.id);
                        const otherBus = st.busAssignments?.[0]?.bus?.busNumber;

                        return (
                          <div
                            key={st.id}
                            onClick={() => toggleStudentSelection(st.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.6rem",
                              padding: "0.5rem 0.75rem",
                              borderRadius: "6px",
                              border: isSelected ? "1px solid var(--primary)" : "1px solid var(--border)",
                              backgroundColor: isSelected ? "rgba(37, 99, 235, 0.08)" : "transparent",
                              cursor: "pointer",
                              fontSize: "0.85rem",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              style={{ cursor: "pointer" }}
                            />
                            <div style={{ flex: 1 }}>
                              <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
                                {st.firstName} {st.lastName}
                              </span>
                              <span style={{ color: "var(--text-secondary)", marginLeft: "6px", fontSize: "0.78rem" }}>
                                ({st.className} • Roll: {st.rollNumber})
                              </span>
                            </div>

                            {otherBus && (
                              <span style={{ fontSize: "0.72rem", padding: "1px 6px", borderRadius: "4px", backgroundColor: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" }}>
                                On {otherBus}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                        {selectedStudentIds.length} student(s) selected
                      </span>
                      <button
                        type="button"
                        onClick={handleAssignStudents}
                        disabled={selectedStudentIds.length === 0 || isPending}
                        style={{
                          padding: "0.55rem 1.25rem",
                          borderRadius: "6px",
                          backgroundColor: "var(--primary)",
                          color: "#fff",
                          border: "none",
                          fontWeight: 600,
                          fontSize: "0.85rem",
                          cursor: "pointer",
                          opacity: selectedStudentIds.length === 0 || isPending ? 0.6 : 1,
                        }}
                      >
                        {isPending ? "Assigning..." : `Assign Selected (${selectedStudentIds.length})`}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* TAB 2: IN-CHARGE STAFF REASSIGNMENT                      */}
              {/* ======================================================== */}
              {activeDetailTab === "INCHARGE" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div
                    style={{
                      padding: "1rem",
                      borderRadius: "10px",
                      border: "1px solid var(--border)",
                      backgroundColor: "rgba(0,0,0,0.02)",
                    }}
                  >
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Current In-charge</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--foreground)", marginTop: "2px" }}>
                      {busDetailData.inChargeStaff?.user?.name || "No staff member currently assigned"}
                    </div>
                    {busDetailData.inChargeStaff && (
                      <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                        Designation: {busDetailData.inChargeStaff.designation || "Transport In-charge"} • Phone: {busDetailData.inChargeStaff.phone || "N/A"}
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "4px" }}>
                      Reassign In-charge Staff Member
                    </label>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <select
                        value={selectedNewStaffId}
                        onChange={(e) => setSelectedNewStaffId(e.target.value)}
                        style={{
                          flex: 1,
                          padding: "0.6rem",
                          borderRadius: "6px",
                          border: "1px solid var(--border)",
                          backgroundColor: "var(--card)",
                          color: "var(--foreground)",
                          fontSize: "0.9rem",
                        }}
                      >
                        <option value="">-- Choose Active Staff / Teacher --</option>
                        {staffList.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.user.name} ({st.designation || st.user.role})
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={handleUpdateIncharge}
                        disabled={!selectedNewStaffId || isPending}
                        style={{
                          padding: "0.6rem 1.25rem",
                          borderRadius: "6px",
                          backgroundColor: "var(--primary)",
                          color: "#fff",
                          border: "none",
                          fontWeight: 600,
                          fontSize: "0.85rem",
                          cursor: "pointer",
                          opacity: !selectedNewStaffId || isPending ? 0.6 : 1,
                        }}
                      >
                        Update
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* TAB 3: STATUS CONTROL & ISSUE REPORTING                  */}
              {/* ======================================================== */}
              {activeDetailTab === "STATUS" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "6px" }}>
                      Quick Status Update
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.5rem" }}>
                      {[
                        { status: "RUNNING", label: "Running Normally", color: "var(--success)" },
                        { status: "DELAYED", label: "Transit Delay", color: "#f59e0b" },
                        { status: "NOT_RUNNING", label: "Not Running", color: "var(--danger)" },
                        { status: "MAINTENANCE", label: "In Maintenance", color: "var(--text-secondary)" },
                      ].map((item) => (
                        <button
                          key={item.status}
                          type="button"
                          onClick={() => setStatusInput(item.status)}
                          style={{
                            padding: "0.55rem 0.5rem",
                            borderRadius: "6px",
                            border: statusInput === item.status ? `2px solid ${item.color}` : "1px solid var(--border)",
                            backgroundColor: statusInput === item.status ? "rgba(0,0,0,0.06)" : "var(--card)",
                            color: "var(--foreground)",
                            fontSize: "0.82rem",
                            fontWeight: statusInput === item.status ? 700 : 500,
                            cursor: "pointer",
                            textAlign: "center",
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {statusInput !== "RUNNING" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "4px" }}>
                          Issue Type
                        </label>
                        <select
                          value={issueTypeInput}
                          onChange={(e) => setIssueTypeInput(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "0.55rem",
                            borderRadius: "6px",
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--card)",
                            color: "var(--foreground)",
                            fontSize: "0.85rem",
                          }}
                        >
                          <option value="BREAKDOWN">Vehicle Breakdown 🚨</option>
                          <option value="TRAFFIC">Heavy Traffic Delay ⏱️</option>
                          <option value="ACCIDENT">Transit Accident / Incident ⚠️</option>
                          <option value="LATE">Driver / Staff Late ⏱️</option>
                          <option value="ROUTE_CHANGE">Road Closure / Route Diversion 🔄</option>
                          <option value="OTHER">Other Operational Issue 📢</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "4px" }}>
                          Issue Description (Sent automatically to parents) *
                        </label>
                        <textarea
                          rows={3}
                          value={issueDescriptionInput}
                          onChange={(e) => setIssueDescriptionInput(e.target.value)}
                          placeholder="Explain delay cause, estimated delay time, or replacement vehicle arrangements..."
                          style={{
                            width: "100%",
                            padding: "0.55rem",
                            borderRadius: "6px",
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--card)",
                            color: "var(--foreground)",
                            fontSize: "0.85rem",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => handleUpdateStatus()}
                    disabled={isPending}
                    style={{
                      padding: "0.6rem 1.4rem",
                      borderRadius: "6px",
                      backgroundColor: statusInput === "RUNNING" ? "var(--success)" : "var(--danger)",
                      color: "#fff",
                      border: "none",
                      fontWeight: 600,
                      fontSize: "0.88rem",
                      cursor: "pointer",
                      alignSelf: "flex-start",
                      opacity: isPending ? 0.7 : 1,
                    }}
                  >
                    {isPending ? "Updating..." : "Save Status & Log"}
                  </button>

                  {/* Status History Timeline */}
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                    <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--foreground)", fontSize: "0.95rem" }}>
                      Status History &amp; Issues Log
                    </h4>
                    {(!busDetailData.statusLogs || busDetailData.statusLogs.length === 0) ? (
                      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>No status logs recorded.</p>
                    ) : (
                      <div style={{ maxHeight: "220px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {busDetailData.statusLogs.map((log: any) => (
                          <div
                            key={log.id}
                            style={{
                              padding: "0.6rem 0.85rem",
                              borderRadius: "6px",
                              border: "1px solid var(--border)",
                              fontSize: "0.82rem",
                              backgroundColor: "rgba(0,0,0,0.02)",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                              <strong>{log.status} {log.issueType ? `(${log.issueType})` : ""}</strong>
                              <span style={{ color: "var(--text-secondary)" }}>
                                {new Date(log.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                              </span>
                            </div>
                            <div style={{ color: "var(--foreground)" }}>{log.description}</div>
                            {log.reportedByStaff?.user?.name && (
                              <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: "2px" }}>
                                Logged by: {log.reportedByStaff.user.name}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* TAB 4: SEND MESSAGE (COMMON / INDIVIDUAL)                */}
              {/* ======================================================== */}
              {activeDetailTab === "MESSAGES" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <form onSubmit={handleSendMessage} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                    {/* Audience Selector */}
                    <div>
                      <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "4px" }}>
                        Target Audience
                      </label>
                      <div style={{ display: "flex", gap: "1rem" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.85rem" }}>
                          <input
                            type="radio"
                            name="msgType"
                            checked={messageType === "COMMON"}
                            onChange={() => setMessageType("COMMON")}
                          />
                          <strong>All Parents on this Bus (Common)</strong>
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.85rem" }}>
                          <input
                            type="radio"
                            name="msgType"
                            checked={messageType === "INDIVIDUAL"}
                            onChange={() => setMessageType("INDIVIDUAL")}
                          />
                          <strong>Individual Student's Parent</strong>
                        </label>
                      </div>

                      {messageType === "INDIVIDUAL" && (
                        <div style={{ marginTop: "0.5rem" }}>
                          <select
                            value={targetStudentId}
                            onChange={(e) => setTargetStudentId(e.target.value)}
                            required
                            style={{
                              width: "100%",
                              padding: "0.55rem",
                              borderRadius: "6px",
                              border: "1px solid var(--border)",
                              backgroundColor: "var(--card)",
                              color: "var(--foreground)",
                              fontSize: "0.85rem",
                            }}
                          >
                            <option value="">-- Choose Student to Message Parent --</option>
                            {(busDetailData.students || []).map((item: any) => (
                              <option key={item.student.id} value={item.student.id}>
                                {item.student.firstName} {item.student.lastName} (Roll: {item.student.rollNumber})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "4px" }}>
                          Message Title *
                        </label>
                        <input
                          type="text"
                          required
                          value={messageTitle}
                          onChange={(e) => setMessageTitle(e.target.value)}
                          placeholder="e.g. Bus Delay Notice"
                          style={{
                            width: "100%",
                            padding: "0.55rem",
                            borderRadius: "6px",
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--card)",
                            color: "var(--foreground)",
                            fontSize: "0.85rem",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "4px" }}>
                          Priority
                        </label>
                        <select
                          value={messagePriority}
                          onChange={(e) => setMessagePriority(e.target.value as any)}
                          style={{
                            width: "100%",
                            padding: "0.55rem",
                            borderRadius: "6px",
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--card)",
                            color: "var(--foreground)",
                            fontSize: "0.85rem",
                          }}
                        >
                          <option value="NORMAL">NORMAL</option>
                          <option value="URGENT">URGENT 🚨</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "4px" }}>
                        Message Content *
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={messageContent}
                        onChange={(e) => setMessageContent(e.target.value)}
                        placeholder="Write your message to the parent(s)..."
                        style={{
                          width: "100%",
                          padding: "0.55rem",
                          borderRadius: "6px",
                          border: "1px solid var(--border)",
                          backgroundColor: "var(--card)",
                          color: "var(--foreground)",
                          fontSize: "0.85rem",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                        Recipient Preview: <strong>{previewRecipientCount} parent accounts</strong>
                      </span>
                      <button
                        type="submit"
                        disabled={isPending}
                        style={{
                          padding: "0.55rem 1.25rem",
                          borderRadius: "6px",
                          backgroundColor: messagePriority === "URGENT" ? "#ef4444" : "var(--primary)",
                          color: "#fff",
                          border: "none",
                          fontWeight: 600,
                          fontSize: "0.85rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          opacity: isPending ? 0.7 : 1,
                        }}
                      >
                        <Send size={14} />
                        <span>{isPending ? "Sending..." : "Dispatch Message"}</span>
                      </button>
                    </div>
                  </form>

                  {/* Past Sent Messages */}
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                    <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--foreground)", fontSize: "0.95rem" }}>
                      Sent Messages History
                    </h4>
                    {(!busDetailData.messages || busDetailData.messages.length === 0) ? (
                      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>No messages sent for this bus yet.</p>
                    ) : (
                      <div style={{ maxHeight: "220px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {busDetailData.messages.map((msg: any) => (
                          <div
                            key={msg.id}
                            style={{
                              padding: "0.6rem 0.85rem",
                              borderRadius: "6px",
                              border: "1px solid var(--border)",
                              fontSize: "0.82rem",
                              backgroundColor: "rgba(0,0,0,0.02)",
                              borderLeft: `3px solid ${msg.priority === "URGENT" ? "#ef4444" : "var(--primary)"}`,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                              <strong style={{ color: "var(--foreground)" }}>{msg.title}</strong>
                              <span style={{ color: "var(--text-secondary)" }}>
                                {new Date(msg.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                              </span>
                            </div>
                            <div style={{ color: "var(--foreground)" }}>{msg.message}</div>
                            <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: "3px" }}>
                              Type: {msg.type} • Sent by: {msg.senderStaff?.user?.name || "Staff"}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL: CREATE / EDIT BUS                                 */}
      {/* ======================================================== */}
      <Modal
        isOpen={isBusModalOpen}
        onClose={() => setIsBusModalOpen(false)}
        title={editingBus ? `Edit Bus ${editingBus.busNumber}` : "Register New School Bus"}
        icon={<Bus size={20} />}
        size="form"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", width: "100%" }}>
            <button
              type="button"
              onClick={() => setIsBusModalOpen(false)}
              style={{
                padding: "0.55rem 1.1rem",
                borderRadius: "6px",
                backgroundColor: "var(--card)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveBus}
              disabled={isPending}
              style={{
                padding: "0.55rem 1.3rem",
                borderRadius: "6px",
                backgroundColor: "var(--primary)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? "Saving..." : editingBus ? "Update Bus" : "Register Bus"}
            </button>
          </div>
        }
      >
        <form onSubmit={handleSaveBus} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "3px", color: "var(--foreground)" }}>
                Bus Number *
              </label>
              <input
                type="text"
                required
                value={busForm.busNumber}
                onChange={(e) => setBusForm({ ...busForm, busNumber: e.target.value })}
                placeholder="e.g. BUS-01"
                style={{
                  width: "100%",
                  padding: "0.55rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "3px", color: "var(--foreground)" }}>
                Registration No *
              </label>
              <input
                type="text"
                required
                value={busForm.registrationNo}
                onChange={(e) => setBusForm({ ...busForm, registrationNo: e.target.value })}
                placeholder="e.g. TN-01-AB-1234"
                style={{
                  width: "100%",
                  padding: "0.55rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "3px", color: "var(--foreground)" }}>
              Route / Bus Name *
            </label>
            <input
              type="text"
              required
              value={busForm.name}
              onChange={(e) => setBusForm({ ...busForm, name: e.target.value })}
              placeholder="e.g. SRT Bus 01 - North Campus Route"
              style={{
                width: "100%",
                padding: "0.55rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                color: "var(--foreground)",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "3px", color: "var(--foreground)" }}>
                Driver Name *
              </label>
              <input
                type="text"
                required
                value={busForm.driverName}
                onChange={(e) => setBusForm({ ...busForm, driverName: e.target.value })}
                placeholder="e.g. Ramesh Kumar"
                style={{
                  width: "100%",
                  padding: "0.55rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "3px", color: "var(--foreground)" }}>
                Driver Phone *
              </label>
              <input
                type="tel"
                required
                value={busForm.driverPhone}
                onChange={(e) => setBusForm({ ...busForm, driverPhone: e.target.value })}
                placeholder="e.g. +91 98765 43210"
                style={{
                  width: "100%",
                  padding: "0.55rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "3px", color: "var(--foreground)" }}>
                Assign Staff In-charge
              </label>
              <select
                value={busForm.inChargeStaffId}
                onChange={(e) => setBusForm({ ...busForm, inChargeStaffId: e.target.value })}
                style={{
                  width: "100%",
                  padding: "0.55rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  boxSizing: "border-box",
                }}
              >
                <option value="">-- Select Active Staff --</option>
                {staffList.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.user.name} ({st.designation || st.user.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "3px", color: "var(--foreground)" }}>
                Seating Capacity
              </label>
              <input
                type="number"
                min="10"
                max="100"
                value={busForm.capacity}
                onChange={(e) => setBusForm({ ...busForm, capacity: Number(e.target.value) })}
                style={{
                  width: "100%",
                  padding: "0.55rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "3px", color: "var(--foreground)" }}>
              Route Description / Stoppages
            </label>
            <input
              type="text"
              value={busForm.routeDescription}
              onChange={(e) => setBusForm({ ...busForm, routeDescription: e.target.value })}
              placeholder="e.g. North Zone - Anna Nagar - Guindy - School Campus"
              style={{
                width: "100%",
                padding: "0.55rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                color: "var(--foreground)",
                boxSizing: "border-box",
              }}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
