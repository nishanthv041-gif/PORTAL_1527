"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GraduationCap, ArrowLeft } from "lucide-react";
import styles from "../login.module.css";
import ThemeToggle from "@/frontend/components/ThemeToggle";
import GoogleSignInButton from "@/frontend/components/GoogleSignInButton";

export default function TeacherLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAutofill = () => {
    setEmail("nishanthr.ad25@bitsathy.ac.in");
    setPassword("Nishanth@2715");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await signIn("credentials", {
        redirect: false,
        email,
        password,
        expectedRole: "TEACHER",
      });

      if (res?.error) {
        setError(res.error || "Invalid email or password");
        setLoading(false);
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("An unexpected error occurred");
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Theme toggle — fixed top-right corner */}
      <div
        style={{
          position: "fixed",
          top: "1.25rem",
          right: "1.25rem",
          zIndex: 50,
        }}
      >
        <ThemeToggle />
      </div>

      <div className={styles.card}>
        <div style={{ position: "relative" }}>
          <Link href="/login" style={{ position: "absolute", left: 0, top: "0.25rem", color: "var(--foreground)", opacity: 0.7 }}>
            <ArrowLeft size={20} />
          </Link>
          <div className={styles.headerRow} style={{ justifyContent: "center" }}>
            <div className={styles.headerLogo}>
              <GraduationCap size={24} />
            </div>
            <span className={styles.headerTitle}>SRT Portal</span>
          </div>
        </div>

        <h1 className={styles.title}>Teacher Login — Welcome Back!</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}
          
          <div className={styles.inputGroup}>
            <label htmlFor="email" className={styles.label}>
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              required
              placeholder="Enter your email"
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password" className={styles.label}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              required
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            className={styles.button}
            disabled={loading}
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>

        <GoogleSignInButton />

        <button type="button" onClick={handleAutofill} className={styles.autofillButton}>
          Use Demo Credentials
        </button>
      </div>
    </div>
  );
}
