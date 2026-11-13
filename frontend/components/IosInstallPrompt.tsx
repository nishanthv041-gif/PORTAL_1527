"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { X, CheckCircle2, Bell, Zap, Copy, Check } from "lucide-react";
import styles from "./IosInstallPrompt.module.css";

const DISMISSED_KEY = "srt_ios_install_dismissed_v1";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default function IosInstallPrompt() {
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showFloatingPill, setShowFloatingPill] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ua = window.navigator.userAgent;
    const isIosDevice =
      /iPad|iPhone|iPod/.test(ua) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);

    if (!isIosDevice) {
      return;
    }

    setIsIos(true);

    // 1. Check if already installed & running in standalone mode
    const standaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (standaloneMode) {
      setIsStandalone(true);
      return;
    }

    // 2. Check in-app browsers on iOS (Chrome CriOS, Instagram, WhatsApp, etc.)
    const inApp = /FBAN|FBAV|Instagram|Line|WhatsApp|CriOS|FxiOS|EdgiOS/.test(ua);
    setIsInAppBrowser(inApp);

    // 3. Check 7-day dismissal timestamp
    const dismissedUntil = localStorage.getItem(DISMISSED_KEY);
    const isDismissed = dismissedUntil && Date.now() < Number(dismissedUntil);

    if (!isDismissed) {
      // Prompt appears gently after 1.8 seconds on iOS Safari
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1800);
      return () => clearTimeout(timer);
    } else {
      setShowFloatingPill(true);
    }
  }, []);

  // Listen for manual trigger from Topbar, Sidebar, or Profile menus
  useEffect(() => {
    const handleManualOpen = () => {
      setIsOpen(true);
      setShowFloatingPill(false);
    };

    window.addEventListener("open-ios-install-prompt", handleManualOpen);
    return () => window.removeEventListener("open-ios-install-prompt", handleManualOpen);
  }, []);

  const handleDismiss = useCallback(() => {
    setIsOpen(false);
    setShowFloatingPill(true);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now() + SEVEN_DAYS_MS));
    } catch {}
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  }, []);

  // Do not render anything if not on an iOS device or if already installed in standalone mode
  if (!isIos || isStandalone) {
    return null;
  }

  return (
    <>
      {/* Discreet floating pill available if prompt was dismissed */}
      {!isOpen && showFloatingPill && (
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setShowFloatingPill(false);
          }}
          className={styles.discreetFloatingPill}
          title="Install SRT Portal App on iPhone"
          aria-label="Install SRT Portal App on iPhone"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          <span>Install iPhone App</span>
        </button>
      )}

      {/* Main Bottom Sheet iOS Install Modal */}
      {isOpen && (
        <div
          className={styles.overlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleDismiss();
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-install-title"
        >
          <div className={styles.bottomSheet}>
            {/* Header with App Crest Icon, Titles, and Close Button */}
            <div className={styles.headerRow}>
              <div className={styles.iconWrapper}>
                <Image
                  src="/apple-touch-icon.png"
                  alt="SRT Universal School Logo"
                  width={52}
                  height={52}
                  className={styles.iconImg}
                  priority
                />
              </div>

              <div className={styles.titleArea}>
                <h3 id="ios-install-title" className={styles.mainTitle}>
                  Install SRT Portal App
                </h3>
                <p className={styles.subTitle}>
                  Install this app on your iPhone for quick home screen access & lock-screen push notifications.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDismiss}
                className={styles.closeBtn}
                aria-label="Close installation prompt"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Benefits Badges */}
            <div className={styles.benefitsList}>
              <div className={styles.benefitPill}>
                <CheckCircle2 size={13} className={styles.benefitIcon} />
                <span>Zero Storage</span>
              </div>
              <div className={styles.benefitPill}>
                <Bell size={13} className={styles.benefitIcon} />
                <span>Instant Push Alerts</span>
              </div>
              <div className={styles.benefitPill}>
                <Zap size={13} className={styles.benefitIcon} />
                <span>Fast 1-Tap Login</span>
              </div>
            </div>

            {/* In-App Browser Warning (e.g. WhatsApp, Instagram, or Chrome on iOS) */}
            {isInAppBrowser && (
              <div className={styles.inAppAlert}>
                <div>
                  <strong>Safari Required:</strong> You are currently viewing in an in-app browser.
                  Apple only supports Home Screen installation via <strong>Safari</strong>.
                </div>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    padding: "0.35rem 0.65rem",
                    borderRadius: "8px",
                    background: "#ffffff",
                    border: "1px solid rgba(180, 83, 9, 0.4)",
                    color: "#b45309",
                    fontWeight: 600,
                    fontSize: "0.76rem",
                    cursor: "pointer",
                    flexShrink: 0,
                    marginTop: "0.35rem"
                  }}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copied ? "Link Copied!" : "Copy Portal Link"}</span>
                </button>
              </div>
            )}

            {/* Step-by-Step Instructions with Apple Icons */}
            <div className={styles.stepsContainer}>
              <div className={styles.stepItem}>
                <div className={styles.stepNumber}>1</div>
                <div className={styles.stepText}>
                  Tap the Safari <strong>Share</strong> button
                  <span className={styles.actionIconBadge}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                  </span>
                  in the bottom toolbar.
                </div>
              </div>

              <div className={styles.stepItem}>
                <div className={styles.stepNumber}>2</div>
                <div className={styles.stepText}>
                  Scroll down the share sheet and tap
                  <span className={styles.actionIconBadge}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="12" y1="8" x2="12" y2="16" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                    Add to Home Screen
                  </span>
                </div>
              </div>

              <div className={styles.stepItem}>
                <div className={styles.stepNumber}>3</div>
                <div className={styles.stepText}>
                  Tap <strong>Add</strong> in the top right corner. The SRT Portal app is now on your iPhone!
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className={styles.btnRow}>
              <button
                type="button"
                onClick={handleDismiss}
                className={styles.gotItBtn}
              >
                <span>Got It</span>
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className={styles.dismissBtn}
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
