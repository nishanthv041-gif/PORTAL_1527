"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import styles from "../../../dashboard.module.css";
import { createParentStudentAction } from "@/backend/api/actions/dashboard/admin/create-roles/actions";
import BulkUpload from "../BulkUpload";

export default function ParentStudentWizard({ classes }: { classes: { id: string; name: string; section: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!confirmed) {
      setError("Please confirm the information is correct.");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const parentGoogleEmail = (formData.get("parentGoogleEmail") as string)?.trim().toLowerCase();
    if (parentGoogleEmail && !parentGoogleEmail.endsWith("@gmail.com") && !parentGoogleEmail.endsWith("@googlemail.com")) {
      setError("Sign In with Google Mail ID must be a valid Gmail account ending with @gmail.com.");
      setIsSubmitting(false);
      return;
    }

    const result = await createParentStudentAction(formData);

    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else {
      alert("Parent & Student created successfully!");
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
        <h1 className={styles.title} style={{ margin: 0 }}>Create Parent & Student</h1>
      </div>
      
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '2rem', maxWidth: '800px' }}>
        {error && (
          <div style={{ background: 'var(--danger-bg)', color: "var(--danger)", padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--danger)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Student Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '1rem' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Student Full Name *</label>
                <input required name="studentName" type="text" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Roll Number *</label>
                <input required name="rollNumber" type="text" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Admission Number *</label>
                <input required name="admissionNo" type="text" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Batch (e.g. 2023-2024)</label>
                <input name="batch" type="text" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} placeholder="Optional" />
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
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Class & Section *</label>
                <select required name="classId" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}>
                  <option value="">Select a class...</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name} - Section {c.section}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Hostel or Dayscholar *</label>
                <select required name="residenceType" defaultValue="DAYSCHOLAR" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}>
                  <option value="DAYSCHOLAR">Dayscholar</option>
                  <option value="HOSTEL">Hostel</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginTop: '1rem' }}>Parent Information & Account</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Parent Full Name *</label>
                <input required name="parentName" type="text" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Parent Phone *</label>
                <input required name="parentPhone" type="text" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Address</label>
                <input name="parentAddress" type="text" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>User ID *</label>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Used for manual login in the user ID space on the login page.</p>
                <input required name="parentEmail" type="email" placeholder="e.g. parent@school.com" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Password *</label>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Used for manual login with password on the login page.</p>
                <input required name="parentPassword" type="password" placeholder="Enter password" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Sign In with Google Mail ID *</label>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Exclusively used for &quot;Log in with Google&quot; OAuth SSO. Only valid Gmail addresses (@gmail.com) are accepted.</p>
                <input 
                  required
                  name="parentGoogleEmail" 
                  type="email" 
                  placeholder="e.g. parent@gmail.com"
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
              <span style={{ fontSize: '0.875rem' }}>I confirm that all parent and student information entered above is correct.</span>
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
            {isSubmitting ? "Creating..." : "Create Parent & Student"}
          </button>
        </form>
      </div>
      
      <BulkUpload type="student" classes={classes} />
    </div>
  );
}
