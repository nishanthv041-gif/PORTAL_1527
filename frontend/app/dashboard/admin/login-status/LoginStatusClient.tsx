"use client";

import { SearchBar, ResultsContainer } from "@/frontend/components/ui";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
  Send,
  X,
  AlertCircle,
  Loader2,
  SlidersHorizontal,
  Copy,
  Check,
  RefreshCw,
  Smartphone,
  Laptop,
  Globe,
  ShieldCheck,
  Info,
} from "lucide-react";
import { LoginAttempt } from "@prisma/client";
import {
  sendReportEmailAction,
  sendTestEmailAction,
} from "@/backend/api/actions/dashboard/admin/login-status/actions";

// Helper to parse human-readable System & Device information
export function parseSystemInfo(ua?: string | null): {
  deviceType: "mobile" | "desktop" | "apple" | "other";
  osName: string;
  browserName: string;
  raw: string;
} {
  if (!ua || ua === "Unknown" || ua === "N/A") {
    return {
      deviceType: "other",
      osName: "Unknown System",
      browserName: "Browser",
      raw: ua || "N/A",
    };
  }

  let osName = "Desktop System";
  let deviceType: "mobile" | "desktop" | "apple" | "other" = "desktop";

  if (/android/i.test(ua)) {
    deviceType = "mobile";
    const androidVer = ua.match(/Android\s([0-9.]+)/i);
    osName = androidVer ? `Android ${androidVer[1]} Mobile` : "Android Mobile";
  } else if (/iphone/i.test(ua)) {
    deviceType = "apple";
    osName = "Apple iPhone (iOS)";
  } else if (/ipad/i.test(ua)) {
    deviceType = "apple";
    osName = "Apple iPad (iPadOS)";
  } else if (/windows nt 10/i.test(ua)) {
    deviceType = "desktop";
    osName = "Windows 10/11 PC";
  } else if (/windows/i.test(ua)) {
    deviceType = "desktop";
    osName = "Windows PC";
  } else if (/macintosh|mac os x/i.test(ua)) {
    deviceType = "apple";
    osName = "Apple Mac (macOS)";
  } else if (/cros/i.test(ua)) {
    deviceType = "desktop";
    osName = "Chromebook (ChromeOS)";
  } else if (/linux/i.test(ua)) {
    deviceType = "desktop";
    osName = "Linux PC";
  }

  let browserName = "Web Browser";
  if (/edg/i.test(ua)) {
    browserName = "Microsoft Edge";
  } else if (/chrome|crios/i.test(ua)) {
    browserName = "Google Chrome";
  } else if (/firefox|fxios/i.test(ua)) {
    browserName = "Mozilla Firefox";
  } else if (/safari/i.test(ua)) {
    browserName = "Apple Safari";
  } else if (/opera|opr/i.test(ua)) {
    browserName = "Opera";
  }

  return {
    deviceType,
    osName,
    browserName,
    raw: ua,
  };
}


