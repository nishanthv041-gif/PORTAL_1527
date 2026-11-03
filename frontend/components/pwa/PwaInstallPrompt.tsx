"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import styles from "./PwaInstallPrompt.module.css";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIosSafari, setIsIosSafari] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Check if already running in standalone PWA mode
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      document.referrer.includes("android-app://");

    if (isStandalone) {
      return; // Do not show install prompt if app is already installed & running standalone
    }

    // 2. Check if user dismissed prompt recently (within 7 days)
    const dismissedUntil = localStorage.getItem("srt_pwa_dismissed_until");
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) {
      return;
    }

    // 3. Detect iOS Safari
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: boolean }).MSStream;
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);

    if (isIos && isSafari) {
      setIsIosSafari(true);
      // Delay prompt slightly so user sees initial page first
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }

    // 4. Android Chrome / Windows / Mac Chrome & Edge: listen for `beforeinstallprompt`
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Delay showing slightly for smooth user experience
      setTimeout(() => setShowPrompt(true), 2500);
    };

    const handleAppInstalled = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
      console.info("[PWA] SRT Universal School Portal successfully installed.");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        console.info("[PWA] User accepted installation prompt");
      } else {
        console.info("[PWA] User dismissed installation prompt");
      }
    } catch (err) {
      console.error("[PWA] Error launching install prompt:", err);
    } finally {
      setShowPrompt(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Dismiss for 7 days
    try {
      localStorage.setItem(
        "srt_pwa_dismissed_until",
        String(Date.now() + 7 * 24 * 60 * 60 * 1000)
      );
    } catch { }
  };

  if (!showPrompt) {
    return null;
  }

  return (
    <div className={styles.pwaPromptContainer} role="dialog" aria-label="Install App Prompt">
      <div className={styles.pwaCard}>
        <div className={styles.pwaHeader}>
          <div className={styles.appBrand}>
            <div className={styles.appIcon}>
              <Image
                src="/icons/icon-192x192.png"
                alt="SRT Portal"
                width={36}
                height={36}
                priority
              />
            </div>
            <div className={styles.brandText}>
              <span className={styles.appName}>SRT Portal</span>
              <span className={styles.appBadge}>Official Web App</span>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleDismiss}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className={styles.pwaBody}>
          Install SRT Universal School Portal for instant 1-tap access, smooth navigation, and offline resilience.
        </div>

        {isIosSafari ? (
          <div className={styles.iosGuide}>
            <span>
              Tap <strong>Share</strong> (
              <svg style={{ display: "inline", verticalAlign: "middle", margin: "0 2px" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                <polyline points="16 6 12 2 8 6"></polyline>
                <line x1="12" y1="2" x2="12" y2="15"></line>
              </svg>
              ) then select <strong>Add to Home Screen</strong> (+)
            </span>
          </div>
        ) : (
          <div className={styles.pwaActions}>
            <button
              type="button"
              className={styles.installButton}
              onClick={handleInstallClick}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Install App
            </button>
            <button
              type="button"
              className={styles.dismissButton}
              onClick={handleDismiss}
            >
              Later
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

