"use client";

import React, { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bus,
  AlertTriangle,
  Clock,
  Users,
  Phone,
  Send,
  CheckCircle2,
  AlertOctagon,
  Bell,
  MapPin,
  ShieldAlert,
  Info,
} from "lucide-react";
import {
  updateBusStatusAction,
  sendBusMessageAction,
} from "@/backend/api/actions/dashboard/admin/transport/actions";
import { MultiSelect } from "@/frontend/components/ui";

interface StaffMyBusClientProps {
  buses: any[];
  staffName: string;
}

export default function StaffMyBusClient({ buses: initialBuses, staffName }: StaffMyBusClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [buses, setBuses] = useState<any[]>(initialBuses || []);
  const [selectedBusIndex, setSelectedBusIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<"STATUS" | "MESSAGES" | "STUDENTS" | "LOGS">("STATUS");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  const currentBus = (buses && buses.length > 0) ? (buses[selectedBusIndex] || buses[0]) : null;

  // ==========================================
  // STATUS UPDATE & ISSUE REPORTING
  // ==========================================
  const [statusInput, setStatusInput] = useState<string>(currentBus?.status || "RUNNING");
  const [issueTypeInput, setIssueTypeInput] = useState<string>("BREAKDOWN");
  const [issueDescriptionInput, setIssueDescriptionInput] = useState("");

  const handleUpdateStatus = async (newStatus?: string) => {
    const targetStatus = newStatus || statusInput;

    if (targetStatus !== "RUNNING" && !issueDescriptionInput.trim()) {
      showToast("error", "Please provide a description explaining the issue or delay cause.");
      return;
    }

    startTransition(async () => {
      const res = await updateBusStatusAction(currentBus!.id, {
        status: targetStatus,
        issueType: targetStatus === "RUNNING" ? null : issueTypeInput,
        description: issueDescriptionInput.trim() || `Bus status marked as ${targetStatus}.`,
      });

      if (res.error) {
        showToast("error", res.error);
      } else {
        showToast("success", res.message || "Bus status updated successfully.");
        setIssueDescriptionInput("");
        router.refresh();
      }
    });
  };

  // ==========================================
  // SEND MESSAGE (COMMON / INDIVIDUAL)
  // ==========================================
  const [messageType, setMessageType] = useState<"COMMON" | "INDIVIDUAL">("COMMON");
  const [targetStudentIds, setTargetStudentIds] = useState<string[]>([]);
  const [messageTitle, setMessageTitle] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [messagePriority, setMessagePriority] = useState<"NORMAL" | "URGENT">("NORMAL");

  // Recipient Count Preview
  const previewRecipientCounts = useMemo(() => {
    if (!currentBus?.students) return { students: 0, parents: 0 };
    if (messageType === "COMMON") {
      const pIds = new Set<string>();
      (currentBus?.students || []).forEach((item: any) => {
        (item.student?.parents || []).forEach((p: any) => {
          if (p.parent?.user?.id) pIds.add(p.parent.user.id);
        });
      });
      return { students: (currentBus?.students || []).length, parents: pIds.size };
    } else {
      const pIds = new Set<string>();
      const selSet = new Set(targetStudentIds);
      let count = 0;
      (currentBus?.students || []).forEach((item: any) => {
        if (selSet.has(item.student?.id)) {
          count++;
          (item.student?.parents || []).forEach((p: any) => {
            if (p.parent?.user?.id) pIds.add(p.parent.user.id);
          });
        }
      });
      return { students: count, parents: pIds.size };
    }
  }, [currentBus, messageType, targetStudentIds]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageTitle.trim() || !messageContent.trim()) {
      showToast("error", "Title and message content are required.");
      return;
    }
    if (messageType === "INDIVIDUAL" && targetStudentIds.length === 0) {
      showToast("error", "Please select at least one target student for the individual message.");
      return;
    }

    startTransition(async () => {
      const res = await sendBusMessageAction(currentBus!.id, {
        type: messageType,
        title: messageTitle.trim(),
        message: messageContent.trim(),
        priority: messagePriority,
        targetStudentIds: messageType === "INDIVIDUAL" ? targetStudentIds : [],
        targetStudentId: messageType === "INDIVIDUAL" ? targetStudentIds[0] : null,
      });

      if (res.error) {
        showToast("error", res.error);
      } else {
        showToast("success", res.message || "Message dispatched successfully.");
        setMessageTitle("");
        setMessageContent("");
        setTargetStudentIds([]);
        router.refresh();
      }
    });
  };

  if (!buses || buses.length === 0 || !currentBus) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "3.5rem 1.5rem",
          backgroundColor: "var(--card)",
          borderRadius: "12px",
          border: "1px solid var(--border)",
        }}
      >
        <Bus size={48} style={{ opacity: 0.3, margin: "0 auto 1rem" }} />
        <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--foreground)" }}>No Assigned School Buses</h3>
        <p style={{ margin: "0 auto 1rem", maxWidth: "480px", color: "var(--text-secondary)", fontSize: "0.92rem" }}>
          You are currently logged in as {staffName}. No active buses are assigned to your staff profile. If you have been designated as a bus in-charge, please contact the school administration to link your profile.
        </p>
      </div>
    );
  }

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

      {/* Multiple Bus Switcher Tabs if staff manages more than 1 bus */}
      {buses.length > 1 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem" }}>
          {buses.map((b, idx) => (
            <button
              key={b.id}
              onClick={() => {
                setSelectedBusIndex(idx);
                setStatusInput(b.status);
              }}
              style={{
                padding: "0.55rem 1.1rem",
                borderRadius: "8px",
                backgroundColor: selectedBusIndex === idx ? "var(--primary)" : "var(--card)",
                color: selectedBusIndex === idx ? "#fff" : "var(--foreground)",
                border: selectedBusIndex === idx ? "none" : "1px solid var(--border)",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <Bus size={16} />
              <span>{b.busNumber} ({b.name})</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Bus Card */}
      <div
        style={{
          backgroundColor: "var(--card)",
          borderRadius: "12px",
          border: "1px solid var(--border)",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
          boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
        }}
      >
        {/* Bus Overview Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "1rem",
            borderBottom: "1px solid var(--border)",
            paddingBottom: "1rem",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--foreground)" }}>
                {currentBus.busNumber}
              </span>
              <span style={{ fontSize: "0.8rem", padding: "3px 8px", borderRadius: "4px", backgroundColor: "rgba(0,0,0,0.06)", fontFamily: "monospace" }}>
                {currentBus.registrationNo}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--foreground)", fontSize: "0.95rem", fontWeight: 500, marginTop: "4px" }}>
              <MapPin size={16} style={{ color: "var(--primary)" }} />
              <span>{currentBus.name}</span>
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "3px" }}>
              Driver: <strong>{currentBus.driverName}</strong> ({currentBus.driverPhone})
              <a href={`tel:${currentBus.driverPhone}`} style={{ color: "var(--primary)", marginLeft: "8px", textDecoration: "none" }}>
                <Phone size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Call Driver
              </a>
            </div>
          </div>

          {/* Status Badge */}
          <span
            style={{
              padding: "4px 12px",
              borderRadius: "12px",
              fontSize: "0.85rem",
              fontWeight: 600,
              backgroundColor:
                currentBus.status === "RUNNING"
                  ? "rgba(16, 185, 129, 0.15)"
                  : currentBus.status === "DELAYED"
                  ? "rgba(245, 158, 11, 0.18)"
                  : "rgba(239, 68, 68, 0.18)",
              color:
                currentBus.status === "RUNNING"
                  ? "var(--success)"
                  : currentBus.status === "DELAYED"
                  ? "#f59e0b"
                  : "#ef4444",
              border: `1px solid ${
                currentBus.status === "RUNNING" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"
              }`,
            }}
          >
            {currentBus.status.replace("_", " ")}
          </span>
        </div>

        {/* Sub Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", gap: "0.5rem" }}>
          {[
            { id: "STATUS", label: "Status & Issue Control", icon: <AlertTriangle size={16} /> },
            { id: "MESSAGES", label: "Send Parent Alert", icon: <Send size={16} /> },
            { id: "STUDENTS", label: `Enrolled Students (${currentBus.students?.length || 0})`, icon: <Users size={16} /> },
            { id: "LOGS", label: `Transit Logs (${currentBus.statusLogs?.length || 0})`, icon: <Clock size={16} /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: "0.6rem 1rem",
                border: "none",
                background: "none",
                borderBottom: activeTab === tab.id ? "2px solid var(--primary)" : "none",
                color: activeTab === tab.id ? "var(--primary)" : "var(--text-secondary)",
                fontWeight: 600,
                fontSize: "0.88rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ======================================================== */}
        {/* TAB 1: STATUS CONTROL & ISSUE REPORTING                  */}
        {/* ======================================================== */}
        {activeTab === "STATUS" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "6px" }}>
                Select Real-Time Bus Status
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.6rem" }}>
                {[
                  { status: "RUNNING", label: "Running Normally", color: "var(--success)" },
                  { status: "DELAYED", label: "Transit Delay", color: "#f59e0b" },
                  { status: "NOT_RUNNING", label: "Not Running / Issue", color: "var(--danger)" },
                  { status: "MAINTENANCE", label: "In Maintenance", color: "var(--text-secondary)" },
                ].map((item) => (
                  <button
                    key={item.status}
                    type="button"
                    onClick={() => setStatusInput(item.status)}
                    style={{
                      padding: "0.6rem",
                      borderRadius: "6px",
                      border: statusInput === item.status ? `2px solid ${item.color}` : "1px solid var(--border)",
                      backgroundColor: statusInput === item.status ? "rgba(0,0,0,0.06)" : "var(--card)",
                      color: "var(--foreground)",
                      fontSize: "0.85rem",
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
              <div
                style={{
                  backgroundColor: "rgba(239, 68, 68, 0.05)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  borderRadius: "8px",
                  padding: "1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#ef4444", fontSize: "0.85rem", fontWeight: 600 }}>
                  <AlertOctagon size={16} />
                  <span>Important: Updating status to {statusInput} will immediately dispatch an URGENT notification to all parents of this bus.</span>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "4px" }}>
                    Reason / Issue Type
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
                    <option value="OTHER">Other Transit Issue 📢</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "4px" }}>
                    Issue Explanation for Parents *
                  </label>
                  <textarea
                    rows={3}
                    value={issueDescriptionInput}
                    onChange={(e) => setIssueDescriptionInput(e.target.value)}
                    placeholder="e.g. Bus 01 has a flat tire near Mount Road junction. Replacement vehicle dispatched. Expected delay: 20 minutes."
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
                padding: "0.65rem 1.4rem",
                borderRadius: "6px",
                backgroundColor: statusInput === "RUNNING" ? "var(--success)" : "var(--danger)",
                color: "#fff",
                border: "none",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: "pointer",
                alignSelf: "flex-start",
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? "Updating..." : "Update Status & Notify Parents"}
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: SEND PARENT ALERT                                 */}
        {/* ======================================================== */}
        {activeTab === "MESSAGES" && (
          <form onSubmit={handleSendMessage} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* Target Selector */}
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "4px" }}>
                Target Parent Audience
              </label>
              <div style={{ display: "flex", gap: "1.25rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.88rem" }}>
                  <input
                    type="checkbox"
                    checked={messageType === "COMMON"}
                    onChange={() => setMessageType("COMMON")}
                    style={{ width: "16px", height: "16px", accentColor: "var(--primary)" }}
                  />
                  <strong>All Parents on this Bus (Common Broadcast)</strong>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.88rem" }}>
                  <input
                    type="checkbox"
                    checked={messageType === "INDIVIDUAL"}
                    onChange={() => setMessageType("INDIVIDUAL")}
                    style={{ width: "16px", height: "16px", accentColor: "var(--primary)" }}
                  />
                  <strong>Select Individual Students</strong>
                </label>
              </div>

              {messageType === "INDIVIDUAL" && (
                <div style={{ marginTop: "0.75rem" }}>
                  <MultiSelect
                    label="Select Student(s) to Message Parents *"
                    placeholder="Choose one or more students on this bus..."
                    searchPlaceholder="Search student name, roll or class..."
                    options={(currentBus.students || []).map((item: any) => ({
                      value: item.student.id,
                      label: `${item.student.firstName} ${item.student.lastName}`,
                      subLabel: `Roll: ${item.student.rollNumber} • ${item.student.class?.name || "Class"}`,
                      badge: item.pickupPoint ? `📍 ${item.pickupPoint}` : undefined,
                    }))}
                    value={targetStudentIds}
                    onChange={setTargetStudentIds}
                    required
                  />

                  {targetStudentIds.length > 0 && (
                    <div
                      style={{
                        marginTop: "0.4rem",
                        padding: "0.4rem 0.65rem",
                        borderRadius: "6px",
                        backgroundColor: "rgba(37, 99, 235, 0.08)",
                        border: "1px solid rgba(37, 99, 235, 0.2)",
                        fontSize: "0.78rem",
                        color: "var(--primary)",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.35rem",
                      }}
                    >
                      <Users size={13} />
                      <span>
                        Recipient Preview: <strong>{targetStudentIds.length}</strong> student{targetStudentIds.length === 1 ? "" : "s"} selected • <strong>{previewRecipientCounts.parents}</strong> unique parent account{previewRecipientCounts.parents === 1 ? "" : "s"} will be notified.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "4px" }}>
                  Alert Title *
                </label>
                <input
                  type="text"
                  required
                  value={messageTitle}
                  onChange={(e) => setMessageTitle(e.target.value)}
                  placeholder="e.g. Bus 01 Pick-up Delay Update"
                  style={{
                    width: "100%",
                    padding: "0.55rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--card)",
                    color: "var(--foreground)",
                    fontSize: "0.88rem",
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
                    fontSize: "0.88rem",
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
                placeholder="Write your alert message..."
                style={{
                  width: "100%",
                  padding: "0.55rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--foreground)",
                  fontSize: "0.88rem",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Live Recipient Count Preview */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Recipient Preview: <strong>{previewRecipientCounts.parents} parent accounts</strong>
              </span>
              <button
                type="submit"
                disabled={isPending}
                style={{
                  padding: "0.6rem 1.4rem",
                  borderRadius: "6px",
                  backgroundColor: messagePriority === "URGENT" ? "#ef4444" : "var(--primary)",
                  color: "#fff",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  opacity: isPending ? 0.7 : 1,
                }}
              >
                <Send size={15} />
                <span>{isPending ? "Broadcasting..." : "Dispatch Message to Parents"}</span>
              </button>
            </div>
          </form>
        )}

        {/* ======================================================== */}
        {/* TAB 3: ENROLLED STUDENTS ROSTER (READ-ONLY)              */}
        {/* ======================================================== */}
        {activeTab === "STUDENTS" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h4 style={{ margin: 0, color: "var(--foreground)", fontSize: "0.95rem" }}>
                Enrolled Students on Bus {currentBus.busNumber}
              </h4>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {currentBus.students?.length || 0} / {currentBus.capacity} Capacity
              </span>
            </div>

            {(!currentBus.students || currentBus.students.length === 0) ? (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                No students enrolled on this bus yet. Contact administration for student assignments.
              </p>
            ) : (
              <div style={{ maxHeight: "350px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                {currentBus.students.map((item: any) => {
                  const st = item.student;
                  const parentPhone = st.parents?.[0]?.parent?.phone;
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: "0.65rem 0.85rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        backgroundColor: "rgba(0,0,0,0.02)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.88rem",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--foreground)" }}>
                          {st.firstName} {st.lastName}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                          Class: {st.class ? `${st.class.name} - ${st.class.section}` : "N/A"} • Roll: {st.rollNumber}
                          {item.pickupPoint ? ` • Stop: ${item.pickupPoint}` : ""}
                        </div>
                      </div>

                      {parentPhone && (
                        <a
                          href={`tel:${parentPhone}`}
                          style={{
                            padding: "0.35rem 0.75rem",
                            borderRadius: "4px",
                            backgroundColor: "rgba(37, 99, 235, 0.1)",
                            color: "var(--primary)",
                            textDecoration: "none",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <Phone size={12} /> Call Parent
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 4: TRANSIT STATUS LOGS                               */}
        {/* ======================================================== */}
        {activeTab === "LOGS" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--foreground)", fontSize: "0.95rem" }}>
              Bus Transit Logs &amp; Issue History
            </h4>
            {(!currentBus.statusLogs || currentBus.statusLogs.length === 0) ? (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>No status logs recorded for this bus.</p>
            ) : (
              <div style={{ maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {currentBus.statusLogs.map((log: any) => (
                  <div
                    key={log.id}
                    style={{
                      padding: "0.65rem 0.85rem",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      backgroundColor: "rgba(0,0,0,0.02)",
                      fontSize: "0.82rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                      <strong>{log.status} {log.issueType ? `(${log.issueType})` : ""}</strong>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {new Date(log.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </div>
                    <div style={{ color: "var(--foreground)" }}>{log.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
