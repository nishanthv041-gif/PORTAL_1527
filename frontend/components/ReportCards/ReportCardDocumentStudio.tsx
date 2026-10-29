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
import styles from "./ReportCardDocumentStudio.module.css";

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

/**
 * Compresses/downsamples large mobile phone camera photos client-side
 * to max 1600px and JPEG quality 0.82 to avoid Vercel 4.5MB request limit
 * and reduce mobile upload latency to under 1 second.
 */
async function compressImageForUpload(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") && !/\.(jpg|jpeg|png|webp|bmp)$/i.test(file.name)) {
    return file;
  }
  // If file is already <= 4MB, preserve pristine quality for OCR text recognition
  if (file.size <= 4 * 1024 * 1024) {
    return file;
  }
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_DIM = 1600;
      let width = img.width;
      let height = img.height;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          resolve(blob || file);
        },
        "image/jpeg",
        0.82
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
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

  // Multi-Student Stepper & Verification State
  const [activeStudentIndex, setActiveStudentIndex] = useState<number>(0);
  const [verifiedIndices, setVerifiedIndices] = useState<Set<number>>(new Set());
  const studentEditsRef = useRef<Record<number, {
    studentId: string;
    subjects: ScannedReportCardSubject[];
    attendance: string;
    generalRemarks: string;
  }>>({});

  // Pan / Zoom Document Inspection Modal State
  const [isZoomModalOpen, setIsZoomModalOpen] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

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

  // Active student entry from multi-student detection
  const detectedStudentsList = useMemo(() => {
    return activeQueuedFile?.result?.allDetectedStudents || [];
  }, [activeQueuedFile]);

  // Live Summary Calculations (Hooks are declared unconditionally at top level)
  const totals = useMemo(() => {
    let obtained = 0;
    let maximum = 0;
    let hasFail = false;
    let hasAnyMarks = false;
    let emptyCount = 0;

    subjects.forEach(sub => {
      maximum += sub.maxScore;
      if (sub.score !== "") {
        hasAnyMarks = true;
        const num = Number(sub.score);
        obtained += num;
        if (num < sub.passMarks) {
          hasFail = true;
        }
      } else {
        emptyCount++;
      }
    });

    const isAllEntered = subjects.length > 0 && emptyCount === 0;
    const percentage = maximum > 0 && hasAnyMarks ? parseFloat(((obtained / maximum) * 100).toFixed(1)) : 0;
    
    let grade = "-";
    if (isAllEntered) {
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

    const resultStatus: "PENDING" | "PASSED" | "NEEDS SUPPORT" = !isAllEntered
      ? "PENDING"
      : hasFail || percentage < 35
      ? "NEEDS SUPPORT"
      : "PASSED";

    return {
      obtained,
      maximum,
      percentage,
      grade,
      hasFail,
      hasAnyMarks,
      isAllEntered,
      invalidCount,
      hasValidationErrors,
      resultStatus
    };
  }, [subjects]);

  // Handle Target Class Change
  const handleClassChange = (newClassId: string) => {
    setActiveClassId(newClassId);
    if (onClassChange) onClassChange(newClassId);
    setSelectedStudentId("");
    studentEditsRef.current = {};
    setActiveStudentIndex(0);
    setVerifiedIndices(new Set());

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
      // 1. Client-Side Image Prep: Downscale/compress images only if above 4MB to avoid Vercel 4.5MB limit
      const uploadBlob = await compressImageForUpload(entry.file);
      const uploadFile = new File([uploadBlob], entry.file.name, { type: uploadBlob.type || entry.file.type });

      const formData = new FormData();
      formData.set("classId", activeClassId);
      formData.set("file", uploadFile);
      formData.set("defaultMaxMarks", String(examMaxMarks));
      formData.set("defaultPassMarks", String(examPassMarks));
      formData.set("examDate", examDate);
      formData.set("examName", examName);

      // 2. Call server extraction endpoint
      let res = await fetch("/api/report-cards/extract", {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        res = await fetch("/api/teacher/report-cards/scan", {
          method: "POST",
          body: formData
        });
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server returned ${res.status} while processing ${entry.name}`);
      }

      const result: ScanReportCardResult = await res.json();
      if (!result.success) {
        throw new Error(result.error || `Failed to extract data from ${entry.name}`);
      }

      setFileQueue(prev =>
        prev.map(f =>
          f.id === entry.id
            ? { ...f, status: "EXTRACTED", progressText: "Extracted successfully", result }
            : f
        )
      );

      if (!activeFileId || activeFileId === entry.id) {
        setActiveFileId(entry.id);
        applyScanResultToEditor(result);
      }
    } catch (err: any) {
      console.warn("Scanning notice for file:", entry.name, err);

      // Provide a ready editable template so teacher can immediately edit without blocker
      const fallbackResult: ScanReportCardResult = {
        success: true,
        fileDetails: { name: entry.name, type: entry.ext.toUpperCase(), size: entry.size },
        studentId: classStudents[0]?.id || "",
        studentName: classStudents[0]?.name || "Student",
        rollNumber: classStudents[0]?.rollNumber || "",
        studentConfidence: "NONE",
        examName: examName || "Midterm Examination",
        examDate: examDate || new Date().toISOString().split("T")[0],
        defaultMaxMarks: examMaxMarks || 100,
        defaultPassMarks: examPassMarks || 35,
        generalRemarks: "",
        subjects: classSubjects.map((sub, sIdx) => ({
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
        allDetectedStudents: [
          {
            studentId: classStudents[0]?.id || "",
            studentName: classStudents[0]?.name || "Student",
            rollNumber: classStudents[0]?.rollNumber || "",
            subjects: classSubjects.map((sub, sIdx) => ({
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
            }))
          }
        ],
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
    studentEditsRef.current = {};
    setActiveStudentIndex(0);
    setVerifiedIndices(new Set());

    if (result.examName && !examName) setExamName(result.examName);
    if (result.examDate && !examDate) setExamDate(result.examDate);
    setAcademicYear(result.academicYear || "2026-2027");

    const firstStudent = result.allDetectedStudents?.[0];
    const initialStudentId = firstStudent?.studentId || result.studentId || classStudents[0]?.id || "";
    setSelectedStudentId(initialStudentId);
    setAttendance(firstStudent?.attendance ? String(firstStudent.attendance) : (result.attendance ? String(result.attendance) : ""));
    setGeneralRemarks(firstStudent?.remarks || result.generalRemarks || "");

    const rawSubs = firstStudent?.subjects || result.subjects || [];
    const cleanSubs: ScannedReportCardSubject[] = rawSubs.map(s => {
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

  // Multi-Student Stepper Navigation
  const handleSwitchStudent = (newIndex: number) => {
    if (newIndex === activeStudentIndex) return;

    // 1. Save edits of the current student in local cache
    studentEditsRef.current[activeStudentIndex] = {
      studentId: selectedStudentId,
      subjects: [...subjects],
      attendance,
      generalRemarks
    };

    // 2. Load the target student's cached edits or scan defaults
    const cached = studentEditsRef.current[newIndex];
    const rawSt = detectedStudentsList[newIndex];

    if (cached) {
      setSelectedStudentId(cached.studentId);
      setSubjects(cached.subjects);
      setAttendance(cached.attendance);
      setGeneralRemarks(cached.generalRemarks);
    } else if (rawSt) {
      setSelectedStudentId(rawSt.studentId || classStudents[0]?.id || "");
      setAttendance(rawSt.attendance ? String(rawSt.attendance) : "");
      setGeneralRemarks(rawSt.remarks || "");

      const cleanSubs: ScannedReportCardSubject[] = (rawSt.subjects || []).map(s => {
        let maxScore = s.maxScore || examMaxMarks || 100;
        let passMarks = s.passMarks || examPassMarks || 35;
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
    }

    setActiveStudentIndex(newIndex);
  };

  // Switch Active File in Queue
  const handleSelectQueuedFile = (fileId: string) => {
    setActiveFileId(fileId);
    const item = fileQueue.find(f => f.id === fileId);
    if (item && item.result) {
      applyScanResultToEditor(item.result);
    }
  };

  // Subject Table Handlers
  const handleSubjectScoreChange = (subjectId: string, val: string) => {
    setSubjects(prev =>
      prev.map(sub => {
        if (sub.id !== subjectId) return sub;

        if (val === "") {
          return {
            ...sub,
            score: "",
            status: "NEEDS_REVIEW",
            grade: "-",
            isInvalid: true,
            validationError: "Score required"
          };
        }

        const num = Number(val);
        const isInvalid = isNaN(num) || num < 0 || num > sub.maxScore;
        const grade = !isNaN(num) ? calculateGrade(num, sub.maxScore) : "-";
        const isPass = !isNaN(num) && num >= sub.passMarks;

        return {
          ...sub,
          score: isNaN(num) ? "" : num,
          grade,
          status: isInvalid ? "NEEDS_REVIEW" : isPass ? "PASS" : "FAIL",
          isInvalid,
          validationError: isInvalid ? `Between 0 and ${sub.maxScore}` : undefined
        };
      })
    );
  };

  const handleSubjectMappingChange = (scannedSubId: string, newClassSubjectId: string) => {
    const targetClassSub = classSubjects.find(cs => cs.id === newClassSubjectId);
    if (!targetClassSub) return;

    setSubjects(prev =>
      prev.map(sub => {
        if (sub.id !== scannedSubId) return sub;

        const scoreNum = sub.score !== "" ? Number(sub.score) : NaN;
        const isInvalid = !isNaN(scoreNum) && (scoreNum < 0 || scoreNum > targetClassSub.maxMarks);
        const grade = calculateGrade(Number(sub.score) || 0, targetClassSub.maxMarks);
        const isPass = !isNaN(scoreNum) && scoreNum >= targetClassSub.passMarks;

        return {
          ...sub,
          subjectId: targetClassSub.id,
          subjectName: targetClassSub.name,
          maxScore: targetClassSub.maxMarks,
          passMarks: targetClassSub.passMarks,
          grade,
          status: isInvalid ? "NEEDS_REVIEW" : isPass ? "PASS" : "FAIL",
          isInvalid,
          validationError: isInvalid ? `Score must be between 0 and ${targetClassSub.maxMarks}` : undefined
        };
      })
    );
  };

  const handleSubjectRemarksChange = (subjectId: string, val: string) => {
    setSubjects(prev => prev.map(s => (s.id === subjectId ? { ...s, remarks: val } : s)));
  };

  const handleResetToExtracted = (subjectId: string) => {
    setSubjects(prev =>
      prev.map(sub => {
        if (sub.id !== subjectId) return sub;
        const raw = sub.originalExtractedValue;
        if (!raw) return sub;
        const num = Number(raw);
        if (isNaN(num)) return sub;

        return {
          ...sub,
          score: num,
          status: num >= sub.passMarks ? "PASS" : "FAIL",
          grade: calculateGrade(num, sub.maxScore),
          isInvalid: num < 0 || num > sub.maxScore
        };
      })
    );
  };

  const handleDeleteSubject = (subjectId: string) => {
    setSubjects(prev => prev.filter(s => s.id !== subjectId));
  };

  const handleAddSubject = () => {
    const unmapped = classSubjects.find(cs => !subjects.some(s => s.subjectId === cs.id));
    const newSub: ScannedReportCardSubject = {
      id: `manual-sub-${Date.now()}`,
      subjectId: unmapped?.id || classSubjects[0]?.id || "",
      subjectName: unmapped?.name || classSubjects[0]?.name || "New Subject",
      score: "",
      maxScore: unmapped?.maxMarks || examMaxMarks || 100,
      passMarks: unmapped?.passMarks || examPassMarks || 35,
      remarks: "",
      grade: "-",
      status: "NEEDS_REVIEW",
      isInvalid: true,
      validationError: "Score required"
    };
    setSubjects(prev => [...prev, newSub]);
  };

  const handleRemoveFile = (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFileQueue(prev => prev.filter(f => f.id !== fileId));
    if (activeFileId === fileId) {
      const remaining = fileQueue.filter(f => f.id !== fileId);
      if (remaining.length > 0) {
        setActiveFileId(remaining[0].id);
        if (remaining[0].result) applyScanResultToEditor(remaining[0].result);
      } else {
        setActiveFileId(null);
        setSubjects([]);
      }
    }
  };

  // Submit and connect to database
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
      setGlobalError("Please enter valid marks for all subjects before sending.");
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

        // Mark student as verified
        const updatedVerified = new Set(verifiedIndices).add(activeStudentIndex);
        setVerifiedIndices(updatedVerified);

        // Advance to next unverified student in multi-student document
        if (detectedStudentsList.length > 1) {
          const nextIdx = detectedStudentsList.findIndex((_, idx) => !updatedVerified.has(idx));
          if (nextIdx !== -1) {
            handleSwitchStudent(nextIdx);
          }
        }

        if (isModalView && onCloseModal && (detectedStudentsList.length <= 1 || updatedVerified.size >= detectedStudentsList.length)) {
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
    <div className={styles.studioContainer}>
      {/* Target Class & Header Bar */}
      <div className={styles.headerBar}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0, flex: "1 1 260px" }}>
          <div style={{
            width: "40px",
            height: "40px",
            borderRadius: "12px",
            background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)"
          }}>
            <Sparkles size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "clamp(1rem, 2.8vw, 1.15rem)", fontWeight: 800 }}>
              Report Card Document &amp; OCR Scanner
            </h2>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Upload photos, mark sheets, PDFs, or spreadsheets to extract student grades
            </p>
          </div>
        </div>

        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
          width: "auto"
        }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
            Target Class:
          </label>
          <select
            value={activeClassId}
            onChange={e => handleClassChange(e.target.value)}
            style={{
              padding: "0.55rem 0.85rem",
              borderRadius: "10px",
              border: "1.5px solid var(--border-color, #334155)",
              background: "var(--input-bg, #0f172a)",
              color: "var(--foreground)",
              fontWeight: 700,
              fontSize: "0.88rem",
              cursor: "pointer",
              maxWidth: "100%"
            }}
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} - Section {c.section} ({c.students?.length || 0} Students)
              </option>
            ))}
          </select>

          {isModalView && onCloseModal && (
            <button
              type="button"
              onClick={onCloseModal}
              title="Close Scanner"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
                padding: "0.25rem",
                display: "flex",
                alignItems: "center"
              }}
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Global Exam Criteria Bar */}
      <div className={styles.criteriaCard}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Sliders size={18} color="var(--primary)" />
            <span style={{ fontWeight: 800, fontSize: "0.95rem" }}>
              Exam Details &amp; Base Criteria
            </span>
          </div>
          <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
            Applied automatically when documents are scanned &amp; extracted
          </span>
        </div>

        <div className={styles.criteriaGrid}>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.25rem", color: "var(--text-secondary)" }}>
              Exam / Term:
            </label>
            <input
              type="text"
              value={examName}
              placeholder="e.g. Midterm Examination"
              onChange={e => setExamName(e.target.value)}
              style={{
                width: "100%",
                padding: "0.45rem 0.65rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #334155)",
                background: "var(--input-bg, #0f172a)",
                color: "var(--foreground)",
                fontWeight: 600,
                fontSize: "0.85rem",
                boxSizing: "border-box"
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.25rem", color: "var(--text-secondary)" }}>
              Exam Date:
            </label>
            <input
              type="date"
              value={examDate}
              onChange={e => setExamDate(e.target.value)}
              style={{
                width: "100%",
                padding: "0.45rem 0.65rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #334155)",
                background: "var(--input-bg, #0f172a)",
                color: "var(--foreground)",
                fontWeight: 600,
                fontSize: "0.85rem",
                boxSizing: "border-box"
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.25rem", color: "var(--text-secondary)" }}>
              Max Mark (Base):
            </label>
            <input
              type="number"
              min={1}
              value={examMaxMarks}
              onChange={e => handleApplyCriteriaToAll(Number(e.target.value), examPassMarks)}
              style={{
                width: "100%",
                padding: "0.45rem 0.65rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #334155)",
                background: "var(--input-bg, #0f172a)",
                color: "var(--foreground)",
                fontWeight: 700,
                fontSize: "0.85rem",
                boxSizing: "border-box"
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.25rem", color: "var(--text-secondary)" }}>
              Pass Mark:
            </label>
            <input
              type="number"
              min={0}
              max={examMaxMarks}
              value={examPassMarks}
              onChange={e => handleApplyCriteriaToAll(examMaxMarks, Number(e.target.value))}
              style={{
                width: "100%",
                padding: "0.45rem 0.65rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #334155)",
                background: "var(--input-bg, #0f172a)",
                color: "var(--foreground)",
                fontWeight: 700,
                fontSize: "0.85rem",
                boxSizing: "border-box"
              }}
            />
          </div>
        </div>

        {/* Quick Presets */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.2rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
            Presets:
          </span>
          {[
            { label: "100 / 35 (Standard)", max: 100, pass: 35 },
            { label: "50 / 20 (Midterm)", max: 50, pass: 20 },
            { label: "75 / 30 (Quarterly)", max: 75, pass: 30 },
            { label: "25 / 10 (Unit Test)", max: 25, pass: 10 }
          ].map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => handleApplyCriteriaToAll(p.max, p.pass)}
              style={{
                padding: "0.3rem 0.65rem",
                borderRadius: "8px",
                border: examMaxMarks === p.max && examPassMarks === p.pass ? "1px solid var(--primary)" : "1px solid var(--border-color)",
                background: examMaxMarks === p.max && examPassMarks === p.pass ? "rgba(59, 130, 246, 0.15)" : "transparent",
                color: examMaxMarks === p.max && examPassMarks === p.pass ? "var(--primary)" : "var(--foreground)",
                fontSize: "0.75rem",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          handleAddFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: "2px dashed rgba(59, 130, 246, 0.4)",
          borderRadius: "16px",
          padding: "clamp(1.5rem, 4vw, 2.5rem)",
          textAlign: "center",
          background: "rgba(59, 130, 246, 0.03)",
          cursor: "pointer",
          transition: "all 0.2s ease",
          width: "100%",
          boxSizing: "border-box"
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.bmp,.pdf,.xlsx,.xls,.csv,.docx,.doc"
          multiple
          style={{ display: "none" }}
          onChange={e => handleAddFiles(e.target.files)}
        />
        <div style={{
          width: "52px",
          height: "52px",
          borderRadius: "16px",
          background: "rgba(59, 130, 246, 0.15)",
          color: "var(--primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 1rem"
        }}>
          <Upload size={26} />
        </div>
        <h3 style={{ margin: "0 0 0.4rem 0", fontSize: "1.1rem", fontWeight: 800 }}>
          Drag &amp; drop document, or click to browse
        </h3>
        <p style={{ margin: "0 0 0.85rem 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Supports JPG, PNG, PDF, Excel, and Word files up to 25MB
        </p>
      </div>

      {/* Document Queue Bar */}
      {fileQueue.length > 0 && (
        <div style={{
          background: "var(--card-bg, #1e293b)",
          border: "1.5px solid var(--border-color, #334155)",
          borderRadius: "14px",
          padding: "0.85rem 1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.6rem"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
              Processing Queue ({fileQueue.length} {fileQueue.length === 1 ? "File" : "Files"})
            </span>
            <button
              type="button"
              onClick={() => {
                setFileQueue([]);
                setActiveFileId(null);
                setSubjects([]);
              }}
              style={{ background: "transparent", border: "none", color: "#ef4444", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer" }}
            >
              Clear All
            </button>
          </div>

          <div style={{ display: "flex", gap: "0.6rem", overflowX: "auto", paddingBottom: "0.25rem" }}>
            {fileQueue.map(item => {
              const isActive = item.id === activeFileId;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectQueuedFile(item.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    padding: "0.55rem 0.85rem",
                    borderRadius: "10px",
                    border: isActive ? "1.5px solid var(--primary)" : "1px solid var(--border-color)",
                    background: isActive ? "rgba(59, 130, 246, 0.12)" : "var(--input-bg, #0f172a)",
                    cursor: "pointer",
                    flexShrink: 0
                  }}
                >
                  <FileText size={16} color="var(--primary)" />
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: item.status === "EXTRACTED" ? "#10b981" : item.status === "FAILED" ? "#ef4444" : "var(--text-secondary)" }}>
                      {formatFileSize(item.size)} • {item.progressText || item.status}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={e => handleRemoveFile(item.id, e)}
                    style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "0.2rem" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Global Alerts */}
      {globalError && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.85rem 1.15rem",
          borderRadius: "12px",
          background: "rgba(239, 68, 68, 0.1)",
          border: "1.5px solid rgba(239, 68, 68, 0.3)",
          color: "#ef4444",
          fontSize: "0.88rem"
        }}>
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <span>{globalError}</span>
        </div>
      )}

      {saveSuccess && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.85rem 1.15rem",
          borderRadius: "12px",
          background: "rgba(16, 185, 129, 0.1)",
          border: "1.5px solid rgba(16, 185, 129, 0.3)",
          color: "#10b981",
          fontSize: "0.88rem"
        }}>
          <CheckCircle2 size={20} style={{ flexShrink: 0 }} />
          <span>{saveSuccess}</span>
        </div>
      )}

      {/* Multi-Student Stepper Bar (When marksheet has 2 or more students) */}
      {detectedStudentsList.length > 1 && (
        <div style={{
          background: "var(--card-bg, #1e293b)",
          border: "1.5px solid rgba(59, 130, 246, 0.3)",
          borderRadius: "16px",
          padding: "0.85rem 1.15rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.6rem"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.9rem", fontWeight: 800 }}>
              Multi-Student Gradebook Detected ({detectedStudentsList.length} Students)
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 700 }}>
              {verifiedIndices.size} of {detectedStudentsList.length} Verified &amp; Dispatched
            </span>
          </div>

          <div className={styles.studentStepperContainer}>
            {detectedStudentsList.map((st, sIdx) => {
              const isCurrent = activeStudentIndex === sIdx;
              const isVerified = verifiedIndices.has(sIdx);
              return (
                <button
                  key={sIdx}
                  type="button"
                  onClick={() => handleSwitchStudent(sIdx)}
                  className={`${styles.studentStepTab} ${isCurrent ? styles.studentStepTabActive : ""} ${isVerified ? styles.studentStepTabVerified : ""}`}
                >
                  <span>Student {sIdx + 1}: {st.studentName || `Student ${sIdx + 1}`}</span>
                  {isVerified && <CheckCircle2 size={15} color="#10b981" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Review & Edit Workspace */}
      {activeQueuedFile && (
        <div className={styles.reviewEditorCard}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <ShieldCheck size={20} color="var(--primary)" />
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800 }}>
                Data Review &amp; Error Correction Editor
              </h3>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
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
                    border: "1px solid var(--border-color)",
                    background: "transparent",
                    color: "var(--foreground)",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  {showOriginalDocPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                  <span>{showOriginalDocPreview ? "Hide Original Doc" : "Show Original Doc"}</span>
                </button>
              )}
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Source: <strong>{activeQueuedFile.name}</strong>
              </span>
            </div>
          </div>

          {/* Document Mark Discrepancy Alert */}
          {activeQueuedFile.result?.docTotal !== undefined && totals.isAllEntered && totals.obtained !== activeQueuedFile.result.docTotal && (
            <div className={styles.discrepancyBanner}>
              <AlertCircle size={20} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>Document Mark Discrepancy:</strong> Printed document total is{" "}
                <strong>{activeQueuedFile.result.docTotal}</strong>, but sum of entered marks is{" "}
                <strong>{totals.obtained}</strong>. Please check each subject mark against the original document.
              </div>
            </div>
          )}

          {/* Split View */}
          <div className={showOriginalDocPreview && activeQueuedFile.previewUrl ? styles.splitView : styles.splitViewSingle}>
            {/* Original Document Preview Side */}
            {showOriginalDocPreview && activeQueuedFile.previewUrl && (
              <div style={{
                background: "var(--input-bg, #0f172a)",
                border: "1.5px solid var(--border-color, #334155)",
                borderRadius: "14px",
                padding: "0.85rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.65rem",
                boxSizing: "border-box"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", color: "var(--text-secondary)" }}>
                    Original Document
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsZoomModalOpen(true)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--primary)",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      fontWeight: 700
                    }}
                  >
                    Zoom / Inspect
                  </button>
                </div>

                <div
                  onClick={() => setIsZoomModalOpen(true)}
                  style={{
                    borderRadius: "10px",
                    overflow: "hidden",
                    border: "1px solid var(--border-color)",
                    cursor: "zoom-in",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#000000"
                  }}
                >
                  <img
                    src={activeQueuedFile.previewUrl}
                    alt="Document Scan"
                    style={{
                      width: "100%",
                      height: "auto",
                      maxHeight: "440px",
                      objectFit: "contain",
                      display: "block"
                    }}
                  />
                </div>
              </div>
            )}

            {/* Editable Form Side */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minWidth: 0 }}>
              {/* Student Identification Row */}
              <div className={styles.identGrid}>
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.3rem", color: "var(--text-secondary)" }}>
                    Student Name &amp; ID:
                  </label>
                  <select
                    value={selectedStudentId}
                    onChange={e => setSelectedStudentId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem",
                      borderRadius: "8px",
                      border: "1.5px solid var(--border-color, #334155)",
                      background: "var(--input-bg, #0f172a)",
                      color: "var(--foreground)",
                      fontWeight: 700,
                      fontSize: "0.88rem",
                      boxSizing: "border-box"
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

                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.3rem", color: "var(--text-secondary)" }}>
                    Examination / Term:
                  </label>
                  <input
                    type="text"
                    value={examName}
                    onChange={e => setExamName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      background: "var(--input-bg, #0f172a)",
                      color: "var(--foreground)",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      boxSizing: "border-box"
                    }}
                  />
                </div>

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
                      padding: "0.55rem 0.75rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      background: "var(--input-bg, #0f172a)",
                      color: "var(--foreground)",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              </div>

              {/* Attendance Row */}
              <div style={{ maxWidth: "280px" }}>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.3rem", color: "var(--text-secondary)" }}>
                  Attendance (% or Days):
                </label>
                <input
                  type="text"
                  value={attendance}
                  placeholder="e.g. 96%"
                  onChange={e => setAttendance(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.45rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    background: "var(--input-bg, #0f172a)",
                    color: "var(--foreground)",
                    fontSize: "0.85rem",
                    boxSizing: "border-box"
                  }}
                />
              </div>

              {/* Subject Marks Table Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 800 }}>
                  Extracted Subject Marks &amp; Academic Criteria:
                </span>
                <button
                  type="button"
                  onClick={handleAddSubject}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.35rem 0.75rem",
                    borderRadius: "8px",
                    background: "rgba(59, 130, 246, 0.15)",
                    border: "1px solid rgba(59, 130, 246, 0.35)",
                    color: "var(--primary)",
                    fontWeight: 700,
                    fontSize: "0.8rem",
                    cursor: "pointer"
                  }}
                >
                  <Plus size={14} /> Add Subject
                </button>
              </div>

              {/* Desktop Table View */}
              <div className={styles.desktopTableView}>
                <table style={{ width: "100%", minWidth: "720px", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                      <th style={{ padding: "0.65rem 0.85rem" }}>Subject</th>
                      <th style={{ padding: "0.65rem 0.85rem", textAlign: "center", width: "100px" }}>Marks Scored</th>
                      <th style={{ padding: "0.65rem 0.85rem", textAlign: "center", width: "85px" }}>Max Mark</th>
                      <th style={{ padding: "0.65rem 0.85rem", textAlign: "center", width: "85px" }}>Pass Mark</th>
                      <th style={{ padding: "0.65rem 0.85rem", textAlign: "center", width: "70px" }}>Grade</th>
                      <th style={{ padding: "0.65rem 0.85rem", textAlign: "center", width: "110px" }}>Status</th>
                      <th style={{ padding: "0.65rem 0.85rem" }}>Remarks</th>
                      <th style={{ padding: "0.65rem 0.85rem", textAlign: "center", width: "45px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map(sub => {
                      const scoreNum = sub.score !== "" ? Number(sub.score) : NaN;
                      const isFail = !isNaN(scoreNum) && scoreNum < sub.passMarks;

                      return (
                        <tr key={sub.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                          <td style={{ padding: "0.6rem 0.85rem" }}>
                            <select
                              value={sub.subjectId}
                              onChange={e => handleSubjectMappingChange(sub.id, e.target.value)}
                              style={{
                                width: "100%",
                                padding: "0.35rem 0.5rem",
                                borderRadius: "6px",
                                border: "1px solid var(--border-color)",
                                background: "var(--card-bg, #1e293b)",
                                color: "var(--foreground)",
                                fontWeight: 700,
                                fontSize: "0.85rem"
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
                          </td>

                          <td style={{ padding: "0.6rem 0.85rem", textAlign: "center" }}>
                            <input
                              type="number"
                              min={0}
                              max={sub.maxScore}
                              value={sub.score}
                              placeholder="0"
                              onChange={e => handleSubjectScoreChange(sub.id, e.target.value)}
                              style={{
                                width: "70px",
                                padding: "0.35rem 0.45rem",
                                borderRadius: "6px",
                                border: sub.isInvalid ? "1.5px solid #ef4444" : "1px solid var(--border-color)",
                                background: sub.isInvalid ? "rgba(239, 68, 68, 0.12)" : "var(--card-bg, #1e293b)",
                                color: "var(--foreground)",
                                fontWeight: 800,
                                fontSize: "0.95rem",
                                textAlign: "center"
                              }}
                            />
                          </td>

                          <td style={{ padding: "0.6rem 0.85rem", textAlign: "center", color: "var(--text-secondary)" }}>
                            {sub.maxScore}
                          </td>

                          <td style={{ padding: "0.6rem 0.85rem", textAlign: "center", color: "var(--text-secondary)" }}>
                            {sub.passMarks}
                          </td>

                          <td style={{ padding: "0.6rem 0.85rem", textAlign: "center", fontWeight: 800, color: sub.grade === "F" ? "#ef4444" : "#10b981" }}>
                            {sub.grade || "-"}
                          </td>

                          <td style={{ padding: "0.6rem 0.85rem", textAlign: "center" }}>
                            <span
                              className={styles.statusBadgeNoWrap}
                              style={{
                                padding: "3px 8px",
                                borderRadius: "6px",
                                fontWeight: 800,
                                fontSize: "0.75rem",
                                background: sub.status === "PASS" ? "rgba(16, 185, 129, 0.15)" : sub.status === "FAIL" ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)",
                                color: sub.status === "PASS" ? "#10b981" : sub.status === "FAIL" ? "#ef4444" : "#f59e0b"
                              }}
                            >
                              {sub.status || "REVIEW"}
                            </span>
                          </td>

                          <td style={{ padding: "0.6rem 0.85rem" }}>
                            <input
                              type="text"
                              value={sub.remarks || ""}
                              placeholder={isFail ? "Needs revision" : "Teacher remarks"}
                              onChange={e => handleSubjectRemarksChange(sub.id, e.target.value)}
                              style={{
                                width: "100%",
                                padding: "0.35rem 0.5rem",
                                borderRadius: "6px",
                                border: "1px solid var(--border-color)",
                                fontSize: "0.82rem",
                                background: "var(--card-bg, #1e293b)",
                                color: "var(--foreground)",
                                boxSizing: "border-box"
                              }}
                            />
                          </td>

                          <td style={{ padding: "0.6rem 0.85rem", textAlign: "center" }}>
                            <button
                              type="button"
                              onClick={() => handleDeleteSubject(sub.id)}
                              title="Delete Subject"
                              style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", padding: "0.2rem" }}
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

              {/* Mobile Cards View */}
              <div className={styles.mobileCardsView}>
                {subjects.map(sub => {
                  const scoreNum = sub.score !== "" ? Number(sub.score) : NaN;
                  const isFail = !isNaN(scoreNum) && scoreNum < sub.passMarks;

                  return (
                    <div
                      key={sub.id}
                      className={`${styles.subjectCard} ${sub.isInvalid ? styles.subjectCardInvalid : ""}`}
                    >
                      <div className={styles.cardHeaderRow}>
                        <select
                          value={sub.subjectId}
                          onChange={e => handleSubjectMappingChange(sub.id, e.target.value)}
                          className={styles.subjectSelectMobile}
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

                        <button
                          type="button"
                          onClick={() => handleDeleteSubject(sub.id)}
                          title="Delete subject"
                          style={{
                            background: "rgba(239, 68, 68, 0.15)",
                            border: "none",
                            color: "#ef4444",
                            borderRadius: "6px",
                            padding: "0.35rem 0.5rem",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center"
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className={styles.cardMarksRow}>
                        <div className={styles.markInputContainer}>
                          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                            Marks:
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={sub.maxScore}
                            value={sub.score}
                            placeholder="0"
                            onChange={e => handleSubjectScoreChange(sub.id, e.target.value)}
                            className={`${styles.mobileMarksInput} ${sub.isInvalid ? styles.mobileMarksInputInvalid : ""}`}
                          />
                          <span className={styles.maxPassInfo}>
                            / {sub.maxScore} (Pass: {sub.passMarks})
                          </span>
                        </div>

                        <div className={styles.badgeGroup}>
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
                          <span
                            className={styles.statusBadgeNoWrap}
                            style={{
                              padding: "3px 9px",
                              borderRadius: "6px",
                              fontWeight: 800,
                              fontSize: "0.78rem",
                              background: sub.status === "PASS" ? "rgba(16, 185, 129, 0.15)" : sub.status === "FAIL" ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)",
                              color: sub.status === "PASS" ? "#10b981" : sub.status === "FAIL" ? "#ef4444" : "#f59e0b"
                            }}
                          >
                            {sub.status || "REVIEW"}
                          </span>
                        </div>
                      </div>

                      {sub.isInvalid && (
                        <span style={{ fontSize: "0.75rem", color: "#ef4444", fontWeight: 700 }}>
                          {sub.validationError || "Invalid score"}
                        </span>
                      )}

                      <input
                        type="text"
                        value={sub.remarks || ""}
                        placeholder={isFail ? "Needs revision" : "Teacher remarks"}
                        onChange={e => handleSubjectRemarksChange(sub.id, e.target.value)}
                        style={{
                          width: "100%",
                          padding: "0.45rem 0.65rem",
                          borderRadius: "6px",
                          border: "1px solid var(--border-color)",
                          fontSize: "0.82rem",
                          background: "var(--card-bg, #1e293b)",
                          color: "var(--foreground)",
                          boxSizing: "border-box"
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Live Totals & Feedback Bar */}
              <div className={styles.totalsGrid}>
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
                  <div style={{
                    fontSize: "0.85rem",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    color: totals.resultStatus === "PENDING" ? "#f59e0b" : totals.resultStatus === "PASSED" ? "#10b981" : "#ef4444"
                  }}>
                    {totals.resultStatus}
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
                  placeholder="Enter positive remarks, recommendations, or academic encouragement for parents..."
                  onChange={e => setGeneralRemarks(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.85rem",
                    borderRadius: "10px",
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
                  className={styles.sendBtn}
                  title={
                    !selectedStudentId
                      ? "Select an enrolled student before sending"
                      : totals.hasValidationErrors
                      ? "Fill in all subject marks before sending"
                      : "Send Report Card to Parent"
                  }
                >
                  <Send size={18} />
                  <span>{isSaving ? "Sending to Parent..." : "Send Report Card to Parent"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pan / Zoom Inspection Modal */}
      {isZoomModalOpen && activeQueuedFile?.previewUrl && (
        <div className={styles.zoomModalOverlay} onClick={() => setIsZoomModalOpen(false)}>
          <div className={styles.zoomModalHeader} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 800 }}>Document Inspection View</h4>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{activeQueuedFile.name}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setZoomLevel(prev => Math.min(3, prev + 0.25))}
                style={{ padding: "0.4rem 0.8rem", borderRadius: "8px", background: "var(--card-bg, #1e293b)", color: "var(--foreground)", border: "1px solid var(--border-color, #334155)", cursor: "pointer", fontWeight: 700 }}
              >
                + Zoom In
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.25))}
                style={{ padding: "0.4rem 0.8rem", borderRadius: "8px", background: "var(--card-bg, #1e293b)", color: "var(--foreground)", border: "1px solid var(--border-color, #334155)", cursor: "pointer", fontWeight: 700 }}
              >
                - Zoom Out
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(1)}
                style={{ padding: "0.4rem 0.8rem", borderRadius: "8px", background: "var(--card-bg, #1e293b)", color: "var(--foreground)", border: "1px solid var(--border-color, #334155)", cursor: "pointer", fontWeight: 700 }}
              >
                Reset (100%)
              </button>
              <button
                type="button"
                onClick={() => setIsZoomModalOpen(false)}
                style={{ padding: "0.4rem 0.8rem", borderRadius: "8px", background: "#ef4444", color: "#fff", border: "none", cursor: "pointer", fontWeight: 700 }}
              >
                Close
              </button>
            </div>
          </div>
          <div className={styles.zoomModalContent} onClick={e => e.stopPropagation()}>
            <img
              src={activeQueuedFile.previewUrl}
              alt="Document Full View"
              style={{
                transform: `scale(${zoomLevel})`,
                transition: "transform 0.15s ease",
                maxWidth: "95%",
                maxHeight: "90vh",
                objectFit: "contain",
                boxShadow: "0 10px 40px rgba(0,0,0,0.6)"
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
