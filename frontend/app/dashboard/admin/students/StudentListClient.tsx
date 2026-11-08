"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, LayoutGrid, List,
  CheckCircle2, XCircle, Edit2,
  ArrowUpDown, FileText, Trash2, Loader2
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";
import {
  toggleStudentStatusAction,
  deleteStudentPermanentlyAction
} from "@/backend/api/actions/dashboard/admin/students/studentManagementActions";
import type { StudentData } from "./StudentEditDrawer";
import { SearchBar, ResultsContainer } from "@/frontend/components/ui";
import { SingleSelect } from "@/frontend/components/ui/form";
import { useOptimisticList } from "@/frontend/hooks/useOptimisticList";

const StudentEditDrawer = dynamic(() => import("./StudentEditDrawer"), {
  ssr: false,
});

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

  const {
    items: localStudents,
    optimisticDelete,
    optimisticUpdate,
    setItems: setLocalStudents,
  } = useOptimisticList<StudentData>(students);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedClassId, setSelectedClassId] = useState<string>(() => classes[0]?.id || "");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [residenceFilter, setResidenceFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"ROLL" | "NAME" | "ADM">("ROLL");
  const [viewMode, setViewMode] = useState<"GRID" | "LIST">("LIST");

  // Drawer
  const [isPendingSearch, setIsPendingSearch] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentData | null>(null);
  const [deletingStudentId, setDeletingStudentId] = useState<string | null>(null);

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
    localStudents.forEach((s) => {
      if (s.classId) {
        map.set(s.classId, (map.get(s.classId) || 0) + 1);
      }
    });
    return map;
  }, [localStudents]);

  // Compute search matches per class when searching
  const classSearchMatches = useMemo(() => {
    if (!debouncedSearch.trim()) return null;
    const q = debouncedSearch.toLowerCase().trim();
    const map = new Map<string, number>();
    localStudents.forEach((student) => {
      if (!student.classId) return;
      const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
      const rollMatch = student.rollNumber.toLowerCase().includes(q);
      const admMatch = student.admissionNo.toLowerCase().includes(q);
      const nameMatch = fullName.includes(q);
      const parentNameMatch = student.parents?.some(p => p.parent.user?.name?.toLowerCase().includes(q));
      const parentPhoneMatch = student.parents?.some(p => p.parent.phone?.toLowerCase().includes(q));
      const parentEmailMatch = student.parents?.some(p => p.parent.user?.email?.toLowerCase().includes(q));

      if (rollMatch || admMatch || nameMatch || parentNameMatch || parentPhoneMatch || parentEmailMatch) {
        map.set(student.classId, (map.get(student.classId) || 0) + 1);
      }
    });
    return map;
  }, [localStudents, debouncedSearch]);

  // Existing parents for sibling linking
  const existingParents = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string; phone: string | null }>();
    localStudents.forEach((s) => {
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
  }, [localStudents]);

  // Filter & Sort Students
  const filteredStudents = useMemo(() => {
    return localStudents
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

          if (!rollMatch && !admMatch && !nameMatch && !parentNameMatch && !parentPhoneMatch && !parentEmailMatch) {
            return false;
          }
        }

        // Class Filter: strictly class-wise
        if (!selectedClassId || student.classId !== selectedClassId) {
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
  }, [localStudents, debouncedSearch, selectedClassId, statusFilter, residenceFilter, sortBy]);

  // Pagination (20 per page)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, selectedClassId, statusFilter, residenceFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, currentPage, pageSize]);

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

    // Instant optimistic update
    const targetStatus = !student.isActive;
    optimisticUpdate(student.id, { isActive: targetStatus }, async () => {
      const res = await toggleStudentStatusAction(student.id);
      if (res && "error" in res && res.error) {
        throw new Error(String(res.error));
      }
      return { ...student, isActive: targetStatus };
    });
  };

  const handleDeleteStudent = async (student: StudentData) => {
    const studentFullName = `${student.firstName} ${student.lastName || ""}`.trim();
    const confirmed = await confirm({
      title: `Delete Student "${studentFullName}"?`,
      message: `Are you sure you want to permanently delete ${studentFullName} (Admission: ${student.admissionNo || student.rollNumber})? This will permanently remove their records, report cards, and enrollments from the database.`,
      confirmText: "Delete Student",
      cancelText: "Cancel",
      variant: "danger",
    });

    if (!confirmed) return;

    // Instant optimistic delete (< 20ms) with 5-second Undo action toast!
    optimisticDelete(
      student.id,
      async (id) => {
        const res = await deleteStudentPermanentlyAction(id);
        if (res?.error) {
          throw new Error(res.error);
        }
      },
      {
        itemName: `Student ${studentFullName}`,
      }
    );
  };

  const selectedClassObj = classes.find(c => c.id === selectedClassId);

  return (
    <div style={{ marginTop: "1.5rem", width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      {/* SECTION 1: SEARCH & CONTROLS */}
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
          <div style={{ flex: "1 1 300px", minWidth: "220px", maxWidth: "100%" }}>
            <SearchBar
              placeholder="Search name, roll no, admission no, parent, phone..."
              value={searchTerm}
              onChange={(val) => setSearchTerm(val)}
              onPendingChange={(pending) => setIsPendingSearch(pending)}
              style={{ maxWidth: "100%" }}
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
          <div style={{ minWidth: "220px", flex: "1 1 220px" }}>
            <SingleSelect
              value={selectedClassId}
              onChange={setSelectedClassId}
              options={classes.map((c) => ({
                value: c.id,
                label: `Class: ${c.name} - ${c.section}`,
                badge: `${classStudentCounts.get(c.id) || 0} students`,
              }))}
              searchable={true}
              placeholder="Select class..."
              searchPlaceholder="Search classes..."
            />
          </div>

          {/* Status Filter */}
          <div style={{ minWidth: "160px" }}>
            <SingleSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "ALL", label: "All Statuses" },
                { value: "ACTIVE", label: "Active Only" },
                { value: "INACTIVE", label: "Inactive Only" },
              ]}
              searchable={false}
              placeholder="Status..."
            />
          </div>

          {/* Residence Filter */}
          <div style={{ minWidth: "160px" }}>
            <SingleSelect
              value={residenceFilter}
              onChange={setResidenceFilter}
              options={[
                { value: "ALL", label: "All Residencies" },
                { value: "DAYSCHOLAR", label: "Day Scholar" },
                { value: "HOSTEL", label: "Hostel" },
              ]}
              searchable={false}
              placeholder="Residence..."
            />
          </div>

          {/* Sorter */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.4rem", minWidth: "180px" }}>
            <ArrowUpDown size={15} style={{ color: "var(--text-secondary, #94a3b8)", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <SingleSelect
                value={sortBy}
                onChange={(val) => setSortBy(val as any)}
                options={[
                  { value: "ROLL", label: "Roll Number" },
                  { value: "NAME", label: "First Name (A-Z)" },
                  { value: "ADM", label: "Admission No" },
                ]}
                searchable={false}
                placeholder="Sort by..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: CLASSES OVERVIEW GRID (CLICK TO SWITCH CLASS) */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary, #f8fafc)" }}>
              Classes &amp; Sections
            </h2>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary, #94a3b8)", marginTop: "0.2rem" }}>
              Select a class below to view its students roster
            </div>
          </div>
          <span style={{ fontSize: "0.82rem", color: "var(--text-secondary, #94a3b8)" }}>
            {classes.length} Classes Available
          </span>
        </div>

        {classes.length === 0 ? (
          <div
            style={{
              padding: "1.5rem",
              borderRadius: "12px",
              background: "var(--card-bg, #0f172a)",
              border: "1px dashed var(--border-color, rgba(255, 255, 255, 0.15))",
              color: "var(--text-secondary, #94a3b8)",
              textAlign: "center",
              fontSize: "0.9rem",
            }}
          >
            No active classes found. Please create a class in Class Management first.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "0.85rem",
            }}
          >
            {/* Individual Class Cards - No 'All Classes' card */}
            {classes.map((c) => {
              const count = classStudentCounts.get(c.id) || 0;
              const isSelected = selectedClassId === c.id;
              const teacherName = c.classTeacher?.user?.name || "Unassigned";
              const searchMatchCount = classSearchMatches?.get(c.id);

              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedClassId(c.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedClassId(c.id);
                    }
                  }}
                  style={{
                    padding: "1rem",
                    borderRadius: "12px",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    background: isSelected ? "rgba(59, 130, 246, 0.16)" : "var(--card-bg, #0f172a)",
                    border: isSelected
                      ? "2px solid var(--primary, #3b82f6)"
                      : searchMatchCount && searchMatchCount > 0
                      ? "1.5px solid rgba(245, 158, 11, 0.6)"
                      : "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                    boxShadow: isSelected ? "0 0 16px rgba(59, 130, 246, 0.35)" : "0 4px 12px rgba(0,0,0,0.2)",
                    position: "relative",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.4rem" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "1rem", color: isSelected ? "#60a5fa" : "inherit" }}>
                        {c.name} - {c.section}
                      </div>
                      {isSelected ? (
                        <div style={{ fontSize: "0.72rem", color: "#38bdf8", fontWeight: 600, marginTop: "0.15rem" }}>
                          ● Active Class View
                        </div>
                      ) : searchMatchCount && searchMatchCount > 0 ? (
                        <div style={{ fontSize: "0.72rem", color: "#fbbf24", fontWeight: 600, marginTop: "0.15rem" }}>
                          ★ {searchMatchCount} search match{searchMatchCount === 1 ? "" : "es"}
                        </div>
                      ) : null}
                    </div>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        padding: "0.18rem 0.55rem",
                        borderRadius: "10px",
                        background: count > 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(148, 163, 184, 0.12)",
                        color: count > 0 ? "#34d399" : "#94a3b8",
                        fontWeight: 700,
                      }}
                    >
                      {count} {count === 1 ? "student" : "students"}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-secondary, #94a3b8)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: "0.3rem" }}>
                    Teacher: {teacherName}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 3: CLASS VIEW HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
          padding: "0.5rem 0",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary, #f8fafc)" }}>
            {selectedClassObj ? `${selectedClassObj.name.startsWith("Class ") ? selectedClassObj.name : `Class ${selectedClassObj.name}`} - ${selectedClassObj.section} Roster` : "No Class Selected"}
          </span>
          {selectedClassObj?.classTeacher?.user?.name && (
            <span
              style={{
                fontSize: "0.8rem",
                padding: "0.2rem 0.6rem",
                borderRadius: "8px",
                background: "rgba(255, 255, 255, 0.06)",
                color: "var(--text-secondary, #94a3b8)",
              }}
            >
              Class Teacher: <strong style={{ color: "var(--text-primary, #f8fafc)" }}>{selectedClassObj.classTeacher.user.name}</strong>
            </span>
          )}
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary, #94a3b8)" }}>
            • Showing {filteredStudents.length} student{filteredStudents.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* SECTION 4: STUDENT ROSTER (LIST OR GRID) */}
      <ResultsContainer
        isPending={isPendingSearch}
        isEmpty={filteredStudents.length === 0}
        emptyTitle={
          selectedClassObj
            ? `No students found in Class ${selectedClassObj.name} - ${selectedClassObj.section}`
            : "No class selected"
        }
        emptyMessage={
          selectedClassObj
            ? debouncedSearch || statusFilter !== "ALL" || residenceFilter !== "ALL"
              ? "No students in this class match your search or filter criteria."
              : "No students are currently enrolled in this class. Click '+ Add Student' above to enroll students."
            : "Please select a class from the list above to view students."
        }
        onReset={() => {
          setSearchTerm("");
          setStatusFilter("ALL");
          setResidenceFilter("ALL");
        }}
        resetLabel="Reset Search & Filters"
      >
      {viewMode === "LIST" ? (
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
                {paginatedStudents.map((student) => {
                  const parent = student.parents?.[0]?.parent;
                  const parentName = parent?.user?.name || "None Linked";
                  const parentPhone = parent?.phone || "-";

                  return (
                    <tr
                      key={student.id}
                      onClick={() => handleOpenEdit(student)}
                      style={{
                        borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.05))",
                        cursor: "pointer",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(59, 130, 246, 0.06)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
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
                            ID: {parent.user.email}
                          </div>
                        )}
                        {parent?.user?.googleEmail && (
                          <div style={{ fontSize: "0.70rem", color: "#38bdf8", marginTop: "2px" }}>
                            Google: {parent.user.googleEmail}
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
                        <div style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center" }}>
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
                            prefetch={false}
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
                          <button
                            type="button"
                            onClick={() => handleDeleteStudent(student)}
                            disabled={deletingStudentId === student.id}
                            style={{
                              padding: "0.35rem 0.65rem",
                              borderRadius: "6px",
                              border: "1px solid rgba(239, 68, 68, 0.35)",
                              background: "rgba(239, 68, 68, 0.08)",
                              color: "#ef4444",
                              fontSize: "0.8rem",
                              fontWeight: 600,
                              cursor: deletingStudentId === student.id ? "not-allowed" : "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.3rem",
                              opacity: deletingStudentId === student.id ? 0.6 : 1,
                              transition: "all 0.2s ease"
                            }}
                            title="Permanently Delete Student"
                          >
                            {deletingStudentId === student.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                            <span>Delete</span>
                          </button>
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
          {paginatedStudents.map((student) => {
            const parent = student.parents?.[0]?.parent;
            const initials = `${student.firstName?.[0] || ""}${student.lastName?.[0] || ""}`.toUpperCase() || "S";

            return (
              <div
                key={student.id}
                onClick={() => handleOpenEdit(student)}
                style={{
                  background: "var(--card-bg, #0f172a)",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                  borderRadius: "14px",
                  padding: "1.25rem",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  boxShadow: "0 4px 14px rgba(0, 0, 0, 0.2)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
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
                    {parent?.user?.email && (
                      <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary, #94a3b8)" }}>
                        ID: {parent.user.email}
                      </span>
                    )}
                    {parent?.user?.googleEmail && (
                      <span style={{ display: "block", fontSize: "0.72rem", color: "#38bdf8" }}>
                        Google: {parent.user.googleEmail}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-secondary, #94a3b8)", marginBottom: "0.85rem" }}>
                    <strong>Phone:</strong> {parent?.phone || "No phone"}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    paddingTop: "0.85rem",
                    borderTop: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                  }}
                  onClick={(e) => e.stopPropagation()}
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
                      padding: "0.45rem 0.65rem",
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
                    prefetch={false}
                    style={{
                      padding: "0.45rem 0.55rem",
                      borderRadius: "6px",
                      border: "1px solid rgba(59, 130, 246, 0.2)",
                      background: "rgba(59, 130, 246, 0.08)",
                      color: "#60a5fa",
                      fontSize: "0.8rem",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
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
                      padding: "0.45rem 0.55rem",
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

                  <button
                    type="button"
                    onClick={() => handleDeleteStudent(student)}
                    disabled={deletingStudentId === student.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0.45rem 0.55rem",
                      borderRadius: "6px",
                      border: "1px solid rgba(239, 68, 68, 0.35)",
                      background: "rgba(239, 68, 68, 0.08)",
                      color: "#ef4444",
                      cursor: deletingStudentId === student.id ? "not-allowed" : "pointer",
                      opacity: deletingStudentId === student.id ? 0.6 : 1,
                      transition: "all 0.2s ease"
                    }}
                    title="Permanently Delete Student"
                  >
                    {deletingStudentId === student.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls (Limit 20) */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem",
            marginTop: "1rem",
            background: "var(--card-bg, #0f172a)",
            border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
            borderRadius: "12px",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary, #94a3b8)" }}>
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredStudents.length)} of {filteredStudents.length} students
          </span>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              style={{
                padding: "0.45rem 0.9rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                background: currentPage <= 1 ? "rgba(255, 255, 255, 0.03)" : "rgba(255, 255, 255, 0.08)",
                color: currentPage <= 1 ? "var(--text-secondary, #64748b)" : "var(--text-primary, #f8fafc)",
                cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                fontSize: "0.82rem",
                fontWeight: 600,
              }}
            >
              Previous
            </button>
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary, #94a3b8)", padding: "0 0.5rem" }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              style={{
                padding: "0.45rem 0.9rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                background: currentPage >= totalPages ? "rgba(255, 255, 255, 0.03)" : "rgba(255, 255, 255, 0.08)",
                color: currentPage >= totalPages ? "var(--text-secondary, #64748b)" : "var(--text-primary, #f8fafc)",
                cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                fontSize: "0.82rem",
                fontWeight: 600,
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
      </ResultsContainer>

      {/* Edit / Add Student Drawer */}
      <StudentEditDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        student={editingStudent}
        allClasses={classes}
        existingParents={existingParents}
        defaultClassId={selectedClassId || classes[0]?.id || undefined}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </div>
  );
}
