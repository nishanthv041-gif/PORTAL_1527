"use client";

import { useState } from "react";
import { Search, CheckCircle2, XCircle, Clock, Mail, Send, X, AlertCircle } from "lucide-react";
import { LoginAttempt } from "@prisma/client";
import { sendReportEmailAction, sendTestEmailAction } from "@/backend/api/actions/dashboard/admin/login-status/actions";

export default function LoginStatusClient({ records }: { records: LoginAttempt[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<LoginAttempt | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Quick Test Email State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState("iniya.k008@gmail.com");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const filteredRecords = records.filter((record) => {
    return (
      record.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.ipAddress || "").includes(searchTerm)
    );
  });

  const handleOpenReportModal = (record: LoginAttempt) => {
    setSelectedRecord(record);
    setRecipientEmail(record.email);
    setModalFeedback(null);
  };

  const handleSendReport = async () => {
    if (!selectedRecord) return;
    setIsSending(true);
    setModalFeedback(null);

    try {
      const res = await sendReportEmailAction(
        selectedRecord.email,
        selectedRecord.ipAddress,
        selectedRecord.timestamp,
        selectedRecord.success,
        recipientEmail
      );

      if (res?.error) {
        setModalFeedback({ type: "error", message: res.error });
      } else {
        setModalFeedback({
          type: "success",
          message: res.message || `Security alert email sent to ${recipientEmail}!`,
        });
      }
    } catch (err: any) {
      setModalFeedback({
        type: "error",
        message: err?.message || "Failed to send email. Please check server connection.",
      });
    } finally {
      setIsSending(false);
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
          message: res.message || `Test email sent to ${testEmailAddress}!`,
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
                <td style={{ padding: "1rem", fontSize: "0.875rem", opacity: 0.8 }}>
                  {record.ipAddress || "N/A"}
                </td>
                <td style={{ padding: "1rem", fontSize: "0.875rem", opacity: 0.8, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={record.userAgent || ""}>
                  {record.userAgent || "N/A"}
                </td>
                <td style={{ padding: "1rem", fontSize: "0.875rem", textAlign: "center" }}>
                  <button
                    onClick={() => handleOpenReportModal(record)}
                    style={{
                      padding: "0.45rem 0.9rem",
                      backgroundColor: "var(--primary)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <Send size={13} /> Report
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredRecords.length === 0 && (
          <p style={{ textAlign: "center", opacity: 0.7, padding: "2rem" }}>No login records found.</p>
        )}
      </div>

      {/* Report Email Modal */}
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
              Send an alert regarding the login attempt for <strong>{selectedRecord.email}</strong>.
            </p>

            {/* Login Summary Box */}
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.75rem 1rem", marginBottom: "1.25rem", fontSize: "0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <span style={{ opacity: 0.7 }}>Date & Time:</span>
                <span>{new Date(selectedRecord.timestamp).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <span style={{ opacity: 0.7 }}>IP Address:</span>
                <span>{selectedRecord.ipAddress || "Unknown"}</span>
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
                placeholder="Enter recipient email..."
                style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "transparent", color: "inherit", fontSize: "0.9rem" }}
              />
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setRecipientEmail(selectedRecord.email)}
                  style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", borderRadius: "4px", background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-color)", color: "inherit", cursor: "pointer" }}
                >
                  Use {selectedRecord.email}
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientEmail("iniya.k008@gmail.com")}
                  style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", borderRadius: "4px", background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-color)", color: "inherit", cursor: "pointer" }}
                >
                  Send to iniya.k008@gmail.com
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
                disabled={isSending}
                onClick={handleSendReport}
                style={{
                  padding: "0.6rem 1.25rem",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "var(--primary)",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: isSending ? "not-allowed" : "pointer",
                  opacity: isSending ? 0.7 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <Send size={15} />
                {isSending ? "Sending Alert..." : "Send Email Now"}
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
                placeholder="e.g. iniya.k008@gmail.com"
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
                <Send size={15} />
                {isSendingTest ? "Sending Test..." : "Send Test Now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
