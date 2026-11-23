"use client";

import React, { useState, useEffect } from "react";
import { ArrowLeftRight, Loader2, GraduationCap, Users, Shield, Bus } from "lucide-react";
import styles from "./RoleSwitcher.module.css";

interface RoleSwitcherProps {
  currentRole?: string;
  availableRoles?: string[];
  variant?: "pill" | "sidebar" | "bottomsheet";
  isCollapsed?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const ROLE_DISPLAY: Record<string, { label: string; shortLabel: string; icon: React.ReactNode }> = {
  TEACHER: {
    label: "Teacher Portal",
    shortLabel: "Teacher",
    icon: <GraduationCap size={15} />,
  },
  PARENT: {
    label: "Parent Portal",
    shortLabel: "Parent",
    icon: <Users size={15} />,
  },
  ADMIN: {
    label: "Admin Portal",
    shortLabel: "Admin",
    icon: <Shield size={15} />,
  },
  STAFF: {
    label: "Staff Portal",
    shortLabel: "Staff",
    icon: <Bus size={15} />,
  },
  NON_TEACHING_STAFF: {
    label: "Staff Portal",
    shortLabel: "Staff",
    icon: <Bus size={15} />,
  },
};

export default function RoleSwitcher({
  currentRole,
  availableRoles: initialAvailableRoles,
  variant = "pill",
  isCollapsed = false,
  className = "",
  style,
}: RoleSwitcherProps) {
  const [activeRole, setActiveRole] = useState<string>(currentRole?.toUpperCase() || "");
  const [roles, setRoles] = useState<string[]>(
    Array.from(new Set((initialAvailableRoles || []).map((r) => r.toUpperCase())))
  );
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    if (currentRole) {
      setActiveRole(currentRole.toUpperCase());
    }
    if (initialAvailableRoles && initialAvailableRoles.length > 0) {
      setRoles(Array.from(new Set(initialAvailableRoles.map((r) => r.toUpperCase()))));
    }

    // If available roles are not yet populated from props, fetch from active session
    if (!initialAvailableRoles || initialAvailableRoles.length === 0) {
      let isMounted = true;
      fetch("/api/auth/session", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (isMounted && data?.user) {
            if (data.user.role) {
              setActiveRole(data.user.role.toUpperCase());
            }
            if (data.user.availableRoles && Array.isArray(data.user.availableRoles)) {
              setRoles(Array.from(new Set(data.user.availableRoles.map((r: string) => r.toUpperCase()))));
            }
          }
        })
        .catch(() => {});
      return () => {
        isMounted = false;
      };
    }
  }, [currentRole, initialAvailableRoles]);

  // If user does not have multiple roles, don't show the switcher
  if (roles.length <= 1) {
    return null;
  }

  // Find the primary alternate role to switch to
  const targetRole =
    roles.find((r) => r !== activeRole) ||
    (activeRole === "TEACHER" ? "PARENT" : "TEACHER");

  const currentInfo = ROLE_DISPLAY[activeRole] || {
    label: `${activeRole} Portal`,
    shortLabel: activeRole,
    icon: <Users size={15} />,
  };

  const targetInfo = ROLE_DISPLAY[targetRole] || {
    label: `${targetRole} Portal`,
    shortLabel: targetRole,
    icon: <Users size={15} />,
  };

  const handleSwitchRole = async (roleToActivate?: string) => {
    const role = roleToActivate || targetRole;
    if (isSwitching || role === activeRole) return;

    setIsSwitching(true);
    try {
      const res = await fetch("/api/auth/switch-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetRole: role }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to switch role");
      }

      // Fast, clean redirect to the target portal dashboard
      const targetUrl = data.redirectUrl || (role === "TEACHER" ? "/dashboard/teacher" : "/dashboard/parent");
      window.location.href = targetUrl;
    } catch (err) {
      console.error("[RoleSwitcher] Switch error:", err);
      setIsSwitching(false);
    }
  };

  // 1. Sidebar Variant
  if (variant === "sidebar") {
    return (
      <button
        type="button"
        onClick={() => handleSwitchRole()}
        disabled={isSwitching}
        className={`${styles.sidebarSwitchBtn} ${isCollapsed ? styles.sidebarSwitchBtnCollapsed : ""} ${className}`}
        style={style}
        title={`Switch to ${targetInfo.label}`}
        aria-label={`Switch to ${targetInfo.label}`}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          {isSwitching ? (
            <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <ArrowLeftRight size={18} className={styles.switchIconPulse} />
          )}
        </div>
        {!isCollapsed && (
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {isSwitching ? "Switching..." : `Switch to ${targetInfo.shortLabel}`}
          </span>
        )}
      </button>
    );
  }

  // 2. Bottom Sheet Variant (Phone Drawer)
  if (variant === "bottomsheet") {
    return (
      <button
        type="button"
        onClick={() => handleSwitchRole()}
        disabled={isSwitching}
        className={`${styles.bottomSheetSwitchCard} ${className}`}
        style={style}
        aria-label={`Switch to ${targetInfo.label}`}
      >
        <div className={styles.bottomSheetLeft}>
          <div className={styles.bottomSheetIconCircle}>
            {isSwitching ? (
              <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              targetInfo.icon
            )}
          </div>
          <div className={styles.bottomSheetText}>
            <span className={styles.bottomSheetTitle}>
              {isSwitching ? "Switching Portals..." : `Switch to ${targetInfo.label}`}
            </span>
            <span className={styles.bottomSheetSubtitle}>
              Active: {currentInfo.label} &bull; Tap to change
            </span>
          </div>
        </div>
        <ArrowLeftRight size={18} color="#2563eb" className={styles.switchIconPulse} />
      </button>
    );
  }

  // 3. Topbar Pill Variant (Default)
  return (
    <button
      type="button"
      onClick={() => handleSwitchRole()}
      disabled={isSwitching}
      className={`${styles.rolePill} ${className}`}
      style={style}
      title={`Currently in ${currentInfo.label}. Click to switch to ${targetInfo.label}`}
      aria-label={`Switch from ${currentInfo.label} to ${targetInfo.label}`}
    >
      <span className={styles.rolePillActiveRole}>
        {currentInfo.icon}
        <span>{currentInfo.shortLabel}</span>
      </span>
      <span className={styles.rolePillDivider} aria-hidden="true" />
      <span className={styles.rolePillSwitchAction}>
        {isSwitching ? (
          <>
            <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
            <span>Switching...</span>
          </>
        ) : (
          <>
            <ArrowLeftRight size={13} />
            <span>Switch to {targetInfo.shortLabel}</span>
          </>
        )}
      </span>
    </button>
  );
}
