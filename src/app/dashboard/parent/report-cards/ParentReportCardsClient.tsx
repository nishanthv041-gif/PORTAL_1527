"use client";

import { useState } from "react";
import { Download, CheckCircle, Eye } from "lucide-react";
import { useRouter } from "next/navigation";

type ReportCardData = {
  id: string;
  totalMarks: number;
  percentage: number;
  grade: string;
  remarks: string | null;
  parentVerified: boolean;
  exam: {
    id: string;
    name: string;
    date: Date;
  };
  studentId: string;
};

export default function ParentReportCardsClient({ reportCards }: { reportCards: ReportCardData[] }) {
  const router = useRouter();
  const [verifying, setVerifying] = useState<string | null>(null);

  const handleVerify = async (reportCardId: string) => {
    setVerifying(reportCardId);
    try {
      const res = await fetch('/api/parent/report-cards/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportCardId })
      });
      if (res.ok) {
        router.refresh();
      } else {
        alert("Failed to verify report card");
      }
    } catch (error) {
      console.error(error);
      alert("Error verifying report card");
    } finally {
      setVerifying(null);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '1.5rem', marginTop: '2rem' }}>
      {reportCards.length === 0 && (
        <p style={{ textAlign: 'center', opacity: 0.7, padding: '2rem' }}>No published report cards available.</p>
      )}
      
      {reportCards.map((rc) => (
        <div key={rc.id} style={{ 
          background: 'var(--card-bg)', 
          border: '1px solid var(--border-color)', 
          borderRadius: '12px', 
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{rc.exam.name}</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Date: {new Date(rc.exam.date).toLocaleDateString()}
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <a 
                href={`/api/pdf/report-card?studentId=${rc.studentId}&examId=${rc.exam.id}&download=false`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '0.5rem 1rem',
                  background: 'var(--primary-bg)',
                  color: 'var(--primary)',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 500,
                  fontSize: '0.875rem'
                }}
              >
                <Eye size={16} /> View PDF
              </a>
              <a 
                href={`/api/pdf/report-card?studentId=${rc.studentId}&examId=${rc.exam.id}&download=true`}
                style={{
                  padding: '0.5rem 1rem',
                  background: "var(--primary)", color: "var(--primary-fg)",
                  borderRadius: '8px',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 500,
                  fontSize: '0.875rem'
                }}
              >
                <Download size={16} /> Download PDF
              </a>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
            <div>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Marks</p>
              <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{rc.totalMarks}</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Percentage</p>
              <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{rc.percentage.toFixed(2)}%</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Grade</p>
              <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--primary)' }}>{rc.grade}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              {rc.parentVerified ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontWeight: 600, padding: '0.5rem 1rem', background: 'var(--success-bg)', borderRadius: '8px' }}>
                  <CheckCircle size={18} /> Verified
                </span>
              ) : (
                <button 
                  onClick={() => handleVerify(rc.id)}
                  disabled={verifying === rc.id}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'var(--warning)',
                    color: "var(--primary-fg)",
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {verifying === rc.id ? "Verifying..." : "Verify Report Card"}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