export default function LoginStatusClient({ records }: { records: LoginAttempt[] }) {
  const router = useRouter();

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState("");
  const [isPendingSearch, setIsPendingSearch] = useState(false);

  // Auto Refresh State
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Modal State
  const [selectedRecord, setSelectedRecord] = useState<LoginAttempt | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [modalCcAdmin, setModalCcAdmin] = useState(false);
  const [isSendingModal, setIsSendingModal] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Copy IP Feedback State
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  // Direct Row Sending State
  const [sendingRowId, setSendingRowId] = useState<string | null>(null);
  const [sentSuccessRowId, setSentSuccessRowId] = useState<string | null>(null);

  // Global Page Banner
  const [globalBanner, setGlobalBanner] = useState<{
    type: "success" | "error" | "info";
    message: string;
    details?: string;
  } | null>(null);

  // Quick Test Email State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Automatic Refresh Interval (Every 12 seconds)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      router.refresh();
      setLastRefreshedAt(new Date());
    }, 12000);
    return () => clearInterval(interval);
  }, [autoRefresh, router]);

  // Manual Trigger Refresh
  const handleManualRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    setLastRefreshedAt(new Date());
    setTimeout(() => {
      setIsRefreshing(false);
    }, 700);
  };

  // Copy IP to Clipboard with robust mobile fallback
  const handleCopyIp = async (ipText: string | null) => {
    if (!ipText || ipText === "N/A" || ipText === "Unknown") return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(ipText);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = ipText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopiedIp(ipText);
      setTimeout(() => {
        setCopiedIp((prev) => (prev === ipText ? null : prev));
      }, 2500);
    } catch (err) {
      console.error("Failed to copy IP:", err);
    }
  };

  const filteredRecords = records.filter((record) => {
    return (
      record.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.ipAddress || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.userAgent || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Direct 1-Click Send to that particular user
  const handleDirectReport = async (record: LoginAttempt) => {
    if (sendingRowId) return;

    // If email is missing or placeholder like unknown@google, prompt modal
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!record.email || !emailRegex.test(record.email) || record.email.includes("unknown")) {
      handleOpenReportModal(record);
      setModalFeedback({
        type: "error",
        message: "This login attempt does not have a valid account email. Please specify the recipient email below.",
      });
      return;
    }

    setSendingRowId(record.id);
    setGlobalBanner(null);

    try {
      const res = await sendReportEmailAction(
        record.email,
        record.ipAddress,
        record.timestamp,
        record.success,
        record.email,
        false, // ccAdmin: false - send exclusively to the reporting person, not to me/admin
        record.userAgent
      );

      if (res?.error) {
        setGlobalBanner({
          type: "error",
          message: `Failed to send report to ${record.email}`,
          details: res.error,
        });
      } else {
        setSentSuccessRowId(record.id);
        setGlobalBanner({
          type: "success",
          message: `Security report email sent directly to ${record.email}!`,
          details: `Dispatched directly to ${record.email} via SMTP. Note: Institutional accounts (@bitsathy.ac.in) may place external emails in Spam/Junk folder.`,
        });
        // Automatically sync fresh data
        router.refresh();
        setTimeout(() => {
          setSentSuccessRowId((prev) => (prev === record.id ? null : prev));
        }, 5000);
      }
    } catch (err: any) {
      setGlobalBanner({
        type: "error",
        message: `Error sending report to ${record.email}`,
        details: err?.message || "Please check server connection.",
      });
    } finally {
      setSendingRowId(null);
    }
  };

  const handleOpenReportModal = (record: LoginAttempt) => {
    setSelectedRecord(record);
    const isValid = record.email && record.email.includes("@") && !record.email.includes("unknown");
    setRecipientEmail(isValid ? record.email : "");
    setModalCcAdmin(false);
    setModalFeedback(null);
  };

  const handleSendReportFromModal = async () => {
    if (!selectedRecord) return;
    const targetRecipient = recipientEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!targetRecipient || !emailRegex.test(targetRecipient)) {
      setModalFeedback({
        type: "error",
        message: "Please enter a valid recipient email address (e.g. name@domain.com).",
      });
      return;
    }

    setIsSendingModal(true);
    setModalFeedback(null);

    try {
      const res = await sendReportEmailAction(
        selectedRecord.email,
        selectedRecord.ipAddress,
        selectedRecord.timestamp,
        selectedRecord.success,
        targetRecipient,
        modalCcAdmin,
        selectedRecord.userAgent
      );

      if (res?.error) {
        setModalFeedback({ type: "error", message: res.error });
      } else {
        setModalFeedback({
          type: "success",
          message: `Security report sent directly to ${targetRecipient}!`,
        });
        setSentSuccessRowId(selectedRecord.id);
        setGlobalBanner({
          type: "success",
          message: `Security report sent directly to ${targetRecipient}!`,
          details: `Delivered via SMTP directly to ${targetRecipient}. Note: If not seen in Inbox, check Spam/Junk folder.`,
        });
        // Auto sync
        router.refresh();
      }
    } catch (err: any) {
      setModalFeedback({
        type: "error",
        message: err?.message || "Failed to send email. Please check server connection.",
      });
    } finally {
      setIsSendingModal(false);
    }
  };

  const handleSendTestMail = async () => {
    if (!testEmailAddress || !testEmailAddress.includes("@")) {
      setTestFeedback({ type: "error", message: "Please provide a valid email address." });
      return;
    }
    setIsSendingTest(true);
    setTestFeedback(null);

    try {
      const res = await sendTestEmailAction(testEmailAddress);
      if (res?.error) {
        setTestFeedback({ type: "error", message: res.error });
      } else {
        setTestFeedback({
          type: "success",
          message: res.message || `Test email sent to ${testEmailAddress}! (Please check Spam/Junk if not in Inbox)`,
        });
        router.refresh();
      }
    } catch (err: any) {
      setTestFeedback({
        type: "error",
        message: err?.message || "Failed to send test email.",
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div style={{ marginTop: "1.5rem", background: "var(--card-bg)", borderRadius: "12px", padding: "1.5rem", border: "1px solid var(--border-color)" }}>
      {/* Header Bar with Live Sync Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        {/* Search */}
        <div style={{ width: "100%", maxWidth: "340px", minWidth: "220px" }}>
          <SearchBar
            placeholder="Search email, IP address, device..."
            value={searchTerm}
            onChange={(val) => setSearchTerm(val)}
            onPendingChange={(pending) => setIsPendingSearch(pending)}
            style={{ maxWidth: "100%" }}
          />
        </div>

        {/* Live Auto-Refresh & Actions Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {/* Auto Refresh Toggle Badge */}
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? "Auto-refresh is active (every 12s). Click to pause." : "Auto-refresh is paused. Click to enable."}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              fontSize: "0.8rem",
              fontWeight: 500,
              padding: "0.5rem 0.85rem",
              borderRadius: "999px",
              background: autoRefresh ? "rgba(34, 197, 94, 0.12)" : "rgba(255, 255, 255, 0.05)",
              color: autoRefresh ? "#22c55e" : "var(--text-secondary)",
              border: `1px solid ${autoRefresh ? "rgba(34, 197, 94, 0.3)" : "var(--border-color)"}`,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: autoRefresh ? "#22c55e" : "#888",
                display: "inline-block",
                boxShadow: autoRefresh ? "0 0 8px #22c55e" : "none",
              }}
            />
            <span>{autoRefresh ? "Live Auto-Sync (12s)" : "Auto-Sync Paused"}</span>
          </button>

          {/* Manual Refresh Button */}
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            title="Refresh login records now"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.5rem 0.85rem",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              color: "inherit",
              border: "1px solid var(--border-color)",
              borderRadius: "8px",
              cursor: isRefreshing ? "not-allowed" : "pointer",
              fontWeight: 500,
              fontSize: "0.825rem",
            }}
          >
            <RefreshCw size={14} style={{ animation: isRefreshing ? "spin 0.8s linear infinite" : "none" }} />
            <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
          </button>

          {/* Test Email Delivery Button */}
          <button
            type="button"
            onClick={() => {
              setIsTestModalOpen(true);
              setTestFeedback(null);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.5rem 0.95rem",
              backgroundColor: "rgba(99, 102, 241, 0.1)",
              color: "var(--primary)",
              border: "1px solid var(--primary)",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.825rem",
            }}
          >
            <Mail size={15} /> Test Email Delivery
          </button>
        </div>
      </div>

      {/* Global Status Banner */}
      {globalBanner && (
        <div
          style={{
            padding: "0.85rem 1.25rem",
            borderRadius: "8px",
            marginBottom: "1.25rem",
            fontSize: "0.875rem",
            backgroundColor:
              globalBanner.type === "success"
                ? "rgba(34, 197, 94, 0.12)"
                : "rgba(239, 68, 68, 0.12)",
            color: globalBanner.type === "success" ? "#22c55e" : "#ef4444",
            border: `1px solid ${
              globalBanner.type === "success" ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"
            }`,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem" }}>
            {globalBanner.type === "success" ? (
              <CheckCircle2 size={18} style={{ marginTop: "2px", flexShrink: 0 }} />
            ) : (
              <AlertCircle size={18} style={{ marginTop: "2px", flexShrink: 0 }} />
            )}
            <div>
              <div style={{ fontWeight: 600 }}>{globalBanner.message}</div>
              {globalBanner.details && (
                <div style={{ fontSize: "0.8rem", opacity: 0.9, marginTop: "0.25rem" }}>
                  {globalBanner.details}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setGlobalBanner(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              padding: "2px",
              opacity: 0.7,
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: "8px" }}>
        <table style={{ width: "100%", minWidth: "920px", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-color)", backgroundColor: "rgba(0,0,0,0.02)" }}>
              <th style={{ padding: "0.85rem 1rem", fontWeight: 600, fontSize: "0.85rem", width: "26%", minWidth: "220px", whiteSpace: "nowrap" }}>Account User</th>
              <th style={{ padding: "0.85rem 1rem", fontWeight: 600, fontSize: "0.85rem", width: "18%", minWidth: "175px", whiteSpace: "nowrap" }}>Date & Timing</th>
              <th style={{ padding: "0.85rem 1rem", fontWeight: 600, fontSize: "0.85rem", width: "11%", minWidth: "105px", whiteSpace: "nowrap" }}>Status</th>
              <th style={{ padding: "0.85rem 1rem", fontWeight: 600, fontSize: "0.85rem", width: "17%", minWidth: "160px", whiteSpace: "nowrap" }}>IP Address</th>
              <th style={{ padding: "0.85rem 1rem", fontWeight: 600, fontSize: "0.85rem", width: "18%", minWidth: "175px", whiteSpace: "nowrap" }}>Login System & Device</th>
              <th style={{ padding: "0.85rem 1rem", fontWeight: 600, fontSize: "0.85rem", width: "10%", minWidth: "115px", textAlign: "center", whiteSpace: "nowrap" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map((record) => {
              const sys = parseSystemInfo(record.userAgent);

              return (
                <tr key={record.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  {/* Account User */}
                  <td style={{ padding: "0.85rem 1rem", fontSize: "0.875rem", fontWeight: 500, whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          backgroundColor: "rgba(99, 102, 241, 0.1)",
                          color: "var(--primary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {record.email.charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 500 }}>{record.email}</span>
                    </div>
                  </td>

                  {/* Date & Time */}
                  <td style={{ padding: "0.85rem 1rem", fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", opacity: 0.9 }}>
                      <Clock size={14} style={{ opacity: 0.6 }} />
                      {new Date(record.timestamp).toLocaleString()}
                    </div>
                  </td>

                  {/* Status */}
                  <td style={{ padding: "0.85rem 1rem" }}>
                    {record.success ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          color: "var(--success, #22c55e)",
                          fontSize: "0.8rem",
                          background: "var(--success-bg, rgba(34, 197, 94, 0.1))",
                          padding: "0.25rem 0.55rem",
                          borderRadius: "999px",
                          fontWeight: 500,
                        }}
                      >
                        <CheckCircle2 size={13} /> Success
                      </span>
                    ) : (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          color: "var(--danger, #ef4444)",
                          fontSize: "0.8rem",
                          background: "var(--danger-bg, rgba(239, 68, 68, 0.1))",
                          padding: "0.25rem 0.55rem",
                          borderRadius: "999px",
                          fontWeight: 500,
                        }}
                      >
                        <XCircle size={13} /> Failed
                      </span>
                    )}
                  </td>

                  {/* IP Address Column */}
                  <td style={{ padding: "0.85rem 1rem", fontSize: "0.875rem", whiteSpace: "nowrap" }}>
                    <span
                      onClick={() => handleCopyIp(record.ipAddress)}
                      title="Click to copy IP address"
                      style={{
                        fontFamily: "monospace",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        padding: "0.25rem 0.6rem",
                        borderRadius: "6px",
                        background: copiedIp === record.ipAddress
                          ? "rgba(34, 197, 94, 0.15)"
                          : record.ipAddress && record.ipAddress !== "Google OAuth" && record.ipAddress !== "Unknown"
                          ? "rgba(99, 102, 241, 0.08)"
                          : "rgba(255, 255, 255, 0.04)",
                        border: `1px solid ${
                          copiedIp === record.ipAddress
                            ? "#22c55e"
                            : "var(--border-color)"
                        }`,
                        color: copiedIp === record.ipAddress
                          ? "#22c55e"
                          : record.ipAddress && record.ipAddress !== "Google OAuth" && record.ipAddress !== "Unknown"
                          ? "var(--primary)"
                          : "inherit",
                        cursor: record.ipAddress && record.ipAddress !== "Unknown" && record.ipAddress !== "N/A" ? "pointer" : "default",
                        display: "inline-block",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {copiedIp === record.ipAddress ? "Copied!" : (record.ipAddress || "Unknown")}
                    </span>
                  </td>

                  {/* System & Device Column */}
                  <td style={{ padding: "0.85rem 1rem", fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }} title={record.userAgent || ""}>
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: "8px",
                          backgroundColor: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid var(--border-color)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: sys.deviceType === "mobile" ? "#38bdf8" : "#818cf8",
                          flexShrink: 0,
                        }}
                      >
                        {sys.deviceType === "mobile" ? (
                          <Smartphone size={16} />
                        ) : sys.deviceType === "desktop" || sys.deviceType === "apple" ? (
                          <Laptop size={16} />
                        ) : (
                          <Globe size={16} />
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: "inherit", fontSize: "0.85rem" }}>
                          {sys.osName}
                        </div>
                        <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                          {sys.browserName}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Actions Column */}
                  <td style={{ padding: "0.85rem 1rem", fontSize: "0.875rem", textAlign: "center", whiteSpace: "nowrap" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                      {/* Direct Report Button */}
                      <button
                        type="button"
                        disabled={sendingRowId === record.id}
                        onClick={() => handleDirectReport(record)}
                        title={`Send security report email directly to ${record.email}`}
                        style={{
                          padding: "0.45rem 0.85rem",
                          backgroundColor: sentSuccessRowId === record.id ? "#16a34a" : "var(--primary)",
                          color: "#fff",
                          border: "none",
                          borderRadius: "6px",
                          cursor: sendingRowId === record.id ? "not-allowed" : "pointer",
                          fontWeight: 600,
                          fontSize: "0.825rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          opacity: sendingRowId === record.id ? 0.7 : 1,
                          transition: "all 0.2s ease",
                        }}
                      >
                        {sendingRowId === record.id ? (
                          <>
                            <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                            Sending...
                          </>
                        ) : sentSuccessRowId === record.id ? (
                          <>
                            <CheckCircle2 size={13} />
                            Sent!
                          </>
                        ) : (
                          <>
                            <Send size={13} />
                            Report
                          </>
                        )}
                      </button>

                      {/* Customize Modal Button */}
                      <button
                        type="button"
                        onClick={() => handleOpenReportModal(record)}
                        title="Customize recipient email or view full system details"
                        style={{
                          padding: "0.45rem 0.55rem",
                          backgroundColor: "rgba(255, 255, 255, 0.05)",
                          color: "inherit",
                          border: "1px solid var(--border-color)",
                          borderRadius: "6px",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: 0.85,
                        }}
                      >
                        <SlidersHorizontal size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredRecords.length === 0 && (
          <p style={{ textAlign: "center", opacity: 0.7, padding: "2.5rem" }}>No login records found.</p>
        )}
      </div>

      {/* Report Email Customizer Modal */}
      {selectedRecord && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "var(--card-bg, #1e293b)",
              color: "inherit",
              borderRadius: "12px",
              border: "1px solid var(--border-color, #334155)",
              width: "100%",
              maxWidth: "520px",
              padding: "1.75rem",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Mail style={{ color: "var(--primary, #3b82f6)" }} size={20} />
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>Send Security Report Email</h3>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", opacity: 0.7 }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: "0.875rem", opacity: 0.8, marginBottom: "1rem" }}>
              Send an administrative login report regarding the attempt for <strong>{selectedRecord.email}</strong>.
            </p>

            {/* Login Summary Box */}
            <div
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                padding: "0.85rem 1rem",
                marginBottom: "1.25rem",
                fontSize: "0.85rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <span style={{ opacity: 0.7 }}>Account:</span>
                <span style={{ fontWeight: 600 }}>{selectedRecord.email}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <span style={{ opacity: 0.7 }}>Date & Time:</span>
                <span>{new Date(selectedRecord.timestamp).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <span style={{ opacity: 0.7 }}>Real IP Address:</span>
                <span style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--primary)" }}>
                  {selectedRecord.ipAddress || "Unknown"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <span style={{ opacity: 0.7 }}>Login System / Device:</span>
                <span style={{ fontWeight: 600 }}>
                  {parseSystemInfo(selectedRecord.userAgent).osName} ({parseSystemInfo(selectedRecord.userAgent).browserName})
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ opacity: 0.7 }}>Status:</span>
                <span
                  style={{
                    color: selectedRecord.success ? "var(--success, #22c55e)" : "var(--danger, #ef4444)",
                    fontWeight: 600,
                  }}
                >
                  {selectedRecord.success ? "Successful Login" : "Failed Attempt"}
                </span>
              </div>
            </div>

            {/* Recipient Input */}
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                Recipient Email Address:
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="Enter recipient email (e.g. user@gmail.com)..."
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "transparent",
                  color: "inherit",
                  fontSize: "0.9rem",
                }}
              />
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                {selectedRecord.email && !selectedRecord.email.includes("unknown") && (
                  <button
                    type="button"
                    onClick={() => setRecipientEmail(selectedRecord.email)}
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.3rem 0.6rem",
                      borderRadius: "4px",
                      background: "rgba(99, 102, 241, 0.1)",
                      border: "1px solid var(--primary)",
                      color: "var(--primary)",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    Reset to Reporting Person ({selectedRecord.email})
                  </button>
                )}
                <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                  Report will be delivered directly to the reporting person.
                </span>
              </div>
            </div>

            {/* CC Admin Checkbox (Disabled/Off by default) */}
            <div style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                id="modalCcAdmin"
                checked={modalCcAdmin}
                onChange={(e) => setModalCcAdmin(e.target.checked)}
                style={{ cursor: "pointer", width: 16, height: 16 }}
              />
              <label htmlFor="modalCcAdmin" style={{ fontSize: "0.825rem", cursor: "pointer", opacity: 0.8 }}>
                Also send a copy to Admin (<code>nishanthv041@gmail.com</code>)
              </label>
            </div>

            {/* Feedback notification */}
            {modalFeedback && (
              <div
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  marginBottom: "1rem",
                  fontSize: "0.85rem",
                  backgroundColor:
                    modalFeedback.type === "success" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  color: modalFeedback.type === "success" ? "#22c55e" : "#ef4444",
                  border: `1px solid ${modalFeedback.type === "success" ? "#22c55e" : "#ef4444"}`,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                {modalFeedback.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                {modalFeedback.message}
              </div>
            )}

            {/* Deliverability Tip */}
            <div
              style={{
                fontSize: "0.78rem",
                opacity: 0.75,
                marginBottom: "1.25rem",
                padding: "0.6rem 0.85rem",
                background: "rgba(255,255,255,0.03)",
                borderRadius: "6px",
                lineHeight: 1.45,
              }}
            >
              💡 <strong>Delivery Note:</strong> Emails are sent via Google SMTP. Institutional college domains (such as <code>@bitsathy.ac.in</code>) frequently direct external notifications to the <strong>Spam / Junk</strong> folder.
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                style={{
                  padding: "0.6rem 1rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color)",
                  background: "transparent",
                  color: "inherit",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
              <button
                type="button"
                disabled={isSendingModal}
                onClick={handleSendReportFromModal}
                style={{
                  padding: "0.6rem 1.25rem",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "var(--primary)",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: isSendingModal ? "not-allowed" : "pointer",
                  opacity: isSendingModal ? 0.7 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                {isSendingModal ? (
                  <>
                    <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                    Sending Alert...
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    Send Email Now
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Email Modal */}
      {isTestModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "var(--card-bg, #1e293b)",
              color: "inherit",
              borderRadius: "12px",
              border: "1px solid var(--border-color, #334155)",
              width: "100%",
              maxWidth: "480px",
              padding: "1.75rem",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Mail style={{ color: "var(--primary, #3b82f6)" }} size={20} />
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>Test Email Delivery</h3>
              </div>
              <button
                onClick={() => setIsTestModalOpen(false)}
                style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", opacity: 0.7 }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: "0.875rem", opacity: 0.8, marginBottom: "1rem" }}>
              Send an instant confirmation email directly to verify your email server is reaching the inbox.
            </p>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                Send Test Email To:
              </label>
              <input
                type="email"
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                placeholder="e.g. user@example.com"
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "transparent",
                  color: "inherit",
                  fontSize: "0.9rem",
                }}
              />
            </div>

            {testFeedback && (
              <div
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  marginBottom: "1rem",
                  fontSize: "0.85rem",
                  backgroundColor:
                    testFeedback.type === "success" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  color: testFeedback.type === "success" ? "#22c55e" : "#ef4444",
                  border: `1px solid ${testFeedback.type === "success" ? "#22c55e" : "#ef4444"}`,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                {testFeedback.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                {testFeedback.message}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={() => setIsTestModalOpen(false)}
                style={{
                  padding: "0.6rem 1rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color)",
                  background: "transparent",
                  color: "inherit",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
              <button
                type="button"
                disabled={isSendingTest}
                onClick={handleSendTestMail}
                style={{
                  padding: "0.6rem 1.25rem",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "var(--primary)",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: isSendingTest ? "not-allowed" : "pointer",
                  opacity: isSendingTest ? 0.7 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                {isSendingTest ? (
                  <>
                    <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                    Sending Test...
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    Send Test Now
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
