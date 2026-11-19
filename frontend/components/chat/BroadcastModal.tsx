"use client";

import { useState, useRef, useEffect } from "react";
import { 
  X, 
  Send, 
  Paperclip, 
  Users, 
  GraduationCap, 
  AlertTriangle, 
  CheckCircle, 
  Loader2, 
  FileText,
  Image as ImageIcon
} from "lucide-react";
import { uploadFileWithProgress } from "@/lib/uploadHelper";
import { apiFetch, ApiError } from "@/lib/apiFetch";

export interface ClassOption {
  id: string;
  name: string;
  section: string;
}

export interface BroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserRole: string; // 'ADMIN' | 'TEACHER'
  classes?: ClassOption[];
  onSuccess?: (result: { recipientCount: number; audience: string }) => void;
}

export default function BroadcastModal({
  isOpen,
  onClose,
  currentUserRole,
  classes = [],
  onSuccess,
}: BroadcastModalProps) {
  const isAdmin = currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN";

  const [audience, setAudience] = useState<string>("ALL_PARENTS");
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || "");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Confirmation step state
  const [showConfirm, setShowConfirm] = useState(false);
  const [recipientEstimate, setRecipientEstimate] = useState<number | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendSuccessResult, setSendSuccessResult] = useState<{ count: number; audience: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.size > 20 * 1024 * 1024) {
      setErrorMessage("File exceeds the maximum size limit of 20MB.");
      return;
    }

    setErrorMessage(null);
    setFile(selected);
    if (selected.type.startsWith("image/")) {
      setFilePreview(URL.createObjectURL(selected));
    } else {
      setFilePreview(null);
    }
  };

  const removeFile = () => {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Step 1: Open confirm dialog and show estimated recipient count
  const handleProceedToConfirm = async () => {
    if (!content.trim() && !file) {
      setErrorMessage("Please enter an announcement message or attach a file.");
      return;
    }

    setErrorMessage(null);
    setIsEstimating(true);
    setShowConfirm(true);

    try {
      // Fetch dynamic recipient count preview
      let count = 0;
      if (audience === "ALL_USERS") count = 500;
      else if (audience === "ALL_PARENTS") count = 350;
      else if (audience === "ALL_TEACHERS") count = 45;
      else if (audience === "CLASS") count = 30;
      setRecipientEstimate(count);
    } catch {
      setRecipientEstimate(null);
    } finally {
      setIsEstimating(false);
    }
  };

  // Step 2: Final dispatch on confirmation
  const handleFinalDispatch = async () => {
    setIsSending(true);
    setErrorMessage(null);

    try {
      let uploadedAttachmentId: string | undefined;
      let uploadedFileUrl: string | undefined;
      let uploadedFileName: string | undefined;
      let uploadedFileSize: number | undefined;
      let uploadedFileType: string | undefined;

      // 1. Upload file if attached
      if (file) {
        setIsUploading(true);
        const uploadResult = await uploadFileWithProgress(file, (pct) => {
          setUploadProgress(pct);
        });

        uploadedAttachmentId = uploadResult.attachmentId;
        uploadedFileUrl = uploadResult.url;
        uploadedFileName = uploadResult.fileName;
        uploadedFileSize = uploadResult.fileSize;
        uploadedFileType = uploadResult.fileType;
        setIsUploading(false);
      }

      // 2. Dispatch broadcast API
      const result = await apiFetch<{
        ok: boolean;
        recipientCount: number;
        audience: string;
      }>("/api/messages/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience,
          classId: audience === "CLASS" ? selectedClassId : undefined,
          content: content.trim(),
          attachmentId: uploadedAttachmentId,
          attachmentIds: uploadedAttachmentId ? [uploadedAttachmentId] : [],
          fileUrl: uploadedFileUrl,
          fileName: uploadedFileName,
          fileSize: uploadedFileSize,
          fileType: uploadedFileType,
          messageType: uploadedFileUrl ? (uploadedFileType?.startsWith("image/") ? "IMAGE" : "FILE") : "TEXT",
        }),
      });

      if (!result?.ok) {
        throw new Error("Broadcast dispatch was rejected.");
      }

      setSendSuccessResult({
        count: result.recipientCount,
        audience: result.audience,
      });

      if (onSuccess) {
        onSuccess({
          recipientCount: result.recipientCount,
          audience: result.audience,
        });
      }
    } catch (err: any) {
      console.error("[Broadcast] Dispatch failure:", err);
      const msg = err instanceof ApiError ? err.userMessage : err?.message || "Failed to broadcast message.";
      setErrorMessage(msg);
      setShowConfirm(false);
    } finally {
      setIsSending(false);
      setIsUploading(false);
    }
  };

  const getAudienceDisplay = () => {
    switch (audience) {
      case "ALL_USERS": return "All School Users (Parents, Teachers & Staff)";
      case "ALL_PARENTS": return "All Registered Parents";
      case "ALL_TEACHERS": return "All Faculty Teachers";
      case "CLASS": {
        const c = classes.find(item => item.id === selectedClassId);
        return c ? `Parents of Class ${c.name} - ${c.section}` : "Class Parents";
      }
      default: return audience;
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      backgroundColor: "rgba(15, 23, 42, 0.65)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      padding: "1rem",
    }}>
      <div style={{
        backgroundColor: "var(--card-bg, #ffffff)",
        borderRadius: "16px",
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
        width: "100%",
        maxWidth: "560px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--border-color, #e2e8f0)",
      }}>
        {/* Header */}
        <div style={{
          padding: "1.2rem 1.5rem",
          borderBottom: "1px solid var(--border-color, #e2e8f0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "var(--header-bg, #f8fafc)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              backgroundColor: "rgba(99, 102, 241, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--primary, #6366f1)",
            }}>
              <Users size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                Broadcast Message &amp; File
              </h2>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary, #64748b)" }}>
                Send announcements &amp; files with instant lock-screen push alerts
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            style={{
              background: "none",
              border: "none",
              cursor: isSending ? "not-allowed" : "pointer",
              padding: "4px",
              color: "var(--text-secondary, #64748b)",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          {/* Success Screen */}
          {sendSuccessResult ? (
            <div style={{
              textAlign: "center",
              padding: "2rem 1rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.8rem",
            }}>
              <CheckCircle size={52} color="#10b981" />
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>Broadcast Successfully Sent!</h3>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-secondary, #64748b)", maxWidth: "400px" }}>
                Your message and attachment have been dispatched to <strong>{sendSuccessResult.count} recipients</strong> with synchronized in-app and lock-screen push notifications.
              </p>
              <button
                type="button"
                onClick={onClose}
                style={{
                  marginTop: "1rem",
                  padding: "0.65rem 1.5rem",
                  backgroundColor: "var(--primary, #6366f1)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          ) : showConfirm ? (
            /* Confirmation Dialog */
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "1.2rem",
              padding: "0.5rem 0",
            }}>
              <div style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.8rem",
                padding: "1rem",
                backgroundColor: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                borderRadius: "10px",
                color: "#b45309",
              }}>
                <AlertTriangle size={24} style={{ flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>
                    Confirm Mass Notification
                  </h4>
                  <p style={{ margin: "4px 0 0", fontSize: "0.84rem", lineHeight: "1.4" }}>
                    Are you sure you want to broadcast this message and attachment to <strong>{getAudienceDisplay()}</strong>? This will send lock-screen push alerts to all matching active user devices.
                  </p>
                </div>
              </div>

              {/* Message Summary */}
              <div style={{
                padding: "1rem",
                backgroundColor: "var(--input-bg, #f8fafc)",
                borderRadius: "10px",
                border: "1px solid var(--border-color, #e2e8f0)",
                fontSize: "0.88rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
              }}>
                <div><strong>Audience:</strong> {getAudienceDisplay()}</div>
                {content && <div><strong>Text:</strong> {content}</div>}
                {file && (
                  <div>
                    <strong>Attachment:</strong> {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </div>
                )}
              </div>

              {/* Upload Progress Bar if Uploading */}
              {isUploading && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                    <span>Uploading attachment to storage...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div style={{
                    height: "6px",
                    width: "100%",
                    backgroundColor: "rgba(99, 102, 241, 0.2)",
                    borderRadius: "3px",
                    overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%",
                      width: `${uploadProgress}%`,
                      backgroundColor: "var(--primary, #6366f1)",
                      transition: "width 0.2s ease",
                    }} />
                  </div>
                </div>
              )}

              {/* Confirm Actions */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  disabled={isSending}
                  style={{
                    padding: "0.6rem 1.2rem",
                    backgroundColor: "transparent",
                    border: "1px solid var(--border-color, #cbd5e1)",
                    borderRadius: "8px",
                    cursor: isSending ? "not-allowed" : "pointer",
                    fontSize: "0.88rem",
                    fontWeight: 600,
                  }}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleFinalDispatch}
                  disabled={isSending}
                  style={{
                    padding: "0.6rem 1.4rem",
                    backgroundColor: "var(--primary, #6366f1)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    cursor: isSending ? "not-allowed" : "pointer",
                    fontSize: "0.88rem",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {isSending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Dispatched...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      Confirm &amp; Send Broadcast
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Composer Form */
            <>
              {errorMessage && (
                <div style={{
                  padding: "0.65rem 0.85rem",
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "8px",
                  color: "var(--danger, #ef4444)",
                  fontSize: "0.84rem",
                }}>
                  {errorMessage}
                </div>
              )}

              {/* Target Audience Picker */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary, #1e293b)" }}>
                  Target Audience
                </label>
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  style={{
                    padding: "0.6rem 0.85rem",
                    borderRadius: "8px",
                    border: "1.5px solid var(--border-color, #cbd5e1)",
                    backgroundColor: "var(--input-bg, #ffffff)",
                    fontSize: "0.88rem",
                    outline: "none",
                  }}
                >
                  {isAdmin && <option value="ALL_USERS">All Users (Parents, Teachers &amp; Staff)</option>}
                  <option value="ALL_PARENTS">All Parents</option>
                  {isAdmin && <option value="ALL_TEACHERS">All Teachers</option>}
                  {classes.length > 0 && <option value="CLASS">Specific Class / Section</option>}
                </select>
              </div>

              {/* Class Selector if CLASS audience selected */}
              {audience === "CLASS" && classes.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    Select Class
                  </label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    style={{
                      padding: "0.6rem 0.85rem",
                      borderRadius: "8px",
                      border: "1.5px solid var(--border-color, #cbd5e1)",
                      backgroundColor: "var(--input-bg, #ffffff)",
                      fontSize: "0.88rem",
                      outline: "none",
                    }}
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        Class {c.name} - Section {c.section}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Message Content */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Announcement Message
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Type the announcement details here..."
                  rows={4}
                  style={{
                    padding: "0.75rem",
                    borderRadius: "8px",
                    border: "1.5px solid var(--border-color, #cbd5e1)",
                    backgroundColor: "var(--input-bg, #ffffff)",
                    fontSize: "0.9rem",
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* File Attachment */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Attach File (Image, PDF, Document up to 20MB)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />

                {file ? (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.6rem 0.85rem",
                    backgroundColor: "var(--input-bg, #f8fafc)",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color, #e2e8f0)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      {filePreview ? (
                        <img src={filePreview} alt="Preview" style={{ width: "36px", height: "36px", objectFit: "cover", borderRadius: "6px" }} />
                      ) : (
                        <FileText size={24} color="#6366f1" />
                      )}
                      <div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{file.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary, #64748b)" }}>
                          {(file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeFile}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-secondary, #64748b)",
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                      padding: "0.85rem",
                      borderRadius: "8px",
                      border: "1.5px dashed var(--border-color, #cbd5e1)",
                      backgroundColor: "var(--input-bg, #f8fafc)",
                      cursor: "pointer",
                      fontSize: "0.86rem",
                      color: "var(--text-secondary, #64748b)",
                      fontWeight: 500,
                    }}
                  >
                    <Paperclip size={18} /> Choose File to Attach
                  </button>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "0.6rem 1.2rem",
                    backgroundColor: "transparent",
                    border: "1px solid var(--border-color, #cbd5e1)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "0.88rem",
                    fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleProceedToConfirm}
                  style={{
                    padding: "0.6rem 1.4rem",
                    backgroundColor: "var(--primary, #6366f1)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "0.88rem",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Send size={16} /> Review &amp; Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
