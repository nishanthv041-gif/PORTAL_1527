"use client";

import { useState, FormEvent } from "react";
import { Shield } from "lucide-react";
import { createAdminAction } from "@/backend/api/actions/dashboard/admin/create-roles/actions";
import { useRouter } from "next/navigation";

export default function CreateAdminClient() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const res = await createAdminAction(formData);
    
    if (res?.error) {
      alert(res.error);
    } else if (res?.success) {
      alert("Admin created successfully!");
      router.push("/dashboard/admin/users");
    }
    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '2rem', border: '1px solid var(--border-color)', display: 'grid', gap: '2rem' }}>
      
      <div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Shield size={20} style={{ color: 'var(--danger)' }} />
          Admin Details
        </h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          Admins have full access to the portal. Since admins use Google OAuth to log in, you only need to provide their Name and Gmail ID. No password is required.
        </p>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Full Name *</label>
            <input required name="name" type="text" placeholder="e.g. Admin Name" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Gmail ID *</label>
            <input required name="email" type="email" placeholder="e.g. admin@gmail.com" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button 
          type="submit" 
          disabled={isSubmitting}
          style={{ padding: '0.75rem 2rem', backgroundColor: "var(--danger)", color: "white", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.7 : 1 }}
        >
          {isSubmitting ? "Registering..." : "Add Admin"}
        </button>
      </div>
    </form>
  );
}
