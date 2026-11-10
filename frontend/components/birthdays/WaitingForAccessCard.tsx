"use client";

import React, { useState } from "react";
import Link from "next/link";
import { GraduationCap, ArrowLeft, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { submitClassTeacherRequestAction } from "@/backend/api/actions/dashboard/teacher/classTeacherRequestActions";
import type { TeacherClass } from "@/lib/teacher/getTeacherClasses";
import styles from "./BirthdayStudio.module.css";

interface WaitingForAccessCardProps {
  taughtClasses: TeacherClass[];
  pendingClassIds?: string[];
  canViewBirthdays?: boolean;
}

export default function WaitingForAccessCard({
  taughtClasses = [],
  pendingClassIds = [],
  canViewBirthdays = false,
}: WaitingForAccessCardProps) {
  const [pendingMap, setPendingMap] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    pendingClassIds.forEach((id) => {
      init[id] = true;
    });
    return init;
  });
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleRequest = async (classId: string, className: string) => {
    setLoadingMap((prev) => ({ ...prev, [classId]: true }));
    try {
      const res = await submitClassTeacherRequestAction(classId);
      if (res.isPending || res.success) {
        setPendingMap((prev) => ({ ...prev, [classId]: true }));
        setSuccessMessage(`Request submitted for ${className}. School administrator has been notified.`);
        setTimeout(() => setSuccessMessage(null), 5000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [classId]: false }));
    }
  };

  return (
    <div className={styles.container} style={{ maxWidth: "700px" }}>
      <div
        style={{
          background: "var(--card-bg)",
          borderRadius: "24px",
          padding: "2rem",
          border: "1px solid var(--border-color)",
          boxShadow: "0 10px 40px rgba(0, 0, 0, 0.08)",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        {/* Header Icon + Title */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "16px",
              background: "rgba(242, 184, 75, 0.15)",
              color: "#d97706",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              border: "1px solid rgba(242, 184, 75, 0.3)",
            }}
          >
            <GraduationCap size={28} />
          </div>
          <div>
            <h1 style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--foreground)", margin: 0 }}>
              Class Teacher Designation Required
            </h1>
            <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: "0.4rem 0 0", lineHeight: "1.5" }}>
              Student Date of Birth records and classroom birthday celebrations are managed by each section&apos;s designated Class Teacher.
            </p>
          </div>
        </div>

        {/* Success Alert */}
        {successMessage && (
          <div
            style={{
              padding: "0.85rem 1rem",
              borderRadius: "12px",
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              color: "#059669",
              fontSize: "0.875rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <CheckCircle2 size={18} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Assigned Classes List */}
        <div>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
            YOUR ASSIGNED CLASSES ({taughtClasses.length}):
          </div>

          {taughtClasses.length === 0 ? (
            <div
              style={{
                padding: "1rem",
                borderRadius: "12px",
                background: "rgba(0,0,0,0.02)",
                border: "1px solid var(--border-color)",
                fontSize: "0.85rem",
                color: "var(--text-muted)",
              }}
            >
              You do not have any teaching classes assigned yet. Please contact the administrator to link your profile to a class.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {taughtClasses.map((cls) => {
                const isPending = pendingMap[cls.classId];
                const isLoading = loadingMap[cls.classId];

                return (
                  <div
                    key={cls.classId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.85rem 1rem",
                      borderRadius: "14px",
                      background: "rgba(0, 0, 0, 0.02)",
                      border: "1px solid var(--border-color)",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--foreground)" }}>
                        {cls.displayName}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                        Role: {cls.isClassTeacher ? "Class Teacher" : "Subject Teacher"}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {isPending ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            padding: "0.4rem 0.75rem",
                            borderRadius: "9999px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            background: "rgba(245, 158, 11, 0.15)",
                            color: "#d97706",
                            border: "1px solid rgba(245, 158, 11, 0.3)",
                          }}
                        >
                          <Clock size={13} />
                          <span>Request Pending Admin Approval</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRequest(cls.classId, cls.displayName)}
                          disabled={isLoading}
                          className={`${styles.actionBtn} ${styles.actionBtnWarning}`}
                          style={{ minHeight: "38px", fontSize: "0.8rem", padding: "0.4rem 0.85rem" }}
                        >
                          {isLoading ? "Submitting..." : "Ask Admin to Make Me Class Teacher"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "1rem",
            borderTop: "1px solid var(--border-color)",
            marginTop: "0.5rem",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <Link
            href="/dashboard/teacher"
            prefetch={true}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={16} />
            <span>Return to Teacher Dashboard</span>
          </Link>

          {canViewBirthdays && (
            <Link
              href="/dashboard/teacher/birthdays"
              prefetch={true}
              className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
              style={{ minHeight: "38px", fontSize: "0.8rem" }}
            >
              <span>View Today&apos;s Celebrations (View-Only) →</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
