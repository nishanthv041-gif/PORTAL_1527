"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { Download, Smartphone, X, CheckCircle2, Zap, Bell, ArrowRight, Share } from "lucide-react";
import styles from "../IosInstallPrompt.module.css";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const DISMISSED_KEY = "srt_unified_install_dismissed_v2";
const DISMISS_DURATION_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

export default function UnifiedInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showFloatingPill, setShowFloatingPill] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [platform, setPlatform] = useState<"android" | "ios" | "desktop">("android");

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Detect if already installed and running in standalone app mode
    const standaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      document.referrer.includes("android-app://") ||
      typeof (window as unknown as { Capacitor?: unknown }).Capacitor !== "undefined";

    if (standaloneMode) {
      setIsStandalone(true);
      return;
    }

    // 2. Detect platform
    const ua = window.navigator.userAgent;
    const isIosDevice =
      /iPad|iPhone|iPod/.test(ua) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    const isAndroidDevice = /Android/i.test(ua);

    if (isIosDevice) {
      setPlatform("ios");
    } else if (isAndroidDevice) {
      setPlatform("android");
    } else {
      setPlatform("desktop");
    }

    // 3. Listen for browser native beforeinstallprompt (Android Chrome, Edge, Desktop Chrome)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setIsOpen(false);
      setShowFloatingPill(false);
      try {
        localStorage.setItem(DISMISSED_KEY, String(Date.now() + 365 * 86400000));
      } catch {}
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    // 4. Check dismissal preference
    const dismissedUntil = localStorage.getItem(DISMISSED_KEY);
    const isDismissed = dismissedUntil && Date.now() < Number(dismissedUntil);

    if (!isDismissed) {
      // Automatic polite popup for all first-time visitors before installation
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1500);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
        window.removeEventListener("appinstalled", handleAppInstalled);
      };
    } else {
      setShowFloatingPill(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // Listen for manual open event from any button in the app (e.g. login form "Install App" button)
  useEffect(() => {
    const handleManualOpen = () => {
      setIsOpen(true);
      setShowFloatingPill(false);
    };

    window.addEventListener("open-install-prompt", handleManualOpen);
    window.addEventListener("open-ios-install-prompt", handleManualOpen);
    return () => {
      window.removeEventListener("open-install-prompt", handleManualOpen);
      window.removeEventListener("open-ios-install-prompt", handleManualOpen);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setDeferredPrompt(null);
          setIsOpen(false);
          setShowFloatingPill(false);
        }
      } catch (err) {
        console.warn("[PWA Install] Native prompt error:", err);
        setShowGuide(true);
      }
    } else {
      // If native prompt is not yet ready or on iOS / custom browser, show step-by-step guidance
      setShowGuide(true);
    }
  };

  const handleDismiss = useCallback(() => {
    setIsOpen(false);
    setShowFloatingPill(true);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now() + DISMISS_DURATION_MS));
    } catch {}
  }, []);

  // Never render if user is already running the installed app
  if (isStandalone) {
    return null;
  }

  return (
    <>
      {/* Discreet Floating Install Pill (when dismissed or minimized) */}
      {showFloatingPill && !isOpen && (
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setShowFloatingPill(false);
          }}
          className={styles.discreetFloatingPill}
          title="Install SRT Portal App"
          aria-label="Install SRT Portal App"
        >
          <Smartphone size={16} />
          <span>Install App</span>
        </button>
      )}

      {/* Main Install Pop-up Notification Modal */}
      {isOpen && (
        <div
          className={styles.overlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleDismiss();
          }}
        >
          <div className={styles.bottomSheet} role="dialog" aria-modal="true">
            {/* Header with App Logo and Close Button */}
            <div className={styles.headerRow}>
              <div className={styles.iconWrapper}>
                <Image
                  src="/icons/icon-192x192.png"
                  alt="SRT Portal"
                  width={52}
                  height={52}
                  className={styles.iconImg}
                  priority
                />
              </div>

              <div className={styles.titleArea}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 800,
                      color: "#10b981",
                      backgroundColor: "rgba(16, 185, 129, 0.12)",
                      padding: "2px 6px",
                      borderRadius: "6px",
                      letterSpacing: "0.04em",
                    }}
                  >
                    OFFICIAL APP
                  </span>
                </div>
                <h3 className={styles.mainTitle}>Install SRT School App</h3>
                <p className={styles.subTitle}>
                  Add SRT Universal School Portal to your device for instant zero-lag access and lock-screen alerts.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDismiss}
                className={styles.closeBtn}
                aria-label="Close install prompt"
              >
                <X size={18} />
              </button>
            </div>

            {/* Key Benefits */}
            <div className={styles.benefitsList}>
              <div className={styles.benefitPill}>
                <Zap size={14} className={styles.benefitIcon} />
                <span>Zero Lag Opening</span>
              </div>
              <div className={styles.benefitPill}>
                <Bell size={14} className={styles.benefitIcon} />
                <span>Push Notifications</span>
              </div>
              <div className={styles.benefitPill}>
                <CheckCircle2 size={14} className={styles.benefitIcon} />
                <span>Works Fullscreen</span>
              </div>
            </div>

            {/* Visual Step-by-Step Instructions if native prompt unavailable */}
            {showGuide ? (
              <div className={styles.stepsContainer}>
                {platform === "ios" ? (
                  <>
                    <div className={styles.stepItem}>
                      <span className={styles.stepNumber}>1</span>
                      <span className={styles.stepText}>
                        Tap the <strong>Share</strong> button{" "}
                        <span className={styles.actionIconBadge}>
                          <Share size={12} style={{ display: "inline" }} />
                        </span>{" "}
                        at the bottom of Safari.
                      </span>
                    </div>
                    <div className={styles.stepItem}>
                      <span className={styles.stepNumber}>2</span>
                      <span className={styles.stepText}>
                        Scroll down and tap <strong>Add to Home Screen</strong> (+)
                      </span>
                    </div>
                    <div className={styles.stepItem}>
                      <span className={styles.stepNumber}>3</span>
                      <span className={styles.stepText}>
                        Tap <strong>Add</strong> at the top right to complete installation.
                      </span>
                    </div>
                  </>
                ) : platform === "android" ? (
                  <>
                    <div className={styles.stepItem}>
                      <span className={styles.stepNumber}>1</span>
                      <span className={styles.stepText}>
                        Tap the browser menu <strong>(⋮)</strong> in the top-right corner.
                      </span>
                    </div>
                    <div className={styles.stepItem}>
                      <span className={styles.stepNumber}>2</span>
                      <span className={styles.stepText}>
                        Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                      </span>
                    </div>
                    <div className={styles.stepItem}>
                      <span className={styles.stepNumber}>3</span>
                      <span className={styles.stepText}>
                        Tap <strong>Install</strong> to add SRT Portal to your apps.
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.stepItem}>
                      <span className={styles.stepNumber}>1</span>
                      <span className={styles.stepText}>
                        Click the <strong>Install</strong> icon (⨁) in your browser address bar.
                      </span>
                    </div>
                    <div className={styles.stepItem}>
                      <span className={styles.stepNumber}>2</span>
                      <span className={styles.stepText}>
                        Click <strong>Install</strong> to launch as a standalone desktop app.
                      </span>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {/* Action Buttons */}
            <div className={styles.btnRow}>
              <button
                type="button"
                onClick={handleInstallClick}
                className={styles.gotItBtn}
              >
                <Download size={16} />
                <span>{showGuide ? "Got It" : "Install App Now"}</span>
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
