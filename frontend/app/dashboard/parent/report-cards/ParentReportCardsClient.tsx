"use client";

import { useState } from "react";
import { Award, Clock, FileText, CheckCircle2, ChevronRight, Sparkles } from "lucide-react";
import ProfessionalReportCard, { 
  ProfessionalReportCardData 
} from "@/frontend/components/ReportCards/ProfessionalReportCard";

interface ParentReportCardsClientProps {
  reportCards: ProfessionalReportCardData[];
  studentName: string;
}

export default function ParentReportCardsClient({ 
  reportCards,
  studentName
}: ParentReportCardsClientProps) {
  // If multiple report cards, allow switching between them or viewing the latest
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!reportCards || reportCards.length === 0) {
    return (
      <div style={{
        textAlign: "center",
        padding: "3.5rem 1.5rem",
        background: "var(--card-bg)",
        border: "1.5px dashed var(--border-color)",
        borderRadius: "20px",
        marginTop: "1.5rem",
        color: "var(--text-secondary)"
      }}>
        <Award size={48} style={{ opacity: 0.25, margin: "0 auto 1rem" }} />
        <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.2rem", fontWeight: 700, color: "var(--foreground)" }}>
          No Report Cards Published Yet
        </h3>
        <p style={{ margin: 0, fontSize: "0.9rem", maxWidth: "420px", marginInline: "auto" }}>
          When teachers evaluate and publish academic term results for <strong>{studentName}</strong>, the official report card will appear here and in your notifications.
        </p>
      </div>
    );
  }

  const activeCard = reportCards[selectedIndex] || reportCards[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginTop: "1.5rem" }}>
      {/* If child has multiple exam report cards in history, show an intuitive selector */}
      {reportCards.length > 1 && (
        <div style={{
          display: "flex",
          gap: "0.6rem",
          overflowX: "auto",
          padding: "0.5rem 0",
          scrollbarWidth: "none"
        }}>
          {reportCards.map((rc, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={rc.id}
                type="button"
                onClick={() => setSelectedIndex(idx)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.65rem 1.15rem",
                  borderRadius: "12px",
                  border: isSelected ? "1.5px solid var(--primary)" : "1.5px solid var(--border-color)",
                  background: isSelected ? "rgba(99, 102, 241, 0.1)" : "var(--card-bg)",
                  color: isSelected ? "var(--primary)" : "var(--foreground)",
                  fontWeight: 700,
                  fontSize: "0.88rem",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s ease",
                  boxShadow: isSelected ? "0 2px 8px rgba(99, 102, 241, 0.15)" : "none"
                }}
              >
                <span>{rc.examName}</span>
                <span style={{
                  fontSize: "0.75rem",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "6px",
                  background: rc.parentVerified ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                  color: rc.parentVerified ? "#10b981" : "#d97706",
                  fontWeight: 800
                }}>
                  {rc.parentVerified ? "Verified" : "Pending"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Professional Report Card (Zero delete options, verify at bottom) */}
      <ProfessionalReportCard 
        reportCard={activeCard} 
        isParentView={true} 
      />

      {/* Academic Record History Summary (Saved in Parent History) */}
      {reportCards.length > 1 && (
        <div style={{
          background: "var(--card-bg)",
          border: "1px solid var(--border-color)",
          borderRadius: "18px",
          padding: "1.25rem clamp(1rem, 2.5vw, 1.5rem)",
          marginTop: "0.5rem"
        }}>
          <h3 style={{ margin: "0 0 0.85rem 0", fontSize: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Clock size={16} color="var(--primary)" />
            <span>Academic Performance History for {studentName}</span>
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "0.85rem" }}>
            {reportCards.map((rc, idx) => (
              <div 
                key={rc.id}
                onClick={() => setSelectedIndex(idx)}
                style={{
                  padding: "0.85rem 1rem",
                  borderRadius: "12px",
                  border: idx === selectedIndex ? "1.5px solid var(--primary)" : "1px solid var(--border-color)",
                  background: idx === selectedIndex ? "rgba(99, 102, 241, 0.03)" : "rgba(0,0,0,0.015)",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.92rem" }}>{rc.examName}</span>
                  <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--primary)" }}>{rc.grade}</span>
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", justifyContent: "space-between" }}>
                  <span>Score: {rc.totalMarks} ({rc.percentage}%)</span>
                  <span>{rc.parentVerified ? "✓ Verified" : "Pending"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
