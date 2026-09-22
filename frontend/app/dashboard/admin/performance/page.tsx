import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import PerformanceClient from "./PerformanceClient";

export default async function AdminPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; examId?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') return null;

  const resolvedSearchParams = await searchParams;
  const { classId, examId } = resolvedSearchParams;

  const classes = await prisma.class.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' }
  });

  const exams = await prisma.exam.findMany({
    orderBy: { date: 'desc' }
  });

  const whereClause: import("@prisma/client").Prisma.MarkWhereInput = {};
  if (classId) {
    whereClause.student = { classId };
  }
  if (examId) {
    whereClause.examId = examId;
  }

  // Fetch all marks for pass/fail aggregation
  const marks = await prisma.mark.findMany({
    where: whereClause,
    include: {
      student: { include: { class: true } },
      subject: true,
      exam: true
    }
  });

  // Calculate pass/fail per class for school-wide overview
  const classStats: { [key: string]: { pass: number; fail: number; name: string } } = {};
  
  // Calculate Grade Distribution for Pie Chart (Current Selection)
  let a = 0, b = 0, c = 0, d = 0, f = 0;
  let totalScore = 0, highest = 0, lowest = 999999;

  // Calculate top performers
  const studentStats: { [key: string]: { sum: number; max: number; name: string; rollNo: string } } = {};

  marks.forEach(m => {
    if (m.remarks === 'Absent') return;

    // Class agg (Overview)
    const cid = m.student.classId;
    if (cid && !classStats[cid]) {
      classStats[cid] = { pass: 0, fail: 0, name: `${m.student.class?.name} - ${m.student.class?.section}` };
    }
    
    const percent = (m.score / m.maxScore) * 100;
    const isPass = m.score >= m.subject.passMarks;

    if (cid) {
      if (isPass) classStats[cid].pass++;
      else classStats[cid].fail++;
    }

    // Pie Chart Grade Dist (Current Selection)
    if (!isPass) f++;
    else if (percent >= 80) a++;
    else if (percent >= 70) b++;
    else if (percent >= 60) c++;
    else d++;

    // Stats
    totalScore += m.score;
    if (m.score > highest) highest = m.score;
    if (m.score < lowest) lowest = m.score;

    // Student agg
    if (!studentStats[m.studentId]) {
      studentStats[m.studentId] = { sum: 0, max: 0, name: `${m.student.firstName} ${m.student.lastName}`, rollNo: m.student.rollNumber };
    }
    studentStats[m.studentId].sum += m.score;
    studentStats[m.studentId].max += m.maxScore;
  });

  const validMarksCount = marks.filter(m => m.remarks !== 'Absent').length;
  if (lowest === 999999) lowest = 0;

  const stats = {
    average: validMarksCount > 0 ? (totalScore / validMarksCount).toFixed(1) : "0.0",
    highest,
    lowest,
    passPercent: validMarksCount > 0 ? (((a+b+c+d) / validMarksCount) * 100).toFixed(1) : "0.0",
    failPercent: validMarksCount > 0 ? ((f / validMarksCount) * 100).toFixed(1) : "0.0",
  };

  const pieData = [
    { name: 'A (80%+)', value: a, color: "var(--success)" },
    { name: 'B (70-79%)', value: b, color: "var(--primary)" },
    { name: 'C (60-69%)', value: c, color: '#8b5cf6' },
    { name: 'D (50-59%)', value: d, color: "var(--warning)" },
    { name: 'F (Fail)', value: f, color: "var(--danger)" },
  ];

  // Convert class stats for overview bar chart
  const overviewChartData = Object.values(classStats).map(s => {
    const total = s.pass + s.fail;
    return {
      name: s.name,
      PassPercent: total > 0 ? (s.pass / total) * 100 : 0
    };
  });

  // Get top 10 students
  const topPerformers = Object.values(studentStats)
    .map(s => ({
      name: s.name,
      rollNo: s.rollNo,
      percentage: s.max > 0 ? (s.sum / s.max) * 100 : 0
    }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 10);

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>School Performance</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Aggregated pass/fail statistics and top performing students.</p>

      <PerformanceClient 
        pieData={pieData} 
        overviewChartData={overviewChartData}
        stats={stats}
        topPerformers={topPerformers} 
        classes={classes}
        exams={exams}
        initialClassId={classId || ""}
        initialExamId={examId || ""}
      />
    </div>
  );
}
