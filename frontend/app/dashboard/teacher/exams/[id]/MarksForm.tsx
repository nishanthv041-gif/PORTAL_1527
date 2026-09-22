"use client";

import { useState } from "react";
import { saveMarks } from "@/backend/api/actions/dashboard/teacher/exams/[id]/actions";

type ClassData = {
  students: { id: string; firstName: string; lastName: string; rollNumber: string }[];
  subjects: { id: string; name: string; passMarks: number; maxMarks: number }[];
};

type ExamData = {
  id: string;
  marks: { studentId: string; subjectId: string; score: number; maxScore: number; remarks: string | null }[];
};

export default function MarksForm({ exam, classData }: { exam: ExamData; classData: ClassData }) {
  const [subjectId, setSubjectId] = useState(classData.subjects[0]?.id || "");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [absentees, setAbsentees] = useState<Record<string, boolean>>({});
  const [maxScore, setMaxScore] = useState(classData.subjects[0]?.maxMarks?.toString() || "100");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const selectedSubject = classData.subjects.find(s => s.id === subjectId);
  const passMarks = selectedSubject?.passMarks || 35;

  const computeGrade = (score: number, max: number) => {
    if (score < passMarks) return "F";
    const percent = (score / max) * 100;
    if (percent >= 90) return "A+";
    if (percent >= 80) return "A";
    if (percent >= 70) return "B";
    if (percent >= 60) return "C";
    if (percent >= 50) return "D";
    return "E";
  };

  // Populate existing scores when subject changes
  const handleSubjectChange = (newSubjectId: string) => {
    setSubjectId(newSubjectId);
    const newScores: Record<string, string> = {};
    const newAbsentees: Record<string, boolean> = {};
    const subject = classData.subjects.find(s => s.id === newSubjectId);
    let currentMaxScore = subject?.maxMarks?.toString() || "100";
    
    exam.marks.forEach(m => {
      if (m.subjectId === newSubjectId) {
        if (m.remarks === 'Absent') {
          newAbsentees[m.studentId] = true;
          newScores[m.studentId] = "0";
        } else {
          newScores[m.studentId] = m.score.toString();
        }
        currentMaxScore = m.maxScore.toString();
      }
    });
    
    setScores(newScores);
    setAbsentees(newAbsentees);
    setMaxScore(currentMaxScore);
    setMessage("");
  };

  // Run on mount
  if (Object.keys(scores).length === 0 && classData.subjects[0]) {
    handleSubjectChange(classData.subjects[0].id);
  }

  const handleScoreChange = (studentId: string, value: string) => {
    const num = parseFloat(value);
    const max = parseFloat(maxScore);
    if (!isNaN(num) && num > max) {
      alert(`Score cannot exceed max score of ${max}`);
      return;
    }
    if (!isNaN(num) && num < 0) {
      alert("Score cannot be negative");
      return;
    }
    setScores({ ...scores, [studentId]: value });
  };

  const toggleAbsent = (studentId: string) => {
    const isAbsent = !absentees[studentId];
    setAbsentees({ ...absentees, [studentId]: isAbsent });
    if (isAbsent) {
      setScores({ ...scores, [studentId]: "0" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId) return;

    setLoading(true);
    setMessage("");

    const data = classData.students.map((s) => ({
      studentId: s.id,
      score: parseFloat(scores[s.id] || "0"),
      maxScore: parseFloat(maxScore),
      remarks: absentees[s.id] ? "Absent" : null
    }));

    const result = await saveMarks(exam.id, subjectId, data);
    
    if (result.success) {
      setMessage("Marks saved successfully!");
    } else {
      setMessage("Failed to save marks: " + result.error);
    }
    setLoading(false);
  };

  if (!classData.subjects.length) {
    return <p>This class has no subjects assigned.</p>;
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>Select Subject</label>
          <select
            value={subjectId}
            onChange={(e) => handleSubjectChange(e.target.value)}
            style={{ padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
          >
            {classData.subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>Max Score</label>
          <input
            type="number"
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
            style={{ padding: "0.5rem", width: "100px", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
          />
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", backgroundColor: "rgba(0,0,0,0.02)" }}>
              <th style={{ padding: "1rem", fontWeight: 600 }}>Roll No</th>
              <th style={{ padding: "1rem", fontWeight: 600 }}>Student Name</th>
              <th style={{ padding: "1rem", fontWeight: 600 }}>Absent</th>
              <th style={{ padding: "1rem", fontWeight: 600 }}>Score</th>
              <th style={{ padding: "1rem", fontWeight: 600 }}>Grade (Auto)</th>
            </tr>
          </thead>
          <tbody>
            {classData.students.map((student) => {
              const isAbsent = absentees[student.id];
              const scoreVal = parseFloat(scores[student.id] || "0");
              const grade = isAbsent ? "F" : computeGrade(scoreVal, parseFloat(maxScore));
              const isFail = !isAbsent && scoreVal < passMarks;

              return (
                <tr key={student.id} style={{ borderBottom: "1px solid var(--border)", backgroundColor: isAbsent ? "rgba(239,68,68,0.05)" : isFail ? "rgba(245,158,11,0.05)" : "transparent" }}>
                  <td style={{ padding: "1rem" }}>{student.rollNumber}</td>
                  <td style={{ padding: "1rem", fontWeight: 500 }}>{student.firstName} {student.lastName}</td>
                  <td style={{ padding: "1rem", textAlign: "center" }}>
                    <input 
                      type="checkbox" 
                      checked={!!isAbsent}
                      onChange={() => toggleAbsent(student.id)}
                      style={{ width: "1.2rem", height: "1.2rem", cursor: "pointer" }}
                    />
                  </td>
                  <td style={{ padding: "1rem" }}>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max={maxScore}
                      value={scores[student.id] || ""}
                      onChange={(e) => handleScoreChange(student.id, e.target.value)}
                      placeholder="Enter score"
                      disabled={isAbsent}
                      style={{ 
                        padding: "0.5rem", 
                        borderRadius: "6px", 
                        border: "1px solid var(--border)",
                        backgroundColor: isAbsent ? "rgba(0,0,0,0.05)" : "var(--background)",
                        color: "var(--foreground)",
                        width: "120px",
                        fontWeight: 500
                      }}
                    />
                  </td>
                  <td style={{ padding: "1rem" }}>
                    {isAbsent ? (
                      <span style={{ color: "var(--danger)", fontWeight: 600 }}>ABSENT</span>
                    ) : (
                      <span style={{ 
                        fontWeight: 600, 
                        color: isFail ? "var(--danger)" : grade.startsWith("A") ? "var(--success)" : "var(--foreground)",
                        padding: "0.25rem 0.5rem",
                        backgroundColor: isFail ? "var(--danger-bg)" : grade.startsWith("A") ? "var(--success-bg)" : "rgba(0,0,0,0.05)",
                        borderRadius: "4px"
                      }}>
                        {grade}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        
        {classData.students.length === 0 && (
          <p style={{ padding: "1rem", textAlign: "center" }}>No students found in this class.</p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <button
          type="submit"
          disabled={loading || classData.students.length === 0}
          style={{
            padding: "0.75rem 1.5rem",
            backgroundColor: "var(--primary)", color: "var(--primary-fg)",
            border: "none",
            borderRadius: "6px",
            fontWeight: 500,
            cursor: loading || classData.students.length === 0 ? "not-allowed" : "pointer",
            opacity: loading || classData.students.length === 0 ? 0.7 : 1
          }}
        >
          {loading ? "Saving..." : "Save Marks"}
        </button>
        {message && (
          <span style={{ color: message.includes("success") ? "var(--success)" : "var(--danger)", fontSize: "0.875rem" }}>
            {message}
          </span>
        )}
      </div>
    </form>
  );
}
