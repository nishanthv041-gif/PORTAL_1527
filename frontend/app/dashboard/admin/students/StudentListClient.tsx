"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Plus, LayoutGrid, List, User, GraduationCap, Phone,
  Users, CheckCircle2, XCircle, Edit2, ArrowRight, BookOpen,
  ArrowUpDown, Filter, ChevronRight, FileText, ArrowLeftRight
} from "lucide-react";
import Link from "next/link";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";
import { toggleStudentStatusAction } from "@/backend/api/actions/dashboard/admin/students/studentManagementActions";
import StudentEditDrawer, { StudentData } from "./StudentEditDrawer";

interface ClassItem {
  id: string;
  name: string;
  section: string;
  classTeacher?: {
    id: string;
    user?: { name: string } | null;
  } | null;
}

interface StudentListClientProps {
  students: StudentData[];
  classes: ClassItem[];
}

export default function StudentListClient({ students, classes }: StudentListClientProps) {
  const router = useRouter();
  const confirm = useConfirm();

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedClassId, setSelectedClassId] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [residenceFilter, setResidenceFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"ROLL" | "NAME" | "ADM">("ROLL");
  const [viewMode, setViewMode] = useState<"GRID" | "LIST">("LIST");

  // Drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentData | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Compute student counts per class
  const classStudentCounts = useMemo(() => {
    const map = new Map<string, number>();
    students.forEach((s) => {
      if (s.classId) {
        map.set(s.classId, (map.get(s.classId) || 0) + 1);
      }
    });
    return map;
  }, [students]);

  // Existing parents for sibling linking
  const existingParents = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string; phone: string | null }>();
    students.forEach((s) => {
      s.parents?.forEach((pRel) => {
        const p = pRel.parent;
        if (p && !map.has(p.id)) {
          map.set(p.id, {
            id: p.id,
            name: p.user?.name || "Parent",
            email: p.user?.email || "",
            phone: p.phone,
          });
        }
      });
    });
    return Array.from(map.values());
  }, [students]);

  // Filter & Sort Students
  const filteredStudents = useMemo(() => {
    return students
      .filter((student) => {
        // Search
        if (debouncedSearch.trim()) {
          const q = debouncedSearch.toLowerCase().trim();
          const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
          const rollMatch = student.rollNumber.toLowerCase().includes(q);
          const admMatch = student.admissionNo.toLowerCase().includes(q);
          const nameMatch = fullName.includes(q);
          const parentNameMatch = student.parents?.some(p => p.parent.user?.name?.toLowerCase().includes(q));
          const parentPhoneMatch = student.parents?.some(p => p.parent.phone?.toLowerCase().includes(q));
          const parentEmailMatch = student.parents?.some(p => p.parent.user?.email?.toLowerCase().includes(q));
          const className = `${student.class?.name || ""} ${student.class?.section || ""}`.toLowerCase();
          const classMatch = className.includes(q);

          if (!rollMatch && !admMatch && !nameMatch && !parentNameMatch && !parentPhoneMatch && !parentEmailMatch && !classMatch) {
            return false;
          }
        }

        // Class Filter
        if (selectedClassId !== "ALL" && student.classId !== selectedClassId) {
          return false;
        }

        // Status Filter
        if (statusFilter === "ACTIVE" && !student.isActive) return false;
        if (statusFilter === "INACTIVE" && student.isActive) return false;

        // Residence
        if (residenceFilter !== "ALL" && student.residenceType !== residenceFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "ROLL") {
          const numA = parseInt(a.rollNumber, 10);
          const numB = parseInt(b.rollNumber, 10);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.rollNumber.localeCompare(b.rollNumber);
        }
        if (sortBy === "NAME") {
          return a.firstName.localeCompare(b.firstName);
        }
        if (sortBy === "ADM") {
          return a.admissionNo.localeCompare(b.admissionNo);
        }
        return 0;
      });
  }, [students, debouncedSearch, selectedClassId, statusFilter, residenceFilter, sortBy]);

  const handleOpenAdd = () => {
    setEditingStudent(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (s: StudentData) => {
    setEditingStudent(s);
    setIsDrawerOpen(true);
  };

  const handleQuickToggleStatus = async (student: StudentData) => {
    const actionLabel = student.isActive ? "Deactivate" : "Activate";
    const confirmed = await confirm({
      title: `${actionLabel} ${student.firstName}?`,
      message: student.isActive
        ? "Deactivating this student marks their enrollment status as inactive. All historical records remain intact."
        : "Activating this student restores active enrollment in their class.",
      confirmText: actionLabel,
      cancelText: "Cancel",
      variant: student.isActive ? "warning" : "primary",
    });

    if (!confirmed) return;

    await toggleStudentStatusAction(student.id);
    router.refresh();
  };

  const selectedClassObj = classes.find(c => c.id === selectedClassId);

  return (
    <div style={{ marginTop: "1.5rem", width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      {/* SECTION 1: CLASSES OVERVIEW GRID */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary, #f8fafc)" }}>
            Classes & Sections
          </h2>
          <span style={{ fontSize: "0.82rem", color: "var(--text-secondary, #94a3b8)" }}>
            {classes.length} Classes • {students.length} Total Enrolled
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
            gap: "0.85rem",
          }}
        >
          {/* "All Classes" Card */}
          <div
            onClick={() => setSelectedClassId("ALL")}
            style={{
              padding: "1rem",
              borderRadius: "12px",
              cursor: "pointer",
              transition: "all 0.2s ease",
              background: selectedClassId === "ALL" ? "rgba(59, 130, 246, 0.15)" : "var(--card-bg, #0f172a)",
              border: selectedClassId === "ALL" ? "1.5px solid var(--primary, #3b82f6)" : "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.4rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: selectedClassId === "ALL" ? "#60a5fa" : "inherit" }}>
                All Students
              </div>
              <span
                style={{
                  fontSize: "0.75rem",
                  padding: "0.15rem 0.5rem",
                  borderRadius: "10px",
                  background: "rgba(59, 130, 246, 0.2)",
                  color: "#60a5fa",
                  fontWeight: 700,
                }}
              >
                {students.length}
              </span>
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary, #94a3b8)" }}>
              Full school roster
            </div>
          </div>

          {/* Individual Class Cards */}
          {classes.map((c) => {
            const count = classStudentCounts.get(c.id) || 0;
            const isSelected = selectedClassId === c.id;
            const teacherName = c.classTeacher?.user?.name || "Unassigned";

            return (
              <div
                key={c.id}
                onClick={() => setSelectedClassId(c.id)}
                style={{
                  padding: "1rem",
                  borderRadius: "12px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  background: isSelected ? "rgba(59, 130, 246, 0.15)" : "var(--card-bg, #0f172a)",
                  border: isSelected ? "1.5px solid var(--primary, #3b82f6)" : "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.4rem" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.95rem", color: isSelected ? "#60a5fa" : "inherit" }}>
                    {c.name} - {c.section}
                  </div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.15rem 0.5rem",
                      borderRadius: "10px",
                      background: count > 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(148, 163, 184, 0.12)",
                      color: count > 0 ? "#34d399" : "#94a3b8",
                      fontWeight: 700,
                    }}
                  >
                    {count}
                  </span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary, #94a3b8)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  Teacher: {teacherName}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: TOP CONTROLS BAR */}
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
          <div style={{ position: "relative", flex: "1 1 300px", minWidth: "220px" }}>
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
              placeholder="Search name, roll no, admission no, parent, phone..."
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
                title="Roster List"
              >
                <List size={16} />
              </button>
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
                title="Cards Grid"
              >
                <LayoutGrid size={16} />
              </button>
            </div>

            {/* + Add Student Button */}
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
              <span>Add Student</span>
            </button>
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          {/* Class Filter */}
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            style={{
              padding: "0.55rem 0.85rem",
              borderRadius: "8px",
              border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
              background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
              color: "inherit",
              fontSize: "0.85rem",
            }}
          >
            <option value="ALL">All Classes ({students.length})</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} - {c.section} ({classStudentCounts.get(c.id) || 0})
              </option>
            ))}
          </select>

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

          {/* Residence Filter */}
          <select
            value={residenceFilter}
            onChange={(e) => setResidenceFilter(e.target.value)}
            style={{
              padding: "0.55rem 0.85rem",
              borderRadius: "8px",
              border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
              background: "var(--input-bg, rgba(0, 0, 0, 0.2))",
              color: "inherit",
              fontSize: "0.85rem",
            }}
          >
            <option value="ALL">All Residencies</option>
            <option value="DAYSCHOLAR">Day Scholar</option>
            <option value="HOSTEL">Hostel</option>
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
              <option value="ROLL">Roll Number</option>
              <option value="NAME">First Name (A-Z)</option>
              <option value="ADM">Admission No</option>
            </select>
          </div>
        </div>
      </div>

      {/* SECTION 3: CLASS VIEW HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
          padding: "0.5rem 0",
        }}
      >
        <div>
          <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary, #f8fafc)" }}>
            {selectedClassObj ? `${selectedClassObj.name} - ${selectedClassObj.section}` : "All School Students"}
          </span>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary, #94a3b8)", marginLeft: "0.75rem" }}>
            Showing {filteredStudents.length} student{filteredStudents.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* SECTION 4: STUDENT ROSTER (LIST OR GRID) */}
      {filteredStudents.length === 0 ? (
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
          <GraduationCap size={48} style={{ opacity: 0.3, marginBottom: "1rem" }} />
          <h3 style={{ margin: 0, fontSize: "1.1rem", color: "var(--text-primary, #f8fafc)" }}>No students match criteria</h3>
          <p style={{ margin: "0.5rem 0 1.5rem 0", fontSize: "0.85rem" }}>Try adjusting your search terms or class filter.</p>
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
            + Enroll New Student
          </button>
        </div>
      ) : viewMode === "LIST" ? (
        /* Roster Table List */
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
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "800px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))", background: "rgba(0, 0, 0, 0.15)" }}>
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.82rem", fontWeight: 700 }}>Roll No</th>
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.82rem", fontWeight: 700 }}>Student Name</th>
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.82rem", fontWeight: 700 }}>Class</th>
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.82rem", fontWeight: 700 }}>Parent / Guardian</th>
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.82rem", fontWeight: 700 }}>Parent Phone</th>
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.82rem", fontWeight: 700 }}>Status</th>
                  <th style={{ padding: "0.85rem 1rem", fontSize: "0.82rem", fontWeight: 700, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => {
                  const parent = student.parents?.[0]?.parent;
                  const parentName = parent?.user?.name || "None Linked";
                  const parentPhone = parent?.phone || "-";

                  return (
                    <tr
                      key={student.id}
                      style={{ borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.05))" }}
                    >
                      <td style={{ padding: "0.85rem 1rem", fontSize: "0.85rem", fontWeight: 700, color: "var(--primary, #3b82f6)" }}>
                        {student.rollNumber}
                      </td>
                      <td style={{ padding: "0.85rem 1rem" }}>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                          {student.firstName} {student.lastName}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-secondary, #94a3b8)" }}>
                          Adm: {student.admissionNo} • {student.gender || "Gender N/A"}
                        </div>
                      </td>
                      <td style={{ padding: "0.85rem 1rem", fontSize: "0.85rem" }}>
                        {student.class ? `${student.class.name}-${student.class.section}` : "Unassigned"}
                      </td>
                      <td style={{ padding: "0.85rem 1rem", fontSize: "0.85rem" }}>
                        <div>{parentName}</div>
                        {parent?.user?.email && (
                          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary, #94a3b8)" }}>
                            {parent.user.email}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "0.85rem 1rem", fontSize: "0.85rem" }}>{parentPhone}</td>
                      <td style={{ padding: "0.85rem 1rem" }}>
                        <span
                          style={{
                            padding: "0.2rem 0.55rem",
                            borderRadius: "10px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            background: student.isActive ? "rgba(16, 185, 129, 0.15)" : "rgba(148, 163, 184, 0.12)",
                            color: student.isActive ? "#34d399" : "#94a3b8",
                          }}
                        >
                          {student.isActive ? "Enrolled" : "Inactive"}
                        </span>
                      </td>
                      <td style={{ padding: "0.85rem 1rem", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "0.4rem" }}>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(student)}
                            style={{
                              padding: "0.35rem 0.75rem",
                              borderRadius: "6px",
                              border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                              background: "rgba(255, 255, 255, 0.05)",
                              color: "inherit",
                              fontSize: "0.8rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Edit
                          </button>
                          <Link
                            href={`/dashboard/teacher/report-cards?studentId=${student.id}`}
                            style={{
                              padding: "0.35rem 0.65rem",
                              borderRadius: "6px",
                              border: "1px solid rgba(59, 130, 246, 0.2)",
                              background: "rgba(59, 130, 246, 0.08)",
                              color: "#60a5fa",
                              fontSize: "0.8rem",
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                            }}
                            title="Report Cards"
                          >
                            <FileText size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Card Grid View */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "1.25rem",
          }}
        >
          {filteredStudents.map((student) => {
            const parent = student.parents?.[0]?.parent;
            const initials = `${student.firstName?.[0] || ""}${student.lastName?.[0] || ""}`.toUpperCase() || "S";

            return (
              <div
                key={student.id}
                style={{
                  background: "var(--card-bg, #0f172a)",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                  borderRadius: "14px",
                  padding: "1.25rem",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  boxShadow: "0 4px 14px rgba(0, 0, 0, 0.2)",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.85rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "12px",
                          background: student.isActive ? "rgba(59, 130, 246, 0.15)" : "rgba(148, 163, 184, 0.12)",
                          color: student.isActive ? "#60a5fa" : "#94a3b8",
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
                          {student.firstName} {student.lastName}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary, #94a3b8)" }}>
                          Roll #{student.rollNumber} • {student.class ? `${student.class.name}-${student.class.section}` : "No Class"}
                        </div>
                      </div>
                    </div>

                    <span
                      style={{
                        padding: "0.2rem 0.55rem",
                        borderRadius: "10px",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        background: student.isActive ? "rgba(16, 185, 129, 0.15)" : "rgba(148, 163, 184, 0.12)",
                        color: student.isActive ? "#34d399" : "#94a3b8",
                      }}
                    >
                      {student.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div style={{ fontSize: "0.78rem", color: "var(--text-secondary, #94a3b8)", marginBottom: "0.4rem" }}>
                    <strong>Admission No:</strong> {student.admissionNo}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-secondary, #94a3b8)", marginBottom: "0.4rem" }}>
                    <strong>Parent:</strong> {parent?.user?.name || "None linked"}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-secondary, #94a3b8)", marginBottom: "0.85rem" }}>
                    <strong>Phone:</strong> {parent?.phone || "No phone"}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    paddingTop: "0.85rem",
                    borderTop: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(student)}
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
                    href={`/dashboard/teacher/report-cards?studentId=${student.id}`}
                    style={{
                      padding: "0.45rem 0.65rem",
                      borderRadius: "6px",
                      border: "1px solid rgba(59, 130, 246, 0.2)",
                      background: "rgba(59, 130, 246, 0.08)",
                      color: "#60a5fa",
                      fontSize: "0.8rem",
                      textDecoration: "none",
                    }}
                    title="Report Card"
                  >
                    <FileText size={14} />
                  </Link>

                  <button
                    type="button"
                    onClick={() => handleQuickToggleStatus(student)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0.45rem 0.65rem",
                      borderRadius: "6px",
                      border: student.isActive ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid rgba(16, 185, 129, 0.2)",
                      background: student.isActive ? "rgba(239, 68, 68, 0.08)" : "rgba(16, 185, 129, 0.08)",
                      color: student.isActive ? "#f87171" : "#34d399",
                      cursor: "pointer",
                    }}
                    title={student.isActive ? "Deactivate" : "Activate"}
                  >
                    {student.isActive ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit / Add Student Drawer */}
      <StudentEditDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        student={editingStudent}
        allClasses={classes}
        existingParents={existingParents}
        defaultClassId={selectedClassId !== "ALL" ? selectedClassId : undefined}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </div>
  );
}
