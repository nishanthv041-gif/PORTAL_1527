"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  PieChart as PieChartIcon, ArrowRight, Award, 
  TrendingUp, TrendingDown, Users, CheckCircle2 
} from "lucide-react";
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend 
} from "recharts";
import styles from "./ExamClassPerformancePieChart.module.css";

export type ExamClassPerformanceProps = {
  hasExamData: boolean;
  examName?: string;
  examDate?: string;
  classNameStr?: string;
  classOverallPercentage: number;
  totalStudentsAppeared: number;
  passedStudents: number;
  failedStudents: number;
  passRatePercentage: number;
  childPercentage: number | null;
  childScore?: number;
  childMaxScore?: number;
  childName?: string;
  childId?: string;
  subjectBreakdown?: { name: string; avgPercentage: number }[];
};

export default function ExamClassPerformancePieChart({
  hasExamData,
  examName,
  examDate,
  classNameStr,
  classOverallPercentage,
  totalStudentsAppeared,
  passedStudents,
  failedStudents,
  passRatePercentage,
  childPercentage,
  childScore,
  childMaxScore,
  childName,
  childId,
  subjectBreakdown = [],
}: ExamClassPerformanceProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!hasExamData) {
    return (
      <div className={styles.card}>
        <div className={styles.headerRow}>
          <div className={styles.titleGroup}>
            <h3 className={styles.title}>
              <PieChartIcon size={20} color="var(--primary)" />
              <span>Class Exam Performance (Last Test)</span>
            </h3>
            <p className={styles.subtitle}>
              Overall class test evaluation and percentage analysis
            </p>
          </div>
          {childId && (
            <Link 
              href={`/dashboard/parent/exams?childId=${childId}`}
              prefetch={true}
              className={styles.viewExamsLink}
            >
              <span>View All Exams</span>
              <ArrowRight size={14} />
            </Link>
          )}
        </div>

        <div className={styles.emptyState}>
          <Award size={40} style={{ opacity: 0.35, margin: "0 auto 0.5rem" }} />
          <h4 className={styles.emptyStateTitle}>No Test Results Published Yet</h4>
          <p className={styles.emptyStateSub}>
            No exam marks have been graded for {classNameStr || "this class"} yet. The class overall percentage pie chart will appear automatically as soon as the first test is graded by teachers.
          </p>
          {childId && (
            <Link 
              href={`/dashboard/parent/exams?childId=${childId}`}
              prefetch={true}
              className={styles.viewExamsLink}
              style={{ display: "inline-flex" }}
            >
              <span>Open Exams &amp; Marks</span>
              <ArrowRight size={14} />
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Data for the Pie Chart: Class Overall Scored % vs Remaining %
  const remainingPercentage = Number(Math.max(0, 100 - classOverallPercentage).toFixed(1));
  const pieData = [
    { name: "Scored %", value: classOverallPercentage, color: "#6366f1" },
    { name: "Remaining %", value: remainingPercentage, color: "rgba(156, 163, 175, 0.2)" },
  ];

  const isChildAbove = childPercentage !== null && childPercentage >= classOverallPercentage;
  const diffFromAvg = childPercentage !== null ? (childPercentage - classOverallPercentage).toFixed(1) : null;

  return (
    <div className={styles.card}>
      {/* Header */}
      <div className={styles.headerRow}>
        <div className={styles.titleGroup}>
          <h3 className={styles.title}>
            <PieChartIcon size={20} color="var(--primary)" />
            <span>Class Exam Performance (Last Test)</span>
          </h3>
          <p className={styles.subtitle}>
            <strong>{examName}</strong> • Conducted on {examDate} for <strong>{classNameStr}</strong>
          </p>
        </div>

        {childId && (
          <Link 
            href={`/dashboard/parent/exams?childId=${childId}`}
            prefetch={true}
            className={styles.viewExamsLink}
          >
            <span>View All Exams</span>
            <ArrowRight size={14} />
          </Link>
        )}
      </div>

      {/* Main Grid: Pie Chart + Analytical Metrics */}
      <div className={styles.contentGrid}>
        {/* Left Column: Donut Pie Chart with Centered Metric */}
        <div className={styles.chartWrapper}>
          {isMounted ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={68}
                  outerRadius={92}
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(val: any) => [`${val}%`, '']}
                  contentStyle={{ 
                    borderRadius: '8px', 
                    background: 'var(--card-bg)', 
                    borderColor: 'var(--border-color)',
                    color: 'var(--foreground)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.25)' 
                  }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={28}
                  formatter={(value) => <span style={{ color: 'var(--foreground)', fontSize: '0.8rem' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: "240px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--primary)" }}>{classOverallPercentage}%</span>
            </div>
          )}

          {/* Centered Donut Callout */}
          <div className={styles.centerCallout}>
            <span className={styles.centerValue}>{classOverallPercentage}%</span>
            <span className={styles.centerLabel}>Class Overall</span>
          </div>
        </div>

        {/* Right Column: Breakdown & Comparison Cards */}
        <div className={styles.metricsCol}>
          <div className={styles.metricsGrid}>
            <div className={styles.metricBox}>
              <span className={styles.metricBoxLabel}>Class Overall %</span>
              <span className={styles.metricBoxValue} style={{ color: "var(--primary)" }}>
                {classOverallPercentage}%
              </span>
              <span className={styles.metricBoxSub}>Average across all subjects</span>
            </div>

            <div className={styles.metricBox}>
              <span className={styles.metricBoxLabel}>Class Pass Rate</span>
              <span className={styles.metricBoxValue} style={{ color: "var(--success)" }}>
                {passRatePercentage}%
              </span>
              <span className={styles.metricBoxSub}>
                {passedStudents} / {totalStudentsAppeared} students passed
              </span>
            </div>
          </div>

          {/* Student's Own Performance Comparison */}
          {childPercentage !== null ? (
            <div className={styles.studentHighlightCard}>
              <div className={styles.studentHighlightText}>
                <span className={styles.studentHighlightTitle}>
                  {childName ? `${childName}'s Test Score` : "Your Child's Test Score"}
                </span>
                <span className={styles.studentHighlightScore}>
                  {childPercentage}% {childScore !== undefined && childMaxScore !== undefined ? `(${childScore} / ${childMaxScore})` : ""}
                </span>
              </div>

              <div>
                {isChildAbove ? (
                  <span className={`${styles.compareBadge} ${styles.badgeAbove}`}>
                    <TrendingUp size={14} />
                    <span>+{diffFromAvg}% Above Class Avg</span>
                  </span>
                ) : (
                  <span className={`${styles.compareBadge} ${styles.badgeBelow}`}>
                    <TrendingDown size={14} />
                    <span>{diffFromAvg}% vs Class Avg</span>
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.studentHighlightCard}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Individual student score not yet published for this test.
              </span>
            </div>
          )}

          {/* Subject Average Pills */}
          {subjectBreakdown.length > 0 && (
            <div>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary)" }}>
                Subject Performance (Class Avg)
              </span>
              <div className={styles.subjectChipsRow}>
                {subjectBreakdown.map((sub, i) => (
                  <div key={i} className={styles.subjectChip}>
                    <span className={styles.subjectChipName}>{sub.name}:</span>
                    <span className={styles.subjectChipPct}>{sub.avgPercentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
