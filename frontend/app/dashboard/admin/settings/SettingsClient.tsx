"use client";

import { useState, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveSystemSettingsBatchAction } from "@/backend/api/actions/dashboard/admin/settings/actions";
import {
  lockSettingsAction,
  changeSettingsPasswordAction,
} from "@/backend/api/actions/dashboard/admin/settings/securityActions";
import { SystemSetting } from "@prisma/client";
import {
  Building2, Save, Loader2, CheckCircle2, Upload, AlertCircle, Image as ImageIcon,
  Phone, Mail, Globe, User, Calendar, MapPin, Users, GraduationCap, Clock, ArrowRight,
  Layers, Lock, KeyRound, Eye, EyeOff, ShieldCheck, ShieldAlert, Sparkles, RefreshCw,
  Smartphone, Bell
} from "lucide-react";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";
import BatchManagementClient from "../batches/BatchManagementClient";
import PushNotificationManager from "@/frontend/components/notifications/PushNotificationManager";
import styles from "./settings.module.css";

interface SettingsClientProps {
  initialSettings: SystemSetting[];
  batches?: any[];
  currentBatch?: any;
  unassignedClasses?: any[];
  initialTab?: string;
}

function calculatePasswordStrength(pass: string): {
  score: number;
  label: "Weak" | "Fair" | "Good" | "Strong";
  color: string;
} {
  if (!pass) return { score: 0, label: "Weak", color: "#ef4444" };
  let s = 0;
  if (pass.length >= 8) s++;
  if (pass.length >= 12) s++;
  if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) s++;
  if (/[0-9]/.test(pass)) s++;
  if (/[^A-Za-z0-9]/.test(pass)) s++;

  if (s <= 1) return { score: 1, label: "Weak", color: "#ef4444" };
  if (s === 2) return { score: 2, label: "Fair", color: "#f59e0b" };
  if (s === 3) return { score: 3, label: "Good", color: "#3b82f6" };
  return { score: 4, label: "Strong", color: "#10b981" };
}

