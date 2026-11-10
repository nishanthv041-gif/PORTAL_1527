"use client";

import React, { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateOfBirthField } from "@/frontend/components/ui/form";
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
  Search,
  Check,
  X,
  GraduationCap,
} from "lucide-react";
import Modal from "@/frontend/components/ui/Modal";
import SearchBar from "@/frontend/components/ui/SearchBar";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";
import { MultiSelect } from "@/frontend/components/ui";
import {
  createBusAction,
  updateBusAction,
  deleteBusAction,
  assignStudentsToBusAction,
  removeStudentFromBusAction,
  updateBusStatusAction,
  sendBusMessageAction,
  getBusDetailAction,
  updateBusStudentRouteAction,
} from "@/backend/api/actions/dashboard/admin/transport/actions";
import { isDayScholarStudent } from "@/backend/lib/transport/dayScholarHelper";

interface TransportSummaryMetrics {
  totalBuses: number;
  runningBuses: number;
  issuesBuses: number;
  totalDayScholars: number;
  dayScholarsOnBuses: number;
  dayScholarsUnassigned: number;
}

interface AdminBusManagementProps {
  initialBuses: any[];
  staffList: any[];
  classes: any[];
  recentMessages?: any[];
  recentStatusLogs?: any[];
  currentUserName?: string;
  summaryMetrics?: TransportSummaryMetrics;
  // Legacy compatibility props if passed
  teachers?: any[];
  initialAlerts?: any[];
  currentUserRole?: string;
}

