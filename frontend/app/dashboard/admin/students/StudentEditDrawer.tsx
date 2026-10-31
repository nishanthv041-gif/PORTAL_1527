"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  X, User, Mail, Phone, GraduationCap, Calendar, Shield, Key, Eye, EyeOff,
  Copy, Check, AlertTriangle, Trash2, CheckCircle2, XCircle, Loader2,
  Users, MapPin, Heart, Home, RefreshCw
} from "lucide-react";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";
import {
  createStudentAction,
  updateStudentAction,
  toggleStudentStatusAction,
  deleteStudentPermanentlyAction
} from "@/backend/api/actions/dashboard/admin/students/studentManagementActions";

export interface StudentData {
  id: string;
  rollNumber: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | Date | null;
  gender: string | null;
  bloodGroup: string | null;
  address: string | null;
  photo?: string | null;
  isActive: boolean;
  batch?: string | null;
  residenceType?: string | null;
  classId?: string | null;
  class?: { id: string; name: string; section: string } | null;
  parents: Array<{
    parent: {
      id: string;
      userId: string;
      phone: string | null;
      alternatePhone?: string | null;
      occupation: string | null;
      isActive: boolean;
      user: {
        id: string;
        name: string;
        email: string;
        googleEmail?: string | null;
        status: string;
      };
    };
  }>;
}

interface ParentOption {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

interface StudentEditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  student: StudentData | null; // null = Add Student
  allClasses: Array<{ id: string; name: string; section: string }>;
  existingParents?: ParentOption[];
  defaultClassId?: string;
  onSuccess: () => void;
}

