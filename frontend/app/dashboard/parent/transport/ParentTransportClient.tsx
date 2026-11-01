"use client";

import React, { useState } from "react";
import {
  Bus,
  Phone,
  Clock,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  Bell,
  User,
  ShieldAlert,
} from "lucide-react";

interface ChildTransportItem {
  studentId: string;
  studentName: string;
  rollNumber: string;
  admissionNo: string;
  className: string;
  hasBus: boolean;
  busDetails: {
    assignmentId: string;
    busId: string;
    busNumber: string;
    registrationNumber: string;
    routeName: string;
    driverName: string;
    driverPhone: string;
    inchargeName: string;
    inchargePhone: string;
    status: string;
    currentIssue?: string | null;
    issueReportedAt?: Date | string | null;
    pickupStop?: string | null;
    pickupTime?: string | null;
    dropStop?: string | null;
    dropTime?: string | null;
    recentAlerts?: any[];
  } | null;
}

interface ParentTransportClientProps {
  childrenTransport: ChildTransportItem[];
}

export default function ParentTransportClient({ childrenTransport }: ParentTransportClientProps) {
  const [selectedChildIndex, setSelectedChildIndex] = useState(0);

  if (!childrenTransport || childrenTransport.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "3.5rem 1rem",
          backgroundColor: "var(--card)",
          borderRadius: "12px",
          border: "1px solid var(--border)",
        }}
      >
        <Bus size={48} style={{ opacity: 0.25, margin: "0 auto 1rem" }} />
        <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--foreground)" }}>No Student Records Linked</h3>
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          No enrolled students are currently linked to this parent account.
        </p>
      </div>
    );
  }

  const currentChild = childrenTransport[selectedChildIndex] || childrenTransport[0];
  const bus = currentChild.busDetails;
  const hasIssue = bus && (bus.status === "BREAKDOWN" || bus.status === "DELAYED");

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Child Switcher Tabs if parent has multiple children */}
      {childrenTransport.length > 1 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem" }}>
          {childrenTransport.map((c, idx) => (
            <button
              key={c.studentId}
              onClick={() => setSelectedChildIndex(idx)}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "8px",
                backgroundColor: selectedChildIndex === idx ? "var(--primary)" : "var(--card)",
                color: selectedChildIndex === idx ? "#fff" : "var(--foreground)",
                border: selectedChildIndex === idx ? "none" : "1px solid var(--border)",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <User size={16} />
              <span>{c.studentName} ({c.className})</span>
            </button>
          ))}
        </div>
      )}

      {!bus ? (
        <div
          style={{
            backgroundColor: "var(--card)",
            borderRadius: "12px",
            border: "1px solid var(--border)",
            padding: "2.5rem 1.5rem",
            textAlign: "center",
          }}
        >
          <Bus size={44} style={{ opacity: 0.3, margin: "0 auto 1rem" }} />
          <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--foreground)" }}>
            No School Bus Assigned for {currentChild.studentName}
          </h3>
          <p style={{ margin: "0 auto 1.5rem", maxWidth: "480px", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            {currentChild.studentName} ({currentChild.className}) is not registered with school bus transport. If you wish to avail bus service, please contact the school transport administration office.
          </p>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.6rem 1.2rem",
              borderRadius: "8px",
              backgroundColor: "rgba(37, 99, 235, 0.1)",
              color: "var(--primary)",
              fontWeight: 600,
              fontSize: "0.9rem",
            }}
          >
            <Phone size={16} />
            <span>School Transport Desk: +91 44 2615 1527</span>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Active Issue Alert Banner */}
          {hasIssue && (
            <div
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.12)",
                border: "2px solid rgba(239, 68, 68, 0.5)",
                borderRadius: "12px",
                padding: "1.2rem 1.4rem",
                display: "flex",
                alignItems: "flex-start",
                gap: "1rem",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  padding: "10px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(239, 68, 68, 0.2)",
                  color: "#ef4444",
                  flexShrink: 0,
                }}
              >
                <AlertOctagon size={28} />
              </span>
              <div>
                <strong style={{ color: "var(--foreground)", fontSize: "1.1rem" }}>
                  Active Bus Transit Notice — {bus.busNumber}
                </strong>
                <p style={{ margin: "6px 0", color: "var(--foreground)", fontSize: "0.95rem", lineHeight: 1.5 }}>
                  {bus.currentIssue || "Bus reported with operational delay/breakdown."}
                </p>
                {bus.issueReportedAt && (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    Reported at: {new Date(bus.issueReportedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bus Details Main Card */}
          <div
            style={{
              backgroundColor: "var(--card)",
              borderRadius: "12px",
              border: "1px solid var(--border)",
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            }}
          >
            {/* Bus Header */}
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
                    {bus.busNumber}
                  </span>
                  <span
                    style={{
                      fontSize: "0.8rem",
                      padding: "3px 8px",
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    color: "var(--foreground)",
                    fontSize: "0.95rem",
                    fontWeight: 500,
                    marginTop: "4px",
                  }}
                >
                  <MapPin size={16} style={{ color: "var(--primary)" }} />
                  <span>{bus.routeName}</span>
                </div>
              </div>

              {/* Status Badge */}
              <span
                style={{
                  padding: "4px 12px",
                  borderRadius: "12px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
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
                {bus.status === "ACTIVE" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {bus.status === "ACTIVE"
                  ? "Running on Schedule"
                  : bus.status === "IN_TRANSIT"
                  ? "Bus In Transit"
                  : bus.status === "DELAYED"
                  ? "Transit Delay"
                  : bus.status === "BREAKDOWN"
                  ? "Issue / Breakdown"
                  : bus.status}
              </span>
            </div>

            {/* Stops & Timings Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "1rem",
              }}
            >
              {/* Morning Pickup */}
              <div
                style={{
                  backgroundColor: "rgba(37, 99, 235, 0.05)",
                  border: "1px solid rgba(37, 99, 235, 0.2)",
                  borderRadius: "10px",
                  padding: "1rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--primary)", fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.5rem" }}>
                  <Clock size={16} />
                  <span>Morning Pick-up</span>
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--foreground)" }}>
                  {bus.pickupStop || "Designated Campus Stop"}
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                  Scheduled Time: <strong style={{ color: "var(--foreground)" }}>{bus.pickupTime || "07:30 AM"}</strong>
                </div>
              </div>

              {/* Evening Drop */}
              <div
                style={{
                  backgroundColor: "rgba(16, 185, 129, 0.05)",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                  borderRadius: "10px",
                  padding: "1rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--success)", fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.5rem" }}>
                  <Clock size={16} />
                  <span>Evening Drop-off</span>
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--foreground)" }}>
                  {bus.dropStop || "Designated Campus Stop"}
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                  Scheduled Time: <strong style={{ color: "var(--foreground)" }}>{bus.dropTime || "04:30 PM"}</strong>
                </div>
              </div>
            </div>

            {/* Direct Contacts: Driver & In-charge */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "1rem",
                paddingTop: "0.5rem",
              }}
            >
              {/* Driver Contact */}
              <div
                style={{
                  padding: "1rem",
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                  backgroundColor: "rgba(0,0,0,0.02)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Bus Driver</div>
                  <div style={{ fontWeight: 600, color: "var(--foreground)", fontSize: "1rem" }}>{bus.driverName}</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                    {bus.driverPhone}
                  </div>
                </div>
                <a
                  href={`tel:${bus.driverPhone}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "0.55rem 0.9rem",
                    borderRadius: "6px",
                    backgroundColor: "var(--primary)",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    textDecoration: "none",
                  }}
                >
                  <Phone size={14} /> Call
                </a>
              </div>

              {/* Staff In-charge Contact */}
              <div
                style={{
                  padding: "1rem",
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                  backgroundColor: "rgba(0,0,0,0.02)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Staff In-charge</div>
                  <div style={{ fontWeight: 600, color: "var(--foreground)", fontSize: "1rem" }}>{bus.inchargeName}</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                    {bus.inchargePhone}
                  </div>
                </div>
                {bus.inchargePhone && bus.inchargePhone.replace(/\D/g, "").length >= 7 && (
                  <a
                    href={`tel:${bus.inchargePhone}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "0.55rem 0.9rem",
                      borderRadius: "6px",
                      backgroundColor: "var(--primary)",
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      textDecoration: "none",
                    }}
                  >
                    <Phone size={14} /> Call
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Recent Alerts Feed for This Bus */}
          <div
            style={{
              backgroundColor: "var(--card)",
              borderRadius: "12px",
              border: "1px solid var(--border)",
              padding: "1.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <ShieldAlert size={20} style={{ color: "var(--primary)" }} />
              <h3 style={{ margin: 0, color: "var(--foreground)", fontSize: "1.1rem" }}>
                Live Bus Alerts &amp; Announcements
              </h3>
            </div>

            {(!bus.recentAlerts || bus.recentAlerts.length === 0) ? (
              <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>
                <Bell size={36} style={{ opacity: 0.3, margin: "0 auto 0.5rem" }} />
                <p style={{ margin: 0 }}>No recent alerts for this bus route. Bus is operating on normal schedule.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                {bus.recentAlerts.map((al: any) => (
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
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <strong style={{ color: "var(--foreground)", fontSize: "0.95rem" }}>{al.title}</strong>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        {new Date(al.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    </div>
                    <p style={{ margin: 0, color: "var(--foreground)", fontSize: "0.9rem" }}>{al.message}</p>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "6px" }}>
                      From: {al.senderName} ({al.senderRole})
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
