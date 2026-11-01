"use client";

import React, { useState, useRef, useEffect, useTransition } from "react";
import Image from "next/image";
import { Lock, Eye, EyeOff, Loader2, ShieldCheck, AlertCircle, X } from "lucide-react";
import { unlockSettingsAction } from "@/backend/api/actions/dashboard/admin/settings/securityActions";

interface AdminPasswordVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: (password: string) => void | Promise<void>;
  title?: string;
  subtitle?: string;
  actionText?: string;
}

export default function AdminPasswordVerificationModal({
  isOpen,
  onClose,
  onVerified,
  title = "Admin Password Verification",
  subtitle = "Please enter your settings password to verify administrative authority before generating the promotion preview.",
  actionText = "Verify & Generate Preview",
}: AdminPasswordVerificationModalProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [remainingMinutes, setRemainingMinutes] = useState<number>(0);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input automatically on open
  useEffect(() => {
    if (isOpen) {
      setPassword("");
      setErrorMessage(null);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Live countdown timer if locked
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

  if (!isOpen) return null;

  const handleVerify = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isPending || lockedUntil) return;

    const trimmed = password.trim();
    if (!trimmed) {
      setErrorMessage("Please enter the admin settings password.");
      inputRef.current?.focus();
      return;
    }

    setErrorMessage(null);

    startTransition(async () => {
      const res = await unlockSettingsAction(trimmed);

      if (res?.error) {
        setErrorMessage(res.error);
        if (res.lockedUntil) {
          setLockedUntil(res.lockedUntil);
          setRemainingMinutes(res.remainingMinutes || 15);
        }
        inputRef.current?.focus();
      } else if (res?.success) {
        await onVerified(trimmed);
        setPassword("");
        onClose();
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-verify-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        backgroundColor: "rgba(3, 7, 18, 0.78)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "fadeIn 0.15s ease-out",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) {
          onClose();
        }
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "460px",
          backgroundColor: "var(--card-bg, #151f32)",
          color: "var(--foreground, #f1f5f9)",
          border: "1px solid var(--border-color, rgba(255, 255, 255, 0.14))",
          borderRadius: "16px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(99, 102, 241, 0.15)",
          overflow: "hidden",
          animation: "panelSlideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                backgroundColor: "rgba(99, 102, 241, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--primary, #6366f1)",
              }}
            >
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2
                id="admin-verify-title"
                style={{
                  margin: 0,
                  fontSize: "1.0625rem",
                  fontWeight: 700,
                  color: "var(--foreground, #ffffff)",
                  lineHeight: 1.3,
                }}
              >
                {title}
              </h2>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "#eab308",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Administrative Authorization
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "transparent",
              color: "var(--text-secondary, #94a3b8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: isPending ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
            }}
            aria-label="Close verification dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleVerify} style={{ padding: "1.5rem" }}>
          {/* School Badge Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.85rem",
              padding: "0.85rem 1rem",
              backgroundColor: "rgba(0, 0, 0, 0.2)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "10px",
              marginBottom: "1.25rem",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                overflow: "hidden",
                position: "relative",
                flexShrink: 0,
                backgroundColor: "rgba(255, 255, 255, 0.05)",
              }}
            >
              <Image
                src="/logo.png"
                alt="SRT School Logo"
                fill
                sizes="40px"
                style={{ objectFit: "contain" }}
              />
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "0.8125rem",
                color: "var(--text-secondary, #cbd5e1)",
                lineHeight: 1.45,
              }}
            >
              {subtitle}
            </p>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.6rem",
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                backgroundColor: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.35)",
                color: "#f87171",
                fontSize: "0.8125rem",
                lineHeight: 1.4,
                marginBottom: "1.25rem",
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "1px" }} />
              <div>
                <span>{errorMessage}</span>
                {remainingMinutes > 0 && (
                  <div style={{ marginTop: "4px", fontWeight: 700 }}>
                    Lockout remaining: {remainingMinutes} minute(s)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Password Input Field */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label
              htmlFor="admin-verify-password-input"
              style={{
                display: "block",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--foreground, #e2e8f0)",
                marginBottom: "0.5rem",
              }}
            >
              Settings Password <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: "0.85rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-secondary, #94a3b8)",
                  pointerEvents: "none",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Lock size={16} />
              </div>
              <input
                id="admin-verify-password-input"
                ref={inputRef}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={isPending || !!lockedUntil}
                placeholder="Enter your settings password"
                autoComplete="current-password"
                style={{
                  width: "100%",
                  padding: "0.7rem 2.6rem 0.7rem 2.4rem",
                  borderRadius: "10px",
                  border: errorMessage
                    ? "1px solid #ef4444"
                    : "1px solid var(--border-color, rgba(255, 255, 255, 0.18))",
                  backgroundColor: "rgba(0, 0, 0, 0.25)",
                  color: "var(--foreground, #ffffff)",
                  fontSize: "0.9375rem",
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "all 0.15s ease",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={isPending || !!lockedUntil}
                style={{
                  position: "absolute",
                  right: "0.75rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--text-secondary, #94a3b8)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: "4px",
                }}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "0.75rem",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              style={{
                padding: "0.6rem 1.15rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                backgroundColor: "transparent",
                color: "var(--foreground, #ffffff)",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: isPending ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !password.trim() || !!lockedUntil}
              style={{
                padding: "0.6rem 1.35rem",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "var(--primary, #6366f1)",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.875rem",
                cursor: isPending || !password.trim() || !!lockedUntil ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                opacity: isPending || !password.trim() || !!lockedUntil ? 0.65 : 1,
                boxShadow: "0 2px 8px rgba(99, 102, 241, 0.35)",
                transition: "all 0.15s ease",
              }}
            >
              {isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>{actionText}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

