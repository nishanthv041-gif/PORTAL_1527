"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { 
  Send, 
  Mic, 
  Paperclip, 
  Trash2, 
  X, 
  Square, 
  Play, 
  Pause, 
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

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const previewAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Clean up media streams and timers on unmount
  useEffect(() => {
    return () => {
      stopMediaTracks();
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl);
    };
  }, [previewAudioUrl]);

  // Adjust textarea height automatically
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const stopMediaTracks = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  // Start Voice Recording
  const startRecording = async () => {
    setUploadError(null);
    setRecordedAudioBlob(null);
    if (previewAudioUrl) {
      URL.revokeObjectURL(previewAudioUrl);
      setPreviewAudioUrl(null);
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setUploadError("Audio recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Select supported audio MIME type
      let mimeType = "audio/webm";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
        mimeType = "audio/ogg;codecs=opus";
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      console.error("Microphone access error:", err);
      if (err instanceof Error && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        setUploadError("Microphone permission denied. Please allow microphone access in your browser.");
      } else {
        setUploadError("Unable to access microphone. Please check your audio device.");
      }
    }
  };

  // Stop recording and create preview
  const stopRecordingAndPreview = () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);

    mediaRecorderRef.current.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, {
        type: mediaRecorderRef.current?.mimeType || "audio/webm",
      });
      setRecordedAudioBlob(audioBlob);
      const url = URL.createObjectURL(audioBlob);
      setPreviewAudioUrl(url);
      stopMediaTracks();
    };

    mediaRecorderRef.current.stop();
    setIsRecording(false);
  };

  // Cancel & discard recording
  const cancelRecording = () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    stopMediaTracks();
    setIsRecording(false);
    setRecordingSeconds(0);
    setRecordedAudioBlob(null);
    if (previewAudioUrl) {
      URL.revokeObjectURL(previewAudioUrl);
      setPreviewAudioUrl(null);
    }
    setIsPreviewPlaying(false);
  };

  // Preview audio play/pause
  const togglePreviewPlay = () => {
    if (!previewAudioUrl) return;
    if (!previewAudioElementRef.current) {
      previewAudioElementRef.current = new Audio(previewAudioUrl);
      previewAudioElementRef.current.onended = () => setIsPreviewPlaying(false);
    }

    if (isPreviewPlaying) {
      previewAudioElementRef.current.pause();
      setIsPreviewPlaying(false);
    } else {
      previewAudioElementRef.current.play().then(() => setIsPreviewPlaying(true));
    }
  };

  // File selection
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

  // Send voice note
  const sendVoiceNote = async () => {
    let blobToSend = recordedAudioBlob;
    let durationSecs = recordingSeconds;

    // If currently still recording, stop and grab blob
    if (isRecording && mediaRecorderRef.current) {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      await new Promise<void>((resolve) => {
        if (!mediaRecorderRef.current) return resolve();
        mediaRecorderRef.current.onstop = () => {
          blobToSend = new Blob(audioChunksRef.current, {
            type: mediaRecorderRef.current?.mimeType || "audio/webm",
          });
          resolve();
        };
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      });
      stopMediaTracks();
    }

    if (!blobToSend) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const ext = blobToSend.type.includes("mp4") ? "m4a" : "webm";
      const audioFile = new File([blobToSend], `voice-note-${Date.now()}.${ext}`, {
        type: blobToSend.type,
      });

      const formData = new FormData();
      formData.append("file", audioFile);
      formData.append("messageType", "AUDIO");

      const res = await fetch("/api/messages/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to upload audio message");
      }

      await onSendMessage({
        content: "🎤 Voice message",
        messageType: "AUDIO",
        fileUrl: data.url,
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType,
        duration: durationSecs || 1,
      });

      cancelRecording();
    } catch (err: unknown) {
      console.error("Audio send error:", err);
      setUploadError(err instanceof Error ? err.message : "Failed to send voice message");
    } finally {
      setIsUploading(false);
    }
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
      // Restore on failure
      setText(textToSend);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
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
          justifyContent: "space-between",
          gap: "0.5rem",
          padding: "0.5rem 0.85rem",
          borderRadius: "8px",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          color: "var(--danger, #ef4444)",
          fontSize: "0.825rem",
          border: "1px solid rgba(239, 68, 68, 0.2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{uploadError}</span>
          </div>
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
          gap: "0.75rem",
          padding: "0.5rem 0.75rem",
          borderRadius: "10px",
          backgroundColor: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border-color, #e2e8f0)",
          width: "fit-content",
          maxWidth: "100%",
          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
        }}>
          {attachment.isImage && attachment.previewUrl ? (
            <img
              src={attachment.previewUrl}
              alt="Preview"
              style={{ width: "42px", height: "42px", objectFit: "cover", borderRadius: "6px" }}
            />
          ) : (
            <div style={{
              width: "42px",
              height: "42px",
              borderRadius: "6px",
              backgroundColor: "rgba(99, 102, 241, 0.1)",
              color: "var(--primary, #6366f1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <FileText size={22} />
            </div>
          )}

          <div style={{ minWidth: 0, maxWidth: "200px" }}>
            <p style={{
              margin: 0,
              fontSize: "0.85rem",
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {attachment.file.name}
            </p>
            <span style={{ fontSize: "0.725rem", opacity: 0.7 }}>
              {(attachment.file.size / 1024).toFixed(0)} KB
            </span>
          </div>

          <button
            type="button"
            onClick={removeAttachment}
            disabled={isUploading}
            style={{
              background: "none",
              border: "none",
              color: "var(--danger, #ef4444)",
              cursor: "pointer",
              padding: "0.25rem",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Remove attachment"
          >
            <X size={16} />
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
          accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

        {/* Normal Input State vs Recording State */}
        {isRecording || previewAudioUrl ? (
          /* Voice Recording / Preview Toolbar */
          <div style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.6rem 1rem",
            borderRadius: "24px",
            backgroundColor: "var(--card-bg, #ffffff)",
            border: "1px solid var(--border-color, #e2e8f0)",
            minHeight: "44px",
            boxSizing: "border-box",
          }}>
            {/* Left: Timer / Recording Indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              {isRecording ? (
                <>
                  <div style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    backgroundColor: "#ef4444",
                    boxShadow: "0 0 8px #ef4444",
                    animation: "pulse 1.2s infinite ease-in-out",
                  }} />
                  <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "#ef4444" }}>
                    {formatTimer(recordingSeconds)}
                  </span>
                  <span style={{ fontSize: "0.8rem", opacity: 0.6, marginLeft: "0.5rem" }}>
                    Recording voice message...
                  </span>
                </>
              ) : (
                /* Preview State */
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <button
                    type="button"
                    onClick={togglePreviewPlay}
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      backgroundColor: "var(--primary, #6366f1)",
                      color: "#ffffff",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    {isPreviewPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                  </button>
                  <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                    {formatTimer(recordingSeconds)}
                  </span>
                  <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>
                    Preview ready
                  </span>
                </div>
              )}
            </div>

            {/* Right: Controls (Cancel, Stop, Send) */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              {/* Discard / Delete */}
              <button
                type="button"
                onClick={cancelRecording}
                disabled={isUploading}
                title="Discard recording"
                style={{
                  padding: "0.45rem",
                  background: "transparent",
                  border: "none",
                  color: "var(--danger, #ef4444)",
                  cursor: "pointer",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Trash2 size={18} />
              </button>

              {/* Stop & Preview button (if recording) */}
              {isRecording && (
                <button
                  type="button"
                  onClick={stopRecordingAndPreview}
                  title="Stop and preview"
                  style={{
                    padding: "0.45rem",
                    background: "rgba(0,0,0,0.06)",
                    border: "none",
                    color: "inherit",
                    cursor: "pointer",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Square size={16} fill="currentColor" />
                </button>
              )}

              {/* Send voice message */}
              <button
                type="button"
                onClick={sendVoiceNote}
                disabled={isUploading}
                title="Send voice message"
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "50%",
                  backgroundColor: "var(--primary, #6366f1)",
                  color: "#ffffff",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: isUploading ? "not-allowed" : "pointer",
                  opacity: isUploading ? 0.7 : 1,
                  boxShadow: "0 2px 6px rgba(99, 102, 241, 0.3)",
                }}
              >
                {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        ) : (
          /* Normal Message Input Toolbar */
          <>
            {/* Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              title="Attach document, image, or audio"
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "50%",
                backgroundColor: "var(--card-bg, #ffffff)",
                border: "1px solid var(--border-color, #e2e8f0)",
                color: "var(--foreground, #1e293b)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: disabled || isUploading ? "not-allowed" : "pointer",
                opacity: disabled || isUploading ? 0.6 : 0.85,
                flexShrink: 0,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.85")}
            >
              <Paperclip size={18} />
            </button>

            {/* Textarea Input */}
            <div style={{
              flex: 1,
              position: "relative",
              display: "flex",
              alignItems: "center",
              borderRadius: "22px",
              backgroundColor: "var(--card-bg, #ffffff)",
              border: "1px solid var(--border-color, #e2e8f0)",
              padding: "0.4rem 0.85rem",
              boxSizing: "border-box",
            }}>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={disabled || isUploading}
                rows={1}
                style={{
                  width: "100%",
                  maxHeight: "120px",
                  border: "none",
                  outline: "none",
                  backgroundColor: "transparent",
                  color: "inherit",
                  fontSize: "0.925rem",
                  lineHeight: "1.4",
                  resize: "none",
                  padding: "0.25rem 0",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Dynamic Action: Send or Microphone */}
            {hasContent ? (
              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={disabled || isUploading}
                title="Send message"
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "50%",
                  backgroundColor: "var(--primary, #6366f1)",
                  color: "#ffffff",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: disabled || isUploading ? "not-allowed" : "pointer",
                  opacity: disabled || isUploading ? 0.7 : 1,
                  flexShrink: 0,
                  boxShadow: "0 2px 8px rgba(99, 102, 241, 0.3)",
                  transition: "transform 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={disabled || isUploading}
                title="Record voice message"
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "50%",
                  backgroundColor: "var(--card-bg, #ffffff)",
                  border: "1px solid var(--border-color, #e2e8f0)",
                  color: "var(--primary, #6366f1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: disabled || isUploading ? "not-allowed" : "pointer",
                  opacity: disabled || isUploading ? 0.6 : 1,
                  flexShrink: 0,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                  transition: "transform 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                <Mic size={19} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
