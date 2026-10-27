"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Sparkles } from "lucide-react";
import { playbackEnhancer } from "@/frontend/utils/audioProcessor";

interface VoiceNotePlayerProps {
  src: string;
  duration?: number | null;
  isMine: boolean;
}

export default function VoiceNotePlayer({ src, duration, isMine }: VoiceNotePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [isEnhanced, setIsEnhanced] = useState(true);
  const [userVolume, setUserVolume] = useState(1.0);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const enhancerControlsRef = useRef<ReturnType<typeof playbackEnhancer.attachElement> | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (duration && duration > 0) {
      setTotalDuration(duration);
    }
  }, [duration]);

  // Attach to shared playback audio enhancer
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    enhancerControlsRef.current = playbackEnhancer.attachElement(audio, isEnhanced, userVolume);

    return () => {
      if (enhancerControlsRef.current) {
        enhancerControlsRef.current.disconnect();
      }
    };
  }, [src]);

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
  const toggleEnhanced = () => {
    const next = !isEnhanced;
    setIsEnhanced(next);
    if (enhancerControlsRef.current) {
      enhancerControlsRef.current.setEnhanced(next);
    }
  };

  // Adjust playback gain (0% to 200%)
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setUserVolume(vol);
    if (enhancerControlsRef.current) {
      enhancerControlsRef.current.setVolume(vol);
    } else if (audioRef.current) {
      audioRef.current.volume = Math.min(1.0, vol);
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    // Resume shared audio context on user gesture
    playbackEnhancer.resumeContext().catch(() => {});

    if (!audio.paused && !audio.ended) {
      audio.pause();
      setIsPlaying(false);
    } else {
      const effDuration = (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : (totalDuration || 0.1);
      if (audio.currentTime >= effDuration - 0.1) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.warn("Audio playback error:", err);
        setIsPlaying(false);
      });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      padding: "0.5rem 0.25rem",
      minWidth: "230px",
      maxWidth: "340px",
    }}>
      {/* Play/Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
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
          cursor: "pointer",
          flexShrink: 0,
          transition: "transform 0.15s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: "2px" }} />}
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
            max={totalDuration || 1}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
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

        {/* Timers & Audio Enhancements Toolbar */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.72rem",
          opacity: 0.9,
          position: "relative",
        }}>
          <span>{formatTime(isPlaying ? currentTime : totalDuration)}</span>

          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            {/* Audio Enhancement (AGC / Loudness Lift) Toggle */}
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
              <Sparkles size={11} fill={isEnhanced ? "currentColor" : "none"} />
              <span>{isEnhanced ? "Boost" : "Raw"}</span>
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
                    style={{ width: "80px", cursor: "pointer", accentColor: "var(--primary, #6366f1)" }}
                  />
                  <span style={{ fontSize: "0.7rem", fontWeight: 600, minWidth: "32px", textAlign: "right" }}>
                    {Math.round(userVolume * 100)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden native HTML5 Audio element */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const audio = e.currentTarget;
          if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
            setTotalDuration(Math.round(audio.duration));
          }
        }}
        onTimeUpdate={(e) => {
          const audio = e.currentTarget;
          setCurrentTime(audio.currentTime);
          const effDuration = (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : totalDuration;
          if (effDuration > 0 && audio.currentTime >= effDuration) {
            setIsPlaying(false);
            audio.currentTime = 0;
            setCurrentTime(0);
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          if (audioRef.current) audioRef.current.currentTime = 0;
          setCurrentTime(0);
        }}
        onError={(err) => {
          console.warn("Voice note audio error:", err);
          setIsPlaying(false);
        }}
        style={{ display: "none" }}
      />
    </div>
  );
}
