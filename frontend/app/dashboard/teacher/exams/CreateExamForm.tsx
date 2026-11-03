"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  Square,
  Clock,
  BookOpen,
  GraduationCap,
  Sparkles,
} from "lucide-react";
import styles from "./CreateExamForm.module.css";
import {
  createSubjectStaffExamRequestsAction,
  createExamRequestWorkflowAction,
  ExamType,
} from "@/backend/api/actions/exams/examRequestWorkflowActions";
import { formatClassName } from "@/lib/teacher/formatClassName";

export type AssignedSubjectItem = {
  id: string; // subject id
  name: string; // e.g. "Mathematics"
  code?: string | null;
  classId: string;
  className: string;
  section: string;
  maxMarks: number;
  passMarks: number;
};

export type ExamClassItem = {
  id: string;
  name: string;
  section: string;
  subjects?: Array<{
    id: string;
    name: string;
    maxMarks?: number | null;
    passMarks?: number | null;
  }>;
};

const EXAM_TYPE_OPTIONS: { value: ExamType; label: string }[] = [
  { value: "UNIT_TEST", label: "Unit Test" },
  { value: "OTHER", label: "Midterm / Other Test" },
  { value: "QUARTERLY", label: "Quarterly Examination" },
  { value: "HALF_YEARLY", label: "Half-Yearly Examination" },
  { value: "ANNUAL", label: "Annual Examination" },
  { value: "MODEL", label: "Model Examination" },
];

const PRESET_EXAM_NAMES = [
  "Unit Test 1",
  "Unit Test 2",
  "Midterm Examination",
  "Quarterly Exam",
  "Half-Yearly Exam",
  "Annual Exam",
];

