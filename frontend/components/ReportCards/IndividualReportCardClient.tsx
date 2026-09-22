"use client";

import { useState } from "react";
import { Send, CheckCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { sendReportCardToParentAction } from "@/backend/lib/services/reportCardActions";

type SubjectData = {
  id: string;
  name: string;
  maxMarks: number;
  passMarks: number;
};

type ExamData = {
  id: string;
  name: string;
  date: Date;
};

type MarkData = {
  examId: string;
  subjectId: string;
  score: number;
  maxScore: number;
  remarks: string | null;
};

interface IndividualReportCardProps {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    rollNumber: string;
    class: {
      id: string;
      name: string;
      section: string;
    };
  };
  exams: ExamData[];
  subjects: SubjectData[];
  marks: MarkData[];
  sentAt: Date | null;
  baseUrl: string;
  isReadOnly?: boolean; // True for Parent view
}

export default function IndividualReportCardClient({
  student,
  exams,
  subjects,
  marks,
  sentAt: initialSentAt,
  baseUrl,
  isReadOnly = false
}: IndividualReportCardProps) {
  const [isSending, setIsSending] = useState(false);
  const [sentAt, setSentAt] = useState<Date | null>(initialSentAt);

  const computeGrade = (score: number, max: number, pass: number) => {
    if (score < pass) return "F";
    const percent = (score / max) * 100;
    if (percent >= 90) return "A+";
    if (percent >= 80) return "A";
    if (percent >= 70) return "B";
    if (percent >= 60) return "C";
    if (percent >= 50) return "D";
    return "E";
  };

  const handleSendToParent = async () => {
    setIsSending(true);
    const res = await sendReportCardToParentAction(student.id);
    setIsSending(false);
    if (res.success) {
      setSentAt(new Date());
    } else {
      alert(res.error || "Failed to send report card to parent");
    }
  };

  return (
    <div>
      {!isReadOnly && (
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href={`${baseUrl}?classId=${student.class.id}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
            <ArrowLeft size={16} /> Back to Class List
          </Link>
        </div>
      )}

      {/* Student Info Card */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '2rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: "var(--primary)", color: "var(--primary-fg)", display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 700 }}>
          {student.firstName[0]}{student.lastName[0]}
        </div>
        <div>
          <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', fontWeight: 700 }}>{student.firstName} {student.lastName}</h2>
          <div style={{ display: 'flex', gap: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            <span><strong>Roll No:</strong> {student.rollNumber}</span>
            <span><strong>Class:</strong> {student.class.name} - {student.class.section}</span>
          </div>
        </div>
      </div>

      {/* Report Card Table */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', marginBottom: '2rem' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '1.25rem', fontWeight: 600 }}>Exam / Term</th>
                {subjects.map(sub => (
                  <th key={sub.id} style={{ padding: '1.25rem', fontWeight: 600 }}>{sub.name}</th>
                ))}
                <th style={{ padding: '1.25rem', fontWeight: 600 }}>Total</th>
                <th style={{ padding: '1.25rem', fontWeight: 600 }}>%</th>
                <th style={{ padding: '1.25rem', fontWeight: 600 }}>Grade</th>
              </tr>
            </thead>
            <tbody>
              {exams.map(exam => {
                let totalScore = 0;
                let totalMax = 0;
                const subjectCells = subjects.map(sub => {
                  const mark = marks.find(m => m.examId === exam.id && m.subjectId === sub.id);
                  if (!mark) return <td key={sub.id} style={{ padding: '1rem', color: 'var(--text-secondary)' }}>-</td>;
                  if (mark.remarks === 'Absent') {
                    totalMax += sub.maxMarks; // they lost these marks
                    return <td key={sub.id} style={{ padding: '1rem', color: 'var(--danger)', fontWeight: 600 }}>Absent</td>;
                  }
                  
                  totalScore += mark.score;
                  totalMax += mark.maxScore;
                  
                  const isFail = mark.score < sub.passMarks;
                  return (
                    <td key={sub.id} style={{ padding: '1rem' }}>
                      <span style={{ fontWeight: isFail ? 600 : 500, color: isFail ? 'var(--danger)' : 'inherit' }}>{mark.score}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>/ {mark.maxScore}</span>
                    </td>
                  );
                });

                if (totalMax === 0) return null; // No marks entered for this exam yet

                const percentage = (totalScore / totalMax) * 100;
                // Average pass mark ratio across subjects approx
                const passRatio = subjects.reduce((sum, s) => sum + (s.passMarks / s.maxMarks), 0) / subjects.length;
                const overallPassMarks = totalMax * passRatio;
                const overallGrade = computeGrade(totalScore, totalMax, overallPassMarks);
                const isFail = totalScore < overallPassMarks;

                return (
                  <tr key={exam.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem', fontWeight: 600 }}>{exam.name}</td>
                    {subjectCells}
                    <td style={{ padding: '1rem', fontWeight: 600 }}>{totalScore} <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>/ {totalMax}</span></td>
                    <td style={{ padding: '1rem', fontWeight: 600 }}>{percentage.toFixed(1)}%</td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ 
                        fontWeight: 700, 
                        color: isFail ? 'var(--danger)' : overallGrade.startsWith('A') ? 'var(--success)' : 'inherit',
                        background: isFail ? 'var(--danger-bg)' : overallGrade.startsWith('A') ? 'var(--success-bg)' : 'rgba(0,0,0,0.05)',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '6px'
                      }}>
                        {overallGrade}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sticky Send to Parent Action */}
      {!isReadOnly && (
        <div style={{ position: 'sticky', bottom: '2rem', display: 'flex', justifyContent: 'center', zIndex: 10 }}>
          <div style={{ 
            background: 'var(--card-bg)', 
            padding: '1rem 2rem', 
            borderRadius: '50px', 
            boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem'
          }}>
            {sentAt ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontWeight: 600 }}>
                <CheckCircle size={20} />
                Sent to Parent on {new Date(sentAt).toLocaleDateString()}
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)' }}>
                Report card has not been sent.
              </div>
            )}

            <button
              onClick={handleSendToParent}
              disabled={isSending}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                backgroundColor: "var(--primary)", color: "var(--primary-fg)",
                border: 'none',
                borderRadius: '25px',
                fontWeight: 600,
                cursor: isSending ? 'not-allowed' : 'pointer',
                opacity: isSending ? 0.8 : 1,
                transition: 'all 0.2s'
              }}
            >
              {isSending ? "Sending..." : <><Send size={18} /> {sentAt ? "Send Again" : "Send to Parent"}</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
