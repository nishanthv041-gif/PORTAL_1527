"use client";

import { useState } from "react";
import { 
  Award, CheckCircle2, ShieldCheck, Download, Eye, 
  Calendar, BookOpen, User, Sparkles, MessageSquareQuote, Check
} from "lucide-react";
import styles from "./ProfessionalReportCard.module.css";
import { verifyReportCardAction } from "@/backend/lib/services/reportCardActions";
import { useRouter } from "next/navigation";

export interface ProfessionalSubjectMark {
  id?: string;
  subjectName: string;
  score: number;
  maxScore: number;
  passMarks?: number;
  remarks?: string | null;
}

export interface ProfessionalReportCardData {
  id: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  className: string;
  examId: string;
  examName: string;
  examDate: string | Date;
  totalMarks: number;
  percentage: number;
  grade: string;
  remarks?: string | null;
  parentVerified: boolean;
  marks: ProfessionalSubjectMark[];
  schoolLogo?: string | null;
}

interface ProfessionalReportCardProps {
  reportCard: ProfessionalReportCardData;
  isParentView?: boolean;
}

export default function ProfessionalReportCard({
  reportCard,
  isParentView = true
}: ProfessionalReportCardProps) {
  const router = useRouter();
  const [isVerified, setIsVerified] = useState(reportCard.parentVerified);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  const formattedDate = new Date(reportCard.examDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const handleVerify = async () => {
    setIsVerifying(true);
    setVerifyMessage(null);
    try {
      const res = await verifyReportCardAction(reportCard.id);
      if (res.success) {
        setIsVerified(true);
        setVerifyMessage("Report card acknowledged & verified successfully!");
        router.refresh();
      } else {
        alert(res.error || "Failed to verify report card");
      }
    } catch (err: any) {
      alert("Error verifying report card: " + (err.message || "Network error"));
    } finally {
      setIsVerifying(false);
    }
  };

  const isDistinction = reportCard.percentage >= 80;
  const isPass = reportCard.percentage >= 35 && reportCard.grade !== "F";

  return (
    <article className={styles.cardWrapper} aria-label={`Academic Report Card for ${reportCard.studentName}`}>
      {/* Watermark Logo if available */}
      {reportCard.schoolLogo && (
        <div 
          className={styles.cardWatermark} 
          style={{ backgroundImage: `url(${reportCard.schoolLogo})` }} 
        />
      )}

      {/* Official School Header */}
      <header className={styles.cardHeader}>
        <div className={styles.schoolIdentity}>
          <div className={styles.schoolCrestBadge}>
            <Award size={28} />
          </div>
          <div className={styles.schoolTitleArea}>
            <span className={styles.documentSubtitle}>Official Academic Report</span>
            <h2 className={styles.schoolName}>SRT Higher Secondary School</h2>
          </div>
        </div>

        <div className={styles.headerBadgeRow}>
          <div className={styles.examPill}>
            <Calendar size={14} />
            <span>{reportCard.examName}</span>
          </div>
        </div>
      </header>

      {/* Student Identification Banner */}
      <div className={styles.studentInfoBanner}>
        <div className={styles.infoBlock}>
          <span className={styles.infoLabel}>Student Name</span>
          <span className={styles.infoValue}>{reportCard.studentName}</span>
        </div>

        <div className={styles.infoBlock}>
          <span className={styles.infoLabel}>Roll Number</span>
          <span className={styles.infoValue}>{reportCard.rollNumber}</span>
        </div>

        <div className={styles.infoBlock}>
          <span className={styles.infoLabel}>Class &amp; Section</span>
          <span className={styles.infoValue}>{reportCard.className}</span>
        </div>

        <div className={styles.infoBlock}>
          <span className={styles.infoLabel}>Examination Date</span>
          <span className={styles.infoValue}>{formattedDate}</span>
        </div>
      </div>

      {/* Hero Performance Summary Banner */}
      <div className={styles.metricsHero}>
        <div className={styles.metricCard}>
          <span className={styles.metricCardLabel}>Total Marks</span>
          <span className={styles.metricCardValue}>{reportCard.totalMarks}</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricCardLabel}>Percentage</span>
          <span className={styles.metricCardValue} style={{ color: "var(--primary)" }}>
            {reportCard.percentage.toFixed(1)}%
          </span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricCardLabel}>Overall Grade</span>
          <div className={styles.gradePillContainer}>
            <span className={`${styles.gradePill} ${reportCard.grade === 'F' ? styles.gradePillRed : reportCard.grade === 'D' ? styles.gradePillAmber : ''}`}>
              {reportCard.grade}
            </span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricCardLabel}>Result Status</span>
          <span style={{
            fontSize: "0.85rem",
            fontWeight: 800,
            textTransform: "uppercase",
            color: isDistinction ? "#10b981" : isPass ? "#0284c7" : "#ef4444",
            padding: "0.4rem 0.5rem"
          }}>
            {isDistinction ? "Distinction" : isPass ? "Passed" : "Needs Support"}
          </span>
        </div>
      </div>

      {/* Subject-Wise Academic Breakdown */}
      <div className={styles.subjectsSection}>
        <h3 className={styles.sectionHeading}>
          <BookOpen size={18} color="var(--primary)" />
          <span>Subject-Wise Performance Breakdown</span>
        </h3>

        {/* Desktop & Tablet Table (with responsive scroll & minimum width) */}
        <div className={styles.tableContainer}>
          <table className={styles.subjectsTable}>
            <thead className={styles.tableHead}>
              <tr>
                <th style={{ width: "38%" }}>Subject Name</th>
                <th style={{ textAlign: "center", width: "16%" }}>Marks Scored</th>
                <th style={{ textAlign: "center", width: "15%" }}>Max Marks</th>
                <th style={{ textAlign: "center", width: "15%" }}>Pass Marks</th>
                <th style={{ textAlign: "center", width: "16%" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {reportCard.marks.map((m, idx) => {
                const pass = m.passMarks ?? 35;
                const isSubjectPass = m.score >= pass;
                return (
                  <tr key={idx} className={styles.tableRow}>
                    <td>
                      <div className={styles.subjectTitleCell}>
                        <span>{m.subjectName}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: "center", fontWeight: 800, fontSize: "1rem" }}>
                      {m.score}
                    </td>
                    <td style={{ textAlign: "center", color: "var(--text-secondary)" }}>
                      {m.maxScore}
                    </td>
                    <td style={{ textAlign: "center", color: "var(--text-secondary)" }}>
                      {pass}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className={isSubjectPass ? styles.statusPass : styles.statusFail}>
                        {isSubjectPass ? "PASS" : "FAIL"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile-Optimized Subject Cards View (Ultra-responsive for Parent phones) */}
        <div className={styles.mobileSubjectsList}>
          {reportCard.marks.map((m, idx) => {
            const pass = m.passMarks ?? 35;
            const isSubjectPass = m.score >= pass;
            return (
              <div key={idx} className={styles.mobileSubjectCard}>
                <div className={styles.mobileSubjectHeader}>
                  <span className={styles.mobileSubjectName}>{m.subjectName}</span>
                  <span className={isSubjectPass ? styles.statusPass : styles.statusFail}>
                    {isSubjectPass ? "PASS" : "FAIL"}
                  </span>
                </div>
                <div className={styles.mobileSubjectGrid}>
                  <div className={styles.mobileGridItem}>
                    <span className={styles.mobileGridLabel}>Scored</span>
                    <span className={styles.mobileGridValueHighlight}>{m.score}</span>
                  </div>
                  <div className={styles.mobileGridItem}>
                    <span className={styles.mobileGridLabel}>Max</span>
                    <span className={styles.mobileGridValue}>{m.maxScore}</span>
                  </div>
                  <div className={styles.mobileGridItem}>
                    <span className={styles.mobileGridLabel}>Pass</span>
                    <span className={styles.mobileGridValue}>{pass}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Teacher Remarks Box */}
      {reportCard.remarks && (
        <div className={styles.remarksBox}>
          <div className={styles.remarksHeader}>
            <MessageSquareQuote size={16} />
            <span>Teacher Evaluation &amp; Feedback</span>
          </div>
          <p className={styles.remarksContent}>
            &ldquo;{reportCard.remarks}&rdquo;
          </p>
        </div>
      )}

      {/* DOWN OF THE REPORT CARD: VERIFICATION BUTTON & ACTIONS */}
      <footer className={styles.cardFooter}>
        <div className={styles.sealArea}>
          {isVerified ? (
            <div className={styles.verifiedBadgeStamp}>
              <CheckCircle2 size={18} color="#10b981" />
              <span>Officially Verified by Parent</span>
            </div>
          ) : isParentView ? (
            /* PROMINENT VERIFY BUTTON FOR PARENTS */
            <button
              type="button"
              id={`verify-btn-${reportCard.id}`}
              className={styles.verifyActionBtn}
              onClick={handleVerify}
              disabled={isVerifying}
              title="Click to officially verify and acknowledge this report card"
            >
              <ShieldCheck size={18} />
              <span>{isVerifying ? "Verifying..." : "Verify & Acknowledge Report Card"}</span>
            </button>
          ) : (
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Status: Awaiting Parent Verification
            </span>
          )}

          {verifyMessage && (
            <span style={{ fontSize: "0.82rem", color: "#10b981", fontWeight: 700 }}>
              {verifyMessage}
            </span>
          )}
        </div>

        {/* View & Download PDF Actions (NO Delete button!) */}
        <div className={styles.pdfActionGroup}>
          <a
            href={`/api/pdf/report-card?studentId=${reportCard.studentId}&examId=${reportCard.examId}&download=false`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.pdfBtn} ${styles.pdfViewBtn}`}
            title="View Official PDF Document"
          >
            <Eye size={15} />
            <span>View PDF</span>
          </a>

          <a
            href={`/api/pdf/report-card?studentId=${reportCard.studentId}&examId=${reportCard.examId}&download=true`}
            className={`${styles.pdfBtn} ${styles.pdfDownloadBtn}`}
            title="Download PDF Copy"
          >
            <Download size={15} />
            <span>Download PDF</span>
          </a>
        </div>
      </footer>
    </article>
  );
}
