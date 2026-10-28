"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Send, Trash2, Eye, CheckCircle2, Clock, Sparkles,
  BookOpen, Users, Award, AlertCircle, Calendar,
  Search, Check, X, ShieldAlert, FileText, ChevronRight,
  Sliders, Settings2, Target, Upload
} from "lucide-react";
import styles from "./TeacherReportCardsClient.module.css";
import {
  createAndSendReportCardAction,
  deleteReportCardAction
} from "@/backend/lib/services/reportCardActions";
import ReportCardDocumentScanModal from "./ReportCardDocumentScanModal";

export type ClassSubject = {
  id: string;
  name: string;
  maxMarks: number;
  passMarks: number;
};

export type ClassStudent = {
  id: string;
  rollNumber: string;
  name: string;
  parents: Array<{
    name: string | null;
    email: string | null;
  }>;
};

export type TeacherClass = {
  id: string;
  name: string;
  section: string;
  subjects: ClassSubject[];
  students: ClassStudent[];
};

export type HistoryItem = {
  id: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  className: string;
  classId: string | null;
  examId: string;
  examName: string;
  examDate: string;
  totalMarks: number;
  percentage: number;
  grade: string;
  remarks: string | null;
  published: boolean;
  parentVerified: boolean;
  marks: Array<{
    id: string;
    subjectId: string;
    subjectName: string;
    score: number;
    maxScore: number;
    passMarks: number;
    remarks: string | null;
  }>;
};

interface TeacherReportCardsClientProps {
  classes: TeacherClass[];
  initialHistory: HistoryItem[];
  schoolLogo?: string | null;
}

const EXAM_PRESETS = [
  "Unit Test 1",
  "Midterm Examination",
  "Quarterly Exam",
  "Half-Yearly Exam",
  "Term 1 Final",
  "Model Exam",
  "Annual Examination"
];

const MARK_CRITERIA_PRESETS = [
  { label: "100 / 35", max: 100, pass: 35, desc: "Standard (100 Max / 35 Pass)" },
  { label: "50 / 20", max: 50, pass: 20, desc: "Midterm (50 Max / 20 Pass)" },
  { label: "75 / 30", max: 75, pass: 30, desc: "Quarterly (75 Max / 30 Pass)" },
  { label: "25 / 10", max: 25, pass: 10, desc: "Unit Test (25 Max / 10 Pass)" }
];

const REMARK_PRESETS = [
  "⭐ Excellent overall performance and exemplary academic conduct!",
  "👍 Good understanding of core concepts. Keep up the high standard!",
  "📈 Demonstrating steady improvement. Daily revision will boost scores further.",
  "⚠️ Shows good potential, but needs extra practice in challenging subjects.",
  "🎯 Dedicated, disciplined, and actively participates in classroom learning."
];

