"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  Loader2,
  Lock,
  Sparkles,
} from "lucide-react";
import styles from "@/frontend/app/login/modern-login.module.css";
import ThemeToggle from "@/frontend/components/ThemeToggle";

interface ModernLoginFormProps {
  schoolName?: string;
  schoolLogo?: string | null;
  defaultRole?: string | null;
  initialError?: string | null;
}

export default function ModernLoginForm({
  schoolName = "SRT Portal",
  schoolLogo = null,
  defaultRole = null,
  initialError = null,
}: ModernLoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string>(initialError || "");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Carousel State
  const [activeSlide, setActiveSlide] = useState(0);

  const slides = [
    {
      title: "More Than Just An Academic Portal",
      desc: "An intelligent, unified digital ecosystem empowering educators, students, and parents every day.",
      badge: "🎓 Campus Portal 2026–2027",
    },
    {
      title: "Real-Time Attendance & Performance Tracking",
      desc: "Instant roll-calls, grade analytics, and automated parent notifications at your fingertips.",
      badge: "📊 Live Academic Analytics",
    },
    {
      title: "Secure Enterprise Institutional Management",
      desc: "Robust role-based security, automated activity auditing, and centralized student records.",
      badge: "🛡️ Institutional Security",
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
        setError(res.error || "Invalid email or password. Please verify your credentials.");
        setLoading(false);
      } else {
        try {
          sessionStorage.removeItem("srt_portal_popup_notif_dismissed");
          sessionStorage.setItem("srt_portal_fresh_login", "true");
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
              if (sess?.user?.role) {
                target = `/dashboard/${sess.user.role.toLowerCase()}`;
              }
            }
          } catch {}
        }
        window.location.href = target;
      }
    } catch {
      setError("An unexpected connection error occurred. Please try again.");
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      sessionStorage.removeItem("srt_portal_popup_notif_dismissed");
      sessionStorage.setItem("srt_portal_fresh_login", "true");
    } catch {}
    try {
      const target = defaultRole ? `/dashboard/${defaultRole.toLowerCase()}` : "/dashboard";
      await signIn("google", { callbackUrl: target });
    } catch {
      setGoogleLoading(false);
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
          <Sparkles size={14} className={styles.sparkleIcon} />
          <span>{portalDisplayName}</span>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Split-Screen Canvas Card */}
      <div className={styles.mainCanvas}>
        {/* ========================================================
            LEFT PANEL: FORM & PORTAL BRANDING
            ======================================================== */}
        <div className={styles.leftPanel}>
          {/* Brand Header */}
            <div className={styles.brandRow}>
              {schoolLogo ? (
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
                <div className={styles.brandLogo}>
                  <GraduationCap size={20} />
                </div>
              )}
              <div className={styles.brandTextGroup}>
                <span className={styles.brandName}>{portalDisplayName}</span>
                <span className={styles.brandBadge}>Academic Portal</span>
              </div>
            </div>

            {/* Form Content Area */}
            <div className={styles.formContent}>
              {/* Main Headline */}
              <h1 className={styles.headline}>Get started!</h1>

              {/* Subtitle (Sign In option removed) */}
              <p className={styles.subheadline}>
                Welcome to {portalDisplayName}. Enter your credentials to access your academic dashboard.
              </p>

              {/* Error Message Notification */}
              {error && (
                <div className={styles.errorAlert}>
                  <AlertCircle size={18} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}

              {/* Credential Inputs */}
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.inputFieldWrapper}>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address"
                    className={styles.inputField}
                    required
                    autoComplete="email"
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
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={styles.passwordToggle}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Primary Submit Button */}
                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className={styles.loginButton}
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                      Signing in...
                    </>
                  ) : (
                    "Log in"
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className={styles.divider}>Or</div>

              {/* Google Social Login Button (Facebook omitted) */}
              <button
                type="button"
                disabled={loading || googleLoading}
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

            {/* Footer note */}
            <div className={styles.formFooter}>
              &copy; {new Date().getFullYear()} {portalDisplayName}. All rights reserved.
            </div>
          </div>

          {/* ========================================================
              RIGHT PANEL: 3D SCHOOL IMAGE SHOWCASE & CAROUSEL
              ======================================================== */}
          <div className={styles.rightPanel}>
            {/* Top Badge */}
            <div className={styles.topBadgeRow}>
              <div className={styles.portalBadge}>
                <Sparkles size={14} />
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
