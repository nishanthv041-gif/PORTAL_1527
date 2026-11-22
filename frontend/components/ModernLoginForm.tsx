"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  Loader2,
  GraduationCap,
  Bell,
  Bus,
  CheckCircle2,
  Clock,
  Megaphone,
} from "lucide-react";
import styles from "@/frontend/app/login/modern-login.module.css";
import ThemeToggle from "@/frontend/components/ThemeToggle";
import SrtLogo from "@/frontend/components/ui/SrtLogo";
import LoginPwaPrompt from "@/frontend/components/pwa/LoginPwaPrompt";
import { persistNativeSession } from "@/frontend/lib/authPersistence";

interface ModernLoginFormProps {
  schoolName?: string;
  schoolLogo?: string | null;
  defaultRole?: string | null;
  initialError?: string | null;
  initialReason?: string | null;
}

const REASON_MESSAGES: Record<string, string> = {
  "other-device": "You were logged out because your account was signed in on another device.",
  "timeout": "Your session has expired due to 6 hours of inactivity. Please log in again.",
  "max-time": "Your session has reached its maximum allowed duration. Please log in again.",
  "admin-forced": "Your session was ended by an administrator.",
  "password-changed": "Your password was changed. Please log in again with your new credentials.",
  "logout": "You have been logged out successfully.",
};