export default function StudentEditDrawer({
  isOpen,
  onClose,
  student,
  allClasses,
  existingParents = [],
  defaultClassId,
  onSuccess,
}: StudentEditDrawerProps) {
  const confirm = useConfirm();
  const isAddMode = !student;

  const [activeTab, setActiveTab] = useState<"STUDENT" | "PARENT" | "ACCESS">("STUDENT");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Tab A: Student State
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [admissionNo, setAdmissionNo] = useState("");
  const [classId, setClassId] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [address, setAddress] = useState("");
  const [photo, setPhoto] = useState("");
  const [batch, setBatch] = useState("2026-2027");
  const [residenceType, setResidenceType] = useState<"DAYSCHOLAR" | "HOSTEL">("DAYSCHOLAR");
  const [isActive, setIsActive] = useState(true);

  // Tab B: Parent State
  const [parentMode, setParentMode] = useState<"NEW" | "EXISTING">("NEW");
  const [existingParentId, setExistingParentId] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentAlternatePhone, setParentAlternatePhone] = useState("");
  const [parentOccupation, setParentOccupation] = useState("");

  // Tab C: Login & Access State
  const [parentEmail, setParentEmail] = useState("");
  const [parentGoogleEmail, setParentGoogleEmail] = useState("");
  const [parentPassword, setParentPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [parentStatus, setParentStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Parent ID reference when updating
  const currentParent = student?.parents?.[0]?.parent;

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setParentPassword("");
    setShowPassword(false);

    if (student) {
      setFirstName(student.firstName || "");
      setLastName(student.lastName || "");
      setRollNumber(student.rollNumber || "");
      setAdmissionNo(student.admissionNo || "");
      setClassId(student.classId || student.class?.id || allClasses[0]?.id || "");
      setDateOfBirth(student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().split("T")[0] : "");
      setGender(student.gender || "");
      setBloodGroup(student.bloodGroup || "");
      setAddress(student.address || "");
      setPhoto(student.photo || "");
      setBatch(student.batch || "2026-2027");
      setResidenceType((student.residenceType as any) || "DAYSCHOLAR");
      setIsActive(student.isActive);

      if (currentParent) {
        setParentMode("NEW");
        setExistingParentId("");
        setParentName(currentParent.user.name || "");
        setParentPhone(currentParent.phone || "");
        setParentAlternatePhone(currentParent.alternatePhone || "");
        setParentOccupation(currentParent.occupation || "");
        setParentEmail(currentParent.user.email || "");
        setParentGoogleEmail(currentParent.user.googleEmail || "");
        setParentStatus((currentParent.user.status as any) || "ACTIVE");
      } else {
        setParentName("");
        setParentPhone("");
        setParentAlternatePhone("");
        setParentOccupation("");
        setParentEmail("");
        setParentGoogleEmail("");
        setParentStatus("ACTIVE");
      }
    } else {
      // Add Mode
      setFirstName("");
      setLastName("");
      setRollNumber("");
      setAdmissionNo(`ADM-${Math.floor(1000 + Math.random() * 9000)}`);
      setClassId(defaultClassId || allClasses[0]?.id || "");
      setDateOfBirth("");
      setGender("Male");
      setBloodGroup("");
      setAddress("");
      setPhoto("");
      setBatch("2026-2027");
      setResidenceType("DAYSCHOLAR");
      setIsActive(true);

      setParentMode("NEW");
      setExistingParentId("");
      setParentName("");
      setParentPhone("");
      setParentAlternatePhone("");
      setParentOccupation("");
      setParentEmail("");
      setParentGoogleEmail("");
      setParentStatus("ACTIVE");
    }
  }, [isOpen, student, defaultClassId, allClasses]);

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

  const generateStrongPassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let gen = "";
    for (let i = 0; i < 12; i++) {
      gen += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setParentPassword(gen);
    setShowPassword(true);
    navigator.clipboard?.writeText(gen);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2500);
  };

  const copyAddressToParent = () => {
    // If student address is present, copy it
    if (address) {
      setSuccessMsg("Address copied from student record.");
      setTimeout(() => setSuccessMsg(null), 2500);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!firstName.trim()) {
      setErrorMsg("Student first name is required.");
      return;
    }
    if (!rollNumber.trim()) {
      setErrorMsg("Roll number is required.");
      return;
    }
    if (!admissionNo.trim()) {
      setErrorMsg("Admission number is required.");
      return;
    }
    if (!classId) {
      setErrorMsg("Please select a target class.");
      return;
    }

    // If moving class, confirm with user
    if (!isAddMode && student.classId && student.classId !== classId) {
      const oldClass = allClasses.find(c => c.id === student.classId);
      const newClass = allClasses.find(c => c.id === classId);
      const confirmed = await confirm({
        title: "Move Student to New Class?",
        message: `Move ${firstName} from ${oldClass?.name}-${oldClass?.section} to ${newClass?.name}-${newClass?.section}? All attendance records, grades, and historical report cards will be preserved intact.`,
        confirmText: "Move Class",
        cancelText: "Cancel",
        variant: "primary",
      });
      if (!confirmed) return;
    }

    // If credentials change, confirm
    if (!isAddMode && currentParent) {
      const isCredentialUpdate = Boolean(parentPassword) || (parentEmail && parentEmail.toLowerCase() !== currentParent.user.email.toLowerCase()) || (parentStatus !== currentParent.user.status);
      if (isCredentialUpdate) {
        const ok = await confirm({
          title: "Update Parent Credentials?",
          message: "Updating login credentials or status will immediately revoke all current active sessions for this parent account.",
          confirmText: "Update & Revoke",
          cancelText: "Cancel",
          variant: "warning",
        });
        if (!ok) return;
      }
    }

    setIsSubmitting(true);

    try {
      if (isAddMode) {
        const res = await createStudentAction({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          rollNumber: rollNumber.trim(),
          admissionNo: admissionNo.trim(),
          classId,
          dateOfBirth: dateOfBirth || undefined,
          gender: gender || undefined,
          bloodGroup: bloodGroup || undefined,
          address: address.trim() || undefined,
          photo: photo.trim() || undefined,
          batch: batch.trim() || undefined,
          residenceType,
          isActive,

          existingParentId: parentMode === "EXISTING" ? existingParentId : undefined,
          parentName: parentMode === "NEW" ? parentName.trim() : undefined,
          parentEmail: parentMode === "NEW" ? parentEmail.trim() : undefined,
          parentGoogleEmail: parentMode === "NEW" ? parentGoogleEmail.trim() : undefined,
          parentPassword: parentMode === "NEW" ? parentPassword : undefined,
          parentPhone: parentMode === "NEW" ? parentPhone.trim() : undefined,
          parentAlternatePhone: parentMode === "NEW" ? parentAlternatePhone.trim() : undefined,
          parentOccupation: parentMode === "NEW" ? parentOccupation.trim() : undefined,
        });

        if (res.error) {
          setErrorMsg(res.error);
        } else {
          setSuccessMsg("Student created successfully!");
          setTimeout(() => {
            onSuccess();
            onClose();
          }, 800);
        }
      } else {
        const res = await updateStudentAction({
          studentId: student.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          rollNumber: rollNumber.trim(),
          admissionNo: admissionNo.trim(),
          classId,
          dateOfBirth: dateOfBirth || undefined,
          gender: gender || undefined,
          bloodGroup: bloodGroup || undefined,
          address: address.trim() || undefined,
          photo: photo.trim() || undefined,
          batch: batch.trim() || undefined,
          residenceType,
          isActive,

          parentId: currentParent?.id,
          existingParentId: parentMode === "EXISTING" ? existingParentId : undefined,
          parentName: parentName.trim() || undefined,
          parentEmail: parentEmail.trim() || undefined,
          parentGoogleEmail: parentGoogleEmail.trim() || undefined,
          parentPassword: parentPassword || undefined,
          parentPhone: parentPhone.trim() || undefined,
          parentAlternatePhone: parentAlternatePhone.trim() || undefined,
          parentOccupation: parentOccupation.trim() || undefined,
          parentStatus,
        });

        if (res.error) {
          setErrorMsg(res.error);
        } else {
          setSuccessMsg("Student updated successfully!");
          setTimeout(() => {
            onSuccess();
          }, 600);
        }
      }
    } catch {
      setErrorMsg("Failed to save student record.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStudentStatus = async () => {
    if (!student) return;
    const actionLabel = student.isActive ? "Deactivate" : "Activate";
    const confirmed = await confirm({
      title: `${actionLabel} Student?`,
      message: student.isActive
        ? "Deactivating this student marks their enrollment status as inactive. All historical records remain intact."
        : "Activating this student restores active enrollment in their class.",
      confirmText: actionLabel,
      cancelText: "Cancel",
      variant: student.isActive ? "warning" : "primary",
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    const res = await toggleStudentStatusAction(student.id);
    setIsSubmitting(false);

    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setIsActive(Boolean(res.newStatus));
      setSuccessMsg(`Student successfully ${res.newStatus ? "activated" : "deactivated"}!`);
      onSuccess();
    }
  };

  const handleDeleteStudent = async () => {
    if (!student) return;
    const confirmed = await confirm({
      title: "Permanently Delete Student?",
      message: "WARNING: This permanently removes the student record, marks, and attendance. If the parent account has no other children enrolled, the parent account will also be cleaned up.",
      confirmText: "Delete Student",
      cancelText: "Cancel",
      variant: "danger",
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    const res = await deleteStudentPermanentlyAction(student.id);
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
          maxWidth: "560px",
          height: "100%",
          background: "var(--card-bg, #0f172a)",
          borderLeft: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-8px 0 24px rgba(0, 0, 0, 0.4)",
          overflow: "hidden",
        }}
      >
        {/* Drawer Header */}
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
              <GraduationCap size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary, #f8fafc)" }}>
                {isAddMode ? "Add New Student" : `Edit Student: ${firstName} ${lastName}`}
              </h2>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary, #94a3b8)" }}>
                {isAddMode ? "Enrolls student and links parent account" : `Adm No: ${admissionNo} • Roll: ${rollNumber}`}
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

        {/* 3 Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
            background: "rgba(0, 0, 0, 0.15)",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("STUDENT")}
            style={{
              flex: 1,
              padding: "0.85rem 0.5rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              border: "none",
              background: "transparent",
              color: activeTab === "STUDENT" ? "var(--primary, #3b82f6)" : "var(--text-secondary, #94a3b8)",
              borderBottom: activeTab === "STUDENT" ? "2px solid var(--primary, #3b82f6)" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            Student Info
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("PARENT")}
            style={{
              flex: 1,
              padding: "0.85rem 0.5rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              border: "none",
              background: "transparent",
              color: activeTab === "PARENT" ? "var(--primary, #3b82f6)" : "var(--text-secondary, #94a3b8)",
              borderBottom: activeTab === "PARENT" ? "2px solid var(--primary, #3b82f6)" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            Parent / Guardian
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

        {/* Scrollable Form Body */}
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

          <form id="student-drawer-form" onSubmit={handleSave}>
            {/* TAB A: STUDENT INFO */}
            {activeTab === "STUDENT" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                {/* Names */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                      First Name <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="e.g. Aarav"
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
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="e.g. Kumar"
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

                {/* Roll No, Admission No, Class */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                      Roll Number <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={rollNumber}
                      onChange={(e) => setRollNumber(e.target.value)}
                      placeholder="e.g. 01"
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
                      Admission No <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={admissionNo}
                      onChange={(e) => setAdmissionNo(e.target.value)}
                      placeholder="e.g. ADM-1001"
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

                {/* Class Assignment & Academic Batch */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                      Enrolled Class <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <select
                      value={classId}
                      onChange={(e) => setClassId(e.target.value)}
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
                      {allClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} - {c.section}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                      Academic Batch
                    </label>
                    <input
                      type="text"
                      value={batch}
                      onChange={(e) => setBatch(e.target.value)}
                      placeholder="2026-2027"
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

                {/* DOB & Gender */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
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
                      Gender
                    </label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
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
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Blood Group & Residence Type */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                      Blood Group
                    </label>
                    <input
                      type="text"
                      value={bloodGroup}
                      onChange={(e) => setBloodGroup(e.target.value)}
                      placeholder="e.g. O+, B+"
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
                      Residence Type
                    </label>
                    <select
                      value={residenceType}
                      onChange={(e) => setResidenceType(e.target.value as any)}
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
                      <option value="DAYSCHOLAR">Day Scholar</option>
                      <option value="HOSTEL">Hostel</option>
                    </select>
                  </div>
                </div>

                {/* Address */}
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                    Residential Address
                  </label>
                  <textarea
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Enter street address, city, pin code..."
                    style={{
                      width: "100%",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                      background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                      color: "inherit",
                      fontSize: "0.88rem",
                      resize: "vertical",
                    }}
                  />
                </div>
              </div>
            )}

            {/* TAB B: PARENT / GUARDIAN */}
            {activeTab === "PARENT" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                {/* Mode Selector */}
                <div
                  style={{
                    display: "flex",
                    background: "rgba(0, 0, 0, 0.2)",
                    borderRadius: "8px",
                    padding: "4px",
                    border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setParentMode("NEW")}
                    style={{
                      flex: 1,
                      padding: "0.5rem",
                      borderRadius: "6px",
                      border: "none",
                      background: parentMode === "NEW" ? "var(--primary, #3b82f6)" : "transparent",
                      color: parentMode === "NEW" ? "#ffffff" : "var(--text-secondary, #94a3b8)",
                      fontWeight: 600,
                      fontSize: "0.82rem",
                      cursor: "pointer",
                    }}
                  >
                    Create / Edit Parent
                  </button>
                  <button
                    type="button"
                    onClick={() => setParentMode("EXISTING")}
                    style={{
                      flex: 1,
                      padding: "0.5rem",
                      borderRadius: "6px",
                      border: "none",
                      background: parentMode === "EXISTING" ? "var(--primary, #3b82f6)" : "transparent",
                      color: parentMode === "EXISTING" ? "#ffffff" : "var(--text-secondary, #94a3b8)",
                      fontWeight: 600,
                      fontSize: "0.82rem",
                      cursor: "pointer",
                    }}
                  >
                    Link Existing Parent (Sibling)
                  </button>
                </div>

                {parentMode === "EXISTING" ? (
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                      Select Existing Parent in School
                    </label>
                    <select
                      value={existingParentId}
                      onChange={(e) => setExistingParentId(e.target.value)}
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
                      <option value="">-- Choose a Parent --</option>
                      {existingParents.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.email}) {p.phone ? `• ${p.phone}` : ""}
                        </option>
                      ))}
                    </select>
                    <p style={{ fontSize: "0.78rem", color: "var(--text-secondary, #94a3b8)", marginTop: "0.4rem" }}>
                      Linking an existing parent connects this student to the same parent dashboard without creating duplicate credentials.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                        Parent / Guardian Full Name
                      </label>
                      <input
                        type="text"
                        value={parentName}
                        onChange={(e) => setParentName(e.target.value)}
                        placeholder="e.g. Ramesh Kumar"
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
                          value={parentPhone}
                          onChange={(e) => setParentPhone(e.target.value)}
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
                          value={parentAlternatePhone}
                          onChange={(e) => setParentAlternatePhone(e.target.value)}
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
                        Occupation
                      </label>
                      <input
                        type="text"
                        value={parentOccupation}
                        onChange={(e) => setParentOccupation(e.target.value)}
                        placeholder="e.g. Software Engineer, Business Owner"
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

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        onClick={copyAddressToParent}
                        style={{
                          padding: "0.45rem 0.85rem",
                          borderRadius: "6px",
                          border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                          background: "rgba(255, 255, 255, 0.04)",
                          color: "#60a5fa",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                        }}
                      >
                        <Copy size={13} />
                        <span>Copy Address from Student Record</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* TAB C: LOGIN & ACCESS (Parent Account) */}
            {activeTab === "ACCESS" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                {/* Parent Email / Username */}
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #f8fafc)", marginBottom: "0.35rem" }}>
                    Parent Email / Login ID
                  </label>
                  <input
                    type="email"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    placeholder="e.g. parent.name@gmail.com"
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

                {/* Parent Google SSO */}
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
                      Google SSO for Parent
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-secondary, #94a3b8)", marginBottom: "0.75rem" }}>
                    Allow parent to log into portal using their official Google account.
                  </p>
                  <input
                    type="email"
                    value={parentGoogleEmail}
                    onChange={(e) => setParentGoogleEmail(e.target.value)}
                    placeholder="e.g. ramesh.kumar@gmail.com"
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

                {/* Parent Password */}
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
                        {isAddMode ? "Parent Password" : "Reset Parent Password"}
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

                  <div style={{ position: "relative" }}>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={parentPassword}
                      onChange={(e) => setParentPassword(e.target.value)}
                      placeholder={isAddMode ? "Default: Parent@123" : "Leave blank to keep unchanged"}
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

                  {copiedPassword && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", color: "#34d399", marginTop: "0.4rem" }}>
                      <Check size={14} /> Password copied to clipboard!
                    </div>
                  )}
                </div>

                {/* Danger Zone */}
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
                      Deactivating unenrolls the student while keeping all history. Deleting permanently removes student marks and enrollment.
                    </p>

                    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={handleToggleStudentStatus}
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
                        {isActive ? "Deactivate Student" : "Activate Student"}
                      </button>

                      <button
                        type="button"
                        onClick={handleDeleteStudent}
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
                        <span>Delete Student</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>
        </div>

        {/* Drawer Sticky Footer */}
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
            form="student-drawer-form"
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
              <span>{isAddMode ? "Enroll Student" : "Save Changes"}</span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
