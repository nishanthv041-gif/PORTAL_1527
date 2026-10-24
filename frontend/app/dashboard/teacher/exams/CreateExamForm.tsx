"use client";

import { useState, useRef } from "react";
import { createExamRequest } from "@/backend/api/actions/dashboard/teacher/exams/actions";
import { Subject, Class } from "@prisma/client";
import { Send, RotateCcw, AlertCircle, CheckCircle2 } from "lucide-react";
import styles from "./CreateExamForm.module.css";

export default function CreateExamForm({ 
  teacherId, 
  subjects 
}: { 
  teacherId: string, 
  subjects: (Subject & { class: Class })[] 
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const formData = new FormData(e.currentTarget);
    formData.set("teacherId", teacherId);
    
    const result = await createExamRequest(formData);
    
    if (result.success) {
      setIsSuccess(true);
      setMessage("Exam request submitted successfully!");
      formRef.current?.reset();
    } else {
      setIsSuccess(false);
      setMessage("Failed: " + result.error);
    }
    setLoading(false);
  };

  const handleReset = () => {
    formRef.current?.reset();
    setMessage("");
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className={styles.form}>
      {/* Subject & Class Dropdown */}
      <div className={styles.fieldGroup}>
        <label htmlFor="exam-subject-select" className={styles.label}>
          Subject &amp; Class
        </label>
        <select
          id="exam-subject-select"
          name="subjectId"
          required
          className={styles.select}
          disabled={loading || subjects.length === 0}
        >
          <option value="">Select subject and class...</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.class.name} - {s.class.section})
            </option>
          ))}
        </select>
      </div>

      {/* Date & Max Marks: Side-by-side or stacked on narrow viewports */}
      <div className={styles.pairedRow}>
        <div className={styles.fieldGroup}>
          <label htmlFor="exam-date" className={styles.label}>
            Exam Date
          </label>
          <input
            id="exam-date"
            name="date"
            type="date"
            required
            className={styles.input}
            disabled={loading}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="exam-max-marks" className={styles.label}>
            Max Marks
          </label>
          <input
            id="exam-max-marks"
            name="maxMarks"
            type="number"
            required
            min="1"
            max="1000"
            defaultValue="100"
            className={styles.input}
            disabled={loading}
          />
        </div>
      </div>

      {/* Start Time & End Time: Side-by-side or stacked on narrow viewports */}
      <div className={styles.pairedRow}>
        <div className={styles.fieldGroup}>
          <label htmlFor="exam-start-time" className={styles.label}>
            Start Time
          </label>
          <input
            id="exam-start-time"
            name="startTime"
            type="time"
            required
            className={styles.input}
            disabled={loading}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="exam-end-time" className={styles.label}>
            End Time
          </label>
          <input
            id="exam-end-time"
            name="endTime"
            type="time"
            required
            className={styles.input}
            disabled={loading}
          />
        </div>
      </div>

      {/* Actions: Submit + Reset */}
      <div className={styles.actionsRow}>
        <button
          type="submit"
          disabled={loading || subjects.length === 0}
          className={styles.submitBtn}
        >
          <Send size={16} />
          <span>{loading ? "Submitting..." : "Submit Request"}</span>
        </button>

        <button
          type="button"
          onClick={handleReset}
          disabled={loading}
          className={styles.resetBtn}
          title="Clear form fields"
        >
          <RotateCcw size={15} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
          <span>Clear</span>
        </button>
      </div>

      {subjects.length === 0 && (
        <div style={{ color: "var(--warning)", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <AlertCircle size={16} />
          <span>You don&apos;t have any subjects assigned to you.</span>
        </div>
      )}

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
