"use client";

import { useState } from "react";
import BulkUpload from "@/frontend/app/dashboard/admin/create-roles/BulkUpload";
import { FileSpreadsheet, Users, GraduationCap, Download, CheckCircle2 } from "lucide-react";

interface ClassItem {
  id: string;
  name: string;
  section: string;
}

export default function ExcelImportHubClient({ classes }: { classes: ClassItem[] }) {
  const [selectedWorkflow, setSelectedWorkflow] = useState<"STUDENT_PARENT" | "TEACHER">("STUDENT_PARENT");

  return (
    <div>
      {/* Page Title & Intro */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--foreground)", margin: "0 0 0.5rem" }}>
          Intelligent Excel Import System
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem", margin: 0 }}>
          Manage bulk account provisioning for Parent, Student, and Teacher roles with real-time schema validation, in-memory duplicate checking, and safe transactional database writes.
        </p>
      </div>

      {/* Workflow Selection Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: "1.25rem",
        marginBottom: "2rem"
      }}>
        {/* Student + Parent Card */}
        <div
          onClick={() => setSelectedWorkflow("STUDENT_PARENT")}
          style={{
            padding: "1.5rem",
            borderRadius: "14px",
            border: `2px solid ${selectedWorkflow === "STUDENT_PARENT" ? "var(--primary, #6366f1)" : "var(--border-color, #e5e7eb)"}`,
            backgroundColor: selectedWorkflow === "STUDENT_PARENT" ? "rgba(99, 102, 241, 0.04)" : "var(--card-bg, #ffffff)",
            cursor: "pointer",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "flex-start",
            gap: "1rem",
            boxShadow: selectedWorkflow === "STUDENT_PARENT" ? "0 4px 12px rgba(99, 102, 241, 0.15)" : "none"
          }}
        >
          <div style={{
            width: "44px",
            height: "44px",
            borderRadius: "10px",
            backgroundColor: "rgba(16, 185, 129, 0.15)",
            color: "#10b981",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}>
            <Users size={24} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, color: "var(--foreground)" }}>
                Student & Parent Import
              </h3>
              {selectedWorkflow === "STUDENT_PARENT" && (
                <span style={{
                  padding: "0.15rem 0.45rem",
                  borderRadius: "12px",
                  backgroundColor: "rgba(99, 102, 241, 0.15)",
                  color: "var(--primary, #6366f1)",
                  fontSize: "0.6875rem",
                  fontWeight: 700
                }}>
                  ACTIVE
                </span>
              )}
            </div>
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              Upload the combined student-parent workbook. Reuses existing parent accounts for siblings and enrolls students into verified classes.
            </p>
          </div>
        </div>

        {/* Teacher Card */}
        <div
          onClick={() => setSelectedWorkflow("TEACHER")}
          style={{
            padding: "1.5rem",
            borderRadius: "14px",
            border: `2px solid ${selectedWorkflow === "TEACHER" ? "var(--primary, #6366f1)" : "var(--border-color, #e5e7eb)"}`,
            backgroundColor: selectedWorkflow === "TEACHER" ? "rgba(99, 102, 241, 0.04)" : "var(--card-bg, #ffffff)",
            cursor: "pointer",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "flex-start",
            gap: "1rem",
            boxShadow: selectedWorkflow === "TEACHER" ? "0 4px 12px rgba(99, 102, 241, 0.15)" : "none"
          }}
        >
          <div style={{
            width: "44px",
            height: "44px",
            borderRadius: "10px",
            backgroundColor: "rgba(99, 102, 241, 0.15)",
            color: "var(--primary, #6366f1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}>
            <GraduationCap size={24} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, color: "var(--foreground)" }}>
                Teacher Import
              </h3>
              {selectedWorkflow === "TEACHER" && (
                <span style={{
                  padding: "0.15rem 0.45rem",
                  borderRadius: "12px",
                  backgroundColor: "rgba(99, 102, 241, 0.15)",
                  color: "var(--primary, #6366f1)",
                  fontSize: "0.6875rem",
                  fontWeight: 700
                }}>
                  ACTIVE
                </span>
              )}
            </div>
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              Upload official teacher rosters. Securely provisions teacher credentials, verifies official email uniqueness, and assigns the Teacher role.
            </p>
          </div>
        </div>
      </div>

      {/* Render the Active BulkUpload Component */}
      {selectedWorkflow === "STUDENT_PARENT" ? (
        <BulkUpload key="workflow-student" type="student" classes={classes} />
      ) : (
        <BulkUpload key="workflow-teacher" type="teacher" classes={classes} />
      )}
    </div>
  );
}
