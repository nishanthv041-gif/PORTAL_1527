"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  GraduationCap,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  Loader2,
  CheckCircle2,
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
  const [selectedRole, setSelectedRole] = useState<string>(
    defaultRole ? defaultRole.toUpperCase() : "ALL"
  );
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

  const handleAutofill = (role: "ADMIN" | "TEACHER" | "PARENT") => {
    setSelectedRole(role);
    setError("");
    if (role === "ADMIN") {
      setEmail("nishanthv041@gmail.com");
      setPassword("Nishanth@2715");
    } else if (role === "TEACHER") {
      setEmail("nishanthr.ad25@bitsathy.ac.in");
      setPassword("Nishanth@2715");
    } else if (role === "PARENT") {
      setEmail("poorvika1527@gmail.com");
      setPassword("poorvika@2715");
    }
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

      if (selectedRole !== "ALL") {
        signInOptions.expectedRole = selectedRole;
      }

      const res = await signIn("credentials", signInOptions);

      if (res?.error) {
        setError(res.error || "Invalid email or password. Please verify your credentials.");
        setLoading(false);
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("An unexpected connection error occurred. Please try again.");
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch {
      setGoogleLoading(false);
    }
  };

  return (
    <div className={styles.pageWrapper}>
      {/* Top Bar for Theme Toggle */}
      <div className={styles.topBar}>
        <ThemeToggle />
      </div>

      {/* Main Split-Screen Container Frame */}
      <div className={styles.frameContainer}>
        {/* ========================================================
            LEFT PANEL: LOGIN FORM & PORTAL BRANDING
            ======================================================== */}
        <div className={styles.leftPanel}>
          {/* Brand Row with Portal Name */}
          <div className={styles.brandRow}>
            {schoolLogo ? (
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: "2px solid #e2e8f0",
                  flexShrink: 0,
                }}
              >
                <img
                  src={schoolLogo}
                  alt={schoolName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            ) : (
              <div className={styles.brandLogo}>
                <GraduationCap size={22} />
              </div>
            )}
            <div className={styles.brandTextGroup}>
              <span className={styles.brandName}>
                {schoolName.toLowerCase().includes("portal") ? schoolName : `${schoolName} Portal`}
              </span>
              <span className={styles.brandBadge}>Academic Portal</span>
            </div>
          </div>

          {/* Form Content Area */}
          <div className={styles.formContent}>
            {/* Main Headline */}
            <h1 className={styles.headline}>Get started!</h1>

            {/* Welcoming Subtitle (Removed Sign In option as requested) */}
            <p className={styles.subheadline}>
              Welcome to {schoolName.toLowerCase().includes("portal") ? schoolName : `${schoolName} Portal`}. Sign in to access your classes, grades, and academic management tools.
            </p>

            {/* Error Message Notification */}
            {error && (
              <div className={styles.errorAlert}>
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Role Switcher Pill Tabs */}
            <div className={styles.roleTabs}>
              <button
                type="button"
                onClick={() => setSelectedRole("ALL")}
                className={`${styles.roleTab} ${selectedRole === "ALL" ? styles.roleTabActive : ""}`}
              >
                All Roles
              </button>
              <button
                type="button"
                onClick={() => setSelectedRole("TEACHER")}
                className={`${styles.roleTab} ${selectedRole === "TEACHER" ? styles.roleTabActive : ""}`}
              >
                Teacher
              </button>
              <button
                type="button"
                onClick={() => setSelectedRole("PARENT")}
                className={`${styles.roleTab} ${selectedRole === "PARENT" ? styles.roleTabActive : ""}`}
              >
                Parent
              </button>
              <button
                type="button"
                onClick={() => setSelectedRole("ADMIN")}
                className={`${styles.roleTab} ${selectedRole === "ADMIN" ? styles.roleTabActive : ""}`}
              >
                Admin
              </button>
            </div>

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

            {/* Google Social Login Button (Facebook omitted as requested) */}
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
                    width="20"
                    height="20"
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

            {/* Demo Quick-Fill Helper */}
            <div className={styles.demoFillBar}>
              <span className={styles.demoFillLabel}>Demo Credentials:</span>
              <div className={styles.demoChips}>
                <button
                  type="button"
                  onClick={() => handleAutofill("ADMIN")}
                  className={styles.demoChip}
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => handleAutofill("TEACHER")}
                  className={styles.demoChip}
                >
                  Teacher
                </button>
                <button
                  type="button"
                  onClick={() => handleAutofill("PARENT")}
                  className={styles.demoChip}
                >
                  Parent
                </button>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className={styles.formFooter}>
            &copy; {new Date().getFullYear()} {schoolName}. All rights reserved.
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
