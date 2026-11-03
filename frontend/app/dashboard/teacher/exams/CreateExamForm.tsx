"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Send, RotateCcw, AlertCircle, CheckCircle2, CheckSquare, Square } from "lucide-react";
import styles from "./CreateExamForm.module.css";
import { createExamRequestWorkflowAction, ExamType } from "@/backend/api/actions/exams/examRequestWorkflowActions";
import { formatClassName } from "@/lib/teacher/formatClassName";

export type ExamClassSubject = {
  id: string;
  name: string;
  maxMarks?: number | null;
  passMarks?: number | null;
};

export type ExamClassItem = {
  id: string;
  name: string;
  section: string;
  subjects?: ExamClassSubject[];
};

const EXAM_TYPE_OPTIONS: { value: ExamType; label: string }[] = [
  { value: "UNIT_TEST", label: "Unit Test" },
  { value: "QUARTERLY", label: "Quarterly Examination" },
  { value: "HALF_YEARLY", label: "Half-Yearly Examination" },
  { value: "ANNUAL", label: "Annual Examination" },
  { value: "MODEL", label: "Model Examination" },
  { value: "OTHER", label: "Midterm / Other Test" },
];

export default function CreateExamForm({
  classes = [],
}: {
  teacherId: string;
  classes: ExamClassItem[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  // Form states
  const [examType, setExamType] = useState<ExamType>("UNIT_TEST");
  const [examName, setExamName] = useState("Unit Test 1");
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id || "");
  const [examDate, setExamDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:30");
  const [endTime, setEndTime] = useState("12:30");
  const [defaultMaxMarks, setDefaultMaxMarks] = useState(100);
  const [defaultPassMarks, setDefaultPassMarks] = useState(35);

  // Selected subjects and per-subject marks
  const currentClass = useMemo(() => {
    return classes.find((c) => c.id === selectedClassId) || classes[0] || null;
  }, [classes, selectedClassId]);

  const availableSubjects = useMemo(() => {
    return currentClass?.subjects || [];
  }, [currentClass]);

  // Map of subjectId -> { selected: boolean; maxMarks: number; passMark: number }
  const [subjectConfigs, setSubjectConfigs] = useState<
    Record<string, { selected: boolean; maxMarks: number; passMark: number }>
  >({});

  // Initialize or reset subject configs whenever class changes
  const activeSubjectConfigs = useMemo(() => {
    const map: Record<string, { selected: boolean; maxMarks: number; passMark: number }> = {};
    for (const sub of availableSubjects) {
      if (subjectConfigs[sub.id]) {
        map[sub.id] = subjectConfigs[sub.id];
      } else {
        map[sub.id] = {
          selected: true,
          maxMarks: sub.maxMarks || defaultMaxMarks,
          passMark: sub.passMarks || defaultPassMarks,
        };
      }
    }
    return map;
  }, [availableSubjects, subjectConfigs, defaultMaxMarks, defaultPassMarks]);

  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId);
    setSubjectConfigs({});
    setMessage("");
  };

  const handleToggleSubject = (subjectId: string) => {
    setSubjectConfigs((prev) => {
      const cur = activeSubjectConfigs[subjectId];
      return {
        ...prev,
        [subjectId]: {
          ...cur,
          selected: !cur?.selected,
        },
      };
    });
  };

  const handleSubjectMarkChange = (subjectId: string, field: "maxMarks" | "passMark", value: number) => {
    setSubjectConfigs((prev) => {
      const cur = activeSubjectConfigs[subjectId];
      return {
        ...prev,
        [subjectId]: {
          ...cur,
          [field]: Math.max(1, value),
        },
      };
    });
  };

  const handleApplyCriteriaToAll = () => {
    const updated: Record<string, { selected: boolean; maxMarks: number; passMark: number }> = {};
    for (const sub of availableSubjects) {
      updated[sub.id] = {
        selected: activeSubjectConfigs[sub.id]?.selected ?? true,
        maxMarks: defaultMaxMarks,
        passMark: defaultPassMarks,
      };
    }
    setSubjectConfigs(updated);
    setMessage(`Applied Max: ${defaultMaxMarks}, Min: ${defaultPassMarks} to all subjects.`);
    setIsSuccess(true);
    setTimeout(() => setMessage(""), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    if (!selectedClassId) {
      setIsSuccess(false);
      setMessage("Please select a target class.");
      setLoading(false);
      return;
    }

    const selectedSubs = availableSubjects
      .filter((s) => activeSubjectConfigs[s.id]?.selected)
      .map((s) => ({
        subjectId: s.id,
        maxMarks: activeSubjectConfigs[s.id]?.maxMarks || defaultMaxMarks,
        passMark: activeSubjectConfigs[s.id]?.passMark || defaultPassMarks,
        examDate,
      }));

    if (selectedSubs.length === 0) {
      setIsSuccess(false);
      setMessage("Please select at least one subject for the examination.");
      setLoading(false);
      return;
    }

    try {
      const result = await createExamRequestWorkflowAction({
        name: examName.trim(),
        type: examType,
        classId: selectedClassId,
        section: currentClass?.section,
        remarks: `Exam scheduled ${startTime} - ${endTime}`,
        subjects: selectedSubs,
      });

      if (result.success) {
        setIsSuccess(true);
        setMessage("Exam request submitted to Administrator for approval! Once accepted, exam marks tasks will be assigned and timetable updated.");
        router.refresh();
      } else {
        setIsSuccess(false);
        setMessage("Request failed: " + result.error);
      }
    } catch (err: unknown) {
      setIsSuccess(false);
      setMessage("An unexpected error occurred: " + (err instanceof Error ? err.message : "Network error"));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setExamName("Unit Test 1");
    setExamType("UNIT_TEST");
    setDefaultMaxMarks(100);
    setDefaultPassMarks(35);
    setSubjectConfigs({});
    setMessage("");
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {/* 1. Examination Type */}
      <div className={styles.fieldGroup}>
        <label htmlFor="exam-type-select" className={styles.label}>
          Examination Type *
        </label>
        <select
          id="exam-type-select"
          value={examType}
          onChange={(e) => {
            const val = e.target.value as ExamType;
            setExamType(val);
            if (val === "UNIT_TEST") setExamName("Unit Test 1");
            else if (val === "QUARTERLY") setExamName("Quarterly Examination");
            else if (val === "HALF_YEARLY") setExamName("Half-Yearly Examination");
            else if (val === "ANNUAL") setExamName("Annual Examination");
            else if (val === "MODEL") setExamName("Model Examination");
            else setExamName("Midterm Examination");
          }}
          className={styles.select}
          disabled={loading}
        >
          {EXAM_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* 2. Exam Name / Title */}
      <div className={styles.fieldGroup}>
        <label htmlFor="exam-title-input" className={styles.label}>
          Exam Name / Title *
        </label>
        <input
          id="exam-title-input"
          type="text"
          required
          value={examName}
          onChange={(e) => setExamName(e.target.value)}
          placeholder="e.g. Unit Test 1, Midterm Examination"
          className={styles.input}
          disabled={loading}
        />
      </div>

      {/* 3. Class & Section Selection */}
      <div className={styles.fieldGroup}>
        <label htmlFor="exam-class-select" className={styles.label}>
          Target Class &amp; Section *
        </label>
        <select
          id="exam-class-select"
          value={selectedClassId}
          onChange={(e) => handleClassChange(e.target.value)}
          required
          className={styles.select}
          disabled={loading || classes.length === 0}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {formatClassName(c.name, c.section)} ({c.subjects?.length || 0} subjects)
            </option>
          ))}
        </select>
      </div>

      {/* 4. Date & Times (For Timetable Overlap) */}
      <div className={styles.pairedRow}>
        <div className={styles.fieldGroup}>
          <label htmlFor="exam-date" className={styles.label}>
            Exam Date *
          </label>
          <input
            id="exam-date"
            type="date"
            required
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            className={styles.input}
            disabled={loading}
          />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="exam-time-start" className={styles.label}>
            Start Time
          </label>
          <input
            id="exam-time-start"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className={styles.input}
            disabled={loading}
          />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="exam-time-end" className={styles.label}>
            End Time
          </label>
          <input
            id="exam-time-end"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className={styles.input}
            disabled={loading}
          />
        </div>
      </div>

      {/* 5. Subjects with Minimum & Maximum Marks */}
      <div className={styles.fieldGroup}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <label className={styles.label} style={{ margin: 0 }}>
            Subjects &amp; Criteria (Min / Max Marks) *
          </label>
          <button
            type="button"
            onClick={handleApplyCriteriaToAll}
            style={{
              background: "none",
              border: "none",
              color: "var(--primary, #3b82f6)",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Apply Defaults to All
          </button>
        </div>

        {/* Global Criteria Presets */}
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", background: "rgba(255,255,255,0.03)", padding: "0.5rem", borderRadius: "8px", border: "1px solid var(--border)" }}>
          <div style={{ flex: 1, fontSize: "0.78rem" }}>
            <span style={{ color: "var(--text-secondary)" }}>Default Max: </span>
            <input
              type="number"
              min="1"
              max="1000"
              value={defaultMaxMarks}
              onChange={(e) => setDefaultMaxMarks(Number(e.target.value))}
              style={{ width: "55px", padding: "2px 4px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }}
            />
          </div>
          <div style={{ flex: 1, fontSize: "0.78rem" }}>
            <span style={{ color: "var(--text-secondary)" }}>Default Min: </span>
            <input
              type="number"
              min="0"
              max="1000"
              value={defaultPassMarks}
              onChange={(e) => setDefaultPassMarks(Number(e.target.value))}
              style={{ width: "55px", padding: "2px 4px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }}
            />
          </div>
        </div>

        {/* Subjects Checklist */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "200px", overflowY: "auto", paddingRight: "4px" }}>
          {availableSubjects.map((sub) => {
            const cfg = activeSubjectConfigs[sub.id] || { selected: true, maxMarks: defaultMaxMarks, passMark: defaultPassMarks };

            return (
              <div
                key={sub.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.5rem 0.65rem",
                  borderRadius: "8px",
                  background: cfg.selected ? "rgba(59, 130, 246, 0.08)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${cfg.selected ? "rgba(59, 130, 246, 0.25)" : "var(--border)"}`,
                  gap: "0.5rem",
                }}
              >
                <div
                  onClick={() => handleToggleSubject(sub.id)}
                  style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", flex: 1 }}
                >
                  {cfg.selected ? (
                    <CheckSquare size={16} color="#3b82f6" />
                  ) : (
                    <Square size={16} color="#64748b" />
                  )}
                  <span style={{ fontSize: "0.85rem", fontWeight: cfg.selected ? 700 : 500, color: cfg.selected ? "var(--foreground)" : "var(--text-secondary)" }}>
                    {sub.name}
                  </span>
                </div>

                {cfg.selected && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.2rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      <span>Min:</span>
                      <input
                        type="number"
                        min="0"
                        max={cfg.maxMarks}
                        value={cfg.passMark}
                        onChange={(e) => handleSubjectMarkChange(sub.id, "passMark", Number(e.target.value))}
                        style={{ width: "45px", padding: "2px 4px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", textAlign: "center", fontSize: "0.75rem" }}
                        title="Minimum Pass Mark"
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.2rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      <span>Max:</span>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={cfg.maxMarks}
                        onChange={(e) => handleSubjectMarkChange(sub.id, "maxMarks", Number(e.target.value))}
                        style={{ width: "48px", padding: "2px 4px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", textAlign: "center", fontSize: "0.75rem" }}
                        title="Maximum Marks"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {availableSubjects.length === 0 && (
            <div style={{ padding: "0.75rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
              No subjects assigned to this class yet.
            </div>
          )}
        </div>
      </div>

      {/* Actions: Submit + Reset */}
      <div className={styles.actionsRow}>
        <button
          type="submit"
          disabled={loading || availableSubjects.length === 0}
          className={styles.submitBtn}
        >
          <Send size={16} />
          <span>{loading ? "Submitting to Admin..." : "Submit to Admin"}</span>
        </button>

        <button
          type="button"
          onClick={handleReset}
          disabled={loading}
          className={styles.resetBtn}
          title="Reset form"
        >
          <RotateCcw size={15} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
          <span>Reset</span>
        </button>
      </div>

      {message && (
        <div className={isSuccess ? styles.messageSuccess : styles.messageError}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
            {isSuccess ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {message}
          </span>
        </div>
      )}
    </form>
  );
}
