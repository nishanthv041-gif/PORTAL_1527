"use client";

import React, { useState, useEffect, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Eye, EyeOff, Loader2, ShieldAlert, ArrowLeft, ShieldCheck } from "lucide-react";
import { unlockSettingsAction } from "@/backend/api/actions/dashboard/admin/settings/securityActions";

interface SettingsUnlockGateClientProps {
  initialLockedUntil?: string | null;
  initialRemainingMinutes?: number;
  returnUrl?: string;
  schoolName?: string;
  logoUrl?: string;
}

export default function SettingsUnlockGateClient({
  initialLockedUntil,
  initialRemainingMinutes,
  returnUrl = "/dashboard/admin/settings",
  schoolName = "SRT Universal School",
  logoUrl = "/logo.png",
}: SettingsUnlockGateClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const effectiveReturnUrl = searchParams.get("returnUrl") || returnUrl;

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(initialLockedUntil || null);
  const [remainingMinutes, setRemainingMinutes] = useState<number>(initialRemainingMinutes || 0);
  const [isPending, startTransition] = useTransition();
  const [unlockedSuccess, setUnlockedSuccess] = useState(false);

  // Live countdown timer if currently locked
  useEffect(() => {
    if (!lockedUntil) return;
    const target = new Date(lockedUntil).getTime();

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) {
        setLockedUntil(null);
        setRemainingMinutes(0);
        setErrorMessage(null);
        clearInterval(interval);
      } else {
        setRemainingMinutes(Math.max(1, Math.ceil(diff / (60 * 1000))));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lockedUntil]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lockedUntil || isPending || unlockedSuccess) return;

    if (!password.trim()) {
      setErrorMessage("Please enter the settings password.");
      return;
    }

    setErrorMessage(null);

    startTransition(async () => {
      const res = await unlockSettingsAction(password);

      if (res?.error) {
        setErrorMessage(res.error);
        if (res.lockedUntil) {
          setLockedUntil(res.lockedUntil);
          setRemainingMinutes(res.remainingMinutes || 15);
        }
      } else if (res?.success) {
        setUnlockedSuccess(true);
        // Instant redirect to requested destination
        setTimeout(() => {
          router.push(effectiveReturnUrl);
          router.refresh();
        }, 300);
      }
    });
  };

  const isLockedOut = Boolean(lockedUntil);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        background: "radial-gradient(ellipse at top, #1e293b 0%, #090d16 100%)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          background: "var(--card-bg, #0f172a)",
          border: "1px solid var(--border-color, rgba(255, 255, 255, 0.12))",
          borderRadius: "20px",
          padding: "2.25rem 2rem",
          boxShadow: "0 20px 40px -15px rgba(0,0,0,0.7), 0 0 30px 0 rgba(59, 130, 246, 0.1)",
          boxSizing: "border-box",
          position: "relative",
        }}
      >
        {/* Back Link */}
        <Link
          href="/dashboard/admin"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            fontSize: "0.85rem",
            color: "var(--text-secondary, #94a3b8)",
            textDecoration: "none",
            marginBottom: "1.5rem",
            transition: "color 0.15s",
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to Dashboard</span>
        </Link>

        {/* School Crest & Header */}
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              margin: "0 auto 1rem",
              borderRadius: "18px",
              background: "rgba(59, 130, 246, 0.1)",
              border: "1px solid rgba(59, 130, 246, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 16px -4px rgba(59, 130, 246, 0.2)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={schoolName}
                width={56}
                height={56}
                style={{ objectFit: "contain" }}
                priority
              />
            ) : (
              <Lock size={32} style={{ color: "#3b82f6" }} />
            )}
          </div>

          <h1
            style={{
              fontSize: "1.35rem",
              fontWeight: 700,
              color: "var(--text-primary, #f8fafc)",
              margin: "0 0 0.4rem 0",
              letterSpacing: "-0.01em",
            }}
          >
            Enter Settings Password
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--text-secondary, #94a3b8)",
              margin: 0,
              lineHeight: 1.45,
            }}
          >
            Settings and academic batch controls are password protected. Enter the administrator settings password to continue.
          </p>
        </div>

        {/* Lockout Warning Alert */}
        {isLockedOut && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              borderRadius: "12px",
              padding: "1rem",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
            }}
          >
            <ShieldAlert size={20} style={{ color: "#f87171", flexShrink: 0, marginTop: "2px" }} />
            <div style={{ fontSize: "0.85rem", color: "#fca5a5", lineHeight: 1.4 }}>
              <strong>Access Temporarily Locked</strong>
              <div style={{ marginTop: "0.25rem" }}>
                Settings are locked due to 5 consecutive incorrect attempts. Please wait{" "}
                <span style={{ fontWeight: 700, color: "#ffffff" }}>{remainingMinutes} minute(s)</span> before trying again.
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {errorMessage && !isLockedOut && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              borderRadius: "10px",
              padding: "0.75rem 1rem",
              marginBottom: "1.25rem",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              fontSize: "0.875rem",
              color: "#f87171",
            }}
          >
            <ShieldAlert size={18} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Success Alert */}
        {unlockedSuccess && (
          <div
            style={{
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: "10px",
              padding: "0.75rem 1rem",
              marginBottom: "1.25rem",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              fontSize: "0.875rem",
              color: "#34d399",
            }}
          >
            <ShieldCheck size={18} style={{ flexShrink: 0 }} />
            <span>Access granted. Opening settings...</span>
          </div>
        )}

        {/* Password Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1.5rem" }}>
            <label
              htmlFor="settings-password"
              style={{
                display: "block",
                fontSize: "0.825rem",
                fontWeight: 600,
                color: "var(--text-secondary, #94a3b8)",
                marginBottom: "0.5rem",
                letterSpacing: "0.02em",
                textTransform: "uppercase",
              }}
            >
              Settings Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="settings-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                disabled={isLockedOut || isPending || unlockedSuccess}
                autoComplete="current-password"
                style={{
                  width: "100%",
                  padding: "0.8rem 2.85rem 0.8rem 1rem",
                  background: isLockedOut ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.3)",
                  border: errorMessage
                    ? "1px solid #ef4444"
                    : "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                  borderRadius: "10px",
                  color: "#ffffff",
                  fontSize: "0.95rem",
                  boxSizing: "border-box",
                  outline: "none",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                disabled={isLockedOut || isPending}
                style={{
                  position: "absolute",
                  right: "0.75rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--text-secondary, #94a3b8)",
                  cursor: isLockedOut ? "not-allowed" : "pointer",
                  padding: "0.25rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title={showPassword ? "Hide password" : "Show password"}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLockedOut || isPending || unlockedSuccess}
            style={{
              width: "100%",
              padding: "0.85rem 1.25rem",
              borderRadius: "10px",
              background: isLockedOut
                ? "rgba(255, 255, 255, 0.05)"
                : "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
              color: isLockedOut ? "var(--text-secondary, #64748b)" : "#ffffff",
              border: isLockedOut ? "1px solid rgba(255,255,255,0.08)" : "none",
              fontSize: "0.95rem",
              fontWeight: 600,
              cursor: isLockedOut || isPending || unlockedSuccess ? "not-allowed" : "pointer",
              boxShadow: isLockedOut ? "none" : "0 4px 14px 0 rgba(37, 99, 235, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              transition: "transform 0.1s, box-shadow 0.15s",
              opacity: isPending ? 0.75 : 1,
            }}
          >
            {isPending ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Verifying...</span>
              </>
            ) : unlockedSuccess ? (
              <>
                <ShieldCheck size={18} />
                <span>Unlocked</span>
              </>
            ) : (
              <>
                <Lock size={18} />
                <span>Unlock Settings</span>
              </>
            )}
          </button>
        </form>

        <div
          style={{
            marginTop: "1.75rem",
            paddingTop: "1.25rem",
            borderTop: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
            textAlign: "center",
            fontSize: "0.8rem",
            color: "var(--text-secondary, #64748b)",
          }}
        >
          <span>Sessions remain unlocked for 15 minutes of activity.</span>
        </div>
      </div>
    </div>
  );
}

