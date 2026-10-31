"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  X, User, Mail, Phone, BookOpen, GraduationCap, Calendar, Shield, Key, Eye, EyeOff,
  Copy, Check, AlertTriangle, Trash2, CheckCircle2, XCircle, Loader2, Link2
} from "lucide-react";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";
import {
  createTeacherAction,
  updateTeacherAction,
  toggleTeacherStatusAction,
  deleteTeacherPermanentlyAction
} from "@/backend/api/actions/dashboard/admin/teachers/teacherManagementActions";

export interface TeacherData {
  id: string;
  userId: string;
  phone: string | null;
  alternatePhone?: string | null;
  qualification: string | null;
  joinDate: string | Date | null;
  resumeUrl: string | null;
  isActive: boolean;
  maxPeriodsPerDay: number;
  maxPeriodsPerWeek: number;
  user: {
    id: string;
    name: string;
    email: string;
    googleEmail?: string | null;
    googleEmailVerified?: boolean;
    status: string;
  };
  classes: Array<{ id: string; name: string; section: string }>;
  subjects: Array<{ id: string; name: string; code: string }>;
  classTeacherOf?: { id: string; name: string; section: string } | null;
}

interface TeacherEditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  teacher: TeacherData | null; // null means "Add Teacher"
  allClasses: Array<{ id: string; name: string; section: string }>;
  allSubjects: Array<{ id: string; name: string; code: string }>;
  onSuccess: () => void;
}

