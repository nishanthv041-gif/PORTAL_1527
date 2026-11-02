"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import {
  Upload, FileText, FileSpreadsheet,
  CheckCircle2, AlertCircle, RefreshCw, Trash2, Plus,
  Award, Calendar, Users, Eye, EyeOff, RotateCcw,
  Check, X, ArrowRight, Layers, Send, Sliders, Edit3, Download, HelpCircle
} from "lucide-react";
import type { TeacherClass, ClassSubject, ClassStudent, HistoryItem } from "./TeacherReportCardsClient";
import type { ScanReportCardResult, ScannedReportCardSubject, DetectedStudentEntry } from "@/backend/api/actions/dashboard/teacher/report-cards/scanReportCardTypes";
import { createAndSendReportCardAction } from "@/backend/lib/services/reportCardActions";
import { bulkSaveReportCardsAction } from "@/backend/api/actions/dashboard/teacher/report-cards/reportCardUploadAction";
import {
  extractMarksDocument,
  ExtractionResult,
  ExtractedStudentRow,
  calculateStudentTotals
} from "@/frontend/lib/marks-extractor";
import { generateClassReportCardExcelTemplate } from "@/frontend/lib/exams/excelMarksUtil";
import { calculateReportCardGrade } from "@/frontend/lib/constants";
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
  progressPercent?: number;
  error?: string;
  result?: ScanReportCardResult;
  debugInfo?: any;
}

interface ReportCardDocumentStudioProps {
  classes: TeacherClass[];
  selectedClassId: string;
  onClassChange?: (classId: string) => void;
  onReportCardCreated: (newCard: HistoryItem, recipients: string[]) => void;
  onCloseModal?: () => void;
  isModalView?: boolean;
}

