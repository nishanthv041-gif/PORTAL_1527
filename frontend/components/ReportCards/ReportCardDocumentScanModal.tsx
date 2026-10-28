"use client";

import { useState, useRef, useMemo } from "react";
import {
  Upload, FileText, Image as ImageIcon, FileSpreadsheet, FileCode,
  CheckCircle2, AlertCircle, Sparkles, RefreshCw, Trash2, Plus,
  Award, Calendar, User, ChevronRight, X, ArrowRight, ShieldCheck, Check
} from "lucide-react";
import type { TeacherClass, ClassSubject, ClassStudent, HistoryItem } from "./TeacherReportCardsClient";
import { scanReportCardAction } from "@/backend/api/actions/dashboard/teacher/report-cards/scanReportCardAction";
import type { ScanReportCardResult, ScannedReportCardSubject } from "@/backend/api/actions/dashboard/teacher/report-cards/scanReportCardTypes";
import { createAndSendReportCardAction } from "@/backend/lib/services/reportCardActions";

interface ReportCardDocumentScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: TeacherClass[];
  selectedClassId: string;
  onReportCardCreated: (newCard: HistoryItem, recipients: string[]) => void;
}

const SUPPORTED_EXTS = ["jpg", "jpeg", "png", "webp", "bmp", "pdf", "xlsx", "xls", "csv", "docx", "doc"];

