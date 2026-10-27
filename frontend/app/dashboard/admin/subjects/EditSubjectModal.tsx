"use client";

import { useState, useEffect } from "react";
import { BookOpen, X, Check, UserCheck, AlertCircle, Loader2 } from "lucide-react";
import { updateSubjectGroupAction } from "@/backend/api/actions/dashboard/admin/subjects/actions";
import { Class, Teacher, User, Subject, Student, Mark } from "@prisma/client";

type TeacherWithUser = Teacher & { user: User };
type SubjectWithRelations = Subject & {
  class: Class & { students: Student[] };
  teacher: TeacherWithUser | null;
  marks: Mark[];
};

interface EditSubjectModalProps {
  subjectName: string;
  instances: SubjectWithRelations[];
  classes: Class[];
  teachers: TeacherWithUser[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newName: string) => void;
}

export default function EditSubjectModal({
  subjectName,
  instances,
  classes,
  teachers,
  isOpen,
  onClose,
  onSuccess,
}: EditSubjectModalProps) {
  const [name, setName] = useState(subjectName);
  const [code, setCode] = useState(instances[0]?.code || "");
  const [maxMarks, setMaxMarks] = useState(instances[0]?.maxMarks || 100);
  const [passMarks, setPassMarks] = useState(instances[0]?.passMarks || 35);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [classStaffMap, setClassStaffMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state whenever modal opens or subject changes
  useEffect(() => {
    if (isOpen && instances && instances.length > 0) {
      setName(instances[0]?.name || subjectName);
      setCode(instances[0]?.code || "");
      setMaxMarks(instances[0]?.maxMarks || 100);
      setPassMarks(instances[0]?.passMarks || 35);
      
      const enrolledIds = instances.map((i) => i.classId);
      setSelectedClasses(enrolledIds);

      const staffMap: Record<string, string> = {};
      instances.forEach((i) => {
        if (i.teacherId) {
          staffMap[i.classId] = i.teacherId;
        }
      });
      setClassStaffMap(staffMap);
      setError(null);
    }
  }, [isOpen, instances, subjectName]);

  if (!isOpen) return null;

  const toggleClass = (classId: string) => {
    if (selectedClasses.includes(classId)) {
      setSelectedClasses((prev) => prev.filter((id) => id !== classId));
      setClassStaffMap((prev) => {
        const next = { ...prev };
        delete next[classId];
        return next;
      });
    } else {
      setSelectedClasses((prev) => [...prev, classId]);
    }
  };

  const handleStaffChange = (classId: string, teacherId: string) => {
    setClassStaffMap((prev) => ({
      ...prev,
      [classId]: teacherId,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Subject name is required.");
      return;
    }

    if (!code.trim()) {
      setError("Subject code is required.");
      return;
    }

    if (selectedClasses.length === 0) {
      setError("Please select at least one class for this subject.");
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.set("originalName", subjectName);
    formData.set("name", name.trim());
    formData.set("code", code.trim());
    formData.set("maxMarks", String(maxMarks));
    formData.set("passMarks", String(passMarks));

    const assignments = selectedClasses.map((classId) => ({
      classId,
      teacherId: classStaffMap[classId] || null,
    }));
    formData.set("classAssignments", JSON.stringify(assignments));
    formData.set("classIds", selectedClasses.join(","));

    const res = await updateSubjectGroupAction(formData);
    setIsSubmitting(false);

    if (res?.error) {
      setError(res.error);
    } else {
      onSuccess?.(res.newName || name.trim());
      onClose();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        style={{
          background: "var(--card-bg, #1e293b)",
          color: "var(--foreground, #f8fafc)",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "680px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
          border: "1px solid var(--border-color, #334155)",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--border-color, #334155)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                background: "rgba(99, 102, 241, 0.15)",
                color: "var(--primary, #6366f1)",
                padding: "0.5rem",
                borderRadius: "10px",
              }}
            >
              <BookOpen size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Edit Subject</h3>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary, #94a3b8)" }}>
                Update subject details, syllabus codes, and class allocations
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary, #94a3b8)",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              padding: "0.4rem",
              borderRadius: "8px",
              display: "flex",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
          <div style={{ padding: "1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {error && (
              <div
                style={{
                  background: "var(--danger-bg, rgba(239, 68, 68, 0.15))",
                  color: "var(--danger, #ef4444)",
                  padding: "0.75rem 1rem",
                  borderRadius: "10px",
                  border: "1px solid var(--danger, #ef4444)",
                  fontSize: "0.875rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {/* Basic Info: Name & Code */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                  Subject Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Mathematics"
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color, #334155)",
                    background: "var(--card-bg, #0f172a)",
                    color: "inherit",
                    fontSize: "0.9rem",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                  Subject Code *
                </label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. MATH101"
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color, #334155)",
                    background: "var(--card-bg, #0f172a)",
                    color: "inherit",
                    fontSize: "0.9rem",
                  }}
                />
              </div>
            </div>

            {/* Marks: Max Marks & Pass Marks */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                  Maximum Marks
                </label>
                <input
                  type="number"
                  min="1"
                  value={maxMarks}
                  onChange={(e) => setMaxMarks(parseInt(e.target.value, 10) || 100)}
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color, #334155)",
                    background: "var(--card-bg, #0f172a)",
                    color: "inherit",
                    fontSize: "0.9rem",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                  Passing Marks
                </label>
                <input
                  type="number"
                  min="0"
                  max={maxMarks}
                  value={passMarks}
                  onChange={(e) => setPassMarks(parseInt(e.target.value, 10) || 35)}
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color, #334155)",
                    background: "var(--card-bg, #0f172a)",
                    color: "inherit",
                    fontSize: "0.9rem",
                  }}
                />
              </div>
            </div>

            {/* Class Selection */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Enrolled Classes * ({selectedClasses.length} selected)
                </label>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary, #94a3b8)" }}>
                  Toggle classes that study this subject
                </span>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", maxHeight: "150px", overflowY: "auto", padding: "0.5rem", border: "1px solid var(--border-color, #334155)", borderRadius: "10px", background: "rgba(0,0,0,0.02)" }}>
                {classes.map((cls) => {
                  const isSelected = selectedClasses.includes(cls.id);
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => toggleClass(cls.id)}
                      style={{
                        padding: "0.4rem 0.75rem",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        border: isSelected ? "1px solid var(--primary, #6366f1)" : "1px solid var(--border-color, #334155)",
                        background: isSelected ? "var(--primary, #6366f1)" : "transparent",
                        color: isSelected ? "#ffffff" : "inherit",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {isSelected && <Check size={14} />}
                      {cls.name} - {cls.section}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Per-Class Teacher Allocation */}
            {selectedClasses.length > 0 && (
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Staff / Teacher Allocation per Class
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxHeight: "200px", overflowY: "auto", paddingRight: "0.3rem" }}>
                  {selectedClasses.map((classId) => {
                    const cls = classes.find((c) => c.id === classId);
                    if (!cls) return null;
                    const assignedTeacherId = classStaffMap[classId] || "";

                    return (
                      <div
                        key={classId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.5rem 0.85rem",
                          borderRadius: "8px",
                          background: "var(--card-bg, #0f172a)",
                          border: "1px solid var(--border-color, #334155)",
                          gap: "1rem",
                        }}
                      >
                        <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                          {cls.name} - {cls.section}
                        </span>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: "0 0 250px" }}>
                          <UserCheck size={14} style={{ color: "var(--text-secondary, #94a3b8)", flexShrink: 0 }} />
                          <select
                            value={assignedTeacherId}
                            onChange={(e) => handleStaffChange(classId, e.target.value)}
                            style={{
                              width: "100%",
                              padding: "0.4rem 0.6rem",
                              borderRadius: "6px",
                              border: "1px solid var(--border-color, #334155)",
                              background: "transparent",
                              color: "inherit",
                              fontSize: "0.8rem",
                            }}
                          >
                            <option value="" style={{ background: "var(--card-bg, #1e293b)" }}>-- Unassigned --</option>
                            {teachers.map((t) => (
                              <option key={t.id} value={t.id} style={{ background: "var(--card-bg, #1e293b)" }}>
                                {t.user.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div
            style={{
              padding: "1rem 1.5rem",
              borderTop: "1px solid var(--border-color, #334155)",
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.75rem",
              background: "rgba(0,0,0,0.02)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: "0.6rem 1.25rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #334155)",
                background: "transparent",
                color: "inherit",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: isSubmitting ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: "0.6rem 1.5rem",
                borderRadius: "8px",
                border: "none",
                background: "var(--primary, #6366f1)",
                color: "#ffffff",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: isSubmitting ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
