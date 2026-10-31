"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Loader2, RotateCcw, AlertCircle } from "lucide-react";
import { playbackEnhancer } from "@/frontend/utils/audioProcessor";
import { audioPlaybackCoordinator } from "@/frontend/utils/audioPlaybackManager";

interface VoiceNotePlayerProps {
  src: string;
  duration?: number | null;
  isMine: boolean;
  messageId?: string;
}

export default function VoiceNotePlayer({ src, duration, isMine, messageId }: VoiceNotePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState<number>(() => {
    if (typeof duration === "number" && duration > 0 && isFinite(duration)) {
      return Math.round(duration);
    }
    return 0;
  });
  const [isEnhanced, setIsEnhanced] = useState(true);
  const [userVolume, setUserVolume] = useState(1.0);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isActionPendingRef = useRef(false);
  const enhancerControlsRef = useRef<ReturnType<typeof playbackEnhancer.attachElement> | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const instanceIdRef = useRef<string>(messageId || `voice-${Math.random().toString(36).substring(2, 9)}`);

  // Update total duration when duration prop changes
  useEffect(() => {
    if (typeof duration === "number" && duration > 0 && isFinite(duration)) {
      setTotalDuration(Math.round(duration));
    }
  }, [duration]);

  // Clean up playback on unmount
  useEffect(() => {
    const instanceId = instanceIdRef.current;
    return () => {
      audioPlaybackCoordinator.releasePlayback(instanceId);
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
      if (enhancerControlsRef.current) {
        enhancerControlsRef.current.disconnect();
      }
    };
  }, []);

  // Close volume popover when clicking outside
  useEffect(() => {
    if (!showVolumeSlider) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowVolumeSlider(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showVolumeSlider]);

  // Toggle voice amplification & loudness normalization
  const toggleEnhanced = async () => {
    const next = !isEnhanced;
    setIsEnhanced(next);
    const audio = audioRef.current;
    if (next && audio && !enhancerControlsRef.current) {
      await playbackEnhancer.resumeContext();
      enhancerControlsRef.current = playbackEnhancer.attachElement(audio, true, userVolume);
    } else if (enhancerControlsRef.current) {
      enhancerControlsRef.current.setEnhanced(next);
    }
  };

  // Adjust playback gain (0% to 200%)
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setUserVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1.0, vol);
    }
    if (enhancerControlsRef.current) {
      enhancerControlsRef.current.setVolume(vol);
    }
  };

  // Main Play / Pause / Resume / Replay Handler
  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || isActionPendingRef.current) return;
    isActionPendingRef.current = true;
    setHasError(false);

    try {
      if (isPlaying && !audio.paused) {
        // Pause active playback
        audio.pause();
        setIsPlaying(false);
        audioPlaybackCoordinator.releasePlayback(instanceIdRef.current);
      } else {
        // Exclusive playback: stop any previously playing voice note
        audioPlaybackCoordinator.requestPlayback(instanceIdRef.current, () => {
          if (audioRef.current && !audioRef.current.paused) {
            audioRef.current.pause();
          }
          setIsPlaying(false);
        });

        // Determine if we are at or near the end and need to replay from the beginning
        const effDuration = totalDuration > 0
          ? totalDuration
          : (isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);

        if (audio.ended || (effDuration > 0 && audio.currentTime >= effDuration - 0.25)) {
          audio.currentTime = 0;
          setCurrentTime(0);
        }

        // Resume AudioContext if enhancement is enabled
        if (isEnhanced) {
          try {
            await playbackEnhancer.resumeContext();
          } catch {}
        }

        setIsLoading(true);

        // Attempt playback with error catch
        await audio.play();
        setIsPlaying(true);
        setIsLoading(false);
      }
    } catch (err: unknown) {
      console.warn("Audio playback failure:", err);
      setIsPlaying(false);
      setIsLoading(false);
      setHasError(true);
      audioPlaybackCoordinator.releasePlayback(instanceIdRef.current);
    } finally {
      isActionPendingRef.current = false;
    }
  }, [isPlaying, isEnhanced, totalDuration]);

  // Seek within voice note
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      try {
        audioRef.current.currentTime = newTime;
      } catch (err) {
        console.warn("Seek error:", err);
      }
    }
  };

  // Re-try playback after error
  const handleRetry = () => {
    setHasError(false);
    if (audioRef.current) {
      audioRef.current.load();
      togglePlay();
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs) || secs < 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const progressPercent = totalDuration > 0 ? Math.min(100, Math.max(0, (currentTime / totalDuration) * 100)) : 0;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      padding: "0.5rem 0.25rem",
      minWidth: "240px",
      maxWidth: "340px",
    }}>
      {/* Play / Pause / Loading Button */}
      <button
        type="button"
        onClick={togglePlay}
        disabled={isLoading}
        aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
        title={isPlaying ? "Pause playback" : "Play voice message"}
        style={{
          width: "38px",
          height: "38px",
          borderRadius: "50%",
          backgroundColor: isMine ? "rgba(255, 255, 255, 0.25)" : "var(--primary, #6366f1)",
          color: "#ffffff",
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: isLoading ? "wait" : "pointer",
          flexShrink: 0,
          transition: "transform 0.15s ease",
          boxShadow: isMine ? "none" : "0 2px 6px rgba(99, 102, 241, 0.25)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        {isLoading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : isPlaying ? (
          <Pause size={18} fill="currentColor" />
        ) : (
          <Play size={18} fill="currentColor" style={{ marginLeft: "2px" }} />
        )}
      </button>

      {/* Progress & Time */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {/* Scrub Bar */}
        <div style={{ position: "relative", width: "100%", height: "6px", display: "flex", alignItems: "center" }}>
          <div style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: "4px",
            borderRadius: "2px",
            backgroundColor: isMine ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.15)",
          }} />
          <div style={{
            position: "absolute",
            left: 0,
            width: `${progressPercent}%`,
            height: "4px",
            borderRadius: "2px",
            backgroundColor: isMine ? "#ffffff" : "var(--primary, #6366f1)",
          }} />
          <input
            type="range"
            min={0}
            max={totalDuration > 0 ? totalDuration : 1}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            disabled={totalDuration <= 0}
            aria-label="Seek voice message"
            style={{
              position: "absolute",
              width: "100%",
              height: "100%",
              opacity: 0,
              cursor: totalDuration > 0 ? "pointer" : "default",
              margin: 0,
            }}
          />
        </div>

        {/* Timers & Audio Enhancements Toolbar */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.72rem",
          opacity: 0.9,
          position: "relative",
        }}>
          <span>{formatTime(isPlaying ? currentTime : (totalDuration > 0 ? totalDuration : currentTime))}</span>

          {hasError ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: isMine ? "#ffffff" : "#ef4444" }}>
              <AlertCircle size={12} />
              <button
                type="button"
                onClick={handleRetry}
                style={{
                  background: "none",
                  border: "none",
                  color: "inherit",
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontSize: "0.7rem",
                  padding: 0,
                }}
              >
                Retry
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
              {/* Audio Enhancement (Boost) Toggle */}
              <button
                type="button"
                onClick={toggleEnhanced}
                title={isEnhanced ? "Smart Amplification: Active (Loudness stabilized & boosted)" : "Smart Amplification: Inactive (Raw audio)"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "2.5px",
                  background: isEnhanced
                    ? (isMine ? "rgba(255, 255, 255, 0.25)" : "rgba(99, 102, 241, 0.15)")
                    : "transparent",
                  color: isMine ? "#ffffff" : (isEnhanced ? "var(--primary, #6366f1)" : "inherit"),
                  border: "none",
                  borderRadius: "10px",
                  padding: "1px 6px",
                  cursor: "pointer",
                  fontSize: "0.65rem",
                  fontWeight: isEnhanced ? 600 : 400,
                  opacity: isEnhanced ? 1 : 0.65,
                  transition: "all 0.15s ease",
                }}
              >
                <Volume2 size={11} />
                <span>{isEnhanced ? "Enhanced" : "Standard"}</span>
              </button>

              {/* Volume Control Button & Popover */}
              <div style={{ position: "relative" }} ref={popoverRef}>
                <button
                  type="button"
                  onClick={() => setShowVolumeSlider((prev) => !prev)}
                  title={`Playback Volume: ${Math.round(userVolume * 100)}%`}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: isMine ? "#ffffff" : "inherit",
                    cursor: "pointer",
                    padding: "1px 2px",
                    display: "flex",
                    alignItems: "center",
                    opacity: userVolume === 0 ? 0.5 : 0.85,
                  }}
                >
                  {userVolume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
                </button>

                {showVolumeSlider && (
                  <div style={{
                    position: "absolute",
                    bottom: "100%",
                    right: 0,
                    marginBottom: "8px",
                    backgroundColor: "var(--card-bg, #ffffff)",
                    color: "var(--foreground, #1e293b)",
                    border: "1px solid var(--border-color, #e2e8f0)",
                    borderRadius: "8px",
                    padding: "0.45rem 0.65rem",
                    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    zIndex: 50,
                    minWidth: "130px",
                  }}>
                    <input
                      type="range"
                      min={0}
                      max={2.0}
                      step={0.05}
                      value={userVolume}
                      onChange={handleVolumeChange}
                      aria-label="Volume slider"
                      style={{ width: "80px", cursor: "pointer", accentColor: "var(--primary, #6366f1)" }}
                    />
                    <span style={{ fontSize: "0.7rem", fontWeight: 600, minWidth: "32px", textAlign: "right" }}>
                      {Math.round(userVolume * 100)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden native HTML5 Audio element */}
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onLoadedMetadata={(e) => {
          const audio = e.currentTarget;
          if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
            setTotalDuration(Math.round(audio.duration));
          }
        }}
        onTimeUpdate={(e) => {
          const audio = e.currentTarget;
          setCurrentTime(audio.currentTime);
          // If totalDuration is not known or audio runs longer, dynamically expand it
          if (audio.currentTime > totalDuration) {
            setTotalDuration(Math.ceil(audio.currentTime));
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
          }
          audioPlaybackCoordinator.releasePlayback(instanceIdRef.current);
        }}
        onError={(e) => {
          const mediaErr = e.currentTarget.error;
          console.warn("Voice note audio playback error:", mediaErr?.code, mediaErr?.message);
          setIsPlaying(false);
          setIsLoading(false);
          setHasError(true);
          audioPlaybackCoordinator.releasePlayback(instanceIdRef.current);
        }}
        style={{ display: "none" }}
      />
    </div>
  );
}