export default function TeacherEditDrawer({
  isOpen,
  onClose,
  teacher,
  allClasses,
  allSubjects,
  onSuccess
}: TeacherEditDrawerProps) {
  const confirm = useConfirm();
  const isAddMode = !teacher;

  const [activeTab, setActiveTab] = useState<"PROFILE" | "TEACHING" | "ACCESS">("PROFILE");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [googleEmail, setGoogleEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [qualification, setQualification] = useState("");
  const [joinDate, setJoinDate] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [maxPeriodsPerDay, setMaxPeriodsPerDay] = useState(6);
  const [maxPeriodsPerWeek, setMaxPeriodsPerWeek] = useState(30);
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");

  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [classTeacherOfId, setClassTeacherOfId] = useState<string>("");

  // Password State
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Initialize or reset form on open/change
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setPassword("");
    setShowPassword(false);

    if (teacher) {
      setName(teacher.user.name || "");
      setEmail(teacher.user.email || "");
      setGoogleEmail(teacher.user.googleEmail || "");
      setPhone(teacher.phone || "");
      setAlternatePhone(teacher.alternatePhone || "");
      setQualification(teacher.qualification || "");
      setJoinDate(teacher.joinDate ? new Date(teacher.joinDate).toISOString().split("T")[0] : "");
      setResumeUrl(teacher.resumeUrl || "");
      setMaxPeriodsPerDay(teacher.maxPeriodsPerDay || 6);
      setMaxPeriodsPerWeek(teacher.maxPeriodsPerWeek || 30);
      setStatus(teacher.isActive ? "ACTIVE" : "INACTIVE");
      setSelectedClassIds(teacher.classes.map(c => c.id));
      setSelectedSubjectIds(teacher.subjects.map(s => s.id));
      setClassTeacherOfId(teacher.classTeacherOf?.id || "");
    } else {
      setName("");
      setEmail("");
      setGoogleEmail("");
      setPhone("");
      setAlternatePhone("");
      setQualification("");
      setJoinDate(new Date().toISOString().split("T")[0]);
      setResumeUrl("");
      setMaxPeriodsPerDay(6);
      setMaxPeriodsPerWeek(30);
      setStatus("ACTIVE");
      setSelectedClassIds([]);
      setSelectedSubjectIds([]);
      setClassTeacherOfId("");
    }
  }, [isOpen, teacher]);

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  useEffect(() => {
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: "None", color: "#64748b" };
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 1) return { score: 1, label: "Weak", color: "#ef4444" };
    if (score === 2) return { score: 2, label: "Fair", color: "#f59e0b" };
    if (score === 3) return { score: 3, label: "Good", color: "#3b82f6" };
    return { score: 4, label: "Strong", color: "#10b981" };
  };

  const strength = getPasswordStrength(password);

  const generateStrongPassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let gen = "";
    for (let i = 0; i < 12; i++) {
      gen += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(gen);
    setShowPassword(true);
    navigator.clipboard?.writeText(gen);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2500);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!name.trim()) {
      setErrorMsg("Teacher name is required.");
      return;
    }
    if (!email.trim()) {
      setErrorMsg("Email / username is required.");
      return;
    }

    if (password && password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }

    // Confirm if password or status is changing in edit mode
    if (!isAddMode) {
      const isCredentialUpdate = Boolean(password) || (email.toLowerCase() !== teacher.user.email.toLowerCase()) || (status !== (teacher.isActive ? "ACTIVE" : "INACTIVE"));
      if (isCredentialUpdate) {
        const ok = await confirm({
          title: "Update Teacher Credentials?",
          message: "Updating login credentials or status will immediately revoke all current active sessions for this teacher.",
          confirmText: "Update & Revoke Sessions",
          cancelText: "Cancel",
          variant: "warning",
        });
        if (!ok) return;
      }
    }

    setIsSubmitting(true);

    try {
      if (isAddMode) {
        const res = await createTeacherAction({
          name: name.trim(),
          email: email.trim(),
          googleEmail: googleEmail.trim() || undefined,
          password: password || undefined,
          phone: phone.trim() || undefined,
          alternatePhone: alternatePhone.trim() || undefined,
          qualification: qualification.trim() || undefined,
          joinDate: joinDate || undefined,
          resumeUrl: resumeUrl.trim() || undefined,
          maxPeriodsPerDay,
          maxPeriodsPerWeek,
          classIds: selectedClassIds,
          subjectIds: selectedSubjectIds,
          classTeacherOfId: classTeacherOfId || undefined,
          status,
        });

        if (res.error) {
          setErrorMsg(res.error);
        } else {
          setSuccessMsg("Teacher created successfully!");
          setTimeout(() => {
            onSuccess();
            onClose();
          }, 800);
        }
      } else {
        const res = await updateTeacherAction({
          teacherId: teacher.id,
          name: name.trim(),
          email: email.trim(),
          googleEmail: googleEmail.trim() || undefined,
          password: password || undefined,
          phone: phone.trim() || undefined,
          alternatePhone: alternatePhone.trim() || undefined,
          qualification: qualification.trim() || undefined,
          joinDate: joinDate || undefined,
          resumeUrl: resumeUrl.trim() || undefined,
          maxPeriodsPerDay,
          maxPeriodsPerWeek,
          classIds: selectedClassIds,
          subjectIds: selectedSubjectIds,
          classTeacherOfId: classTeacherOfId || undefined,
          status,
        });

        if (res.error) {
          setErrorMsg(res.error);
        } else {
          setSuccessMsg("Teacher updated successfully!");
          setTimeout(() => {
            onSuccess();
          }, 600);
        }
      }
    } catch {
      setErrorMsg("An unexpected error occurred while saving.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!teacher) return;
    const actionLabel = teacher.isActive ? "Deactivate" : "Activate";
    const ok = await confirm({
      title: `${actionLabel} Teacher?`,
      message: teacher.isActive
        ? "Deactivating this teacher will revoke their login access immediately. Their historical timetable, marks, and attendance records will remain intact."
        : "Activating this teacher will restore their login access.",
      confirmText: actionLabel,
      cancelText: "Cancel",
      variant: teacher.isActive ? "warning" : "primary",
    });

    if (!ok) return;

    setIsSubmitting(true);
    const res = await toggleTeacherStatusAction(teacher.id);
    setIsSubmitting(false);

    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setStatus(res.newStatus as "ACTIVE" | "INACTIVE");
      setSuccessMsg(`Teacher successfully ${res.newStatus === "ACTIVE" ? "activated" : "deactivated"}!`);
      onSuccess();
    }
  };

  const handleDelete = async () => {
    if (!teacher) return;
    const ok = await confirm({
      title: "Permanently Delete Teacher?",
      message: "WARNING: This permanently removes the teacher login and user record. Timetable slots, marks, and historical records will remain intact with unlinked teacher ID.",
      confirmText: "Delete Teacher",
      cancelText: "Cancel",
      variant: "danger",
    });

    if (!ok) return;

    setIsSubmitting(true);
    const res = await deleteTeacherPermanentlyAction(teacher.id);
    setIsSubmitting(false);

    if (res.error) {
      setErrorMsg(res.error);
    } else {
      onSuccess();
      onClose();
    }
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "540px",
          height: "100%",
          background: "var(--card-bg, #0f172a)",
          borderLeft: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-8px 0 24px rgba(0, 0, 0, 0.4)",
          overflow: "hidden",
        }}
      >
        {/* Top Drawer Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(59, 130, 246, 0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "rgba(59, 130, 246, 0.15)",
                color: "#60a5fa",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <User size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary, #f8fafc)" }}>
                {isAddMode ? "Add New Teacher" : `Edit Teacher: ${name || teacher?.user.name}`}
              </h2>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary, #94a3b8)" }}>
                {isAddMode ? "Create profile, assign subjects & configure login access" : `Teacher ID: ${teacher?.id}`}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary, #94a3b8)",
              cursor: "pointer",
              padding: "0.5rem",
              borderRadius: "8px",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
            background: "rgba(0, 0, 0, 0.15)",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("PROFILE")}
            style={{
              flex: 1,
              padding: "0.85rem 0.5rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              border: "none",
              background: "transparent",
              color: activeTab === "PROFILE" ? "var(--primary, #3b82f6)" : "var(--text-secondary, #94a3b8)",
              borderBottom: activeTab === "PROFILE" ? "2px solid var(--primary, #3b82f6)" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            Profile & Info
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("TEACHING")}
            style={{
              flex: 1,
              padding: "0.85rem 0.5rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              border: "none",
              background: "transparent",
              color: activeTab === "TEACHING" ? "var(--primary, #3b82f6)" : "var(--text-secondary, #94a3b8)",
              borderBottom: activeTab === "TEACHING" ? "2px solid var(--primary, #3b82f6)" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            Teaching & Classes
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ACCESS")}
            style={{
              flex: 1,
              padding: "0.85rem 0.5rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              border: "none",
              background: "transparent",
              color: activeTab === "ACCESS" ? "var(--primary, #3b82f6)" : "var(--text-secondary, #94a3b8)",
              borderBottom: activeTab === "ACCESS" ? "2px solid var(--primary, #3b82f6)" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            Login & Access
          </button>
        </div>

        {/* Scrollable Form Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
          {errorMsg && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171",
                fontSize: "0.85rem",
                marginBottom: "1.25rem",
              }}
            >
              <AlertTriangle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#34d399",
                fontSize: "0.85rem",
                marginBottom: "1.25rem",
              }}
            >
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          <form id="teacher-drawer-form" onSubmit={handleSave}>
            {/* TAB 1: PROFILE */}
            {activeTab === "PROFILE" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                    Full Name <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Robert Smith"
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

                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                    Email / Login Username <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. john.doe@schoolportal.edu"
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

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                      Primary Phone
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
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
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                      Alternate Phone
                    </label>
                    <input
                      type="text"
                      value={alternatePhone}
                      onChange={(e) => setAlternatePhone(e.target.value)}
                      placeholder="Optional"
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

                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                    Qualification
                  </label>
                  <input
                    type="text"
                    value={qualification}
                    onChange={(e) => setQualification(e.target.value)}
                    placeholder="e.g. M.Sc. Mathematics, B.Ed."
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

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                      Join Date
                    </label>
                    <input
                      type="date"
                      value={joinDate}
                      onChange={(e) => setJoinDate(e.target.value)}
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
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                      Account Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as "ACTIVE" | "INACTIVE")}
                      style={{
                        width: "100%",
                        padding: "0.65rem 0.85rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                        background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                        color: "inherit",
                        fontSize: "0.9rem",
                      }}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive (Disabled)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                    Resume URL / Document Link
                  </label>
                  <input
                    type="url"
                    value={resumeUrl}
                    onChange={(e) => setResumeUrl(e.target.value)}
                    placeholder="https://..."
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
            )}

            {/* TAB 2: TEACHING & CLASSES */}
            {activeTab === "TEACHING" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                {/* Class Teacher Dropdown */}
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                    Class Teacher Assignment
                  </label>
                  <select
                    value={classTeacherOfId}
                    onChange={(e) => setClassTeacherOfId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                      background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                      color: "inherit",
                      fontSize: "0.9rem",
                    }}
                  >
                    <option value="">None (Subject Teacher Only)</option>
                    {allClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} - {c.section}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Period Limits */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                      Max Periods / Day
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={maxPeriodsPerDay}
                      onChange={(e) => setMaxPeriodsPerDay(parseInt(e.target.value, 10) || 6)}
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
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                      Max Periods / Week
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={maxPeriodsPerWeek}
                      onChange={(e) => setMaxPeriodsPerWeek(parseInt(e.target.value, 10) || 30)}
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

                {/* Assigned Classes */}
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.5rem" }}>
                    Assigned Classes
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {allClasses.map((c) => {
                      const isChecked = selectedClassIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedClassIds(prev =>
                              isChecked ? prev.filter(id => id !== c.id) : [...prev, c.id]
                            );
                          }}
                          style={{
                            padding: "0.45rem 0.85rem",
                            borderRadius: "20px",
                            fontSize: "0.82rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            border: isChecked ? "1px solid #3b82f6" : "1px solid var(--border-color, rgba(255,255,255,0.1))",
                            background: isChecked ? "rgba(59, 130, 246, 0.2)" : "rgba(255, 255, 255, 0.03)",
                            color: isChecked ? "#60a5fa" : "var(--text-secondary, #94a3b8)",
                          }}
                        >
                          {isChecked ? "✓ " : ""}{c.name}-{c.section}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Assigned Subjects */}
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.5rem" }}>
                    Assigned Subjects
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {allSubjects.map((s) => {
                      const isChecked = selectedSubjectIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSelectedSubjectIds(prev =>
                              isChecked ? prev.filter(id => id !== s.id) : [...prev, s.id]
                            );
                          }}
                          style={{
                            padding: "0.45rem 0.85rem",
                            borderRadius: "20px",
                            fontSize: "0.82rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            border: isChecked ? "1px solid #10b981" : "1px solid var(--border-color, rgba(255,255,255,0.1))",
                            background: isChecked ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.03)",
                            color: isChecked ? "#34d399" : "var(--text-secondary, #94a3b8)",
                          }}
                        >
                          {isChecked ? "✓ " : ""}{s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: LOGIN & ACCESS */}
            {activeTab === "ACCESS" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                {/* User ID / Login Username */}
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                    User ID / Login Email <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. teacher.name@schoolportal.edu"
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
                  <p style={{ margin: "0.3rem 0 0 0", fontSize: "0.75rem", color: "var(--text-secondary, #94a3b8)" }}>
                    The unique email or username the teacher uses to sign in with password credentials.
                  </p>
                </div>

                {/* Google Sign-in */}
                <div
                  style={{
                    padding: "1rem",
                    borderRadius: "10px",
                    background: "rgba(59, 130, 246, 0.05)",
                    border: "1px solid rgba(59, 130, 246, 0.2)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                    <Shield size={16} style={{ color: "#3b82f6" }} />
                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary, #f8fafc)" }}>
                      Google SSO Email
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-secondary, #94a3b8)", marginBottom: "0.75rem" }}>
                    Allow teacher to sign in using their official Google or Gmail account.
                  </p>
                  <input
                    type="email"
                    value={googleEmail}
                    onChange={(e) => setGoogleEmail(e.target.value)}
                    placeholder="e.g. teacher.name@gmail.com"
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                      background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                      color: "inherit",
                      fontSize: "0.88rem",
                    }}
                  />
                </div>

                {/* Password Management */}
                <div
                  style={{
                    padding: "1rem",
                    borderRadius: "10px",
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <Key size={16} style={{ color: "#f59e0b" }} />
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary, #f8fafc)" }}>
                        {isAddMode ? "Set Password" : "Reset Password"}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={generateStrongPassword}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "0.35rem 0.75rem",
                        background: "rgba(245, 158, 11, 0.15)",
                        border: "1px solid rgba(245, 158, 11, 0.3)",
                        color: "#fbbf24",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <Key size={13} />
                      <span>Generate Strong</span>
                    </button>
                  </div>

                  {!isAddMode && (
                    <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.78rem", color: "var(--text-secondary, #94a3b8)" }}>
                      Leave blank to keep current password. Entering a new password will update it and revoke all active sessions.
                    </p>
                  )}

                  <div style={{ position: "relative" }}>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isAddMode ? "Enter password (or generate above)" : "Enter new password to overwrite"}
                      style={{
                        width: "100%",
                        padding: "0.65rem 2.5rem 0.65rem 0.85rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                        background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                        color: "inherit",
                        fontSize: "0.88rem",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "transparent",
                        border: "none",
                        color: "var(--text-secondary, #94a3b8)",
                        cursor: "pointer",
                      }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {password && (
                    <div style={{ marginTop: "0.75rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                        <span style={{ color: "var(--text-secondary, #94a3b8)" }}>Strength:</span>
                        <span style={{ fontWeight: 700, color: strength.color }}>{strength.label}</span>
                      </div>
                      <div style={{ height: "4px", width: "100%", background: "rgba(255, 255, 255, 0.1)", borderRadius: "2px", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${(strength.score / 4) * 100}%`,
                            background: strength.color,
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                      {copiedPassword && (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", color: "#34d399", marginTop: "0.4rem" }}>
                          <Check size={14} /> Password copied to clipboard!
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Danger Zone (Edit mode only) */}
                {!isAddMode && (
                  <div
                    style={{
                      marginTop: "1.5rem",
                      padding: "1.25rem",
                      borderRadius: "10px",
                      background: "rgba(239, 68, 68, 0.04)",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                    }}
                  >
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#f87171", marginBottom: "0.35rem" }}>
                      Danger Zone
                    </div>
                    <p style={{ margin: "0 0 1rem 0", fontSize: "0.78rem", color: "var(--text-secondary, #94a3b8)" }}>
                      Deactivating revokes access immediately without deleting any historical records. Deletion permanently removes the user account.
                    </p>

                    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={handleToggleStatus}
                        disabled={isSubmitting}
                        style={{
                          flex: 1,
                          padding: "0.55rem 0.9rem",
                          borderRadius: "8px",
                          border: "1px solid rgba(245, 158, 11, 0.3)",
                          background: "rgba(245, 158, 11, 0.12)",
                          color: "#fbbf24",
                          fontSize: "0.82rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {teacher.isActive ? "Deactivate Account" : "Activate Account"}
                      </button>

                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isSubmitting}
                        style={{
                          padding: "0.55rem 0.9rem",
                          borderRadius: "8px",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          background: "rgba(239, 68, 68, 0.12)",
                          color: "#f87171",
                          fontSize: "0.82rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                        }}
                      >
                        <Trash2 size={14} />
                        <span>Delete Teacher</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>
        </div>

        {/* Sticky Drawer Footer */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderTop: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.75rem",
            background: "rgba(0, 0, 0, 0.2)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              padding: "0.65rem 1.25rem",
              borderRadius: "8px",
              border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
              background: "transparent",
              color: "inherit",
              fontSize: "0.88rem",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>

          <button
            type="submit"
            form="teacher-drawer-form"
            disabled={isSubmitting}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.65rem 1.5rem",
              borderRadius: "8px",
              border: "none",
              background: "var(--primary, #3b82f6)",
              color: "#ffffff",
              fontSize: "0.88rem",
              fontWeight: 600,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              boxShadow: "0 2px 10px rgba(59, 130, 246, 0.35)",
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>{isAddMode ? "Create Teacher" : "Save Changes"}</span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