export default function AdminBusManagement({
  initialBuses,
  staffList,
  classes,
  recentMessages = [],
  recentStatusLogs = [],
  currentUserName = "Administrator",
  summaryMetrics,
  teachers = [],
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

  // Staff list fallback
  const allStaff = useMemo(() => {
    if (staffList && staffList.length > 0) return staffList;
    if (teachers && teachers.length > 0) {
      return teachers.map((t: any) => ({
        id: t.id,
        phone: t.phone,
        designation: "Teacher / Faculty",
        user: t.user || { name: t.name || "Faculty Member" },
      }));
    }
    return [];
  }, [staffList, teachers]);

  // ==========================================
  // MODAL 1: CREATE / EDIT BUS
  // ==========================================
  const [isBusModalOpen, setIsBusModalOpen] = useState(false);
  const [editingBusId, setEditingBusId] = useState<string | null>(null);

  const [busNumber, setBusNumber] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState<number>(35);
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [driverDob, setDriverDob] = useState("");
  const [routeDescription, setRouteDescription] = useState("");
  const [inChargeStaffId, setInChargeStaffId] = useState("");

  const handleOpenCreateBus = () => {
    setEditingBusId(null);
    setBusNumber(`BUS-${String(buses.length + 1).padStart(2, "0")}`);
    setRegistrationNo("TN 01 AB ");
    setName("");
    setCapacity(35);
    setDriverName("");
    setDriverPhone("");
    setDriverDob("");
    setRouteDescription("");
    setInChargeStaffId(allStaff[0]?.id || "");
    setIsBusModalOpen(true);
  };

  const handleOpenEditBus = (bus: any) => {
    setEditingBusId(bus.id);
    setBusNumber(bus.busNumber);
    setRegistrationNo(bus.registrationNo);
    setName(bus.name);
    setCapacity(bus.capacity);
    setDriverName(bus.driverName);
    setDriverPhone(bus.driverPhone);
    setDriverDob(bus.driverDob ? (typeof bus.driverDob === "string" ? bus.driverDob.split("T")[0] : new Date(bus.driverDob).toISOString().split("T")[0]) : "");
    setRouteDescription(bus.routeDescription || "");
    setInChargeStaffId(bus.inChargeStaffId || "");
    setIsBusModalOpen(true);
  };

  const handleSaveBus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busNumber.trim() || !registrationNo.trim() || !name.trim()) {
      showToast("error", "Bus number, registration, and route name are required.");
      return;
    }
    if (!driverName.trim() || !driverPhone.trim()) {
      showToast("error", "Driver name and phone number are required.");
      return;
    }

    const payload = {
      busNumber: busNumber.trim().toUpperCase(),
      registrationNo: registrationNo.trim().toUpperCase(),
      name: name.trim(),
      capacity: Number(capacity),
      driverName: driverName.trim(),
      driverPhone: driverPhone.trim(),
      driverDob: driverDob || undefined,
      routeDescription: routeDescription.trim() || undefined,
      inChargeStaffId: inChargeStaffId || undefined,
    };

    startTransition(async () => {
      if (editingBusId) {
        const res = await updateBusAction(editingBusId, payload);
        if (res.error) {
          showToast("error", res.error);
        } else {
          showToast("success", "Bus details updated successfully.");
          setIsBusModalOpen(false);
          router.refresh();
        }
      } else {
        const res = await createBusAction(payload);
        if (res.error) {
          showToast("error", res.error);
        } else {
          showToast("success", `Bus ${payload.busNumber} created! Now assign Day Scholar students.`);
          setIsBusModalOpen(false);
          router.refresh();
          // Open student assignment modal for this newly created bus!
          if (res.bus?.id) {
            handleOpenAssignStudents(res.bus);
          }
        }
      }
    });
  };

  const handleDeleteBus = async (bus: any) => {
    const ok = await confirm({
      title: `Delete Bus ${bus.busNumber}?`,
      message: `WARNING: Deleting "${bus.busNumber} - ${bus.name}" will safely unassign all enrolled students. Enrolled students are NOT deleted and will return to unassigned status. Historical status logs and messages will be archived.`,
      confirmText: "Delete Bus",
      cancelText: "Cancel",
      variant: "danger",
    });

    if (!ok) return;

    startTransition(async () => {
      const res = await deleteBusAction(bus.id);
      if (res.error) {
        showToast("error", res.error);
      } else {
        showToast("success", res.message || "Bus deleted successfully.");
        setBuses((prev) => prev.filter((b) => b.id !== bus.id));
        router.refresh();
      }
    });
  };

  // ==========================================
  // MODAL 2: ADD DAY SCHOLAR STUDENTS (CLASS-WISE)
  // ==========================================
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [targetBusForAssign, setTargetBusForAssign] = useState<any | null>(null);

  // Step 1: Class-wise selector
  const [selectedClassId, setSelectedClassId] = useState<string>("ALL");
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [pickupPointInput, setPickupPointInput] = useState("");
  const [dropPointInput, setDropPointInput] = useState("");

  const handleOpenAssignStudents = (bus: any) => {
    setTargetBusForAssign(bus);
    setSelectedClassId("ALL");
    setStudentSearchQuery("");
    setSelectedStudentIds([]);
    setPickupPointInput(bus.routeDescription || "");
    setDropPointInput(bus.routeDescription || "");
    setIsAssignModalOpen(true);
  };

  // Extract all real DAY SCHOLAR students across all classes with metadata and assignment status
  const allAvailableStudents = useMemo(() => {
    const list: any[] = [];
    classes.forEach((cls) => {
      (cls.students || [])
        .filter((st: any) => isDayScholarStudent(st))
        .forEach((st: any) => {
          const activeAssignment = (st.busAssignments || []).find((ba: any) => ba.academicYear === "2025-2026" || !ba.academicYear);
          const assignedBusNumber = activeAssignment?.bus?.busNumber || (st.busAssignments?.[0]?.bus?.busNumber);
          list.push({
            ...st,
            className: `${cls.name} - ${cls.section}`,
            classObjId: cls.id,
            isAssigned: !!assignedBusNumber,
            assignedBusNumber: assignedBusNumber || null,
            isDayScholar: true,
          });
        });
    });
    return list;
  }, [classes]);

  // Current filtered list of real Day Scholar students based on Class & search
  const availableStudentsList = useMemo(() => {
    let list = allAvailableStudents;

    if (selectedClassId !== "ALL") {
      list = list.filter((st) => st.classObjId === selectedClassId);
    }

    if (studentSearchQuery.trim()) {
      const q = studentSearchQuery.toLowerCase();
      list = list.filter(
        (st) =>
          st.firstName.toLowerCase().includes(q) ||
          st.lastName.toLowerCase().includes(q) ||
          (st.rollNumber && st.rollNumber.toLowerCase().includes(q)) ||
          (st.admissionNo && st.admissionNo.toLowerCase().includes(q)) ||
          st.className.toLowerCase().includes(q)
      );
    }

    return list;
  }, [allAvailableStudents, selectedClassId, studentSearchQuery]);

  // Select all unassigned students currently visible in selected view
  const handleSelectAllInClass = () => {
    const selectable = availableStudentsList.filter((s) => !s.isAssigned);
    if (selectable.length === 0) return;
    const allIds = selectable.map((s) => s.id);
    const allSelected = allIds.every((id) => selectedStudentIds.includes(id));

    if (allSelected) {
      setSelectedStudentIds((prev) => prev.filter((id) => !allIds.includes(id)));
    } else {
      const combined = Array.from(new Set([...selectedStudentIds, ...allIds]));
      setSelectedStudentIds(combined);
    }
  };

  const toggleStudentSelection = (st: any) => {
    if (st.isAssigned) return;
    setSelectedStudentIds((prev) =>
      prev.includes(st.id)
        ? prev.filter((id) => id !== st.id)
        : [...prev, st.id]
    );
  };

  const handleSaveStudentAssignments = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetBusForAssign) return;

    if (selectedStudentIds.length === 0) {
      showToast("error", "Please select at least one student to assign.");
      return;
    }

    const currentCount = targetBusForAssign._count?.students || 0;
    const remainingSeats = Math.max(0, targetBusForAssign.capacity - currentCount);

    if (selectedStudentIds.length > remainingSeats) {
      showToast(
        "error",
        `Cannot assign ${selectedStudentIds.length} students: only ${remainingSeats} seat(s) remaining on Bus ${targetBusForAssign.busNumber}.`
      );
      return;
    }

    const payload = {
      academicYear: "2025-2026",
      students: selectedStudentIds.map((studentId) => ({
        studentId,
        pickupPoint: pickupPointInput.trim() || undefined,
        dropPoint: dropPointInput.trim() || undefined,
      })),
    };

    startTransition(async () => {
      const res = await assignStudentsToBusAction(targetBusForAssign.id, payload);
      if (res.error) {
        showToast("error", res.error);
      } else {
        showToast(
          "success",
          res.message || `Successfully assigned ${selectedStudentIds.length} Day Scholar student(s) to Bus ${targetBusForAssign.busNumber}!`
        );
        setIsAssignModalOpen(false);
        router.refresh();
      }
    });
  };

  // ==========================================
  // MODAL 3: VIEW & MANAGE ROSTER
  // ==========================================
  const [isRosterModalOpen, setIsRosterModalOpen] = useState(false);
  const [rosterBusData, setRosterBusData] = useState<any | null>(null);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [rosterSearchQuery, setRosterSearchQuery] = useState("");
  const [editingLandmarkId, setEditingLandmarkId] = useState<string | null>(null);
  const [pickupLandmarkInput, setPickupLandmarkInput] = useState("");
  const [dropLandmarkInput, setDropLandmarkInput] = useState("");
  const [isUpdatingLandmarks, setIsUpdatingLandmarks] = useState(false);

  const handleOpenRoster = async (bus: any) => {
    setIsLoadingRoster(true);
    setRosterSearchQuery("");
    setEditingLandmarkId(null);
    setIsRosterModalOpen(true);
    const detail = await getBusDetailAction(bus.id);
    setIsLoadingRoster(false);
    if (detail.bus) {
      setRosterBusData(detail.bus);
    } else {
      setRosterBusData(bus);
    }
  };

  const handleStartEditLandmarks = (assignmentItem: any) => {
    setEditingLandmarkId(assignmentItem.id);
    setPickupLandmarkInput(assignmentItem.pickupPoint || "");
    setDropLandmarkInput(assignmentItem.dropPoint || "");
  };

  const handleSaveLandmarks = async (assignmentId: string) => {
    setIsUpdatingLandmarks(true);
    const res = await updateBusStudentRouteAction(assignmentId, {
      pickupPoint: pickupLandmarkInput,
      dropPoint: dropLandmarkInput,
    });
    setIsUpdatingLandmarks(false);
    if (res.error) {
      showToast("error", res.error);
    } else {
      showToast("success", res.message || "Pickup/Drop landmarks updated.");
      setEditingLandmarkId(null);
      if (rosterBusData?.id) {
        const fresh = await getBusDetailAction(rosterBusData.id);
        if (fresh.bus) setRosterBusData(fresh.bus);
      }
      router.refresh();
    }
  };

  const handleRemoveStudentFromRoster = async (studentId: string, studentName: string) => {
    if (!rosterBusData) return;
    const ok = await confirm({
      title: `Remove ${studentName} from Bus ${rosterBusData.busNumber}?`,
      message: `Are you sure you want to remove ${studentName} from this bus? The student record will remain intact, and the parent will be notified.`,
      confirmText: "Remove from Bus",
      cancelText: "Keep",
      variant: "danger",
    });

    if (!ok) return;

    startTransition(async () => {
      const res = await removeStudentFromBusAction(rosterBusData.id, studentId);
      if (res.error) {
        showToast("error", res.error);
      } else {
        showToast("success", res.message || "Student removed from bus.");
        // Refresh roster view
        const fresh = await getBusDetailAction(rosterBusData.id);
        if (fresh.bus) setRosterBusData(fresh.bus);
        router.refresh();
      }
    });
  };

  // ==========================================
  // MODAL 4: STATUS & QUICK ALERT BROADCAST
  // ==========================================
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [statusBusTarget, setStatusBusTarget] = useState<any | null>(null);
  const [newStatusInput, setNewStatusInput] = useState("RUNNING");
  const [issueTypeInput, setIssueTypeInput] = useState("BREAKDOWN");
  const [issueDescInput, setIssueDescInput] = useState("");

  const handleOpenStatusModal = (bus: any) => {
    setStatusBusTarget(bus);
    setNewStatusInput(bus.status || "RUNNING");
    setIssueTypeInput("BREAKDOWN");
    setIssueDescInput("");
    setIsStatusModalOpen(true);
  };

  const handleSaveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusBusTarget) return;

    if (newStatusInput !== "RUNNING" && !issueDescInput.trim()) {
      showToast("error", "Please provide a reason or description for the issue / delay.");
      return;
    }

    startTransition(async () => {
      const res = await updateBusStatusAction(statusBusTarget.id, {
        status: newStatusInput,
        issueType: newStatusInput === "RUNNING" ? null : issueTypeInput,
        description: issueDescInput.trim() || `Status updated to ${newStatusInput}.`,
      });

      if (res.error) {
        showToast("error", res.error);
      } else {
        showToast(
          "success",
          res.message || (newStatusInput !== "RUNNING" ? "Issue reported! Urgent alert sent to all parents of this bus." : "Bus marked as Running normally.")
        );
        setIsStatusModalOpen(false);
        router.refresh();
      }
    });
  };

  // ==========================================
  // MODAL 5: SEND MESSAGE TO PARENTS
  // ==========================================
  const [isMsgModalOpen, setIsMsgModalOpen] = useState(false);
  const [msgBusTarget, setMsgBusTarget] = useState<any | null>(null);
  const [msgAudienceType, setMsgAudienceType] = useState<"COMMON" | "INDIVIDUAL">("COMMON");
  const [msgTargetStudentIds, setMsgTargetStudentIds] = useState<string[]>([]);
  const [msgTitleInput, setMsgTitleInput] = useState("");
  const [msgContentInput, setMsgContentInput] = useState("");
  const [msgPriorityInput, setMsgPriorityInput] = useState<"NORMAL" | "URGENT">("NORMAL");

  const handleOpenSendMessage = async (bus: any) => {
    setMsgBusTarget(bus);
    setMsgAudienceType("COMMON");
    setMsgTargetStudentIds([]);
    setMsgTitleInput(`Bus ${bus.busNumber} Notice`);
    setMsgContentInput("");
    setMsgPriorityInput("NORMAL");
    setIsMsgModalOpen(true);

    // Fetch fresh student list for individual selection
    const detail = await getBusDetailAction(bus.id);
    if (detail.bus) {
      setMsgBusTarget(detail.bus);
    }
  };

  const recipientCounts = useMemo(() => {
    if (!msgBusTarget?.students) return { students: 0, parents: 0 };
    const dayScholarStudents = (msgBusTarget.students || []).filter(
      (item: any) => item.student && isDayScholarStudent(item.student)
    );
    if (msgAudienceType === "COMMON") {
      const pSet = new Set<string>();
      dayScholarStudents.forEach((item: any) => {
        (item.student?.parents || []).forEach((p: any) => {
          if (p.parent?.userId) pSet.add(p.parent.userId);
        });
      });
      return { students: dayScholarStudents.length, parents: pSet.size };
    } else {
      const pSet = new Set<string>();
      const selSet = new Set(msgTargetStudentIds);
      let studentCount = 0;
      dayScholarStudents.forEach((item: any) => {
        if (selSet.has(item.student?.id)) {
          studentCount++;
          (item.student?.parents || []).forEach((p: any) => {
            if (p.parent?.userId) pSet.add(p.parent.userId);
          });
        }
      });
      return { students: studentCount, parents: pSet.size };
    }
  }, [msgAudienceType, msgBusTarget, msgTargetStudentIds]);

  const handleSendBusMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgBusTarget) return;

    if (!msgTitleInput.trim() || !msgContentInput.trim()) {
      showToast("error", "Message title and content are required.");
      return;
    }

    if (msgAudienceType === "INDIVIDUAL" && msgTargetStudentIds.length === 0) {
      showToast("error", "Please select at least one student for the individual message.");
      return;
    }

    startTransition(async () => {
      const res = await sendBusMessageAction(msgBusTarget.id, {
        type: msgAudienceType,
        targetStudentIds: msgAudienceType === "INDIVIDUAL" ? msgTargetStudentIds : undefined,
        targetStudentId: msgAudienceType === "INDIVIDUAL" ? msgTargetStudentIds[0] : undefined,
        title: msgTitleInput.trim(),
        message: msgContentInput.trim(),
        priority: msgPriorityInput,
      });

      if (res.error) {
        showToast("error", res.error);
      } else {
        showToast("success", res.message || "Message dispatched successfully to parents!");
        setIsMsgModalOpen(false);
        router.refresh();
      }
    });
  };

  // ==========================================
  // FILTERING & METRICS
  // ==========================================
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

  const issueBuses = buses.filter((b) => b.status !== "RUNNING");
  const totalEnrolled = buses.reduce((acc, b) => acc + (b._count?.students || 0), 0);

  return (
    <div style={{ width: "100%", maxWidth: "1400px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.1rem", boxSizing: "border-box" }}>
      {/* Toast Feedback */}
      {feedback && (
        <div
          role="alert"
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            backgroundColor: feedback.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
            color: feedback.type === "success" ? "var(--success)" : "var(--danger)",
            border: `1px solid ${feedback.type === "success" ? "var(--success)" : "var(--danger)"}`,
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            fontSize: "0.9rem",
            fontWeight: 500,
          }}
        >
          {feedback.type === "success" ? <CheckCircle2 size={18} /> : <AlertOctagon size={18} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Active Issues Warning Banner */}
      {issueBuses.length > 0 && (
        <div
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            borderRadius: "10px",
            padding: "0.75rem 1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.6rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span
              style={{
                display: "inline-flex",
                padding: "6px",
                borderRadius: "50%",
                backgroundColor: "rgba(239, 68, 68, 0.2)",
                color: "#ef4444",
              }}
            >
              <AlertTriangle size={20} />
            </span>
            <div>
              <strong style={{ color: "var(--foreground)", fontSize: "0.95rem" }}>
                Active Alerts: {issueBuses.length} Bus{issueBuses.length > 1 ? "es" : ""} with Delays / Issues
              </strong>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                {issueBuses.map((b) => `${b.busNumber}: ${b.status}`).join(" • ")}
              </div>
            </div>
          </div>
          <button
            onClick={() => setStatusFilter("ISSUES")}
            style={{
              padding: "0.4rem 0.8rem",
              borderRadius: "6px",
              backgroundColor: "#ef4444",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.8rem",
            }}
          >
            Filter Issue Buses
          </button>
        </div>
      )}

      {/* COMPACT METRIC STRIP (Database Grounded & Clickable Filters) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))",
          gap: "0.6rem",
        }}
      >
        {/* Card 1: Total Buses */}
        <div
          onClick={() => setStatusFilter("ALL")}
          role="button"
          tabIndex={0}
          title="Filter all buses"
          style={{
            backgroundColor: statusFilter === "ALL" ? "rgba(37, 99, 235, 0.08)" : "var(--card)",
            border: statusFilter === "ALL" ? "1px solid var(--primary)" : "1px solid var(--border)",
            borderRadius: "10px",
            padding: "0.65rem 0.85rem",
            display: "flex",
            alignItems: "center",
            gap: "0.65rem",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              backgroundColor: "rgba(37, 99, 235, 0.12)",
              color: "var(--primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Bus size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.03em" }}>
              Total Buses
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--foreground)", lineHeight: 1.2 }}>
              {summaryMetrics?.totalBuses ?? buses.length}
            </div>
          </div>
        </div>

        {/* Card 2: Running */}
        <div
          onClick={() => setStatusFilter("RUNNING")}
          role="button"
          tabIndex={0}
          title="Filter running buses"
          style={{
            backgroundColor: statusFilter === "RUNNING" ? "rgba(16, 185, 129, 0.08)" : "var(--card)",
            border: statusFilter === "RUNNING" ? "1px solid var(--success)" : "1px solid var(--border)",
            borderRadius: "10px",
            padding: "0.65rem 0.85rem",
            display: "flex",
            alignItems: "center",
            gap: "0.65rem",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              backgroundColor: "rgba(16, 185, 129, 0.12)",
              color: "var(--success)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.03em" }}>
              Running
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--success)", lineHeight: 1.2 }}>
              {summaryMetrics?.runningBuses ?? buses.filter((b) => b.status === "RUNNING").length}
            </div>
          </div>
        </div>

        {/* Card 3: Delays / Issues */}
        <div
          onClick={() => setStatusFilter("ISSUES")}
          role="button"
          tabIndex={0}
          title="Filter delayed and maintenance buses"
          style={{
            backgroundColor: statusFilter === "ISSUES" ? "rgba(239, 68, 68, 0.08)" : "var(--card)",
            border: statusFilter === "ISSUES" ? "1px solid #ef4444" : issueBuses.length > 0 ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid var(--border)",
            borderRadius: "10px",
            padding: "0.65rem 0.85rem",
            display: "flex",
            alignItems: "center",
            gap: "0.65rem",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              backgroundColor: (summaryMetrics?.issuesBuses ?? issueBuses.length) > 0 ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.12)",
              color: (summaryMetrics?.issuesBuses ?? issueBuses.length) > 0 ? "#ef4444" : "var(--warning)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.03em" }}>
              Delays / Issues
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: (summaryMetrics?.issuesBuses ?? issueBuses.length) > 0 ? "#ef4444" : "var(--foreground)", lineHeight: 1.2 }}>
              {summaryMetrics?.issuesBuses ?? issueBuses.length}
            </div>
          </div>
        </div>

        {/* Card 4: Day Scholars on Buses */}
        <div
          title="Day Scholars assigned to buses vs total active Day Scholars"
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            padding: "0.65rem 0.85rem",
            display: "flex",
            alignItems: "center",
            gap: "0.65rem",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              backgroundColor: "rgba(139, 92, 246, 0.12)",
              color: "#8b5cf6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Users size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.03em" }}>
              Day Scholars (Bus)
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--foreground)", lineHeight: 1.2 }}>
              {summaryMetrics ? `${summaryMetrics.dayScholarsOnBuses} / ${summaryMetrics.totalDayScholars}` : `${totalEnrolled}`}
            </div>
          </div>
        </div>

        {/* Card 5: Unassigned Day Scholars */}
        <div
          title="Active Day Scholars not yet assigned to any bus"
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            padding: "0.65rem 0.85rem",
            display: "flex",
            alignItems: "center",
            gap: "0.65rem",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              backgroundColor: (summaryMetrics?.dayScholarsUnassigned ?? 0) > 0 ? "rgba(245, 158, 11, 0.12)" : "rgba(16, 185, 129, 0.12)",
              color: (summaryMetrics?.dayScholarsUnassigned ?? 0) > 0 ? "var(--warning)" : "var(--success)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <UserPlus size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.03em" }}>
              Unassigned Day Scholars
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: (summaryMetrics?.dayScholarsUnassigned ?? 0) > 0 ? "var(--warning)" : "var(--foreground)", lineHeight: 1.2 }}>
              {summaryMetrics?.dayScholarsUnassigned ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* COMPACT SEARCH & FILTER CONTROLS */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.6rem",
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "10px",
          padding: "0.75rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <SearchBar
              placeholder="Search bus no, route, driver, in-charge..."
              value={searchQuery}
              onChange={(val) => setSearchQuery(val)}
              syncWithUrl={false}
            />
          </div>

          <button
            onClick={handleOpenCreateBus}
            style={{
              padding: "0.5rem 0.95rem",
              borderRadius: "8px",
              backgroundColor: "var(--primary)",
              color: "#fff",
              border: "none",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.4rem",
              boxShadow: "0 2px 5px rgba(37, 99, 235, 0.2)",
              flexShrink: 0,
            }}
          >
            <Plus size={16} />
            <span>Create New Bus</span>
          </button>
        </div>

        {/* Status Pills with Horizontal Smooth Touch Scrolling */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            paddingBottom: "2px",
          }}
        >
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600, marginRight: "4px", flexShrink: 0 }}>
            Filter:
          </span>
          {[
            { id: "ALL", label: "ALL" },
            { id: "RUNNING", label: "RUNNING" },
            { id: "DELAYED", label: "DELAYED" },
            { id: "NOT_RUNNING", label: "NOT RUNNING" },
            { id: "MAINTENANCE", label: "MAINTENANCE" },
            { id: "ISSUES", label: "ISSUES" },
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => setStatusFilter(st.id)}
              style={{
                padding: "0.3rem 0.65rem",
                borderRadius: "6px",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
                border: "1px solid var(--border)",
                backgroundColor: statusFilter === st.id ? "var(--primary)" : "transparent",
                color: statusFilter === st.id ? "#fff" : "var(--foreground)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* BUS FLEET GRID ("LIKE CLASSES" PRESENTATION) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: "1.05rem", color: "var(--foreground)", fontWeight: 700 }}>
          School Bus Fleet ({filteredBuses.length})
        </h3>
        <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
          Assign students &amp; manage routes
        </span>
      </div>

      {filteredBuses.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "3rem 1rem",
            backgroundColor: "var(--card)",
            borderRadius: "10px",
            border: "1px solid var(--border)",
          }}
        >
          <Bus size={40} style={{ opacity: 0.25, margin: "0 auto 0.5rem" }} />
          <h4 style={{ margin: "0 0 0.3rem 0", color: "var(--foreground)" }}>No Buses Found</h4>
          <p style={{ margin: "0 auto 1rem", color: "var(--text-secondary)", fontSize: "0.85rem", maxWidth: "340px" }}>
            No school buses match your search. Create a new bus to begin assigning Day Scholar students.
          </p>
          <button
            onClick={handleOpenCreateBus}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "6px",
              backgroundColor: "var(--primary)",
              color: "#fff",
              border: "none",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <Plus size={16} /> Create Bus
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 330px), 1fr))",
            gap: "1rem",
          }}
        >
          {filteredBuses.map((bus) => {
            const assigned = bus._count?.students || 0;
            const capacity = bus.capacity || 40;
            const percent = Math.min(100, Math.round((assigned / capacity) * 100));
            const availableSeats = Math.max(0, capacity - assigned);

            const isRunning = bus.status === "RUNNING";
            const isDelayed = bus.status === "DELAYED";

            return (
              <div
                key={bus.id}
                style={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  padding: "1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.85rem",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
                  transition: "border-color 0.15s ease",
                }}
              >
                {/* Card Header: Bus Badge, Status, Route */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                  <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
                    <div
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "8px",
                        backgroundColor: "rgba(37, 99, 235, 0.1)",
                        color: "var(--primary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Bus size={20} />
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--foreground)" }}>
                          {bus.busNumber}
                        </span>
                        <span
                          style={{
                            fontSize: "0.72rem",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            backgroundColor: "rgba(0,0,0,0.06)",
                            fontFamily: "monospace",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {bus.registrationNo}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "var(--foreground)", fontWeight: 500, marginTop: "2px" }}>
                        {bus.name}
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span
                    style={{
                      padding: "3px 8px",
                      borderRadius: "6px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      backgroundColor: isRunning
                        ? "rgba(16, 185, 129, 0.15)"
                        : isDelayed
                        ? "rgba(245, 158, 11, 0.18)"
                        : "rgba(239, 68, 68, 0.18)",
                      color: isRunning ? "var(--success)" : isDelayed ? "#f59e0b" : "#ef4444",
                      border: `1px solid ${
                        isRunning ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"
                      }`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {bus.status.replace("_", " ")}
                  </span>
                </div>

                {/* Capacity Progress Bar */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                    <span style={{ color: "var(--text-secondary)" }}>
                      Day Scholars: <strong>{assigned}</strong> / {capacity} seats
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        color: availableSeats === 0 ? "var(--danger)" : availableSeats <= 5 ? "var(--warning)" : "var(--success)",
                      }}
                    >
                      {availableSeats === 0 ? "Bus Full" : `${availableSeats} seats left`}
                    </span>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: "6px",
                      borderRadius: "3px",
                      backgroundColor: "rgba(0,0,0,0.06)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${percent}%`,
                        height: "100%",
                        backgroundColor:
                          percent >= 90 ? "#ef4444" : percent >= 75 ? "#f59e0b" : "#10b981",
                        borderRadius: "3px",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                </div>

                {/* Quick Details Block: In-Charge & Driver */}
                <div
                  style={{
                    backgroundColor: "rgba(0,0,0,0.02)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "0.6rem 0.75rem",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.5rem",
                    fontSize: "0.8rem",
                  }}
                >
                  <div>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.72rem", marginBottom: "1px" }}>
                      Staff In-Charge
                    </div>
                    <div style={{ fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {bus.inChargeStaff?.user?.name || "Unassigned"}
                    </div>
                    {bus.inChargeStaff?.phone && (
                      <a
                        href={`tel:${bus.inChargeStaff.phone}`}
                        style={{ color: "var(--primary)", fontSize: "0.74rem", textDecoration: "none" }}
                      >
                        {bus.inChargeStaff.phone}
                      </a>
                    )}
                  </div>

                  <div>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.72rem", marginBottom: "1px" }}>
                      Driver
                    </div>
                    <div style={{ fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {bus.driverName}
                    </div>
                    {bus.driverPhone && (
                      <a
                        href={`tel:${bus.driverPhone}`}
                        style={{ color: "var(--primary)", fontSize: "0.74rem", textDecoration: "none" }}
                      >
                        {bus.driverPhone}
                      </a>
                    )}
                  </div>
                </div>

                {/* ACTION BUTTONS (USER-FRIENDLY ADMIN CONTROLS) */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.45rem",
                    paddingTop: "0.75rem",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  {/* Primary Row: Add Students, View Roster, Message Parents */}
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.15fr 1.25fr", gap: "0.35rem" }}>
                    <button
                      type="button"
                      onClick={() => handleOpenAssignStudents(bus)}
                      style={{
                        padding: "0.5rem 0.35rem",
                        borderRadius: "7px",
                        backgroundColor: "var(--primary)",
                        color: "#fff",
                        border: "none",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.25rem",
                        boxShadow: "0 1px 3px rgba(37, 99, 235, 0.2)",
                      }}
                      title="Add Day Scholar Students to this bus"
                    >
                      <UserPlus size={14} />
                      <span>+ Add</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenRoster(bus)}
                      style={{
                        padding: "0.5rem 0.35rem",
                        borderRadius: "7px",
                        backgroundColor: "rgba(37, 99, 235, 0.08)",
                        color: "var(--primary)",
                        border: "1px solid rgba(37, 99, 235, 0.2)",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.25rem",
                      }}
                      title="View & Delete Individual Enrolled Students"
                    >
                      <Users size={14} />
                      <span>Roster ({assigned})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenSendMessage(bus)}
                      style={{
                        padding: "0.5rem 0.35rem",
                        borderRadius: "7px",
                        backgroundColor: "rgba(139, 92, 246, 0.09)",
                        color: "#8b5cf6",
                        border: "1px solid rgba(139, 92, 246, 0.25)",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.25rem",
                      }}
                      title="Send Announcement / Notice to Bus Student Parents"
                    >
                      <Send size={13} />
                      <span>Message</span>
                    </button>
                  </div>

                  {/* Secondary Row: Status, Edit Bus, Delete Bus */}
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.15fr 1fr", gap: "0.35rem" }}>
                    <button
                      type="button"
                      onClick={() => handleOpenStatusModal(bus)}
                      style={{
                        padding: "0.45rem 0.35rem",
                        borderRadius: "7px",
                        backgroundColor: isRunning ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.1)",
                        color: isRunning ? "var(--success)" : "#ef4444",
                        border: `1px solid ${isRunning ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.3)"}`,
                        fontSize: "0.76rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.25rem",
                      }}
                      title="Update Operational Status & Broadcast Delays/Issues"
                    >
                      <AlertTriangle size={13} />
                      <span>Status</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEditBus(bus)}
                      style={{
                        padding: "0.45rem 0.35rem",
                        borderRadius: "7px",
                        backgroundColor: "rgba(0,0,0,0.03)",
                        color: "var(--foreground)",
                        border: "1px solid var(--border)",
                        fontSize: "0.76rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.25rem",
                      }}
                      title="Edit Bus Details (Route, Driver, In-Charge, Capacity)"
                    >
                      <Edit size={13} />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteBus(bus)}
                      style={{
                        padding: "0.45rem 0.35rem",
                        borderRadius: "7px",
                        backgroundColor: "rgba(239, 68, 68, 0.06)",
                        color: "var(--danger)",
                        border: "1px solid rgba(239, 68, 68, 0.25)",
                        fontSize: "0.76rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.25rem",
                      }}
                      title="Delete this Bus"
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: CREATE / EDIT BUS                                */}
      {/* ======================================================== */}
      <Modal
        isOpen={isBusModalOpen}
        onClose={() => setIsBusModalOpen(false)}
        title={editingBusId ? `Edit Bus ${busNumber}` : "Create New School Bus"}
      >
        <form onSubmit={handleSaveBus} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "3px" }}>
                Bus Number *
              </label>
              <input
                type="text"
                value={busNumber}
                onChange={(e) => setBusNumber(e.target.value)}
                placeholder="BUS-01"
                required
                style={{
                  width: "100%",
                  padding: "0.5rem",
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
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "3px" }}>
                Registration No *
              </label>
              <input
                type="text"
                value={registrationNo}
                onChange={(e) => setRegistrationNo(e.target.value)}
                placeholder="TN 01 AB 1234"
                required
                style={{
                  width: "100%",
                  padding: "0.5rem",
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

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.6rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "3px" }}>
                Route Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="North Express - Anna Nagar Route"
                required
                style={{
                  width: "100%",
                  padding: "0.5rem",
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
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "3px" }}>
                Capacity (Seats) *
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                required
                style={{
                  width: "100%",
                  padding: "0.5rem",
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "3px" }}>
                Driver Name *
              </label>
              <input
                type="text"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="R. Murugan"
                required
                style={{
                  width: "100%",
                  padding: "0.5rem",
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
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "3px" }}>
                Driver Phone *
              </label>
              <input
                type="text"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                placeholder="+91 98450 12345"
                required
                style={{
                  width: "100%",
                  padding: "0.5rem",
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
              <DateOfBirthField
                name="driverDob"
                label="Driver Date of Birth"
                value={driverDob}
                onChange={setDriverDob}
                required={false}
                role="DRIVER"
                helperText="Required for driver birthday wishes."
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "3px" }}>
              Staff In-Charge
            </label>
            <select
              value={inChargeStaffId}
              onChange={(e) => setInChargeStaffId(e.target.value)}
              style={{
                width: "100%",
                padding: "0.5rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                color: "var(--foreground)",
                fontSize: "0.85rem",
                boxSizing: "border-box",
              }}
            >
              <option value="">-- Select Active Staff In-Charge --</option>
              {allStaff.map((st: any) => (
                <option key={st.id} value={st.id}>
                  {st.user?.name || "Staff"} {st.phone ? `(${st.phone})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "3px" }}>
              Route &amp; Major Stops
            </label>
            <textarea
              rows={2}
              value={routeDescription}
              onChange={(e) => setRouteDescription(e.target.value)}
              placeholder="Central Campus -> Anna Nagar Roundtana -> Thirumangalam -> Koyambedu"
              style={{
                width: "100%",
                padding: "0.5rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                color: "var(--foreground)",
                fontSize: "0.85rem",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", marginTop: "0.5rem" }}>
            <button
              type="button"
              onClick={() => setIsBusModalOpen(false)}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "transparent",
                color: "var(--foreground)",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              style={{
                padding: "0.5rem 1.25rem",
                borderRadius: "6px",
                backgroundColor: "var(--primary)",
                color: "#fff",
                border: "none",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: isPending ? "not-allowed" : "pointer",
              }}
            >
              {isPending ? "Saving..." : editingBusId ? "Update Bus" : "Save Bus & Add Students"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL 2: ADD DAY SCHOLAR STUDENTS (CLASS-WISE FIRST)       */}
      {/* ======================================================== */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title={
          targetBusForAssign
            ? `Add Day Scholars: ${targetBusForAssign.busNumber} (${Math.max(0, targetBusForAssign.capacity - (targetBusForAssign._count?.students || 0))} seats left)`
            : "Add Day Scholar Students"
        }
      >
        <form onSubmit={handleSaveStudentAssignments} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          {/* STEP 1: CLASS-WISE OPTIONS FIRST */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
              <label style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--foreground)" }}>
                Step 1: Filter by Class
              </label>
              <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                {allAvailableStudents.length} Active Day Scholar{allAvailableStudents.length === 1 ? "" : "s"}
              </span>
            </div>

            {/* Class Selection Pills / Grid */}
            <div
              style={{
                display: "flex",
                gap: "0.35rem",
                overflowX: "auto",
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
                paddingBottom: "4px",
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedClassId("ALL")}
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: "6px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "1px solid var(--border)",
                  backgroundColor: selectedClassId === "ALL" ? "var(--primary)" : "transparent",
                  color: selectedClassId === "ALL" ? "#fff" : "var(--foreground)",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                All Classes ({allAvailableStudents.length})
              </button>

              {classes.map((cls) => {
                const count = allAvailableStudents.filter((s) => s.classObjId === cls.id).length;
                const isSelected = selectedClassId === cls.id;

                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => setSelectedClassId(cls.id)}
                    style={{
                      padding: "0.35rem 0.75rem",
                      borderRadius: "6px",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      border: isSelected ? "1px solid var(--primary)" : "1px solid var(--border)",
                      backgroundColor: isSelected ? "var(--primary)" : "transparent",
                      color: isSelected ? "#fff" : "var(--foreground)",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <span>{cls.name} - {cls.section}</span>
                    <span
                      style={{
                        padding: "1px 5px",
                        borderRadius: "10px",
                        fontSize: "0.68rem",
                        backgroundColor: isSelected ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.06)",
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 2: SEARCH & STUDENT LIST */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
                <input
                  type="text"
                  value={studentSearchQuery}
                  onChange={(e) => setStudentSearchQuery(e.target.value)}
                  placeholder="Filter student name, roll or admission no..."
                  style={{
                    width: "100%",
                    padding: "0.4rem 0.5rem 0.4rem 1.8rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--card)",
                    color: "var(--foreground)",
                    fontSize: "0.8rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {availableStudentsList.filter((s) => !s.isAssigned).length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllInClass}
                  style={{
                    padding: "0.4rem 0.75rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    backgroundColor: "rgba(0,0,0,0.03)",
                    color: "var(--foreground)",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  Select All Available
                </button>
              )}
            </div>

            {/* Student Checkbox List */}
            <div
              style={{
                maxHeight: "220px",
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "0.4rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.3rem",
                backgroundColor: "rgba(0,0,0,0.01)",
              }}
            >
              {availableStudentsList.length === 0 ? (
                <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                  No students found.
                </div>
              ) : (
                availableStudentsList.map((st) => {
                  const isSelected = selectedStudentIds.includes(st.id);
                  const isAssigned = st.isAssigned;

                  return (
                    <div
                      key={st.id}
                      onClick={() => toggleStudentSelection(st)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        padding: "0.45rem 0.65rem",
                        borderRadius: "6px",
                        border: isSelected ? "1px solid var(--primary)" : "1px solid var(--border)",
                        backgroundColor: isSelected ? "rgba(37, 99, 235, 0.08)" : isAssigned ? "rgba(0,0,0,0.02)" : "var(--card)",
                        cursor: isAssigned ? "not-allowed" : "pointer",
                        opacity: isAssigned ? 0.65 : 1,
                        fontSize: "0.82rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isAssigned}
                        onChange={() => {}}
                        style={{ cursor: isAssigned ? "not-allowed" : "pointer" }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
                            {st.firstName} {st.lastName}
                          </span>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                            ({st.className} • Roll: {st.rollNumber})
                          </span>
                          <span
                            style={{
                              fontSize: "0.68rem",
                              padding: "1px 5px",
                              borderRadius: "4px",
                              backgroundColor: "rgba(16, 185, 129, 0.12)",
                              color: "var(--success)",
                              fontWeight: 600,
                            }}
                          >
                            Day Scholar
                          </span>
                        </div>
                      </div>

                      {isAssigned ? (
                        <span
                          style={{
                            fontSize: "0.7rem",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            backgroundColor: "rgba(245, 158, 11, 0.15)",
                            color: "#f59e0b",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Assigned to Bus {st.assignedBusNumber}
                        </span>
                      ) : (
                        <span style={{ fontSize: "0.7rem", color: "var(--success)", fontWeight: 500, whiteSpace: "nowrap" }}>
                          Available
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* STEP 3: PICKUP & DROP LANDMARKS */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.74rem", color: "var(--text-secondary)", marginBottom: "2px" }}>
                Pickup Point Landmark
              </label>
              <input
                type="text"
                value={pickupPointInput}
                onChange={(e) => setPickupPointInput(e.target.value)}
                placeholder="e.g. West Campus Gate (07:30 AM)"
                style={{
                  width: "100%",
                  padding: "0.4rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  fontSize: "0.8rem",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.74rem", color: "var(--text-secondary)", marginBottom: "2px" }}>
                Drop Point Landmark
              </label>
              <input
                type="text"
                value={dropPointInput}
                onChange={(e) => setDropPointInput(e.target.value)}
                placeholder="e.g. West Campus Gate (04:15 PM)"
                style={{
                  width: "100%",
                  padding: "0.4rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  fontSize: "0.8rem",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* STEP 4: SUBMIT BAR */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: "0.5rem",
              borderTop: "1px solid var(--border)",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div style={{ fontSize: "0.8rem" }}>
              Selected: <strong style={{ color: "var(--primary)" }}>{selectedStudentIds.length}</strong> Day Scholar(s)
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                style={{
                  padding: "0.45rem 0.85rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "transparent",
                  color: "var(--foreground)",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || selectedStudentIds.length === 0}
                style={{
                  padding: "0.45rem 1.1rem",
                  borderRadius: "6px",
                  backgroundColor: "var(--primary)",
                  color: "#fff",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "0.82rem",
                  cursor: isPending || selectedStudentIds.length === 0 ? "not-allowed" : "pointer",
                  opacity: selectedStudentIds.length === 0 ? 0.6 : 1,
                }}
              >
                {isPending ? "Assigning..." : `Add ${selectedStudentIds.length} to Bus`}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL 3: VIEW & MANAGE ROSTER                             */}
      {/* ======================================================== */}
      <Modal
        isOpen={isRosterModalOpen}
        onClose={() => setIsRosterModalOpen(false)}
        title={rosterBusData ? `Enrolled Day Scholars: ${rosterBusData.busNumber} (${rosterBusData.name})` : "Bus Roster"}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {/* Top action bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.5rem 0.75rem",
              borderRadius: "8px",
              backgroundColor: "rgba(37, 99, 235, 0.06)",
              border: "1px solid rgba(37, 99, 235, 0.15)",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--foreground)" }}>
              Enrolled: <span style={{ color: "var(--primary)" }}>{rosterBusData?.students?.length || 0}</span> Day Scholar(s)
            </div>
            {rosterBusData && (
              <button
                type="button"
                onClick={() => {
                  setIsRosterModalOpen(false);
                  handleOpenAssignStudents(rosterBusData);
                }}
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: "6px",
                  backgroundColor: "var(--primary)",
                  color: "#fff",
                  border: "none",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                <UserPlus size={13} />
                <span>+ Add More Students</span>
              </button>
            )}
          </div>

          {/* Search bar inside Roster */}
          {rosterBusData?.students && rosterBusData.students.length > 0 && (
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
              <input
                type="text"
                value={rosterSearchQuery}
                onChange={(e) => setRosterSearchQuery(e.target.value)}
                placeholder="Search roster by student name, roll or class..."
                style={{
                  width: "100%",
                  padding: "0.4rem 0.5rem 0.4rem 1.8rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  fontSize: "0.8rem",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}

          {isLoadingRoster ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              Loading student roster...
            </div>
          ) : !rosterBusData?.students || rosterBusData.students.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              No students currently assigned to this bus. Click "+ Add More Students" above to enroll Day Scholars.
            </div>
          ) : (
            <div style={{ maxHeight: "360px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              {rosterBusData.students
                .filter((item: any) => {
                  const s = item.student;
                  if (!s || !isDayScholarStudent(s)) return false;
                  if (!rosterSearchQuery.trim()) return true;
                  const q = rosterSearchQuery.toLowerCase();
                  const name = `${s.firstName} ${s.lastName}`.toLowerCase();
                  const roll = (s.rollNumber || "").toLowerCase();
                  const cls = s.class ? `${s.class.name} ${s.class.section}`.toLowerCase() : "";
                  return name.includes(q) || roll.includes(q) || cls.includes(q);
                })
                .map((item: any) => {
                  const student = item.student;
                  if (!student) return null;
                  const isEditingThis = editingLandmarkId === item.id;
                  const parentPhone = student.parents?.[0]?.parent?.phone || student.parents?.[0]?.parent?.alternatePhone;

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.4rem",
                        padding: "0.65rem 0.75rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        backgroundColor: "var(--card)",
                        fontSize: "0.82rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0 }}>
                          <div
                            style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "50%",
                              backgroundColor: "rgba(37, 99, 235, 0.12)",
                              color: "var(--primary)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              fontSize: "0.75rem",
                              flexShrink: 0,
                            }}
                          >
                            {student.firstName[0]}
                            {student.lastName[0] || ""}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {student.firstName} {student.lastName}
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "1px", display: "flex", alignItems: "center", gap: "0.3rem", flexWrap: "wrap" }}>
                              <span>{student.class ? `${student.class.name} - ${student.class.section}` : "Class"}</span>
                              <span>•</span>
                              <span>Roll: {student.rollNumber}</span>
                              {parentPhone && (
                                <>
                                  <span>•</span>
                                  <a href={`tel:${parentPhone}`} style={{ color: "var(--primary)", textDecoration: "none" }}>
                                    📞 {parentPhone}
                                  </a>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveStudentFromRoster(student.id, `${student.firstName} ${student.lastName}`)}
                          style={{
                            padding: "0.35rem 0.65rem",
                            borderRadius: "6px",
                            backgroundColor: "rgba(239, 68, 68, 0.08)",
                            color: "var(--danger)",
                            border: "1px solid rgba(239, 68, 68, 0.25)",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                            flexShrink: 0,
                          }}
                          title="Remove this student from bus"
                        >
                          <Trash2 size={13} />
                          <span>Remove</span>
                        </button>
                      </div>

                      {/* Route landmarks view or edit */}
                      {isEditingThis ? (
                        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap", paddingTop: "0.3rem", borderTop: "1px dashed var(--border)" }}>
                          <input
                            type="text"
                            value={pickupLandmarkInput}
                            onChange={(e) => setPickupLandmarkInput(e.target.value)}
                            placeholder="Pickup Landmark (e.g. Main Gate)"
                            style={{
                              flex: "1 1 140px",
                              padding: "0.3rem 0.5rem",
                              borderRadius: "4px",
                              border: "1px solid var(--border)",
                              backgroundColor: "var(--background)",
                              color: "var(--foreground)",
                              fontSize: "0.75rem",
                            }}
                          />
                          <input
                            type="text"
                            value={dropLandmarkInput}
                            onChange={(e) => setDropLandmarkInput(e.target.value)}
                            placeholder="Drop Landmark (e.g. Bus Stand)"
                            style={{
                              flex: "1 1 140px",
                              padding: "0.3rem 0.5rem",
                              borderRadius: "4px",
                              border: "1px solid var(--border)",
                              backgroundColor: "var(--background)",
                              color: "var(--foreground)",
                              fontSize: "0.75rem",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveLandmarks(item.id)}
                            disabled={isUpdatingLandmarks}
                            style={{
                              padding: "0.3rem 0.6rem",
                              borderRadius: "4px",
                              backgroundColor: "var(--primary)",
                              color: "#fff",
                              border: "none",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              cursor: isUpdatingLandmarks ? "not-allowed" : "pointer",
                            }}
                          >
                            {isUpdatingLandmarks ? "Saving..." : "Save Route"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingLandmarkId(null)}
                            style={{
                              padding: "0.3rem 0.5rem",
                              borderRadius: "4px",
                              border: "1px solid var(--border)",
                              backgroundColor: "transparent",
                              color: "var(--foreground)",
                              fontSize: "0.75rem",
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.4rem", paddingTop: "0.3rem", borderTop: "1px dashed var(--border)", fontSize: "0.74rem", color: "var(--text-secondary)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                            <span>📍 Pickup: <strong style={{ color: "var(--foreground)" }}>{item.pickupPoint || "Default Route"}</strong></span>
                            <span>•</span>
                            <span>🏁 Drop: <strong style={{ color: "var(--foreground)" }}>{item.dropPoint || "Default Route"}</strong></span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleStartEditLandmarks(item)}
                            style={{
                              padding: "2px 6px",
                              borderRadius: "4px",
                              border: "1px solid var(--border)",
                              backgroundColor: "transparent",
                              color: "var(--primary)",
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px",
                            }}
                          >
                            <Edit size={11} />
                            <span>Edit Landmark</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "0.5rem", borderTop: "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={() => setIsRosterModalOpen(false)}
              style={{
                padding: "0.45rem 1rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "transparent",
                color: "var(--foreground)",
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL 4: STATUS & QUICK ISSUE ALERT                       */}
      {/* ======================================================== */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title={statusBusTarget ? `Update Status: ${statusBusTarget.busNumber}` : "Update Status"}
      >
        <form onSubmit={handleSaveStatus} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "4px" }}>
              Operational Status
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
              {["RUNNING", "DELAYED", "NOT_RUNNING", "MAINTENANCE"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setNewStatusInput(st)}
                  style={{
                    padding: "0.5rem",
                    borderRadius: "6px",
                    border: newStatusInput === st ? "2px solid var(--primary)" : "1px solid var(--border)",
                    backgroundColor: newStatusInput === st ? "rgba(37, 99, 235, 0.1)" : "transparent",
                    color: newStatusInput === st ? "var(--primary)" : "var(--foreground)",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {st.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          {newStatusInput !== "RUNNING" && (
            <div
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "8px",
                padding: "0.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
              }}
            >
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "3px" }}>
                  Issue Classification
                </label>
                <select
                  value={issueTypeInput}
                  onChange={(e) => setIssueTypeInput(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.4rem",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--card)",
                    color: "var(--foreground)",
                    fontSize: "0.8rem",
                  }}
                >
                  <option value="BREAKDOWN">Breakdown / Mechanical Failure</option>
                  <option value="TRAFFIC">Heavy Traffic / Congestion</option>
                  <option value="ACCIDENT">Road Incident / Accident</option>
                  <option value="LATE">Departure Delayed</option>
                  <option value="ROUTE_CHANGE">Road Closure / Route Diversion</option>
                  <option value="OTHER">Other Transit Issue</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "3px" }}>
                  Description &amp; Delay Notice (Will be alerted to parents) *
                </label>
                <textarea
                  rows={2}
                  value={issueDescInput}
                  onChange={(e) => setIssueDescInput(e.target.value)}
                  placeholder="e.g. Bus had flat tire near Roundtana. Replacement vehicle arriving in 15 mins."
                  required
                  style={{
                    width: "100%",
                    padding: "0.4rem",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--card)",
                    color: "var(--foreground)",
                    fontSize: "0.8rem",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.72rem", color: "#ef4444" }}>
                <ShieldAlert size={14} />
                <span>Urgent push notification will be instantly sent to all parents on this bus.</span>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() => setIsStatusModalOpen(false)}
              style={{
                padding: "0.45rem 0.85rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "transparent",
                color: "var(--foreground)",
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              style={{
                padding: "0.45rem 1.1rem",
                borderRadius: "6px",
                backgroundColor: newStatusInput === "RUNNING" ? "var(--primary)" : "#ef4444",
                color: "#fff",
                border: "none",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: isPending ? "not-allowed" : "pointer",
              }}
            >
              {isPending ? "Updating..." : "Update & Alert Parents"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL 5: SEND MESSAGE TO PARENTS                        */}
      {/* ======================================================== */}
      <Modal
        isOpen={isMsgModalOpen}
        onClose={() => setIsMsgModalOpen(false)}
        title={msgBusTarget ? `Send Notice to Parents • Bus ${msgBusTarget.busNumber}` : "Send Bus Notice"}
      >
        <form onSubmit={handleSendBusMessage} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <div
            style={{
              padding: "0.6rem 0.75rem",
              borderRadius: "8px",
              backgroundColor: "rgba(37, 99, 235, 0.08)",
              border: "1px solid rgba(37, 99, 235, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "0.82rem",
            }}
          >
            <div>
              <strong style={{ color: "var(--foreground)" }}>Bus {msgBusTarget?.busNumber}</strong> ({msgBusTarget?.name})
              <div style={{ color: "var(--text-secondary)", fontSize: "0.74rem" }}>
                Driver: {msgBusTarget?.driverName} • In-Charge: {msgBusTarget?.inChargeStaff?.user?.name || "Staff Member"}
              </div>
            </div>
            <span
              style={{
                fontSize: "0.72rem",
                padding: "2px 8px",
                borderRadius: "12px",
                backgroundColor: "var(--primary)",
                color: "#fff",
                fontWeight: 600,
              }}
            >
              {msgBusTarget?._count?.students ?? msgBusTarget?.students?.length ?? 0} Enrolled
            </span>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "4px" }}>
              Message Audience
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
              <button
                type="button"
                onClick={() => setMsgAudienceType("COMMON")}
                style={{
                  padding: "0.5rem",
                  borderRadius: "6px",
                  border: msgAudienceType === "COMMON" ? "2px solid var(--primary)" : "1px solid var(--border)",
                  backgroundColor: msgAudienceType === "COMMON" ? "rgba(37, 99, 235, 0.1)" : "transparent",
                  color: msgAudienceType === "COMMON" ? "var(--primary)" : "var(--foreground)",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Broadcast (All Bus Parents)
              </button>
              <button
                type="button"
                onClick={() => setMsgAudienceType("INDIVIDUAL")}
                style={{
                  padding: "0.5rem",
                  borderRadius: "6px",
                  border: msgAudienceType === "INDIVIDUAL" ? "2px solid var(--primary)" : "1px solid var(--border)",
                  backgroundColor: msgAudienceType === "INDIVIDUAL" ? "rgba(37, 99, 235, 0.1)" : "transparent",
                  color: msgAudienceType === "INDIVIDUAL" ? "var(--primary)" : "var(--foreground)",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Specific Student's Parents
              </button>
            </div>
          </div>

          {msgAudienceType === "INDIVIDUAL" && (
            <div>
              <MultiSelect
                label="Select Student(s) on this Bus *"
                placeholder="Choose one or more students..."
                searchPlaceholder="Search by student name or roll..."
                options={(msgBusTarget?.students || [])
                  .filter((item: any) => item.student && isDayScholarStudent(item.student))
                  .map((item: any) => {
                    const s = item.student;
                    return {
                      value: s.id,
                      label: `${s.firstName} ${s.lastName}`,
                      subLabel: `Roll: ${s.rollNumber} • ${s.class ? `${s.class.name} - ${s.class.section}` : "Class"}`,
                      badge: item.pickupPoint ? `📍 ${item.pickupPoint}` : undefined,
                    };
                  })}
                value={msgTargetStudentIds}
                onChange={setMsgTargetStudentIds}
                required
              />

              {/* Recipient Preview */}
              {msgTargetStudentIds.length > 0 && (
                <div
                  style={{
                    marginTop: "0.4rem",
                    padding: "0.4rem 0.65rem",
                    borderRadius: "6px",
                    backgroundColor: "rgba(37, 99, 235, 0.08)",
                    border: "1px solid rgba(37, 99, 235, 0.2)",
                    fontSize: "0.76rem",
                    color: "var(--primary)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                >
                  <Users size={13} />
                  <span>
                    Recipient Preview: <strong>{recipientCounts.students}</strong> student{recipientCounts.students === 1 ? "" : "s"} selected • <strong>{recipientCounts.parents}</strong> unique parent account{recipientCounts.parents === 1 ? "" : "s"} will be notified.
                  </span>
                </div>
              )}
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "4px" }}>
              Priority Level
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
              <button
                type="button"
                onClick={() => setMsgPriorityInput("NORMAL")}
                style={{
                  padding: "0.45rem",
                  borderRadius: "6px",
                  border: msgPriorityInput === "NORMAL" ? "2px solid var(--primary)" : "1px solid var(--border)",
                  backgroundColor: msgPriorityInput === "NORMAL" ? "rgba(37, 99, 235, 0.1)" : "transparent",
                  color: msgPriorityInput === "NORMAL" ? "var(--primary)" : "var(--foreground)",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Normal Notice
              </button>
              <button
                type="button"
                onClick={() => setMsgPriorityInput("URGENT")}
                style={{
                  padding: "0.45rem",
                  borderRadius: "6px",
                  border: msgPriorityInput === "URGENT" ? "2px solid #ef4444" : "1px solid var(--border)",
                  backgroundColor: msgPriorityInput === "URGENT" ? "rgba(239, 68, 68, 0.12)" : "transparent",
                  color: msgPriorityInput === "URGENT" ? "#ef4444" : "var(--foreground)",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🚨 Urgent Alert
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "4px" }}>
              Subject / Title *
            </label>
            <input
              type="text"
              value={msgTitleInput}
              onChange={(e) => setMsgTitleInput(e.target.value)}
              placeholder="e.g. Schedule Update / Route Notice"
              required
              style={{
                width: "100%",
                padding: "0.45rem 0.6rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                color: "var(--foreground)",
                fontSize: "0.82rem",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "4px" }}>
              Notice Message *
            </label>
            <textarea
              rows={3}
              value={msgContentInput}
              onChange={(e) => setMsgContentInput(e.target.value)}
              placeholder="Write the message that will be dispatched to parent notifications and portal..."
              required
              style={{
                width: "100%",
                padding: "0.45rem 0.6rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                color: "var(--foreground)",
                fontSize: "0.82rem",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>

          <div
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "6px",
              backgroundColor: "rgba(16, 185, 129, 0.08)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              color: "var(--success)",
              fontSize: "0.74rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <Bell size={14} />
            <span>Connected to parent notification database with immediate alert notification.</span>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", paddingTop: "0.4rem", borderTop: "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={() => setIsMsgModalOpen(false)}
              style={{
                padding: "0.45rem 0.85rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "transparent",
                color: "var(--foreground)",
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || (msgAudienceType === "INDIVIDUAL" && msgTargetStudentIds.length === 0)}
              style={{
                padding: "0.45rem 1.1rem",
                borderRadius: "6px",
                backgroundColor: msgPriorityInput === "URGENT" ? "#ef4444" : "var(--primary)",
                color: "#fff",
                border: "none",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: isPending || (msgAudienceType === "INDIVIDUAL" && msgTargetStudentIds.length === 0) ? "not-allowed" : "pointer",
                opacity: isPending || (msgAudienceType === "INDIVIDUAL" && msgTargetStudentIds.length === 0) ? 0.6 : 1,
              }}
            >
              {isPending ? "Sending..." : "Dispatch to Parents"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
