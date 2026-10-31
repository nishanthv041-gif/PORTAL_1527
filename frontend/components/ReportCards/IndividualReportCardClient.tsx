"use client";

import { useState } from "react";
import { Send, CheckCircle, ArrowLeft, Users, Mail, Phone, AlertCircle } from "lucide-react";
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

type LinkedParent = {
  id: string;
  user: {
    name: string;
    email: string;
  };
  phone?: string | null;
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
    parents?: LinkedParent[];
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
  const [deliveryResult, setDeliveryResult] = useState<{
    success: boolean;
    message: string;
    recipients?: string[];
  } | null>(null);

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
    setDeliveryResult(null);
    try {
      const res = await sendReportCardToParentAction(student.id);
      setIsSending(false);
      if (res.success) {
        setSentAt(new Date());
        setDeliveryResult({
          success: true,
          message: res.message || "Report card sent successfully!",
          recipients: res.recipients
        });
      } else {
        setDeliveryResult({
          success: false,
          message: res.error || "Failed to send report card to parent"
        });
      }
    } catch (err: unknown) {
      setIsSending(false);
      setDeliveryResult({
        success: false,
        message: err instanceof Error ? err.message : "Error sending report card"
      });
    }
  };

  const parentsList = student.parents || [];

  return (
    <div>
      {!isReadOnly && (
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href={`${baseUrl}?classId=${student.class.id}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
            <ArrowLeft size={16} /> Back to Class List
          </Link>
        </div>
      )}

      {/* Delivery Feedback Banner */}
      {deliveryResult && (
        <div style={{
          padding: '1rem 1.25rem',
          borderRadius: '10px',
          marginBottom: '1.5rem',
          background: deliveryResult.success ? 'var(--success-bg, #f0fdf4)' : 'var(--danger-bg, #fef2f2)',
          border: `1px solid ${deliveryResult.success ? '#bbf7d0' : '#fecaca'}`,
          color: deliveryResult.success ? '#15803d' : '#b91c1c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {deliveryResult.success ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
            <span style={{ fontWeight: 600 }}>{deliveryResult.message}</span>
          </div>
          {deliveryResult.recipients && deliveryResult.recipients.length > 0 && (
            <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>
              Delivered to: <strong>{deliveryResult.recipients.join(", ")}</strong>
            </div>
          )}
        </div>
      )}

      {/* Student Info Card */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.75rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ width: 70, height: 70, borderRadius: '50%', background: "var(--primary)", color: "var(--primary-fg)", display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', fontWeight: 700 }}>
            {student.firstName[0]}{student.lastName[0]}
          </div>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', fontWeight: 700 }}>{student.firstName} {student.lastName}</h2>
            <div style={{ display: 'flex', gap: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem', flexWrap: 'wrap' }}>
              <span><strong>Roll No:</strong> {student.rollNumber}</span>
              <span><strong>Class:</strong> {student.class.name} - {student.class.section}</span>
            </div>
          </div>
        </div>

        {/* Linked Parents Count & Details */}
        {!isReadOnly && (
          <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              <Users size={16} />
              <span>Linked Parents ({parentsList.length})</span>
            </div>

            {parentsList.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--danger)' }}>
                No parents linked to this student. Please link parents in the Students or Parents management section.
              </p>
            ) : (
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {parentsList.map((p, idx) => (
                  <div 
                    key={p.id || idx}
                    style={{
                      background: 'rgba(0,0,0,0.03)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '0.5rem 0.85rem',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      flexWrap: 'wrap'
                    }}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.user.name}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-secondary)' }}>
                      <Mail size={13} /> {p.user.email}
                    </span>
                    {p.phone && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-secondary)' }}>
                        <Phone size={13} /> {p.phone}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
                    totalMax += sub.maxMarks;
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

                if (totalMax === 0) return null;

                const percentage = (totalScore / totalMax) * 100;
                const passRatio = subjects.reduce((sum, s) => sum + (s.passMarks / s.maxMarks), 0) / (subjects.length || 1);
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
          {exams.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No exams or marks published yet for this student.
            </div>
          )}
        </div>
      </div>

      {/* Sticky Send to All Parents Action */}
      {!isReadOnly && (
        <div style={{ position: 'sticky', bottom: '2rem', display: 'flex', justifyContent: 'center', zIndex: 10 }}>
          <div style={{ 
            background: 'var(--card-bg)', 
            padding: '1rem 2rem', 
            borderRadius: '50px', 
            boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}>
            {sentAt ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontWeight: 600, fontSize: '0.9rem' }}>
                <CheckCircle size={18} />
                Sent to All Parents ({parentsList.length}) on {new Date(sentAt).toLocaleDateString()}
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Report card not yet sent to parents.
              </div>
            )}

            <button
              onClick={handleSendToParent}
              disabled={isSending || parentsList.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                backgroundColor: "var(--primary)",
                color: "var(--primary-fg)",
                border: 'none',
                borderRadius: '25px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: (isSending || parentsList.length === 0) ? 'not-allowed' : 'pointer',
                opacity: (isSending || parentsList.length === 0) ? 0.7 : 1,
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)'
              }}
            >
              {isSending ? (
                <>Sending Emails...</>
              ) : (
                <>
                  <Send size={16} />
                  {sentAt ? `Send Again to All ${parentsList.length} Parents` : `Send to All ${parentsList.length} Parents`}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
