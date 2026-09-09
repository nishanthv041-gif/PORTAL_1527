"use client";

import { useState } from "react";
import { updateProfile } from "./actions";

export default function SettingsForm({ userId, name, email, phone, qualification }: { userId: string, name: string, email: string, phone: string, qualification: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const formData = new FormData(e.currentTarget);
    formData.append("userId", userId);
    
    const result = await updateProfile(formData);
    
    if (result.success) {
      setMessage("Profile updated successfully!");
    } else {
      setMessage("Failed: " + result.error);
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "500px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>Full Name</label>
        <input
          name="name"
          type="text"
          defaultValue={name}
          required
          style={{ padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>Email (Read Only)</label>
        <input
          type="email"
          defaultValue={email}
          disabled
          style={{ padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)", opacity: 0.7 }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>Phone Number</label>
        <input
          name="phone"
          type="text"
          defaultValue={phone}
          style={{ padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>Qualification</label>
        <input
          name="qualification"
          type="text"
          defaultValue={qualification}
          style={{ padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>New Password (leave blank to keep current)</label>
        <input
          name="password"
          type="password"
          style={{ padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{
          padding: "0.75rem",
          backgroundColor: "var(--primary)", color: "var(--primary-fg)",
          border: "none",
          borderRadius: "6px",
          fontWeight: 500,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
          marginTop: "0.5rem"
        }}
      >
        {loading ? "Saving..." : "Save Changes"}
      </button>

      {message && (
        <span style={{ color: message.includes("success") ? "var(--success)" : "var(--danger)", fontSize: "0.875rem", textAlign: "left" }}>
          {message}
        </span>
      )}
    </form>
  );
}
