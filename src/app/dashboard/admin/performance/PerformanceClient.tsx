"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Award, TrendingUp, Filter } from "lucide-react";
import { Class, Exam } from "@prisma/client";

type TopPerformer = { name: string; rollNo: string; percentage: number };

export default function PerformanceClient({ 
  pieData,
  overviewChartData,
  stats,
  topPerformers,
  classes,
  exams,
  initialClassId,
  initialExamId
}: { 
  pieData: { name: string, value: number, color: string }[];
  overviewChartData: { name: string, PassPercent: number }[];
  stats: { average: string, highest: number, lowest: number, passPercent: string, failPercent: string };
  topPerformers: TopPerformer[];
  classes: Class[];
  exams: Exam[];
  initialClassId: string;
  initialExamId: string;
}) {
  const router = useRouter();
  const [classId, setClassId] = useState(initialClassId);
  const [examId, setExamId] = useState(initialExamId);

  const handleFilter = () => {
    let url = `/dashboard/admin/performance?`;
    if (classId) url += `classId=${classId}&`;
    if (examId) url += `examId=${examId}&`;
    router.push(url);
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', alignItems: 'start' }}>
      
      {/* Charts & Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Filters */}
        <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Class</label>
            <select value={classId} onChange={e => setClassId(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}>
              <option value="">All Classes (Overview)</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name} - {c.section}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Exam / Term</label>
            <select value={examId} onChange={e => setExamId(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}>
              <option value="">All Exams</option>
              {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <button onClick={handleFilter} style={{ padding: '0.75rem 1.5rem', background: "var(--primary)", color: "var(--primary-fg)", borderRadius: '8px', border: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <Filter size={18} /> Apply
          </button>
        </div>

        {classId ? (
          <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Class Performance (Grade Distribution)</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              {/* Pie Chart */}
              <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} label>
                      {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Stats Panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Average Score</span>
                  <span style={{ fontWeight: 600 }}>{stats.average}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Highest Score</span>
                  <span style={{ fontWeight: 600, color: "var(--success)" }}>{stats.highest}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Lowest Score</span>
                  <span style={{ fontWeight: 600, color: "var(--danger)" }}>{stats.lowest}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--success-bg)', color: 'var(--success)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{stats.passPercent}%</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Pass Rate</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{stats.failPercent}%</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Fail Rate</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>School Overview (Pass % by Class)</h2>
            <div style={{ height: 400, width: '100%' }}>
              {overviewChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overviewChartData} margin={{ top: 20, right: 30, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} angle={-45} textAnchor="end" />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="PassPercent" fill="var(--primary)" radius={[4, 4, 0, 0]} name="Pass %" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                  No data available for overview.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
        


      {/* Top Performers */}
      <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Award color="var(--warning)" size={24} /> Top Performers
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {topPerformers.map((student, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingBottom: '1rem', borderBottom: index < topPerformers.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
              <div style={{ 
                width: '32px', 
                height: '32px', 
                borderRadius: '50%', 
                background: index === 0 ? 'var(--warning-bg)' : index === 1 ? "var(--border-color)" : index === 2 ? 'var(--danger-bg)' : 'var(--primary-bg)', 
                color: index === 0 ? 'var(--warning)' : index === 1 ? "var(--foreground)" : index === 2 ? 'var(--danger)' : 'var(--primary)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontWeight: 600,
                fontSize: '0.875rem'
              }}>
                {index + 1}
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ fontWeight: 600, margin: 0 }}>{student.name}</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, marginTop: '0.125rem' }}>Roll No: {student.rollNo}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: "var(--success)", fontWeight: 600, fontSize: '0.875rem' }}>
                <TrendingUp size={14} />
                {student.percentage.toFixed(1)}%
              </div>
            </div>
          ))}

          {topPerformers.length === 0 && (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem 0' }}>No top performers data available.</p>
          )}
        </div>
      </div>
    </div>
  );
}
