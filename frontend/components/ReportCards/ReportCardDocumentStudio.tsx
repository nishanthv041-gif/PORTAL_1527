"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import {
  Upload, FileText, Image as ImageIcon, FileSpreadsheet,
  CheckCircle2, AlertCircle, Sparkles, RefreshCw, Trash2, Plus,
  Award, Calendar, Users, Eye, EyeOff, RotateCcw,
  ShieldCheck, Check, X, ArrowRight, Layers, FileCheck, Send, Sliders, Edit3
} from "lucide-react";
import type { TeacherClass, ClassSubject, ClassStudent, HistoryItem } from "./TeacherReportCardsClient";
import type { ScanReportCardResult, ScannedReportCardSubject, DetectedStudentEntry } from "@/backend/api/actions/dashboard/teacher/report-cards/scanReportCardTypes";
import { createAndSendReportCardAction } from "@/backend/lib/services/reportCardActions";

export interface QueuedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  ext: string;
  previewUrl?: string;
  status: "QUEUED" | "PROCESSING" | "EXTRACTED" | "FAILED";
  progressText?: string;
  error?: string;
  result?: ScanReportCardResult;
}

interface ReportCardDocumentStudioProps {
  classes: TeacherClass[];
  selectedClassId: string;
  onClassChange?: (classId: string) => void;
  onReportCardCreated: (newCard: HistoryItem, recipients: string[]) => void;
  onCloseModal?: () => void;
  isModalView?: boolean;
}

const SUPPORTED_EXTS = ["jpg", "jpeg", "png", "webp", "bmp", "pdf", "xlsx", "xls", "csv", "docx", "doc"];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function calculateGrade(score: number, maxScore: number): string {
  if (maxScore <= 0) return "-";
  const pct = (score / maxScore) * 100;
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "F";
}

