"use client";

import React, { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bus as BusIcon,
  Plus,
  AlertTriangle,
  Clock,
  Users,
  Search,
  Filter,
  Phone,
  UserCheck,
  Send,
  Trash2,
  Edit,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  RefreshCw,
  Bell,
  MapPin,
  ShieldAlert,
  ChevronRight,
  Info,
} from "lucide-react";
import Modal from "@/frontend/components/ui/Modal";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";
import {
  createBusAction,
  updateBusAction,
  deleteBusAction,
  assignStudentsToBusAction,
  removeStudentFromBusAction,
  reportBusIssueAction,
  resolveBusIssueAction,
  sendBusAlertAction,
  getBusStudentsAction,
} from "@/backend/api/actions/dashboard/admin/transport/actions";

interface TransportClientProps {
  initialBuses: any[];
  teachers: any[];
  classes: any[];
  initialAlerts: any[];
  currentUserRole: string;
  currentUserName: string;
}

export default function TransportClient({
  initialBuses,
  teachers,
  classes,
  initialAlerts,
  currentUserRole,
  currentUserName,
}: TransportClientProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  const [buses, setBuses] = useState<any[]>(initialBuses || []);
  const [alerts, setAlerts] = useState<any[]>(initialAlerts || []);

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [activeTab, setActiveTab] = useState<"FLEET" | "ALERTS">("FLEET");

  // Notification / Toast Message
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showFeedback = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  // ==========================================
  // MODAL 1: CREATE / EDIT BUS
  // ==========================================
  const [isBusModalOpen, setIsBusModalOpen] = useState(false);
  const [editingBus, setEditingBus] = useState<any | null>(null);
  const [busForm, setBusForm] = useState({
    busNumber: "",
    registrationNumber: "",
    routeName: "",
    capacity: 40,
    driverName: "",
    driverPhone: "",
    inchargeTeacherId: "",
    inchargeStaffName: "",
    inchargeStaffPhone: "",
    status: "ACTIVE",
  });

  const handleOpenCreateBus = () => {
    setEditingBus(null);
    setBusForm({
      busNumber: "",
      registrationNumber: "",
      routeName: "",
      capacity: 40,
      driverName: "",
      driverPhone: "",
      inchargeTeacherId: "",
      inchargeStaffName: "",
      inchargeStaffPhone: "",
      status: "ACTIVE",
    });
    setIsBusModalOpen(true);
  };

  const handleOpenEditBus = (bus: any) => {
    setEditingBus(bus);
    setBusForm({
      busNumber: bus.busNumber || "",
      registrationNumber: bus.registrationNumber || "",
      routeName: bus.routeName || "",
      capacity: bus.capacity || 40,
      driverName: bus.driverName || "",
      driverPhone: bus.driverPhone || "",
      inchargeTeacherId: bus.inchargeTeacherId || "",
      inchargeStaffName: bus.inchargeStaffName || "",
      inchargeStaffPhone: bus.inchargeStaffPhone || "",
      status: bus.status || "ACTIVE",
    });
    setIsBusModalOpen(true);
  };

  const handleSaveBus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busForm.busNumber || !busForm.registrationNumber || !busForm.routeName || !busForm.driverName || !busForm.driverPhone) {
      showFeedback("error", "Please fill in all mandatory bus details.");
      return;
    }

    startTransition(async () => {
      if (editingBus) {
        const res = await updateBusAction(editingBus.id, {
          ...busForm,
          capacity: Number(busForm.capacity),
          inchargeTeacherId: busForm.inchargeTeacherId || null,
        });
        if (res.error) {
          showFeedback("error", res.error);
        } else {
          showFeedback("success", `Bus ${res.bus?.busNumber} updated successfully.`);
          setIsBusModalOpen(false);
          router.refresh();
        }
      } else {
        const res = await createBusAction({
          ...busForm,
          capacity: Number(busForm.capacity),
          inchargeTeacherId: busForm.inchargeTeacherId || null,
        });
        if (res.error) {
          showFeedback("error", res.error);
        } else {
          showFeedback("success", `Bus ${res.bus?.busNumber} registered successfully.`);
          setIsBusModalOpen(false);
          router.refresh();
        }
      }
    });
  };

  const handleDeleteBus = async (bus: any) => {
    const ok = await confirm({
      title: `Delete Bus ${bus.busNumber}?`,
      message: `Are you sure you want to delete ${bus.busNumber} (${bus.registrationNumber})? This will unassign all ${bus._count?.students || 0} students and delete associated alert records. This action cannot be undone.`,
      confirmText: "Delete Bus",
      variant: "danger",
    });
    if (!ok) return;

    startTransition(async () => {
      const res = await deleteBusAction(bus.id);
      if (res.error) {
        showFeedback("error", res.error);
      } else {
        showFeedback("success", `Bus ${bus.busNumber} removed.`);
        setBuses((prev) => prev.filter((b) => b.id !== bus.id));
        router.refresh();
      }
    });
  };

  // ==========================================
  // MODAL 2: MANAGE STUDENTS ON BUS
  // ==========================================
  const [isStudentsModalOpen, setIsStudentsModalOpen] = useState(false);
  const [selectedBusForStudents, setSelectedBusForStudents] = useState<any | null>(null);
  const [busStudentsList, setBusStudentsList] = useState<any[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [studentModalTab, setStudentModalTab] = useState<"ROSTER" | "ASSIGN">("ROSTER");

  // Assignment Sub-form states
  const [selectedClassId, setSelectedClassId] = useState<string>("ALL");
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [batchPickupStop, setBatchPickupStop] = useState("");
  const [batchPickupTime, setBatchPickupTime] = useState("07:30 AM");
  const [batchDropStop, setBatchDropStop] = useState("");
  const [batchDropTime, setBatchDropTime] = useState("04:30 PM");

  const handleOpenManageStudents = async (bus: any) => {
    setSelectedBusForStudents(bus);
    setIsStudentsModalOpen(true);
    setStudentModalTab("ROSTER");
    setSelectedStudentIds([]);
    setIsLoadingStudents(true);

    const res = await getBusStudentsAction(bus.id);
    setIsLoadingStudents(false);
    if (res.success && res.students) {
      setBusStudentsList(res.students);
    } else {
      showFeedback("error", res.error || "Could not load bus students.");
    }
  };

  const handleRemoveStudentFromBus = async (busStudentId: string, studentName: string) => {
    const ok = await confirm({
      title: `Unassign ${studentName}?`,
      message: `Are you sure you want to remove ${studentName} from this bus route?`,
      confirmText: "Unassign Student",
      variant: "danger",
    });
    if (!ok) return;

    startTransition(async () => {
      const res = await removeStudentFromBusAction(busStudentId);
      if (res.error) {
        showFeedback("error", res.error);
      } else {
        setBusStudentsList((prev) => prev.filter((bs) => bs.id !== busStudentId));
        showFeedback("success", `${studentName} removed from bus.`);
        router.refresh();
      }
    });
  };

  // Filter students available to assign
  const availableStudentsToAssign = useMemo(() => {
    let list: any[] = [];
    classes.forEach((cls: any) => {
      if (selectedClassId === "ALL" || cls.id === selectedClassId) {
        (cls.students || []).forEach((st: any) => {
          list.push({ ...st, className: `${cls.name} - ${cls.section}` });
        });
      }
    });

    if (studentSearchQuery.trim()) {
      const q = studentSearchQuery.toLowerCase();
      list = list.filter(
        (st) =>
          st.firstName.toLowerCase().includes(q) ||
          st.lastName.toLowerCase().includes(q) ||
          st.rollNumber.toLowerCase().includes(q) ||
          st.admissionNo.toLowerCase().includes(q)
      );
    }
    return list;
  }, [classes, selectedClassId, studentSearchQuery]);

  const toggleStudentSelection = (stId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(stId) ? prev.filter((id) => id !== stId) : [...prev, stId]
    );
  };

  const handleAssignSelectedStudents = async () => {
    if (selectedStudentIds.length === 0) {
      showFeedback("error", "Please select at least one student to assign.");
      return;
    }
    if (!selectedBusForStudents) return;

    startTransition(async () => {
      const payload = selectedStudentIds.map((id) => ({
        studentId: id,
        pickupStop: batchPickupStop.trim() || undefined,
        pickupTime: batchPickupTime.trim() || undefined,
        dropStop: batchDropStop.trim() || undefined,
        dropTime: batchDropTime.trim() || undefined,
      }));

      const res = await assignStudentsToBusAction(selectedBusForStudents.id, payload);
      if (res.error) {
        showFeedback("error", res.error);
      } else {
        showFeedback("success", `Assigned ${selectedStudentIds.length} students to ${selectedBusForStudents.busNumber}.`);
        setSelectedStudentIds([]);
        // Refresh enrolled roster
        const fresh = await getBusStudentsAction(selectedBusForStudents.id);
        if (fresh.success && fresh.students) {
          setBusStudentsList(fresh.students);
        }
        setStudentModalTab("ROSTER");
        router.refresh();
      }
    });
  };

  // ==========================================
  // MODAL 3: BUS ISSUE & ALERT CONSOLE
  // ==========================================
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [selectedBusForAlert, setSelectedBusForAlert] = useState<any | null>(null);
  const [busEnrolledStudentsForAlert, setBusEnrolledStudentsForAlert] = useState<any[]>([]);

  const [alertForm, setAlertForm] = useState({
    alertType: "BREAKDOWN" as "BREAKDOWN" | "DELAY" | "ROUTE_CHANGE" | "EMERGENCY" | "GENERAL",
    severity: "URGENT" as "INFO" | "WARNING" | "URGENT",
    targetType: "ALL_PARENTS" as "ALL_PARENTS" | "INDIVIDUAL",
    targetStudentId: "",
    title: "",
    message: "",
    updateBusStatus: true,
  });

  const handleOpenAlertModal = async (bus: any) => {
    setSelectedBusForAlert(bus);
    setAlertForm({
      alertType: bus.status === "BREAKDOWN" ? "BREAKDOWN" : "DELAY",
      severity: "URGENT",
      targetType: "ALL_PARENTS",
      targetStudentId: "",
      title: `Bus ${bus.busNumber} Notice`,
      message: `Bus ${bus.busNumber} (${bus.routeName}) has encountered an operational delay. Our transport team is actively attending to this.`,
      updateBusStatus: true,
    });
    setIsAlertModalOpen(true);

    // Fetch enrolled students so user can choose individual student if desired
    const res = await getBusStudentsAction(bus.id);
    if (res.success && res.students) {
      setBusEnrolledStudentsForAlert(res.students);
    }
  };

  const handleAlertTypeChange = (type: "BREAKDOWN" | "DELAY" | "ROUTE_CHANGE" | "EMERGENCY" | "GENERAL") => {
    if (!selectedBusForAlert) return;
    const busNo = selectedBusForAlert.busNumber;

    let defaultTitle = `Bus ${busNo} Notice`;
    let defaultMsg = "";
    let defaultSeverity: "INFO" | "WARNING" | "URGENT" = "WARNING";

    switch (type) {
      case "BREAKDOWN":
        defaultTitle = `Bus ${busNo}: Breakdown / Technical Maintenance`;
        defaultMsg = `Bus ${busNo} has experienced a technical breakdown near the route. A relief replacement vehicle has been dispatched immediately. All students are safe and accompanied by the staff in-charge.`;
        defaultSeverity = "URGENT";
        break;
      case "DELAY":
        defaultTitle = `Bus ${busNo}: Transit Traffic Delay`;
        defaultMsg = `Bus ${busNo} is currently delayed due to unexpected heavy traffic. Expected arrival delay is approximately 15 to 25 minutes.`;
        defaultSeverity = "WARNING";
        break;
      case "ROUTE_CHANGE":
        defaultTitle = `Bus ${busNo}: Temporary Route Diversion`;
        defaultMsg = `Due to ongoing road work / diversions, Bus ${busNo} will take an alternate route today. All scheduled pick-up/drop stops will be completed with minimal delay.`;
        defaultSeverity = "INFO";
        break;
      case "EMERGENCY":
        defaultTitle = `EMERGENCY ALERT: Bus ${busNo}`;
        defaultMsg = `Urgent alert regarding Bus ${busNo}. Please check your phone for direct SMS/Call from our school transport coordinator.`;
        defaultSeverity = "URGENT";
        break;
      case "GENERAL":
        defaultTitle = `Bus ${busNo}: Transport Update`;
        defaultMsg = `Bus ${busNo} update from SRT Universal School Transport Department.`;
        defaultSeverity = "INFO";
        break;
    }

    setAlertForm((prev) => ({
      ...prev,
      alertType: type,
      severity: defaultSeverity,
      title: defaultTitle,
      message: defaultMsg,
    }));
  };

  const handleSendAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusForAlert) return;
    if (!alertForm.title.trim() || !alertForm.message.trim()) {
      showFeedback("error", "Alert title and message are required.");
      return;
    }
    if (alertForm.targetType === "INDIVIDUAL" && !alertForm.targetStudentId) {
      showFeedback("error", "Please select an individual student to alert.");
      return;
    }

    startTransition(async () => {
      const res = await sendBusAlertAction({
        busId: selectedBusForAlert.id,
        title: alertForm.title,
        message: alertForm.message,
        alertType: alertForm.alertType,
        severity: alertForm.severity,
        targetType: alertForm.targetType,
        targetStudentId: alertForm.targetStudentId || undefined,
        updateBusStatus: alertForm.updateBusStatus,
      });

      if (res.error) {
        showFeedback("error", res.error);
      } else {
        showFeedback("success", `Alert successfully broadcasted! Connected to parent notifications database (${res.recipientCount} parent accounts notified).`);
        setIsAlertModalOpen(false);
        router.refresh();
      }
    });
  };

  const handleResolveIssue = async (bus: any) => {
    const ok = await confirm({
      title: `Resolve Issue for Bus ${bus.busNumber}?`,
      message: `Mark this bus as ACTIVE and clear the active issue notice?`,
      confirmText: "Resolve Issue",
      variant: "primary",
    });
    if (!ok) return;

    startTransition(async () => {
      const res = await resolveBusIssueAction(bus.id);
      if (res.error) {
        showFeedback("error", res.error);
      } else {
        showFeedback("success", `Bus ${bus.busNumber} issue resolved and status set to Active.`);
        router.refresh();
      }
    });
  };

  // ==========================================
  // METRICS & COMPUTED STATS
  // ==========================================
  const totalBuses = buses.length;
  const activeBuses = buses.filter((b) => b.status === "ACTIVE" || b.status === "IN_TRANSIT").length;
  const issueBuses = buses.filter((b) => b.status === "BREAKDOWN" || b.status === "DELAYED");
  const totalStudents = buses.reduce((acc, b) => acc + (b._count?.students || 0), 0);
  const totalAlertsCount = alerts.length;

  const filteredBuses = useMemo(() => {
    return buses.filter((bus) => {
      const q = searchTerm.toLowerCase();
      const matchSearch =
        !q ||
        bus.busNumber.toLowerCase().includes(q) ||
        bus.registrationNumber.toLowerCase().includes(q) ||
        bus.routeName.toLowerCase().includes(q) ||
        bus.driverName.toLowerCase().includes(q) ||
        (bus.inchargeStaffName && bus.inchargeStaffName.toLowerCase().includes(q)) ||
        (bus.inchargeTeacher?.user?.name && bus.inchargeTeacher.user.name.toLowerCase().includes(q));

      const matchStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ISSUES" && (bus.status === "BREAKDOWN" || bus.status === "DELAYED")) ||
        bus.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [buses, searchTerm, statusFilter]);

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

      {/* Global Active Issue Alert Banner if any bus is in breakdown or delay */}
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
                {issueBuses.map((b) => `${b.busNumber}: ${b.status} (${b.currentIssue || "Issue reported"})`).join(" • ")}
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
            View Issue Buses
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
          gap: "1rem",
          width: "100%",
        }}
      >
        <div
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "1.1rem",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              backgroundColor: "rgba(37, 99, 235, 0.12)",
              color: "var(--primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <BusIcon size={24} />
          </div>
          <div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Total Buses</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--foreground)" }}>{totalBuses}</div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "1.1rem",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              backgroundColor: "rgba(16, 185, 129, 0.12)",
              color: "var(--success)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CheckCircle2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Active / On Route</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--foreground)" }}>{activeBuses}</div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: "var(--card)",
            border: issueBuses.length > 0 ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid var(--border)",
            borderRadius: "12px",
            padding: "1.1rem",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              backgroundColor: issueBuses.length > 0 ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.12)",
              color: issueBuses.length > 0 ? "#ef4444" : "var(--warning)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AlertTriangle size={24} />
          </div>
          <div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Issues / Delays</div>
            <div
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                color: issueBuses.length > 0 ? "#ef4444" : "var(--foreground)",
              }}
            >
              {issueBuses.length}
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "1.1rem",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              backgroundColor: "rgba(139, 92, 246, 0.12)",
              color: "#8b5cf6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Users size={24} />
          </div>
          <div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Assigned Students</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--foreground)" }}>{totalStudents}</div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "1.1rem",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              backgroundColor: "rgba(236, 72, 153, 0.12)",
              color: "#ec4899",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Bell size={24} />
          </div>
          <div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Alerts Dispatched</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--foreground)" }}>{totalAlertsCount}</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs & Primary Actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          borderBottom: "1px solid var(--border)",
          paddingBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => setActiveTab("FLEET")}
            style={{
              padding: "0.6rem 1.2rem",
              borderRadius: "8px",
              backgroundColor: activeTab === "FLEET" ? "var(--primary)" : "var(--card)",
              color: activeTab === "FLEET" ? "#fff" : "var(--foreground)",
              border: activeTab === "FLEET" ? "none" : "1px solid var(--border)",
              fontWeight: 600,
              fontSize: "0.9rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <BusIcon size={18} />
            <span>Bus Fleet Roster ({totalBuses})</span>
          </button>

          <button
            onClick={() => setActiveTab("ALERTS")}
            style={{
              padding: "0.6rem 1.2rem",
              borderRadius: "8px",
              backgroundColor: activeTab === "ALERTS" ? "var(--primary)" : "var(--card)",
              color: activeTab === "ALERTS" ? "#fff" : "var(--foreground)",
              border: activeTab === "ALERTS" ? "none" : "1px solid var(--border)",
              fontWeight: 600,
              fontSize: "0.9rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <ShieldAlert size={18} />
            <span>Dispatched Alerts Log ({alerts.length})</span>
          </button>
        </div>

        {currentUserRole === "ADMIN" && (
          <button
            onClick={handleOpenCreateBus}
            style={{
              padding: "0.65rem 1.25rem",
              borderRadius: "8px",
              backgroundColor: "var(--primary)",
              color: "#fff",
              border: "none",
              fontWeight: 600,
              fontSize: "0.9rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              boxShadow: "0 2px 4px rgba(37, 99, 235, 0.2)",
            }}
          >
            <Plus size={18} />
            <span>Create New Bus</span>
          </button>
        )}
      </div>

      {activeTab === "FLEET" ? (
        <>
          {/* Search and Filters Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div
              style={{
                position: "relative",
                flex: "1 1 280px",
                maxWidth: "400px",
              }}
            >
              <Search
                size={18}
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-secondary)",
                }}
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search bus no, route, driver, in-charge..."
                style={{
                  width: "100%",
                  padding: "0.6rem 0.75rem 0.6rem 2.4rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  fontSize: "0.9rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Status:</span>
              {["ALL", "ACTIVE", "IN_TRANSIT", "DELAYED", "BREAKDOWN", "ISSUES"].map((st) => (
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
            </div>
          </div>

          {/* Bus Fleet Grid */}
          {filteredBuses.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "3.5rem 1rem",
                backgroundColor: "var(--card)",
                borderRadius: "12px",
                border: "1px solid var(--border)",
              }}
            >
              <BusIcon size={48} style={{ opacity: 0.25, margin: "0 auto 1rem" }} />
              <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--foreground)" }}>No buses found</h3>
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                {searchTerm || statusFilter !== "ALL"
                  ? "Try adjusting your search query or filter."
                  : "No buses created yet. Click 'Create New Bus' above to add your first school bus."}
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))",
                gap: "1.25rem",
              }}
            >
              {filteredBuses.map((bus) => {
                const assignedCount = bus._count?.students || 0;
                const capacity = bus.capacity || 40;
                const occupancyPercent = Math.min(100, Math.round((assignedCount / capacity) * 100));

                const inchargeName =
                  bus.inchargeTeacher?.user?.name || bus.inchargeStaffName || "Staff In-charge Not Assigned";
                const inchargePhone = bus.inchargeTeacher?.phone || bus.inchargeStaffPhone;

                const hasIssue = bus.status === "BREAKDOWN" || bus.status === "DELAYED";

                return (
                  <div
                    key={bus.id}
                    style={{
                      backgroundColor: "var(--card)",
                      borderRadius: "12px",
                      border: hasIssue ? "2px solid rgba(239, 68, 68, 0.6)" : "1px solid var(--border)",
                      padding: "1.25rem",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "1rem",
                      boxShadow: hasIssue
                        ? "0 4px 14px rgba(239, 68, 68, 0.15)"
                        : "0 2px 6px rgba(0, 0, 0, 0.04)",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {/* Top Bus Header */}
                    <div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: "0.5rem",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span
                              style={{
                                fontSize: "1.25rem",
                                fontWeight: 700,
                                color: "var(--foreground)",
                              }}
                            >
                              {bus.busNumber}
                            </span>
                            <span
                              style={{
                                fontSize: "0.75rem",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                backgroundColor: "rgba(255, 255, 255, 0.08)",
                                border: "1px solid var(--border)",
                                color: "var(--text-secondary)",
                                fontFamily: "monospace",
                              }}
                            >
                              {bus.registrationNumber}
                            </span>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span
                          style={{
                            padding: "3px 10px",
                            borderRadius: "12px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            backgroundColor:
                              bus.status === "ACTIVE"
                                ? "rgba(16, 185, 129, 0.15)"
                                : bus.status === "IN_TRANSIT"
                                ? "rgba(37, 99, 235, 0.15)"
                                : bus.status === "DELAYED"
                                ? "rgba(245, 158, 11, 0.18)"
                                : bus.status === "BREAKDOWN"
                                ? "rgba(239, 68, 68, 0.2)"
                                : "rgba(107, 114, 128, 0.15)",
                            color:
                              bus.status === "ACTIVE"
                                ? "var(--success)"
                                : bus.status === "IN_TRANSIT"
                                ? "var(--primary)"
                                : bus.status === "DELAYED"
                                ? "#f59e0b"
                                : bus.status === "BREAKDOWN"
                                ? "#ef4444"
                                : "var(--text-secondary)",
                            border: `1px solid ${
                              bus.status === "ACTIVE"
                                ? "rgba(16, 185, 129, 0.3)"
                                : bus.status === "BREAKDOWN"
                                ? "rgba(239, 68, 68, 0.4)"
                                : "transparent"
                            }`,
                          }}
                        >
                          {bus.status === "BREAKDOWN" && <AlertTriangle size={12} />}
                          {bus.status.replace("_", " ")}
                        </span>
                      </div>

                      {/* Route Path */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          color: "var(--foreground)",
                          fontSize: "0.92rem",
                          fontWeight: 500,
                          marginBottom: "0.75rem",
                        }}
                      >
                        <MapPin size={16} style={{ color: "var(--primary)", flexShrink: 0 }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {bus.routeName}
                        </span>
                      </div>

                      {/* Active Issue Warning Banner */}
                      {hasIssue && (
                        <div
                          style={{
                            backgroundColor: "rgba(239, 68, 68, 0.12)",
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                            borderRadius: "8px",
                            padding: "0.65rem 0.85rem",
                            marginBottom: "0.75rem",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "0.5rem",
                            }}
                          >
                            <span
                              style={{
                                color: "#ef4444",
                                fontWeight: 700,
                                fontSize: "0.8rem",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <AlertOctagon size={14} /> ACTIVE ISSUE
                            </span>
                            <button
                              onClick={() => handleResolveIssue(bus)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--primary)",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                textDecoration: "underline",
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              Clear / Resolve
                            </button>
                          </div>
                          <p style={{ margin: "4px 0 0 0", fontSize: "0.85rem", color: "var(--foreground)" }}>
                            {bus.currentIssue || "Bus reported with transit issue."}
                          </p>
                        </div>
                      )}

                      {/* Staff & Driver Info */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.5rem",
                          fontSize: "0.85rem",
                          backgroundColor: "rgba(0,0,0,0.03)",
                          padding: "0.75rem",
                          borderRadius: "8px",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "var(--text-secondary)" }}>Driver:</span>
                          <span style={{ fontWeight: 600, color: "var(--foreground)", display: "flex", alignItems: "center", gap: "6px" }}>
                            {bus.driverName}
                            <a
                              href={`tel:${bus.driverPhone}`}
                              style={{ color: "var(--primary)", display: "inline-flex" }}
                              title={`Call Driver: ${bus.driverPhone}`}
                            >
                              <Phone size={14} />
                            </a>
                          </span>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "var(--text-secondary)" }}>Staff In-charge:</span>
                          <span style={{ fontWeight: 600, color: "var(--foreground)", display: "flex", alignItems: "center", gap: "6px" }}>
                            {inchargeName}
                            {inchargePhone && (
                              <a
                                href={`tel:${inchargePhone}`}
                                style={{ color: "var(--primary)", display: "inline-flex" }}
                                title={`Call In-charge: ${inchargePhone}`}
                              >
                                <Phone size={14} />
                              </a>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Capacity & Occupancy Bar */}
                      <div style={{ marginTop: "0.85rem" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "0.8rem",
                            marginBottom: "4px",
                          }}
                        >
                          <span style={{ color: "var(--text-secondary)" }}>Student Occupancy</span>
                          <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
                            {assignedCount} / {capacity} Seats ({occupancyPercent}%)
                          </span>
                        </div>
                        <div
                          style={{
                            width: "100%",
                            height: "6px",
                            borderRadius: "3px",
                            backgroundColor: "var(--border)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${occupancyPercent}%`,
                              height: "100%",
                              backgroundColor:
                                occupancyPercent > 90
                                  ? "var(--danger)"
                                  : occupancyPercent > 70
                                  ? "#f59e0b"
                                  : "var(--primary)",
                              borderRadius: "3px",
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Bus Card Actions */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                        paddingTop: "0.75rem",
                        borderTop: "1px solid var(--border)",
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                        {/* Send Alert Button */}
                        <button
                          onClick={() => handleOpenAlertModal(bus)}
                          style={{
                            padding: "0.55rem",
                            borderRadius: "6px",
                            backgroundColor: hasIssue ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)",
                            color: hasIssue ? "#ef4444" : "#f59e0b",
                            border: `1px solid ${hasIssue ? "rgba(239, 68, 68, 0.35)" : "rgba(245, 158, 11, 0.3)"}`,
                            fontWeight: 600,
                            fontSize: "0.85rem",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.35rem",
                          }}
                        >
                          <AlertTriangle size={15} />
                          <span>Send Alert</span>
                        </button>

                        {/* Manage Students Button */}
                        <button
                          onClick={() => handleOpenManageStudents(bus)}
                          style={{
                            padding: "0.55rem",
                            borderRadius: "6px",
                            backgroundColor: "rgba(37, 99, 235, 0.1)",
                            color: "var(--primary)",
                            border: "1px solid rgba(37, 99, 235, 0.25)",
                            fontWeight: 600,
                            fontSize: "0.85rem",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.35rem",
                          }}
                        >
                          <Users size={15} />
                          <span>Students ({assignedCount})</span>
                        </button>
                      </div>

                      {currentUserRole === "ADMIN" && (
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "2px" }}>
                          <button
                            onClick={() => handleOpenEditBus(bus)}
                            style={{
                              padding: "0.35rem 0.65rem",
                              borderRadius: "4px",
                              backgroundColor: "transparent",
                              color: "var(--text-secondary)",
                              border: "1px solid var(--border)",
                              cursor: "pointer",
                              fontSize: "0.8rem",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <Edit size={13} /> Edit
                          </button>
                          <button
                            onClick={() => handleDeleteBus(bus)}
                            style={{
                              padding: "0.35rem 0.65rem",
                              borderRadius: "4px",
                              backgroundColor: "transparent",
                              color: "var(--danger)",
                              border: "1px solid var(--border)",
                              cursor: "pointer",
                              fontSize: "0.8rem",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Alerts Log Tab */
        <div
          style={{
            backgroundColor: "var(--card)",
            borderRadius: "12px",
            border: "1px solid var(--border)",
            padding: "1.25rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <h3 style={{ margin: 0, color: "var(--foreground)", fontSize: "1.1rem" }}>
              Dispatched Bus Alerts &amp; Notification History
            </h3>
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              All alerts automatically delivered to parent accounts &amp; Notification database
            </span>
          </div>

          {alerts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
              <Bell size={40} style={{ opacity: 0.3, margin: "0 auto 0.5rem" }} />
              <p>No bus alerts dispatched yet.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {alerts.map((al) => (
                <div
                  key={al.id}
                  style={{
                    padding: "1rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    backgroundColor: "rgba(0,0,0,0.02)",
                    borderLeft: `4px solid ${
                      al.severity === "URGENT" ? "#ef4444" : al.severity === "WARNING" ? "#f59e0b" : "var(--primary)"
                    }`,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.4rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          backgroundColor: "rgba(37, 99, 235, 0.12)",
                          color: "var(--primary)",
                        }}
                      >
                        {al.bus?.busNumber || "Bus Fleet"}
                      </span>
                      <strong style={{ color: "var(--foreground)", fontSize: "0.95rem" }}>{al.title}</strong>
                      <span
                        style={{
                          padding: "1px 6px",
                          borderRadius: "4px",
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          backgroundColor:
                            al.severity === "URGENT"
                              ? "rgba(239, 68, 68, 0.15)"
                              : al.severity === "WARNING"
                              ? "rgba(245, 158, 11, 0.15)"
                              : "rgba(16, 185, 129, 0.15)",
                          color:
                            al.severity === "URGENT"
                              ? "#ef4444"
                              : al.severity === "WARNING"
                              ? "#f59e0b"
                              : "var(--success)",
                        }}
                      >
                        {al.severity}
                      </span>
                    </div>

                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      {new Date(al.createdAt).toLocaleString([], {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                  </div>

                  <p style={{ margin: "4px 0", color: "var(--foreground)", fontSize: "0.9rem" }}>{al.message}</p>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "0.78rem",
                      color: "var(--text-secondary)",
                      marginTop: "4px",
                    }}
                  >
                    <span>
                      Target: <strong>{al.targetType === "ALL_PARENTS" ? "All Parents on Bus" : "Individual Parent"}</strong> •
                      Recipients: <strong>{al.recipientCount} accounts</strong>
                    </span>
                    <span>Dispatched by: {al.senderName} ({al.senderRole})</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: CREATE / EDIT BUS                               */}
      {/* ======================================================== */}
      <Modal
        isOpen={isBusModalOpen}
        onClose={() => setIsBusModalOpen(false)}
        title={editingBus ? `Edit Bus ${editingBus.busNumber}` : "Register New School Bus"}
        icon={<BusIcon size={20} />}
        size="form"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", width: "100%" }}>
            <button
              type="button"
              onClick={() => setIsBusModalOpen(false)}
              style={{
                padding: "0.6rem 1.2rem",
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
                padding: "0.6rem 1.4rem",
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
        <form onSubmit={handleSaveBus} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px", color: "var(--foreground)" }}>
                Bus Number *
              </label>
              <input
                type="text"
                required
                value={busForm.busNumber}
                onChange={(e) => setBusForm({ ...busForm, busNumber: e.target.value })}
                placeholder="e.g. Bus 01 or Route 4"
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px", color: "var(--foreground)" }}>
                Vehicle Registration No *
              </label>
              <input
                type="text"
                required
                value={busForm.registrationNumber}
                onChange={(e) => setBusForm({ ...busForm, registrationNumber: e.target.value })}
                placeholder="e.g. TN-01-AB-1234"
                style={{
                  width: "100%",
                  padding: "0.6rem",
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
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px", color: "var(--foreground)" }}>
              Route Name / Description *
            </label>
            <input
              type="text"
              required
              value={busForm.routeName}
              onChange={(e) => setBusForm({ ...busForm, routeName: e.target.value })}
              placeholder="e.g. North Zone - Anna Nagar - Guindy - School Campus"
              style={{
                width: "100%",
                padding: "0.6rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                color: "var(--foreground)",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px", color: "var(--foreground)" }}>
                Driver Full Name *
              </label>
              <input
                type="text"
                required
                value={busForm.driverName}
                onChange={(e) => setBusForm({ ...busForm, driverName: e.target.value })}
                placeholder="e.g. Ramesh Kumar"
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px", color: "var(--foreground)" }}>
                Driver Contact Phone *
              </label>
              <input
                type="tel"
                required
                value={busForm.driverPhone}
                onChange={(e) => setBusForm({ ...busForm, driverPhone: e.target.value })}
                placeholder="e.g. +91 98765 43210"
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px", color: "var(--foreground)" }}>
                Assign Staff In-charge (Teacher)
              </label>
              <select
                value={busForm.inchargeTeacherId}
                onChange={(e) => setBusForm({ ...busForm, inchargeTeacherId: e.target.value })}
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  boxSizing: "border-box",
                }}
              >
                <option value="">-- Select School Teacher In-charge --</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.user.name} ({t.phone || "No phone"})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px", color: "var(--foreground)" }}>
                Or Custom Staff Name &amp; Phone
              </label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  value={busForm.inchargeStaffName}
                  onChange={(e) => setBusForm({ ...busForm, inchargeStaffName: e.target.value })}
                  placeholder="Staff Name"
                  style={{
                    width: "55%",
                    padding: "0.6rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--card)",
                    color: "var(--foreground)",
                    boxSizing: "border-box",
                  }}
                />
                <input
                  type="tel"
                  value={busForm.inchargeStaffPhone}
                  onChange={(e) => setBusForm({ ...busForm, inchargeStaffPhone: e.target.value })}
                  placeholder="Staff Phone"
                  style={{
                    width: "45%",
                    padding: "0.6rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--card)",
                    color: "var(--foreground)",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px", color: "var(--foreground)" }}>
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
                  padding: "0.6rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px", color: "var(--foreground)" }}>
                Initial Status
              </label>
              <select
                value={busForm.status}
                onChange={(e) => setBusForm({ ...busForm, status: e.target.value })}
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  boxSizing: "border-box",
                }}
              >
                <option value="ACTIVE">ACTIVE (Normal Service)</option>
                <option value="IN_TRANSIT">IN TRANSIT (On Route)</option>
                <option value="DELAYED">DELAYED</option>
                <option value="BREAKDOWN">BREAKDOWN</option>
                <option value="IN_MAINTENANCE">IN MAINTENANCE</option>
              </select>
            </div>
          </div>
        </form>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL 2: MANAGE STUDENTS ON BUS                          */}
      {/* ======================================================== */}
      <Modal
        isOpen={isStudentsModalOpen}
        onClose={() => setIsStudentsModalOpen(false)}
        title={`Manage Students — ${selectedBusForStudents?.busNumber || "Bus"}`}
        subtitle={`Route: ${selectedBusForStudents?.routeName || ""}`}
        icon={<Users size={20} />}
        size="lg"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Sub Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
            <button
              onClick={() => setStudentModalTab("ROSTER")}
              style={{
                padding: "0.6rem 1.2rem",
                border: "none",
                background: "none",
                borderBottom: studentModalTab === "ROSTER" ? "2px solid var(--primary)" : "none",
                color: studentModalTab === "ROSTER" ? "var(--primary)" : "var(--text-secondary)",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: "pointer",
              }}
            >
              Enrolled Roster ({busStudentsList.length} / {selectedBusForStudents?.capacity || 40})
            </button>
            <button
              onClick={() => setStudentModalTab("ASSIGN")}
              style={{
                padding: "0.6rem 1.2rem",
                border: "none",
                background: "none",
                borderBottom: studentModalTab === "ASSIGN" ? "2px solid var(--primary)" : "none",
                color: studentModalTab === "ASSIGN" ? "var(--primary)" : "var(--text-secondary)",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: "pointer",
              }}
            >
              + Add Students from Classes
            </button>
          </div>

          {studentModalTab === "ROSTER" ? (
            <div>
              {isLoadingStudents ? (
                <div style={{ textAlign: "center", padding: "2rem" }}>Loading bus students...</div>
              ) : busStudentsList.length === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
                  <Users size={40} style={{ opacity: 0.3, margin: "0 auto 0.5rem" }} />
                  <p>No students enrolled on this bus yet.</p>
                  <button
                    onClick={() => setStudentModalTab("ASSIGN")}
                    style={{
                      padding: "0.5rem 1rem",
                      borderRadius: "6px",
                      backgroundColor: "var(--primary)",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                    }}
                  >
                    Add Students Now
                  </button>
                </div>
              ) : (
                <div style={{ maxHeight: "400px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {busStudentsList.map((item) => {
                    const st = item.student;
                    const studentName = `${st.firstName} ${st.lastName}`;
                    const parentPhone = st.parents?.[0]?.parent?.phone || "No phone";
                    const parentName = st.parents?.[0]?.parent?.user?.name || "Parent";

                    return (
                      <div
                        key={item.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "0.75rem 1rem",
                          borderRadius: "8px",
                          border: "1px solid var(--border)",
                          backgroundColor: "rgba(0,0,0,0.02)",
                          gap: "0.75rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: "200px" }}>
                          <div style={{ fontWeight: 600, color: "var(--foreground)", fontSize: "0.95rem" }}>
                            {studentName}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                            Class: {st.class ? `${st.class.name} - ${st.class.section}` : "N/A"} • Roll: {st.rollNumber} • Adm: {st.admissionNo}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                            Parent: {parentName} ({parentPhone})
                          </div>
                        </div>

                        <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                          {item.pickupStop && <div>Pickup: <strong>{item.pickupStop}</strong> ({item.pickupTime || "N/A"})</div>}
                          {item.dropStop && <div>Drop: <strong>{item.dropStop}</strong> ({item.dropTime || "N/A"})</div>}
                        </div>

                        <button
                          onClick={() => handleRemoveStudentFromBus(item.id, studentName)}
                          style={{
                            padding: "0.4rem 0.75rem",
                            borderRadius: "6px",
                            backgroundColor: "rgba(239, 68, 68, 0.1)",
                            color: "var(--danger)",
                            border: "1px solid rgba(239, 68, 68, 0.25)",
                            fontSize: "0.8rem",
                            cursor: "pointer",
                            fontWeight: 500,
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
          ) : (
            /* TAB 2: ASSIGN STUDENTS */
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Pickup & Drop Stop Presets */}
              <div
                style={{
                  backgroundColor: "rgba(37, 99, 235, 0.05)",
                  border: "1px solid rgba(37, 99, 235, 0.2)",
                  borderRadius: "8px",
                  padding: "0.85rem",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
                  gap: "0.75rem",
                }}
              >
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "3px" }}>
                    Pickup Stop / Landmark
                  </label>
                  <input
                    type="text"
                    value={batchPickupStop}
                    onChange={(e) => setBatchPickupStop(e.target.value)}
                    placeholder="e.g. Anna Nagar West Gate"
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
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "3px" }}>
                    Pickup Time
                  </label>
                  <input
                    type="text"
                    value={batchPickupTime}
                    onChange={(e) => setBatchPickupTime(e.target.value)}
                    placeholder="07:30 AM"
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
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "3px" }}>
                    Drop Stop / Landmark
                  </label>
                  <input
                    type="text"
                    value={batchDropStop}
                    onChange={(e) => setBatchDropStop(e.target.value)}
                    placeholder="e.g. Anna Nagar West Gate"
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
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "3px" }}>
                    Drop Time
                  </label>
                  <input
                    type="text"
                    value={batchDropTime}
                    onChange={(e) => setBatchDropTime(e.target.value)}
                    placeholder="04:30 PM"
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
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  style={{
                    padding: "0.5rem",
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
                  value={studentSearchQuery}
                  onChange={(e) => setStudentSearchQuery(e.target.value)}
                  placeholder="Filter student name or roll..."
                  style={{
                    flex: 1,
                    minWidth: "180px",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--card)",
                    color: "var(--foreground)",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              {/* Selection list */}
              <div style={{ maxHeight: "280px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {availableStudentsToAssign.map((st) => {
                  const isSelected = selectedStudentIds.includes(st.id);
                  const existingBus = st.busAssignments?.[0]?.bus?.busNumber;

                  return (
                    <div
                      key={st.id}
                      onClick={() => toggleStudentSelection(st.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        padding: "0.6rem 0.85rem",
                        borderRadius: "6px",
                        border: isSelected ? "1px solid var(--primary)" : "1px solid var(--border)",
                        backgroundColor: isSelected ? "rgba(37, 99, 235, 0.08)" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // Controlled by container onClick
                        style={{ cursor: "pointer" }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--foreground)" }}>
                          {st.firstName} {st.lastName}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                          Class: {st.className} • Roll: {st.rollNumber}
                        </div>
                      </div>

                      {existingBus && (
                        <span
                          style={{
                            fontSize: "0.72rem",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            backgroundColor: "rgba(245, 158, 11, 0.15)",
                            color: "#f59e0b",
                            border: "1px solid rgba(245, 158, 11, 0.3)",
                          }}
                        >
                          On {existingBus}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Action */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.5rem" }}>
                <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  {selectedStudentIds.length} student(s) selected
                </span>
                <button
                  type="button"
                  onClick={handleAssignSelectedStudents}
                  disabled={selectedStudentIds.length === 0 || isPending}
                  style={{
                    padding: "0.6rem 1.4rem",
                    borderRadius: "6px",
                    backgroundColor: "var(--primary)",
                    color: "#fff",
                    border: "none",
                    fontWeight: 600,
                    cursor: "pointer",
                    opacity: selectedStudentIds.length === 0 || isPending ? 0.6 : 1,
                  }}
                >
                  {isPending ? "Assigning..." : `Assign Selected (${selectedStudentIds.length})`}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL 3: BUS ISSUE & ALERT CONSOLE                      */}
      {/* ======================================================== */}
      <Modal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        title={`Bus Alert Console — ${selectedBusForAlert?.busNumber || "Bus"}`}
        subtitle={`Dispatches instant alerts directly to parent portal notifications`}
        icon={<AlertTriangle size={20} />}
        size="form"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", width: "100%" }}>
            <button
              type="button"
              onClick={() => setIsAlertModalOpen(false)}
              style={{
                padding: "0.6rem 1.2rem",
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
              onClick={handleSendAlert}
              disabled={isPending}
              style={{
                padding: "0.6rem 1.4rem",
                borderRadius: "6px",
                backgroundColor: alertForm.severity === "URGENT" ? "#ef4444" : "var(--primary)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                opacity: isPending ? 0.7 : 1,
              }}
            >
              <Send size={16} />
              <span>{isPending ? "Broadcasting..." : "Broadcast Alert to Parents"}</span>
            </button>
          </div>
        }
      >
        <form onSubmit={handleSendAlert} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Quick Issue / Alert Type Selectors */}
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "6px", color: "var(--foreground)" }}>
              Issue / Alert Scenario
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.5rem" }}>
              {[
                { type: "BREAKDOWN", label: "Breakdown 🚨", color: "#ef4444" },
                { type: "DELAY", label: "Transit Delay ⏱️", color: "#f59e0b" },
                { type: "ROUTE_CHANGE", label: "Route Diversion 🔄", color: "var(--primary)" },
                { type: "EMERGENCY", label: "Emergency ⚠️", color: "#dc2626" },
                { type: "GENERAL", label: "General Notice 📢", color: "#8b5cf6" },
              ].map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => handleAlertTypeChange(item.type as any)}
                  style={{
                    padding: "0.55rem 0.5rem",
                    borderRadius: "6px",
                    border: alertForm.alertType === item.type ? `2px solid ${item.color}` : "1px solid var(--border)",
                    backgroundColor: alertForm.alertType === item.type ? "rgba(0,0,0,0.06)" : "var(--card)",
                    color: "var(--foreground)",
                    fontSize: "0.82rem",
                    fontWeight: alertForm.alertType === item.type ? 700 : 500,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Target Audience: Common (All Parents) vs Individual */}
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "6px", color: "var(--foreground)" }}>
              Target Audience
            </label>
            <div style={{ display: "flex", gap: "1rem", marginBottom: "0.5rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.9rem" }}>
                <input
                  type="radio"
                  name="targetType"
                  value="ALL_PARENTS"
                  checked={alertForm.targetType === "ALL_PARENTS"}
                  onChange={() => setAlertForm({ ...alertForm, targetType: "ALL_PARENTS", targetStudentId: "" })}
                />
                <strong>All Parents on this Bus (Common Broadcast)</strong>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.9rem" }}>
                <input
                  type="radio"
                  name="targetType"
                  value="INDIVIDUAL"
                  checked={alertForm.targetType === "INDIVIDUAL"}
                  onChange={() => setAlertForm({ ...alertForm, targetType: "INDIVIDUAL" })}
                />
                <strong>Individual Student Parent</strong>
              </label>
            </div>

            {alertForm.targetType === "INDIVIDUAL" && (
              <select
                value={alertForm.targetStudentId}
                onChange={(e) => setAlertForm({ ...alertForm, targetStudentId: e.target.value })}
                required
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  fontSize: "0.9rem",
                  boxSizing: "border-box",
                }}
              >
                <option value="">-- Choose Student to Alert Parent --</option>
                {busEnrolledStudentsForAlert.map((item) => (
                  <option key={item.student.id} value={item.student.id}>
                    {item.student.firstName} {item.student.lastName} (Roll: {item.student.rollNumber})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Alert Title */}
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px", color: "var(--foreground)" }}>
              Alert Title *
            </label>
            <input
              type="text"
              required
              value={alertForm.title}
              onChange={(e) => setAlertForm({ ...alertForm, title: e.target.value })}
              style={{
                width: "100%",
                padding: "0.6rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                color: "var(--foreground)",
                fontSize: "0.9rem",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Alert Message */}
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px", color: "var(--foreground)" }}>
              Message Content *
            </label>
            <textarea
              required
              rows={4}
              value={alertForm.message}
              onChange={(e) => setAlertForm({ ...alertForm, message: e.target.value })}
              style={{
                width: "100%",
                padding: "0.6rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                color: "var(--foreground)",
                fontSize: "0.9rem",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Severity & Bus Status sync */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", alignItems: "center" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px", color: "var(--foreground)" }}>
                Alert Severity
              </label>
              <select
                value={alertForm.severity}
                onChange={(e) => setAlertForm({ ...alertForm, severity: e.target.value as any })}
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  boxSizing: "border-box",
                }}
              >
                <option value="URGENT">URGENT (High Alert)</option>
                <option value="WARNING">WARNING (Transit Notice)</option>
                <option value="INFO">INFO (Standard Update)</option>
              </select>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.85rem", marginTop: "1.2rem" }}>
              <input
                type="checkbox"
                checked={alertForm.updateBusStatus}
                onChange={(e) => setAlertForm({ ...alertForm, updateBusStatus: e.target.checked })}
              />
              <span>Set Bus Fleet Status to {alertForm.alertType === "BREAKDOWN" ? "BREAKDOWN" : "DELAYED"}</span>
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
}
