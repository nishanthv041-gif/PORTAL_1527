"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { 
  Send, 
  Paperclip, 
  X, 
  Loader2, 
  FileText, 
  AlertCircle 
} from "lucide-react";

interface QueuedAttachment {
  file: File;
  previewUrl?: string;
  isImage: boolean;
}

interface ChatComposerProps {
  onSendMessage: (payload: {
    content?: string;
    messageType: "TEXT" | "AUDIO" | "FILE" | "IMAGE";
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    duration?: number;
  }) => Promise<boolean>;
  disabled?: boolean;
}

export default function ChatComposer({ onSendMessage, disabled = false }: ChatComposerProps) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<QueuedAttachment | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Clean up preview URLs on unmount
  useEffect(() => {
    return () => {
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    };
  }, [attachment]);

  // Adjust textarea height automatically
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  // File selection (documents & images - voice recording options removed)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      setUploadError("Selected file exceeds the maximum size limit of 25MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploadError(null);
    const isImage = file.type.startsWith("image/");
    const previewUrl = isImage ? URL.createObjectURL(file) : undefined;

    setAttachment({ file, previewUrl, isImage });
  };

  const removeAttachment = () => {
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Main Submit (Text or Attachment)
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isUploading || disabled) return;

    const trimmed = text.trim();
    if (!trimmed && !attachment) return;

    // If attachment exists, upload first
    if (attachment) {
      setIsUploading(true);
      setUploadError(null);

      try {
        const formData = new FormData();
        formData.append("file", attachment.file);
        formData.append("messageType", attachment.isImage ? "IMAGE" : "FILE");

        const res = await fetch("/api/messages/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || "Failed to upload file");
        }

        const success = await onSendMessage({
          content: trimmed || (attachment.isImage ? "Sent an image" : attachment.file.name),
          messageType: attachment.isImage ? "IMAGE" : "FILE",
          fileUrl: data.url,
          fileName: data.fileName,
          fileSize: data.fileSize,
          fileType: data.fileType,
        });

        if (success) {
          setText("");
          removeAttachment();
          if (textareaRef.current) textareaRef.current.style.height = "auto";
        }
      } catch (err: unknown) {
        console.error("File upload error:", err);
        setUploadError(err instanceof Error ? err.message : "Failed to upload file");
      } finally {
        setIsUploading(false);
      }
      return;
    }

    // Text Message
    const textToSend = trimmed;
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const success = await onSendMessage({
      content: textToSend,
      messageType: "TEXT",
    });

    if (!success) {
      setText(textToSend);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hasContent = text.trim().length > 0 || attachment !== null;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem",
      width: "100%",
      position: "relative",
    }}>
      {/* Upload Error Banner */}
      {uploadError && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.85rem",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "8px",
          color: "var(--danger, #ef4444)",
          fontSize: "0.82rem",
        }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{uploadError}</span>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Attachment Preview Box */}
      {attachment && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          padding: "0.5rem 0.85rem",
          backgroundColor: "var(--input-bg, rgba(0,0,0,0.03))",
          border: "1px solid var(--border-color, #e2e8f0)",
          borderRadius: "10px",
          maxWidth: "fit-content",
        }}>
          {attachment.isImage && attachment.previewUrl ? (
            <img
              src={attachment.previewUrl}
              alt="Preview"
              style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "6px" }}
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
              color: "var(--primary, #6366f1)"
            }}>
              <FileText size={18} />
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{
              fontSize: "0.82rem",
              fontWeight: 600,
              maxWidth: "200px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}>
              {attachment.file.name}
            </span>
            <span style={{ fontSize: "0.72rem", color: "var(--text-secondary, #64748b)" }}>
              {(attachment.file.size / 1024).toFixed(1)} KB
            </span>
          </div>
          <button
            type="button"
            onClick={removeAttachment}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-secondary, #64748b)",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              marginLeft: "0.3rem"
            }}
            title="Remove attachment"
          >
            <X size={15} />
          </button>
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
            disabled={disabled || isUploading}
            title="Attach image or document"
            style={{
              background: "none",
              border: "none",
              color: "var(--text-secondary, #64748b)",
              cursor: disabled || isUploading ? "not-allowed" : "pointer",
              padding: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              flexShrink: 0,
            }}
          >
            <Paperclip size={18} />
          </button>

          {/* Text Area */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Chat is disabled" : "Type a message..."}
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