export default function ReportCardDocumentStudio({
  classes,
  selectedClassId: initialClassId,
  onClassChange,
  onReportCardCreated,
  onCloseModal,
  isModalView = false
}: ReportCardDocumentStudioProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Class Selection State
  const [activeClassId, setActiveClassId] = useState<string>(initialClassId || classes[0]?.id || "");
  const currentClass = useMemo(() => {
    return (classes || []).find(c => c.id === activeClassId) || classes?.[0] || null;
  }, [classes, activeClassId]);

  const classStudents = useMemo(() => currentClass?.students || [], [currentClass]);
  const classSubjects = useMemo(() => currentClass?.subjects || [], [currentClass]);

  // File Queue State
  const [fileQueue, setFileQueue] = useState<QueuedFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  // Active Document Extraction State
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [examName, setExamName] = useState<string>("Midterm Examination");
  const [examDate, setExamDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [examMaxMarks, setExamMaxMarks] = useState<number>(100);
  const [examPassMarks, setExamPassMarks] = useState<number>(35);
  const [attendance, setAttendance] = useState<string>("");
  const [academicYear, setAcademicYear] = useState<string>("2026-2027");
  const [subjects, setSubjects] = useState<ScannedReportCardSubject[]>([]);
  const [generalRemarks, setGeneralRemarks] = useState<string>("");

  const handleApplyCriteriaToAll = (newMax?: number, newPass?: number) => {
    const targetMax = newMax !== undefined ? Math.max(1, newMax) : examMaxMarks;
    const targetPass = newPass !== undefined ? Math.max(0, Math.min(targetMax, newPass)) : examPassMarks;

    setExamMaxMarks(targetMax);
    setExamPassMarks(targetPass);

    setSubjects(prev =>
      prev.map(sub => {
        const scoreNum = sub.score !== "" ? Number(sub.score) : NaN;
        const isInvalid = !isNaN(scoreNum) && (scoreNum < 0 || scoreNum > targetMax);
        const grade = calculateGrade(Number(sub.score) || 0, targetMax);
        const isPass = !isNaN(scoreNum) && scoreNum >= targetPass;

        return {
          ...sub,
          maxScore: targetMax,
          passMarks: targetPass,
          grade,
          status: isInvalid ? "NEEDS_REVIEW" : isPass ? "PASS" : "FAIL",
          isInvalid,
          validationError: isInvalid ? `Score must be between 0 and ${targetMax}` : undefined
        };
      })
    );
  };

  // Review & Split Comparison State
  const [showOriginalDocPreview, setShowOriginalDocPreview] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      fileQueue.forEach(item => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, [fileQueue]);

  // Currently inspected queued file
  const activeQueuedFile = useMemo(() => {
    return fileQueue.find(f => f.id === activeFileId) || fileQueue[0] || null;
  }, [fileQueue, activeFileId]);

  // Live Summary Calculations (Hooks are declared unconditionally at top level)
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

    const invalidCount = subjects.filter(s => s.isInvalid || s.score === "").length;
    const hasValidationErrors = invalidCount > 0;

    return {
      obtained,
      maximum,
      percentage,
      grade,
      hasFail,
      hasAnyMarks,
      invalidCount,
      hasValidationErrors
    };
  }, [subjects]);

  // Handle Target Class Change
  const handleClassChange = (newClassId: string) => {
    setActiveClassId(newClassId);
    if (onClassChange) onClassChange(newClassId);
    setSelectedStudentId("");
    // Re-map subjects if any are currently loaded
    const targetClass = (classes || []).find(c => c.id === newClassId);
    if (targetClass && subjects.length > 0) {
      const newSubs = targetClass.subjects || [];
      setSubjects(prev =>
        prev.map(sub => {
          const match = newSubs.find(
            s => s.name.toLowerCase() === sub.subjectName.toLowerCase()
          );
          return {
            ...sub,
            subjectId: match?.id || "",
            maxScore: match?.maxMarks || sub.maxScore,
            passMarks: match?.passMarks || sub.passMarks
          };
        })
      );
    }
  };

  // Add Files to Queue
  const handleAddFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setGlobalError(null);

    const newEntries: QueuedFile[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const ext = file.name.split(".").pop()?.toLowerCase() || "";

      if (!SUPPORTED_EXTS.includes(ext)) {
        setGlobalError(`File "${file.name}" has an unsupported format (.${ext}). Supported formats: ${SUPPORTED_EXTS.join(", ")}`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setGlobalError(`File "${file.name}" (${formatFileSize(file.size)}) exceeds the maximum allowed size of 25MB.`);
        continue;
      }

      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;

      const entry: QueuedFile = {
        id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        name: file.name,
        size: file.size,
        ext,
        previewUrl,
        status: "QUEUED",
        progressText: "Waiting to scan..."
      };
      newEntries.push(entry);
    }

    if (newEntries.length > 0) {
      setFileQueue(prev => [...prev, ...newEntries]);
      if (!activeFileId) {
        setActiveFileId(newEntries[0].id);
      }
      // Trigger scan for the newly queued entries
      newEntries.forEach(entry => processQueueItem(entry));
    }
  };

  // Process a Queued Item via API
  const processQueueItem = async (entry: QueuedFile) => {
    if (!activeClassId) {
      setGlobalError("Please select a target class before scanning documents.");
      return;
    }

    setFileQueue(prev =>
      prev.map(f => (f.id === entry.id ? { ...f, status: "PROCESSING", progressText: `Scanning ${entry.ext.toUpperCase()} document...` } : f))
    );

    try {
      // 1. For images and photos, run browser-side OCR for high accuracy and instant responsiveness
      let browserOcrText = "";
      if (["png", "jpg", "jpeg", "webp", "bmp"].includes(entry.ext) || entry.file.type.startsWith("image/")) {
        setFileQueue(prev =>
          prev.map(f => (f.id === entry.id ? { ...f, status: "PROCESSING", progressText: "Running optical character recognition (OCR)..." } : f))
        );
        try {
          const { createWorker } = await import("tesseract.js");
          const worker = await createWorker("eng");
          const ocrResult = await worker.recognize(entry.file);
          await worker.terminate();
          browserOcrText = ocrResult?.data?.text || "";
        } catch (ocrErr) {
          console.warn("Browser OCR notice:", ocrErr);
        }
      }

      const formData = new FormData();
      formData.set("classId", activeClassId);
      formData.set("file", entry.file);
      formData.set("defaultMaxMarks", String(examMaxMarks));
      formData.set("defaultPassMarks", String(examPassMarks));
      formData.set("examDate", examDate);
      formData.set("examName", examName);
      if (browserOcrText) {
        formData.set("ocrText", browserOcrText);
      }

      const res = await fetch("/api/teacher/report-cards/scan", {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server error (${res.status}) while processing ${entry.name}`);
      }

      const result: ScanReportCardResult = await res.json();

      if (!result.success) {
        throw new Error(result.error || `Failed to extract data from ${entry.name}`);
      }

      // Update file status in queue
      setFileQueue(prev =>
        prev.map(f =>
          f.id === entry.id
            ? { ...f, status: "EXTRACTED", progressText: "Extracted successfully", result }
            : f
        )
      );

      // If this is currently the active file, apply result to editor
      if (!activeFileId || activeFileId === entry.id) {
        setActiveFileId(entry.id);
        applyScanResultToEditor(result);
      }
    } catch (err: any) {
      console.warn("Scanning notice for file:", entry.name, err);
      // Create a fallback result so the teacher can ALWAYS edit and enter marks!
      const fallbackResult: ScanReportCardResult = {
        success: true,
        fileDetails: { name: entry.name, type: entry.ext.toUpperCase(), size: entry.size },
        studentId: "",
        studentName: "",
        rollNumber: "",
        studentConfidence: "NONE",
        examName: examName || "Midterm Examination",
        examDate: examDate || new Date().toISOString().split("T")[0],
        defaultMaxMarks: examMaxMarks || 100,
        defaultPassMarks: examPassMarks || 35,
        generalRemarks: "",
        subjects: (classSubjects.length > 0 ? classSubjects : [
          { id: "sub-1", name: "Tamil", maxMarks: examMaxMarks || 100, passMarks: examPassMarks || 35 },
          { id: "sub-2", name: "English", maxMarks: examMaxMarks || 100, passMarks: examPassMarks || 35 },
          { id: "sub-3", name: "Mathematics", maxMarks: examMaxMarks || 100, passMarks: examPassMarks || 35 },
          { id: "sub-4", name: "Science", maxMarks: examMaxMarks || 100, passMarks: examPassMarks || 35 },
          { id: "sub-5", name: "Social Science", maxMarks: examMaxMarks || 100, passMarks: examPassMarks || 35 }
        ]).map((sub, sIdx) => ({
          id: `fallback-sub-${sIdx}`,
          subjectId: sub.id,
          subjectName: sub.name,
          score: "",
          maxScore: examMaxMarks || sub.maxMarks || 100,
          passMarks: examPassMarks || sub.passMarks || 35,
          remarks: "",
          grade: "-",
          status: "NEEDS_REVIEW",
          originalExtractedValue: "Ready for manual entry",
          isInvalid: false
        })),
        rawTextPreview: "Document uploaded. Review and enter marks in the editor below."
      };

      setFileQueue(prev =>
        prev.map(f =>
          f.id === entry.id
            ? { ...f, status: "EXTRACTED", progressText: "Ready for review & editing", result: fallbackResult }
            : f
        )
      );

      if (!activeFileId || activeFileId === entry.id) {
        setActiveFileId(entry.id);
        applyScanResultToEditor(fallbackResult);
      }
    }
  };

  // Populate Editor State from Result
  const applyScanResultToEditor = (result: ScanReportCardResult) => {
    setSelectedStudentId(result.studentId || "");
    if (result.examName && !examName) setExamName(result.examName);
    if (result.examDate && !examDate) setExamDate(result.examDate);
    setAttendance(result.attendance ? String(result.attendance) : "");
    setAcademicYear(result.academicYear || "2026-2027");
    setGeneralRemarks(result.generalRemarks || "");

    // Clean subjects to ensure maxScore and passMarks use the configured criteria
    const cleanSubs: ScannedReportCardSubject[] = (result.subjects || []).map(s => {
      let maxScore = s.maxScore || examMaxMarks || 100;
      let passMarks = s.passMarks || examPassMarks || 35;
      if (passMarks === s.score || passMarks > maxScore) {
        passMarks = examPassMarks || 35;
      }
      const scoreNum: number | "" = s.score !== "" && s.score !== undefined && !isNaN(Number(s.score)) ? Number(s.score) : "";
      const isInvalid = scoreNum === "" ? true : (scoreNum < 0 || scoreNum > maxScore);
      const grade = scoreNum !== "" ? calculateGrade(scoreNum, maxScore) : "-";
      const status: "PASS" | "FAIL" | "NEEDS_REVIEW" = scoreNum === "" ? "NEEDS_REVIEW" : scoreNum >= passMarks ? "PASS" : "FAIL";

      return {
        ...s,
        score: scoreNum,
        maxScore,
        passMarks,
        grade,
        status,
        isInvalid,
        validationError: isInvalid ? (scoreNum === "" ? "Score required" : `Between 0 and ${maxScore}`) : ""
      };
    });
    setSubjects(cleanSubs);
    setSaveSuccess(null);
  };

  // Switch Active File in Queue
  const handleSelectQueuedFile = (fileId: string) => {
    setActiveFileId(fileId);
    const item = fileQueue.find(f => f.id === fileId);
    if (item) {
      if (item.result) {
        applyScanResultToEditor(item.result);
      } else {
        const defaultResult: ScanReportCardResult = {
          success: true,
          fileDetails: { name: item.name, type: item.ext.toUpperCase(), size: item.size },
          studentId: "",
          studentName: "",
          rollNumber: "",
          studentConfidence: "NONE",
          examName: examName || "Midterm Examination",
          examDate: examDate || new Date().toISOString().split("T")[0],
          defaultMaxMarks: examMaxMarks || 100,
          defaultPassMarks: examPassMarks || 35,
          generalRemarks: "",
          subjects: (classSubjects.length > 0 ? classSubjects : [
            { id: "sub-1", name: "Tamil", maxMarks: examMaxMarks || 100, passMarks: examPassMarks || 35 },
            { id: "sub-2", name: "English", maxMarks: examMaxMarks || 100, passMarks: examPassMarks || 35 },
            { id: "sub-3", name: "Mathematics", maxMarks: examMaxMarks || 100, passMarks: examPassMarks || 35 },
            { id: "sub-4", name: "Science", maxMarks: examMaxMarks || 100, passMarks: examPassMarks || 35 },
            { id: "sub-5", name: "Social Science", maxMarks: examMaxMarks || 100, passMarks: examPassMarks || 35 }
          ]).map((sub, sIdx) => ({
            id: `init-sub-${sIdx}`,
            subjectId: sub.id,
            subjectName: sub.name,
            score: "",
            maxScore: examMaxMarks || sub.maxMarks || 100,
            passMarks: examPassMarks || sub.passMarks || 35,
            remarks: "",
            grade: "-",
            status: "NEEDS_REVIEW",
            originalExtractedValue: "Ready for manual entry",
            isInvalid: false
          }))
        };
        applyScanResultToEditor(defaultResult);
      }
    }
  };

  // Remove File from Queue
  const handleRemoveFile = (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const item = fileQueue.find(f => f.id === fileId);
    if (item?.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }

    setFileQueue(prev => {
      const remaining = prev.filter(f => f.id !== fileId);
      if (activeFileId === fileId) {
        const nextActive = remaining[0] || null;
        setActiveFileId(nextActive ? nextActive.id : null);
        if (nextActive && nextActive.result) {
          applyScanResultToEditor(nextActive.result);
        } else {
          setSubjects([]);
          setSelectedStudentId("");
        }
      }
      return remaining;
    });
  };

  // Switch Student (from Multi-Student Gradebook)
  const handleSelectMultiStudent = (entry: DetectedStudentEntry) => {
    setSelectedStudentId(entry.studentId || "");
    setSubjects(entry.subjects || []);
    if (entry.attendance) setAttendance(String(entry.attendance));
    if (entry.remarks) setGeneralRemarks(entry.remarks);
  };

  // Invalidation & Inline Field Handlers
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
          validationError = `Exceeds max (${sub.maxScore})`;
        }

        const scoreNum = num !== "" ? Number(num) : 0;
        const status = num === "" ? "NEEDS_REVIEW" : scoreNum >= sub.passMarks ? "PASS" : "FAIL";
        const grade = num !== "" ? calculateGrade(scoreNum, sub.maxScore) : "-";

        return {
          ...sub,
          score: num,
          status,
          grade,
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
        const grade = currentScore !== "" ? calculateGrade(Number(currentScore), num) : "-";
        return {
          ...sub,
          maxScore: num,
          grade,
          isInvalid,
          validationError: isInvalid ? `Exceeds max (${num})` : undefined
        };
      })
    );
  };

  const handleSubjectPassChange = (id: string, val: string) => {
    const num = Math.max(0, Number(val) || 35);
    setSubjects(prev =>
      prev.map(sub => {
        if (sub.id !== id) return sub;
        const currentScore = sub.score !== "" ? Number(sub.score) : "";
        const status = currentScore === "" ? "NEEDS_REVIEW" : Number(currentScore) >= num ? "PASS" : "FAIL";
        return { ...sub, passMarks: num, status };
      })
    );
  };

  const handleSubjectMappingChange = (id: string, newSubjectId: string) => {
    const matched = classSubjects.find(s => s.id === newSubjectId);
    setSubjects(prev =>
      prev.map(sub => {
        if (sub.id !== id) return sub;
        return {
          ...sub,
          subjectId: newSubjectId,
          subjectName: matched ? matched.name : sub.subjectName,
          maxScore: matched?.maxMarks || sub.maxScore,
          passMarks: matched?.passMarks || sub.passMarks
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
    const unselected = classSubjects.find(
      cs => !subjects.some(s => s.subjectId === cs.id)
    ) || classSubjects[0];

    const newSub: ScannedReportCardSubject = {
      id: `manual-add-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      subjectId: unselected?.id || "",
      subjectName: unselected?.name || "Subject",
      score: "",
      maxScore: unselected?.maxMarks || 100,
      passMarks: unselected?.passMarks || 35,
      remarks: "",
      grade: "-",
      status: "NEEDS_REVIEW",
      isInvalid: true,
      validationError: "Enter score"
    };
    setSubjects(prev => [...prev, newSub]);
  };

  const handleResetToExtracted = (subId: string) => {
    if (!activeQueuedFile?.result) return;
    const orig = activeQueuedFile.result.subjects.find(s => s.id === subId);
    if (orig) {
      setSubjects(prev => prev.map(s => (s.id === subId ? { ...orig } : s)));
    }
  };

  // Connect to Database & Persist Approved Report Card
  const handleConnectAndSaveToDatabase = async () => {
    setGlobalError(null);
    setSaveSuccess(null);

    if (!activeClassId) {
      setGlobalError("Please select a valid class.");
      return;
    }
    if (!selectedStudentId) {
      setGlobalError("Please select the student this report card belongs to.");
      return;
    }
    if (!examName.trim()) {
      setGlobalError("Please enter the examination or term name.");
      return;
    }
    if (subjects.length === 0) {
      setGlobalError("Please add at least one subject mark before saving.");
      return;
    }

    const hasErrors = subjects.some(s => s.isInvalid || s.score === "");
    if (hasErrors) {
      setGlobalError("Please correct all highlighted invalid marks before saving.");
      return;
    }

    setIsSaving(true);

    try {
      const formattedMarks = subjects.map(s => {
        let finalSubjectId = s.subjectId;
        if (!finalSubjectId) {
          const match = classSubjects.find(
            cs => cs.name.toLowerCase() === s.subjectName.toLowerCase()
          );
          finalSubjectId = match?.id || classSubjects[0]?.id || "";
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
        const studentObj = classStudents.find(s => s.id === selectedStudentId);
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

        const successMsg = `Report card successfully created and connected to database for ${studentObj?.name || "Student"}! Linked parent(s) notified.`;
        setSaveSuccess(successMsg);
        onReportCardCreated(newHistoryItem, res.recipients || []);

        // If in modal view, close after brief delay
        if (isModalView && onCloseModal) {
          setTimeout(() => {
            onCloseModal();
          }, 1500);
        }
      } else {
        setGlobalError(res.error || "Failed to persist report card to database.");
      }
    } catch (saveErr: any) {
      console.error("Save error:", saveErr);
      setGlobalError(saveErr?.message || "Failed to connect report card to database.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "1.5rem",
      color: "var(--foreground)"
    }}>
      {/* Target Class & Header Bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "0.85rem",
        padding: "clamp(0.75rem, 2vw, 1.25rem)",
        background: "var(--card-bg, #1e293b)",
        borderRadius: "16px",
        border: "1.5px solid var(--border-color, #334155)",
        width: "100%",
        boxSizing: "border-box"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0, flex: "1 1 260px" }}>
          <div style={{
            width: "42px",
            height: "42px",
            borderRadius: "12px",
            background: "linear-gradient(135deg, #6366f1 0%, #0ea5e9 100%)",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)",
            flexShrink: 0
          }}>
            <Sparkles size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "clamp(1rem, 2.8vw, 1.15rem)", fontWeight: 800, wordBreak: "break-word" }}>
              AI Document Scanning &amp; OCR Studio
            </h2>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)", wordBreak: "break-word" }}>
              Review and verify student marks before dispatching report cards to parents.
            </p>
          </div>
        </div>

        {/* Target Class Dropdown */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          flex: "1 1 240px",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          boxSizing: "border-box"
        }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)", whiteSpace: "nowrap", flexShrink: 0 }}>
            Target Class:
          </label>
          <select
            value={activeClassId}
            onChange={e => handleClassChange(e.target.value)}
            style={{
              flex: 1,
              width: "100%",
              minWidth: 0,
              maxWidth: "100%",
              padding: "0.55rem 0.85rem",
              borderRadius: "10px",
              border: "1.5px solid var(--border-color)",
              background: "var(--input-bg, #0f172a)",
              color: "var(--foreground)",
              fontWeight: 700,
              fontSize: "0.88rem",
              cursor: "pointer",
              boxSizing: "border-box"
            }}
          >
            {(classes || []).map(c => (
              <option key={c.id} value={c.id}>
                Class {c.name} - {c.section} ({(c.students || []).length} Students)
              </option>
            ))}
          </select>

          {isModalView && onCloseModal && (
            <button
              type="button"
              onClick={onCloseModal}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
                padding: "0.4rem",
                borderRadius: "8px",
                flexShrink: 0
              }}
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      {/* ========================================================
          EVALUATION CRITERIA & EXAM SETUP PRE-FILL BAR
          (Set Exam Name, Date, Max Mark, Pass Mark before or during upload)
         ======================================================== */}
      <div style={{
        background: "var(--card-bg, #1e293b)",
        border: "1.5px solid var(--border-color, #334155)",
        borderRadius: "16px",
        padding: "clamp(0.85rem, 2vw, 1.25rem)",
        display: "flex",
        flexDirection: "column",
        gap: "0.85rem",
        width: "100%",
        boxSizing: "border-box"
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Sliders size={18} color="var(--primary)" />
            <span style={{ fontWeight: 800, fontSize: "0.95rem" }}>
              Exam &amp; Mark Criteria Setup
            </span>
          </div>
          <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
            Applied automatically when documents are scanned &amp; extracted
          </span>
        </div>

        {/* Inputs Grid: Exam Name, Date, Max Mark, Pass Mark */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "0.75rem",
          alignItems: "end"
        }}>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "0.3rem" }}>
              Exam / Term:
            </label>
            <input
              type="text"
              value={examName}
              onChange={e => setExamName(e.target.value)}
              placeholder="e.g. Midterm Examination"
              style={{
                width: "100%",
                padding: "0.55rem 0.75rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                background: "var(--input-bg, #0f172a)",
                color: "var(--foreground)",
                fontWeight: 700,
                fontSize: "0.85rem",
                boxSizing: "border-box"
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "0.3rem" }}>
              Exam Date:
            </label>
            <input
              type="date"
              value={examDate}
              onChange={e => setExamDate(e.target.value)}
              style={{
                width: "100%",
                padding: "0.55rem 0.75rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                background: "var(--input-bg, #0f172a)",
                color: "var(--foreground)",
                fontWeight: 700,
                fontSize: "0.85rem",
                boxSizing: "border-box"
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "0.3rem" }}>
              Max Mark (Base):
            </label>
            <input
              type="number"
              min={1}
              value={examMaxMarks}
              onChange={e => handleApplyCriteriaToAll(Number(e.target.value) || 100, examPassMarks)}
              style={{
                width: "100%",
                padding: "0.55rem 0.75rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                background: "var(--input-bg, #0f172a)",
                color: "var(--foreground)",
                fontWeight: 800,
                fontSize: "0.85rem",
                textAlign: "center",
                boxSizing: "border-box"
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "0.3rem" }}>
              Pass Mark:
            </label>
            <input
              type="number"
              min={0}
              max={examMaxMarks}
              value={examPassMarks}
              onChange={e => handleApplyCriteriaToAll(examMaxMarks, Number(e.target.value) || 35)}
              style={{
                width: "100%",
                padding: "0.55rem 0.75rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                background: "var(--input-bg, #0f172a)",
                color: "var(--foreground)",
                fontWeight: 800,
                fontSize: "0.85rem",
                textAlign: "center",
                boxSizing: "border-box"
              }}
            />
          </div>
        </div>

        {/* Presets and Quick Apply */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.6rem",
          paddingTop: "0.4rem",
          borderTop: "1px solid rgba(255, 255, 255, 0.05)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
              Presets:
            </span>
            {[
              { label: "100 / 35 (Standard)", max: 100, pass: 35 },
              { label: "50 / 20 (Midterm)", max: 50, pass: 20 },
              { label: "75 / 30 (Quarterly)", max: 75, pass: 30 },
              { label: "25 / 10 (Unit Test)", max: 25, pass: 10 }
            ].map(preset => {
              const isActive = examMaxMarks === preset.max && examPassMarks === preset.pass;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleApplyCriteriaToAll(preset.max, preset.pass)}
                  style={{
                    padding: "0.3rem 0.65rem",
                    borderRadius: "6px",
                    border: isActive ? "1.5px solid var(--primary)" : "1px solid var(--border-color)",
                    background: isActive ? "rgba(99, 102, 241, 0.2)" : "rgba(0, 0, 0, 0.2)",
                    color: isActive ? "var(--primary)" : "var(--foreground)",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {subjects.length > 0 && (
            <button
              type="button"
              onClick={() => handleApplyCriteriaToAll(examMaxMarks, examPassMarks)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.45rem 0.85rem",
                borderRadius: "8px",
                border: "none",
                background: "var(--primary)",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: "0.8rem",
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(99, 102, 241, 0.25)"
              }}
            >
              <Check size={14} /> Apply Criteria to All ({subjects.length}) Subjects
            </button>
          )}
        </div>
      </div>

      {/* Global Alerts */}
      {globalError && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.9rem 1.2rem",
          borderRadius: "12px",
          background: "rgba(239, 68, 68, 0.12)",
          border: "1.5px solid rgba(239, 68, 68, 0.3)",
          color: "#ef4444",
          fontSize: "0.88rem",
          fontWeight: 600
        }}>
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{globalError}</span>
          <button
            type="button"
            onClick={() => setGlobalError(null)}
            style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {saveSuccess && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.9rem 1.2rem",
          borderRadius: "12px",
          background: "rgba(16, 185, 129, 0.12)",
          border: "1.5px solid rgba(16, 185, 129, 0.3)",
          color: "#10b981",
          fontSize: "0.88rem",
          fontWeight: 700
        }}>
          <CheckCircle2 size={20} style={{ flexShrink: 0 }} />
          <span>{saveSuccess}</span>
        </div>
      )}

      {/* ========================================================
          MULTI-FILE UPLOAD ZONE & QUEUE MANAGER
         ======================================================== */}
      <div style={{
        display: "grid",
        gridTemplateColumns: fileQueue.length > 0 ? "repeat(auto-fit, minmax(320px, 1fr))" : "1fr",
        gap: "1.25rem"
      }}>
        {/* Upload Dropzone */}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            handleAddFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: "2px dashed var(--primary, #6366f1)",
            borderRadius: "16px",
            padding: "2.25rem 1.5rem",
            textAlign: "center",
            background: "rgba(99, 102, 241, 0.03)",
            cursor: "pointer",
            transition: "all 0.2s ease"
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.bmp,.pdf,.xlsx,.xls,.csv,.docx,.doc"
            onChange={e => handleAddFiles(e.target.files)}
            style={{ display: "none" }}
          />

          <div style={{
            width: "52px",
            height: "52px",
            borderRadius: "16px",
            background: "rgba(99, 102, 241, 0.1)",
            color: "var(--primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1rem"
          }}>
            <Upload size={28} />
          </div>

          <h3 style={{ margin: "0 0 0.4rem 0", fontSize: "1.05rem", fontWeight: 800 }}>
            Drag &amp; drop document, or click to browse
          </h3>
          <p style={{ margin: 0, fontSize: "0.825rem", color: "var(--text-secondary)" }}>
            Supports JPG, PNG, PDF, Excel, and Word files up to 25MB
          </p>
        </div>

        {/* Uploaded File Queue List */}
        {fileQueue.length > 0 && (
          <div style={{
            background: "var(--card-bg, #1e293b)",
            border: "1.5px solid var(--border-color, #334155)",
            borderRadius: "16px",
            padding: "1rem 1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            maxHeight: "260px",
            overflowY: "auto"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                Processing Queue ({fileQueue.length} {fileQueue.length === 1 ? "file" : "files"})
              </span>
              <button
                type="button"
                onClick={() => setFileQueue([])}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--danger, #ef4444)",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Clear All
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {fileQueue.map(item => {
                const isSelected = item.id === activeFileId;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectQueuedFile(item.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.6rem 0.85rem",
                      borderRadius: "10px",
                      background: isSelected ? "rgba(99, 102, 241, 0.1)" : "rgba(0,0,0,0.15)",
                      border: isSelected ? "1.5px solid var(--primary)" : "1px solid var(--border-color)",
                      cursor: "pointer",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {/* File Type Icon */}
                    <div style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: item.ext === "pdf" ? "rgba(239, 68, 68, 0.15)" : ["xlsx", "xls", "csv"].includes(item.ext) ? "rgba(59, 130, 246, 0.15)" : ["docx", "doc"].includes(item.ext) ? "rgba(168, 85, 247, 0.15)" : "rgba(16, 185, 129, 0.15)",
                      color: item.ext === "pdf" ? "#ef4444" : ["xlsx", "xls", "csv"].includes(item.ext) ? "#3b82f6" : ["docx", "doc"].includes(item.ext) ? "#a855f7" : "#10b981",
                      flexShrink: 0
                    }}>
                      {item.ext === "pdf" ? <FileText size={16} /> : ["xlsx", "xls", "csv"].includes(item.ext) ? <FileSpreadsheet size={16} /> : ["docx", "doc"].includes(item.ext) ? <FileText size={16} /> : <ImageIcon size={16} />}
                    </div>

                    {/* File Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.825rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", display: "flex", gap: "0.5rem" }}>
                        <span>{formatFileSize(item.size)}</span>
                        <span>•</span>
                        <span style={{
                          color: item.status === "EXTRACTED" ? "#10b981" : item.status === "FAILED" ? "#ef4444" : "var(--primary)",
                          fontWeight: 700
                        }}>
                          {item.progressText || item.status}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectQueuedFile(item.id);
                        }}
                        style={{
                          background: isSelected ? "var(--primary)" : "rgba(99, 102, 241, 0.15)",
                          color: isSelected ? "#ffffff" : "var(--primary)",
                          border: "1px solid var(--primary)",
                          borderRadius: "6px",
                          padding: "0.3rem 0.65rem",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem"
                        }}
                        title="Edit marks for this document"
                      >
                        <Edit3 size={13} />
                        <span>Edit</span>
                      </button>

                      {item.status === "FAILED" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            processQueueItem(item);
                          }}
                          title="Retry scan"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--primary)",
                            cursor: "pointer",
                            padding: "0.3rem"
                          }}
                        >
                          <RotateCcw size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleRemoveFile(item.id, e)}
                        title="Remove file"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-secondary)",
                          cursor: "pointer",
                          padding: "0.3rem"
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          ACTIVE DOCUMENT EXTRACTED DATA & INTERACTIVE REVIEW TABLE
         ======================================================== */}
      {activeQueuedFile && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
          background: "var(--card-bg, #1e293b)",
          border: "1.5px solid var(--border-color, #334155)",
          borderRadius: "16px",
          padding: "1.5rem"
        }}>
          {/* Header Bar of Review Studio */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
            borderBottom: "1px solid var(--border-color)",
            paddingBottom: "1rem"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <ShieldCheck size={22} color="var(--primary)" />
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800 }}>
                Data Review &amp; Error Correction Editor
              </h3>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              {activeQueuedFile.previewUrl && (
                <button
                  type="button"
                  onClick={() => setShowOriginalDocPreview(!showOriginalDocPreview)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    padding: "0.4rem 0.75rem",
                    borderRadius: "8px",
                    background: showOriginalDocPreview ? "rgba(99, 102, 241, 0.15)" : "transparent",
                    border: "1px solid var(--border-color)",
                    color: "var(--foreground)",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  {showOriginalDocPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                  <span>{showOriginalDocPreview ? "Hide Original Doc" : "Compare Original Doc"}</span>
                </button>
              )}

              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Source: <strong>{activeQueuedFile.name}</strong> ({activeQueuedFile.result?.fileDetails?.type || activeQueuedFile.ext.toUpperCase()})
              </span>
            </div>
          </div>

          {/* Multi-Student Switcher if Gradebook Matrix */}
          {activeQueuedFile.result?.allDetectedStudents && activeQueuedFile.result.allDetectedStudents.length > 1 && (
            <div style={{
              padding: "0.85rem 1rem",
              borderRadius: "12px",
              background: "rgba(99, 102, 241, 0.05)",
              border: "1px solid rgba(99, 102, 241, 0.15)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.825rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Class Gradebook: {activeQueuedFile.result.allDetectedStudents.length} Students Detected
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Click a student to view &amp; edit their report card
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.25rem" }}>
                {activeQueuedFile.result.allDetectedStudents.map((entry, idx) => {
                  const isCurrent = entry.studentId === selectedStudentId;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectMultiStudent(entry)}
                      style={{
                        padding: "0.45rem 0.85rem",
                        borderRadius: "8px",
                        border: isCurrent ? "1.5px solid var(--primary)" : "1px solid var(--border-color)",
                        background: isCurrent ? "var(--primary)" : "var(--input-bg, #0f172a)",
                        color: isCurrent ? "#ffffff" : "var(--foreground)",
                        fontSize: "0.825rem",
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

          {/* Split View: Original Document vs Extracted Form */}
          <div style={{
            display: "grid",
            gridTemplateColumns: showOriginalDocPreview && activeQueuedFile.previewUrl ? "minmax(300px, 420px) 1fr" : "1fr",
            gap: "1.25rem"
          }}>
            {/* Original Document Preview Box */}
            {showOriginalDocPreview && activeQueuedFile.previewUrl && (
              <div style={{
                border: "1.5px solid var(--border-color)",
                borderRadius: "12px",
                overflow: "hidden",
                background: "#0f172a",
                display: "flex",
                flexDirection: "column"
              }}>
                <div style={{
                  padding: "0.5rem 0.85rem",
                  background: "rgba(0,0,0,0.3)",
                  borderBottom: "1px solid var(--border-color)",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  display: "flex",
                  justifyContent: "space-between"
                }}>
                  <span>Original Document</span>
                  <span>Zoom / Inspect</span>
                </div>
                <div style={{ padding: "0.5rem", overflowY: "auto", maxHeight: "480px", textAlign: "center" }}>
                  <img
                    src={activeQueuedFile.previewUrl}
                    alt="Original Uploaded Document"
                    style={{ maxWidth: "100%", height: "auto", borderRadius: "8px" }}
                  />
                </div>
              </div>
            )}

            {/* Extracted Fields Form */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Header Identification Grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "1rem"
              }}>
                {/* Student Selector */}
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.3rem", color: "var(--text-secondary)" }}>
                    Student Name &amp; ID ({selectedStudentId ? "✓ Selected" : "⚠️ Needs Review"}):
                  </label>
                  <select
                    value={selectedStudentId}
                    onChange={e => {
                      const newStudId = e.target.value;
                      setSelectedStudentId(newStudId);
                      // If this is a detected student from the multi-student matrix, load their subjects automatically!
                      if (activeQueuedFile?.result?.allDetectedStudents && newStudId) {
                        const selectedStudentObj = classStudents.find(cs => cs.id === newStudId);
                        const matchedEntry = activeQueuedFile.result.allDetectedStudents.find(
                          es => es.studentId === newStudId ||
                            (selectedStudentObj && (
                              (es.rollNumber && selectedStudentObj.rollNumber && es.rollNumber.toLowerCase() === selectedStudentObj.rollNumber.toLowerCase()) ||
                              (es.studentName && selectedStudentObj.name && es.studentName.toLowerCase().replace(/[^a-z]/g, "").includes(selectedStudentObj.name.toLowerCase().replace(/[^a-z]/g, ""))) ||
                              (es.studentName && selectedStudentObj.name && selectedStudentObj.name.toLowerCase().replace(/[^a-z]/g, "").includes(es.studentName.toLowerCase().replace(/[^a-z]/g, "")))
                            ))
                        );
                        if (matchedEntry) {
                          setSubjects(matchedEntry.subjects || []);
                          if (matchedEntry.attendance) setAttendance(String(matchedEntry.attendance));
                          if (matchedEntry.remarks) setGeneralRemarks(matchedEntry.remarks);
                        }
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      borderRadius: "8px",
                      border: selectedStudentId ? "1.5px solid var(--border-color)" : "1.5px solid #ef4444",
                      background: "var(--input-bg, #0f172a)",
                      color: "var(--foreground)",
                      fontWeight: 700,
                      fontSize: "0.88rem"
                    }}
                  >
                    <option value="">-- Select Enrolled Student --</option>
                    {classStudents.map(st => (
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
                      background: "var(--input-bg, #0f172a)",
                      color: "var(--foreground)",
                      fontWeight: 700,
                      fontSize: "0.88rem",
                      boxSizing: "border-box"
                    }}
                  />
                </div>

                {/* Exam Date */}
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.3rem", color: "var(--text-secondary)" }}>
                    Exam Date:
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
                      background: "var(--input-bg, #0f172a)",
                      color: "var(--foreground)",
                      fontWeight: 700,
                      fontSize: "0.88rem",
                      boxSizing: "border-box"
                    }}
                  />
                </div>

                {/* Attendance */}
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.3rem", color: "var(--text-secondary)" }}>
                    Attendance (% or Days):
                  </label>
                  <input
                    type="text"
                    value={attendance}
                    onChange={e => setAttendance(e.target.value)}
                    placeholder="e.g. 96%"
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      background: "var(--input-bg, #0f172a)",
                      color: "var(--foreground)",
                      fontWeight: 700,
                      fontSize: "0.88rem",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              </div>

              {/* ========================================================
                  INTERACTIVE EDITABLE TABLE (Exact requested columns)
                  Student ID | Student Name | Class | Subject | Marks Obtained | Max Marks | Pass Marks | Grade | Attendance | Status | Actions
                 ======================================================== */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, fontSize: "0.92rem" }}>
                      Extracted Subject Marks &amp; Academic Criteria:
                    </span>
                    {totals.hasValidationErrors ? (
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "6px",
                        background: "rgba(239, 68, 68, 0.12)",
                        color: "#ef4444",
                        fontSize: "0.75rem",
                        fontWeight: 700
                      }}>
                        ⚠️ {totals.invalidCount} {totals.invalidCount === 1 ? "mark requires" : "marks require"} correction
                      </span>
                    ) : subjects.length > 0 ? (
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "6px",
                        background: "rgba(16, 185, 129, 0.12)",
                        color: "#10b981",
                        fontSize: "0.75rem",
                        fontWeight: 700
                      }}>
                        ✓ All {subjects.length} marks verified
                      </span>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => handleApplyCriteriaToAll(100, 35)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "6px",
                        border: "1px solid var(--border-color)",
                        background: "rgba(99, 102, 241, 0.08)",
                        color: "var(--foreground)",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: "pointer"
                      }}
                      title="Set all subjects to 100 Max and 35 Pass mark"
                    >
                      ⚡ Standard (100/35)
                    </button>

                    <button
                      type="button"
                      onClick={handleAddSubject}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        padding: "5px 12px",
                        borderRadius: "8px",
                        background: "rgba(99, 102, 241, 0.12)",
                        color: "var(--primary)",
                        border: "1px solid rgba(99, 102, 241, 0.3)",
                        fontSize: "0.825rem",
                        fontWeight: 700,
                        cursor: "pointer"
                      }}
                    >
                      <Plus size={15} /> Add Subject
                    </button>
                  </div>
                </div>

                <div style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: "12px",
                  overflowX: "auto",
                  background: "var(--input-bg, #0f172a)"
                }}>
                  <table style={{ width: "100%", minWidth: "820px", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                        <th style={{ padding: "0.7rem 0.85rem", width: "24%" }}>Subject</th>
                        <th style={{ padding: "0.7rem 0.85rem", width: "15%", textAlign: "center" }}>Marks Scored</th>
                        <th style={{ padding: "0.7rem 0.85rem", width: "12%", textAlign: "center" }}>Max Mark</th>
                        <th style={{ padding: "0.7rem 0.85rem", width: "12%", textAlign: "center" }}>Pass Mark</th>
                        <th style={{ padding: "0.7rem 0.85rem", width: "10%", textAlign: "center" }}>Grade</th>
                        <th style={{ padding: "0.7rem 0.85rem", width: "12%", textAlign: "center" }}>Status</th>
                        <th style={{ padding: "0.7rem 0.85rem", width: "10%" }}>Remarks</th>
                        <th style={{ padding: "0.7rem 0.5rem", width: "5%", textAlign: "center" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjects.map(sub => {
                        const scoreNum = sub.score !== "" ? Number(sub.score) : NaN;
                        const isFail = !isNaN(scoreNum) && scoreNum < sub.passMarks;

                        return (
                          <tr key={sub.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                            {/* Subject Dropdown */}
                            <td style={{ padding: "0.55rem 0.85rem" }}>
                              <select
                                value={sub.subjectId}
                                onChange={e => handleSubjectMappingChange(sub.id, e.target.value)}
                                style={{
                                  width: "100%",
                                  padding: "0.45rem 0.65rem",
                                  borderRadius: "6px",
                                  border: "1px solid var(--border-color)",
                                  fontWeight: 700,
                                  fontSize: "0.825rem",
                                  background: "var(--card-bg, #1e293b)",
                                  color: "var(--foreground)"
                                }}
                              >
                                {classSubjects.map(cs => (
                                  <option key={cs.id} value={cs.id}>
                                    {cs.name}
                                  </option>
                                ))}
                                {!classSubjects.some(cs => cs.id === sub.subjectId) && (
                                  <option value={sub.subjectId || ""}>{sub.subjectName} (Unmapped)</option>
                                )}
                              </select>
                              {sub.originalExtractedValue && (
                                <span style={{ display: "block", fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                                  Doc: &ldquo;{sub.originalExtractedValue}&rdquo;
                                </span>
                              )}
                            </td>

                            {/* Marks Scored Input with Invalidation Alert */}
                            <td style={{ padding: "0.55rem 0.85rem", textAlign: "center" }}>
                              <input
                                type="number"
                                min={0}
                                max={sub.maxScore}
                                value={sub.score}
                                onChange={e => handleSubjectScoreChange(sub.id, e.target.value)}
                                style={{
                                  width: "80px",
                                  padding: "0.45rem 0.5rem",
                                  borderRadius: "6px",
                                  border: sub.isInvalid ? "1.5px solid #ef4444" : "1px solid var(--border-color)",
                                  textAlign: "center",
                                  fontWeight: 800,
                                  fontSize: "0.95rem",
                                  background: sub.isInvalid ? "rgba(239, 68, 68, 0.12)" : "var(--card-bg, #1e293b)",
                                  color: "var(--foreground)"
                                }}
                              />
                              {sub.isInvalid && (
                                <span style={{ display: "block", fontSize: "0.7rem", color: "#ef4444", fontWeight: 700, marginTop: "2px" }}>
                                  {sub.validationError || "Invalid"}
                                </span>
                              )}
                            </td>

                            {/* Max Mark */}
                            <td style={{ padding: "0.55rem 0.85rem", textAlign: "center" }}>
                              <input
                                type="number"
                                min={1}
                                value={sub.maxScore}
                                onChange={e => handleSubjectMaxChange(sub.id, e.target.value)}
                                style={{
                                  width: "65px",
                                  padding: "0.45rem 0.5rem",
                                  borderRadius: "6px",
                                  border: "1px solid var(--border-color)",
                                  textAlign: "center",
                                  fontSize: "0.85rem",
                                  background: "var(--card-bg, #1e293b)",
                                  color: "var(--foreground)"
                                }}
                              />
                            </td>

                            {/* Pass Mark */}
                            <td style={{ padding: "0.55rem 0.85rem", textAlign: "center" }}>
                              <input
                                type="number"
                                min={0}
                                value={sub.passMarks}
                                onChange={e => handleSubjectPassChange(sub.id, e.target.value)}
                                style={{
                                  width: "65px",
                                  padding: "0.45rem 0.5rem",
                                  borderRadius: "6px",
                                  border: "1px solid var(--border-color)",
                                  textAlign: "center",
                                  fontSize: "0.85rem",
                                  background: "var(--card-bg, #1e293b)",
                                  color: "var(--foreground)"
                                }}
                              />
                            </td>

                            {/* Grade */}
                            <td style={{ padding: "0.55rem 0.85rem", textAlign: "center" }}>
                              <span style={{
                                padding: "3px 9px",
                                borderRadius: "6px",
                                fontWeight: 800,
                                fontSize: "0.85rem",
                                background: sub.grade === "F" ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                                color: sub.grade === "F" ? "#ef4444" : "#10b981"
                              }}>
                                {sub.grade || "-"}
                              </span>
                            </td>

                            {/* Status */}
                            <td style={{ padding: "0.55rem 0.85rem", textAlign: "center" }}>
                              <span style={{
                                padding: "3px 9px",
                                borderRadius: "6px",
                                fontWeight: 800,
                                fontSize: "0.78rem",
                                textTransform: "uppercase",
                                background: sub.status === "PASS" ? "rgba(16, 185, 129, 0.15)" : sub.status === "FAIL" ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)",
                                color: sub.status === "PASS" ? "#10b981" : sub.status === "FAIL" ? "#ef4444" : "#f59e0b"
                              }}>
                                {sub.status || "REVIEW"}
                              </span>
                            </td>

                            {/* Remarks */}
                            <td style={{ padding: "0.55rem 0.85rem" }}>
                              <input
                                type="text"
                                value={sub.remarks || ""}
                                placeholder={isFail ? "Needs revision" : "Good"}
                                onChange={e => handleSubjectRemarksChange(sub.id, e.target.value)}
                                style={{
                                  width: "100%",
                                  padding: "0.45rem 0.65rem",
                                  borderRadius: "6px",
                                  border: "1px solid var(--border-color)",
                                  fontSize: "0.8rem",
                                  background: "var(--card-bg, #1e293b)",
                                  color: "var(--foreground)",
                                  boxSizing: "border-box"
                                }}
                              />
                            </td>

                            {/* Actions */}
                            <td style={{ padding: "0.55rem 0.5rem", textAlign: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem" }}>
                                {sub.originalExtractedValue && (
                                  <button
                                    type="button"
                                    onClick={() => handleResetToExtracted(sub.id)}
                                    title="Reset to original document text"
                                    style={{
                                      background: "transparent",
                                      border: "none",
                                      color: "var(--text-secondary)",
                                      cursor: "pointer",
                                      padding: "0.25rem"
                                    }}
                                  >
                                    <RotateCcw size={14} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSubject(sub.id)}
                                  title="Delete subject row"
                                  style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "var(--danger, #ef4444)",
                                    cursor: "pointer",
                                    padding: "0.25rem"
                                  }}
                                >
                                  <Trash2 size={15} />
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

              {/* Live Totals & Feedback Bar */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "0.75rem",
                padding: "0.85rem 1rem",
                borderRadius: "12px",
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

              {/* Teacher Remarks */}
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
                    background: "var(--input-bg, #0f172a)",
                    color: "var(--foreground)",
                    fontSize: "0.88rem",
                    boxSizing: "border-box"
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: "1rem",
                marginTop: "0.5rem"
              }}>
                <button
                  type="button"
                  onClick={handleConnectAndSaveToDatabase}
                  disabled={isSaving || totals.hasValidationErrors || !selectedStudentId}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.75rem 1.85rem",
                    borderRadius: "12px",
                    border: "none",
                    background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                    color: "#ffffff",
                    fontWeight: 800,
                    fontSize: "0.95rem",
                    cursor: (isSaving || totals.hasValidationErrors || !selectedStudentId) ? "not-allowed" : "pointer",
                    opacity: (isSaving || totals.hasValidationErrors || !selectedStudentId) ? 0.65 : 1,
                    boxShadow: "0 4px 14px rgba(37, 99, 235, 0.35)",
                    transition: "all 0.2s ease"
                  }}
                >
                  <Send size={18} />
                  <span>{isSaving ? "Sending to Parent..." : "Send Report Card to Parent"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
