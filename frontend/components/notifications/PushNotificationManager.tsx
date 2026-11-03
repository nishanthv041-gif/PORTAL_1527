"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, ShieldCheck, AlertCircle, Smartphone, Trash2, CheckCircle2 } from "lucide-react";
import styles from "./PushNotificationManager.module.css";
import {
  getUserNotificationPreferencesAction,
  updateUserNotificationPreferencesAction,
  deleteUserPushSubscriptionAction,
  UserNotificationPreferences,
} from "@/backend/api/actions/notifications/preferencesActions";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushNotificationManager() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const [preferences, setPreferences] = useState<UserNotificationPreferences>({
    enabled: true,
    general: true,
    account: true,
    alerts: true,
    academic: true,
    admin: true,
    maintenance: true,
  });

  const [subscriptions, setSubscriptions] = useState<
    Array<{ id: string; deviceName: string | null; createdAt: Date }>
  >([]);

  // Check current browser subscription status
  const checkCurrentSubscription = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission);

    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch (err) {
      console.warn("[Push] Error checking subscription:", err);
    }
  }, []);

  // Load preferences and device list
  const loadData = useCallback(async () => {
    const res = await getUserNotificationPreferencesAction();
    if (res && res.preferences) {
      setPreferences(res.preferences);
    }
    if (res && res.subscriptions) {
      setSubscriptions(
        res.subscriptions.map((s) => ({
          ...s,
          createdAt: new Date(s.createdAt),
        }))
      );
    }
  }, []);

  useEffect(() => {
    checkCurrentSubscription();
    loadData();
  }, [checkCurrentSubscription, loadData]);

  // Request browser permission and register push
  const handleEnablePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("Push notifications are not supported by this browser.");
      return;
    }

    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        setLoading(false);
        return;
      }

      // 1. Get VAPID public key
      const keyRes = await fetch("/api/notifications/push/public-key");
      const { publicKey } = await keyRes.json();
      if (!publicKey) {
        throw new Error("Missing public VAPID key");
      }

      // 2. Ensure service worker is ready
      const registration = await navigator.serviceWorker.ready;

      // 3. Subscribe with PushManager
      const applicationServerKey = urlBase64ToUint8Array(publicKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });

      // 4. Send subscription JSON to backend
      const subJson = subscription.toJSON();
      const deviceName = `${navigator.userAgent.includes("Mobile") ? "Mobile" : "Desktop"} Browser`;

      await fetch("/api/notifications/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
          userAgent: navigator.userAgent,
          deviceName,
        }),
      });

      setIsSubscribed(true);
      await loadData();
    } catch (err) {
      console.error("[Push] Enable error:", err);
      alert("Failed to enable notifications. Please check browser permissions.");
    } finally {
      setLoading(false);
    }
  };

  // Unsubscribe this device
  const handleDisablePush = async () => {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch("/api/notifications/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      setIsSubscribed(false);
      await loadData();
    } catch (err) {
      console.error("[Push] Disable error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Toggle category preference
  const handleTogglePreference = async (key: keyof UserNotificationPreferences) => {
    const updatedValue = !preferences[key];
    const newPrefs = { ...preferences, [key]: updatedValue };
    setPreferences(newPrefs);
    await updateUserNotificationPreferencesAction({ [key]: updatedValue });
  };

  // Remove specific registered device
  const handleRemoveDevice = async (subId: string) => {
    await deleteUserPushSubscriptionAction(subId);
    setSubscriptions((prev) => prev.filter((s) => s.id !== subId));
  };

  // Test server-to-device push notification
  const handleSendTest = async () => {
    setTestStatus("Sending server push to device...");
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") {
        setTestStatus("Please enable notifications first.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();

      const res = await fetch("/api/notifications/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub?.endpoint || null }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        setTestStatus("High-urgency push dispatched to your device!");
      } else {
        // Fallback to local notification if server dispatch had an issue
        await registration.showNotification("Nipo Portal Test Notification", {
          body: "Push registered! Testing local notification presentation.",
          icon: "/icons/icon-192x192.png",
          data: { url: "/dashboard" },
        });
        setTestStatus(data?.error || "Delivered local test notification.");
      }
      setTimeout(() => setTestStatus(null), 4000);
    } catch (err) {
      console.error("[Push Test Error]", err);
      setTestStatus("Error sending test push.");
      setTimeout(() => setTestStatus(null), 4000);
    }
  };

  return (
    <div className={styles.container}>
      {/* 1. Device Push Status Card */}
      <div className={styles.card}>
        <div className={styles.headerRow}>
          <div className={styles.titleArea}>
            <div className={styles.iconWrapper}>
              <Bell size={20} />
            </div>
            <div>
              <h3 className={styles.heading}>Device Push Notifications</h3>
              <p className={styles.subHeading}>
                Receive real-time alerts in your phone and desktop notification center
              </p>
            </div>
          </div>
          {isSubscribed && permission === "granted" && (
            <span className={styles.statusActive}>
              <CheckCircle2 size={14} /> Active
            </span>
          )}
        </div>

        {permission === "denied" && (
          <div className={styles.deniedAlert}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
              <AlertCircle size={16} /> Notification Permissions Blocked
            </div>
            <p style={{ marginTop: 4 }}>
              Your browser is currently blocking notifications for Nipo Portal. To enable:
              click the padlock/site settings icon next to the address bar, find <strong>Notifications</strong>, and set it to <strong>Allow</strong>.
            </p>
          </div>
        )}

        {permission === "unsupported" && (
          <div className={styles.deniedAlert}>
            Web Push notifications are not supported in this browser version. Please try modern Chrome, Edge, or Safari on iOS 16.4+.
          </div>
        )}

        {permission === "default" && (
          <div className={styles.banner}>
            <div className={styles.bannerText}>
              Enable push notifications to get instantaneous alerts for important school announcements, exam updates, attendance, and administrative notices even when the portal is closed.
            </div>
            <button
              type="button"
              className={styles.enableButton}
              onClick={handleEnablePush}
              disabled={loading}
            >
              <Bell size={16} />
              {loading ? "Enabling..." : "Enable Push Notifications"}
            </button>
          </div>
        )}

        {permission === "granted" && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            <p className={styles.bannerText}>
              {isSubscribed
                ? "This device is registered to receive instant operating-system notifications."
                : "Permission is granted, but push subscription is inactive on this device."}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {isSubscribed ? (
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={handleDisablePush}
                  disabled={loading}
                >
                  Unsubscribe This Device
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.enableButton}
                  onClick={handleEnablePush}
                  disabled={loading}
                >
                  <Bell size={16} /> Subscribe Device
                </button>
              )}
              <button
                type="button"
                onClick={handleSendTest}
                className={styles.enableButton}
                style={{ background: "rgba(255, 255, 255, 0.1)", border: "1px solid rgba(255, 255, 255, 0.15)" }}
              >
                Send Test Push
              </button>
              {testStatus && (
                <span style={{ fontSize: "0.82rem", color: "#60a5fa" }}>
                  {testStatus}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Notification Category Preferences */}
      <div className={styles.card}>
        <div className={styles.headerRow}>
          <div className={styles.titleArea}>
            <div className={styles.iconWrapper} style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className={styles.heading}>Notification Category Preferences</h3>
              <p className={styles.subHeading}>Choose the types of alerts you want to receive</p>
            </div>
          </div>
        </div>

        <div className={styles.categoriesGrid}>
          {/* Master Toggle */}
          <div className={styles.categoryItem} style={{ gridColumn: "1 / -1", background: "rgba(37, 99, 235, 0.08)", borderColor: "rgba(37, 99, 235, 0.2)" }}>
            <div className={styles.categoryInfo}>
              <span className={styles.categoryName} style={{ fontSize: "0.95rem" }}>All Notifications</span>
              <span className={styles.categoryDesc}>Master switch to pause or resume all notifications</span>
            </div>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={preferences.enabled}
                onChange={() => handleTogglePreference("enabled")}
              />
              <span className={styles.slider}></span>
            </label>
          </div>

          {/* General Announcements */}
          <div className={styles.categoryItem}>
            <div className={styles.categoryInfo}>
              <span className={styles.categoryName}>General Announcements</span>
              <span className={styles.categoryDesc}>School programs, events, and notices</span>
            </div>
            <label className={styles.switch}>
              <input
                type="checkbox"
                disabled={!preferences.enabled}
                checked={preferences.general}
                onChange={() => handleTogglePreference("general")}
              />
              <span className={styles.slider}></span>
            </label>
          </div>

          {/* Account Updates */}
          <div className={styles.categoryItem}>
            <div className={styles.categoryInfo}>
              <span className={styles.categoryName}>Account Updates</span>
              <span className={styles.categoryDesc}>Security, password, and session changes</span>
            </div>
            <label className={styles.switch}>
              <input
                type="checkbox"
                disabled={!preferences.enabled}
                checked={preferences.account}
                onChange={() => handleTogglePreference("account")}
              />
              <span className={styles.slider}></span>
            </label>
          </div>

          {/* Important Alerts */}
          <div className={styles.categoryItem}>
            <div className={styles.categoryInfo}>
              <span className={styles.categoryName}>Important Alerts</span>
              <span className={styles.categoryDesc}>High priority emergency notifications</span>
            </div>
            <label className={styles.switch}>
              <input
                type="checkbox"
                disabled={!preferences.enabled}
                checked={preferences.alerts}
                onChange={() => handleTogglePreference("alerts")}
              />
              <span className={styles.slider}></span>
            </label>
          </div>

          {/* Academic Updates */}
          <div className={styles.categoryItem}>
            <div className={styles.categoryInfo}>
              <span className={styles.categoryName}>Academic Updates</span>
              <span className={styles.categoryDesc}>Exams, marks, homework, and attendance</span>
            </div>
            <label className={styles.switch}>
              <input
                type="checkbox"
                disabled={!preferences.enabled}
                checked={preferences.academic}
                onChange={() => handleTogglePreference("academic")}
              />
              <span className={styles.slider}></span>
            </label>
          </div>

          {/* Administrative Messages */}
          <div className={styles.categoryItem}>
            <div className={styles.categoryInfo}>
              <span className={styles.categoryName}>Administrative Messages</span>
              <span className={styles.categoryDesc}>Circulars, teacher/parent correspondence</span>
            </div>
            <label className={styles.switch}>
              <input
                type="checkbox"
                disabled={!preferences.enabled}
                checked={preferences.admin}
                onChange={() => handleTogglePreference("admin")}
              />
              <span className={styles.slider}></span>
            </label>
          </div>

          {/* System Maintenance */}
          <div className={styles.categoryItem}>
            <div className={styles.categoryInfo}>
              <span className={styles.categoryName}>System Maintenance</span>
              <span className={styles.categoryDesc}>Scheduled maintenance and system health</span>
            </div>
            <label className={styles.switch}>
              <input
                type="checkbox"
                disabled={!preferences.enabled}
                checked={preferences.maintenance}
                onChange={() => handleTogglePreference("maintenance")}
              />
              <span className={styles.slider}></span>
            </label>
          </div>
        </div>
      </div>

      {/* 3. Registered Devices List */}
      {subscriptions.length > 0 && (
        <div className={styles.card}>
          <div className={styles.headerRow}>
            <div className={styles.titleArea}>
              <div className={styles.iconWrapper} style={{ background: "rgba(168, 85, 247, 0.15)", color: "#a855f7" }}>
                <Smartphone size={20} />
              </div>
              <div>
                <h3 className={styles.heading}>Registered Devices ({subscriptions.length})</h3>
                <p className={styles.subHeading}>Devices receiving notifications for your account</p>
              </div>
            </div>
          </div>

          <div className={styles.devicesList}>
            {subscriptions.map((sub) => (
              <div key={sub.id} className={styles.deviceItem}>
                <div className={styles.deviceInfo}>
                  <span className={styles.deviceName}>{sub.deviceName || "Web Device"}</span>
                  <span className={styles.deviceDate}>
                    Registered on {sub.createdAt.toLocaleDateString()}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => handleRemoveDevice(sub.id)}
                >
                  <Trash2 size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