export default function ModernLoginForm({
  schoolName = "SRT Universal School",
  schoolLogo = null,
  defaultRole = null,
  initialError = null,
  initialReason = null,
}: ModernLoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const formatLoginError = (err?: string | null) => {
    if (!err) return "";
    if (err === "CredentialsSignin") {
      return "Invalid email, phone number, or password. Please verify your credentials.";
    }
    if (err === "OAuthSignin" || err === "OAuthCallback" || err === "Configuration") {
      return "Google Sign-In is not currently enabled for this school deployment. Please log in using your User ID and Password above.";
    }
    if (err === "AccessDenied") {
      return "Access denied. Your Google account is not registered with the school. Please use your credentials.";
    }
    if (err.includes("AccessDenied")) {
      return err;
    }
    return err;
  };

  const [error, setError] = useState<string>(
    formatLoginError(initialError) || (initialReason && REASON_MESSAGES[initialReason]) || ""
  );
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isMorphing, setIsMorphing] = useState(false);
  const [showNotifGate, setShowNotifGate] = useState(false);
  const [isRequestingNotif, setIsRequestingNotif] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);

  // Ensure any error immediately clears loading and morphing states to keep form visible
  useEffect(() => {
    if (error) {
      setIsMorphing(false);
      setLoading(false);
      setGoogleLoading(false);
    }
  }, [error]);

  // Check URL reason parameter and notification setup status on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        const reasonParam = params.get("reason");
        if (reasonParam && REASON_MESSAGES[reasonParam]) {
          setError(REASON_MESSAGES[reasonParam]);
        }

        // Notification enabling step check (after installation / first login)
        const isCompleted = localStorage.getItem("srt_notif_login_completed");
        if (isCompleted === "true") {
          setShowNotifGate(false);
        } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          localStorage.setItem("srt_notif_login_completed", "true");
          setShowNotifGate(false);
        } else {
          setShowNotifGate(true);
        }
      } catch (e) {
        // Fallback
      }
    }
  }, []);

  const handleEnableNotifications = async () => {
    setIsRequestingNotif(true);
    try {
      const { requestPushPermission } = await import("@/frontend/lib/pushNotifications");
      await requestPushPermission();
    } catch (err) {
      console.warn("Notification enable error:", err);
    } finally {
      setNotifGranted(true);
      try {
        localStorage.setItem("srt_notif_login_completed", "true");
      } catch {}
      setTimeout(() => {
        setIsRequestingNotif(false);
        setShowNotifGate(false);
      }, 700);
    }
  };

  const handleSkipNotificationSetup = () => {
    try {
      localStorage.setItem("srt_notif_login_completed", "true");
    } catch {}
    setShowNotifGate(false);
  };

  // Carousel State
  const [activeSlide, setActiveSlide] = useState(0);

  const slides = [
    {
      title: "Academic Management Portal",
      desc: "A unified digital platform empowering educators, students, and parents every day.",
      badge: "Campus Academic Session 2026–2027",
    },
    {
      title: "Real-Time Attendance & Performance Tracking",
      desc: "Instant roll-calls, grade analytics, and automated parent notifications at your fingertips.",
      badge: "Official Academic Analytics",
    },
    {
      title: "Secure Enterprise Institutional Management",
      desc: "Robust role-based security, automated activity auditing, and centralized student records.",
      badge: "Institutional Security",
    },
  ];

  // Auto-advance carousel
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const handlePrevSlide = () => {
    setActiveSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
  };

  const handleNextSlide = () => {
    setActiveSlide((prev) => (prev + 1) % slides.length);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const signInOptions: Record<string, any> = {
        redirect: false,
        email: email.trim(),
        password,
      };

      if (defaultRole) {
        signInOptions.expectedRole = defaultRole;
      }

      const res = await signIn("credentials", signInOptions);

      if (res?.error) {
        setError(formatLoginError(res.error) || "Invalid email or password. Please verify your credentials.");
        setLoading(false);
      } else {
        // Shared Element Crest Morph & 280ms Card Fade Out
        setIsMorphing(true);
        try {
          sessionStorage.removeItem("srt_portal_popup_notif_dismissed");
          sessionStorage.setItem("srt_portal_fresh_login", "true");
          sessionStorage.setItem("srt_bento_cascade", "true");
        } catch {}

        // Direct fast-path routing: eliminates double-redirect delay
        let target = "/dashboard";
        if (defaultRole) {
          target = `/dashboard/${defaultRole.toLowerCase()}`;
        } else {
          try {
            const sessRes = await fetch("/api/auth/session");
            if (sessRes.ok) {
              const sess = await sessRes.json();
              if (sess?.user) {
                persistNativeSession({
                  userId: sess.user.id,
                  role: sess.user.role || "USER",
                  name: sess.user.name,
                  email: sess.user.email,
                  loginTimestamp: Date.now(),
                }).catch(() => {});
              }
              if (sess?.user?.role) {
                const r = sess.user.role.toUpperCase();
                if (r === "STAFF" || r === "NON_TEACHING_STAFF") {
                  target = "/staff/my-bus";
                } else {
                  target = `/dashboard/${sess.user.role.toLowerCase()}`;
                }
              }
            }
          } catch {}
        }

        // 280ms duration for Crest Morph and Card Fade Out
        await new Promise((resolve) => setTimeout(resolve, 280));
        window.location.href = target;
      }
    } catch {
      setError("An unexpected connection error occurred. Please try again.");
      setLoading(false);
      setIsMorphing(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError("");

    try {
      const target = defaultRole ? `/dashboard/${defaultRole.toLowerCase()}` : "/dashboard";
      const res = await signIn("google", { callbackUrl: target, redirect: false });

      if (res?.error) {
        setGoogleLoading(false);
        setIsMorphing(false);
        if (res.error === "Configuration" || res.error === "OAuthSignin") {
          setError(
            "Google Sign-In is not currently enabled on this school deployment. Please enter your User ID or Email and Password above to log in."
          );
        } else if (res.error === "AccessDenied") {
          setError("Your Google account is not registered. Please log in using your User ID and Password.");
        } else {
          setError(`Google Sign-In error: ${res.error}. Please use your credentials.`);
        }
        return;
      }

      if (res?.url) {
        try {
          sessionStorage.removeItem("srt_portal_popup_notif_dismissed");
          sessionStorage.setItem("srt_portal_fresh_login", "true");
          sessionStorage.setItem("srt_bento_cascade", "true");
        } catch {}
        // Only trigger morphing when actual valid navigation url exists
        setIsMorphing(true);
        window.location.href = res.url;
      } else {
        setGoogleLoading(false);
        setIsMorphing(false);
      }
    } catch {
      setGoogleLoading(false);
      setIsMorphing(false);
      setError("Unable to connect to Google Sign-In. Please sign in with your User ID and Password.");
    }
  };

  const portalDisplayName = schoolName.toLowerCase().includes("portal")
    ? schoolName
    : `${schoolName} Portal`;

  return (
    <div className={styles.pageWrapper}>
      {/* Floating Top Bar (Clean, no fake browser/traffic lights) */}
      <header className={styles.topBar}>
        <div className={styles.brandPill}>
          <GraduationCap size={15} className={styles.sparkleIcon} />
          <span>{portalDisplayName}</span>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Split-Screen Canvas Card */}
      <div className={`${styles.mainCanvas} ${isMorphing ? styles.cardFadeOut : ""}`}>
        {/* ========================================================
            LEFT PANEL: FORM & PORTAL BRANDING
            ======================================================== */}
        <div className={`${styles.leftPanel} ${isMorphing ? styles.cardFadeOut : ""}`}>
          {/* Brand Header with Crest Awakening & Shared Element Morph */}
            <div className={styles.brandRow}>
              <div className={`${styles.crestContainer} ${styles.crestAwakening} ${isMorphing ? styles.crestMorphing : ""}`}>
                {schoolLogo && schoolLogo !== "/logo/srt-logo.svg" && schoolLogo !== "/logo/srt-logo.png" ? (
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "50%",
                      overflow: "hidden",
                      border: "2px solid #e2e8f0",
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={schoolLogo}
                      alt={portalDisplayName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                ) : (
                  <SrtLogo size={42} alt={portalDisplayName} />
                )}
              </div>
              <div className={`${styles.brandTextGroup} ${styles.cascadeHeader}`}>
                <span className={styles.brandName}>{portalDisplayName}</span>
                <span className={styles.brandBadge}>Academic Portal</span>
              </div>
            </div>

            {/* Form Content Area */}
            <div className={styles.formContent}>
              {showNotifGate ? (
                /* Step 1: Notification Enabling Screen (Required after installation/first visit) */
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div className={styles.cascadeHeader}>
                    <div style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      padding: "0.25rem 0.75rem",
                      borderRadius: "999px",
                      backgroundColor: "rgba(242, 184, 75, 0.15)",
                      border: "1px solid rgba(242, 184, 75, 0.4)",
                      color: "#b45309",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      marginBottom: "0.5rem"
                    }}>
                      <Bell size={13} />
                      <span>STEP 1 • ENABLE NOTIFICATIONS</span>
                    </div>
                    <h1 className={styles.headline} style={{ fontSize: "1.75rem", lineHeight: 1.2 }}>
                      Enable Notifications
                    </h1>
                    <p className={styles.subheadline}>
                      Stay connected with instant push alerts for attendance, live school bus tracking, report cards, and urgent notices.
                    </p>
                  </div>

                  {/* 4 Feature Highlights */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "10px",
                      backgroundColor: "rgba(59, 130, 246, 0.08)",
                      border: "1px solid rgba(59, 130, 246, 0.18)"
                    }}>
                      <div style={{ color: "#3b82f6", display: "flex", alignItems: "center" }}><Clock size={18} /></div>
                      <div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground)" }}>Instant Attendance Alerts</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Real-time updates on student entry and departure</div>
                      </div>
                    </div>

                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "10px",
                      backgroundColor: "rgba(245, 158, 11, 0.08)",
                      border: "1px solid rgba(245, 158, 11, 0.18)"
                    }}>
                      <div style={{ color: "#f59e0b", display: "flex", alignItems: "center" }}><Bus size={18} /></div>
                      <div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground)" }}>Live School Bus Tracking</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Arrival notices before the bus reaches your stop</div>
                      </div>
                    </div>

                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "10px",
                      backgroundColor: "rgba(16, 185, 129, 0.08)",
                      border: "1px solid rgba(16, 185, 129, 0.18)"
                    }}>
                      <div style={{ color: "#10b981", display: "flex", alignItems: "center" }}><CheckCircle2 size={18} /></div>
                      <div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground)" }}>Marks & Digital Report Cards</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Instant score notifications and teacher remarks</div>
                      </div>
                    </div>

                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "10px",
                      backgroundColor: "rgba(139, 92, 246, 0.08)",
                      border: "1px solid rgba(139, 92, 246, 0.18)"
                    }}>
                      <div style={{ color: "#8b5cf6", display: "flex", alignItems: "center" }}><Megaphone size={18} /></div>
                      <div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground)" }}>Official Circulars & Notices</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Emergency announcements, circulars, and events</div>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
                    <button
                      type="button"
                      disabled={isRequestingNotif}
                      onClick={handleEnableNotifications}
                      className={styles.loginButton}
                      style={{
                        background: notifGranted ? "#10b981" : undefined,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                      }}
                    >
                      {isRequestingNotif ? (
                        <>
                          <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                          <span>Enabling notifications...</span>
                        </>
                      ) : notifGranted ? (
                        <>
                          <CheckCircle2 size={18} />
                          <span>Notifications Enabled!</span>
                        </>
                      ) : (
                        <>
                          <Bell size={18} />
                          <span>Turn On Notifications</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleSkipNotificationSetup}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-secondary)",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        padding: "0.5rem",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      Continue to Login
                    </button>
                  </div>
                </div>
              ) : (
                /* Step 2: Login Credentials Form */
                <>
                  {/* Cascade Header (Headline & Subheadline) */}
                  <div className={styles.cascadeHeader}>
                    <h1 className={styles.headline}>Get started!</h1>
                    <p className={styles.subheadline}>
                      Welcome to {portalDisplayName}. Enter your credentials to access your academic dashboard.
                    </p>
                  </div>

                  {/* Error Message Notification */}
                  {error && (
                    <div className={styles.errorAlert}>
                      <AlertCircle size={18} style={{ flexShrink: 0 }} />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Credential Inputs & Submit */}
                  <form onSubmit={handleSubmit} className={styles.form}>
                    {/* Staggered Form Cascade - Inputs */}
                    <div className={styles.cascadeInputs} style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
                      <div className={styles.inputFieldWrapper}>
                        <input
                          id="email"
                          type="text"
                          inputMode="text"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="User ID, Email or Phone"
                          className={styles.inputField}
                          required
                          autoComplete="username"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                        />
                      </div>

                      <div className={styles.inputFieldWrapper}>
                        <input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Password"
                          className={styles.inputField}
                          required
                          autoComplete="current-password"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className={styles.passwordToggle}
                          title={showPassword ? "Hide password" : "Show password"}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    {/* Staggered Form Cascade - Actions (Log in & Google) */}
                    <div className={styles.cascadeActions} style={{ display: "flex", flexDirection: "column" }}>
                      {/* Primary Submit Button */}
                      <button
                        type="submit"
                        disabled={loading || googleLoading || isMorphing}
                        className={styles.loginButton}
                      >
                        {loading || isMorphing ? (
                          <>
                            <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                            Signing in...
                          </>
                        ) : (
                          "Log in"
                        )}
                      </button>

                      {/* Divider */}
                      <div className={styles.divider}>Or</div>

                      {/* Google Social Login Button */}
                      <button
                        type="button"
                        disabled={loading || googleLoading || isMorphing}
                        onClick={handleGoogleSignIn}
                        className={styles.googleButton}
                      >
                        {googleLoading ? (
                          <>
                            <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                            Connecting Google...
                          </>
                        ) : (
                          <>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              width="18"
                              height="18"
                            >
                              <path
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                fill="#4285F4"
                              />
                              <path
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                fill="#34A853"
                              />
                              <path
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                fill="#FBBC05"
                              />
                              <path
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                fill="#EA4335"
                              />
                            </svg>
                            <span>Log in with Google</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>

            {/* Footer note & PWA Install Prompt */}
            <div className={styles.formFooter}>
              <div>&copy; SRT Universal School</div>
              <LoginPwaPrompt />
            </div>
          </div>

          {/* ========================================================
              RIGHT PANEL: 3D SCHOOL IMAGE SHOWCASE & CAROUSEL
              ======================================================== */}
          <div className={styles.rightPanel}>
            {/* Top Badge */}
            <div className={styles.topBadgeRow}>
              <div className={styles.portalBadge}>
                <GraduationCap size={15} />
                <span>{slides[activeSlide].badge}</span>
              </div>
            </div>

            {/* Center 3D School Image */}
            <div className={styles.artContainer}>
              <img
                src="/images/school_3d_moss_campus.jpg"
                alt="3D Sustainable School Campus"
                className={styles.artImage}
              />
            </div>

            {/* Bottom Showcase Carousel & Controls */}
            <div className={styles.bottomShowcase}>
              <div className={styles.showcaseTextWrapper}>
                <h2 className={styles.showcaseTitle}>{slides[activeSlide].title}</h2>
                <p className={styles.showcaseDesc}>{slides[activeSlide].desc}</p>
              </div>

              {/* Carousel Controls Row */}
              <div className={styles.showcaseControls}>
                {/* Pagination Pills */}
                <div className={styles.paginationPills}>
                  {slides.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setActiveSlide(index)}
                      className={`${styles.pillDot} ${
                        activeSlide === index ? styles.pillDotActive : ""
                      }`}
                      aria-label={`Go to slide ${index + 1}`}
                    />
                  ))}
                </div>

                {/* Circle Arrow Navigation Buttons */}
                <div className={styles.arrowNav}>
                  <button
                    type="button"
                    onClick={handlePrevSlide}
                    className={styles.navCircleButton}
                    aria-label="Previous slide"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextSlide}
                    className={styles.navCircleButton}
                    aria-label="Next slide"
                  >
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
