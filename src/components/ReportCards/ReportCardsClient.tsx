"use client";

import { useState } from "react";
import Link from "next/link";
import { User, Book, FileText, ChevronRight, Save, Edit } from "lucide-react";
import { useRouter } from "next/navigation";

type StudentData = {
  id: string;
  rollNumber: string;
  firstName: string;
  lastName: string;
};

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
  studentId: string;
  examId: string;
  subjectId: string;
  score: number;
  maxScore: number;
  remarks: string | null;
};

interface ReportCardsClientProps {
  classData: {
    id: string;
    name: string;
    section: string;
    students: StudentData[];
  };
  exams: ExamData[];
  subjects: SubjectData[];
  marks: MarkData[];
  baseUrl: string; // e.g. "/dashboard/admin/report-cards" or "/dashboard/teacher/report-cards"
}

export default function ReportCardsClient({ classData, exams, subjects, marks, baseUrl }: ReportCardsClientProps) {
  const router = useRouter();
  const [view, setView] = useState<"STUDENT" | "SUBJECT" | "CLASS">("STUDENT");
  const [selectedSubject, setSelectedSubject] = useState(subjects[0]?.id || "");
  const [selectedExam, setSelectedExam] = useState(exams[0]?.id || "");
  const [isEditing, setIsEditing] = useState(false);
  const [editedMarks, setEditedMarks] = useState<MarkData[]>(marks);
  const [isSaving, setIsSaving] = useState(false);

  const handleMarkChange = (studentId: string, examId: string, subjectId: string, field: string, value: string) => {
    setEditedMarks(prev => {
      const existing = prev.find(m => m.studentId === studentId && m.examId === examId && m.subjectId === subjectId);
      if (existing) {
        return prev.map(m => {
          if (m.studentId === studentId && m.examId === examId && m.subjectId === subjectId) {
            return { ...m, [field]: field === 'remarks' ? value : parseFloat(value) || 0 };
          }
          return m;
        });
      } else {
        return [...prev, {
          studentId, examId, subjectId,
          score: field === 'score' ? parseFloat(value) || 0 : 0,
          maxScore: field === 'maxScore' ? parseFloat(value) || 100 : 100, // default max 100
          remarks: field === 'remarks' ? value : null
        }];
      }
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/teacher/marks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marks: editedMarks })
      });
      if (res.ok) {
        setIsEditing(false);
        router.refresh();
      } else {
        alert("Failed to save marks");
      }
    } catch (error) {
      console.error(error);
      alert("Error saving marks");
    } finally {
      setIsSaving(false);
    }
  };

  const getMark = (studentId: string, examId: string, subjectId: string) => {
    return editedMarks.find(m => m.studentId === studentId && m.examId === examId && m.subjectId === subjectId);
  };

  // Render Student-Wise (Step 1)
  const renderStudentWise = () => (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {classData.students.map(student => (
        <Link 
          href={`${baseUrl}/${student.id}?classId=${classData.id}`} 
          key={student.id}
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            padding: '1rem 1.5rem', 
            background: 'var(--card-bg)', 
            border: '1px solid var(--border-color)', 
            borderRadius: '8px',
            textDecoration: 'none',
            color: 'inherit'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: "var(--primary)", color: "var(--primary-fg)", display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
              {student.firstName[0]}{student.lastName[0]}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{student.firstName} {student.lastName}</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Roll No: {student.rollNumber}</p>
            </div>
          </div>
          <ChevronRight size={20} color="var(--text-secondary)" />
        </Link>
      ))}
      {classData.students.length === 0 && <p style={{ textAlign: 'center', padding: '2rem' }}>No students found in this class.</p>}
    </div>
  );

  // Render Subject-Wise (Step 3)
  const renderSubjectWise = () => {
    if (!selectedSubject) return <p>No subjects available.</p>;
    const subject = subjects.find(s => s.id === selectedSubject)!;

    return (
      <div>
        <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <label style={{ fontWeight: 600 }}>Select Subject: </label>
            <select 
              value={selectedSubject} 
              onChange={e => setSelectedSubject(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}
            >
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem' }}>
            {isEditing ? (
              <button onClick={handleSave} disabled={isSaving} style={{ padding: '0.5rem 1rem', background: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Save size={16} /> {isSaving ? "Saving..." : "Save Marks"}
              </button>
            ) : (
              <button onClick={() => setIsEditing(true)} style={{ padding: '0.5rem 1rem', background: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit size={16} /> Edit Marks
              </button>
            )}
          </div>
        </div>

        <div style={{ overflowX: 'auto', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.02)' }}>
                <th style={{ padding: '1rem', fontWeight: 600 }}>Student</th>
                {exams.map(ex => (
                  <th key={ex.id} style={{ padding: '1rem', fontWeight: 600 }}>{ex.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {classData.students.map(student => (
                <tr key={student.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '1rem', fontWeight: 500 }}>
                    {student.firstName} {student.lastName} <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>({student.rollNumber})</span>
                  </td>
                  {exams.map(ex => {
                    const mark = getMark(student.id, ex.id, selectedSubject);
                    
                    if (isEditing) {
                      return (
                        <td key={ex.id} style={{ padding: '0.5rem' }}>
                          <input 
                            type="number" 
                            value={mark?.score ?? ""} 
                            onChange={(e) => handleMarkChange(student.id, ex.id, selectedSubject, 'score', e.target.value)}
                            style={{ width: '60px', padding: '0.25rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                          />
                        </td>
                      )
                    }

                    if (!mark) return <td key={ex.id} style={{ padding: '1rem', color: 'var(--text-secondary)' }}>-</td>;
                    if (mark.remarks === 'Absent') return <td key={ex.id} style={{ padding: '1rem', color: 'var(--danger)', fontWeight: 600 }}>Absent</td>;
                    const isFail = mark.score < subject.passMarks;
                    return (
                      <td key={ex.id} style={{ padding: '1rem', color: isFail ? 'var(--danger)' : 'inherit', fontWeight: isFail ? 600 : 'normal' }}>
                        {mark.score} <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>/ {mark.maxScore}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Render Class-Wise (Step 4)
  const renderClassWise = () => {
    if (!selectedExam) return <p>No exams available.</p>;

    return (
      <div>
        <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <label style={{ fontWeight: 600 }}>Select Exam: </label>
            <select 
              value={selectedExam} 
              onChange={e => setSelectedExam(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}
            >
              {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem' }}>
            {isEditing ? (
              <button onClick={handleSave} disabled={isSaving} style={{ padding: '0.5rem 1rem', background: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Save size={16} /> {isSaving ? "Saving..." : "Save Marks"}
              </button>
            ) : (
              <button onClick={() => setIsEditing(true)} style={{ padding: '0.5rem 1rem', background: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit size={16} /> Edit Marks
              </button>
            )}
          </div>
        </div>

        <div style={{ overflowX: 'auto', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.02)' }}>
                <th style={{ padding: '1rem', fontWeight: 600 }}>Student</th>
                {subjects.map(sub => (
                  <th key={sub.id} style={{ padding: '1rem', fontWeight: 600 }}>{sub.name}</th>
                ))}
                <th style={{ padding: '1rem', fontWeight: 600 }}>Total</th>
                <th style={{ padding: '1rem', fontWeight: 600 }}>%</th>
              </tr>
            </thead>
            <tbody>
              {classData.students.map(student => {
                let totalScore = 0;
                let totalMax = 0;
                const subjectCells = subjects.map(sub => {
                  const mark = getMark(student.id, selectedExam, sub.id);
                  
                  if (isEditing) {
                    return (
                      <td key={sub.id} style={{ padding: '0.5rem' }}>
                        <input 
                          type="number" 
                          value={mark?.score ?? ""} 
                          onChange={(e) => handleMarkChange(student.id, selectedExam, sub.id, 'score', e.target.value)}
                          style={{ width: '60px', padding: '0.25rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                        />
                      </td>
                    )
                  }

                  if (!mark) return <td key={sub.id} style={{ padding: '1rem', color: 'var(--text-secondary)' }}>-</td>;
                  if (mark.remarks === 'Absent') {
                    totalMax += sub.maxMarks;
                    return <td key={sub.id} style={{ padding: '1rem', color: 'var(--danger)', fontWeight: 600 }}>Absent</td>;
                  }
                  totalScore += mark.score;
                  totalMax += mark.maxScore;
                  const isFail = mark.score < sub.passMarks;
                  return (
                    <td key={sub.id} style={{ padding: '1rem', color: isFail ? 'var(--danger)' : 'inherit', fontWeight: isFail ? 600 : 'normal' }}>
                      {mark.score}
                    </td>
                  );
                });

                const percentage = totalMax > 0 ? ((totalScore / totalMax) * 100).toFixed(1) : "-";

                return (
                  <tr key={student.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem', fontWeight: 500 }}>
                      {student.firstName} {student.lastName} <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>({student.rollNumber})</span>
                    </td>
                    {subjectCells}
                    <td style={{ padding: '1rem', fontWeight: 600 }}>{totalScore} / {totalMax}</td>
                    <td style={{ padding: '1rem', fontWeight: 600 }}>{percentage}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '2rem' }}>
        <button
          onClick={() => setView("STUDENT")}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'transparent',
            border: 'none',
            borderBottom: view === "STUDENT" ? '2px solid var(--primary)' : '2px solid transparent',
            color: view === "STUDENT" ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <User size={18} /> Student-Wise
        </button>
        <button
          onClick={() => setView("SUBJECT")}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'transparent',
            border: 'none',
            borderBottom: view === "SUBJECT" ? '2px solid var(--primary)' : '2px solid transparent',
            color: view === "SUBJECT" ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <Book size={18} /> Subject-Wise
        </button>
        <button
          onClick={() => setView("CLASS")}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'transparent',
            border: 'none',
            borderBottom: view === "CLASS" ? '2px solid var(--primary)' : '2px solid transparent',
            color: view === "CLASS" ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <FileText size={18} /> Class-Wise
        </button>
      </div>

      {view === "STUDENT" && renderStudentWise()}
      {view === "SUBJECT" && renderSubjectWise()}
      {view === "CLASS" && renderClassWise()}
    </div>
  );
}
