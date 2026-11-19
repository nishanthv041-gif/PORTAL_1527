"use client";

import { useState, useRef, useEffect, KeyboardEvent, DragEvent, ClipboardEvent } from "react";
import { 
  Send, 
  Paperclip, 
  X, 
  Loader2, 
  FileText, 
  AlertCircle,
  RefreshCw,
  Image as ImageIcon
} from "lucide-react";
import { uploadFileWithProgress } from "@/lib/uploadHelper";
import { ApiError } from "@/lib/apiFetch";

export interface QueuedAttachment {
  id: string;
  file: File;
  previewUrl?: string;
  isImage: boolean;
  progress: number;
  status: "pending" | "uploading" | "ready" | "failed";
  uploadedData?: {
    attachmentId: string;
    url: string;
    fileName: string;
    fileSize: number;
    fileType: string;
  };
  errorMessage?: string;
}

export interface ChatComposerProps {
  onSendMessage: (payload: {
    content?: string;
    messageType: "TEXT" | "AUDIO" | "FILE" | "IMAGE";
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    duration?: number;
    attachmentId?: string;
    attachmentIds?: string[];
  }) => Promise<boolean>;
  disabled?: boolean;
  placeholder?: string;
  maxFiles?: number;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;    // 10 MB
const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_FILES = 5;

export default function ChatComposer({ 
  onSendMessage, 
  disabled = false,
  placeholder = "Type a message...",
  maxFiles = MAX_FILES
}: ChatComposerProps) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<QueuedAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isSendingRef = useRef(false);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      attachments.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      });
      abortControllersRef.current.forEach((c) => c.abort());
    };
  }, [attachments]);

  // Adjust textarea height automatically
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const processFiles = (rawFiles: FileList | File[]) => {
    const fileList = Array.from(rawFiles);
    if (!fileList.length) return;

    if (attachments.length + fileList.length > maxFiles) {
      setComposerError(`You can attach a maximum of ${maxFiles} files per message.`);
      return;
    }

    setComposerError(null);
    const newQueue: QueuedAttachment[] = [];

    for (const file of fileList) {
      const isImg = file.type.startsWith("image/");
      const maxSize = isImg ? MAX_IMAGE_SIZE : MAX_DOCUMENT_SIZE;
      const maxMb = Math.round(maxSize / (1024 * 1024));

      if (file.size > maxSize) {
        setComposerError(`"${file.name}" exceeds the ${maxMb}MB limit for ${isImg ? "images" : "documents"}.`);
        continue;
      }

      const previewUrl = isImg ? URL.createObjectURL(file) : undefined;
      const id = `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      newQueue.push({
        id,
        file,
        previewUrl,
        isImage: isImg,
        progress: 0,
        status: "pending",
      });
    }

    if (newQueue.length > 0) {
      setAttachments((prev) => [...prev, ...newQueue]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Drag and drop handling
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isUploading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!disabled && !isUploading && e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  };

  // Clipboard paste handling (for images)
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled || isUploading) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    const filesToProcess: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        const file = items[i].getAsFile();
        if (file) filesToProcess.push(file);
      }
    }

    if (filesToProcess.length > 0) {
      e.preventDefault();
      processFiles(filesToProcess);
    }
  };

  const removeAttachment = (id: string) => {
    const controller = abortControllersRef.current.get(id);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(id);
    }

    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  // Main Submit handler (handles direct presigned upload and message submission)
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isSendingRef.current || isUploading || disabled) return;

    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;

    isSendingRef.current = true;
    setIsUploading(true);
    setComposerError(null);

    try {
      const uploadedResults: QueuedAttachment["uploadedData"][] = [];

      // 1. Upload any pending attachments
      for (const att of attachments) {
        if (att.status === "ready" && att.uploadedData) {
          uploadedResults.push(att.uploadedData);
          continue;
        }

        // Set status to uploading
        setAttachments((prev) =>
          prev.map((a) => (a.id === att.id ? { ...a, status: "uploading", progress: 5 } : a))
        );

        const controller = new AbortController();
        abortControllersRef.current.set(att.id, controller);

        try {
          const res = await uploadFileWithProgress(
            att.file,
            (pct) => {
              setAttachments((prev) =>
                prev.map((a) => (a.id === att.id ? { ...a, progress: pct } : a))
              );
            },
            controller.signal
          );

          abortControllersRef.current.delete(att.id);

          setAttachments((prev) =>
            prev.map((a) =>
              a.id === att.id
                ? { ...a, status: "ready", progress: 100, uploadedData: res }
                : a
            )
          );
          uploadedResults.push(res);
        } catch (uploadErr: any) {
          abortControllersRef.current.delete(att.id);
          const message =
            uploadErr instanceof ApiError
              ? uploadErr.userMessage
              : uploadErr?.message || "File upload failed. Please try again.";

          setAttachments((prev) =>
            prev.map((a) =>
              a.id === att.id ? { ...a, status: "failed", errorMessage: message } : a
            )
          );
          throw new Error(`Upload failed for "${att.file.name}": ${message}`);
        }
      }

      // 2. Dispatch message payload
      const primaryUpload = uploadedResults[0];
      const allAttachmentIds = uploadedResults.map((u) => u!.attachmentId);

      const messageType = primaryUpload
        ? (primaryUpload.fileType.startsWith("image/") ? "IMAGE" : "FILE")
        : "TEXT";

      const fallbackContent = primaryUpload
        ? (primaryUpload.fileType.startsWith("image/") ? "Sent an image" : primaryUpload.fileName)
        : "";

      const success = await onSendMessage({
        content: trimmed || fallbackContent,
        messageType,
        fileUrl: primaryUpload?.url,
        fileName: primaryUpload?.fileName,
        fileSize: primaryUpload?.fileSize,
        fileType: primaryUpload?.fileType,
        attachmentId: primaryUpload?.attachmentId,
        attachmentIds: allAttachmentIds,
      });

      if (success) {
        // Clear composer state only on success
        setText("");
        attachments.forEach((a) => {
          if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
        });
        setAttachments([]);
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      } else {
        setComposerError("Failed to deliver message. Your text and attachments have been preserved.");
      }
    } catch (err: any) {
      console.error("[ChatComposer] Submit error:", err);
      setComposerError(err?.message || "Failed to send message. Please retry.");
    } finally {
      isSendingRef.current = false;
      setIsUploading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      handleSubmit();
    }
  };

  const hasContent = text.trim().length > 0 || attachments.length > 0;

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        width: "100%",
        position: "relative",
        boxSizing: "border-box",
        transition: "background-color 0.2s ease",
      }}
    >
      {/* Drag Over Overlay */}
      {isDragOver && (
        <div style={{
          position: "absolute",
          inset: "-8px",
          backgroundColor: "rgba(99, 102, 241, 0.08)",
          border: "2px dashed var(--primary, #6366f1)",
          borderRadius: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
          pointerEvents: "none",
        }}>
          <span style={{ 
            fontWeight: 600, 
            color: "var(--primary, #6366f1)", 
            backgroundColor: "#fff", 
            padding: "6px 14px", 
            borderRadius: "20px", 
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)" 
          }}>
            Drop files here to attach (Max 5 files)
          </span>
        </div>
      )}

      {/* Error Banner with Retry */}
      {composerError && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.55rem 0.85rem",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "10px",
          color: "var(--danger, #ef4444)",
          fontSize: "0.82rem",
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{composerError}</span>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isUploading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "none",
              border: "1px solid currentColor",
              borderRadius: "4px",
              padding: "2px 6px",
              color: "inherit",
              fontSize: "0.75rem",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            <RefreshCw size={12} /> Retry
          </button>
          <button
            type="button"
            onClick={() => setComposerError(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Attachment Chips List */}
      {attachments.length > 0 && (
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          padding: "0.25rem 0",
        }}>
          {attachments.map((att) => (
            <div
              key={att.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                padding: "0.45rem 0.65rem",
                backgroundColor: att.status === "failed" ? "rgba(239, 68, 68, 0.08)" : "var(--input-bg, #f8fafc)",
                border: `1px solid ${att.status === "failed" ? "rgba(239, 68, 68, 0.3)" : "var(--border-color, #e2e8f0)"}`,
                borderRadius: "10px",
                minWidth: "160px",
                maxWidth: "240px",
                position: "relative",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {att.isImage && att.previewUrl ? (
                  <img
                    src={att.previewUrl}
                    alt={att.file.name}
                    style={{ width: "36px", height: "36px", objectFit: "cover", borderRadius: "6px" }}
                  />
                ) : (
                  <div style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(99, 102, 241, 0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--primary, #6366f1)",
                    flexShrink: 0,
                  }}>
                    {att.isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                  <span style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {att.file.name}
                  </span>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-secondary, #64748b)" }}>
                    {(att.file.size / 1024).toFixed(1)} KB
                    {att.status === "uploading" && ` • ${att.progress}%`}
                    {att.status === "ready" && " • Ready"}
                    {att.status === "failed" && " • Failed"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  disabled={disabled}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-secondary, #64748b)",
                    cursor: "pointer",
                    padding: "2px",
                    borderRadius: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="Remove attachment"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Progress bar during upload */}
              {att.status === "uploading" && (
                <div style={{
                  height: "3px",
                  width: "100%",
                  backgroundColor: "rgba(99, 102, 241, 0.2)",
                  borderRadius: "2px",
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${att.progress}%`,
                    backgroundColor: "var(--primary, #6366f1)",
                    transition: "width 0.2s ease",
                  }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Main Composer Bar */}
      <div style={{
        display: "flex",
        alignItems: "flex-end",
        gap: "0.5rem",
        width: "100%",
        boxSizing: "border-box",
      }}>
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

        {/* Input Text Box with Paperclip Attachment Button */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "flex-end",
          padding: "0.45rem 0.75rem",
          borderRadius: "24px",
          backgroundColor: "var(--input-bg, #f8fafc)",
          border: "1.5px solid var(--border-color, #e2e8f0)",
          minHeight: "46px",
          boxSizing: "border-box",
          gap: "0.4rem",
        }}>
          {/* Paperclip Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isUploading || attachments.length >= maxFiles}
            title={attachments.length >= maxFiles ? `Limit of ${maxFiles} files reached` : "Attach image or document (drag & drop or Ctrl+V supported)"}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-secondary, #64748b)",
              cursor: disabled || isUploading || attachments.length >= maxFiles ? "not-allowed" : "pointer",
              padding: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              flexShrink: 0,
              opacity: attachments.length >= maxFiles ? 0.4 : 1,
            }}
          >
            <Paperclip size={18} />
          </button>

          {/* Text Area with Paste support */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={disabled ? "Chat is disabled" : placeholder}
            disabled={disabled || isUploading}
            rows={1}
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              color: "inherit",
              resize: "none",
              outline: "none",
              fontSize: "0.92rem",
              lineHeight: "1.4",
              fontFamily: "inherit",
              maxHeight: "120px",
              padding: "4px 0",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Send Button */}
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={!hasContent || disabled || isUploading}
          title="Send message"
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            backgroundColor: hasContent ? "var(--primary, #6366f1)" : "var(--border-color, #cbd5e1)",
            color: "#ffffff",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: hasContent && !disabled && !isUploading ? "pointer" : "not-allowed",
            opacity: hasContent && !disabled && !isUploading ? 1 : 0.6,
            flexShrink: 0,
            boxShadow: hasContent ? "0 2px 8px rgba(99, 102, 241, 0.3)" : "none",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            if (hasContent && !disabled && !isUploading) {
              e.currentTarget.style.transform = "scale(1.05)";
            }
          }}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}