export default function ReportCardDocumentScanModal({
  isOpen,
  onClose,
  classes,
  selectedClassId: initialClassId,
  onReportCardCreated
}: ReportCardDocumentScanModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Class Selection
  const [activeClassId, setActiveClassId] = useState<string>(initialClassId || classes[0]?.id || "");
  const currentClass = useMemo(() => {
    return classes.find(c => c.id === activeClassId) || classes[0];
  }, [classes, activeClassId]);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);

  // Scanned / Review State
  const [scanResult, setScanResult] = useState<ScanReportCardResult | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [examName, setExamName] = useState<string>("Midterm Examination");
  const [examDate, setExamDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [subjects, setSubjects] = useState<ScannedReportCardSubject[]>([]);
  const [generalRemarks, setGeneralRemarks] = useState<string>("");

  // Saving state
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  // Handle Class Switch
  const handleClassChange = (newClassId: string) => {
    setActiveClassId(newClassId);
    setSelectedStudentId("");
    // Re-map subjects if we have scanned data
    const newClass = classes.find(c => c.id === newClassId);
    if (newClass && subjects.length > 0) {
      setSubjects(prev =>
        prev.map(sub => {
          const matched = newClass.subjects.find(
            s => s.name.toLowerCase() === sub.subjectName.toLowerCase()
          );
          return {
            ...sub,
            subjectId: matched?.id || ""
          };
        })
      );
    }
  };

  // File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const processSelectedFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!SUPPORTED_EXTS.includes(ext)) {
      setScanError(`Unsupported file format (.${ext}). Supported formats: .jpg, .png, .pdf, .xlsx, .docx, .csv`);
      return;
    }

    setSelectedFile(file);
    setScanError(null);
    setSaveSuccess(null);
    setIsScanning(true);

    try {
      // 1. If Image file (.png, .jpg, .jpeg, .webp): Run browser OCR via Tesseract.js
      if (["png", "jpg", "jpeg", "webp", "bmp"].includes(ext) || file.type.startsWith("image/")) {
        setScanProgress("Initializing Browser OCR Engine (Tesseract.js)...");
        try {
          const { createWorker } = await import("tesseract.js");
          const worker = await createWorker("eng");
          setScanProgress("Scanning image letters and numeric marks...");
          const ret = await worker.recognize(file);
          await worker.terminate();

          const ocrText = ret.data?.text || "";
          setScanProgress("Matching student name, subjects, and score criteria...");

          const formData = new FormData();
          formData.set("classId", activeClassId);
          formData.set("file", file);
          formData.set("ocrText", ocrText);

          const result = await scanReportCardAction(formData);
          applyScanResult(result);
          setIsScanning(false);
          return;
        } catch (ocrErr) {
          console.warn("Client OCR fallback to server:", ocrErr);
          setScanProgress("Processing image via server scanner...");
        }
      }

      // 2. Spreadsheets, PDFs, Word docs & Fallbacks via Server Action
      setScanProgress(`Parsing ${ext.toUpperCase()} document content and tables...`);
      const formData = new FormData();
      formData.set("classId", activeClassId);
      formData.set("file", file);

      const result = await scanReportCardAction(formData);
      applyScanResult(result);
    } catch (err) {
      console.error("Scan error:", err);
      setScanError(err instanceof Error ? err.message : "Failed to scan document.");
    } finally {
      setIsScanning(false);
    }
  };

  const applyScanResult = (result: ScanReportCardResult) => {
    if (!result.success) {
      setScanError(result.error || "Failed to parse document data.");
      return;
    }

    setScanResult(result);
    setSelectedStudentId(result.studentId || "");
    setExamName(result.examName || "Midterm Examination");
    setExamDate(result.examDate || new Date().toISOString().split("T")[0]);
    setGeneralRemarks(result.generalRemarks || "");
    setSubjects(result.subjects || []);
  };

  // Switch student from multi-student excel gradebook
  const handleSelectMultiStudent = (entry: any) => {
    setSelectedStudentId(entry.studentId || "");
    setSubjects(entry.subjects || []);
  };

  // Subject mark edits ("Invalided data edit option")
  const handleSubjectScoreChange = (id: string, val: string) => {
    setSubjects(prev =>
      prev.map(sub => {
        if (sub.id !== id) return sub;
        const num = val === "" ? "" : Number(val);
        let isInvalid = false;
        let validationError = "";

        if (num === "") {
          isInvalid = true;
          validationError = "Score required";
        } else if (isNaN(num as number) || (num as number) < 0) {
          isInvalid = true;
          validationError = "Cannot be negative";
        } else if ((num as number) > sub.maxScore) {
          isInvalid = true;
          validationError = `Exceeds max marks (${sub.maxScore})`;
        }

        return {
          ...sub,
          score: num,
          isInvalid,
          validationError
        };
      })
    );
  };

  const handleSubjectMaxChange = (id: string, val: string) => {
    const num = Math.max(1, Number(val) || 100);
    setSubjects(prev =>
      prev.map(sub => {
        if (sub.id !== id) return sub;
        const currentScore = sub.score !== "" ? Number(sub.score) : "";
        const isInvalid = currentScore !== "" && currentScore > num;
        return {
          ...sub,
          maxScore: num,
          isInvalid,
          validationError: isInvalid ? `Exceeds max marks (${num})` : undefined
        };
      })
    );
  };

  const handleSubjectPassChange = (id: string, val: string) => {
    const num = Math.max(0, Number(val) || 35);
    setSubjects(prev =>
      prev.map(sub => {
        if (sub.id !== id) return sub;
        return { ...sub, passMarks: num };
      })
    );
  };

  const handleSubjectMappingChange = (id: string, newSubjectId: string) => {
    const matched = currentClass?.subjects.find(s => s.id === newSubjectId);
    setSubjects(prev =>
      prev.map(sub => {
        if (sub.id !== id) return sub;
        return {
          ...sub,
          subjectId: newSubjectId,
          subjectName: matched ? matched.name : sub.subjectName
        };
      })
    );
  };

  const handleSubjectRemarksChange = (id: string, remarks: string) => {
    setSubjects(prev =>
      prev.map(sub => (sub.id === id ? { ...sub, remarks } : sub))
    );
  };

  const handleDeleteSubject = (id: string) => {
    setSubjects(prev => prev.filter(s => s.id !== id));
  };

  const handleAddSubject = () => {
    const unselected = currentClass?.subjects.find(
      cs => !subjects.some(s => s.subjectId === cs.id)
    ) || currentClass?.subjects[0];

    const newSub: ScannedReportCardSubject = {
      id: `manual-add-${Date.now()}`,
      subjectId: unselected?.id || "",
      subjectName: unselected?.name || "Subject",
      score: "",
      maxScore: unselected?.maxMarks || 100,
      passMarks: unselected?.passMarks || 35,
      remarks: "",
      isInvalid: true,
      validationError: "Enter score"
    };
    setSubjects(prev => [...prev, newSub]);
  };

  // Live Summary Calculation
  const totals = useMemo(() => {
    let obtained = 0;
    let maximum = 0;
    let hasFail = false;
    let hasAnyMarks = false;

    subjects.forEach(sub => {
      maximum += sub.maxScore;
      if (sub.score !== "") {
        hasAnyMarks = true;
        const num = Number(sub.score);
        obtained += num;
        if (num < sub.passMarks) {
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

    const hasValidationErrors = subjects.some(s => s.isInvalid || s.score === "");

    return {
      obtained,
      maximum,
      percentage,
      grade,
      hasFail,
      hasAnyMarks,
      hasValidationErrors
    };
  }, [subjects]);

  // Connect to Database & Create Report Card
  const handleConnectAndSaveToDatabase = async () => {
    if (!activeClassId) {
      setScanError("Please select a class.");
      return;
    }

    if (!selectedStudentId) {
      setScanError("Please select the student this report card belongs to.");
      return;
    }

    if (!examName.trim()) {
      setScanError("Please specify an examination name.");
      return;
    }

    if (subjects.length === 0) {
      setScanError("At least one subject mark is required.");
      return;
    }

    // Check for invalid marks
    const invalidSub = subjects.find(s => s.score === "" || isNaN(Number(s.score)) || Number(s.score) < 0 || Number(s.score) > s.maxScore);
    if (invalidSub) {
      setScanError(`Please correct the score for ${invalidSub.subjectName} before saving.`);
      return;
    }

    setIsSaving(true);
    setScanError(null);

    try {
      // Ensure all subjects have valid subjectIds from the class
      const formattedMarks = subjects.map(s => {
        let finalSubjectId = s.subjectId;
        if (!finalSubjectId) {
          const match = currentClass?.subjects.find(
            cs => cs.name.toLowerCase() === s.subjectName.toLowerCase()
          );
          finalSubjectId = match?.id || currentClass?.subjects[0]?.id || "";
        }
        return {
          subjectId: finalSubjectId,
          score: Number(s.score),
          maxScore: s.maxScore,
          passMarks: s.passMarks,
          remarks: s.remarks || undefined
        };
      });

      const res = await createAndSendReportCardAction({
        studentId: selectedStudentId,
        classId: activeClassId,
        examName: examName.trim(),
        examDate,
        marks: formattedMarks,
        remarks: generalRemarks.trim() || undefined
      });

      if (res.success && res.reportCardId) {
        const studentObj = currentClass?.students.find(s => s.id === selectedStudentId);
        const newHistoryItem: HistoryItem = {
          id: res.reportCardId,
          studentId: selectedStudentId,
          studentName: studentObj?.name || "Student",
          rollNumber: studentObj?.rollNumber || "",
          className: currentClass ? `${currentClass.name} - ${currentClass.section}` : "Class",
          classId: activeClassId,
          examId: `exam-${Date.now()}`,
          examName: examName.trim(),
          examDate: new Date(examDate).toISOString(),
          totalMarks: res.totalMarks || totals.obtained,
          percentage: res.percentage || totals.percentage,
          grade: res.grade || totals.grade,
          remarks: generalRemarks.trim() || null,
          published: true,
          parentVerified: false,
          marks: subjects.map(s => ({
            id: `m-${s.id}`,
            subjectId: s.subjectId,
            subjectName: s.subjectName,
            score: Number(s.score) || 0,
            maxScore: s.maxScore,
            passMarks: s.passMarks,
            remarks: s.remarks || null
          }))
        };

        setSaveSuccess(`Report card successfully created and connected to database for ${studentObj?.name || "Student"}!`);
        onReportCardCreated(newHistoryItem, res.recipients || []);
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setScanError(res.error || "Failed to save report card to database.");
      }
    } catch (saveErr) {
      console.error("Save error:", saveErr);
      setScanError(saveErr instanceof Error ? saveErr.message : "Failed to connect to database.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      backgroundColor: "rgba(15, 23, 42, 0.75)",
      backdropFilter: "blur(6px)",
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem",
      overflowY: "auto"
    }}>
      <div style={{
        background: "var(--card-bg, #ffffff)",
        border: "1px solid var(--border-color, #e2e8f0)",
        borderRadius: "20px",
        width: "100%",
        maxWidth: "960px",
        maxHeight: "92vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        overflow: "hidden"
      }}>
        {/* Header */}
        <div style={{
          padding: "1.25rem 1.5rem",
          borderBottom: "1px solid var(--border-color, #e2e8f0)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(14, 165, 233, 0.08) 100%)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              background: "var(--primary, #6366f1)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <Sparkles size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "var(--foreground)" }}>
                Report Card Document &amp; OCR Scanner
              </h2>
              <p style={{ margin: 0, fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                Upload photos, PDFs, Excel sheets, or Word docs • OCR data extraction • Edit invalid data • Connect to Database
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: "0.4rem",
              borderRadius: "8px"
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Target Class Selector */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            background: "rgba(99, 102, 241, 0.04)",
            padding: "0.85rem 1.25rem",
            borderRadius: "12px",
            border: "1px solid var(--border-color)"
          }}>
            <span style={{ fontWeight: 700, fontSize: "0.88rem", whiteSpace: "nowrap" }}>Target Class:</span>
            <select
              value={activeClassId}
              onChange={e => handleClassChange(e.target.value)}
              style={{
                flex: 1,
                padding: "0.5rem 0.85rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                background: "var(--input-bg, #ffffff)",
                fontWeight: 700,
                fontSize: "0.9rem"
              }}
            >
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} - Section {c.section} ({c.students.length} Students, {c.subjects.length} Subjects)
                </option>
              ))}
            </select>
          </div>

          {/* Upload Zone */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: "2px dashed var(--primary, #6366f1)",
              borderRadius: "16px",
              padding: "2rem 1.5rem",
              textAlign: "center",
              background: "rgba(99, 102, 241, 0.02)",
              cursor: "pointer",
              transition: "all 0.2s ease"
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.bmp,.pdf,.xlsx,.xls,.csv,.docx,.doc"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />

            <Upload size={38} color="var(--primary)" style={{ margin: "0 auto 0.75rem" }} />

            <h3 style={{ margin: "0 0 0.35rem 0", fontSize: "1.05rem", fontWeight: 800 }}>
              {selectedFile ? selectedFile.name : "Choose or drag & drop documentation file here"}
            </h3>
            <p style={{ margin: "0 0 0.85rem 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Accepts <strong>JPG, PNG photos</strong> (OCR text scan), <strong>PDFs</strong>, <strong>Excel (.xlsx, .csv)</strong>, and <strong>Word (.docx)</strong>
            </p>

            <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.75rem", padding: "3px 8px", borderRadius: "6px", background: "rgba(16, 185, 129, 0.12)", color: "#10b981", fontWeight: 700 }}>
                📷 Photos (OCR)
              </span>
              <span style={{ fontSize: "0.75rem", padding: "3px 8px", borderRadius: "6px", background: "rgba(239, 68, 68, 0.12)", color: "#ef4444", fontWeight: 700 }}>
                📕 PDF
              </span>
              <span style={{ fontSize: "0.75rem", padding: "3px 8px", borderRadius: "6px", background: "rgba(59, 130, 246, 0.12)", color: "#3b82f6", fontWeight: 700 }}>
                📊 Excel / CSV
              </span>
              <span style={{ fontSize: "0.75rem", padding: "3px 8px", borderRadius: "6px", background: "rgba(168, 85, 247, 0.12)", color: "#a855f7", fontWeight: 700 }}>
                📝 Word Doc
              </span>
            </div>
          </div>

          {/* Scanning Progress */}
          {isScanning && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "1rem",
              borderRadius: "12px",
              background: "rgba(99, 102, 241, 0.08)",
              border: "1px solid rgba(99, 102, 241, 0.2)"
            }}>
              <RefreshCw size={20} className="animate-spin" color="var(--primary)" />
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, fontSize: "0.88rem", display: "block" }}>
                  {scanProgress || "Scanning document..."}
                </span>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  Extracting student marks, subject criteria, and exam data with OCR engine
                </span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {scanError && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "0.85rem 1rem",
              borderRadius: "10px",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              color: "#ef4444",
              fontSize: "0.875rem",
              fontWeight: 600
            }}>
              <AlertCircle size={18} />
              <span>{scanError}</span>
            </div>
          )}

          {/* Success Banner */}
          {saveSuccess && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "0.85rem 1rem",
              borderRadius: "10px",
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              color: "#10b981",
              fontSize: "0.875rem",
              fontWeight: 700
            }}>
              <CheckCircle2 size={18} />
              <span>{saveSuccess}</span>
            </div>
          )}

          {/* ========================================================
              SCANNED DATA INTERACTIVE EDITOR & INVALID DATA CORRECTION
             ======================================================== */}
          {scanResult && (
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
              border: "1px solid var(--border-color)",
              borderRadius: "16px",
              padding: "1.25rem",
              background: "rgba(0,0,0,0.01)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <ShieldCheck size={20} color="var(--primary)" />
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800 }}>
                    Scanned Report Card Data Review &amp; Edit
                  </h3>
                </div>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  Source: <strong>{scanResult.fileDetails.name}</strong> ({scanResult.fileDetails.type})
                </span>
              </div>

              {/* Multi-Student Switcher if Gradebook Matrix */}
              {scanResult.allDetectedStudents && scanResult.allDetectedStudents.length > 1 && (
                <div style={{
                  padding: "0.75rem",
                  borderRadius: "10px",
                  background: "rgba(99, 102, 241, 0.05)",
                  border: "1px solid rgba(99, 102, 241, 0.15)"
                }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>
                    Detected {scanResult.allDetectedStudents.length} Students in Gradebook:
                  </span>
                  <div style={{ display: "flex", gap: "0.4rem", overflowX: "auto", paddingBottom: "0.25rem" }}>
                    {scanResult.allDetectedStudents.map((entry, idx) => {
                      const isCurr = entry.studentId === selectedStudentId;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectMultiStudent(entry)}
                          style={{
                            padding: "0.35rem 0.75rem",
                            borderRadius: "6px",
                            border: isCurr ? "1.5px solid var(--primary)" : "1px solid var(--border-color)",
                            background: isCurr ? "var(--primary)" : "var(--card-bg)",
                            color: isCurr ? "#ffffff" : "var(--foreground)",
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            cursor: "pointer"
                          }}
                        >
                          {entry.studentName} ({entry.rollNumber})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Identification Row: Student Match & Exam Details */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
                {/* Student Selector */}
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.3rem", color: "var(--text-secondary)" }}>
                    Assigned Student ({scanResult.studentConfidence === "HIGH" ? "✓ Matched" : "⚠️ Verify Student"}):
                  </label>
                  <select
                    value={selectedStudentId}
                    onChange={e => setSelectedStudentId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      borderRadius: "8px",
                      border: selectedStudentId ? "1.5px solid var(--border-color)" : "1.5px solid #ef4444",
                      background: "var(--input-bg, #ffffff)",
                      fontWeight: 700,
                      fontSize: "0.88rem"
                    }}
                  >
                    <option value="">-- Select Enrolled Student --</option>
                    {currentClass?.students.map(st => (
                      <option key={st.id} value={st.id}>
                        {st.name} ({st.rollNumber})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Exam Name */}
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.3rem", color: "var(--text-secondary)" }}>
                    Examination / Term:
                  </label>
                  <input
                    type="text"
                    value={examName}
                    onChange={e => setExamName(e.target.value)}
                    placeholder="e.g. Midterm Examination"
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      background: "var(--input-bg, #ffffff)",
                      fontWeight: 700,
                      fontSize: "0.88rem",
                      boxSizing: "border-box"
                    }}
                  />
                </div>

                {/* Exam Date */}
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.3rem", color: "var(--text-secondary)" }}>
                    Examination Date:
                  </label>
                  <input
                    type="date"
                    value={examDate}
                    onChange={e => setExamDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      background: "var(--input-bg, #ffffff)",
                      fontWeight: 700,
                      fontSize: "0.88rem",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              </div>

              {/* Editable Subjects Table ("Invalided data edit option") */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                    Scanned Subject Marks &amp; Criteria:
                  </span>
                  <button
                    type="button"
                    onClick={handleAddSubject}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      background: "rgba(99, 102, 241, 0.1)",
                      color: "var(--primary)",
                      border: "1px solid rgba(99, 102, 241, 0.25)",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      cursor: "pointer"
                    }}
                  >
                    <Plus size={14} /> Add Subject
                  </button>
                </div>

                <div style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: "10px",
                  overflowX: "auto",
                  background: "var(--card-bg)"
                }}>
                  <table style={{ width: "100%", minWidth: "580px", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ background: "rgba(0,0,0,0.03)", borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                        <th style={{ padding: "0.6rem 0.8rem", width: "32%" }}>Subject Name</th>
                        <th style={{ padding: "0.6rem 0.8rem", width: "18%", textAlign: "center" }}>Marks Scored</th>
                        <th style={{ padding: "0.6rem 0.8rem", width: "15%", textAlign: "center" }}>Max Mark</th>
                        <th style={{ padding: "0.6rem 0.8rem", width: "15%", textAlign: "center" }}>Pass Mark</th>
                        <th style={{ padding: "0.6rem 0.8rem", width: "15%" }}>Remarks</th>
                        <th style={{ padding: "0.6rem 0.5rem", width: "5%", textAlign: "center" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjects.map(sub => {
                        const scoreNum = sub.score !== "" ? Number(sub.score) : NaN;
                        const isFail = !isNaN(scoreNum) && scoreNum < sub.passMarks;

                        return (
                          <tr key={sub.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                            {/* Subject Dropdown / Mapping */}
                            <td style={{ padding: "0.5rem 0.8rem" }}>
                              <select
                                value={sub.subjectId}
                                onChange={e => handleSubjectMappingChange(sub.id, e.target.value)}
                                style={{
                                  width: "100%",
                                  padding: "0.4rem 0.6rem",
                                  borderRadius: "6px",
                                  border: "1px solid var(--border-color)",
                                  fontWeight: 700,
                                  fontSize: "0.825rem",
                                  background: "var(--input-bg, #ffffff)"
                                }}
                              >
                                {currentClass?.subjects.map(cs => (
                                  <option key={cs.id} value={cs.id}>
                                    {cs.name}
                                  </option>
                                ))}
                                {!currentClass?.subjects.some(cs => cs.id === sub.subjectId) && (
                                  <option value={sub.subjectId || ""}>{sub.subjectName}</option>
                                )}
                              </select>
                            </td>

                            {/* Score Input with Invalidation Alert */}
                            <td style={{ padding: "0.5rem 0.8rem", textAlign: "center" }}>
                              <input
                                type="number"
                                min={0}
                                max={sub.maxScore}
                                value={sub.score}
                                onChange={e => handleSubjectScoreChange(sub.id, e.target.value)}
                                style={{
                                  width: "75px",
                                  padding: "0.4rem 0.5rem",
                                  borderRadius: "6px",
                                  border: sub.isInvalid ? "1.5px solid #ef4444" : "1px solid var(--border-color)",
                                  textAlign: "center",
                                  fontWeight: 800,
                                  fontSize: "0.95rem",
                                  background: sub.isInvalid ? "rgba(239, 68, 68, 0.05)" : "var(--input-bg, #ffffff)"
                                }}
                              />
                              {sub.isInvalid && (
                                <span style={{ display: "block", fontSize: "0.7rem", color: "#ef4444", fontWeight: 700, marginTop: "2px" }}>
                                  {sub.validationError || "Invalid"}
                                </span>
                              )}
                            </td>

                            {/* Max Score */}
                            <td style={{ padding: "0.5rem 0.8rem", textAlign: "center" }}>
                              <input
                                type="number"
                                min={1}
                                value={sub.maxScore}
                                onChange={e => handleSubjectMaxChange(sub.id, e.target.value)}
                                style={{
                                  width: "60px",
                                  padding: "0.4rem 0.5rem",
                                  borderRadius: "6px",
                                  border: "1px solid var(--border-color)",
                                  textAlign: "center",
                                  fontSize: "0.825rem",
                                  background: "var(--input-bg, #ffffff)"
                                }}
                              />
                            </td>

                            {/* Pass Marks */}
                            <td style={{ padding: "0.5rem 0.8rem", textAlign: "center" }}>
                              <input
                                type="number"
                                min={0}
                                value={sub.passMarks}
                                onChange={e => handleSubjectPassChange(sub.id, e.target.value)}
                                style={{
                                  width: "60px",
                                  padding: "0.4rem 0.5rem",
                                  borderRadius: "6px",
                                  border: "1px solid var(--border-color)",
                                  textAlign: "center",
                                  fontSize: "0.825rem",
                                  background: "var(--input-bg, #ffffff)"
                                }}
                              />
                            </td>

                            {/* Remarks */}
                            <td style={{ padding: "0.5rem 0.8rem" }}>
                              <input
                                type="text"
                                value={sub.remarks || ""}
                                placeholder={isFail ? "Needs revision" : "Good"}
                                onChange={e => handleSubjectRemarksChange(sub.id, e.target.value)}
                                style={{
                                  width: "100%",
                                  padding: "0.4rem 0.6rem",
                                  borderRadius: "6px",
                                  border: "1px solid var(--border-color)",
                                  fontSize: "0.8rem",
                                  background: "var(--input-bg, #ffffff)",
                                  boxSizing: "border-box"
                                }}
                              />
                            </td>

                            {/* Delete Row */}
                            <td style={{ padding: "0.5rem 0.5rem", textAlign: "center" }}>
                              <button
                                type="button"
                                onClick={() => handleDeleteSubject(sub.id)}
                                title="Remove this subject row"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: "var(--danger, #ef4444)",
                                  cursor: "pointer",
                                  padding: "0.3rem"
                                }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Live Totals & Feedback */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "0.75rem",
                padding: "0.85rem 1rem",
                borderRadius: "10px",
                background: "rgba(99, 102, 241, 0.05)",
                border: "1px solid rgba(99, 102, 241, 0.15)",
                textAlign: "center"
              }}>
                <div>
                  <span style={{ fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 700, color: "var(--text-secondary)" }}>
                    Total Marks
                  </span>
                  <div style={{ fontSize: "1.2rem", fontWeight: 900 }}>
                    {totals.obtained} / {totals.maximum}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 700, color: "var(--text-secondary)" }}>
                    Percentage
                  </span>
                  <div style={{ fontSize: "1.2rem", fontWeight: 900, color: "var(--primary)" }}>
                    {totals.percentage}%
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 700, color: "var(--text-secondary)" }}>
                    Overall Grade
                  </span>
                  <div style={{ fontSize: "1.2rem", fontWeight: 900, color: totals.grade === "F" ? "#ef4444" : "#10b981" }}>
                    {totals.grade}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 700, color: "var(--text-secondary)" }}>
                    Result
                  </span>
                  <div style={{ fontSize: "0.85rem", fontWeight: 800, textTransform: "uppercase", color: totals.hasFail ? "#ef4444" : "#10b981" }}>
                    {totals.hasFail ? "Needs Support" : "Passed"}
                  </div>
                </div>
              </div>

              {/* General Remarks */}
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.3rem", color: "var(--text-secondary)" }}>
                  Teacher Feedback &amp; Evaluation Remarks:
                </label>
                <textarea
                  rows={2}
                  value={generalRemarks}
                  onChange={e => setGeneralRemarks(e.target.value)}
                  placeholder="Enter teacher remarks for this student's report card..."
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.85rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    background: "var(--input-bg, #ffffff)",
                    fontSize: "0.88rem",
                    boxSizing: "border-box"
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer / Actions */}
        <div style={{
          padding: "1rem 1.5rem",
          borderTop: "1px solid var(--border-color, #e2e8f0)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          background: "var(--card-bg)"
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.65rem 1.25rem",
              borderRadius: "10px",
              border: "1px solid var(--border-color)",
              background: "transparent",
              color: "var(--foreground)",
              fontWeight: 700,
              fontSize: "0.88rem",
              cursor: "pointer"
            }}
          >
            Cancel
          </button>

          {scanResult && (
            <button
              type="button"
              onClick={handleConnectAndSaveToDatabase}
              disabled={isSaving || totals.hasValidationErrors || !selectedStudentId}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1.75rem",
                borderRadius: "10px",
                border: "none",
                background: "var(--primary, #6366f1)",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: "0.92rem",
                cursor: (isSaving || totals.hasValidationErrors || !selectedStudentId) ? "not-allowed" : "pointer",
                opacity: (isSaving || totals.hasValidationErrors || !selectedStudentId) ? 0.65 : 1,
                boxShadow: "0 4px 14px rgba(99, 102, 241, 0.35)",
                transition: "all 0.2s ease"
              }}
            >
              <CheckCircle2 size={18} />
              <span>{isSaving ? "Connecting to Database..." : "Connect & Save to Database"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