const SUPPORTED_EXTS = ["xlsx", "xls", "csv", "pdf", "jpg", "jpeg", "png", "webp", "bmp"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
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

  // File Queue State (Scanned in browser memory only, never uploaded to server storage)
  const [fileQueue, setFileQueue] = useState<QueuedFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  // Active Document Extraction State
  // NEVER default exam name or date if not detected in document
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [examName, setExamName] = useState<string>("");
  const [examDate, setExamDate] = useState<string>("");
  const [examMaxMarks, setExamMaxMarks] = useState<number>(100);
  const [examPassMarks, setExamPassMarks] = useState<number>(35);
  const [attendance, setAttendance] = useState<string>("");
  const [academicYear, setAcademicYear] = useState<string>("2026-2027");
  const [subjects, setSubjects] = useState<ScannedReportCardSubject[]>([]);
  const [generalRemarks, setGeneralRemarks] = useState<string>("");

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

  // Debug Panel toggle (dev only)
  const [showDevDebug, setShowDevDebug] = useState<boolean>(false);

  // Cleanup object URLs on unmount to free browser memory
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

  // Active student entry list from multi-student detection
  const detectedStudentsList: DetectedStudentEntry[] = useMemo(() => {
    return activeQueuedFile?.result?.allDetectedStudents || [];
  }, [activeQueuedFile]);

  // Detect duplicate subjects in the active student's table
  const duplicateSubjectIds = useMemo(() => {
    const counts = new Map<string, number>();
    subjects.forEach(sub => {
      if (sub.subjectId) {
        counts.set(sub.subjectId, (counts.get(sub.subjectId) || 0) + 1);
      }
    });
    const dupes = new Set<string>();
    counts.forEach((count, id) => {
      if (count > 1) dupes.add(id);
    });
    return dupes;
  }, [subjects]);

  // Live Summary Calculations
  const totals = useMemo(() => {
    let obtained = 0;
    let maximum = 0;
    let hasFail = false;
    let hasAnyMarks = false;
    let missingCount = 0;

    subjects.forEach(sub => {
      maximum += sub.maxScore;
      if (sub.score !== "" && sub.score !== null) {
        hasAnyMarks = true;
        if (sub.score === "AB") {
          hasFail = true;
        } else {
          const num = Number(sub.score);
          obtained += num;
          if (num < sub.passMarks) {
            hasFail = true;
          }
        }
      } else {
        missingCount++;
      }
    });

    const isAllEntered = subjects.length > 0 && missingCount === 0;
    const percentage = maximum > 0 && hasAnyMarks ? parseFloat(((obtained / maximum) * 100).toFixed(1)) : 0;
    const grade = isAllEntered ? calculateReportCardGrade(percentage, hasFail) : "-";

    const hasValidationErrors = subjects.some(s => s.isInvalid || s.score === "" || s.score === null) || duplicateSubjectIds.size > 0;

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
      missingCount,
      hasValidationErrors,
      resultStatus
    };
  }, [subjects, duplicateSubjectIds]);

  // Handle Criteria Changes for All Subjects
  const handleApplyCriteriaToAll = (newMax?: number, newPass?: number) => {
    const targetMax = newMax !== undefined ? Math.max(1, newMax) : examMaxMarks;
    const targetPass = newPass !== undefined ? Math.max(0, Math.min(targetMax, newPass)) : examPassMarks;

    setExamMaxMarks(targetMax);
    setExamPassMarks(targetPass);

    setSubjects(prev =>
      prev.map(sub => {
        const scoreNum = sub.score !== "" && sub.score !== null && sub.score !== "AB" ? Number(sub.score) : NaN;
        const isInvalid = !isNaN(scoreNum) && (scoreNum < 0 || scoreNum > targetMax);
        const grade = !isNaN(scoreNum) ? calculateReportCardGrade((scoreNum / targetMax) * 100) : (sub.score === "AB" ? "F" : "-");
        const isPass = !isNaN(scoreNum) && scoreNum >= targetPass;

        return {
          ...sub,
          maxScore: targetMax,
          passMarks: targetPass,
          grade,
          status: sub.score === "AB" ? "ABSENT" : isInvalid ? "NEEDS_REVIEW" : isPass ? "PASS" : "FAIL",
          isInvalid,
          validationError: isInvalid ? `Score must be between 0 and ${targetMax}` : undefined
        };
      })
    );
  };

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

  // Add Files to Queue for In-Browser Scanning
  const handleAddFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setGlobalError(null);
    setSaveSuccess(null);

    const newEntries: QueuedFile[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const ext = file.name.split(".").pop()?.toLowerCase() || "";

      if (!SUPPORTED_EXTS.includes(ext)) {
        setGlobalError(`File "${file.name}" has an unsupported format (.${ext}). Supported: ${SUPPORTED_EXTS.join(", ")}`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setGlobalError(`File "${file.name}" (${formatFileSize(file.size)}) exceeds the maximum allowed size of 10MB.`);
        continue;
      }

      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;

      const entry: QueuedFile = {
        id: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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

  // Process a Queued Item via Browser-Based Layered Extractor (No server upload)
  const processQueueItem = async (entry: QueuedFile) => {
    if (!activeClassId) {
      setGlobalError("Please select a target class before scanning documents.");
      return;
    }

    setFileQueue(prev =>
      prev.map(f => (f.id === entry.id ? { ...f, status: "PROCESSING", progressText: `Reading ${entry.ext.toUpperCase()} document...`, progressPercent: 10 } : f))
    );

    try {
      const extraction: ExtractionResult = await extractMarksDocument(
        entry.file,
        classStudents,
        classSubjects,
        examMaxMarks,
        examPassMarks,
        (percent, message) => {
          setFileQueue(prev =>
            prev.map(f => (f.id === entry.id ? { ...f, progressText: message, progressPercent: percent } : f))
          );
        }
      );

      if (!extraction.success || extraction.students.length === 0) {
        throw new Error(extraction.error || `Could not find any readable marks or student rows in ${entry.name}. Try the Excel template or a clearer image.`);
      }

      // Convert extraction to ScanReportCardResult format
      const detectedStudents: DetectedStudentEntry[] = extraction.students.map((st: ExtractedStudentRow, idx: number) => ({
        studentId: st.matchedStudentId || (classStudents[idx]?.id || ""),
        studentName: st.matchedStudentName || st.rawName || `Student ${idx + 1}`,
        rollNumber: st.matchedRollNumber || st.rawRollNumber || "",
        extractedName: st.rawName,
        className: currentClass ? `${currentClass.name} - ${currentClass.section}` : null,
        attendance: st.attendance || null,
        subjects: st.subjects.map((sub, sIdx) => {
          const scoreVal: number | "" | "AB" = sub.score === "AB" ? "AB" : (typeof sub.score === "number" ? sub.score : "");
          const isNum = typeof sub.score === "number";
          const isInvalid = scoreVal === "" || (isNum && (sub.score as number < 0 || sub.score as number > sub.maxScore));

          return {
            id: `sub-st-${idx}-${sIdx}`,
            subjectId: sub.matchedSubjectId || classSubjects[sIdx]?.id || "",
            subjectName: sub.subjectName,
            score: scoreVal,
            maxScore: sub.maxScore,
            passMarks: sub.passMarks,
            grade: sub.grade,
            status: sub.status,
            remarks: sub.remarks || "",
            confidence: sub.confidence,
            originalExtractedValue: sub.rawText,
            isInvalid
          };
        }),
        totalMarks: st.totalMarks,
        percentage: st.percentage,
        grade: st.grade,
        remarks: st.generalRemarks,
        confidence: st.confidence,
        printedTotal: st.printedTotal,
        totalMismatchWarning: st.totalMismatchWarning
      }));

      const firstStudent = detectedStudents[0];

      const result: ScanReportCardResult = {
        success: true,
        fileDetails: extraction.fileDetails,
        studentId: firstStudent.studentId,
        studentName: firstStudent.studentName,
        rollNumber: firstStudent.rollNumber,
        extractedName: firstStudent.extractedName,
        studentConfidence: firstStudent.confidence === "HIGH" ? "HIGH" : firstStudent.confidence === "MEDIUM" ? "MEDIUM" : "LOW",
        examName: extraction.examName || "", // Leave EMPTY if not in document
        examDate: extraction.examDate || "", // Leave EMPTY if not in document
        defaultMaxMarks: examMaxMarks,
        defaultPassMarks: examPassMarks,
        generalRemarks: firstStudent.remarks || "",
        subjects: firstStudent.subjects,
        allDetectedStudents: detectedStudents,
        detectedStudents,
        rawTextPreview: extraction.rawTextPreview,
        docTotal: firstStudent.printedTotal
      };

      setFileQueue(prev =>
        prev.map(f =>
          f.id === entry.id
            ? {
                ...f,
                status: "EXTRACTED",
                progressText: `Extracted ${detectedStudents.length} student(s) successfully`,
                progressPercent: 100,
                result,
                debugInfo: extraction.debugInfo
              }
            : f
        )
      );

      if (!activeFileId || activeFileId === entry.id) {
        setActiveFileId(entry.id);
        applyScanResultToEditor(result);
      }

    } catch (err: any) {
      console.error("Scan error for file:", entry.name, err);
      const errMsg = err?.message || `Could not read the marks from ${entry.name}. Try the Excel template or a clearer photo.`;
      setGlobalError(errMsg);

      setFileQueue(prev =>
        prev.map(f =>
          f.id === entry.id
            ? { ...f, status: "FAILED", progressText: "Scan failed", error: errMsg }
            : f
        )
      );
    }
  };

  // Populate Editor State from Result
  const applyScanResultToEditor = (result: ScanReportCardResult) => {
    studentEditsRef.current = {};
    setActiveStudentIndex(0);
    setVerifiedIndices(new Set());

    // Only set exam name and date if found in the document; otherwise leave empty and required
    if (result.examName) setExamName(result.examName);
    if (result.examDate) setExamDate(result.examDate);
    setAcademicYear(result.academicYear || "2026-2027");

    const firstStudent = result.allDetectedStudents?.[0];
    const initialStudentId = firstStudent?.studentId || result.studentId || classStudents[0]?.id || "";
    setSelectedStudentId(initialStudentId);
    setAttendance(firstStudent?.attendance ? String(firstStudent.attendance) : (result.attendance ? String(result.attendance) : ""));
    setGeneralRemarks(firstStudent?.remarks || result.generalRemarks || "");

    const rawSubs = firstStudent?.subjects || result.subjects || [];
    const cleanSubs: ScannedReportCardSubject[] = rawSubs.map(s => {
      const maxScore = s.maxScore || examMaxMarks || 100;
      const passMarks = s.passMarks || examPassMarks || 35;
      const isAbsent = s.score === "AB";
      const scoreNum: number | "" | "AB" = isAbsent ? "AB" : (s.score !== "" && s.score !== undefined && !isNaN(Number(s.score)) ? Number(s.score) : "");
      const isInvalid = scoreNum === "" || (typeof scoreNum === "number" && (scoreNum < 0 || scoreNum > maxScore));
      const grade = typeof scoreNum === "number" ? calculateReportCardGrade((scoreNum / maxScore) * 100) : (isAbsent ? "F" : "-");
      const status: "PASS" | "FAIL" | "ABSENT" | "NEEDS_REVIEW" = isAbsent
        ? "ABSENT"
        : scoreNum === ""
          ? "NEEDS_REVIEW"
          : (scoreNum as number) >= passMarks
            ? "PASS"
            : "FAIL";

      return {
        ...s,
        score: scoreNum,
        maxScore,
        passMarks,
        grade,
        status,
        isInvalid,
        validationError: isInvalid ? (scoreNum === "" ? "Mark is missing. Enter a score or mark as Absent." : `Between 0 and ${maxScore}`) : ""
      };
    });

    setSubjects(cleanSubs);
    setSaveSuccess(null);
  };

  // Multi-Student Stepper Navigation
  const handleSwitchStudent = (newIndex: number) => {
    if (newIndex === activeStudentIndex) return;

    // 1. Cache current student's edits
    studentEditsRef.current[activeStudentIndex] = {
      studentId: selectedStudentId,
      subjects: [...subjects],
      attendance,
      generalRemarks
    };

    // 2. Load target student's cached edits or scan defaults
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
        const maxScore = s.maxScore || examMaxMarks || 100;
        const passMarks = s.passMarks || examPassMarks || 35;
        const isAbsent = s.score === "AB";
        const scoreNum: number | "" | "AB" = isAbsent ? "AB" : (s.score !== "" && s.score !== undefined && !isNaN(Number(s.score)) ? Number(s.score) : "");
        const isInvalid = scoreNum === "" || (typeof scoreNum === "number" && (scoreNum < 0 || scoreNum > maxScore));
        const grade = typeof scoreNum === "number" ? calculateReportCardGrade((scoreNum / maxScore) * 100) : (isAbsent ? "F" : "-");
        const status: "PASS" | "FAIL" | "ABSENT" | "NEEDS_REVIEW" = isAbsent
          ? "ABSENT"
          : scoreNum === ""
            ? "NEEDS_REVIEW"
            : (scoreNum as number) >= passMarks
              ? "PASS"
              : "FAIL";

        return {
          ...s,
          score: scoreNum,
          maxScore,
          passMarks,
          grade,
          status,
          isInvalid,
          validationError: isInvalid ? (scoreNum === "" ? "Mark is missing. Enter a score or mark as Absent." : `Between 0 and ${maxScore}`) : ""
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

  // Remove File from State (Clears in-memory scan, never stored)
  const handleRemoveFile = (fileId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFileQueue(prev => {
      const filtered = prev.filter(f => f.id !== fileId);
      if (activeFileId === fileId) {
        const next = filtered[0];
        setActiveFileId(next?.id || null);
        if (next?.result) {
          applyScanResultToEditor(next.result);
        } else {
          setSubjects([]);
          setSelectedStudentId("");
          setExamName("");
          setExamDate("");
          setAttendance("");
        }
      }
      return filtered;
    });
  };

  // Clear Entire State
  const handleClearAll = () => {
    setFileQueue([]);
    setActiveFileId(null);
    setSubjects([]);
    setSelectedStudentId("");
    setExamName("");
    setExamDate("");
    setAttendance("");
    setGeneralRemarks("");
    setSaveSuccess(null);
    setGlobalError(null);
    studentEditsRef.current = {};
    setVerifiedIndices(new Set());
  };

  // Subject Table Handlers
  const handleSubjectScoreChange = (subjectId: string, val: string) => {
    setSubjects(prev =>
      prev.map(sub => {
        if (sub.id !== subjectId) return sub;

        const trimmed = val.trim();
        if (trimmed === "") {
          return {
            ...sub,
            score: "",
            status: "NEEDS_REVIEW",
            grade: "-",
            isInvalid: true,
            validationError: "Mark is missing. Enter a score or mark as Absent."
          };
        }

        if (["ab", "abs", "absent", "a"].includes(trimmed.toLowerCase())) {
          return {
            ...sub,
            score: "AB",
            status: "ABSENT",
            grade: "F",
            isInvalid: false,
            validationError: undefined
          };
        }

        const num = Number(trimmed);
        const isInvalid = isNaN(num) || num < 0 || num > sub.maxScore;
        const grade = !isNaN(num) ? calculateReportCardGrade((num / sub.maxScore) * 100) : "-";
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

  const handleSubjectMappingChange = (subjectEntryId: string, targetClassSubjectId: string) => {
    const matchedClassSub = classSubjects.find(cs => cs.id === targetClassSubjectId);
    setSubjects(prev =>
      prev.map(sub => {
        if (sub.id !== subjectEntryId) return sub;
        return {
          ...sub,
          subjectId: targetClassSubjectId,
          subjectName: matchedClassSub?.name || sub.subjectName,
          maxScore: matchedClassSub?.maxMarks || sub.maxScore,
          passMarks: matchedClassSub?.passMarks || sub.passMarks
        };
      })
    );
  };

  const handleSubjectRemarksChange = (subjectEntryId: string, val: string) => {
    setSubjects(prev =>
      prev.map(sub => (sub.id === subjectEntryId ? { ...sub, remarks: val } : sub))
    );
  };

  const handleDeleteSubject = (subjectEntryId: string) => {
    setSubjects(prev => prev.filter(s => s.id !== subjectEntryId));
  };

  const handleAddSubject = () => {
    const defaultSub = classSubjects.find(cs => !subjects.some(s => s.subjectId === cs.id)) || classSubjects[0];
    const newSubject: ScannedReportCardSubject = {
      id: `manual-sub-${Date.now()}`,
      subjectId: defaultSub?.id || "",
      subjectName: defaultSub?.name || "New Subject",
      score: "",
      maxScore: defaultSub?.maxMarks || examMaxMarks || 100,
      passMarks: defaultSub?.passMarks || examPassMarks || 35,
      grade: "-",
      status: "NEEDS_REVIEW",
      remarks: "",
      isInvalid: true,
      validationError: "Mark is missing. Enter a score or mark as Absent."
    };
    setSubjects(prev => [...prev, newSubject]);
  };

  // Download Pre-Filled Excel Template
  const handleDownloadExcelTemplate = () => {
    try {
      if (!currentClass) {
        setGlobalError("Please select a target class first.");
        return;
      }

      const excelBytes = generateClassReportCardExcelTemplate({
        className: currentClass.name,
        section: currentClass.section,
        examName: examName || "Class Examination",
        subjects: classSubjects,
        students: classStudents
      });

      const blob = new Blob([excelBytes as any], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeClassName = `${currentClass.name}_${currentClass.section}`.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
      a.href = url;
      a.download = `report_card_template_${safeClassName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Template error:", err);
      setGlobalError("Failed to generate Excel template: " + (err?.message || "Unknown error"));
    }
  };

  // Verify & Dispatch: Saves reviewed final values directly to database (No file storage)
  const handleVerifyAndDispatchStudent = async () => {
    setGlobalError(null);
    setSaveSuccess(null);

    if (!activeClassId) {
      setGlobalError("Please select a valid class.");
      return;
    }
    if (!selectedStudentId) {
      setGlobalError("Please select the enrolled student this report card belongs to.");
      return;
    }
    if (!examName.trim()) {
      setGlobalError("Examination / Term name is required before dispatching.");
      return;
    }
    if (!examDate) {
      setGlobalError("Examination Date is required before dispatching.");
      return;
    }
    if (subjects.length === 0) {
      setGlobalError("Please enter at least one subject mark before dispatching.");
      return;
    }

    if (duplicateSubjectIds.size > 0) {
      setGlobalError("Duplicate subjects found. Please ensure each subject is included only once.");
      return;
    }

    const hasMissingOrInvalid = subjects.some(s => s.isInvalid || s.score === "" || s.score === null);
    if (hasMissingOrInvalid) {
      setGlobalError("All subject marks must be entered (or marked Absent) before dispatching.");
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
          score: s.score === "AB" ? 0 : Number(s.score),
          maxScore: s.maxScore,
          passMarks: s.passMarks,
          remarks: s.score === "AB" ? "Absent" : (s.remarks || undefined)
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
            score: s.score === "AB" ? 0 : (Number(s.score) || 0),
            maxScore: s.maxScore,
            passMarks: s.passMarks,
            remarks: s.score === "AB" ? "Absent" : (s.remarks || null)
          }))
        };

        const successMsg = `Report card verified and dispatched for ${studentObj?.name || "Student"}! Parent notified.`;
        setSaveSuccess(successMsg);
        onReportCardCreated(newHistoryItem, res.recipients || []);

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
      setGlobalError(saveErr?.message || "Failed to verify and dispatch report card.");
    } finally {
      setIsSaving(false);
    }
  };

  // Bulk Verify & Dispatch All Ready Students
  const handleVerifyAllReadyStudents = async () => {
    if (!activeClassId) {
      setGlobalError("Please select a target class before dispatching.");
      return;
    }
    if (detectedStudentsList.length === 0) {
      setGlobalError("No students available to dispatch.");
      return;
    }
    if (!examName.trim()) {
      setGlobalError("Examination / Term name is required before dispatching.");
      return;
    }
    if (!examDate) {
      setGlobalError("Examination Date is required before dispatching.");
      return;
    }

    setIsSaving(true);
    setGlobalError(null);
    setSaveSuccess(null);

    // Cache current active student edits
    studentEditsRef.current[activeStudentIndex] = {
      studentId: selectedStudentId,
      subjects: [...subjects],
      attendance,
      generalRemarks
    };

    const readyStudents = detectedStudentsList
      .map((entry, idx) => {
        const edits = studentEditsRef.current[idx];
        const targetStudentId = edits?.studentId || entry.studentId;
        const targetSubjects = edits?.subjects || entry.subjects || [];
        const targetRemarks = edits?.generalRemarks || entry.remarks || generalRemarks;

        const hasInvalid = targetSubjects.some(s => s.isInvalid || s.score === "" || s.score === null);
        if (hasInvalid || !targetStudentId) return null;

        const marks = targetSubjects.map(s => {
          let finalSubjectId = s.subjectId;
          if (!finalSubjectId) {
            const match = classSubjects.find(cs => cs.name.toLowerCase() === s.subjectName.toLowerCase());
            finalSubjectId = match?.id || classSubjects[0]?.id || "";
          }
          return {
            subjectId: finalSubjectId,
            score: s.score === "AB" ? 0 : Number(s.score) || 0,
            maxScore: s.maxScore || 100,
            passMarks: s.passMarks || 35,
            remarks: s.score === "AB" ? "Absent" : (s.remarks || undefined)
          };
        });

        return {
          studentId: targetStudentId,
          marks,
          remarks: targetRemarks
        };
      })
      .filter(Boolean) as Array<{ studentId: string; marks: any[]; remarks?: string }>;

    if (readyStudents.length === 0) {
      setIsSaving(false);
      setGlobalError("No students have complete, error-free marks ready for dispatch. Please review missing entries.");
      return;
    }

    try {
      const res = await bulkSaveReportCardsAction({
        classId: activeClassId,
        examName: examName.trim(),
        examDate,
        students: readyStudents
      });

      if (res.success) {
        const allIndices = new Set(detectedStudentsList.map((_, i) => i));
        setVerifiedIndices(allIndices);
        setSaveSuccess(`Successfully verified and dispatched ${res.savedCount} student report card(s)! All linked parents notified.`);
        if (res.errors && res.errors.length > 0) {
          setGlobalError(`Some students could not be dispatched: ${res.errors.join("; ")}`);
        }
      } else {
        setGlobalError(res.error || "Failed to bulk dispatch report cards.");
      }
    } catch (err: any) {
      setGlobalError(err?.message || "Server error while bulk dispatching report cards.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.studioContainer}>
      {/* Studio Header Bar */}
      <div className={styles.headerBar}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <FileSpreadsheet size={20} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800 }}>
              Teacher Report Cards Studio
            </h2>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Scan mark sheets (Excel, CSV, PDF, or Photo) in browser to auto-fill details, review, and dispatch to parents.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {/* Class Selector Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)" }}>Target Class:</span>
            <select
              value={activeClassId}
              onChange={e => handleClassChange(e.target.value)}
              style={{
                padding: "0.5rem 0.85rem",
                borderRadius: "10px",
                border: "1.5px solid var(--border-color, #334155)",
                background: "var(--card-bg, #1e293b)",
                color: "var(--foreground)",
                fontWeight: 700,
                fontSize: "0.88rem",
                cursor: "pointer"
              }}
            >
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} - Section {c.section} ({c.students?.length || 0} Students)
                </option>
              ))}
            </select>
          </div>

          {/* Download Excel Template Button */}
          <button
            type="button"
            onClick={handleDownloadExcelTemplate}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.5rem 0.9rem",
              borderRadius: "10px",
              border: "1.5px solid rgba(16, 185, 129, 0.4)",
              background: "rgba(16, 185, 129, 0.12)",
              color: "#34d399",
              fontWeight: 700,
              fontSize: "0.82rem",
              cursor: "pointer"
            }}
            title="Download blank Excel template pre-filled with this class's enrolled students"
          >
            <Download size={15} />
            <span>Download Excel Template</span>
          </button>
        </div>
      </div>

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

      {/* ========================================================
          TOP CONSOLIDATED CLASS MARKS TABLE
          Shows ONLY data from the uploaded document or saved records.
          ======================================================== */}
      <div className={styles.consolidatedCard}>
        <div className={styles.consolidatedHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Award size={20} color="var(--primary)" />
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800 }}>
              Consolidated Student Marks
            </h3>
            {detectedStudentsList.length > 0 && (
              <span style={{
                fontSize: "0.75rem",
                padding: "2px 8px",
                borderRadius: "10px",
                background: "rgba(59, 130, 246, 0.15)",
                color: "#60a5fa",
                fontWeight: 700
              }}>
                {detectedStudentsList.length} Students Scanned
              </span>
            )}
          </div>

          {detectedStudentsList.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <button
                type="button"
                onClick={handleVerifyAllReadyStudents}
                disabled={isSaving}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  padding: "0.45rem 1rem",
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 800,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)"
                }}
              >
                <CheckCircle2 size={15} />
                <span>{isSaving ? "Dispatching..." : `Verify All Ready Students (${detectedStudentsList.length})`}</span>
              </button>
            </div>
          )}
        </div>

        {detectedStudentsList.length === 0 ? (
          <div className={styles.consolidatedEmptyState}>
            <FileSpreadsheet size={40} color="var(--primary)" style={{ opacity: 0.7 }} />
            <h4 style={{ margin: "0.3rem 0", fontSize: "1.05rem", fontWeight: 800 }}>
              Consolidated Class Marks Grid
            </h4>
            <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-secondary)" }}>
              Upload a marks document to auto-fill the details.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className={styles.consolidatedTableWrapper}>
              <table className={styles.consolidatedTable}>
                <thead>
                  <tr>
                    <th className={styles.stickyCol} style={{ minWidth: "220px" }}>Student Name &amp; ID</th>
                    {detectedStudentsList[0]?.subjects?.map(s => (
                      <th key={s.id || s.subjectName} style={{ textAlign: "center", minWidth: "90px" }}>
                        {s.subjectName.toUpperCase()}
                      </th>
                    ))}
                    <th style={{ textAlign: "center", minWidth: "80px" }}>Total</th>
                    <th style={{ textAlign: "center", minWidth: "60px" }}>%</th>
                    <th style={{ textAlign: "center", minWidth: "60px" }}>Grade</th>
                    <th style={{ textAlign: "center", minWidth: "100px" }}>Result</th>
                    <th style={{ textAlign: "center", minWidth: "90px" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {detectedStudentsList.map((st, sIdx) => {
                    const isSelected = activeStudentIndex === sIdx;
                    const stTotals = calculateStudentTotals(st.subjects as any);
                    const isPass = stTotals.resultStatus === "PASSED";

                    return (
                      <tr
                        key={sIdx}
                        className={isSelected ? styles.activeStudentRow : ""}
                        onClick={() => handleSwitchStudent(sIdx)}
                        title="Click to review and edit this student in the form below"
                      >
                        <td className={styles.stickyCol}>
                          <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "var(--foreground)" }}>
                            {st.studentName}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                            Roll: <strong>{st.rollNumber || "Not Provided"}</strong>
                          </div>
                          {st.totalMismatchWarning && (
                            <div style={{ fontSize: "0.7rem", color: "#f59e0b", marginTop: "2px" }}>
                              ⚠️ {st.totalMismatchWarning}
                            </div>
                          )}
                        </td>

                        {st.subjects.map((sub, subIdx) => (
                          <td key={subIdx} style={{ textAlign: "center" }}>
                            <span className={sub.confidence === "LOW" ? styles.confidenceLow : ""}>
                              {sub.score !== "" && sub.score !== null && sub.score !== undefined ? sub.score : "-"}
                            </span>
                          </td>
                        ))}

                        <td style={{ textAlign: "center", fontWeight: 800 }}>
                          {stTotals.totalMarks} / {stTotals.maxTotalMarks}
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 700, color: "var(--primary)" }}>
                          {stTotals.percentage}%
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 800, color: stTotals.grade === "F" ? "#ef4444" : "#10b981" }}>
                          {stTotals.grade}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            className={styles.statusBadgeNoWrap}
                            style={{
                              padding: "2px 8px",
                              borderRadius: "6px",
                              fontWeight: 800,
                              fontSize: "0.72rem",
                              background: isPass ? "rgba(16, 185, 129, 0.15)" : stTotals.resultStatus === "NEEDS SUPPORT" ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)",
                              color: isPass ? "#10b981" : stTotals.resultStatus === "NEEDS SUPPORT" ? "#ef4444" : "#f59e0b"
                            }}
                          >
                            {stTotals.resultStatus}
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSwitchStudent(sIdx);
                            }}
                            style={{
                              padding: "0.25rem 0.6rem",
                              borderRadius: "6px",
                              border: isSelected ? "1px solid var(--primary)" : "1px solid var(--border-color)",
                              background: isSelected ? "rgba(59, 130, 246, 0.15)" : "transparent",
                              color: isSelected ? "var(--primary)" : "var(--foreground)",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              cursor: "pointer"
                            }}
                          >
                            {isSelected ? "Reviewing" : "Select"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View (< 768px) */}
            <div className={styles.mobileConsolidatedList}>
              {detectedStudentsList.map((st, sIdx) => {
                const isSelected = activeStudentIndex === sIdx;
                const stTotals = calculateStudentTotals(st.subjects as any);
                return (
                  <div
                    key={sIdx}
                    className={`${styles.mobileConsolidatedCard} ${isSelected ? styles.mobileConsolidatedCardActive : ""}`}
                    onClick={() => handleSwitchStudent(sIdx)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: "0.95rem" }}>{st.studentName}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          Roll: <strong>{st.rollNumber}</strong>
                        </div>
                      </div>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        background: stTotals.resultStatus === "PASSED" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                        color: stTotals.resultStatus === "PASSED" ? "#10b981" : "#ef4444"
                      }}>
                        {stTotals.resultStatus}
                      </span>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", margin: "0.3rem 0" }}>
                      {st.subjects.map((sub, subIdx) => (
                        <span
                          key={subIdx}
                          style={{
                            fontSize: "0.75rem",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: sub.confidence === "LOW" ? "rgba(245, 158, 11, 0.2)" : "rgba(255, 255, 255, 0.05)",
                            color: sub.confidence === "LOW" ? "#fbbf24" : "var(--foreground)"
                          }}
                        >
                          {sub.subjectName}: <strong>{sub.score !== "" && sub.score !== null ? sub.score : "-"}</strong>
                        </span>
                      ))}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      <span>Total: <strong>{stTotals.totalMarks}/{stTotals.maxTotalMarks}</strong></span>
                      <span>Pct: <strong>{stTotals.percentage}%</strong></span>
                      <span>Grade: <strong>{stTotals.grade}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
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
          padding: "clamp(1.5rem, 4vw, 2.2rem)",
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
          accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp,.bmp"
          multiple
          style={{ display: "none" }}
          onChange={e => handleAddFiles(e.target.files)}
        />
        <div style={{
          width: "50px",
          height: "50px",
          borderRadius: "14px",
          background: "rgba(59, 130, 246, 0.15)",
          color: "var(--primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 0.75rem"
        }}>
          <Upload size={24} />
        </div>
        <h3 style={{ margin: "0 0 0.35rem 0", fontSize: "1.05rem", fontWeight: 800 }}>
          Drag &amp; drop document, or click to browse
        </h3>
        <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Accepts Excel (.xlsx / .xls), CSV, Text PDF, Photos &amp; Scans (JPG / PNG) up to 10MB
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem", borderRadius: "6px", background: "rgba(16, 185, 129, 0.12)", color: "#34d399", border: "1px solid rgba(16, 185, 129, 0.25)" }}>📊 Excel / CSV</span>
          <span style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem", borderRadius: "6px", background: "rgba(239, 68, 68, 0.12)", color: "#f87171", border: "1px solid rgba(239, 68, 68, 0.25)" }}>📕 PDF</span>
          <span style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem", borderRadius: "6px", background: "rgba(59, 130, 246, 0.12)", color: "#60a5fa", border: "1px solid rgba(59, 130, 246, 0.25)" }}>📷 Photo / Scanned Mark Sheet</span>
        </div>
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
              Scanned Documents ({fileQueue.length} {fileQueue.length === 1 ? "File" : "Files"})
            </span>
            <button
              type="button"
              onClick={handleClearAll}
              style={{ background: "transparent", border: "none", color: "#ef4444", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer" }}
            >
              Clear All &amp; Re-scan
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
                    title="Remove file"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dev-Only Collapsible Debug Panel */}
      {process.env.NODE_ENV !== "production" && activeQueuedFile?.debugInfo && (
        <details
          style={{
            background: "rgba(0, 0, 0, 0.4)",
            border: "1px dashed #64748b",
            borderRadius: "10px",
            padding: "0.75rem 1rem",
            fontSize: "0.8rem",
            color: "#94a3b8"
          }}
        >
          <summary style={{ cursor: "pointer", fontWeight: 700, color: "#60a5fa" }}>
            Dev Debug: Show Raw Extracted Text &amp; Column Mapping
          </summary>
          <div style={{ marginTop: "0.65rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <div><strong>Header Line:</strong> {activeQueuedFile.debugInfo.headerLine || "Not detected"}</div>
            <div><strong>Columns Detected:</strong> {activeQueuedFile.debugInfo.columnsDetected?.join(", ") || "None"}</div>
            <div><strong>Raw Lines Count:</strong> {activeQueuedFile.debugInfo.rawLinesCount}</div>
            <pre style={{
              background: "#090d16",
              padding: "0.5rem",
              borderRadius: "6px",
              overflow: "auto",
              maxHeight: "200px",
              fontSize: "0.72rem",
              whiteSpace: "pre-wrap"
            }}>
              {activeQueuedFile.debugInfo.rawText}
            </pre>
          </div>
        </details>
      )}

      {/* Multi-Student Stepper Bar (When class sheet has 2+ students) */}
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
              Multi-Student Gradebook ({detectedStudentsList.length} Students)
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 700 }}>
              {verifiedIndices.size} of {detectedStudentsList.length} Verified &amp; Dispatched
            </span>
          </div>

          <div className={styles.studentStepperContainer}>
            {detectedStudentsList.map((st, sIdx) => {
              const isCurrent = activeStudentIndex === sIdx;
              const isVerified = verifiedIndices.has(sIdx);
              const stTotals = calculateStudentTotals(st.subjects as any);
              const isReady = stTotals.resultStatus !== "PENDING" && Boolean(st.studentId);

              return (
                <button
                  key={sIdx}
                  type="button"
                  onClick={() => handleSwitchStudent(sIdx)}
                  className={`${styles.studentStepTab} ${isCurrent ? styles.studentStepTabActive : ""} ${isVerified ? styles.studentStepTabVerified : ""}`}
                >
                  <span>Student {sIdx + 1}: {st.studentName || `Student ${sIdx + 1}`}</span>
                  <span style={{
                    fontSize: "0.7rem",
                    padding: "1px 5px",
                    borderRadius: "4px",
                    fontWeight: 700,
                    background: isVerified ? "rgba(16, 185, 129, 0.2)" : isReady ? "rgba(59, 130, 246, 0.2)" : "rgba(245, 158, 11, 0.2)",
                    color: isVerified ? "#34d399" : isReady ? "#60a5fa" : "#fbbf24"
                  }}>
                    {isVerified ? "Dispatched" : isReady ? "Ready" : "Needs review"}
                  </span>
                  {isVerified && <CheckCircle2 size={14} color="#10b981" />}
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
              <Edit3 size={20} color="var(--primary)" />
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
                    Original Document Preview
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
                    Student Name &amp; ID: *
                  </label>
                  <select
                    value={selectedStudentId}
                    onChange={e => setSelectedStudentId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem",
                      borderRadius: "8px",
                      border: !selectedStudentId ? "1.5px solid #ef4444" : "1px solid var(--border-color)",
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
                        {st.name} (Roll: {st.rollNumber})
                      </option>
                    ))}
                  </select>
                  {!selectedStudentId && (
                    <span style={{ fontSize: "0.72rem", color: "#ef4444", marginTop: "2px", display: "block" }}>
                      Please select the enrolled student
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.3rem", color: "var(--text-secondary)" }}>
                    Examination / Term: *
                  </label>
                  <input
                    type="text"
                    value={examName}
                    placeholder="e.g. Midterm Examination"
                    onChange={e => setExamName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem",
                      borderRadius: "8px",
                      border: !examName.trim() ? "1.5px solid #ef4444" : "1px solid var(--border-color)",
                      background: "var(--input-bg, #0f172a)",
                      color: "var(--foreground)",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      boxSizing: "border-box"
                    }}
                  />
                  {!examName.trim() && (
                    <span style={{ fontSize: "0.72rem", color: "#ef4444", marginTop: "2px", display: "block" }}>
                      Examination name required
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.3rem", color: "var(--text-secondary)" }}>
                    Exam Date: *
                  </label>
                  <input
                    type="date"
                    value={examDate}
                    onChange={e => setExamDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem",
                      borderRadius: "8px",
                      border: !examDate ? "1.5px solid #ef4444" : "1px solid var(--border-color)",
                      background: "var(--input-bg, #0f172a)",
                      color: "var(--foreground)",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      boxSizing: "border-box"
                    }}
                  />
                  {!examDate && (
                    <span style={{ fontSize: "0.72rem", color: "#ef4444", marginTop: "2px", display: "block" }}>
                      Exam date required
                    </span>
                  )}
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

              {/* Desktop Table View (Full width columns, unclipped text) */}
              <div className={styles.desktopTableView}>
                <table style={{ width: "100%", minWidth: "820px", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                      <th style={{ padding: "0.65rem 0.85rem", minWidth: "200px" }}>Subject</th>
                      <th style={{ padding: "0.65rem 0.85rem", textAlign: "center", width: "110px" }}>Marks Scored</th>
                      <th style={{ padding: "0.65rem 0.85rem", textAlign: "center", width: "90px" }}>Max Mark</th>
                      <th style={{ padding: "0.65rem 0.85rem", textAlign: "center", width: "90px" }}>Pass Mark</th>
                      <th style={{ padding: "0.65rem 0.85rem", textAlign: "center", width: "70px" }}>Grade</th>
                      <th style={{ padding: "0.65rem 0.85rem", textAlign: "center", width: "110px" }}>Status</th>
                      <th style={{ padding: "0.65rem 0.85rem", minWidth: "150px" }}>Remarks</th>
                      <th style={{ padding: "0.65rem 0.85rem", textAlign: "center", width: "45px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map(sub => {
                      const isNum = typeof sub.score === "number";
                      const isAbsent = sub.score === "AB";
                      const isMissing = sub.score === "" || sub.score === null;
                      const isDupe = duplicateSubjectIds.has(sub.subjectId);

                      return (
                        <tr key={sub.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                          <td style={{ padding: "0.6rem 0.85rem", minWidth: "200px" }}>
                            <select
                              value={sub.subjectId}
                              onChange={e => handleSubjectMappingChange(sub.id, e.target.value)}
                              style={{
                                width: "100%",
                                minWidth: "180px",
                                padding: "0.45rem 0.6rem",
                                borderRadius: "6px",
                                border: isDupe ? "1.5px solid #ef4444" : "1px solid var(--border-color)",
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
                            {isDupe && (
                              <span style={{ fontSize: "0.7rem", color: "#ef4444", display: "block", marginTop: "2px" }}>
                                Duplicate subject selected
                              </span>
                            )}
                          </td>

                          <td style={{ padding: "0.6rem 0.85rem", textAlign: "center" }}>
                            <input
                              type="text"
                              value={sub.score === null || sub.score === "" ? "" : sub.score}
                              placeholder="-"
                              onChange={e => handleSubjectScoreChange(sub.id, e.target.value)}
                              style={{
                                width: "75px",
                                padding: "0.35rem 0.45rem",
                                borderRadius: "6px",
                                border: sub.isInvalid ? "1.5px solid #ef4444" : "1px solid var(--border-color)",
                                background: sub.isInvalid ? "rgba(239, 68, 68, 0.12)" : "var(--card-bg, #1e293b)",
                                color: sub.isInvalid ? "#ef4444" : "var(--foreground)",
                                fontWeight: 800,
                                fontSize: "0.95rem",
                                textAlign: "center"
                              }}
                            />
                            {sub.validationError && (
                              <span style={{ fontSize: "0.68rem", color: "#ef4444", display: "block", marginTop: "2px", lineHeight: "1.2" }}>
                                {sub.validationError}
                              </span>
                            )}
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
                                background: sub.status === "PASS" ? "rgba(16, 185, 129, 0.15)" : sub.status === "FAIL" || sub.status === "ABSENT" ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)",
                                color: sub.status === "PASS" ? "#10b981" : sub.status === "FAIL" || sub.status === "ABSENT" ? "#ef4444" : "#f59e0b"
                              }}
                            >
                              {sub.status || "REVIEW"}
                            </span>
                          </td>

                          <td style={{ padding: "0.6rem 0.85rem" }}>
                            <input
                              type="text"
                              value={sub.remarks || ""}
                              placeholder={isAbsent ? "Absent" : sub.status === "FAIL" ? "Needs revision" : "Teacher remarks"}
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
                  const isAbsent = sub.score === "AB";
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
                            type="text"
                            value={sub.score === null || sub.score === "" ? "" : sub.score}
                            placeholder="-"
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
                              background: sub.status === "PASS" ? "rgba(16, 185, 129, 0.15)" : sub.status === "FAIL" || sub.status === "ABSENT" ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)",
                              color: sub.status === "PASS" ? "#10b981" : sub.status === "FAIL" || sub.status === "ABSENT" ? "#ef4444" : "#f59e0b"
                            }}
                          >
                            {sub.status || "REVIEW"}
                          </span>
                        </div>
                      </div>

                      {sub.validationError && (
                        <span style={{ fontSize: "0.72rem", color: "#ef4444", fontWeight: 700 }}>
                          {sub.validationError}
                        </span>
                      )}

                      <input
                        type="text"
                        value={sub.remarks || ""}
                        placeholder={isAbsent ? "Absent" : sub.status === "FAIL" ? "Needs revision" : "Teacher remarks"}
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
                  placeholder="Enter remarks or academic encouragement for parents..."
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
                flexWrap: "wrap",
                gap: "1rem",
                marginTop: "0.5rem"
              }}>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(activeQueuedFile.id)}
                  disabled={isSaving}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    padding: "0.75rem 1.15rem",
                    borderRadius: "10px",
                    border: "1px solid var(--border-color)",
                    background: "transparent",
                    color: "var(--foreground)",
                    fontWeight: 700,
                    fontSize: "0.88rem",
                    cursor: "pointer"
                  }}
                  title="Remove this file and clear form"
                >
                  <RotateCcw size={16} />
                  <span>Re-scan / Remove</span>
                </button>

                {detectedStudentsList.length > 1 && (
                  <button
                    type="button"
                    onClick={handleVerifyAllReadyStudents}
                    disabled={isSaving}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.75rem 1.25rem",
                      background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "10px",
                      fontWeight: 800,
                      fontSize: "0.92rem",
                      cursor: "pointer",
                      boxShadow: "0 4px 12px rgba(16, 185, 129, 0.35)",
                      transition: "all 0.15s ease"
                    }}
                    title="Verify and dispatch all ready students to parents"
                  >
                    <CheckCircle2 size={18} />
                    <span>{isSaving ? "Dispatching..." : `Verify All Ready Students (${detectedStudentsList.length})`}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleVerifyAndDispatchStudent}
                  disabled={isSaving || totals.hasValidationErrors || !selectedStudentId || !examName.trim() || !examDate}
                  className={styles.sendBtn}
                  title={
                    !selectedStudentId
                      ? "Select an enrolled student before dispatching"
                      : !examName.trim()
                        ? "Enter exam name before dispatching"
                        : !examDate
                          ? "Enter exam date before dispatching"
                          : totals.hasValidationErrors
                            ? "All subject marks must be entered (or marked Absent)"
                            : "Verify & Dispatch Report Card to Parent"
                  }
                >
                  <Send size={18} />
                  <span>{isSaving ? "Dispatching..." : detectedStudentsList.length > 1 ? "Verify & Dispatch Student" : "Verify & Dispatch"}</span>
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
