"use client";

import { useState } from "react";
import { User, Briefcase } from "lucide-react";
import { createStaffAction } from "@/backend/api/actions/dashboard/admin/create-roles/staff/actions";
import { useRouter } from "next/navigation";

export default function CreateStaffClient() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const res = await createStaffAction(formData);
    
    if (res?.error) {
      alert(res.error);
    } else if (res?.success) {
      alert("Staff created successfully!");
      router.push("/dashboard/admin/users");
    }
    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '2rem', border: '1px solid var(--border-color)', display: 'grid', gap: '2rem' }}>
      
      {/* Account Info */}
      <div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <User size={20} style={{ color: 'var(--primary)' }} />
          Account Details
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Full Name *</label>
            <input required name="name" type="text" placeholder="e.g. John Doe" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Email Address *</label>
            <input required name="email" type="email" placeholder="e.g. john@school.com" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Password *</label>
            <input required name="password" type="password" placeholder="Min 6 characters" minLength={6} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
          </div>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)' }} />

      {/* Professional Info */}
      <div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Briefcase size={20} style={{ color: 'var(--primary)' }} />
          Professional Details
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Job Title *</label>
            <input required name="jobTitle" type="text" placeholder="e.g. Accountant, Librarian" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Phone Number (Optional)</label>
            <input name="phone" type="tel" placeholder="+1 234 567 890" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button 
          type="submit" 
          disabled={isSubmitting}
          style={{ padding: '0.75rem 2rem', backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.7 : 1 }}
        >
          {isSubmitting ? "Registering..." : "Register Staff Member"}
        </button>
      </div>

    </form>
  );
}
