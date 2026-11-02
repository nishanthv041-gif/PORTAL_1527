"use client";

import React, { useState, useMemo } from "react";
import { Search, ChevronDown, Check, X, User } from "lucide-react";
import styles from "./StudentBottomSheetPicker.module.css";
import BottomSheet from "@/components/ui/BottomSheet";

export interface StudentPickerItem {
  id: string;
  name: string;
  rollNumber: string;
  statusBadge?: string;
  statusBadgeVariant?: "success" | "warning" | "default";
}

interface StudentBottomSheetPickerProps {
  students: StudentPickerItem[];
  selectedStudentId: string;
  onSelectStudent: (id: string) => void;
  placeholder?: string;
  className?: string;
}

export function StudentBottomSheetPicker({
  students,
  selectedStudentId,
  onSelectStudent,
  placeholder = "-- Choose Student to Grade --",
  className = "",
}: StudentBottomSheetPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase().trim();
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.rollNumber.toLowerCase().includes(q)
    );
  }, [students, searchQuery]);

  const handleSelect = (id: string) => {
    onSelectStudent(id);
    setIsOpen(false);
    setSearchQuery("");
  };

  return (
    <>
      <button
        type="button"
        className={`${styles.triggerBtn} ${className}`}
        onClick={() => setIsOpen(true)}
        aria-label="Select student"
      >
        {selectedStudent ? (
          <div className={styles.selectedContent}>
            <div className={styles.selectedName}>{selectedStudent.name}</div>
            <div className={styles.selectedRoll}>
              Roll No: {selectedStudent.rollNumber}
            </div>
          </div>
        ) : (
          <span className={styles.placeholder}>{placeholder}</span>
        )}
        <ChevronDown size={18} style={{ opacity: 0.6, flexShrink: 0 }} />
      </button>

      <BottomSheet
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          setSearchQuery("");
        }}
        title="Select Student"
      >
        <div className={styles.searchBox}>
          <Search size={18} style={{ opacity: 0.6 }} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by student name or roll number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: "2px" }}
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className={styles.studentList}>
          {filteredStudents.length > 0 ? (
            filteredStudents.map((s) => {
              const isSelected = s.id === selectedStudentId;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.studentRow} ${isSelected ? styles.studentRowSelected : ""}`}
                  onClick={() => handleSelect(s.id)}
                >
                  <div className={styles.studentInfo}>
                    <span className={styles.studentName}>{s.name}</span>
                    <span className={styles.studentRoll}>Roll No: {s.rollNumber}</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    {s.statusBadge && (
                      <span
                        className={`${styles.statusChip} ${
                          s.statusBadgeVariant === "success"
                            ? styles.statusSuccess
                            : s.statusBadgeVariant === "warning"
                            ? styles.statusWarning
                            : styles.statusDefault
                        }`}
                      >
                        {s.statusBadge}
                      </span>
                    )}
                    {isSelected && <Check size={18} style={{ color: "var(--primary)" }} />}
                  </div>
                </button>
              );
            })
          ) : (
            <div className={styles.emptyState}>
              No students found matching &quot;{searchQuery}&quot;
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  );
}

export default StudentBottomSheetPicker;

