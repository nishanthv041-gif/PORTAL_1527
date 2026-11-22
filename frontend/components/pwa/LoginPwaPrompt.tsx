"use client";

import { useEffect, useState } from "react";
import styles from "./LoginPwaPrompt.module.css";
import { Smartphone, Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function LoginPwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Detect if running in standalone mode (already installed)
    const standaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      document.referrer.includes("android-app://");

    if (standaloneMode) {
      setIsStandalone(true);
      return;
    }

    // 2. Check 14-day dismissal preference
    const dismissedUntil = localStorage.getItem("srt_pwa_login_banner_dismissed");
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) {
      setIsDismissed(true);
    }

    // 3. Detect iOS Safari
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);

    if (isIos && isSafari) {
      setIsIosSafari(true);
    }

    // 4. Android & Desktop Chrome / Edge install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      try {
        localStorage.setItem("srt_pwa_login_banner_dismissed", String(Date.now() + 365 * 86400000));
      } catch {}
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setDeferredPrompt(null);
        }
      } catch (err) {
        console.warn("[PWA Login] Install prompt error:", err);
        window.dispatchEvent(new CustomEvent("open-install-prompt"));
      }
    } else {
      // Trigger universal install modal with step-by-step guidance
      window.dispatchEvent(new CustomEvent("open-install-prompt"));
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      localStorage.setItem("srt_pwa_login_banner_dismissed", String(Date.now() + 14 * 86400000));
    } catch {}
  };

  // If already installed or running standalone, do not render
  if (isStandalone) {
    return null;
  }

  // Non-blocking, completely inline banner (zero fixed overlays over the login inputs)
  return (
    <div className={styles.inlineContainer}>
      {isIosSafari ? (
        <div className={styles.iosBanner}>
          <div className={styles.bannerContent}>
            <div className={styles.bannerIcon}>
              <Smartphone size={15} color="#3b82f6" />
            </div>
            <div className={styles.bannerText}>
              <span className={styles.bannerTitle}>Install on iPhone / iPad</span>
              <span className={styles.bannerSub}>
                Tap <strong>Share</strong> (
                <svg
                  style={{ display: "inline", verticalAlign: "middle" }}
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                  <polyline points="16 6 12 2 8 6"></polyline>
                  <line x1="12" y1="2" x2="12" y2="15"></line>
                </svg>
                ) then <strong>Add to Home Screen</strong> (+)
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className={styles.dismissBtn}
            aria-label="Dismiss install banner"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className={styles.androidBanner}>
          <button
            type="button"
            onClick={handleInstallClick}
            className={styles.installButton}
            title="Install SRT Portal App"
          >
            <Download size={14} />
            <span>Install SRT App</span>
          </button>
        </div>
      )}
    </div>
  );
}
