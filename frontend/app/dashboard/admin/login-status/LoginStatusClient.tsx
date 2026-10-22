"use client";

import { useState } from "react";
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
} from "lucide-react";
import { LoginAttempt } from "@prisma/client";
import {
  sendReportEmailAction,
  sendTestEmailAction,
} from "@/backend/api/actions/dashboard/admin/login-status/actions";

export default function LoginStatusClient({ records }: { records: LoginAttempt[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<LoginAttempt | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
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
        message: "This login attempt does not have a valid account email. Please enter the specific recipient email below.",
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
        record.email
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
          message: `Security report email sent to ${record.email}!`,
          details: "Delivered via SMTP. Note: If the recipient does not see it in their Inbox, please ask them to check their Spam/Junk folder.",
        });
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
        targetRecipient
      );

      if (res?.error) {
        setModalFeedback({ type: "error", message: res.error });
      } else {
        setModalFeedback({
          type: "success",
          message: `Security alert sent to ${targetRecipient}! (Please check Spam/Junk folder if not in Inbox)`,
        });
        setSentSuccessRowId(selectedRecord.id);
        setGlobalBanner({
          type: "success",
          message: `Security alert sent to ${targetRecipient}!`,
          details: "Delivered via SMTP. If the recipient does not see it in their Inbox, please ask them to check their Spam/Junk folder.",
        });
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
    <div style={{ marginTop: "2rem", background: "var(--card-bg)", borderRadius: "12px", padding: "1.5rem", border: "1px solid var(--border-color)" }}>
      {/* Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ position: "relative", width: "100%", maxWidth: "300px" }}>
          <Search size={18} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", opacity: 0.5 }} />
          <input
            type="text"
            placeholder="Search email, IP address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: "100%", padding: "0.75rem 1rem 0.75rem 2.5rem", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "transparent", color: "inherit" }}
          />
        </div>

        <button
          onClick={() => {
            setIsTestModalOpen(true);
            setTestFeedback(null);
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.6rem 1rem",
            backgroundColor: "rgba(99, 102, 241, 0.1)",
            color: "var(--primary)",
            border: "1px solid var(--primary)",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.875rem",
          }}
        >
          <Mail size={16} /> Test Email Delivery
        </button>
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
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-color)", backgroundColor: "rgba(0,0,0,0.02)" }}>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: "0.875rem" }}>Email ID</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: "0.875rem" }}>Date & Timing</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: "0.875rem" }}>Status</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: "0.875rem" }}>IP Address</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: "0.875rem" }}>User Agent</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: "0.875rem", textAlign: "center" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map((record) => (
              <tr key={record.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                <td style={{ padding: "1rem", fontSize: "0.875rem", fontWeight: 500 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: "rgba(99, 102, 241, 0.1)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 600 }}>
                      {record.email.charAt(0).toUpperCase()}
                    </div>
                    {record.email}
                  </div>
                </td>
                <td style={{ padding: "1rem", fontSize: "0.875rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", opacity: 0.9 }}>
                    <Clock size={14} />
                    {new Date(record.timestamp).toLocaleString()}
                  </div>
                </td>
                <td style={{ padding: "1rem" }}>
                  {record.success ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--success)", fontSize: "0.875rem", background: "var(--success-bg)", padding: "0.25rem 0.5rem", borderRadius: "999px" }}>
                      <CheckCircle2 size={14} /> Success
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--danger)", fontSize: "0.875rem", background: "var(--danger-bg)", padding: "0.25rem 0.5rem", borderRadius: "999px" }}>
                      <XCircle size={14} /> Failed
                    </span>
                  )}
                </td>
                <td style={{ padding: "1rem", fontSize: "0.875rem" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                    <span
                      onClick={() => handleCopyIp(record.ipAddress)}
                      title="Click to copy IP address"
                      style={{
                        fontFamily: "monospace",
                        fontSize: "0.825rem",
                        fontWeight: 600,
                        padding: "0.25rem 0.55rem",
                        borderRadius: "6px",
                        background: record.ipAddress && record.ipAddress !== "Google OAuth" && record.ipAddress !== "Unknown" 
                          ? "rgba(99, 102, 241, 0.08)" 
                          : "rgba(255, 255, 255, 0.04)",
                        border: "1px solid var(--border-color)",
                        color: record.ipAddress && record.ipAddress !== "Google OAuth" && record.ipAddress !== "Unknown" 
                          ? "var(--primary)" 
                          : "inherit",
                        cursor: "pointer",
                      }}
                    >
                      {record.ipAddress || "Unknown"}
                    </span>
                    {record.ipAddress && record.ipAddress !== "N/A" && (
                      <button
                        type="button"
                        onClick={() => handleCopyIp(record.ipAddress)}
                        title={`Copy ${record.ipAddress}`}
                        style={{
                          background: copiedIp === record.ipAddress ? "rgba(34, 197, 94, 0.15)" : "rgba(255, 255, 255, 0.06)",
                          color: copiedIp === record.ipAddress ? "#22c55e" : "inherit",
                          border: `1px solid ${copiedIp === record.ipAddress ? "#22c55e" : "var(--border-color)"}`,
                          borderRadius: "6px",
                          padding: "0.25rem 0.5rem",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {copiedIp === record.ipAddress ? (
                          <>
                            <Check size={12} style={{ color: "#22c55e" }} />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </td>
                <td style={{ padding: "1rem", fontSize: "0.875rem", opacity: 0.8, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={record.userAgent || ""}>
                  {record.userAgent || "N/A"}
                </td>
                <td style={{ padding: "1rem", fontSize: "0.875rem", textAlign: "center" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                    {/* Primary Direct Report Button */}
                    <button
                      type="button"
                      disabled={sendingRowId === record.id}
                      onClick={() => handleDirectReport(record)}
                      title={`Send report email directly to ${record.email}`}
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

                    {/* Customize Recipient Options Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenReportModal(record)}
                      title="Customize recipient or view attempt details"
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
            ))}
          </tbody>
        </table>

        {filteredRecords.length === 0 && (
          <p style={{ textAlign: "center", opacity: 0.7, padding: "2rem" }}>No login records found.</p>
        )}
      </div>

      {/* Report Email Customizer Modal */}
      {selectedRecord && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "var(--card-bg, #1e293b)", color: "inherit", borderRadius: "12px", border: "1px solid var(--border-color, #334155)", width: "100%", maxWidth: "520px", padding: "1.75rem", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Mail style={{ color: "var(--primary, #3b82f6)" }} size={20} />
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>Send Security Report Email</h3>
              </div>
              <button onClick={() => setSelectedRecord(null)} style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", opacity: 0.7 }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: "0.875rem", opacity: 0.8, marginBottom: "1rem" }}>
              Send a login report regarding the attempt for <strong>{selectedRecord.email}</strong>.
            </p>

            {/* Login Summary Box */}
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.75rem 1rem", marginBottom: "1.25rem", fontSize: "0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <span style={{ opacity: 0.7 }}>Date & Time:</span>
                <span>{new Date(selectedRecord.timestamp).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <span style={{ opacity: 0.7 }}>IP Address:</span>
                <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{selectedRecord.ipAddress || "Unknown"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ opacity: 0.7 }}>Status:</span>
                <span style={{ color: selectedRecord.success ? "var(--success, #22c55e)" : "var(--danger, #ef4444)", fontWeight: 600 }}>
                  {selectedRecord.success ? "Success" : "Failed"}
                </span>
              </div>
            </div>

            {/* Recipient Input */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                Recipient Email Address:
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="Enter recipient email (e.g. user@gmail.com)..."
                style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "transparent", color: "inherit", fontSize: "0.9rem" }}
              />
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                {selectedRecord.email && !selectedRecord.email.includes("unknown") && (
                  <button
                    type="button"
                    onClick={() => setRecipientEmail(selectedRecord.email)}
                    style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem", borderRadius: "4px", background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-color)", color: "inherit", cursor: "pointer" }}
                  >
                    Use Account Email ({selectedRecord.email})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setRecipientEmail("nishanthv041@gmail.com")}
                  style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem", borderRadius: "4px", background: "rgba(99, 102, 241, 0.1)", border: "1px solid var(--primary)", color: "var(--primary)", cursor: "pointer", fontWeight: 500 }}
                >
                  Send to Admin (nishanthv041@gmail.com)
                </button>
              </div>
            </div>

            {/* Feedback notification */}
            {modalFeedback && (
              <div
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  marginBottom: "1rem",
                  fontSize: "0.85rem",
                  backgroundColor: modalFeedback.type === "success" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
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
            <div style={{ fontSize: "0.78rem", opacity: 0.7, marginBottom: "1.25rem", padding: "0.5rem 0.75rem", background: "rgba(255,255,255,0.03)", borderRadius: "6px" }}>
              💡 <strong>Deliverability Note:</strong> Emails are sent directly via SMTP. If the recipient does not see the alert in their Primary Inbox within 1 minute, please check the <strong>Spam / Junk</strong> folder.
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                style={{ padding: "0.6rem 1rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "transparent", color: "inherit", cursor: "pointer" }}
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
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "var(--card-bg, #1e293b)", color: "inherit", borderRadius: "12px", border: "1px solid var(--border-color, #334155)", width: "100%", maxWidth: "480px", padding: "1.75rem", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Mail style={{ color: "var(--primary, #3b82f6)" }} size={20} />
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>Test Email Delivery</h3>
              </div>
              <button onClick={() => setIsTestModalOpen(false)} style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", opacity: 0.7 }}>
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
                style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "transparent", color: "inherit", fontSize: "0.9rem" }}
              />
            </div>

            {testFeedback && (
              <div
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  marginBottom: "1rem",
                  fontSize: "0.85rem",
                  backgroundColor: testFeedback.type === "success" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
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
                style={{ padding: "0.6rem 1rem", borderRadius: "6px", border: "1px solid var(--border-color)", background: "transparent", color: "inherit", cursor: "pointer" }}
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
