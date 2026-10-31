"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import SrtLogo from "./SrtLogo";
import styles from "./SplashScreen.module.css";

const SESSION_STORAGE_KEY = "srt_splash_shown";

export interface SplashScreenProps {
  /** Optional callback fired when the splash finishes */
  onComplete?: () => void;
  /** Optional route to redirect to on completion. If provided, router.replace will be called */
  redirectTo?: string;
  /** Force display even if previously shown in this session */
  forceShow?: boolean;
  /** Additional styling or class for wrapper */
  className?: string;
}

// Fixed deterministic floating stardust particles for zero layout shift
const PARTICLES = [
  { top: "16%", left: "12%", size: 4, delay: "0.2s", tx: "20px", ty: "-26px", color: "rgba(242, 184, 75, 0.6)" },
  { top: "22%", left: "84%", size: 3, delay: "0.8s", tx: "-18px", ty: "-22px", color: "rgba(59, 130, 246, 0.6)" },
  { top: "32%", left: "24%", size: 5, delay: "1.3s", tx: "14px", ty: "-32px", color: "rgba(242, 184, 75, 0.45)" },
  { top: "40%", left: "78%", size: 3, delay: "0.5s", tx: "-16px", ty: "-24px", color: "rgba(255, 255, 255, 0.5)" },
  { top: "58%", left: "18%", size: 4, delay: "1.1s", tx: "22px", ty: "-28px", color: "rgba(59, 130, 246, 0.5)" },
  { top: "66%", left: "86%", size: 5, delay: "0.4s", tx: "-20px", ty: "-30px", color: "rgba(242, 184, 75, 0.55)" },
  { top: "76%", left: "30%", size: 3, delay: "1.6s", tx: "16px", ty: "-22px", color: "rgba(255, 255, 255, 0.4)" },
  { top: "84%", left: "70%", size: 4, delay: "0.9s", tx: "-14px", ty: "-26px", color: "rgba(59, 130, 246, 0.55)" },
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
      }
      if (redirectTo) {
        if (typeof window !== "undefined" && window.location.pathname !== redirectTo) {
          router.replace(redirectTo, { scroll: false });
        }
      }
    }, 580);
  }, [isExiting, onComplete, redirectTo, router]);

  useEffect(() => {
    if (!isVisible) return;

    // Full animation cycle duration: ~5.4 seconds for cinematic mass rotation & reveal
    let duration = 5400;
    try {
      const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (isReduced) {
        duration = 1800; // Accelerated gentle fade for reduced motion
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

      {/* Subtle Floating Stardust Particles */}
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
                boxShadow: `0 0 ${p.size * 2.5}px ${p.color}`,
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
        {/* 3D Mass Rotating Crest Stage with Glowing Orbital Border */}
        <div className={styles.logoWrapper}>
          {/* Border-to-Border Rotating Orbital Ring */}
          <div className={styles.orbitalRing} aria-hidden="true" />

          {/* Mass 3D Rotating Crest on Circular White Plate */}
          <div className={styles.crestSpin}>
            <SrtLogo
              size="clamp(160px, 32vmin, 320px)"
              withPlate
              priority
              alt="SRT Universal School Crest"
            />
          </div>

          {/* High-Gloss Shine Sweep */}
          <div className={styles.shineSweep} aria-hidden="true" />
        </div>

        {/* Brand Typography */}
        <div className={styles.textGroup}>
          {/* School Name - Letter by Letter */}
          <h1 className={styles.schoolName}>
            {schoolWords.map((word, wordIdx) => (
              <span key={wordIdx} className={styles.word}>
                {word.split("").map((letter, letterIdx) => {
                  // Reveal letters after crest mass rotation settles (3.2s onwards)
                  const delay = 3.2 + globalCharCounter++ * 0.042;
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

          {/* Gold Divider Line (Draws from centre outward at 3.5s) */}
          <div className={styles.divider} aria-hidden="true" />

          {/* Tagline (Slides in smoothly at 3.75s) */}
          <p className={styles.tagline}>
            Seeing Righteousness &amp; Truth
          </p>
        </div>

        {/* Slim Gold Progress Bar (Fills smoothly at 4.15s) */}
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-label="Loading school portal"
        >
          <div className={styles.progressBar} />
        </div>
      </div>
    </div>
  );
}
