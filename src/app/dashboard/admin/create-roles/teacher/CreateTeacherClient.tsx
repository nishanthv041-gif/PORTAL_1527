"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../../dashboard.module.css";
import { createTeacherAction } from "../actions";
import BulkUpload from "../BulkUpload";

import { Subject, Class } from "@prisma/client";

export default function CreateTeacherClient({ subjects = [], classes = [] }: { subjects?: (Subject & { class: Class })[], classes?: Class[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

  const toggleSubject = (subjectId: string) => {
    if (selectedSubjects.includes(subjectId)) {
      setSelectedSubjects(selectedSubjects.filter(id => id !== subjectId));
    } else {
      setSelectedSubjects([...selectedSubjects, subjectId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!confirmed) {
      setError("Please confirm the information is correct.");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    formData.set("subjectIds", selectedSubjects.join(","));

    const result = await createTeacherAction(formData);

    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else {
      alert("Teacher created successfully!");
      router.push("/dashboard/admin/users");
    }
  };

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Create New Teacher</h1>
      
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '2rem', maxWidth: '800px' }}>
        {error && (
          <div style={{ background: 'var(--danger-bg)', color: "var(--danger)", padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--danger)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Personal Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Full Name *</label>
                <input required name="name" type="text" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Gender</label>
                <select name="gender" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Phone *</label>
                <input required name="phone" type="text" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
              </div>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Professional Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Qualification</label>
                <input name="qualification" type="text" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>CV / Resume (Optional)</label>
                <input name="resume" type="file" accept=".pdf,.doc,.docx" style={{ width: '100%', padding: '0.625rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', fontSize: '0.875rem' }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Additional Subjects</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
                  {subjects.map(s => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', background: 'var(--card-bg)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedSubjects.includes(s.id)}
                        onChange={() => toggleSubject(s.id)}
                      />
                      {s.name} ({s.class.name}-{s.class.section})
                    </label>
                  ))}
                  {subjects.length === 0 && <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No subjects available.</span>}
                </div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Class Teacher Of (Optional)</label>
                <select name="classTeacherId" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}>
                  <option value="">None</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name} - {c.section}</option>
                  ))}
                </select>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Assign this teacher as the Class Teacher for a specific class.</p>
              </div>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Account Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Official Email *</label>
                <input required name="email" type="email" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Temporary Password *</label>
                <input required name="password" type="password" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Google Email (Optional)</label>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Used for Phase 1 Google SSO verification.</p>
                <input name="googleEmail" type="email" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
              </div>
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                style={{ width: '1rem', height: '1rem' }}
              />
              <span style={{ fontSize: '0.875rem' }}>I confirm that all teacher information entered above is correct.</span>
            </label>
          </div>

          <button 
            type="submit" 
            disabled={!confirmed || isSubmitting}
            style={{ 
              padding: '0.75rem 1.5rem', 
              backgroundColor: confirmed && !isSubmitting ? 'var(--primary)' : '#9ca3af', 
              color: "var(--primary-fg)", 
              border: 'none', 
              borderRadius: '8px', 
              fontWeight: 500, 
              cursor: confirmed && !isSubmitting ? 'pointer' : 'not-allowed',
              marginTop: '1rem'
            }}
          >
            {isSubmitting ? "Creating..." : "Create Teacher"}
          </button>
        </form>
      </div>

      <BulkUpload type="teacher" />
    </div>
  );
}
