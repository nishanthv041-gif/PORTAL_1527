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
  AlertCircle,
  RotateCcw,
  Sparkles
} from "lucide-react";
import { 
  getOptimalAudioConstraints, 
  createVoiceRecordingPipeline, 
  VoiceRecorderPipeline, 
  playbackEnhancer 
} from "@/frontend/utils/audioProcessor";
import { audioPlaybackCoordinator } from "@/frontend/utils/audioPlaybackManager";

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
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0); // Live RMS vocal volume 0.0 - 1.0
  const [previewEnhanced, setPreviewEnhanced] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioPipelineRef = useRef<VoiceRecorderPipeline | null>(null);
  const visualizerRafRef = useRef<number | null>(null);
  const previewAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const enhancerControlsRef = useRef<ReturnType<typeof playbackEnhancer.attachElement> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const previewUrlRef = useRef<string | null>(null);
  useEffect(() => {
    previewUrlRef.current = previewAudioUrl;
  }, [previewAudioUrl]);

  // Clean up media streams and timers on unmount only
  useEffect(() => {
    return () => {
      stopMediaTracks();
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  // Clean up enhancer on unmount or preview close
  useEffect(() => {
    return () => {
      audioPlaybackCoordinator.releasePlayback("composer-preview");
      if (enhancerControlsRef.current) {
        enhancerControlsRef.current.disconnect();
      }
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
    if (visualizerRafRef.current) {
      cancelAnimationFrame(visualizerRafRef.current);
      visualizerRafRef.current = null;
    }
    if (audioPipelineRef.current) {
      audioPipelineRef.current.cleanup();
      audioPipelineRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setAudioLevel(0);
  };

  // Start Voice Recording with Smart Amplification & Audio Stabilization
  const startRecording = async () => {
    setUploadError(null);
    setRecordedAudioBlob(null);
    if (previewAudioUrl) {
      URL.revokeObjectURL(previewAudioUrl);
      setPreviewAudioUrl(null);
    }
    if (previewAudioElementRef.current) {
      previewAudioElementRef.current.pause();
    }
    stopMediaTracks();
    setIsPreviewPlaying(false);
    setPreviewCurrentTime(0);
    setPreviewDuration(0);
    setAudioLevel(0);

    if (!navigator.mediaDevices?.getUserMedia) {
      setUploadError("Audio recording is not supported in this browser.");
      return;
    }

    try {
      // 1. Get raw microphone stream with browser AGC and noise suppression
      const constraints = getOptimalAudioConstraints();
      const rawStream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
      mediaStreamRef.current = rawStream;

      // 2. Build real-time Web Audio pipeline: High-pass (85Hz) -> AGC PreGain -> Compressor -> Makeup Gain -> Analyser
      const pipeline = createVoiceRecordingPipeline(rawStream);
      audioPipelineRef.current = pipeline;

      // 3. Select optimal audio MIME type
      let mimeType = "";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm";
      } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
        mimeType = "audio/ogg;codecs=opus";
      }

      // 4. Pass the amplified, stabilized stream to MediaRecorder
      const streamToRecord = pipeline ? pipeline.stream : rawStream;
      const recorder = mimeType ? new MediaRecorder(streamToRecord, { mimeType }) : new MediaRecorder(streamToRecord);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.start(100);
      setIsRecording(true);
      setIsRecordingPaused(false);
      setRecordingSeconds(0);

      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      recordTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      // 5. Start live visual audio waveform / level meter loop
      const pollAudioLevel = () => {
        if (audioPipelineRef.current) {
          const level = audioPipelineRef.current.getAudioLevel();
          setAudioLevel(level);
        }
        visualizerRafRef.current = requestAnimationFrame(pollAudioLevel);
      };
      visualizerRafRef.current = requestAnimationFrame(pollAudioLevel);
    } catch (err: unknown) {
      console.error("Microphone access error:", err);
      if (err instanceof Error && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        setUploadError("Microphone permission denied. Please allow microphone access in your browser.");
      } else {
        setUploadError("Unable to access microphone. Please check your audio device.");
      }
    }
  };

  // Pause/Stop voice recording and open audio preview so user can hear it
  const stopRecordingAndPreview = () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (visualizerRafRef.current) {
      cancelAnimationFrame(visualizerRafRef.current);
      visualizerRafRef.current = null;
    }
    setAudioLevel(0);

    const recorder = mediaRecorderRef.current;
    const mime = recorder.mimeType || "audio/webm";
    const duration = recordingSeconds || 1;

    recorder.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: mime });
      setRecordedAudioBlob(audioBlob);
      const url = URL.createObjectURL(audioBlob);
      setPreviewAudioUrl(url);
      setPreviewDuration(duration);
      stopMediaTracks();
      setIsRecording(false);
      setIsRecordingPaused(false);
    };

    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch (err) {
        console.warn("Recorder stop error:", err);
      }
    }
  };

  // Pause active voice recording (transitions to preview to hear the audio)
  const pauseRecording = () => {
    stopRecordingAndPreview();
  };

  // Resume recording (starts fresh or appends)
  const resumeRecording = () => {
    startRecording();
  };

  // Cancel & discard recording
  const cancelRecording = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    stopMediaTracks();
    setIsRecording(false);
    setIsRecordingPaused(false);
    setRecordingSeconds(0);
    setRecordedAudioBlob(null);

    if (previewAudioElementRef.current) {
      previewAudioElementRef.current.pause();
    }
    if (previewAudioUrl) {
      URL.revokeObjectURL(previewAudioUrl);
      setPreviewAudioUrl(null);
    }
    setIsPreviewPlaying(false);
    setPreviewCurrentTime(0);
    setPreviewDuration(0);
  };

  // Preview audio play/pause toggle - Click to hear the audio!
  const togglePreviewPlay = async () => {
    const audio = previewAudioElementRef.current;
    if (!audio) return;

    try {
      if (!audio.paused && !audio.ended) {
        audio.pause();
        setIsPreviewPlaying(false);
        audioPlaybackCoordinator.releasePlayback("composer-preview");
      } else {
        // Stop any other currently playing voice message in the chat
        audioPlaybackCoordinator.requestPlayback("composer-preview", () => {
          if (previewAudioElementRef.current && !previewAudioElementRef.current.paused) {
            previewAudioElementRef.current.pause();
          }
          setIsPreviewPlaying(false);
        });

        // Resume shared audio context on user gesture if enhanced
        if (previewEnhanced) {
          try {
            await playbackEnhancer.resumeContext();
            if (!enhancerControlsRef.current) {
              enhancerControlsRef.current = playbackEnhancer.attachElement(audio, true, 1.0);
            }
          } catch {}
        }

        const effDuration = (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : (previewDuration || 1);
        if (audio.ended || audio.currentTime >= effDuration - 0.2) {
          audio.currentTime = 0;
          setPreviewCurrentTime(0);
        }
        await audio.play();
        setIsPreviewPlaying(true);
      }
    } catch (err) {
      console.warn("Audio preview playback error:", err);
      setIsPreviewPlaying(false);
      audioPlaybackCoordinator.releasePlayback("composer-preview");
    }
  };

  // Seek within preview audio
  const handlePreviewSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setPreviewCurrentTime(newTime);
    if (previewAudioElementRef.current) {
      previewAudioElementRef.current.currentTime = newTime;
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

    // If currently still recording or paused, stop and grab blob
    if (isRecording && mediaRecorderRef.current) {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      await new Promise<void>((resolve) => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
          return resolve();
        }
        const mime = mediaRecorderRef.current.mimeType || "audio/webm";
        mediaRecorderRef.current.onstop = () => {
          blobToSend = new Blob(audioChunksRef.current, { type: mime });
          resolve();
        };
        try {
          mediaRecorderRef.current.stop();
        } catch {
          resolve();
        }
        setIsRecording(false);
        setIsRecordingPaused(false);
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
        duration: durationSecs || previewDuration || 1,
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
            padding: "0.5rem 0.85rem",
            borderRadius: "24px",
            backgroundColor: "var(--card-bg, #ffffff)",
            border: "1.5px solid var(--border-color, #e2e8f0)",
            minHeight: "46px",
            boxSizing: "border-box",
            gap: "0.6rem",
            flexWrap: "nowrap",
          }}>
            {/* If actively recording or recording is paused */}
            {isRecording ? (
              <>
                {/* Left: Recording status, timer & live audio waveform meter */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0, flex: 1 }}>
                  <div style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    backgroundColor: isRecordingPaused ? "#f59e0b" : "#ef4444",
                    boxShadow: isRecordingPaused ? "0 0 6px #f59e0b" : "0 0 8px #ef4444",
                    animation: isRecordingPaused ? "none" : "pulse 1.2s infinite ease-in-out",
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontWeight: 700,
                    fontSize: "0.92rem",
                    color: isRecordingPaused ? "#d97706" : "#ef4444",
                    minWidth: "40px",
                  }}>
                    {formatTimer(recordingSeconds)}
                  </span>

                  {/* Real-Time Live Audio Waveform Meter */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "2.5px",
                      height: "20px",
                      padding: "0 4px",
                    }}
                    title="Live Audio Level (Smart Voice Amplification & Anti-Clipping Active)"
                  >
                    {[0.6, 1.1, 1.7, 2.2, 1.5, 0.9, 0.5].map((multiplier, i) => {
                      const barH = isRecordingPaused
                        ? 4
                        : Math.max(4, Math.min(22, Math.round(4 + audioLevel * 18 * multiplier)));
                      return (
                        <div
                          key={i}
                          style={{
                            width: "3px",
                            height: `${barH}px`,
                            backgroundColor: "var(--primary, #6366f1)",
                            borderRadius: "1.5px",
                            transition: "height 0.05s ease",
                            opacity: isRecordingPaused ? 0.35 : 0.85,
                          }}
                        />
                      );
                    })}
                  </div>

                  <span style={{
                    fontSize: "0.78rem",
                    opacity: 0.7,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>
                    {isRecordingPaused ? "Paused" : "Smart Recording..."}
                  </span>
                </div>

                {/* Right: Controls (Discard, Pause/Listen, Stop&Listen, Direct Send) */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
                  {/* Discard */}
                  <button
                    type="button"
                    onClick={cancelRecording}
                    disabled={isUploading}
                    title="Discard recording"
                    style={{
                      width: "34px",
                      height: "34px",
                      background: "rgba(239, 68, 68, 0.08)",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Trash2 size={16} />
                  </button>

                  {/* Pause / Listen button */}
                  <button
                    type="button"
                    onClick={stopRecordingAndPreview}
                    disabled={isUploading}
                    title="Pause & listen to audio"
                    style={{
                      width: "34px",
                      height: "34px",
                      background: "rgba(245, 158, 11, 0.12)",
                      border: "1px solid rgba(245, 158, 11, 0.3)",
                      color: "#d97706",
                      cursor: "pointer",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Pause size={15} fill="currentColor" />
                  </button>

                  {/* Stop & Listen button */}
                  <button
                    type="button"
                    onClick={stopRecordingAndPreview}
                    disabled={isUploading}
                    title="Stop & listen to audio"
                    style={{
                      width: "34px",
                      height: "34px",
                      background: "rgba(0, 0, 0, 0.06)",
                      border: "1px solid var(--border-color, #e2e8f0)",
                      color: "var(--foreground, #1e293b)",
                      cursor: "pointer",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Square size={14} fill="currentColor" />
                  </button>

                  {/* Direct Send button */}
                  <button
                    type="button"
                    onClick={sendVoiceNote}
                    disabled={isUploading}
                    title="Send voice message directly"
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      backgroundColor: "var(--primary, #6366f1)",
                      color: "#ffffff",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: isUploading ? "not-allowed" : "pointer",
                      boxShadow: "0 2px 6px rgba(99, 102, 241, 0.3)",
                      flexShrink: 0,
                    }}
                  >
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
                  </button>
                </div>
              </>
            ) : (
              /* Preview State (Recording finished, listening to audio before sending) */
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flex: 1, minWidth: 0 }}>
                  {/* Play / Pause Toggle Button - Click to hear the audio */}
                  <button
                    type="button"
                    onClick={togglePreviewPlay}
                    title={isPreviewPlaying ? "Pause audio playback" : "Click to hear the audio"}
                    aria-label={isPreviewPlaying ? "Pause preview" : "Click to hear audio"}
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      backgroundColor: "var(--primary, #6366f1)",
                      color: "#ffffff",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      flexShrink: 0,
                      boxShadow: "0 2px 6px rgba(99, 102, 241, 0.25)",
                    }}
                  >
                    {isPreviewPlaying ? (
                      <Pause size={16} fill="currentColor" />
                    ) : (
                      <Play size={16} fill="currentColor" style={{ marginLeft: "2px" }} />
                    )}
                  </button>

                  {/* Scrubber & Time Display */}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                    <div style={{ position: "relative", width: "100%", height: "6px", display: "flex", alignItems: "center" }}>
                      <div style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        height: "4px",
                        borderRadius: "2px",
                        backgroundColor: "rgba(0, 0, 0, 0.12)",
                      }} />
                      <div style={{
                        position: "absolute",
                        left: 0,
                        width: `${(previewDuration || recordingSeconds || 1) > 0 ? (previewCurrentTime / (previewDuration || recordingSeconds || 1)) * 100 : 0}%`,
                        height: "4px",
                        borderRadius: "2px",
                        backgroundColor: "var(--primary, #6366f1)",
                      }} />
                      <input
                        type="range"
                        min={0}
                        max={previewDuration || recordingSeconds || 1}
                        step={0.1}
                        value={previewCurrentTime}
                        onChange={handlePreviewSeek}
                        style={{
                          position: "absolute",
                          width: "100%",
                          height: "100%",
                          opacity: 0,
                          cursor: "pointer",
                          margin: 0,
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.74rem", opacity: 0.85 }}>
                      <span>{formatTimer(previewCurrentTime)}</span>
                      <span>{formatTimer(previewDuration || recordingSeconds)}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Enhancement Toggle, Discard, Re-record, Send */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
                  {/* Smart Amplification Toggle in Preview */}
                  <button
                    type="button"
                    onClick={() => {
                      const next = !previewEnhanced;
                      setPreviewEnhanced(next);
                      if (enhancerControlsRef.current) {
                        enhancerControlsRef.current.setEnhanced(next);
                      }
                    }}
                    title={previewEnhanced ? "Smart Amplification: Active (Loudness stabilized & boosted)" : "Smart Amplification: Inactive (Raw audio)"}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "2.5px",
                      background: previewEnhanced ? "rgba(99, 102, 241, 0.12)" : "rgba(0, 0, 0, 0.05)",
                      color: previewEnhanced ? "var(--primary, #6366f1)" : "inherit",
                      border: "1px solid var(--border-color, #e2e8f0)",
                      borderRadius: "10px",
                      padding: "2px 7px",
                      cursor: "pointer",
                      fontSize: "0.68rem",
                      fontWeight: previewEnhanced ? 600 : 400,
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Sparkles size={11} fill={previewEnhanced ? "currentColor" : "none"} />
                    <span>{previewEnhanced ? "Boosted" : "Raw"}</span>
                  </button>

                  {/* Discard */}
                  <button
                    type="button"
                    onClick={cancelRecording}
                    disabled={isUploading}
                    title="Discard voice message"
                    style={{
                      width: "34px",
                      height: "34px",
                      background: "rgba(239, 68, 68, 0.08)",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Trash2 size={16} />
                  </button>

                  {/* Re-record */}
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={isUploading}
                    title="Re-record voice message"
                    style={{
                      width: "34px",
                      height: "34px",
                      background: "rgba(0, 0, 0, 0.05)",
                      border: "1px solid var(--border-color, #e2e8f0)",
                      color: "var(--foreground, #1e293b)",
                      cursor: "pointer",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <RotateCcw size={15} />
                  </button>

                  {/* Send voice note */}
                  <button
                    type="button"
                    onClick={sendVoiceNote}
                    disabled={isUploading}
                    title="Send voice message"
                    style={{
                      width: "36px",
                      height: "36px",
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
                      flexShrink: 0,
                    }}
                  >
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
                  </button>
                </div>
              </>
            )}
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

      {/* Hidden native HTML5 Audio element for audio preview */}
      <audio
        ref={previewAudioElementRef}
        src={previewAudioUrl || undefined}
        preload="auto"
        onLoadedMetadata={(e) => {
          const audio = e.currentTarget;
          if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
            setPreviewDuration(Math.round(audio.duration));
          }
        }}
        onTimeUpdate={(e) => {
          const audio = e.currentTarget;
          setPreviewCurrentTime(audio.currentTime);
          if (audio.currentTime > previewDuration) {
            setPreviewDuration(Math.ceil(audio.currentTime));
          }
        }}
        onPlay={() => setIsPreviewPlaying(true)}
        onPause={() => setIsPreviewPlaying(false)}
        onEnded={() => {
          setIsPreviewPlaying(false);
          setPreviewCurrentTime(0);
          if (previewAudioElementRef.current) {
            previewAudioElementRef.current.currentTime = 0;
          }
          audioPlaybackCoordinator.releasePlayback("composer-preview");
        }}
        onError={(err) => {
          console.warn("Audio preview playback error:", err);
          setIsPreviewPlaying(false);
          audioPlaybackCoordinator.releasePlayback("composer-preview");
        }}
        style={{ display: "none" }}
      />
    </div>
  );
}
