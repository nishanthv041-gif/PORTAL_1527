"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import styles from "../../../dashboard.module.css";
import { createTeacherAction } from "@/backend/api/actions/dashboard/admin/create-roles/actions";
import BulkUpload from "../BulkUpload";

import { Subject, Class } from "@prisma/client";

export default function CreateTeacherClient({ 
  subjects = [], 
  classes = [],
  allSchoolSubjects = []
}: { 
  subjects?: (Subject & { class: Class })[]; 
  classes?: Class[];
  allSchoolSubjects?: { name: string; code?: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [selectedMajor, setSelectedMajor] = useState<string>("");

  // Collect distinct subject majors from active school subjects + available subjects
  const subjectMajorsMap = new Map<string, string>();
  allSchoolSubjects.forEach(s => {
    if (s.name) subjectMajorsMap.set(s.name.trim().toUpperCase(), s.code || "");
  });
  subjects.forEach(s => {
    if (s.name && !subjectMajorsMap.has(s.name.trim().toUpperCase())) {
      subjectMajorsMap.set(s.name.trim().toUpperCase(), s.code || "");
    }
  });
  if (subjectMajorsMap.size === 0) {
    [
      { name: "MATHEMATICS", code: "MAT001" },
      { name: "SCIENCE", code: "SCI002" },
      { name: "ENGLISH", code: "ENG001" },
      { name: "SOCIAL SCIENCE", code: "SOC001" },
      { name: "TAMIL", code: "TAM001" },
      { name: "HINDI", code: "HIN001" },
      { name: "COMPUTER SCIENCE", code: "CS001" },
    ].forEach(m => subjectMajorsMap.set(m.name, m.code));
  }

  const availableMajors = Array.from(subjectMajorsMap.entries()).map(([name, code]) => ({
    name,
    code
  })).sort((a, b) => a.name.localeCompare(b.name));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!confirmed) {
      setError("Please confirm the information is correct.");
      return;
    }
    if (!selectedMajor) {
      setError("Please select a Subject Major for the teacher.");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    formData.set("subjectMajor", selectedMajor);

    const googleEmail = (formData.get("googleEmail") as string)?.trim().toLowerCase();
    if (googleEmail && !googleEmail.endsWith("@gmail.com") && !googleEmail.endsWith("@googlemail.com")) {
      setError("Sign In with Google Mail ID must be a valid Gmail account ending with @gmail.com.");
      setIsSubmitting(false);
      return;
    }

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <Link 
          href="/dashboard/admin/create-roles" 
          style={{ 
            padding: '0.5rem', 
            background: 'var(--card-bg)', 
            border: '1px solid var(--border-color)', 
            borderRadius: '8px', 
            color: 'inherit', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            textDecoration: 'none'
          }}
          title="Back to Create Roles"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className={styles.title} style={{ margin: 0 }}>Create New Teacher</h1>
      </div>
      
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '2rem', maxWidth: '800px' }}>
        {error && (
          <div style={{ background: 'var(--danger-bg)', color: "var(--danger)", padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--danger)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Personal Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '1rem' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Qualification</label>
                <input name="qualification" type="text" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>CV / Resume (Optional)</label>
                <input name="resume" type="file" accept=".pdf,.doc,.docx" style={{ width: '100%', padding: '0.625rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', fontSize: '0.875rem' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Subject Major *
                </label>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                  Select the teacher&apos;s subject major.
                </p>
                <select 
                  required
                  name="subjectMajor" 
                  value={selectedMajor}
                  onChange={(e) => setSelectedMajor(e.target.value)}
                  style={{ 
                    width: '100%', 
                    padding: '0.75rem', 
                    borderRadius: '8px', 
                    border: '1px solid var(--border-color)', 
                    background: 'transparent',
                    color: 'inherit',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="">Select Available Subject Major...</option>
                  {availableMajors.map(m => (
                    <option key={m.name} value={m.name}>
                      {m.name} {m.code ? `(${m.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>User ID *</label>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Used for manual login in the user ID space on the login page.</p>
                <input required name="email" type="email" placeholder="e.g. teacher@school.com" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Password *</label>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Used for manual login with password on the login page.</p>
                <input required name="password" type="password" placeholder="Enter password" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Sign In with Google Mail ID *</label>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Exclusively used for &quot;Log in with Google&quot; OAuth SSO. Only valid Gmail addresses (@gmail.com) are accepted.</p>
                <input 
                  required
                  name="googleEmail" 
                  type="email" 
                  placeholder="e.g. teacher@gmail.com"
                  pattern=".+@(gmail\.com|googlemail\.com)"
                  title="Please enter a valid Gmail address (@gmail.com)"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} 
                />
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