export default function CreateExamForm({
  teacherId,
  assignedSubjects = [],
  classes = [],
}: {
  teacherId?: string;
  assignedSubjects?: AssignedSubjectItem[];
  classes?: ExamClassItem[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  // Normalise assigned subjects: if assignedSubjects was not provided, derive from classes
  const normalizedSubjects: AssignedSubjectItem[] = useMemo(() => {
    if (assignedSubjects && assignedSubjects.length > 0) {
      return assignedSubjects;
    }
    const derived: AssignedSubjectItem[] = [];
    for (const c of classes) {
      for (const s of c.subjects || []) {
        derived.push({
          id: s.id,
          name: s.name,
          classId: c.id,
          className: c.name,
          section: c.section,
          maxMarks: s.maxMarks || 100,
          passMarks: s.passMarks || 35,
        });
      }
    }
    return derived;
  }, [assignedSubjects, classes]);

  // Group assigned subjects by subject name (e.g. "Mathematics", "Science")
  const subjectsByName = useMemo(() => {
    const map = new Map<string, AssignedSubjectItem[]>();
    for (const item of normalizedSubjects) {
      const list = map.get(item.name) || [];
      // avoid duplicate class entry for same subject
      if (!list.some((existing) => existing.classId === item.classId)) {
        list.push(item);
      }
      map.set(item.name, list);
    }
    return map;
  }, [normalizedSubjects]);

  const subjectNames = useMemo(() => Array.from(subjectsByName.keys()), [subjectsByName]);

  // Form states
  const [selectedSubjectName, setSelectedSubjectName] = useState<string>(
    subjectNames[0] || ""
  );

  // When subjectNames updates, ensure selectedSubjectName is valid
  useEffect(() => {
    if (subjectNames.length > 0 && !subjectsByName.has(selectedSubjectName)) {
      setSelectedSubjectName(subjectNames[0]);
    }
  }, [subjectNames, selectedSubjectName, subjectsByName]);

  // Available classes for selected subject ("VIEW ONLY" assigned classes)
  const assignedClassesForSubject = useMemo(() => {
    return subjectsByName.get(selectedSubjectName) || [];
  }, [subjectsByName, selectedSubjectName]);

  // Selected classes: multi-class selection
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);

  // Auto-select all assigned classes when subject changes
  useEffect(() => {
    if (assignedClassesForSubject.length > 0) {
      setSelectedClassIds(assignedClassesForSubject.map((c) => c.classId));
    } else {
      setSelectedClassIds([]);
    }
  }, [assignedClassesForSubject]);

  const [examType, setExamType] = useState<ExamType>("UNIT_TEST");
  const [examName, setExamName] = useState("Unit Test 1");
  const [examDate, setExamDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:30");
  const [endTime, setEndTime] = useState("11:00");
  const [maxMarks, setMaxMarks] = useState(100);
  const [passMark, setPassMark] = useState(35);
  const [remarks, setRemarks] = useState("");

  // Update marks criteria when subject changes
  useEffect(() => {
    const firstAssigned = assignedClassesForSubject[0];
    if (firstAssigned) {
      setMaxMarks(firstAssigned.maxMarks || 100);
      setPassMark(firstAssigned.passMarks || 35);
    }
  }, [selectedSubjectName, assignedClassesForSubject]);

  // Toggle class selection
  const handleToggleClass = (classId: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  };

  const handleSelectAllClasses = () => {
    setSelectedClassIds(assignedClassesForSubject.map((c) => c.classId));
  };

  const handleDeselectAllClasses = () => {
    setSelectedClassIds([]);
  };

  // Duration calculation
  const durationLabel = useMemo(() => {
    try {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      const diff = endMin - startMin;
      if (diff <= 0) return null;
      const hours = Math.floor(diff / 60);
      const mins = diff % 60;
      if (hours > 0 && mins > 0) return `${hours} hr ${mins} mins`;
      if (hours > 0) return `${hours} hr${hours > 1 ? "s" : ""}`;
      return `${mins} mins`;
    } catch {
      return null;
    }
  }, [startTime, endTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    if (!selectedSubjectName) {
      setIsSuccess(false);
      setMessage("Please select a subject assigned to you.");
      setLoading(false);
      return;
    }

    if (selectedClassIds.length === 0) {
      setIsSuccess(false);
      setMessage("Please select at least one assigned class.");
      setLoading(false);
      return;
    }

    if (passMark > maxMarks) {
      setIsSuccess(false);
      setMessage(`Minimum pass mark (${passMark}) cannot exceed Maximum mark (${maxMarks}).`);
      setLoading(false);
      return;
    }

    // Collect target classes with their corresponding subjectId
    const targetClasses = assignedClassesForSubject
      .filter((c) => selectedClassIds.includes(c.classId))
      .map((c) => ({
        classId: c.classId,
        subjectId: c.id,
        section: c.section,
        className: c.className,
      }));

    try {
      const res = await createSubjectStaffExamRequestsAction({
        subjectName: selectedSubjectName,
        type: examType,
        examName: examName.trim() || `${selectedSubjectName} Examination`,
        examDate,
        startTime,
        endTime,
        maxMarks: Number(maxMarks),
        passMark: Number(passMark),
        targetClasses,
        remarks: remarks.trim() || undefined,
      });

      if (res.success) {
        setIsSuccess(true);
        setMessage(
          `Exam request for ${res.requestCount || targetClasses.length} class(es) successfully submitted to Admin!`
        );
        router.refresh();
      } else {
        setIsSuccess(false);
        setMessage(res.error || "Failed to submit exam request.");
      }
    } catch (err: unknown) {
      setIsSuccess(false);
      setMessage(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setExamType("UNIT_TEST");
    setExamName("Unit Test 1");
    setExamDate(new Date().toISOString().slice(0, 10));
    setStartTime("09:30");
    setEndTime("11:00");
    setMaxMarks(100);
    setPassMark(35);
    setRemarks("");
    setMessage("");
    if (assignedClassesForSubject.length > 0) {
      setSelectedClassIds(assignedClassesForSubject.map((c) => c.classId));
    }
  };

  if (subjectNames.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "1.5rem 1rem", color: "var(--text-secondary)" }}>
        <BookOpen size={32} style={{ opacity: 0.4, margin: "0 auto 0.5rem" }} />
        <p style={{ margin: "0 0 0.25rem 0", fontWeight: 600, color: "var(--foreground)" }}>
          No Assigned Subjects Found
        </p>
        <p style={{ margin: 0, fontSize: "0.85rem" }}>
          You are not currently assigned as the subject staff for any class. Please contact the administrator to assign your subjects.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {message && (
        <div className={isSuccess ? styles.messageSuccess : styles.messageError}>
          {isSuccess ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message}</span>
        </div>
      )}

      {/* 1. Subject Staff Assignment (Select Assigned Subject) */}
      <div className={styles.fieldGroup}>
        <label className={styles.label}>
          <span>Your Assigned Subject *</span>
          <span className={styles.labelNote}>
            {subjectNames.length} Subject{subjectNames.length !== 1 ? "s" : ""} Assigned
          </span>
        </label>
        <select
          value={selectedSubjectName}
          onChange={(e) => setSelectedSubjectName(e.target.value)}
          className={styles.select}
          required
        >
          {subjectNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* 2. Assigned Classes ("VIEW ONLY" Assigned Classes List + Multi-select) */}
      <div className={styles.fieldGroup}>
        <div className={styles.classesHeader}>
          <label className={styles.label} style={{ margin: 0 }}>
            <span>Assigned Classes (View &amp; Select) *</span>
          </label>
          <div className={styles.classesActions}>
            <button
              type="button"
              onClick={handleSelectAllClasses}
              className={styles.actionPillBtn}
            >
              Select All
            </button>
            <button
              type="button"
              onClick={handleDeselectAllClasses}
              className={styles.actionPillBtn}
            >
              Clear
            </button>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginLeft: "0.25rem" }}>
              {selectedClassIds.length}/{assignedClassesForSubject.length} Selected
            </span>
          </div>
        </div>

        <div className={styles.classesGrid}>
          {assignedClassesForSubject.map((item) => {
            const isSelected = selectedClassIds.includes(item.classId);
            return (
              <button
                key={item.classId}
                type="button"
                onClick={() => handleToggleClass(item.classId)}
                className={`${styles.classCard} ${isSelected ? styles.classCardActive : ""}`}
              >
                {isSelected ? (
                  <CheckSquare size={16} color="#3b82f6" />
                ) : (
                  <Square size={16} color="var(--text-secondary)" />
                )}
                <span>{formatClassName(item.className, item.section)}</span>
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
          * Displays only classes assigned to you for {selectedSubjectName}. Select one or more classes to request this exam.
        </span>
      </div>

      {/* 3. Examination Type */}
      <div className={styles.fieldGroup}>
        <label className={styles.label}>
          <span>Examination Type *</span>
        </label>
        <select
          value={examType}
          onChange={(e) => {
            const t = e.target.value as ExamType;
            setExamType(t);
            const opt = EXAM_TYPE_OPTIONS.find((o) => o.value === t);
            if (opt) {
              setExamName(`${opt.label} - ${selectedSubjectName}`);
            }
          }}
          className={styles.select}
          required
        >
          {EXAM_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* 4. Exam Name / Title */}
      <div className={styles.fieldGroup}>
        <label className={styles.label}>
          <span>Exam Title / Name *</span>
        </label>
        <input
          type="text"
          value={examName}
          onChange={(e) => setExamName(e.target.value)}
          placeholder={`e.g. Unit Test 1 - ${selectedSubjectName}`}
          className={styles.input}
          required
        />
        <div className={styles.presetChips}>
          {PRESET_EXAM_NAMES.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setExamName(`${preset} - ${selectedSubjectName}`)}
              className={`${styles.presetChip} ${
                examName.startsWith(preset) ? styles.presetChipActive : ""
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Date & Times */}
      <div className={styles.fieldGroup}>
        <label className={styles.label}>
          <span>Exam Date *</span>
        </label>
        <input
          type="date"
          value={examDate}
          onChange={(e) => setExamDate(e.target.value)}
          className={styles.input}
          required
        />
      </div>

      <div className={styles.pairedRow}>
        <div className={styles.fieldGroup}>
          <label className={styles.label}>
            <span>Test Start Time *</span>
          </label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className={styles.input}
            required
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label}>
            <span>Test End Time *</span>
          </label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className={styles.input}
            required
          />
        </div>
      </div>

      {durationLabel && (
        <div className={styles.durationBadge}>
          <Clock size={13} />
          <span>Scheduled Duration: {durationLabel}</span>
        </div>
      )}

      {/* 6. Marks Criteria (Max Mark & Min Mark / Pass Mark) */}
      <div className={styles.pairedRow}>
        <div className={styles.fieldGroup}>
          <label className={styles.label}>
            <span>Maximum Mark *</span>
          </label>
          <input
            type="number"
            min={1}
            max={1000}
            value={maxMarks}
            onChange={(e) => setMaxMarks(Number(e.target.value))}
            className={styles.input}
            required
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label}>
            <span>Minimum / Pass Mark *</span>
          </label>
          <input
            type="number"
            min={1}
            max={maxMarks}
            value={passMark}
            onChange={(e) => setPassMark(Number(e.target.value))}
            className={styles.input}
            required
          />
        </div>
      </div>

      {passMark > maxMarks && (
        <span style={{ fontSize: "0.78rem", color: "#ef4444", fontWeight: 600 }}>
          Warning: Minimum pass mark cannot exceed maximum mark!
        </span>
      )}

      {/* 7. Optional Remarks / Instructions */}
      <div className={styles.fieldGroup}>
        <label className={styles.label}>
          <span>Remarks / Instructions (Optional)</span>
        </label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="e.g. Timing, special stationery required, or room scheduling notes..."
          className={styles.textarea}
        />
      </div>

      {/* 8. Action Buttons */}
      <div className={styles.actionsRow}>
        <button
          type="submit"
          disabled={loading || selectedClassIds.length === 0 || passMark > maxMarks}
          className={styles.submitBtn}
        >
          <Send size={16} />
          <span>
            {loading
              ? "Submitting to Admin..."
              : `Send Request to Admin (${selectedClassIds.length} Class${
                  selectedClassIds.length !== 1 ? "es" : ""
                })`}
          </span>
        </button>

        <button
          type="button"
          onClick={handleReset}
          disabled={loading}
          className={styles.resetBtn}
        >
          <RotateCcw size={15} style={{ display: "inline", marginRight: "0.3rem" }} />
          Reset
        </button>
      </div>
    </form>
  );
}
