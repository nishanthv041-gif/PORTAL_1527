"use client";

import React, { useState, useEffect } from "react";
import { GraduationCap, ChevronDown, Check, AlertCircle } from "lucide-react";
import styles from "./TeacherClassSwitcher.module.css";
import BottomSheet from "@/components/ui/BottomSheet";
import type { TeacherClass } from "@/lib/teacher/getTeacherClasses";

interface TeacherClassSwitcherProps {
  classes: TeacherClass[];
  selectedClassId: string;
  onSelectClass?: (classId: string) => void;
  className?: string;
  teacherId?: string;
}

export function TeacherClassSwitcher({
  classes,
  selectedClassId,
  onSelectClass,
  className = "",
  teacherId = "default",
}: TeacherClassSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const storageKey = `portal_teacher_selected_class_${teacherId}`;

  // Validate stored class against allowed classes
  useEffect(() => {
    if (typeof window === "undefined" || classes.length <= 1) return;
    const saved = localStorage.getItem(storageKey);
    if (saved && saved !== selectedClassId) {
      const isValid = classes.some((c) => c.classId === saved);
      if (isValid && onSelectClass) {
        onSelectClass(saved);
      }
    }
  }, [classes, selectedClassId, onSelectClass, storageKey]);

  const handleSelect = (classId: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, classId);
    }
    if (onSelectClass) {
      onSelectClass(classId);
    }
    setIsOpen(false);
  };

  if (!classes || classes.length === 0) {
    return (
      <div className={styles.emptyState}>
        <AlertCircle size={15} style={{ display: "inline", marginRight: "6px" }} />
        No class assigned yet, please contact the admin.
      </div>
    );
  }

  const currentClass = classes.find((c) => c.classId === selectedClassId) || classes[0];

  // If only 1 class is assigned, show as non-clickable clean badge
  if (classes.length === 1) {
    return (
      <div className={`${styles.singleClassBadge} ${className}`}>
        <GraduationCap size={16} />
        <span>{currentClass.displayName}</span>
        <span className={styles.countTag}>({currentClass.studentCount} students)</span>
      </div>
    );
  }

  // If multiple classes, show compact selector that opens Bottom Sheet
  return (
    <>
      <button
        type="button"
        className={`${styles.switcherBtn} ${className}`}
        onClick={() => setIsOpen(true)}
        aria-label="Switch Class"
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <GraduationCap size={16} style={{ color: "var(--primary)" }} />
          <span>{currentClass.displayName}</span>
          <span className={styles.countTag}>({currentClass.studentCount})</span>
        </span>
        <ChevronDown size={15} style={{ opacity: 0.7 }} />
      </button>

      <BottomSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Select Class"
      >
        <div className={styles.classList}>
          {classes.map((cls) => {
            const isSelected = cls.classId === currentClass.classId;
            return (
              <button
                key={cls.classId}
                type="button"
                className={`${styles.classItem} ${isSelected ? styles.classItemActive : ""}`}
                onClick={() => handleSelect(cls.classId)}
              >
                <div>
                  <div className={styles.classTitle}>{cls.displayName}</div>
                  <div className={styles.classMeta}>
                    {cls.studentCount} students
                    {cls.isClassTeacher ? " • Class Teacher" : ""}
                    {cls.subjects && cls.subjects.length > 0 ? ` • ${cls.subjects.join(", ")}` : ""}
                  </div>
                </div>
                {isSelected && <Check size={18} style={{ color: "var(--primary)" }} />}
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}

export default TeacherClassSwitcher;