export default function TeacherReportCardsClient({
  classes,
  initialHistory,
  schoolLogo
}: TeacherReportCardsClientProps) {
  const router = useRouter();

  // Active Tab: "CREATE" or "HISTORY"
  const [activeTab, setActiveTab] = useState<"CREATE" | "HISTORY">("CREATE");

  // Selection States
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || "");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");

  // Exam Details
  const [examName, setExamName] = useState<string>("Midterm Examination");
  const [examDate, setExamDate] = useState<string>(() => new Date().toISOString().split("T")[0]);

  // Exam Criteria State (Set Pass Mark & Max Mark after Exam Name & Date)
  const [examMaxMarks, setExamMaxMarks] = useState<number>(100);
  const [examPassMarks, setExamPassMarks] = useState<number>(35);
  const [customizingSubjectId, setCustomizingSubjectId] = useState<string | null>(null);

  // Subject Marks Mapping: { [subjectId]: { score: number | "", maxScore: number, passMarks: number, remarks: string } }
  const [subjectMarks, setSubjectMarks] = useState<Record<string, { score: number | ""; maxScore: number; passMarks: number; remarks: string }>>({});

  // General Teacher Remarks
  const [generalRemarks, setGeneralRemarks] = useState<string>("");

  // Loading & Feedback
  const [isSending, setIsSending] = useState(false);
  const [successBanner, setSuccessBanner] = useState<{ message: string; recipients: string[] } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // History State
  const [history, setHistory] = useState<HistoryItem[]>(initialHistory);
  const [historySearch, setHistorySearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<HistoryItem | null>(null);

  // Document / OCR Scan Modal State
  const [showScanModal, setShowScanModal] = useState(false);

  // Selected Class Object
  const currentClass = useMemo(() => {
    return classes.find(c => c.id === selectedClassId) || classes[0];
  }, [classes, selectedClassId]);

  // Selected Student Object
  const currentStudent = useMemo(() => {
    if (!currentClass) return null;
    return currentClass.students.find(s => s.id === selectedStudentId) || null;
  }, [currentClass, selectedStudentId]);

  // Available subjects for the class
  const currentSubjects = useMemo(() => {
    return currentClass?.subjects || [];
  }, [currentClass]);

  // Handler for class change
  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId);
    setSelectedStudentId("");
    setSubjectMarks({});
    setSuccessBanner(null);
    setErrorMessage(null);
  };

  // Handler for student change
  const handleStudentChange = (studentId: string) => {
    setSelectedStudentId(studentId);
    setSuccessBanner(null);
    setErrorMessage(null);

    // Initialize subject marks with empty values and current criteria
    const initialMarks: Record<string, { score: number | ""; maxScore: number; passMarks: number; remarks: string }> = {};
    currentSubjects.forEach(sub => {
      initialMarks[sub.id] = {
        score: "",
        maxScore: examMaxMarks || sub.maxMarks || 100,
        passMarks: examPassMarks || sub.passMarks || 35,
        remarks: ""
      };
    });
    setSubjectMarks(initialMarks);
  };

  // Apply Max Mark & Pass Mark to all subjects
  const handleApplyCriteriaToAll = (newMax: number, newPass: number) => {
    const validMax = Math.max(1, newMax || 100);
    const validPass = Math.max(0, Math.min(validMax, newPass || 35));

    setExamMaxMarks(validMax);
    setExamPassMarks(validPass);

    setSubjectMarks(prev => {
      const updated: Record<string, { score: number | ""; maxScore: number; passMarks: number; remarks: string }> = {};
      currentSubjects.forEach(sub => {
        const existing = prev[sub.id];
        const existingScore = existing?.score;
        const clampedScore = existingScore !== undefined && existingScore !== ""
          ? Math.min(validMax, Number(existingScore))
          : (existingScore ?? "");

        updated[sub.id] = {
          score: clampedScore,
          maxScore: validMax,
          passMarks: validPass,
          remarks: existing?.remarks || ""
        };
      });
      return updated;
    });
  };

  // Customize criteria for a single subject
  const handleCustomSubjectCriteria = (subjectId: string, customMax: number, customPass: number) => {
    const validMax = Math.max(1, customMax || 100);
    const validPass = Math.max(0, Math.min(validMax, customPass || 35));

    setSubjectMarks(prev => {
      const existing = prev[subjectId] || { score: "", maxScore: examMaxMarks, passMarks: examPassMarks, remarks: "" };
      const clampedScore = existing.score !== "" ? Math.min(validMax, Number(existing.score)) : "";
      return {
        ...prev,
        [subjectId]: {
          ...existing,
          score: clampedScore,
          maxScore: validMax,
          passMarks: validPass
        }
      };
    });
  };

  // Update mark for an individual subject
  const handleMarkChange = (subjectId: string, val: string) => {
    const currentMax = subjectMarks[subjectId]?.maxScore ?? examMaxMarks;
    const currentPass = subjectMarks[subjectId]?.passMarks ?? examPassMarks;
    const num = val === "" ? "" : Math.max(0, Math.min(currentMax, Number(val)));

    setSubjectMarks(prev => ({
      ...prev,
      [subjectId]: {
        score: num,
        maxScore: currentMax,
        passMarks: currentPass,
        remarks: prev[subjectId]?.remarks || ""
      }
    }));
  };

  // LIVE AUTOMATIC CALCULATIONS ("in total space")
  const totals = useMemo(() => {
    let obtained = 0;
    let maximum = 0;
    let hasAnyMarks = false;
    let hasFail = false;

    currentSubjects.forEach(sub => {
      const entry = subjectMarks[sub.id];
      const max = entry?.maxScore ?? examMaxMarks;
      const pass = entry?.passMarks ?? examPassMarks;
      maximum += max;

      if (entry && entry.score !== "") {
        hasAnyMarks = true;
        const scoreNum = Number(entry.score);
        obtained += scoreNum;
        if (scoreNum < pass) {
          hasFail = true;
        }
      }
    });

    const percentage = maximum > 0 && hasAnyMarks ? parseFloat(((obtained / maximum) * 100).toFixed(1)) : 0;

    let grade = "-";
    if (hasAnyMarks) {
      if (hasFail && percentage < 40) grade = "F";
      else if (percentage >= 90) grade = "A+";
      else if (percentage >= 80) grade = "A";
      else if (percentage >= 70) grade = "B";
      else if (percentage >= 60) grade = "C";
      else if (percentage >= 50) grade = "D";
      else grade = "F";
    }

    const isPass = hasAnyMarks && !hasFail && percentage >= 35;

    return {
      obtained,
      maximum,
      percentage,
      grade,
      hasAnyMarks,
      isPass
    };
  }, [currentSubjects, subjectMarks, examMaxMarks, examPassMarks]);

  // SUBMIT & SEND REPORT CARD
  const handleSendReportCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessBanner(null);

    if (!selectedClassId) {
      setErrorMessage("Please select a class.");
      return;
    }
    if (!selectedStudentId) {
      setErrorMessage("Please select a student.");
      return;
    }
    if (!examName.trim()) {
      setErrorMessage("Please enter an exam or test name.");
      return;
    }
    if (!examDate) {
      setErrorMessage("Please choose a test date.");
      return;
    }

    // Format marks payload
    const marksPayload = currentSubjects.map(sub => {
      const entry = subjectMarks[sub.id];
      return {
        subjectId: sub.id,
        score: entry && entry.score !== "" ? Number(entry.score) : 0,
        maxScore: entry?.maxScore ?? examMaxMarks ?? 100,
        passMarks: entry?.passMarks ?? examPassMarks ?? 35,
        remarks: entry?.remarks || ""
      };
    });

    setIsSending(true);

    try {
      const res = await createAndSendReportCardAction({
        studentId: selectedStudentId,
        classId: selectedClassId,
        examName: examName.trim(),
        examDate,
        marks: marksPayload,
        remarks: generalRemarks.trim()
      });

      if (!res.success) {
        setErrorMessage(res.error || "Failed to create and send report card.");
      } else {
        setSuccessBanner({
          message: res.message || "Report card successfully created and sent to parent(s)!",
          recipients: res.recipients || []
        });

        // Add to local history list optimistically
        const newHistoryItem: HistoryItem = {
          id: res.reportCardId || `rc-${Date.now()}`,
          studentId: selectedStudentId,
          studentName: currentStudent?.name || "Student",
          rollNumber: currentStudent?.rollNumber || "",
          className: `${currentClass.name} - ${currentClass.section}`,
          classId: selectedClassId,
          examId: `exam-${Date.now()}`,
          examName: examName.trim(),
          examDate: new Date(examDate).toISOString(),
          totalMarks: res.totalMarks || totals.obtained,
          percentage: res.percentage || totals.percentage,
          grade: res.grade || totals.grade,
          remarks: generalRemarks.trim() || null,
          published: true,
          parentVerified: false,
          marks: currentSubjects.map(s => {
            const entry = subjectMarks[s.id];
            return {
              id: `m-${s.id}`,
              subjectId: s.id,
              subjectName: s.name,
              score: entry && entry.score !== "" ? Number(entry.score) : 0,
              maxScore: entry?.maxScore ?? examMaxMarks ?? 100,
              passMarks: entry?.passMarks ?? examPassMarks ?? 35,
              remarks: entry?.remarks || null
            };
          })
        };

        setHistory(prev => [newHistoryItem, ...prev]);
        router.refresh();

        // Scroll smoothly to top
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setIsSending(false);
    }
  };

  // DELETE REPORT CARD FROM HISTORY (Teacher Exclusive Feature)
  const handleDeleteHistoryItem = async (reportCardId: string, studentName: string) => {
    if (!confirm(`Are you sure you want to delete the report card for ${studentName}?\n\nThis will remove it from both your history and the parent's portal.`)) {
      return;
    }

    setDeletingId(reportCardId);
    try {
      const res = await deleteReportCardAction(reportCardId);
      if (res.success) {
        setHistory(prev => prev.filter(item => item.id !== reportCardId));
        if (previewItem?.id === reportCardId) {
          setPreviewItem(null);
        }
        router.refresh();
      } else {
        alert(res.error || "Failed to delete report card.");
      }
    } catch (err: any) {
      alert("Error deleting report card: " + (err.message || "Server error"));
    } finally {
      setDeletingId(null);
    }
  };

  // Filtered History
  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return history;
    const q = historySearch.toLowerCase();
    return history.filter(item =>
      item.studentName.toLowerCase().includes(q) ||
      item.rollNumber.toLowerCase().includes(q) ||
      item.examName.toLowerCase().includes(q) ||
      item.className.toLowerCase().includes(q)
    );
  }, [history, historySearch]);

  return (
    <div className={styles.container}>
      {/* Top Header Banner */}
      <div className={styles.headerCard}>
        <div className={styles.titleArea}>
          <span className={styles.portalBadge}>
            <Award size={13} /> Teacher Academic Suite
          </span>
          <h1 className={styles.mainTitle}>Student Report Cards</h1>
          <p className={styles.subtitle}>
            Create, calculate, and dispatch official academic report cards directly to parents.
          </p>
        </div>

        {/* Tab Switcher & Scan Action */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          <div className={styles.tabNav} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "CREATE"}
              className={`${styles.tabBtn} ${activeTab === "CREATE" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("CREATE")}
            >
              <Sparkles size={16} />
              <span>Create &amp; Send</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "HISTORY"}
              className={`${styles.tabBtn} ${activeTab === "HISTORY" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("HISTORY")}
            >
              <Clock size={16} />
              <span>Sent History</span>
              <span className={styles.tabBadge}>{history.length}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowScanModal(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.65rem 1.15rem",
              borderRadius: "12px",
              background: "linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(14, 165, 233, 0.15) 100%)",
              border: "1.5px solid rgba(99, 102, 241, 0.35)",
              color: "var(--primary)",
              fontWeight: 800,
              fontSize: "0.85rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap"
            }}
          >
            <Upload size={16} />
            <span>Scan &amp; Upload Doc (OCR)</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successBanner && (
        <div className={styles.successBanner} role="alert">
          <CheckCircle2 size={24} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: "0 0 0.25rem 0", fontSize: "1rem", fontWeight: 700 }}>
              Report Card Dispatched!
            </h4>
            <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.45 }}>
              {successBanner.message}
            </p>
            {successBanner.recipients.length > 0 && (
              <p style={{ margin: "0.35rem 0 0 0", fontSize: "0.8rem", opacity: 0.9 }}>
                Emailed to: <strong>{successBanner.recipients.join(", ")}</strong>
              </p>
            )}
            <button
              type="button"
              onClick={() => setActiveTab("HISTORY")}
              style={{
                marginTop: "0.6rem",
                background: "transparent",
                border: "1px solid currentColor",
                borderRadius: "6px",
                padding: "0.3rem 0.75rem",
                color: "inherit",
                fontSize: "0.8rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem"
              }}
            >
              View in Sent History <ChevronRight size={13} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}
            aria-label="Dismiss banner"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div style={{
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid #ef4444",
          color: "#b91c1c",
          borderRadius: "12px",
          padding: "1rem 1.25rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem"
        }} role="alert">
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            style={{ marginLeft: "auto", background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* =========================================================
          TAB 1: CREATE & SEND REPORT CARD (MOBILE-FIRST UI/UX)
          ========================================================= */}
      {activeTab === "CREATE" && (
        <form onSubmit={handleSendReportCard} className={styles.formCard}>
          {/* OCR Document Scanner Fast-Track Banner */}
          <div style={{
            background: "linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(14, 165, 233, 0.08) 100%)",
            border: "1.5px dashed rgba(99, 102, 241, 0.35)",
            borderRadius: "16px",
            padding: "1rem 1.25rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.85rem"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{
                width: "42px",
                height: "42px",
                borderRadius: "12px",
                background: "var(--primary)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}>
                <Sparkles size={22} />
              </div>
              <div>
                <h3 style={{ margin: "0 0 0.2rem 0", fontSize: "0.95rem", fontWeight: 800, color: "var(--foreground)" }}>
                  Scan &amp; Upload Report Card File (OCR)
                </h3>
                <p style={{ margin: 0, fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                  Upload photos (JPG, PNG), PDFs, Excel sheets, or Word docs. The scanner extracts student marks, flags invalid data for editing, and connects directly to the database.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowScanModal(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0.65rem 1.25rem",
                borderRadius: "10px",
                background: "var(--primary)",
                color: "#ffffff",
                border: "none",
                fontWeight: 700,
                fontSize: "0.88rem",
                cursor: "pointer",
                boxShadow: "0 2px 10px rgba(99, 102, 241, 0.25)"
              }}
            >
              <Upload size={16} />
              <span>Scan &amp; Upload Document</span>
            </button>
          </div>

          {/* STEP 1: SELECT CLASS & STUDENT */}
          <div className={styles.sectionGroup}>
            <div className={styles.sectionHeader}>
              <span className={styles.stepNumber}>1</span>
              <h2 className={styles.sectionTitle}>Select Class &amp; Student</h2>
            </div>

            <div className={styles.inputGrid}>
              {/* Class Dropdown */}
              <div className={styles.formField}>
                <label className={styles.fieldLabel} htmlFor="select-class">
                  <BookOpen size={14} /> Class *
                </label>
                <select
                  id="select-class"
                  className={styles.fieldSelect}
                  value={selectedClassId}
                  onChange={(e) => handleClassChange(e.target.value)}
                  required
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      Class {c.name} - {c.section} ({c.students.length} students)
                    </option>
                  ))}
                </select>
              </div>

              {/* Student Dropdown */}
              <div className={styles.formField}>
                <label className={styles.fieldLabel} htmlFor="select-student">
                  <Users size={14} /> Student *
                </label>
                <select
                  id="select-student"
                  className={styles.fieldSelect}
                  value={selectedStudentId}
                  onChange={(e) => handleStudentChange(e.target.value)}
                  required
                >
                  <option value="">-- Choose Student to Grade --</option>
                  {currentClass?.students.map(st => (
                    <option key={st.id} value={st.id}>
                      {st.name} (Roll: {st.rollNumber})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selected Student Information Card */}
            {currentStudent && (
              <div className={styles.studentCard}>
                <div className={styles.studentMeta}>
                  <div className={styles.studentAvatar}>
                    {currentStudent.name.charAt(0)}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
                      {currentStudent.name}
                    </h3>
                    <p style={{ margin: "0.15rem 0 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                      Roll No: <strong>{currentStudent.rollNumber}</strong> • Class: <strong>{currentClass.name} - {currentClass.section}</strong>
                    </p>
                  </div>
                </div>

                <div className={styles.parentBadge}>
                  <Users size={14} />
                  <span>
                    {currentStudent.parents.length > 0
                      ? `${currentStudent.parents.length} Linked Parent(s)`
                      : "No parents linked yet"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: TEST / EXAMINATION DETAILS */}
          <div className={styles.sectionGroup}>
            <div className={styles.sectionHeader}>
              <span className={styles.stepNumber}>2</span>
              <h2 className={styles.sectionTitle}>Examination &amp; Test Date</h2>
            </div>

            <div className={styles.inputGrid}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel} htmlFor="exam-name-input">
                  <FileText size={14} /> Exam / Test Name *
                </label>
                <input
                  id="exam-name-input"
                  type="text"
                  className={styles.fieldInput}
                  placeholder="e.g. Midterm Examination"
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  required
                />
                <div className={styles.chipsRow}>
                  {EXAM_PRESETS.slice(0, 4).map(preset => (
                    <button
                      type="button"
                      key={preset}
                      className={styles.chipBtn}
                      onClick={() => setExamName(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel} htmlFor="exam-date-input">
                  <Calendar size={14} /> Test / Exam Date *
                </label>
                <input
                  id="exam-date-input"
                  type="date"
                  className={styles.fieldInput}
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* STEP 3: SET PASS MARK & MAX MARK (EXAM SCORING CRITERIA) */}
          <div className={styles.sectionGroup}>
            <div className={styles.sectionHeader}>
              <span className={styles.stepNumber}>3</span>
              <h2 className={styles.sectionTitle}>Set Pass Mark &amp; Max Mark</h2>
            </div>

            <div className={styles.criteriaContainer}>
              <p className={styles.criteriaSubtext}>
                Set the global maximum score and passing mark for this exam. Presets automatically configure both values:
              </p>

              {/* Fast Presets Chips */}
              <div className={styles.presetChipsRow}>
                {MARK_CRITERIA_PRESETS.map((p) => {
                  const isActive = examMaxMarks === p.max && examPassMarks === p.pass;
                  return (
                    <button
                      type="button"
                      key={p.label}
                      className={`${styles.presetChipBtn} ${isActive ? styles.presetChipBtnActive : ""}`}
                      onClick={() => handleApplyCriteriaToAll(p.max, p.pass)}
                    >
                      <Target size={13} />
                      <span>{p.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Max & Pass Mark Input Cards */}
              <div className={styles.criteriaInputsGrid}>
                {/* Max Marks Card */}
                <div className={styles.criteriaInputCard}>
                  <label htmlFor="exam-max-marks-input" className={styles.criteriaFieldLabel}>
                    <Sliders size={14} /> Maximum Mark (Out of) *
                  </label>
                  <div className={styles.criteriaInputFieldWrapper}>
                    <input
                      id="exam-max-marks-input"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={1000}
                      className={styles.criteriaNumberInput}
                      value={examMaxMarks}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!isNaN(val) && val > 0) {
                          handleApplyCriteriaToAll(val, Math.min(val, examPassMarks));
                        }
                      }}
                      required
                    />
                    <span className={styles.criteriaUnitTag}>Marks</span>
                  </div>
                </div>

                {/* Pass Mark Card */}
                <div className={styles.criteriaInputCard}>
                  <label htmlFor="exam-pass-marks-input" className={styles.criteriaFieldLabel}>
                    <Award size={14} /> Pass Mark (Minimum) *
                  </label>
                  <div className={styles.criteriaInputFieldWrapper}>
                    <input
                      id="exam-pass-marks-input"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={examMaxMarks}
                      className={styles.criteriaNumberInput}
                      value={examPassMarks}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!isNaN(val) && val >= 0) {
                          handleApplyCriteriaToAll(examMaxMarks, val);
                        }
                      }}
                      required
                    />
                    <span className={styles.criteriaUnitTag}>Marks</span>
                  </div>
                </div>
              </div>

              {/* Active Threshold Indicator */}
              <div className={styles.criteriaStatusNotice}>
                <Check size={14} className={styles.criteriaCheckIcon} />
                <span>
                  Threshold: <strong>{examPassMarks}</strong> / <strong>{examMaxMarks}</strong> to pass ({examMaxMarks > 0 ? ((examPassMarks / examMaxMarks) * 100).toFixed(0) : 0}% required). Applied to all subjects below.
                </span>
              </div>
            </div>
          </div>

          {/* STEP 4: SUBJECT MARKS ENTRY (MOBILE PHONE OPTIMIZED) */}
          <div className={styles.sectionGroup}>
            <div className={styles.sectionHeader}>
              <span className={styles.stepNumber}>4</span>
              <h2 className={styles.sectionTitle}>Enter Subject Marks</h2>
            </div>

            {currentSubjects.length === 0 ? (
              <div className={styles.emptyState}>
                <BookOpen size={36} style={{ opacity: 0.3, margin: "0 auto 0.5rem" }} />
                <p style={{ margin: 0 }}>No subjects assigned to this class yet.</p>
              </div>
            ) : (
              <div className={styles.subjectsList}>
                {currentSubjects.map((sub) => {
                  const entry = subjectMarks[sub.id];
                  const currentScore = entry?.score;
                  const currentMax = entry?.maxScore ?? examMaxMarks;
                  const currentPass = entry?.passMarks ?? examPassMarks;
                  const isEntered = currentScore !== undefined && currentScore !== "";
                  const scoreNum = Number(currentScore);
                  const isPass = isEntered && scoreNum >= currentPass;
                  const isExceeding = isEntered && scoreNum > currentMax;
                  const isCustomizing = customizingSubjectId === sub.id;

                  return (
                    <div key={sub.id} className={styles.subjectRowCard}>
                      <div className={styles.subjectCardTop}>
                        <div className={styles.subjectInfo}>
                          <h4 className={styles.subjectName}>{sub.name}</h4>
                          <div className={styles.subjectCriteriaBadges}>
                            <span className={styles.subjectCriteria}>
                              Max: <strong>{currentMax}</strong> • Pass: <strong>{currentPass}</strong>
                            </span>
                            <button
                              type="button"
                              className={styles.subjectCriteriaToggle}
                              onClick={() => setCustomizingSubjectId(isCustomizing ? null : sub.id)}
                              title="Customize max or pass mark for this subject"
                            >
                              <Settings2 size={12} />
                              <span>{isCustomizing ? "Close" : "Custom"}</span>
                            </button>
                          </div>
                        </div>

                        {/* Pass / Fail Status Pill */}
                        <div className={styles.pillContainer}>
                          {isEntered && (
                            <span className={`${styles.passFailPill} ${isPass ? styles.passPill : styles.failPill}`}>
                              {isPass ? "PASS" : "FAIL"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Optional inline customizer for this single subject */}
                      {isCustomizing && (
                        <div className={styles.customCriteriaInline}>
                          <div className={styles.customCriteriaField}>
                            <label className={styles.customCriteriaLabel}>Subject Max:</label>
                            <input
                              type="number"
                              min={1}
                              max={1000}
                              value={currentMax}
                              onChange={(e) => handleCustomSubjectCriteria(sub.id, Number(e.target.value), currentPass)}
                              className={styles.customCriteriaInput}
                            />
                          </div>
                          <div className={styles.customCriteriaField}>
                            <label className={styles.customCriteriaLabel}>Subject Pass:</label>
                            <input
                              type="number"
                              min={0}
                              max={currentMax}
                              value={currentPass}
                              onChange={(e) => handleCustomSubjectCriteria(sub.id, currentMax, Number(e.target.value))}
                              className={styles.customCriteriaInput}
                            />
                          </div>
                        </div>
                      )}

                      {/* Main Mark Input Box */}
                      <div className={styles.subjectScoreSection}>
                        <div className={styles.markInputGroup}>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={currentMax}
                            step="any"
                            className={`${styles.markInput} ${isExceeding ? styles.markInputError : ""}`}
                            placeholder="0"
                            value={currentScore ?? ""}
                            onChange={(e) => handleMarkChange(sub.id, e.target.value)}
                            aria-label={`Marks for ${sub.name}`}
                            required={selectedStudentId !== ""}
                          />
                          <span className={styles.maxScoreTag}>
                            / {currentMax}
                          </span>
                        </div>
                        {isExceeding && (
                          <span className={styles.scoreErrorText}>Score cannot exceed max marks ({currentMax})</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* STEP 5: AUTOMATIC LIVE CALCULATION (THE TOTAL SPACE) */}
          <div className={styles.calculationPanel} aria-live="polite">
            <div className={styles.calcHeaderRow}>
              <div className={styles.calcHeaderTitleArea}>
                <Sparkles size={16} className={styles.calcSparkleIcon} />
                <span className={styles.calcHeaderTitle}>Live Academic Summary</span>
              </div>
              <div className={styles.statusIndicator}>
                {totals.hasAnyMarks && totals.isPass ? (
                  <span className={styles.statusPassBadge}>
                    <CheckCircle2 size={15} />
                    <span>ALL SUBJECTS PASSED</span>
                  </span>
                ) : totals.hasAnyMarks ? (
                  <span className={styles.statusFailBadge}>
                    <ShieldAlert size={15} />
                    <span>NEEDS IMPROVEMENT</span>
                  </span>
                ) : (
                  <span className={styles.statusPendingBadge}>
                    <span>AWAITING MARKS</span>
                  </span>
                )}
              </div>
            </div>

            <div className={styles.calcMetricGroup}>
              {/* Total Marks */}
              <div className={styles.calcItem}>
                <span className={styles.calcLabel}>Total Score</span>
                <span className={styles.calcValue}>
                  {totals.obtained}
                  <span className={styles.calcMaxDenom}> / {totals.maximum}</span>
                </span>
              </div>

              <div className={styles.calcDivider} />

              {/* Percentage */}
              <div className={styles.calcItem}>
                <span className={styles.calcLabel}>Percentage</span>
                <span className={styles.calcValuePercentage}>
                  {totals.hasAnyMarks ? `${totals.percentage}%` : "0.0%"}
                </span>
              </div>

              <div className={styles.calcDivider} />

              {/* Grade Badge */}
              <div className={styles.calcItem}>
                <span className={styles.calcLabel}>Overall Grade</span>
                <div className={styles.gradeBadgeWrapper}>
                  <span className={`${styles.gradeBadgeLarge} ${totals.grade === 'A+' ? styles.gradeBadgeGreen :
                    totals.grade === 'A' || totals.grade === 'B' ? styles.gradeBadgeIndigo :
                      totals.grade === 'C' || totals.grade === 'D' ? styles.gradeBadgeAmber :
                        totals.grade === 'F' ? styles.gradeBadgeRed : ''
                    }`}>
                    {totals.hasAnyMarks ? totals.grade : "-"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* STEP 6: TEACHER REMARKS & DISPATCH */}
          <div className={styles.sectionGroup}>
            <div className={styles.sectionHeader}>
              <span className={styles.stepNumber}>5</span>
              <h2 className={styles.sectionTitle}>Teacher Feedback &amp; Dispatch</h2>
            </div>

            <div className={styles.formField}>
              <label className={styles.fieldLabel} htmlFor="remarks-textarea">
                Teacher Remarks (Displayed on Report Card &amp; Email)
              </label>
              <textarea
                id="remarks-textarea"
                rows={3}
                className={styles.fieldTextarea}
                placeholder="Enter feedback for student and parents..."
                value={generalRemarks}
                onChange={(e) => setGeneralRemarks(e.target.value)}
              />
              <div className={styles.quickRemarksRow}>
                {REMARK_PRESETS.map((remark, idx) => (
                  <button
                    type="button"
                    key={idx}
                    className={styles.quickRemarkBtn}
                    onClick={() => setGeneralRemarks(remark)}
                  >
                    {remark.slice(0, 36)}...
                  </button>
                ))}
              </div>
            </div>

            {/* Parent Recipient Preview Info */}
            <div className={styles.parentRecipientsNotice}>
              <Users size={16} style={{ flexShrink: 0, color: "var(--primary)" }} />
              <div>
                {currentStudent && currentStudent.parents.length > 0 ? (
                  <span>
                    Report card notification and email will be immediately delivered to:{" "}
                    <strong>
                      {currentStudent.parents.map(p => p.name || p.email).filter(Boolean).join(", ")}
                    </strong>
                  </span>
                ) : (
                  <span>
                    Student has no registered parent contacts. Report card will be stored in portal history.
                  </span>
                )}
              </div>
            </div>

            {/* SEND BUTTON */}
            <div className={styles.submitContainer}>
              <button
                type="submit"
                disabled={isSending || !selectedStudentId}
                className={styles.sendBtn}
              >
                {isSending ? (
                  <>
                    <span className="spinner" style={{ width: 18, height: 18, border: "2px solid #ffffff", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.65s linear infinite" }} />
                    <span>Calculating &amp; Sending Report Card...</span>
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    <span>Send Report Card to Parent</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* =========================================================
          TAB 2: TEACHER SENT HISTORY (WITH DELETE OPTION)
          ========================================================= */}
      {activeTab === "HISTORY" && (
        <div className={styles.historyContainer}>
          {/* History Search Bar */}
          <div className={styles.historyToolbar}>
            <div className={styles.searchBox}>
              <Search size={16} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search history by student name, roll number, or exam..."
                className={styles.searchInput}
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
            </div>

            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>
              Showing {filteredHistory.length} of {history.length} sent card(s)
            </span>
          </div>

          {/* Cards List */}
          {filteredHistory.length === 0 ? (
            <div className={styles.emptyState}>
              <Clock size={44} style={{ opacity: 0.3, margin: "0 auto 0.75rem" }} />
              <h3 style={{ margin: "0 0 0.25rem 0", fontSize: "1.1rem" }}>No Report Cards in History</h3>
              <p style={{ margin: 0, fontSize: "0.875rem" }}>
                {historySearch ? "No records match your search filter." : "Create and send your first student report card in the Create tab above."}
              </p>
            </div>
          ) : (
            <div className={styles.historyCardsList}>
              {filteredHistory.map((item) => (
                <div key={item.id} className={styles.historyCard}>
                  {/* Student & Class Row */}
                  <div className={styles.cardHeaderRow}>
                    <div className={styles.cardStudentInfo}>
                      <div className={styles.studentAvatar} style={{ width: 38, height: 38, fontSize: "0.85rem" }}>
                        {item.studentName.charAt(0)}
                      </div>
                      <div>
                        <h3 className={styles.cardStudentName}>{item.studentName}</h3>
                        <span className={styles.cardClassBadge}>
                          Roll: {item.rollNumber} • {item.className}
                        </span>
                      </div>
                    </div>

                    {/* Parent Verification Status Pill */}
                    <div>
                      {item.parentVerified ? (
                        <span className={`${styles.verificationPill} ${styles.verifiedGreen}`}>
                          <CheckCircle2 size={13} /> Verified by Parent
                        </span>
                      ) : (
                        <span className={`${styles.verificationPill} ${styles.unverifiedAmber}`}>
                          <Clock size={13} /> Awaiting Parent Verification
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Exam & Date Info */}
                  <div className={styles.cardExamRow}>
                    <span>
                      Exam: <strong>{item.examName}</strong>
                    </span>
                    <span>
                      Date: <strong>{new Date(item.examDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</strong>
                    </span>
                  </div>

                  {/* Metrics Row */}
                  <div className={styles.metricsPillRow}>
                    <div className={styles.metricBlock}>
                      <span className={styles.metricBlockLabel}>Total Score</span>
                      <span className={styles.metricBlockValue}>{item.totalMarks}</span>
                    </div>

                    <div className={styles.metricDivider} />

                    <div className={styles.metricBlock}>
                      <span className={styles.metricBlockLabel}>Percentage</span>
                      <span className={styles.metricBlockValue}>{item.percentage}%</span>
                    </div>

                    <div className={styles.metricDivider} />

                    <div className={styles.metricBlock}>
                      <span className={styles.metricBlockLabel}>Grade</span>
                      <span className={styles.metricBlockValue} style={{ color: "var(--primary)" }}>
                        {item.grade}
                      </span>
                    </div>
                  </div>

                  {/* Remarks preview if present */}
                  {item.remarks && (
                    <div style={{
                      fontSize: "0.82rem",
                      color: "var(--text-secondary)",
                      fontStyle: "italic",
                      background: "rgba(0,0,0,0.02)",
                      padding: "0.45rem 0.75rem",
                      borderRadius: "8px"
                    }}>
                      &ldquo;{item.remarks}&rdquo;
                    </div>
                  )}

                  {/* Actions Footer: View Card & DELETE BUTTON FOR TEACHER */}
                  <div className={styles.cardActionFooter}>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      Subjects graded: {item.marks.length}
                    </span>

                    <div className={styles.cardButtonGrp}>
                      {/* View Details Modal Button */}
                      <button
                        type="button"
                        className={styles.previewBtn}
                        onClick={() => setPreviewItem(item)}
                        title="View Full Report Card Details"
                      >
                        <Eye size={14} />
                        <span>View Card</span>
                      </button>

                      {/* DELETE BUTTON (Teacher Exclusive Requirement) */}
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={() => handleDeleteHistoryItem(item.id, item.studentName)}
                        disabled={deletingId === item.id}
                        title="Delete this report card from history"
                      >
                        <Trash2 size={14} />
                        <span>{deletingId === item.id ? "Deleting..." : "Delete"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* QUICK VIEW REPORT CARD MODAL */}
      {previewItem && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.7)",
            backdropFilter: "blur(6px)",
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem"
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewItem(null);
          }}
        >
          <div style={{
            background: "var(--card-bg, #ffffff)",
            borderRadius: "20px",
            border: "1px solid var(--border-color)",
            padding: "clamp(1.25rem, 3vw, 2rem)",
            maxWidth: "600px",
            width: "100%",
            maxHeight: "90vh",
            overflowY: "auto",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Award size={20} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>Report Card Summary</h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Student & Exam Info */}
            <div style={{ background: "rgba(99, 102, 241, 0.05)", borderRadius: "12px", padding: "1rem", marginBottom: "1.25rem" }}>
              <h4 style={{ margin: "0 0 0.25rem 0", fontSize: "1.1rem", fontWeight: 800 }}>{previewItem.studentName}</h4>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Roll Number: <strong>{previewItem.rollNumber}</strong> • Class: <strong>{previewItem.className}</strong>
              </p>
              <p style={{ margin: "0.35rem 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Examination: <strong>{previewItem.examName}</strong> • Date: <strong>{new Date(previewItem.examDate).toLocaleDateString()}</strong>
              </p>
            </div>

            {/* Subject Breakdown Table */}
            <div style={{ marginBottom: "1.25rem" }}>
              <h4 style={{ margin: "0 0 0.6rem 0", fontSize: "0.95rem", fontWeight: 700 }}>Subject-Wise Breakdown</h4>
              <div style={{ border: "1px solid var(--border-color)", borderRadius: "10px", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "rgba(0, 0, 0, 0.03)", borderBottom: "1px solid var(--border-color)" }}>
                      <th style={{ padding: "0.6rem 0.85rem" }}>Subject</th>
                      <th style={{ padding: "0.6rem 0.85rem", textAlign: "center" }}>Marks</th>
                      <th style={{ padding: "0.6rem 0.85rem", textAlign: "center" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewItem.marks.map((m, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid var(--border-color)" }}>
                        <td style={{ padding: "0.6rem 0.85rem", fontWeight: 600 }}>{m.subjectName}</td>
                        <td style={{ padding: "0.6rem 0.85rem", textAlign: "center", fontWeight: 700 }}>
                          {m.score} / {m.maxScore}
                        </td>
                        <td style={{ padding: "0.6rem 0.85rem", textAlign: "center" }}>
                          <span style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            padding: "0.2rem 0.5rem",
                            borderRadius: "4px",
                            background: m.score >= m.passMarks ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                            color: m.score >= m.passMarks ? "#10b981" : "#ef4444"
                          }}>
                            {m.score >= m.passMarks ? "PASS" : "FAIL"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Overall Summary Bar */}
            <div style={{
              background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
              color: "#ffffff",
              padding: "1rem 1.25rem",
              borderRadius: "12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1.25rem"
            }}>
              <div>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", opacity: 0.7 }}>Total Score</span>
                <div style={{ fontSize: "1.3rem", fontWeight: 900 }}>{previewItem.totalMarks} ({previewItem.percentage}%)</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", opacity: 0.7 }}>Grade</span>
                <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "#34d399" }}>{previewItem.grade}</div>
              </div>
            </div>

            {/* Teacher Remarks */}
            {previewItem.remarks && (
              <div style={{ background: "rgba(0, 0, 0, 0.02)", borderLeft: "4px solid var(--primary)", padding: "0.75rem 1rem", borderRadius: "8px", marginBottom: "1.25rem", fontSize: "0.875rem" }}>
                <span style={{ fontWeight: 700, display: "block", marginBottom: "0.2rem" }}>Teacher Remarks:</span>
                <span style={{ fontStyle: "italic", color: "var(--text-secondary)" }}>{previewItem.remarks}</span>
              </div>
            )}

            {/* Close Button */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                style={{
                  padding: "0.6rem 1.4rem",
                  borderRadius: "8px",
                  border: "none",
                  background: "var(--primary)",
                  color: "#ffffff",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document & OCR Scanner Modal */}
      <ReportCardDocumentScanModal
        isOpen={showScanModal}
        onClose={() => setShowScanModal(false)}
        classes={classes}
        selectedClassId={selectedClassId}
        onReportCardCreated={(newCard, recipients) => {
          setHistory(prev => [newCard, ...prev]);
          setSuccessBanner({
            message: `Report card created from scanned document and connected to database for ${newCard.studentName}!`,
            recipients
          });
          router.refresh();
        }}
      />
    </div>
  );
}
