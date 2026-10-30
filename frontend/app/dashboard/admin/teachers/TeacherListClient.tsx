"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Plus, LayoutGrid, List, User, Mail, Phone, BookOpen,
  Calendar, CheckCircle2, XCircle, MoreVertical, Edit2, ShieldAlert,
  ArrowUpDown, ExternalLink, Download, Eye, Sparkles
} from "lucide-react";
import Link from "next/link";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";
import { toggleTeacherStatusAction } from "@/backend/api/actions/dashboard/admin/teachers/teacherManagementActions";
import TeacherEditDrawer, { TeacherData } from "./TeacherEditDrawer";

interface ClassItem {
  id: string;
  name: string;
  section: string;
}

interface SubjectItem {
  id: string;
  name: string;
  code: string;
}

interface TeacherListClientProps {
  teachers: TeacherData[];
  allClasses: ClassItem[];
  allSubjects: SubjectItem[];
}

export default function TeacherListClient({
  teachers,
  allClasses,
  allSubjects,
}: TeacherListClientProps) {
  const router = useRouter();
  const confirm = useConfirm();

  // Controls & State
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [subjectFilter, setSubjectFilter] = useState<string>("ALL");
  const [classFilter, setClassFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"NAME_ASC" | "NAME_DESC" | "DATE_DESC" | "DATE_ASC" | "STATUS">("NAME_ASC");
  const [viewMode, setViewMode] = useState<"GRID" | "LIST">("GRID");

  // Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<TeacherData | null>(null);

  // Debounce search by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Filtering & Sorting
  const filteredAndSortedTeachers = useMemo(() => {
    return teachers
      .filter((teacher) => {
        // Search
        if (debouncedSearch.trim()) {
          const q = debouncedSearch.toLowerCase().trim();
          const nameMatch = (teacher.user.name || "").toLowerCase().includes(q);
          const emailMatch = (teacher.user.email || "").toLowerCase().includes(q);
          const googleMatch = (teacher.user.googleEmail || "").toLowerCase().includes(q);
          const phoneMatch = (teacher.phone || "").toLowerCase().includes(q);
          const idMatch = teacher.id.toLowerCase().includes(q);
          const subjectMatch = teacher.subjects.some(s => s.name.toLowerCase().includes(q));
          if (!nameMatch && !emailMatch && !googleMatch && !phoneMatch && !idMatch && !subjectMatch) {
            return false;
          }
        }

        // Status Filter
        if (statusFilter === "ACTIVE" && !teacher.isActive) return false;
        if (statusFilter === "INACTIVE" && teacher.isActive) return false;

        // Subject Filter
        if (subjectFilter !== "ALL") {
          const hasSubject = teacher.subjects.some(s => s.id === subjectFilter || s.name === subjectFilter);
          if (!hasSubject) return false;
        }

        // Class Filter
        if (classFilter !== "ALL") {
          const hasClass = teacher.classes.some(c => c.id === classFilter);
          if (!hasClass) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "NAME_ASC") {
          return (a.user.name || "").localeCompare(b.user.name || "");
        }
        if (sortBy === "NAME_DESC") {
          return (b.user.name || "").localeCompare(a.user.name || "");
        }
        if (sortBy === "DATE_DESC") {
          const dateA = a.joinDate ? new Date(a.joinDate).getTime() : 0;
          const dateB = b.joinDate ? new Date(b.joinDate).getTime() : 0;
          return dateB - dateA;
        }
        if (sortBy === "DATE_ASC") {
          const dateA = a.joinDate ? new Date(a.joinDate).getTime() : 0;
          const dateB = b.joinDate ? new Date(b.joinDate).getTime() : 0;
          return dateA - dateB;
        }
        if (sortBy === "STATUS") {
          return (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0);
        }
        return 0;
      });
  }, [teachers, debouncedSearch, statusFilter, subjectFilter, classFilter, sortBy]);

  const handleOpenAdd = () => {
    setEditingTeacher(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (t: TeacherData) => {
    setEditingTeacher(t);
    setIsDrawerOpen(true);
  };

  const handleQuickToggleStatus = async (teacher: TeacherData) => {
    const actionLabel = teacher.isActive ? "Deactivate" : "Activate";
    const confirmed = await confirm({
      title: `${actionLabel} ${teacher.user.name}?`,
      message: teacher.isActive
        ? "Deactivating this teacher will immediately revoke login access. Their historical attendance and report-card records will remain intact."
        : "Activating this teacher will restore their login access.",
      confirmText: actionLabel,
      cancelText: "Cancel",
      variant: teacher.isActive ? "warning" : "primary",
    });

    if (!confirmed) return;

    await toggleTeacherStatusAction(teacher.id);
    router.refresh();
  };

  return (
    <div style={{ marginTop: "1.5rem", width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      {/* Top Controls Bar */}
      <div
        style={{
          background: "var(--card-bg, #0f172a)",
          border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
          borderRadius: "14px",
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          marginBottom: "1.5rem",
          boxShadow: "0 4px 20px -5px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          {/* Search Input */}
          <div style={{ position: "relative", flex: "1 1 280px", minWidth: "220px" }}>
            <Search
              size={18}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-secondary, #94a3b8)",
              }}
            />
            <input
              type="text"
              placeholder="Search by name, email, phone, ID, subject..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%",
                padding: "0.65rem 1rem 0.65rem 2.4rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.12))",
                background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                color: "inherit",
                fontSize: "0.88rem",
              }}
            />
          </div>

          {/* Action & View Toggles */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            {/* View Mode Switcher */}
            <div
              style={{
                display: "flex",
                background: "rgba(0, 0, 0, 0.2)",
                borderRadius: "8px",
                padding: "2px",
                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
              }}
            >
              <button
                type="button"
                onClick={() => setViewMode("GRID")}
                style={{
                  padding: "0.45rem 0.65rem",
                  borderRadius: "6px",
                  border: "none",
                  background: viewMode === "GRID" ? "var(--primary, #3b82f6)" : "transparent",
                  color: viewMode === "GRID" ? "#ffffff" : "var(--text-secondary, #94a3b8)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
                title="Grid View"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("LIST")}
                style={{
                  padding: "0.45rem 0.65rem",
                  borderRadius: "6px",
                  border: "none",
                  background: viewMode === "LIST" ? "var(--primary, #3b82f6)" : "transparent",
                  color: viewMode === "LIST" ? "#ffffff" : "var(--text-secondary, #94a3b8)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
                title="List View"
              >
                <List size={16} />
              </button>
            </div>

            {/* + Add Teacher Button */}
            <button
              type="button"
              onClick={handleOpenAdd}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0.65rem 1.25rem",
                borderRadius: "8px",
                border: "none",
                background: "var(--primary, #3b82f6)",
                color: "#ffffff",
                fontSize: "0.88rem",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 2px 10px rgba(59, 130, 246, 0.35)",
              }}
            >
              <Plus size={17} />
              <span>Add Teacher</span>
            </button>
          </div>
        </div>

        {/* Filters and Sorters Row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: "0.55rem 0.85rem",
              borderRadius: "8px",
              border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
              background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
              color: "inherit",
              fontSize: "0.85rem",
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>

          {/* Subject Filter */}
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            style={{
              padding: "0.55rem 0.85rem",
              borderRadius: "8px",
              border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
              background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
              color: "inherit",
              fontSize: "0.85rem",
            }}
          >
            <option value="ALL">All Subjects</option>
            {allSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Class Filter */}
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            style={{
              padding: "0.55rem 0.85rem",
              borderRadius: "8px",
              border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
              background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
              color: "inherit",
              fontSize: "0.85rem",
            }}
          >
            <option value="ALL">All Classes</option>
            {allClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} - {c.section}
              </option>
            ))}
          </select>

          {/* Sorter */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <ArrowUpDown size={15} style={{ color: "var(--text-secondary, #94a3b8)" }} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                padding: "0.55rem 0.85rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
                color: "inherit",
                fontSize: "0.85rem",
              }}
            >
              <option value="NAME_ASC">Name (A → Z)</option>
              <option value="NAME_DESC">Name (Z → A)</option>
              <option value="DATE_DESC">Newest Joined</option>
              <option value="DATE_ASC">Oldest Joined</option>
              <option value="STATUS">Active First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Teachers Content View */}
      {filteredAndSortedTeachers.length === 0 ? (
        <div
          style={{
            padding: "4rem 2rem",
            textAlign: "center",
            background: "var(--card-bg, #0f172a)",
            border: "1px dashed var(--border-color, rgba(255, 255, 255, 0.15))",
            borderRadius: "14px",
            color: "var(--text-secondary, #94a3b8)",
          }}
        >
          <User size={48} style={{ opacity: 0.3, marginBottom: "1rem" }} />
          <h3 style={{ margin: 0, fontSize: "1.1rem", color: "var(--text-primary, #f8fafc)" }}>No teachers match criteria</h3>
          <p style={{ margin: "0.5rem 0 1.5rem 0", fontSize: "0.85rem" }}>Try adjusting your search terms or filters.</p>
          <button
            type="button"
            onClick={handleOpenAdd}
            style={{
              padding: "0.6rem 1.25rem",
              borderRadius: "8px",
              background: "rgba(59, 130, 246, 0.15)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              color: "#60a5fa",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Add New Teacher
          </button>
        </div>
      ) : viewMode === "GRID" ? (
        /* Responsive Card Grid: 1 col mobile, 2 col tablet, 3-4 col desktop */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
            gap: "1.25rem",
          }}
        >
          {filteredAndSortedTeachers.map((teacher) => {
            const initials = (teacher.user.name || "T")
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            return (
              <div
                key={teacher.id}
                onClick={() => handleOpenEdit(teacher)}
                style={{
                  background: "var(--card-bg, #0f172a)",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                  borderRadius: "14px",
                  padding: "1.25rem",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  transition: "all 0.2s ease",
                  boxShadow: "0 4px 14px rgba(0, 0, 0, 0.2)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--primary, #3b82f6)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-color, rgba(255, 255, 255, 0.08))";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div>
                  {/* Card Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.85rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "12px",
                          background: teacher.isActive ? "rgba(59, 130, 246, 0.15)" : "rgba(148, 163, 184, 0.12)",
                          color: teacher.isActive ? "#60a5fa" : "#94a3b8",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "1rem",
                        }}
                      >
                        {initials}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.98rem", color: "var(--text-primary, #f8fafc)" }}>
                          {teacher.user.name}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary, #94a3b8)", opacity: 0.8 }}>
                          {teacher.user.email}
                        </div>
                      </div>
                    </div>

                    <span
                      style={{
                        padding: "0.2rem 0.6rem",
                        borderRadius: "12px",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        background: teacher.isActive ? "rgba(16, 185, 129, 0.15)" : "rgba(148, 163, 184, 0.12)",
                        color: teacher.isActive ? "#34d399" : "#94a3b8",
                        border: teacher.isActive ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(148, 163, 184, 0.2)",
                      }}
                    >
                      {teacher.isActive ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </div>

                  {/* Class Teacher Badge if assigned */}
                  {teacher.classTeacherOf && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "0.25rem 0.6rem",
                        background: "rgba(168, 85, 247, 0.15)",
                        border: "1px solid rgba(168, 85, 247, 0.3)",
                        color: "#c084fc",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        marginBottom: "0.75rem",
                      }}
                    >
                      Class Teacher: {teacher.classTeacherOf.name}-{teacher.classTeacherOf.section}
                    </div>
                  )}

                  {/* Subject Pills */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.85rem" }}>
                    {teacher.subjects.length > 0 ? (
                      teacher.subjects.map((s) => (
                        <span
                          key={s.id}
                          style={{
                            padding: "0.15rem 0.5rem",
                            borderRadius: "12px",
                            fontSize: "0.72rem",
                            background: "rgba(59, 130, 246, 0.08)",
                            border: "1px solid rgba(59, 130, 246, 0.2)",
                            color: "#93c5fd",
                          }}
                        >
                          {s.name}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary, #94a3b8)", fontStyle: "italic" }}>
                        No subjects assigned
                      </span>
                    )}
                  </div>

                  {/* Contact / Phone */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", color: "var(--text-secondary, #94a3b8)", marginBottom: "0.5rem" }}>
                    <Phone size={13} />
                    <span>{teacher.phone || "No phone listed"}</span>
                  </div>
                </div>

                {/* Card Actions Bottom Bar */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    paddingTop: "0.85rem",
                    borderTop: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                    marginTop: "0.5rem",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(teacher)}
                    style={{
                      flex: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.35rem",
                      padding: "0.45rem 0.75rem",
                      borderRadius: "6px",
                      border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                      background: "rgba(255, 255, 255, 0.04)",
                      color: "inherit",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <Edit2 size={13} />
                    <span>Edit Profile</span>
                  </button>

                  <Link
                    href={`/dashboard/admin/timetable?weekOf=${new Date().toISOString().split("T")[0]}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0.45rem 0.65rem",
                      borderRadius: "6px",
                      border: "1px solid rgba(59, 130, 246, 0.2)",
                      background: "rgba(59, 130, 246, 0.08)",
                      color: "#60a5fa",
                      fontSize: "0.8rem",
                      textDecoration: "none",
                    }}
                    title="View Timetable"
                  >
                    <Calendar size={14} />
                  </Link>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuickToggleStatus(teacher);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0.45rem 0.65rem",
                      borderRadius: "6px",
                      border: teacher.isActive ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid rgba(16, 185, 129, 0.2)",
                      background: teacher.isActive ? "rgba(239, 68, 68, 0.08)" : "rgba(16, 185, 129, 0.08)",
                      color: teacher.isActive ? "#f87171" : "#34d399",
                      cursor: "pointer",
                    }}
                    title={teacher.isActive ? "Deactivate Account" : "Activate Account"}
                  >
                    {teacher.isActive ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table List View */
        <div
          style={{
            background: "var(--card-bg, #0f172a)",
            border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
            borderRadius: "14px",
            overflow: "hidden",
            boxShadow: "0 4px 20px -5px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ overflowX: "auto", width: "100%", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "750px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))", background: "rgba(0, 0, 0, 0.15)" }}>
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.82rem", fontWeight: 700 }}>Teacher Name</th>
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.82rem", fontWeight: 700 }}>Email & SSO</th>
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.82rem", fontWeight: 700 }}>Phone</th>
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.82rem", fontWeight: 700 }}>Subjects</th>
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.82rem", fontWeight: 700 }}>Status</th>
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.82rem", fontWeight: 700, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedTeachers.map((teacher) => (
                  <tr
                    key={teacher.id}
                    style={{ borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.05))" }}
                  >
                    <td style={{ padding: "0.85rem 1rem" }}>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{teacher.user.name}</div>
                      {teacher.classTeacherOf && (
                        <span style={{ fontSize: "0.72rem", color: "#c084fc", fontWeight: 600 }}>
                          Class Teacher: {teacher.classTeacherOf.name}-{teacher.classTeacherOf.section}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "0.85rem 1rem", fontSize: "0.85rem" }}>
                      <div>{teacher.user.email}</div>
                      {teacher.user.googleEmail && (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary, #94a3b8)" }}>
                          Google: {teacher.user.googleEmail}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "0.85rem 1rem", fontSize: "0.85rem" }}>{teacher.phone || "-"}</td>
                    <td style={{ padding: "0.85rem 1rem" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                        {teacher.subjects.slice(0, 3).map((s) => (
                          <span
                            key={s.id}
                            style={{
                              fontSize: "0.72rem",
                              padding: "0.1rem 0.4rem",
                              borderRadius: "10px",
                              background: "rgba(59, 130, 246, 0.1)",
                              color: "#60a5fa",
                            }}
                          >
                            {s.name}
                          </span>
                        ))}
                        {teacher.subjects.length > 3 && (
                          <span style={{ fontSize: "0.72rem", color: "var(--text-secondary, #94a3b8)" }}>
                            +{teacher.subjects.length - 3} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "0.85rem 1rem" }}>
                      <span
                        style={{
                          padding: "0.2rem 0.55rem",
                          borderRadius: "10px",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          background: teacher.isActive ? "rgba(16, 185, 129, 0.15)" : "rgba(148, 163, 184, 0.12)",
                          color: teacher.isActive ? "#34d399" : "#94a3b8",
                        }}
                      >
                        {teacher.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ padding: "0.85rem 1rem", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(teacher)}
                        style={{
                          padding: "0.4rem 0.75rem",
                          borderRadius: "6px",
                          border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                          background: "rgba(255, 255, 255, 0.05)",
                          color: "inherit",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit / Add Drawer */}
      <TeacherEditDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        teacher={editingTeacher}
        allClasses={allClasses}
        allSubjects={allSubjects}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </div>
  );
}
