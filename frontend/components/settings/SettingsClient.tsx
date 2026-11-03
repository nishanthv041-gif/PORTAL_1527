"use client";

import React, { useState, useTransition, memo } from "react";
import {
  User,
  Shield,
  Sliders,
  Building,
  Save,
  LogOut,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Sun,
  Moon,
  Laptop,
} from "lucide-react";
import {
  TextInput,
  Select,
  Checkbox,
  FormField,
} from "@/frontend/components/ui/form";
import {
  updateUserProfile,
  changeUserPassword,
  logoutAllSessions,
  updateUserPreferences,
  saveSchoolDefaultsAction,
} from "@/backend/api/actions/settings/userSettingsActions";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";


export interface SettingsUser {
  id: string;
  name: string;
  email: string;
  role: string;
  theme?: string;
  notificationsEnabled?: boolean;
}

export interface SettingsRoleProfile {
  phone?: string | null;
  alternatePhone?: string | null;
  qualification?: string | null;
}

export interface SettingsClientProps {
  user: SettingsUser;
  roleProfile: SettingsRoleProfile;
  schoolDefaults?: Record<string, string>;
}

type TabKey = "profile" | "security" | "preferences" | "school";

export const SettingsClient = memo(function SettingsClient({
  user,
  roleProfile,
  schoolDefaults = {},
}: SettingsClientProps) {
  const confirm = useConfirm();
  const isAdmin = user.role?.toUpperCase() === "ADMIN";

  // Tab State
  const [activeTab, setActiveTab] = useState<TabKey>("profile");

  // Feedback states per section
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [securityMsg, setSecurityMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [prefMsg, setPrefMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [schoolMsg, setSchoolMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Transitions per section
  const [isPendingProfile, startProfileTransition] = useTransition();
  const [isPendingSecurity, startSecurityTransition] = useTransition();
  const [isPendingPref, startPrefTransition] = useTransition();
  const [isPendingSchool, startSchoolTransition] = useTransition();

  // 1. Profile State
  const [name, setName] = useState(user.name || "");
  const [phone, setPhone] = useState(roleProfile.phone || "");
  const [alternatePhone, setAlternatePhone] = useState(roleProfile.alternatePhone || "");
  const [qualification, setQualification] = useState(roleProfile.qualification || "");

  // 2. Security State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // 3. Preferences State
  const [theme, setTheme] = useState<"light" | "dark" | "system">(
    (user.theme as "light" | "dark") || "system"
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    user.notificationsEnabled ?? true
  );
  const [busAlertsSMS, setBusAlertsSMS] = useState(false);
  const [busAlertsEmail, setBusAlertsEmail] = useState(true);
  const [busAlertsApp, setBusAlertsApp] = useState(true);
  const [feeReminders, setFeeReminders] = useState(true);
  const [attendanceAlerts, setAttendanceAlerts] = useState(true);

  // 4. School Defaults State (Admin only)
  const [schoolName, setSchoolName] = useState(schoolDefaults.SCHOOL_NAME || "SRT UNIVERSAL SCHOOL");
  const [tagline, setTagline] = useState(schoolDefaults.SCHOOL_TAGLINE || "Seeing Righteousness & Truth");
  const [address, setAddress] = useState(schoolDefaults.SCHOOL_ADDRESS || "");
  const [contact, setContact] = useState(schoolDefaults.SCHOOL_CONTACT || "");
  const [email, setEmail] = useState(schoolDefaults.SCHOOL_EMAIL || "");
  const [website, setWebsite] = useState(schoolDefaults.SCHOOL_WEBSITE || "");
  const [academicYear, setAcademicYear] = useState(schoolDefaults.ACADEMIC_YEAR || "2024-2025");
  const [busAlertPriority, setBusAlertPriority] = useState(
    schoolDefaults.BUS_ALERT_DEFAULT_PRIORITY || "NORMAL"
  );

  // Password strength calculator
  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return { score: 0, label: "", color: "transparent" };
    let score = 0;
    if (pwd.length >= 6) score += 1;
    if (pwd.length >= 8) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    if (score <= 2) return { score, label: "Weak", color: "#ef4444" };
    if (score <= 4) return { score, label: "Medium", color: "#f59e0b" };
    return { score, label: "Strong", color: "#10b981" };
  };

  const passwordStrength = getPasswordStrength(newPassword);

  // Handlers
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    startProfileTransition(async () => {
      const res = await updateUserProfile({
        name,
        phone,
        alternatePhone,
        qualification,
      });
      if (res.success) {
        setProfileMsg({ type: "success", text: res.message || "Profile updated successfully." });
      } else {
        setProfileMsg({ type: "error", text: res.error || "Failed to update profile." });
      }
    });
  };

  const handleSaveSecurity = (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityMsg(null);

    if (newPassword !== confirmPassword) {
      setSecurityMsg({ type: "error", text: "New password and confirmation do not match." });
      return;
    }
    if (newPassword.length < 6) {
      setSecurityMsg({ type: "error", text: "New password must be at least 6 characters long." });
      return;
    }

    startSecurityTransition(async () => {
      const res = await changeUserPassword({
        currentPassword,
        newPassword,
      });
      if (res.success) {
        setSecurityMsg({ type: "success", text: res.message || "Password changed successfully." });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setSecurityMsg({ type: "error", text: res.error || "Failed to change password." });
      }
    });
  };

  const handleLogoutAllSessions = async () => {
    const ok = await confirm({
      title: "Logout All Other Devices?",
      message: "This will invalidate all active sessions on other browsers and mobile devices. You will stay signed in on this browser.",
      confirmText: "Logout Other Devices",
      cancelText: "Cancel",
      variant: "danger",
    });
    if (!ok) return;

    setSecurityMsg(null);
    startSecurityTransition(async () => {
      const res = await logoutAllSessions();
      if (res.success) {
        setSecurityMsg({ type: "success", text: res.message || "All other sessions logged out." });
      } else {
        setSecurityMsg({ type: "error", text: res.error || "Failed to logout sessions." });
      }
    });
  };

  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault();
    setPrefMsg(null);
    startPrefTransition(async () => {
      const res = await updateUserPreferences({
        theme,
        notificationsEnabled,
        busAlertsSMS,
        busAlertsEmail,
        busAlertsApp,
      });
      if (res.success) {
        setPrefMsg({ type: "success", text: res.message || "Preferences saved successfully." });
        // Immediate DOM theme application
        if (typeof document !== "undefined") {
          if (theme === "system") {
            const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
          } else {
            document.documentElement.setAttribute("data-theme", theme);
          }
        }
      } else {
        setPrefMsg({ type: "error", text: res.error || "Failed to save preferences." });
      }
    });
  };

  const handleSaveSchoolDefaults = (e: React.FormEvent) => {
    e.preventDefault();
    setSchoolMsg(null);
    startSchoolTransition(async () => {
      const res = await saveSchoolDefaultsAction({
        schoolName,
        tagline,
        address,
        contact,
        email,
        website,
        academicYear,
        busAlertPriority,
      });
      if (res.success) {
        setSchoolMsg({ type: "success", text: res.message || "School profile & defaults saved." });
      } else {
        setSchoolMsg({ type: "error", text: res.error || "Failed to save school defaults." });
      }
    });
  };

  return (
    <div style={{ width: "100%", maxWidth: "980px", margin: "0 auto", paddingBottom: "3rem" }}>
      {/* Header Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, var(--navy, #0b1329) 0%, #1e293b 100%)",
          borderRadius: "16px",
          padding: "clamp(1.25rem, 3vw, 2rem)",
          color: "#ffffff",
          marginBottom: "1.75rem",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.12)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gold, #f2b84b)", fontWeight: 700, marginBottom: "0.3rem" }}>
              Account &amp; System Configuration
            </div>
            <h1 style={{ margin: 0, fontSize: "clamp(1.4rem, 2.8vw, 1.85rem)", fontWeight: 800 }}>
              Settings
            </h1>
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.9rem", opacity: 0.85 }}>
              Manage personal credentials, preferences, notifications and school defaults.
            </p>
          </div>
          <div
            style={{
              padding: "0.4rem 0.85rem",
              borderRadius: "9999px",
              background: "rgba(255, 255, 255, 0.1)",
              backdropFilter: "blur(8px)",
              fontSize: "0.8rem",
              fontWeight: 700,
              color: "var(--gold, #f2b84b)",
              border: "1px solid rgba(242, 184, 75, 0.3)",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            Role: {user.role}
          </div>
        </div>
      </div>

      {/* Navigation Tabs (Mobile-Scrollable) */}
      <div
        role="tablist"
        aria-label="Settings Sections"
        style={{
          display: "flex",
          gap: "0.5rem",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          paddingBottom: "0.5rem",
          marginBottom: "1.5rem",
          borderBottom: "1px solid var(--border-color, #e2e8f0)",
          scrollbarWidth: "none",
        }}
      >
        <button
          role="tab"
          type="button"
          aria-selected={activeTab === "profile"}
          onClick={() => setActiveTab("profile")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.65rem 1.15rem",
            borderRadius: "10px",
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.9rem",
            whiteSpace: "nowrap",
            transition: "all 0.15s ease",
            background: activeTab === "profile" ? "var(--primary, #3b82f6)" : "var(--card-bg, #ffffff)",
            color: activeTab === "profile" ? "#ffffff" : "var(--text-secondary, #64748b)",
            boxShadow: activeTab === "profile" ? "0 2px 8px rgba(59, 130, 246, 0.25)" : "none",
          }}
        >
          <User size={17} /> Profile
        </button>

        <button
          role="tab"
          type="button"
          aria-selected={activeTab === "security"}
          onClick={() => setActiveTab("security")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.65rem 1.15rem",
            borderRadius: "10px",
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.9rem",
            whiteSpace: "nowrap",
            transition: "all 0.15s ease",
            background: activeTab === "security" ? "var(--primary, #3b82f6)" : "var(--card-bg, #ffffff)",
            color: activeTab === "security" ? "#ffffff" : "var(--text-secondary, #64748b)",
            boxShadow: activeTab === "security" ? "0 2px 8px rgba(59, 130, 246, 0.25)" : "none",
          }}
        >
          <Shield size={17} /> Security
        </button>

        <button
          role="tab"
          type="button"
          aria-selected={activeTab === "preferences"}
          onClick={() => setActiveTab("preferences")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.65rem 1.15rem",
            borderRadius: "10px",
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.9rem",
            whiteSpace: "nowrap",
            transition: "all 0.15s ease",
            background: activeTab === "preferences" ? "var(--primary, #3b82f6)" : "var(--card-bg, #ffffff)",
            color: activeTab === "preferences" ? "#ffffff" : "var(--text-secondary, #64748b)",
            boxShadow: activeTab === "preferences" ? "0 2px 8px rgba(59, 130, 246, 0.25)" : "none",
          }}
        >
          <Sliders size={17} /> Preferences
        </button>

        {isAdmin && (
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === "school"}
            onClick={() => setActiveTab("school")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.65rem 1.15rem",
              borderRadius: "10px",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.9rem",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
              background: activeTab === "school" ? "var(--gold, #f2b84b)" : "var(--card-bg, #ffffff)",
              color: activeTab === "school" ? "#0b1329" : "var(--text-secondary, #64748b)",
              boxShadow: activeTab === "school" ? "0 2px 8px rgba(242, 184, 75, 0.3)" : "none",
            }}
          >
            <Building size={17} /> School Profile &amp; Defaults
          </button>
        )}
      </div>

      {/* TAB 1: PROFILE */}
      {activeTab === "profile" && (
        <div
          role="tabpanel"
          style={{
            background: "var(--card-bg, #ffffff)",
            borderRadius: "14px",
            border: "1px solid var(--border-color, #e2e8f0)",
            padding: "clamp(1.25rem, 3vw, 2rem)",
            boxShadow: "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))",
          }}
        >
          <div style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--foreground, #0f172a)" }}>
              Profile Information
            </h2>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-secondary, #64748b)" }}>
              Update your primary identification and contact records.
            </p>
          </div>

          {profileMsg && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                marginBottom: "1.25rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                background: profileMsg.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                color: profileMsg.type === "success" ? "#10b981" : "#ef4444",
                border: `1px solid ${profileMsg.type === "success" ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
              }}
            >
              {profileMsg.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{profileMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleSaveProfile} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "1.25rem" }}>
              <TextInput
                label="Full Name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your official name"
              />

              <TextInput
                label="Email Address"
                value={user.email}
                disabled
                helperText="Email cannot be changed directly. Contact administrator."
              />

              <TextInput
                label="Primary Phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
              />

              <TextInput
                label="Alternate Phone"
                type="tel"
                value={alternatePhone}
                onChange={(e) => setAlternatePhone(e.target.value)}
                placeholder="Optional emergency phone"
              />

              {user.role === "TEACHER" && (
                <TextInput
                  label="Academic Qualification"
                  value={qualification}
                  onChange={(e) => setQualification(e.target.value)}
                  placeholder="e.g. M.Sc. B.Ed, M.Phil"
                />
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button
                type="submit"
                disabled={isPendingProfile}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 1.5rem",
                  borderRadius: "10px",
                  border: "none",
                  cursor: isPendingProfile ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  backgroundColor: "var(--primary, #3b82f6)",
                  color: "#ffffff",
                  opacity: isPendingProfile ? 0.7 : 1,
                  transition: "background-color 0.15s ease",
                }}
              >
                <Save size={16} />
                {isPendingProfile ? "Saving Profile..." : "Save Profile"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: SECURITY */}
      {activeTab === "security" && (
        <div
          role="tabpanel"
          style={{
            background: "var(--card-bg, #ffffff)",
            borderRadius: "14px",
            border: "1px solid var(--border-color, #e2e8f0)",
            padding: "clamp(1.25rem, 3vw, 2rem)",
            boxShadow: "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))",
          }}
        >
          <div style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--foreground, #0f172a)" }}>
              Security &amp; Password
            </h2>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-secondary, #64748b)" }}>
              Ensure your account is protected with a strong, distinct password.
            </p>
          </div>

          {securityMsg && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                marginBottom: "1.25rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                background: securityMsg.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                color: securityMsg.type === "success" ? "#10b981" : "#ef4444",
                border: `1px solid ${securityMsg.type === "success" ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
              }}
            >
              {securityMsg.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{securityMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleSaveSecurity} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div style={{ maxWidth: "480px", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <TextInput
                label="Current Password"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((v) => !v)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0 }}
                    aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                  >
                    {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              />

              <div>
                <TextInput
                  label="New Password"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0 }}
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                    >
                      {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  }
                />

                {newPassword && (
                  <div style={{ marginTop: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                      <span style={{ color: "var(--text-secondary)" }}>Strength:</span>
                      <span style={{ fontWeight: 700, color: passwordStrength.color }}>{passwordStrength.label}</span>
                    </div>
                    <div style={{ height: "4px", width: "100%", background: "rgba(0,0,0,0.08)", borderRadius: "2px", overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${(passwordStrength.score / 5) * 100}%`,
                          background: passwordStrength.color,
                          transition: "width 0.2s ease, background-color 0.2s ease",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <TextInput
                label="Confirm New Password"
                type={showNewPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-type new password"
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                onClick={handleLogoutAllSessions}
                disabled={isPendingSecurity}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 1.25rem",
                  borderRadius: "10px",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  background: "rgba(239, 68, 68, 0.05)",
                  color: "#ef4444",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                }}
              >
                <LogOut size={16} /> Logout All Other Devices
              </button>

              <button
                type="submit"
                disabled={isPendingSecurity}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 1.5rem",
                  borderRadius: "10px",
                  border: "none",
                  cursor: isPendingSecurity ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  backgroundColor: "var(--primary, #3b82f6)",
                  color: "#ffffff",
                  opacity: isPendingSecurity ? 0.7 : 1,
                  transition: "background-color 0.15s ease",
                }}
              >
                <Save size={16} />
                {isPendingSecurity ? "Updating Password..." : "Update Password"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: PREFERENCES */}
      {activeTab === "preferences" && (
        <div
          role="tabpanel"
          style={{
            background: "var(--card-bg, #ffffff)",
            borderRadius: "14px",
            border: "1px solid var(--border-color, #e2e8f0)",
            padding: "clamp(1.25rem, 3vw, 2rem)",
            boxShadow: "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))",
          }}
        >
          <div style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--foreground, #0f172a)" }}>
              App Preferences &amp; Notifications
            </h2>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-secondary, #64748b)" }}>
              Customise display themes and configure which alerts you receive.
            </p>
          </div>

          {prefMsg && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                marginBottom: "1.25rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                background: prefMsg.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                color: prefMsg.type === "success" ? "#10b981" : "#ef4444",
                border: `1px solid ${prefMsg.type === "success" ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
              }}
            >
              {prefMsg.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{prefMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleSavePreferences} style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
            {/* Theme Selector */}
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 700, marginBottom: "0.6rem" }}>
                Interface Appearance
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.75rem", maxWidth: "480px" }}>
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    padding: "0.75rem",
                    borderRadius: "10px",
                    border: `2px solid ${theme === "light" ? "var(--primary, #3b82f6)" : "var(--border-color, #e2e8f0)"}`,
                    background: theme === "light" ? "var(--primary-bg, rgba(59, 130, 246, 0.1))" : "transparent",
                    color: theme === "light" ? "var(--primary, #3b82f6)" : "var(--foreground, #0f172a)",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <Sun size={17} /> Light
                </button>

                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    padding: "0.75rem",
                    borderRadius: "10px",
                    border: `2px solid ${theme === "dark" ? "var(--primary, #3b82f6)" : "var(--border-color, #e2e8f0)"}`,
                    background: theme === "dark" ? "var(--primary-bg, rgba(59, 130, 246, 0.1))" : "transparent",
                    color: theme === "dark" ? "var(--primary, #3b82f6)" : "var(--foreground, #0f172a)",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <Moon size={17} /> Dark
                </button>

                <button
                  type="button"
                  onClick={() => setTheme("system")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    padding: "0.75rem",
                    borderRadius: "10px",
                    border: `2px solid ${theme === "system" ? "var(--primary, #3b82f6)" : "var(--border-color, #e2e8f0)"}`,
                    background: theme === "system" ? "var(--primary-bg, rgba(59, 130, 246, 0.1))" : "transparent",
                    color: theme === "system" ? "var(--primary, #3b82f6)" : "var(--foreground, #0f172a)",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <Laptop size={17} /> System
                </button>
              </div>
            </div>

            {/* Notification Preferences */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 700 }}>
                Notification Channels &amp; Alerts
              </label>

              <Checkbox
                label="Master In-App Notifications"
                description="Receive in-portal popups and alert notifications."
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
              />

              <Checkbox
                label="Bus Transport Alerts (In-App &amp; Push)"
                description="Instant status updates, route delays, and breakdown intimations."
                checked={busAlertsApp}
                onChange={(e) => setBusAlertsApp(e.target.checked)}
              />

              <Checkbox
                label="Bus Transport Alerts via Email"
                description="Receive immediate email notification for priority bus messages."
                checked={busAlertsEmail}
                onChange={(e) => setBusAlertsEmail(e.target.checked)}
              />

              <Checkbox
                label="Bus Transport Alerts via SMS"
                description="Receive SMS alerts for urgent bus changes (carrier rates may apply)."
                checked={busAlertsSMS}
                onChange={(e) => setBusAlertsSMS(e.target.checked)}
              />

              <Checkbox
                label="Fee Due &amp; Receipt Reminders"
                description="Intimations for upcoming term dues and payment acknowledgements."
                checked={feeReminders}
                onChange={(e) => setFeeReminders(e.target.checked)}
              />

              <Checkbox
                label="Daily Attendance Intimations"
                description="Notifications when your ward's daily attendance is recorded."
                checked={attendanceAlerts}
                onChange={(e) => setAttendanceAlerts(e.target.checked)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button
                type="submit"
                disabled={isPendingPref}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 1.5rem",
                  borderRadius: "10px",
                  border: "none",
                  cursor: isPendingPref ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  backgroundColor: "var(--primary, #3b82f6)",
                  color: "#ffffff",
                  opacity: isPendingPref ? 0.7 : 1,
                  transition: "background-color 0.15s ease",
                }}
              >
                <Save size={16} />
                {isPendingPref ? "Saving Preferences..." : "Save Preferences"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 4: SCHOOL PROFILE & DEFAULTS (ADMIN ONLY) */}
      {isAdmin && activeTab === "school" && (
        <div
          role="tabpanel"
          style={{
            background: "var(--card-bg, #ffffff)",
            borderRadius: "14px",
            border: "1px solid var(--border-color, #e2e8f0)",
            padding: "clamp(1.25rem, 3vw, 2rem)",
            boxShadow: "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))",
          }}
        >
          <div style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--foreground, #0f172a)" }}>
              School Profile &amp; System Defaults
            </h2>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-secondary, #64748b)" }}>
              Official school identification and operational defaults displayed site-wide.
            </p>
          </div>

          {schoolMsg && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                marginBottom: "1.25rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                background: schoolMsg.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                color: schoolMsg.type === "success" ? "#10b981" : "#ef4444",
                border: `1px solid ${schoolMsg.type === "success" ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
              }}
            >
              {schoolMsg.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{schoolMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleSaveSchoolDefaults} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "1.25rem" }}>
              <TextInput
                label="Official School Name"
                required
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="e.g. SRT UNIVERSAL SCHOOL"
              />

              <TextInput
                label="Official Tagline / Motto"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Seeing Righteousness & Truth"
              />

              <TextInput
                label="Current Academic Year Default"
                required
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="e.g. 2024-2025"
              />

              <Select
                label="Default Bus Alert Priority"
                value={busAlertPriority}
                onChange={(e) => setBusAlertPriority(e.target.value)}
                options={[
                  { value: "NORMAL", label: "Normal Priority" },
                  { value: "URGENT", label: "Urgent Priority" },
                ]}
              />

              <TextInput
                label="Official Contact Phone"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="e.g. +91 98765 43210"
              />

              <TextInput
                label="Official Support Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. contact@srtuniversalschool.edu"
              />

              <TextInput
                label="School Website URL"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="e.g. https://nipoportal.vercel.app"
              />

              <TextInput
                label="Campus Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. SRT Universal School Campus, Tamil Nadu"
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button
                type="submit"
                disabled={isPendingSchool}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 1.5rem",
                  borderRadius: "10px",
                  border: "none",
                  cursor: isPendingSchool ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  backgroundColor: "var(--gold, #f2b84b)",
                  color: "#0b1329",
                  opacity: isPendingSchool ? 0.7 : 1,
                  transition: "background-color 0.15s ease",
                }}
              >
                <Save size={16} />
                {isPendingSchool ? "Saving School Defaults..." : "Save School Defaults"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
});

SettingsClient.displayName = "SettingsClient";

export default SettingsClient;