export default function SettingsClient({
  initialSettings,
  batches = [],
  currentBatch = null,
  unassignedClasses = [],
  initialTab = "info",
}: SettingsClientProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active Tab: "info" | "batches" | "security" | "push"
  const [activeTab, setActiveTab] = useState<"info" | "batches" | "security" | "push">(() => {
    if (initialTab === "batches") return "batches";
    if (initialTab === "security") return "security";
    if (initialTab === "push") return "push";
    return "info";
  });

  const handleTabChange = (tab: "info" | "batches" | "security" | "push") => {
    setActiveTab(tab);
    // Update URL query string smoothly without reload
    const newUrl = tab === "info" ? "/dashboard/admin/settings" : `/dashboard/admin/settings?tab=${tab}`;
    window.history.pushState(null, "", newUrl);
  };

  // ----------------------------------------------------
  // SCHOOL INFORMATION TAB STATE
  // ----------------------------------------------------
  const [settingsValues, setSettingsValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {
      SCHOOL_NAME: "Modern School Portal",
      SCHOOL_LOGO: "",
      SCHOOL_ADDRESS: "123 Education Lane, Knowledge Park",
      SCHOOL_CONTACT: "+1 (555) 019-2834",
      SCHOOL_EMAIL: "admin@schoolportal.edu",
      SCHOOL_WEBSITE: "https://schoolportal.edu",
      PRINCIPAL_NAME: "Dr. Eleanor Vance",
      ACADEMIC_YEAR: "2026-2027",
    };
    initialSettings.forEach((s) => {
      initial[s.key] = s.value;
    });
    return initial;
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ----------------------------------------------------
  // CHANGE SETTINGS PASSWORD TAB STATE
  // ----------------------------------------------------
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passErrors, setPassErrors] = useState<Record<string, string>>({});
  const [passSubmitting, setPassSubmitting] = useState(false);
  const [passSuccessMessage, setPassSuccessMessage] = useState<string | null>(null);
  const [passErrorMessage, setPassErrorMessage] = useState<string | null>(null);

  const passwordStrength = calculatePasswordStrength(newPassword);

  // ----------------------------------------------------
  // LOCK SETTINGS ACTION
  // ----------------------------------------------------
  const [isLocking, startLockTransition] = useTransition();

  const handleLockSettings = async () => {
    const confirmed = await confirm({
      title: "Lock Settings Session?",
      message: "This will lock system settings and batch controls immediately. You will need to enter the settings password to access them again.",
      confirmText: "Lock Settings",
      cancelText: "Keep Unlocked",
      variant: "warning",
    });

    if (!confirmed) return;

    startLockTransition(async () => {
      await lockSettingsAction();
      router.push("/dashboard/admin/settings/unlock");
      router.refresh();
    });
  };

  // ----------------------------------------------------
  // LOGO & SCHOOL INFO HANDLERS
  // ----------------------------------------------------
  const handleChange = (key: string, value: string) => {
    setSettingsValues((prev) => ({ ...prev, [key]: value }));
    setSaveSuccess(false);
    setErrorMessage(null);
  };

  const compressLogoImage = (imgFile: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (imgFile.type === "image/svg+xml") {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imgFile);
        return;
      }

      const img = new Image();
      const objectUrl = URL.createObjectURL(imgFile);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const maxDim = 256;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(imgFile);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        try {
          const webpData = canvas.toDataURL("image/webp", 0.8);
          if (webpData.startsWith("data:image/webp")) {
            resolve(webpData);
            return;
          }
        } catch {}
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Failed to load image for compression"));
      };
      img.src = objectUrl;
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setErrorMessage("Logo image must be smaller than 2MB.");
      return;
    }

    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setErrorMessage("Only PNG, JPG, SVG, and WebP image formats are supported.");
      return;
    }

    try {
      const compressedDataUrl = await compressLogoImage(file);
      handleChange("SCHOOL_LOGO", compressedDataUrl);
      setErrorMessage(null);
    } catch {
      setErrorMessage("Failed to process logo image. Please try another image.");
    }
  };

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!settingsValues.SCHOOL_NAME?.trim()) {
      setErrorMessage("School Name cannot be empty.");
      return;
    }

    const confirmed = await confirm({
      title: "Save School Information?",
      message: "These changes will update school details across the entire portal immediately.",
      confirmText: "Save Changes",
      cancelText: "Cancel",
      variant: "primary",
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    setSaveSuccess(false);

    try {
      const batch = [
        { key: "SCHOOL_NAME", value: settingsValues.SCHOOL_NAME || "", category: "SCHOOL" },
        { key: "SCHOOL_LOGO", value: settingsValues.SCHOOL_LOGO || "", category: "SCHOOL" },
        { key: "SCHOOL_ADDRESS", value: settingsValues.SCHOOL_ADDRESS || "", category: "SCHOOL" },
        { key: "SCHOOL_CONTACT", value: settingsValues.SCHOOL_CONTACT || "", category: "SCHOOL" },
        { key: "SCHOOL_EMAIL", value: settingsValues.SCHOOL_EMAIL || "", category: "SCHOOL" },
        { key: "SCHOOL_WEBSITE", value: settingsValues.SCHOOL_WEBSITE || "", category: "SCHOOL" },
        { key: "PRINCIPAL_NAME", value: settingsValues.PRINCIPAL_NAME || "", category: "SCHOOL" },
        { key: "ACADEMIC_YEAR", value: settingsValues.ACADEMIC_YEAR || "", category: "SCHOOL" },
      ];

      const res = await saveSystemSettingsBatchAction(batch);
      if (res?.error) {
        setErrorMessage(res.error);
      } else {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      }
    } catch {
      setErrorMessage("Failed to save settings. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // CHANGE SETTINGS PASSWORD HANDLER
  // ----------------------------------------------------
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassErrorMessage(null);
    setPassSuccessMessage(null);
    setPassErrors({});

    // Client-side validation
    const errors: Record<string, string> = {};
    if (!oldPassword.trim()) {
      errors.oldPassword = "Current settings password is required.";
    }
    if (newPassword.length < 8) {
      errors.newPassword = "New password must be at least 8 characters long.";
    } else if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      errors.newPassword = "New password must contain at least one letter and one number.";
    } else if (newPassword === oldPassword) {
      errors.newPassword = "New password must be different from your current password.";
    }
    if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your new password.";
    } else if (newPassword !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }

    if (Object.keys(errors).length > 0) {
      setPassErrors(errors);
      return;
    }

    setPassSubmitting(true);
    try {
      const res = await changeSettingsPasswordAction({
        oldPassword,
        newPassword,
        confirmPassword,
      });

      if (res?.error) {
        setPassErrorMessage(res.error);
        if (res.fieldErrors) {
          setPassErrors(res.fieldErrors);
        }
      } else if (res?.success) {
        setPassSuccessMessage("Settings password successfully changed! You remain authenticated in Settings.");
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPassErrors({});
        setTimeout(() => setPassSuccessMessage(null), 6000);
      }
    } catch {
      setPassErrorMessage("An unexpected network error occurred. Please try again.");
    } finally {
      setPassSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: "1080px", width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
      {/* ── SETTINGS NAVIGATION BAR (TABS + LOCK BUTTON) ────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        {/* Navigation Tabs */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            background: "var(--card-bg, #0f172a)",
            padding: "0.35rem",
            borderRadius: "12px",
            border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => handleTabChange("info")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.6rem 1.1rem",
              borderRadius: "8px",
              fontSize: "0.9rem",
              fontWeight: activeTab === "info" ? 700 : 500,
              border: "none",
              color: activeTab === "info" ? "#ffffff" : "var(--text-secondary, #94a3b8)",
              background: activeTab === "info" ? "var(--primary, #3b82f6)" : "transparent",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <Building2 size={18} />
            <span>School Information</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("batches")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.6rem 1.1rem",
              borderRadius: "8px",
              fontSize: "0.9rem",
              fontWeight: activeTab === "batches" ? 700 : 500,
              border: "none",
              color: activeTab === "batches" ? "#ffffff" : "var(--text-secondary, #94a3b8)",
              background: activeTab === "batches" ? "var(--primary, #3b82f6)" : "transparent",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <Layers size={18} />
            <span>Batches &amp; Promotion</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("security")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.6rem 1.1rem",
              borderRadius: "8px",
              fontSize: "0.9rem",
              fontWeight: activeTab === "security" ? 700 : 500,
              border: "none",
              color: activeTab === "security" ? "#ffffff" : "var(--text-secondary, #94a3b8)",
              background: activeTab === "security" ? "var(--primary, #3b82f6)" : "transparent",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <KeyRound size={18} />
            <span>Change Settings Password</span>
          </button>

          {/* Tab 4: Push Notifications & Devices */}
          <button
            type="button"
            onClick={() => handleTabChange("push")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.6rem 1.1rem",
              borderRadius: "8px",
              fontSize: "0.9rem",
              fontWeight: activeTab === "push" ? 700 : 500,
              border: "none",
              color: activeTab === "push" ? "#ffffff" : "var(--text-secondary, #94a3b8)",
              background: activeTab === "push" ? "var(--primary, #3b82f6)" : "transparent",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <Smartphone size={18} />
            <span>Push Notifications &amp; Devices</span>
          </button>

          <div
            style={{
              width: "1px",
              height: "22px",
              backgroundColor: "rgba(255, 255, 255, 0.12)",
              margin: "0 0.2rem",
            }}
          />

          <Link
            href="/dashboard/admin/teachers"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.6rem 1.1rem",
              borderRadius: "8px",
              fontSize: "0.9rem",
              fontWeight: 500,
              textDecoration: "none",
              color: "var(--text-secondary, #94a3b8)",
              background: "transparent",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <Users size={18} />
            <span>Teacher Management</span>
          </Link>

          <Link
            href="/dashboard/admin/students"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.6rem 1.1rem",
              borderRadius: "8px",
              fontSize: "0.9rem",
              fontWeight: 500,
              textDecoration: "none",
              color: "var(--text-secondary, #94a3b8)",
              background: "transparent",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <GraduationCap size={18} />
            <span>Parent &amp; Student</span>
          </Link>
        </div>

        {/* Lock Settings Button */}
        <button
          type="button"
          onClick={handleLockSettings}
          disabled={isLocking}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.6rem 1.1rem",
            borderRadius: "10px",
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            color: "#f87171",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: isLocking ? "not-allowed" : "pointer",
            transition: "all 0.15s ease",
          }}
          title="Instantly lock Settings session"
        >
          {isLocking ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Locking...</span>
            </>
          ) : (
            <>
              <Lock size={16} />
              <span>Lock Settings</span>
            </>
          )}
        </button>
      </div>

      {/* ── TAB 1: SCHOOL INFORMATION ───────────────────────────────────────── */}
      {activeTab === "info" && (
        <div style={{ maxWidth: "860px", width: "100%", margin: "0 auto" }}>
          <div
            style={{
              background: "var(--card-bg, #0f172a)",
              border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
              borderRadius: "16px",
              overflow: "hidden",
              boxShadow: "0 10px 30px -10px rgba(0,0,0,0.5)",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "1.5rem 2rem",
                borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                background: "rgba(59, 130, 246, 0.05)",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "rgba(59, 130, 246, 0.15)",
                  color: "#3b82f6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Building2 size={22} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary, #f8fafc)" }}>
                  School Profile &amp; General Configuration
                </h2>
              </div>
            </div>

            {/* Feedback Messages */}
            <div style={{ padding: "0 2rem", marginTop: errorMessage || saveSuccess ? "1.5rem" : 0 }}>
              {errorMessage && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.85rem 1rem",
                    borderRadius: "8px",
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    color: "#f87171",
                    fontSize: "0.9rem",
                  }}
                >
                  <AlertCircle size={18} />
                  <span>{errorMessage}</span>
                </div>
              )}

              {saveSuccess && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.85rem 1rem",
                    borderRadius: "8px",
                    background: "rgba(16, 185, 129, 0.12)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    color: "#34d399",
                    fontSize: "0.9rem",
                  }}
                >
                  <CheckCircle2 size={18} />
                  <span>School information successfully updated across the portal!</span>
                </div>
              )}
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveInfo} style={{ padding: "2rem" }}>
              {/* Logo Section */}
              <div
                style={{
                  padding: "1.5rem",
                  background: "rgba(255, 255, 255, 0.02)",
                  borderRadius: "12px",
                  border: "1px dashed var(--border-color, rgba(255, 255, 255, 0.15))",
                  marginBottom: "2rem",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "1.5rem",
                }}
              >
                <div
                  style={{
                    width: "90px",
                    height: "90px",
                    borderRadius: "12px",
                    background: "rgba(0, 0, 0, 0.3)",
                    border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {settingsValues.SCHOOL_LOGO ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={settingsValues.SCHOOL_LOGO}
                      alt="School Logo"
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  ) : (
                    <ImageIcon size={36} style={{ color: "var(--text-secondary, #64748b)" }} />
                  )}
                </div>

                <div style={{ flex: "1 1 240px" }}>
                  <h4 style={{ margin: "0 0 0.35rem 0", fontSize: "1rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)" }}>
                    School Crest / Official Logo
                  </h4>
                  <p style={{ margin: "0 0 1rem 0", fontSize: "0.825rem", color: "var(--text-secondary, #94a3b8)", lineHeight: 1.4 }}>
                    Displayed on the login splash screen, topbar navigation, report cards, and official emails.
                  </p>

                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleLogoUpload}
                      accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                      style={{ display: "none" }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.5rem 1rem",
                        borderRadius: "8px",
                        background: "rgba(59, 130, 246, 0.15)",
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                        color: "#3b82f6",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <Upload size={15} />
                      <span>Upload New Logo</span>
                    </button>

                    {settingsValues.SCHOOL_LOGO && (
                      <button
                        type="button"
                        onClick={() => handleChange("SCHOOL_LOGO", "")}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          padding: "0.5rem 1rem",
                          borderRadius: "8px",
                          background: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid rgba(239, 68, 68, 0.25)",
                          color: "#f87171",
                          fontSize: "0.85rem",
                          fontWeight: 500,
                          cursor: "pointer",
                        }}
                      >
                        Remove Logo
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Grid of Fields */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem" }}>
                {/* School Name */}
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.4rem" }}>
                    <Building2 size={15} style={{ color: "#3b82f6" }} />
                    <span>School Name *</span>
                  </label>
                  <input
                    type="text"
                    value={settingsValues.SCHOOL_NAME || ""}
                    onChange={(e) => handleChange("SCHOOL_NAME", e.target.value)}
                    placeholder="e.g. SRT Universal School"
                    style={{
                      width: "100%",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                      background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                      color: "inherit",
                      fontSize: "0.9rem",
                    }}
                  />
                </div>

                {/* Principal Name */}
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.4rem" }}>
                    <User size={15} style={{ color: "#3b82f6" }} />
                    <span>Principal / Head of Institution</span>
                  </label>
                  <input
                    type="text"
                    value={settingsValues.PRINCIPAL_NAME || ""}
                    onChange={(e) => handleChange("PRINCIPAL_NAME", e.target.value)}
                    placeholder="e.g. Dr. Eleanor Vance"
                    style={{
                      width: "100%",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                      background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                      color: "inherit",
                      fontSize: "0.9rem",
                    }}
                  />
                </div>

                {/* Contact Phone */}
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.4rem" }}>
                    <Phone size={15} style={{ color: "#3b82f6" }} />
                    <span>Contact Phone</span>
                  </label>
                  <input
                    type="text"
                    value={settingsValues.SCHOOL_CONTACT || ""}
                    onChange={(e) => handleChange("SCHOOL_CONTACT", e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    style={{
                      width: "100%",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                      background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                      color: "inherit",
                      fontSize: "0.9rem",
                    }}
                  />
                </div>

                {/* Contact Email */}
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.4rem" }}>
                    <Mail size={15} style={{ color: "#3b82f6" }} />
                    <span>Official Email</span>
                  </label>
                  <input
                    type="email"
                    value={settingsValues.SCHOOL_EMAIL || ""}
                    onChange={(e) => handleChange("SCHOOL_EMAIL", e.target.value)}
                    placeholder="e.g. admin@schoolportal.edu"
                    style={{
                      width: "100%",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                      background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                      color: "inherit",
                      fontSize: "0.9rem",
                    }}
                  />
                </div>

                {/* School Website */}
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.4rem" }}>
                    <Globe size={15} style={{ color: "#3b82f6" }} />
                    <span>Official Website</span>
                  </label>
                  <input
                    type="text"
                    value={settingsValues.SCHOOL_WEBSITE || ""}
                    onChange={(e) => handleChange("SCHOOL_WEBSITE", e.target.value)}
                    placeholder="e.g. https://srtuniversalschool.edu"
                    style={{
                      width: "100%",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                      background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                      color: "inherit",
                      fontSize: "0.9rem",
                    }}
                  />
                </div>

                {/* Academic Year Label */}
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.4rem" }}>
                    <Calendar size={15} style={{ color: "#3b82f6" }} />
                    <span>Academic Year Label</span>
                  </label>
                  <input
                    type="text"
                    value={settingsValues.ACADEMIC_YEAR || ""}
                    onChange={(e) => handleChange("ACADEMIC_YEAR", e.target.value)}
                    placeholder="e.g. 2026-2027"
                    style={{
                      width: "100%",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                      background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                      color: "inherit",
                      fontSize: "0.9rem",
                    }}
                  />
                </div>
              </div>

              {/* Address */}
              <div style={{ marginTop: "1.5rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.4rem" }}>
                  <MapPin size={15} style={{ color: "#3b82f6" }} />
                  <span>School Address</span>
                </label>
                <textarea
                  rows={3}
                  value={settingsValues.SCHOOL_ADDRESS || ""}
                  onChange={(e) => handleChange("SCHOOL_ADDRESS", e.target.value)}
                  placeholder="e.g. 123 Education Lane, Knowledge Park"
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                    background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                    color: "inherit",
                    fontSize: "0.9rem",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* Action Bar */}
              <div
                style={{
                  marginTop: "2.5rem",
                  paddingTop: "1.5rem",
                  borderTop: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "1rem",
                }}
              >
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    padding: "0.75rem 1.75rem",
                    borderRadius: "10px",
                    background: "var(--primary, #3b82f6)",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 600,
                    fontSize: "0.95rem",
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    boxShadow: "0 4px 14px 0 rgba(59, 130, 246, 0.39)",
                    opacity: isSubmitting ? 0.7 : 1,
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      <span>Save School Information</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── TAB 2: BATCHES & PROMOTION ───────────────────────────────────────── */}
      {activeTab === "batches" && (
        <div style={{ width: "100%" }}>
          <BatchManagementClient
            batches={batches}
            currentBatch={currentBatch}
            unassignedClasses={unassignedClasses}
          />
        </div>
      )}

      {/* ── TAB 3: CHANGE SETTINGS PASSWORD ─────────────────────────────────── */}
      {activeTab === "security" && (
        <div style={{ maxWidth: "680px", width: "100%", margin: "0 auto" }}>
          <div
            style={{
              background: "var(--card-bg, #0f172a)",
              border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
              borderRadius: "16px",
              overflow: "hidden",
              boxShadow: "0 10px 30px -10px rgba(0,0,0,0.5)",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "1.5rem 2rem",
                borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                background: "rgba(139, 92, 246, 0.05)",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "rgba(139, 92, 246, 0.15)",
                  color: "#8b5cf6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <KeyRound size={22} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary, #f8fafc)" }}>
                  Change Settings Master Password
                </h2>
                <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.825rem", color: "var(--text-secondary, #94a3b8)" }}>
                  Update the password required to unlock settings and academic batch promotion controls.
                </p>
              </div>
            </div>

            {/* Feedback Banners */}
            <div style={{ padding: "0 2rem", marginTop: passErrorMessage || passSuccessMessage ? "1.5rem" : 0 }}>
              {passErrorMessage && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.85rem 1rem",
                    borderRadius: "8px",
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    color: "#f87171",
                    fontSize: "0.9rem",
                  }}
                >
                  <ShieldAlert size={18} />
                  <span>{passErrorMessage}</span>
                </div>
              )}

              {passSuccessMessage && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.85rem 1rem",
                    borderRadius: "8px",
                    background: "rgba(16, 185, 129, 0.12)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    color: "#34d399",
                    fontSize: "0.9rem",
                  }}
                >
                  <ShieldCheck size={18} />
                  <span>{passSuccessMessage}</span>
                </div>
              )}
            </div>

            {/* Password Form */}
            <form onSubmit={handleSavePassword} style={{ padding: "2rem" }}>
              {/* Old Password */}
              <div style={{ marginBottom: "1.5rem" }}>
                <label
                  htmlFor="settings-old-password"
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--text-primary, #f8fafc)",
                    marginBottom: "0.4rem",
                  }}
                >
                  Current Settings Password *
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="settings-old-password"
                    type={showOld ? "text" : "password"}
                    value={oldPassword}
                    onChange={(e) => {
                      setOldPassword(e.target.value);
                      if (passErrors.oldPassword) setPassErrors((p) => ({ ...p, oldPassword: "" }));
                    }}
                    placeholder="Enter current password..."
                    disabled={passSubmitting}
                    autoComplete="current-password"
                    style={{
                      width: "100%",
                      padding: "0.7rem 2.85rem 0.7rem 0.9rem",
                      borderRadius: "8px",
                      border: passErrors.oldPassword
                        ? "1px solid #ef4444"
                        : "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                      background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                      color: "inherit",
                      fontSize: "0.9rem",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowOld((p) => !p)}
                    style={{
                      position: "absolute",
                      right: "0.75rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "var(--text-secondary, #94a3b8)",
                      cursor: "pointer",
                      padding: "0.25rem",
                    }}
                    title={showOld ? "Hide password" : "Show password"}
                  >
                    {showOld ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {passErrors.oldPassword && (
                  <p style={{ margin: "0.35rem 0 0 0", fontSize: "0.8rem", color: "#f87171" }}>
                    {passErrors.oldPassword}
                  </p>
                )}
              </div>

              {/* New Password */}
              <div style={{ marginBottom: "1.5rem" }}>
                <label
                  htmlFor="settings-new-password"
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--text-primary, #f8fafc)",
                    marginBottom: "0.4rem",
                  }}
                >
                  New Settings Password *
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="settings-new-password"
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (passErrors.newPassword) setPassErrors((p) => ({ ...p, newPassword: "" }));
                    }}
                    placeholder="At least 8 characters with a letter and a number..."
                    disabled={passSubmitting}
                    autoComplete="new-password"
                    style={{
                      width: "100%",
                      padding: "0.7rem 2.85rem 0.7rem 0.9rem",
                      borderRadius: "8px",
                      border: passErrors.newPassword
                        ? "1px solid #ef4444"
                        : "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                      background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                      color: "inherit",
                      fontSize: "0.9rem",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((p) => !p)}
                    style={{
                      position: "absolute",
                      right: "0.75rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "var(--text-secondary, #94a3b8)",
                      cursor: "pointer",
                      padding: "0.25rem",
                    }}
                    title={showNew ? "Hide password" : "Show password"}
                  >
                    {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {passErrors.newPassword && (
                  <p style={{ margin: "0.35rem 0 0 0", fontSize: "0.8rem", color: "#f87171" }}>
                    {passErrors.newPassword}
                  </p>
                )}

                {/* Password Strength Indicator */}
                {newPassword.length > 0 && (
                  <div style={{ marginTop: "0.6rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary, #94a3b8)" }}>
                        Password Strength
                      </span>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: passwordStrength.color }}>
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div
                      style={{
                        height: "5px",
                        width: "100%",
                        background: "rgba(255, 255, 255, 0.08)",
                        borderRadius: "999px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${(passwordStrength.score / 4) * 100}%`,
                          background: passwordStrength.color,
                          borderRadius: "999px",
                          transition: "width 0.2s ease, background 0.2s ease",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div style={{ marginBottom: "2rem" }}>
                <label
                  htmlFor="settings-confirm-password"
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--text-primary, #f8fafc)",
                    marginBottom: "0.4rem",
                  }}
                >
                  Confirm New Password *
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="settings-confirm-password"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (passErrors.confirmPassword) setPassErrors((p) => ({ ...p, confirmPassword: "" }));
                    }}
                    placeholder="Re-enter new password..."
                    disabled={passSubmitting}
                    autoComplete="new-password"
                    style={{
                      width: "100%",
                      padding: "0.7rem 2.85rem 0.7rem 0.9rem",
                      borderRadius: "8px",
                      border: passErrors.confirmPassword
                        ? "1px solid #ef4444"
                        : "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                      background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                      color: "inherit",
                      fontSize: "0.9rem",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((p) => !p)}
                    style={{
                      position: "absolute",
                      right: "0.75rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "var(--text-secondary, #94a3b8)",
                      cursor: "pointer",
                      padding: "0.25rem",
                    }}
                    title={showConfirm ? "Hide password" : "Show password"}
                  >
                    {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {passErrors.confirmPassword && (
                  <p style={{ margin: "0.35rem 0 0 0", fontSize: "0.8rem", color: "#f87171" }}>
                    {passErrors.confirmPassword}
                  </p>
                )}
              </div>

              {/* Action Bar */}
              <div
                style={{
                  paddingTop: "1.5rem",
                  borderTop: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "1rem",
                }}
              >
                <button
                  type="submit"
                  disabled={passSubmitting}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    padding: "0.75rem 1.75rem",
                    borderRadius: "10px",
                    background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 600,
                    fontSize: "0.95rem",
                    cursor: passSubmitting ? "not-allowed" : "pointer",
                    boxShadow: "0 4px 14px 0 rgba(139, 92, 246, 0.35)",
                    opacity: passSubmitting ? 0.75 : 1,
                  }}
                >
                  {passSubmitting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Updating Password...</span>
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      <span>Change Settings Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── TAB 4: PUSH NOTIFICATIONS & DEVICE MANAGEMENT ─────────────────── */}
      {activeTab === "push" && (
        <div style={{ maxWidth: "860px", width: "100%", margin: "0 auto" }}>
          <PushNotificationManager />
        </div>
      )}
    </div>
  );
}
