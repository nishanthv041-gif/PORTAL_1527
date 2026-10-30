"use client";

import { useState, useRef } from "react";
import { saveSystemSettingsBatchAction } from "@/backend/api/actions/dashboard/admin/settings/actions";
import { SystemSetting } from "@prisma/client";
import {
  Building2, Save, Loader2, CheckCircle2, Upload, AlertCircle, Image as ImageIcon,
  Phone, Mail, Globe, User, Calendar, MapPin
} from "lucide-react";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";
import styles from "./settings.module.css";

interface SettingsClientProps {
  initialSettings: SystemSetting[];
}

export default function SettingsClient({ initialSettings }: SettingsClientProps) {
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [settingsValues, setSettingsValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {
      SCHOOL_NAME: "Modern School Portal",
      SCHOOL_LOGO: "",
      SCHOOL_ADDRESS: "123 Education Lane, Knowledge Park",
      SCHOOL_CONTACT: "+1 (555) 019-2834",
      SCHOOL_EMAIL: "admin@schoolportal.edu",
      SCHOOL_WEBSITE: "https://schoolportal.edu",
      PRINCIPAL_NAME: "Dr. Eleanor Vance",
      ACADEMIC_YEAR: "2026-2027",
    };
    initialSettings.forEach((s) => {
      initial[s.key] = s.value;
    });
    return initial;
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleChange = (key: string, value: string) => {
    setSettingsValues((prev) => ({ ...prev, [key]: value }));
    setSaveSuccess(false);
    setErrorMessage(null);
  };

  const compressLogoImage = (imgFile: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (imgFile.type === "image/svg+xml") {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imgFile);
        return;
      }

      const img = new Image();
      const objectUrl = URL.createObjectURL(imgFile);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const maxDim = 256;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(imgFile);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        try {
          const webpData = canvas.toDataURL("image/webp", 0.8);
          if (webpData.startsWith("data:image/webp")) {
            resolve(webpData);
            return;
          }
        } catch {}
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Failed to load image for compression"));
      };
      img.src = objectUrl;
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (< 2MB)
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setErrorMessage("Logo image must be smaller than 2MB.");
      return;
    }

    // Validate type (PNG, JPG, SVG, WebP)
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setErrorMessage("Only PNG, JPG, SVG, and WebP image formats are supported.");
      return;
    }

    try {
      const compressedDataUrl = await compressLogoImage(file);
      handleChange("SCHOOL_LOGO", compressedDataUrl);
      setErrorMessage(null);
    } catch {
      setErrorMessage("Failed to process logo image. Please try another image.");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!settingsValues.SCHOOL_NAME?.trim()) {
      setErrorMessage("School Name cannot be empty.");
      return;
    }

    const confirmed = await confirm({
      title: "Save School Information?",
      message: "These changes will update school details across the entire portal immediately.",
      confirmText: "Save Changes",
      cancelText: "Cancel",
      variant: "primary",
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    setSaveSuccess(false);

    try {
      const batch = [
        { key: "SCHOOL_NAME", value: settingsValues.SCHOOL_NAME || "", category: "SCHOOL" },
        { key: "SCHOOL_LOGO", value: settingsValues.SCHOOL_LOGO || "", category: "SCHOOL" },
        { key: "SCHOOL_ADDRESS", value: settingsValues.SCHOOL_ADDRESS || "", category: "SCHOOL" },
        { key: "SCHOOL_CONTACT", value: settingsValues.SCHOOL_CONTACT || "", category: "SCHOOL" },
        { key: "SCHOOL_EMAIL", value: settingsValues.SCHOOL_EMAIL || "", category: "SCHOOL" },
        { key: "SCHOOL_WEBSITE", value: settingsValues.SCHOOL_WEBSITE || "", category: "SCHOOL" },
        { key: "PRINCIPAL_NAME", value: settingsValues.PRINCIPAL_NAME || "", category: "SCHOOL" },
        { key: "ACADEMIC_YEAR", value: settingsValues.ACADEMIC_YEAR || "", category: "SCHOOL" },
      ];

      const res = await saveSystemSettingsBatchAction(batch);
      if (res?.error) {
        setErrorMessage(res.error);
      } else {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      }
    } catch {
      setErrorMessage("Failed to save settings. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: "860px", width: "100%", margin: "0 auto" }}>
      <div
        style={{
          background: "var(--card-bg, #0f172a)",
          border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
          borderRadius: "16px",
          overflow: "hidden",
          boxShadow: "0 10px 30px -10px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.5rem 2rem",
            borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            background: "rgba(59, 130, 246, 0.05)",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "rgba(59, 130, 246, 0.15)",
              color: "#3b82f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Building2 size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary, #f8fafc)" }}>
              School Information
            </h2>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary, #94a3b8)" }}>
              Official school details displayed across report cards, headers, emails, and student records.
            </p>
          </div>
        </div>

        {/* Feedback Messages */}
        <div style={{ padding: "0 2rem", marginTop: errorMessage || saveSuccess ? "1.5rem" : 0 }}>
          {errorMessage && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.85rem 1rem",
                borderRadius: "8px",
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171",
                fontSize: "0.9rem",
              }}
            >
              <AlertCircle size={18} />
              <span>{errorMessage}</span>
            </div>
          )}

          {saveSuccess && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.85rem 1rem",
                borderRadius: "8px",
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#34d399",
                fontSize: "0.9rem",
              }}
            >
              <CheckCircle2 size={18} />
              <span>School information successfully updated and cached across the portal!</span>
            </div>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} style={{ padding: "2rem" }}>
          {/* Logo Section */}
          <div
            style={{
              padding: "1.5rem",
              background: "rgba(255, 255, 255, 0.02)",
              borderRadius: "12px",
              border: "1px dashed var(--border-color, rgba(255, 255, 255, 0.15))",
              marginBottom: "2rem",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "1.5rem",
            }}
          >
            <div
              style={{
                width: "90px",
                height: "90px",
                borderRadius: "12px",
                background: "rgba(0, 0, 0, 0.3)",
                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                position: "relative",
              }}
            >
              {settingsValues.SCHOOL_LOGO ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settingsValues.SCHOOL_LOGO}
                  alt="School Logo"
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              ) : (
                <ImageIcon size={36} style={{ color: "var(--text-secondary, #64748b)" }} />
              )}
            </div>

            <div style={{ flex: 1, minWidth: "240px" }}>
              <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-primary, #f8fafc)", marginBottom: "0.25rem" }}>
                School Logo
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary, #94a3b8)", marginBottom: "0.75rem" }}>
                Upload PNG, JPG, SVG, or WebP (max 2MB), or paste an image URL below.
              </div>

              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png, image/jpeg, image/jpg, image/svg+xml, image/webp"
                  onChange={handleLogoUpload}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 1rem",
                    background: "rgba(59, 130, 246, 0.15)",
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    color: "#60a5fa",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  <Upload size={16} />
                  <span>Upload Logo Image</span>
                </button>

                {settingsValues.SCHOOL_LOGO && (
                  <button
                    type="button"
                    onClick={() => handleChange("SCHOOL_LOGO", "")}
                    style={{
                      padding: "0.5rem 0.85rem",
                      background: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      color: "#f87171",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                    }}
                  >
                    Remove Logo
                  </button>
                )}
              </div>

              <div style={{ marginTop: "0.75rem" }}>
                <input
                  type="text"
                  placeholder="Or enter logo image URL (e.g., https://...)"
                  value={settingsValues.SCHOOL_LOGO || ""}
                  onChange={(e) => handleChange("SCHOOL_LOGO", e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.45rem 0.75rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                    background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                    color: "inherit",
                    fontSize: "0.82rem",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Form Fields Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
            {/* School Name */}
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.4rem" }}>
                School Name <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="text"
                required
                value={settingsValues.SCHOOL_NAME || ""}
                onChange={(e) => handleChange("SCHOOL_NAME", e.target.value)}
                placeholder="e.g. Modern School"
                style={{
                  width: "100%",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                  background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                  color: "inherit",
                  fontSize: "0.9rem",
                }}
              />
            </div>

            {/* Principal Name */}
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.4rem" }}>
                <User size={15} style={{ color: "#3b82f6" }} />
                <span>Principal Name</span>
              </label>
              <input
                type="text"
                value={settingsValues.PRINCIPAL_NAME || ""}
                onChange={(e) => handleChange("PRINCIPAL_NAME", e.target.value)}
                placeholder="e.g. Dr. Eleanor Vance"
                style={{
                  width: "100%",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                  background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                  color: "inherit",
                  fontSize: "0.9rem",
                }}
              />
            </div>

            {/* Contact / Phone */}
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.4rem" }}>
                <Phone size={15} style={{ color: "#3b82f6" }} />
                <span>Contact Phone</span>
              </label>
              <input
                type="text"
                value={settingsValues.SCHOOL_CONTACT || ""}
                onChange={(e) => handleChange("SCHOOL_CONTACT", e.target.value)}
                placeholder="e.g. +1 (555) 019-2834"
                style={{
                  width: "100%",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                  background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                  color: "inherit",
                  fontSize: "0.9rem",
                }}
              />
            </div>

            {/* Email */}
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.4rem" }}>
                <Mail size={15} style={{ color: "#3b82f6" }} />
                <span>School Email</span>
              </label>
              <input
                type="email"
                value={settingsValues.SCHOOL_EMAIL || ""}
                onChange={(e) => handleChange("SCHOOL_EMAIL", e.target.value)}
                placeholder="e.g. admin@schoolportal.edu"
                style={{
                  width: "100%",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                  background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                  color: "inherit",
                  fontSize: "0.9rem",
                }}
              />
            </div>

            {/* Website */}
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.4rem" }}>
                <Globe size={15} style={{ color: "#3b82f6" }} />
                <span>School Website</span>
              </label>
              <input
                type="url"
                value={settingsValues.SCHOOL_WEBSITE || ""}
                onChange={(e) => handleChange("SCHOOL_WEBSITE", e.target.value)}
                placeholder="e.g. https://schoolportal.edu"
                style={{
                  width: "100%",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                  background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                  color: "inherit",
                  fontSize: "0.9rem",
                }}
              />
            </div>

            {/* Academic Year */}
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.4rem" }}>
                <Calendar size={15} style={{ color: "#3b82f6" }} />
                <span>Academic Year Label</span>
              </label>
              <input
                type="text"
                value={settingsValues.ACADEMIC_YEAR || ""}
                onChange={(e) => handleChange("ACADEMIC_YEAR", e.target.value)}
                placeholder="e.g. 2026-2027"
                style={{
                  width: "100%",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                  background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                  color: "inherit",
                  fontSize: "0.9rem",
                }}
              />
            </div>
          </div>

          {/* Address */}
          <div style={{ marginTop: "1.5rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.4rem" }}>
              <MapPin size={15} style={{ color: "#3b82f6" }} />
              <span>School Address</span>
            </label>
            <textarea
              rows={3}
              value={settingsValues.SCHOOL_ADDRESS || ""}
              onChange={(e) => handleChange("SCHOOL_ADDRESS", e.target.value)}
              placeholder="e.g. 123 Education Lane, Knowledge Park, District 5"
              style={{
                width: "100%",
                padding: "0.65rem 0.85rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                color: "inherit",
                fontSize: "0.9rem",
                resize: "vertical",
              }}
            />
          </div>

          {/* Action Bar */}
          <div
            style={{
              marginTop: "2.5rem",
              paddingTop: "1.5rem",
              borderTop: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
              display: "flex",
              justifyContent: "flex-end",
              gap: "1rem",
            }}
          >
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.6rem",
                padding: "0.75rem 1.75rem",
                borderRadius: "10px",
                background: "var(--primary, #3b82f6)",
                color: "#ffffff",
                border: "none",
                fontWeight: 600,
                fontSize: "0.95rem",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                boxShadow: "0 4px 14px 0 rgba(59, 130, 246, 0.39)",
                opacity: isSubmitting ? 0.7 : 1,
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save size={18} />
                  <span>Save School Information</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
