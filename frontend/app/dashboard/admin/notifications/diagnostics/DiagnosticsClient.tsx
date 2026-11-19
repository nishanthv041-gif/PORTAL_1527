"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Send,
  Trash2,
  Smartphone,
  ShieldCheck,
  Search,
  ExternalLink,
} from "lucide-react";

interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface DiagnosticsClientProps {
  users: UserSummary[];
  currentAdminId: string;
}

export default function DiagnosticsClient({ users, currentAdminId }: DiagnosticsClientProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string>(currentAdminId);
  const [userSearch, setUserSearch] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [retryingOutbox, setRetryingOutbox] = useState(false);
  const [pruningDead, setPruningDead] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  const fetchDiagnostics = async (userId?: string) => {
    setLoading(true);
    try {
      const url = new URL("/api/push/diagnostics", window.location.origin);
      if (userId) url.searchParams.set("userId", userId);
      if (statusFilter) url.searchParams.set("status", statusFilter);
      if (typeFilter) url.searchParams.set("type", typeFilter);

      const res = await fetch(url.toString());
      const json = await res.json();
      if (res.ok) {
        setData(json);
      }
    } catch (err) {
      console.error("Failed to load diagnostics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics(selectedUserId);
  }, [selectedUserId, statusFilter, typeFilter]);

  const handleSendTestToUser = async () => {
    if (!selectedUserId) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/push/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_test", userId: selectedUserId }),
      });
      const json = await res.json();
      setTestResult(json);
      fetchDiagnostics(selectedUserId);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setSendingTest(false);
    }
  };

  const handleRetryOutbox = async () => {
    setRetryingOutbox(true);
    try {
      await fetch("/api/push/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_outbox" }),
      });
      fetchDiagnostics(selectedUserId);
    } finally {
      setRetryingOutbox(false);
    }
  };

  const handlePruneDead = async () => {
    setPruningDead(true);
    try {
      await fetch("/api/push/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prune_dead" }),
      });
      fetchDiagnostics(selectedUserId);
    } finally {
      setPruningDead(false);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.id.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Activity className="w-6 h-6 text-indigo-600" />
            Universal Push Notifications Diagnostics
          </h1>
          <p style={{ color: "var(--text-secondary, #6b7280)", margin: "0.25rem 0 0" }}>
            Real-time delivery trace audit, runtime environment health, and multi-channel subscription verification.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => fetchDiagnostics(selectedUserId)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* 1. Environment Health Cards */}
      <div style={{ background: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: "0.75rem", padding: "1.25rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          Runtime Environment Health (Security Verified — Zero Secrets Logged)
        </h2>
        {data?.runtimeEnvironment ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
            {Object.entries(data.runtimeEnvironment).map(([key, val]: any) => (
              <div
                key={key}
                style={{
                  padding: "0.75rem",
                  borderRadius: "0.5rem",
                  border: `1px solid ${val.present ? "#a7f3d0" : "#fecaca"}`,
                  background: val.present ? "#ecfdf5" : "#fef2f2",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#374151" }}>{key}</span>
                  {val.present ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600" />
                  )}
                </div>
                <span style={{ fontSize: "0.75rem", color: val.present ? "#065f46" : "#991b1b" }}>
                  {val.present ? `Configured (${val.length} chars)` : "Missing from runtime"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "#9ca3af" }}>Loading environment status...</p>
        )}
      </div>

      {/* 2. Channel Statistics Bar */}
      {data?.subscriptions && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
          <div style={{ background: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: "0.5rem", padding: "1rem" }}>
            <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>Active Push Subscriptions</span>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827" }}>
              {data.subscriptions.primaryPushSubscriptions.active}
            </div>
            <span style={{ fontSize: "0.75rem", color: "#059669" }}>
              Total: {data.subscriptions.primaryPushSubscriptions.total}
            </span>
          </div>
          <div style={{ background: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: "0.5rem", padding: "1rem" }}>
            <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>Android Devices</span>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827" }}>
              {data.subscriptions.primaryPushSubscriptions.android}
            </div>
            <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>FCM / WebPush</span>
          </div>
          <div style={{ background: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: "0.5rem", padding: "1rem" }}>
            <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>iOS Safari PWA Devices</span>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827" }}>
              {data.subscriptions.primaryPushSubscriptions.ios}
            </div>
            <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>APNs / WebPush</span>
          </div>
          <div style={{ background: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: "0.5rem", padding: "1rem" }}>
            <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>Outbox Pending Retries</span>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: data.outbox?.pendingCount > 0 ? "#d97706" : "#111827" }}>
              {data.outbox?.pendingCount ?? 0}
            </div>
            <button
              onClick={handleRetryOutbox}
              disabled={retryingOutbox}
              style={{
                marginTop: "0.25rem",
                fontSize: "0.75rem",
                background: "none",
                border: "none",
                color: "#2563eb",
                cursor: "pointer",
                padding: 0,
                textDecoration: "underline",
              }}
            >
              {retryingOutbox ? "Processing..." : "Retry Outbox Now"}
            </button>
          </div>
        </div>
      )}

      {/* 3. Per-User Deep Diagnostic Lookup */}
      <div style={{ background: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: "0.75rem", padding: "1.25rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Smartphone className="w-5 h-5 text-indigo-600" />
          Per-User Subscription & Push Channel Lookup
        </h2>

        {/* User Search & Select */}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ position: "relative" }}>
              <Search className="w-4 h-4 text-gray-400" style={{ position: "absolute", left: 10, top: 10 }} />
              <input
                type="text"
                placeholder="Search user by name, email, or user ID..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.5rem 0.5rem 0.5rem 2rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                }}
              />
            </div>
          </div>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              background: "#ffffff",
              fontSize: "0.875rem",
              minWidth: 240,
            }}
          >
            {filteredUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role}) - {u.email}
              </option>
            ))}
          </select>
          <button
            onClick={handleSendTestToUser}
            disabled={sendingTest}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              background: "#4f46e5",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            <Send className="w-4 h-4" />
            {sendingTest ? "Sending..." : "Send Real Test to This User"}
          </button>
          <button
            onClick={handlePruneDead}
            disabled={pruningDead}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.5rem 0.75rem",
              borderRadius: "0.375rem",
              background: "#f3f4f6",
              color: "#374151",
              border: "1px solid #d1d5db",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            <Trash2 className="w-4 h-4 text-red-500" />
            {pruningDead ? "Pruning..." : "Prune Dead Subscriptions"}
          </button>
        </div>

        {/* Test Result Message */}
        {testResult && (
          <div
            style={{
              padding: "0.75rem",
              borderRadius: "0.375rem",
              marginBottom: "1rem",
              background: testResult.success ? "#ecfdf5" : "#fef2f2",
              border: `1px solid ${testResult.success ? "#a7f3d0" : "#fecaca"}`,
              fontSize: "0.875rem",
            }}
          >
            {testResult.success ? (
              <span style={{ color: "#065f46" }}>
                ✓ Test push dispatched successfully through real pipeline. Recipients alerted:{" "}
                {testResult.result?.recipientCount || 1}
              </span>
            ) : (
              <span style={{ color: "#991b1b" }}>✕ Test push failed: {testResult.error || "Channel delivery rejected"}</span>
            )}
          </div>
        )}

        {/* Selected User Details */}
        {data?.userDetails && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
            {/* User Profile */}
            <div style={{ padding: "0.75rem", borderRadius: "0.5rem", border: "1px solid #e5e7eb", background: "#f9fafb" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 0.5rem" }}>Portal Profile</h3>
              <div style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <div><strong>Name:</strong> {data.userDetails.user.name}</div>
                <div><strong>Email:</strong> {data.userDetails.user.email}</div>
                <div><strong>Role:</strong> {data.userDetails.user.role}</div>
                <div><strong>User ID:</strong> <code style={{ fontSize: "0.75rem" }}>{data.userDetails.user.id}</code></div>
                <div>
                  <strong>Notifications Enabled:</strong>{" "}
                  {data.userDetails.user.notificationsEnabled ? "✓ Yes" : "✕ Disabled by user"}
                </div>
              </div>
            </div>

            {/* Direct WebPush Subscriptions */}
            <div style={{ padding: "0.75rem", borderRadius: "0.5rem", border: "1px solid #e5e7eb", background: "#f9fafb" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
                Direct WebPush Subscriptions ({data.userDetails.webPushSubscriptions?.length || 0})
              </h3>
              {data.userDetails.webPushSubscriptions?.length > 0 ? (
                <div style={{ fontSize: "0.8rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {data.userDetails.webPushSubscriptions.map((sub: any) => (
                    <div key={sub.id} style={{ padding: "0.35rem 0.5rem", borderRadius: "0.25rem", background: "#fff", border: "1px solid #e5e7eb" }}>
                      <div><strong>Platform:</strong> {sub.platform || "WEB"} | <strong>Status:</strong> {sub.isActive ? "Active" : "Inactive"}</div>
                      <div style={{ color: "#6b7280", wordBreak: "break-all" }}>{sub.endpoint}</div>
                      <div style={{ fontSize: "0.7rem", color: "#9ca3af" }}>
                        Last login: {sub.lastLoginAt ? new Date(sub.lastLoginAt).toLocaleString() : "Never"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: "0.85rem", color: "#dc2626" }}>
                  No active push subscriptions found for this user in PostgreSQL. Device has not registered WebPush.
                </div>
              )}
            </div>

            {/* OneSignal API Status */}
            <div style={{ padding: "0.75rem", borderRadius: "0.5rem", border: "1px solid #e5e7eb", background: "#f9fafb" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
                OneSignal REST API Sync
              </h3>
              <div style={{ fontSize: "0.85rem" }}>
                {data.userDetails.oneSignalStatus?.found ? (
                  <div style={{ color: "#059669" }}>
                    ✓ Linked in OneSignal! Active Subscriptions: {data.userDetails.oneSignalStatus.subscriptionsCount}
                  </div>
                ) : (
                  <div style={{ color: "#d97706" }}>
                    {data.userDetails.oneSignalStatus?.error ? (
                      <span>API Check Error: {data.userDetails.oneSignalStatus.error}</span>
                    ) : (
                      <span>No OneSignal player matched external_id: {selectedUserId}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Delivery Trace Audit Table */}
      <div style={{ background: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: "0.75rem", padding: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>
            Recent Delivery Traces (notification_deliveries)
          </h2>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: "0.25rem 0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", fontSize: "0.8rem" }}
            >
              <option value="">All Statuses</option>
              <option value="DELIVERED">DELIVERED</option>
              <option value="FAILED">FAILED</option>
              <option value="RECIPIENTS_ZERO">RECIPIENTS_ZERO</option>
              <option value="NO_DEVICES">NO_DEVICES</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ padding: "0.25rem 0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", fontSize: "0.8rem" }}
            >
              <option value="">All Types</option>
              <option value="MESSAGE">MESSAGE</option>
              <option value="REPORT_CARD">REPORT_CARD</option>
              <option value="ANNOUNCEMENT">ANNOUNCEMENT</option>
              <option value="MEETING">MEETING</option>
              <option value="BUS_UPDATE">BUS_UPDATE</option>
              <option value="LEAVE">LEAVE</option>
              <option value="EXAM">EXAM</option>
              <option value="TEST">TEST</option>
            </select>
          </div>
        </div>

        {data?.deliveryTrace?.latestDeliveries?.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
              <thead>
                <tr style={{ background: "#f9fafb", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ padding: "0.5rem" }}>Time</th>
                  <th style={{ padding: "0.5rem" }}>Event Type</th>
                  <th style={{ padding: "0.5rem" }}>Recipient</th>
                  <th style={{ padding: "0.5rem" }}>Channel</th>
                  <th style={{ padding: "0.5rem" }}>Status</th>
                  <th style={{ padding: "0.5rem" }}>Recipients</th>
                  <th style={{ padding: "0.5rem" }}>Tag</th>
                  <th style={{ padding: "0.5rem" }}>Error / Note</th>
                </tr>
              </thead>
              <tbody>
                {data.deliveryTrace.latestDeliveries.map((d: any) => {
                  const isDelivered = d.status === "DELIVERED";
                  const isZero = d.status === "RECIPIENTS_ZERO";
                  const isNoDev = d.status === "NO_DEVICES";
                  return (
                    <tr key={d.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "0.5rem", color: "#6b7280" }}>
                        {new Date(d.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </td>
                      <td style={{ padding: "0.5rem", fontWeight: 600 }}>{d.eventType}</td>
                      <td style={{ padding: "0.5rem" }}>
                        <code style={{ fontSize: "0.75rem" }}>{d.recipientUserId.slice(0, 12)}...</code>
                      </td>
                      <td style={{ padding: "0.5rem" }}>{d.channel}</td>
                      <td style={{ padding: "0.5rem" }}>
                        <span
                          style={{
                            padding: "0.15rem 0.4rem",
                            borderRadius: "0.25rem",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            background: isDelivered ? "#dcfce7" : isZero ? "#fef3c7" : isNoDev ? "#f3f4f6" : "#fee2e2",
                            color: isDelivered ? "#15803d" : isZero ? "#b45309" : isNoDev ? "#4b5563" : "#b91c1c",
                          }}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td style={{ padding: "0.5rem" }}>{d.recipientsCount}</td>
                      <td style={{ padding: "0.5rem", color: "#6b7280", fontSize: "0.75rem" }}>{d.tag || "—"}</td>
                      <td style={{ padding: "0.5rem", color: "#ef4444", fontSize: "0.75rem" }}>{d.errorMessage || d.error || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: "#9ca3af", textAlign: "center", padding: "1.5rem" }}>
            No delivery trace logs found. Dispatch a real event or click "Send Real Test" to populate traces.
          </p>
        )}
      </div>

      {/* 5. Device Setup Guidance Banner */}
      <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "0.75rem", padding: "1.25rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.5rem", color: "#1e293b" }}>
          📱 How Users Receive Lock-Screen Notifications
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", fontSize: "0.85rem", color: "#475569" }}>
          <div>
            <strong>Android Phones (Chrome / PWA):</strong>
            <ol style={{ paddingLeft: "1.25rem", margin: "0.25rem 0 0" }}>
              <li>Open Portal in Google Chrome.</li>
              <li>Tap "Add to Home screen" or click the install prompt.</li>
              <li>When prompted "Allow notifications", tap <strong>Allow</strong>.</li>
              <li>Lock-screen notifications with sound and vibrations will deliver instantly.</li>
            </ol>
          </div>
          <div>
            <strong>iPhones / iPads (iOS 16.4+ Safari):</strong>
            <ol style={{ paddingLeft: "1.25rem", margin: "0.25rem 0 0" }}>
              <li>Open Portal in Apple Safari.</li>
              <li>Tap the <strong>Share</strong> button (box with up arrow).</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
              <li>Open the installed SRT Portal app from Home Screen.</li>
              <li>Tap "Enable Notifications" and tap <strong>Allow</strong>.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
