"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import SrtLogo from "./SrtLogo";
import styles from "./SplashScreen.module.css";

const SESSION_STORAGE_KEY = "srt_splash_shown";

export interface SplashScreenProps {
  /** Optional callback fired when the splash finishes or is skipped */
  onComplete?: () => void;
  /** Optional route to redirect to on completion. If provided, router.replace will be called */
  redirectTo?: string;
  /** Force display even if previously shown in this session */
  forceShow?: boolean;
  /** Additional styling or class for wrapper */
  className?: string;
}

// Fixed deterministic floating particles for zero layout shift
const PARTICLES = [
  { top: "18%", left: "15%", size: 4, delay: "0.2s", tx: "18px", ty: "-24px", color: "rgba(242, 184, 75, 0.45)" },
  { top: "25%", left: "82%", size: 3, delay: "0.8s", tx: "-16px", ty: "-20px", color: "rgba(59, 130, 246, 0.5)" },
  { top: "35%", left: "28%", size: 5, delay: "1.4s", tx: "12px", ty: "-30px", color: "rgba(242, 184, 75, 0.35)" },
  { top: "42%", left: "75%", size: 3, delay: "0.5s", tx: "-14px", ty: "-22px", color: "rgba(255, 255, 255, 0.4)" },
  { top: "60%", left: "20%", size: 4, delay: "1.1s", tx: "20px", ty: "-26px", color: "rgba(59, 130, 246, 0.4)" },
  { top: "68%", left: "85%", size: 5, delay: "0.4s", tx: "-18px", ty: "-28px", color: "rgba(242, 184, 75, 0.4)" },
  { top: "78%", left: "32%", size: 3, delay: "1.7s", tx: "15px", ty: "-20px", color: "rgba(255, 255, 255, 0.35)" },
  { top: "82%", left: "68%", size: 4, delay: "0.9s", tx: "-12px", ty: "-25px", color: "rgba(59, 130, 246, 0.45)" },
];

export default function SplashScreen({
  onComplete,
  redirectTo,
  forceShow = false,
  className = "",
}: SplashScreenProps) {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (forceShow) return true;
    if (typeof window === "undefined") return true;
    try {
      return sessionStorage.getItem(SESSION_STORAGE_KEY) !== "true";
    } catch {
      return true;
    }
  });

  const [isExiting, setIsExiting] = useState(false);
  const exitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoFinishTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleFinish = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);

    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
    } catch {
      // Ignore private mode / iframe restrictions
    }

    exitTimerRef.current = setTimeout(() => {
      setIsVisible(false);
      if (onComplete) {
        onComplete();
      } else if (redirectTo) {
        router.replace(redirectTo, { scroll: false });
      }
    }, 480);
  }, [isExiting, onComplete, redirectTo, router]);

  useEffect(() => {
    if (!isVisible) return;

    // Check prefers-reduced-motion
    let duration = 3500;
    try {
      const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (isReduced) {
        duration = 1400; // Accelerated fade for reduced motion
      }
    } catch {}

    autoFinishTimerRef.current = setTimeout(() => {
      handleFinish();
    }, duration);

    return () => {
      if (autoFinishTimerRef.current) clearTimeout(autoFinishTimerRef.current);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, [isVisible, handleFinish]);

  if (!isVisible) return null;

  // Split School Name into words and letters for staggered letter-by-letter animation
  const schoolWords = ["SRT", "UNIVERSAL", "SCHOOL"];
  let globalCharCounter = 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to SRT Universal School"
      className={`${styles.splashContainer} ${isExiting ? styles.splashExit : ""} ${className}`}
    >
      {/* Background Soft Radial Glow */}
      <div className={styles.radialGlow} aria-hidden="true" />

      {/* Subtle Floating Particles */}
      <div className={styles.particleWrapper} aria-hidden="true">
        {PARTICLES.map((p, idx) => (
          <span
            key={idx}
            className={styles.particle}
            style={
              {
                top: p.top,
                left: p.left,
                width: `${p.size}px`,
                height: `${p.size}px`,
                backgroundColor: p.color,
                boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
                animationDelay: p.delay,
                "--tx": p.tx,
                "--ty": p.ty,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Main Content Stage */}
      <div className={styles.contentStage}>
        {/* 3D Rotating Crest with Soft Shine Sweep */}
        <div className={styles.logoWrapper}>
          <SrtLogo
            size="clamp(120px, 28vmin, 280px)"
            priority
            alt="SRT Universal School Crest"
          />
          <div className={styles.shineSweep} aria-hidden="true" />
        </div>

        {/* Brand Typography */}
        <div className={styles.textGroup}>
          {/* School Name - Letter by Letter */}
          <h1 className={styles.schoolName}>
            {schoolWords.map((word, wordIdx) => (
              <span key={wordIdx} className={styles.word}>
                {word.split("").map((letter, letterIdx) => {
                  const delay = 1.8 + globalCharCounter++ * 0.038;
                  return (
                    <span
                      key={letterIdx}
                      className={styles.letter}
                      style={{ animationDelay: `${delay.toFixed(3)}s` }}
                    >
                      {letter}
                    </span>
                  );
                })}
                {wordIdx < schoolWords.length - 1 && (
                  <span style={{ display: "inline-block", width: "0.35em" }}>
                    &nbsp;
                  </span>
                )}
              </span>
            ))}
          </h1>

          {/* Gold Divider Line (Draws from centre outward) */}
          <div className={styles.divider} aria-hidden="true" />

          {/* Tagline */}
          <p className={styles.tagline}>
            Seeing Righteousness &amp; Truth
          </p>
        </div>

        {/* Slim Gold Progress Bar */}
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-label="Loading school portal"
        >
          <div className={styles.progressBar} />
        </div>
      </div>

      {/* Skip Button */}
      <button
        type="button"
        onClick={handleFinish}
        className={styles.skipButton}
        title="Skip intro animation"
      >
        <span>Skip</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="5 4 15 12 5 20 5 4" />
          <line x1="19" y1="5" x2="19" y2="19" />
        </svg>
      </button>
    </div>
  );
}
