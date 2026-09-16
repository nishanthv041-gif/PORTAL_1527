"use client";

import { useState } from "react";
import { Book, Eye, EyeOff, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { toggleExamPublishAction } from "@/backend/actions/dashboard/admin/exams/actions";
import { Exam, Class, Student, Subject, Mark, ExamRequest, Teacher, User } from "@prisma/client";
import { BarChart, Bar, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { acceptExamRequest, declineExamRequest } from "@/backend/actions/dashboard/admin/exams/actions";

type ExamWithRelations = Exam & {
  class: Class & { students: Student[], subjects: Subject[] };
  marks: Mark[];
};

type ExamRequestWithRelations = ExamRequest & {
  class: Class;
  subject: Subject;
  teacher: Teacher & { user: User };
};

export default function ExamsClient({ exams, examRequests }: { exams: ExamWithRelations[], examRequests: ExamRequestWithRelations[] }) {
  const [selectedExam, setSelectedExam] = useState<string | null>(null);

  const togglePublish = async (examId: string, currentStatus: boolean) => {
    const res = await toggleExamPublishAction(examId, !currentStatus);
    if (res.error) {
      alert(res.error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {examRequests && examRequests.length > 0 && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--warning)', borderRadius: '12px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--warning)' }}>
            <AlertTriangle size={20} /> Pending Exam Requests ({examRequests.length})
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {examRequests.map((req) => (
              <div key={req.id} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--background)' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{req.subject.name} Exam</h4>
                <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.8 }}>{req.class.name} - {req.class.section}</p>
                <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.5rem' }}>Requested by: {req.teacher.user.name}</p>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', marginBottom: '1rem' }}>
                  <span style={{ background: 'rgba(0,0,0,0.05)', padding: '2px 6px', borderRadius: '4px' }}>Date: {new Date(req.date).toLocaleDateString()}</span>
                  <span style={{ background: 'rgba(0,0,0,0.05)', padding: '2px 6px', borderRadius: '4px' }}>Time: {req.startTime} - {req.endTime}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    onClick={async () => {
                      if (confirm("Approve this exam request?")) {
                        const res = await acceptExamRequest(req.id);
                        if (res.error) alert(res.error);
                      }
                    }}
                    style={{ flex: 1, padding: '0.5rem', background: 'var(--success-bg)', color: 'var(--success)', border: 'none', borderRadius: '6px', fontWeight: 500, cursor: 'pointer' }}
                  >
                    Approve
                  </button>
                  <button 
                    onClick={async () => {
                      const reason = prompt("Enter reason for declining:");
                      if (reason !== null) {
                        const res = await declineExamRequest(req.id, reason || "No reason provided");
                        if (res.error) alert(res.error);
                      }
                    }}
                    style={{ flex: 1, padding: '0.5rem', background: 'var(--danger-bg)', color: 'var(--danger)', border: 'none', borderRadius: '6px', fontWeight: 500, cursor: 'pointer' }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
        
        {/* Exams List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {exams.map(exam => {
            const isSelected = selectedExam === exam.id;
            return (
              <div 
                key={exam.id} 
                onClick={() => setSelectedExam(exam.id)}
              style={{ 
                background: isSelected ? 'rgba(79, 70, 229, 0.05)' : 'var(--card-bg)', 
                border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border-color)', 
                borderRadius: '12px', 
                padding: '1.5rem', 
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{exam.name}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    {exam.class.name} - {exam.class.section} • {new Date(exam.date).toLocaleDateString()}
                  </p>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); togglePublish(exam.id, exam.isPublished); }}
                  style={{ 
                    background: exam.isPublished ? 'var(--success-bg)' : 'rgba(107, 114, 128, 0.1)', 
                    color: exam.isPublished ? "var(--success)" : "var(--text-secondary)", 
                    border: 'none', 
                    padding: '0.5rem 0.75rem', 
                    borderRadius: '6px', 
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    cursor: 'pointer'
                  }}
                >
                  {exam.isPublished ? <><Eye size={14} /> Published</> : <><EyeOff size={14} /> Draft</>}
                </button>
              </div>
            </div>
          );
        })}
        {exams.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px' }}>
            <p>No exams found.</p>
          </div>
        )}
      </div>

      {/* Selected Exam Details */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem', position: 'sticky', top: '2rem' }}>
        {!selectedExam ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <Book size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
            <p>Select an exam to view marks entry status.</p>
          </div>
        ) : (
          (() => {
            const exam = exams.find(e => e.id === selectedExam);
            if (!exam) return null;
            const totalStudents = exam.class.students.length;
            
            return (
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                  {exam.name} Status
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {exam.class.subjects.map((subj) => {
                    const marksEnteredCount = exam.marks.filter((m) => m.subjectId === subj.id).length;
                    const isComplete = totalStudents > 0 && marksEnteredCount >= totalStudents;
                    const percentComplete = totalStudents > 0 ? (marksEnteredCount / totalStudents) * 100 : 0;

                    return (
                      <div key={subj.id} style={{ padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: 500 }}>{subj.name}</span>
                          <span style={{ fontSize: '0.875rem', color: isComplete ? "var(--success)" : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            {isComplete ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                            {marksEnteredCount} / {totalStudents} entered
                          </span>
                        </div>
                        
                        {/* Progress Bar */}
                        <div style={{ width: '100%', height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem' }}>
                          <div style={{ width: `${percentComplete}%`, height: '100%', background: isComplete ? "var(--success)" : 'var(--primary)', transition: 'width 0.3s ease' }} />
                        </div>

                        {/* Analytics (if any marks entered) */}
                        {marksEnteredCount > 0 && (() => {
                          const subjMarks = exam.marks.filter(m => m.subjectId === subj.id);
                          
                          let totalScore = 0;
                          let maxS = 0;
                          let minS = 999999;
                          let passes = 0;
                          const failingStudents: string[] = [];

                          subjMarks.forEach(m => {
                            if (m.remarks === 'Absent') return;
                            totalScore += m.score;
                            if (m.score > maxS) maxS = m.score;
                            if (m.score < minS) minS = m.score;
                            if (m.score >= subj.passMarks) passes++;
                            else failingStudents.push(m.studentId);
                          });

                          const validMarks = subjMarks.filter(m => m.remarks !== 'Absent');
                          if (validMarks.length === 0) return null;

                          const avg = totalScore / validMarks.length;
                          const passPercent = (passes / validMarks.length) * 100;
                          
                          // Grade Dist
                          let a = 0, b = 0, c = 0, d = 0, f = 0;
                          validMarks.forEach(m => {
                            const p = (m.score / m.maxScore) * 100;
                            if (m.score < subj.passMarks) f++;
                            else if (p >= 80) a++;
                            else if (p >= 70) b++;
                            else if (p >= 60) c++;
                            else d++;
                          });
                          const distData = [
                            { name: 'A', count: a, color: "var(--success)" },
                            { name: 'B', count: b, color: "var(--primary)" },
                            { name: 'C', count: c, color: '#8b5cf6' },
                            { name: 'D', count: d, color: "var(--warning)" },
                            { name: 'F', count: f, color: "var(--danger)" },
                          ];

                          return (
                            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
                                <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Avg</div><div style={{ fontWeight: 600 }}>{avg.toFixed(1)}</div></div>
                                <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.75rem', opacity: 0.7 }}>High</div><div style={{ fontWeight: 600, color: "var(--success)" }}>{maxS}</div></div>
                                <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Low</div><div style={{ fontWeight: 600, color: "var(--danger)" }}>{minS}</div></div>
                                <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Pass %</div><div style={{ fontWeight: 600 }}>{passPercent.toFixed(0)}%</div></div>
                              </div>
                              
                              <div style={{ height: '100px', width: '100%', marginBottom: '1rem' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={distData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} cursor={{ fill: 'transparent' }} />
                                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                      {distData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                      ))}
                                    </Bar>
                                  </BarChart>
                                </ResponsiveContainer>
                                <div style={{ display: 'flex', justifyContent: 'space-around', fontSize: '0.75rem', opacity: 0.7 }}>
                                  <span>A</span><span>B</span><span>C</span><span>D</span><span>F</span>
                                </div>
                              </div>

                              {failingStudents.length > 0 && (
                                <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                                    <AlertTriangle size={14} /> {failingStudents.length} Students At Risk (Retest)
                                  </div>
                                  <div style={{ opacity: 0.8 }}>
                                    {failingStudents.map(fsId => {
                                      const stu = exam.class.students.find(s => s.id === fsId);
                                      return stu ? `${stu.firstName} ${stu.lastName}` : '';
                                    }).filter(Boolean).join(', ')}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                  {exam.class.subjects.length === 0 && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center' }}>No subjects linked to this class.</p>
                  )}
                </div>
              </div>
            );
          })()
        )}
      </div>
    </div>
    </div>
  );
}
