"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import styles from "./LoginPwaPrompt.module.css";

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
  const [isOpen, setIsOpen] = useState(false);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [wasDismissed, setWasDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Detect if already running in standalone mode (already installed)
    const standaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      document.referrer.includes("android-app://");

    if (standaloneMode) {
      setIsStandalone(true);
      return;
    }

    // 2. Check dismissal preference
    const dismissed = localStorage.getItem("nipo_pwa_login_dismissed");
    if (dismissed && Date.now() < Number(dismissed)) {
      setWasDismissed(true);
    }

    // 3. Detect iOS Safari
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: boolean }).MSStream;
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);

    if (isIos && isSafari) {
      setIsIosSafari(true);
      if (!dismissed || Date.now() >= Number(dismissed)) {
        const timer = setTimeout(() => setIsOpen(true), 1500);
        return () => clearTimeout(timer);
      }
    }

    // 4. Android & Desktop Chrome / Edge
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!dismissed || Date.now() >= Number(dismissed)) {
        setTimeout(() => setIsOpen(true), 1500);
      }
    };

    const handleAppInstalled = () => {
      setIsOpen(false);
      setDeferredPrompt(null);
      setIsStandalone(true);
      try {
        localStorage.setItem("nipo_pwa_login_dismissed", String(Date.now() + 365 * 86400000));
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
    if (!deferredPrompt) {
      // If prompt isn't supported or iOS, keep instructions open
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsOpen(false);
        setDeferredPrompt(null);
      }
    } catch (err) {
      console.warn("[PWA Login] Install prompt error:", err);
    }
  };

  const handleDismiss = () => {
    setIsOpen(false);
    setWasDismissed(true);
    try {
      // Store dismissal for 14 days so user is not annoyed on every visit
      localStorage.setItem("nipo_pwa_login_dismissed", String(Date.now() + 14 * 86400000));
    } catch {}
  };

  const handleManualOpen = () => {
    setIsOpen(true);
  };

  // If already installed and running standalone, do not display anything
  if (isStandalone) {
    return null;
  }

  return (
    <>
      {/* If popup is closed but install is supported, show discreet trigger pill */}
      {!isOpen && (deferredPrompt || isIosSafari) && wasDismissed && (
        <button
          type="button"
          onClick={handleManualOpen}
          className={styles.discreetInstallPill}
          title="Install SRT Portal App"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Install SRT App
        </button>
      )}

      {/* Main Installation Modal */}
      {isOpen && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="pwa-dialog-title">
          <div className={styles.modalCard}>
            <div className={styles.headerRow}>
              <div className={styles.brandGroup}>
                <div className={styles.logoWrapper}>
                  <Image
                    src="/icons/icon-192x192.png"
                    alt="SRT Portal"
                    width={36}
                    height={36}
                    priority
                  />
                </div>
                <div className={styles.titleGroup}>
                  <span id="pwa-dialog-title" className={styles.appName}>SRT Portal</span>
                  <span className={styles.appSub}>Progressive Web App</span>
                </div>
              </div>
              <button
                type="button"
                className={styles.closeIconBtn}
                onClick={handleDismiss}
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className={styles.messageBody}>
              Install SRT Universal School Portal on your device for instant access and lock-screen alerts.
            </div>

            {isIosSafari ? (
              <div className={styles.iosSteps}>
                <div className={styles.stepItem}>
                  <span>1. Tap Safari&apos;s <strong>Share</strong> button (
                    <svg style={{ display: "inline", verticalAlign: "middle" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                      <polyline points="16 6 12 2 8 6"></polyline>
                      <line x1="12" y1="2" x2="12" y2="15"></line>
                    </svg>
                  )</span>
                </div>
                <div className={styles.stepItem}>
                  <span>2. Scroll down and tap <strong>Add to Home Screen</strong> (+)</span>
                </div>
              </div>
            ) : null}

            <div className={styles.buttonRow}>
              {!isIosSafari && (
                <button
                  type="button"
                  className={styles.installBtn}
                  onClick={handleInstallClick}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  Install App
                </button>
              )}
              <button
                type="button"
                className={styles.laterBtn}
                onClick={handleDismiss}
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

