"use client";

import { useState } from "react";
import { updateProfile } from "@/backend/api/actions/dashboard/teacher/settings/actions";
import { TextInput } from "@/frontend/components/ui/form";

export default function SettingsForm({
  userId,
  name,
  email,
  phone,
  qualification,
}: {
  userId: string;
  name: string;
  email: string;
  phone: string;
  qualification: string;
}) {
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
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        maxWidth: "520px",
      }}
    >
      <TextInput
        label="Full Name"
        name="name"
        type="text"
        defaultValue={name}
        required
      />

      <TextInput
        label="Email Address"
        type="email"
        defaultValue={email}
        disabled
        helperText="Email is managed by administration."
      />

      <TextInput
        label="Phone Number"
        name="phone"
        type="tel"
        defaultValue={phone}
      />

      {qualification !== undefined && (
        <TextInput
          label="Qualification"
          name="qualification"
          type="text"
          defaultValue={qualification}
        />
      )}

      <TextInput
        label="New Password"
        name="password"
        type="password"
        placeholder="Leave blank to keep current password"
      />

      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "0.75rem 1.5rem",
            backgroundColor: "var(--primary)",
            color: "var(--primary-fg, #ffffff)",
            border: "none",
            borderRadius: "10px",
            fontWeight: 600,
            fontSize: "0.9rem",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            transition: "opacity 0.15s ease",
          }}
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>

        {message && (
          <span
            style={{
              color: message.includes("success") ? "var(--success)" : "var(--danger)",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            {message}
          </span>
        )}
      </div>
    </form>
  );
}
