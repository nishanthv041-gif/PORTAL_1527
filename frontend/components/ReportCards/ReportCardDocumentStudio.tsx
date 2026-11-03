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
import {
  scanMarksheetDocument,
  ScanStageError,
  ScanStage,
  ScanDebugInfo
} from "@/frontend/lib/scan";
import { matchScanResultToDatabase } from "@/frontend/lib/scan/match-students";
import { generateClassReportCardExcelTemplate } from "@/frontend/lib/exams/excelMarksUtil";
import { calculateReportCardGrade } from "@/frontend/lib/constants";
import {
  dispatchSingleStudentReportCardAction,
  dispatchBulkReadyStudentsAction,
  type DispatchSubjectInput,
  type BulkDispatchSummary,
  type DispatchResultItem,
  type SingleStudentDispatchInput,
} from "@/backend/lib/services/dispatchReportCardService";
import { exportConsolidatedMarksToExcel } from "@/frontend/lib/exams/exportConsolidatedMarks";
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
  stage?: ScanStage;
  error?: string;
  errorStage?: ScanStage;
  result?: ScanReportCardResult;
  debugInfo?: ScanDebugInfo;
}

interface ReportCardDocumentStudioProps {
  classes: TeacherClass[];
  selectedClassId: string;
  onClassChange?: (classId: string) => void;
  onReportCardCreated: (newCard: HistoryItem, recipients: string[]) => void;
  onCloseModal?: () => void;
  isModalView?: boolean;
  onSwitchToHistory?: () => void;
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
  onSwitchToHistory,
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
  const [hasAttemptedDispatch, setHasAttemptedDispatch] = useState<boolean>(false);

  // Multi-Student Stepper & Verification State
  const [activeStudentIndex, setActiveStudentIndex] = useState<number>(0);
  const [verifiedIndices, setVerifiedIndices] = useState<Set<number>>(new Set());
  const [studentEdits, setStudentEdits] = useState<Record<number, {
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

  // Bulk Dispatch Modals & Live Progress
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState<boolean>(false);
  const [isBulkProgressOpen, setIsBulkProgressOpen] = useState<boolean>(false);
  const [bulkProgressText, setBulkProgressText] = useState<string>("");
  const [bulkProgressPercent, setBulkProgressPercent] = useState<number>(0);
  const [bulkSummary, setBulkSummary] = useState<BulkDispatchSummary | null>(null);
  const [isBulkSummaryOpen, setIsBulkSummaryOpen] = useState<boolean>(false);
  const [hasCheckedBulkMarks, setHasCheckedBulkMarks] = useState<boolean>(false);

  // Revision & Correction Flow Modal State
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState<boolean>(false);
  const [revisionStudent, setRevisionStudent] = useState<{
    studentId: string;
    studentName: string;
    rollNumber: string;
    revision: number;
  } | null>(null);
  const [revisionReasonText, setRevisionReasonText] = useState<string>("");

  // Re-scan / Remove confirmation dialog
  const [isRescanConfirmOpen, setIsRescanConfirmOpen] = useState<boolean>(false);

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

  // Live calculation of all students and their Ready/Dispatched/NeedsReview status
  const readyStudentsList = useMemo(() => {
    return detectedStudentsList.map((entry, idx) => {
      const isCurrentActive = idx === activeStudentIndex;
      const edits = studentEdits[idx];
      const targetStudentId = isCurrentActive ? selectedStudentId : (edits?.studentId || entry.studentId);
      const targetSubjects = isCurrentActive ? subjects : (edits?.subjects || entry.subjects || []);
      const targetRemarks = isCurrentActive ? generalRemarks : (edits?.generalRemarks !== undefined ? edits.generalRemarks : entry.remarks);
      const targetAttendance = isCurrentActive ? attendance : (edits?.attendance !== undefined ? edits.attendance : entry.attendance);
      const studentObj = classStudents.find(s => s.id === targetStudentId);

      const isReady =
        !!targetStudentId &&
        targetSubjects.length > 0 &&
        targetSubjects.every(
          s => s.score === "AB" || (typeof s.score === "number" && !s.isInvalid)
        );

      let totalScore = 0;
      let maxTotal = 0;
      let hasFail = false;
      targetSubjects.forEach(s => {
        const isAbsent = s.score === "AB";
        const num = typeof s.score === "number" ? s.score : null;
        if (num !== null) totalScore += num;
        if (isAbsent || (num !== null && num < (s.passMarks || 35))) hasFail = true;
        maxTotal += s.maxScore || 100;
      });

      const percentage = maxTotal > 0 ? parseFloat(((totalScore / maxTotal) * 100).toFixed(1)) : 0;
      const grade = calculateReportCardGrade(percentage, hasFail);
      const result: "PASS" | "FAIL" = hasFail ? "FAIL" : "PASS";

      return {
        index: idx,
        studentId: targetStudentId,
        studentName: studentObj?.name || entry.studentName || `Student ${idx + 1}`,
        rollNumber: studentObj?.rollNumber || entry.rollNumber || "",
        attendance: targetAttendance,
        generalRemarks: targetRemarks,
        subjects: targetSubjects,
        totalScore,
        maxTotal,
        percentage,
        grade,
        result,
        isReady,
        isVerified: verifiedIndices.has(idx),
        hasLinkedParent: (studentObj?.parents || []).length > 0,
        parentCount: (studentObj?.parents || []).length,
      };
    });
  }, [detectedStudentsList, activeStudentIndex, selectedStudentId, subjects, generalRemarks, attendance, classStudents, verifiedIndices, studentEdits]);

  const readyCount = useMemo(() => {
    return readyStudentsList.filter(s => s.isReady).length;
  }, [readyStudentsList]);

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
    setStudentEdits({});
    setActiveStudentIndex(0);
    setVerifiedIndices(new Set());
    setHasAttemptedDispatch(false);

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

  // Process a Queued Item via Self-Hosted In-Browser Scan Engine (No server upload)
  const processQueueItem = async (entry: QueuedFile) => {
    if (!activeClassId) {
      setGlobalError("Please select a target class before scanning documents.");
      return;
    }

    setFileQueue(prev =>
      prev.map(f => (f.id === entry.id ? { ...f, status: "PROCESSING", stage: "image-load", progressText: `Reading ${entry.ext.toUpperCase()} document...`, progressPercent: 10 } : f))
    );

    try {
      const { result: scanResult, debugInfo } = await scanMarksheetDocument(entry.file, {
        defaultMaxMarks: examMaxMarks,
        defaultPassMarks: examPassMarks,
        onProgress: (p) => {
          setFileQueue(prev =>
            prev.map(f => (f.id === entry.id ? { ...f, stage: p.stage, progressText: p.message, progressPercent: p.percent } : f))
          );
        }
      });

      if (!scanResult || scanResult.students.length === 0) {
        throw new ScanStageError("table-parse", `Could not find any readable marks or student rows in ${entry.name}. Try the Excel template or a clearer image.`);
      }

      // Match extracted students to real database students
      const detectedStudents: DetectedStudentEntry[] = matchScanResultToDatabase(
        scanResult,
        classStudents,
        classSubjects,
        currentClass ? `${currentClass.name} - ${currentClass.section}` : null
      );

      const firstStudent = detectedStudents[0];

      const result: ScanReportCardResult = {
        success: true,
        fileDetails: scanResult.fileDetails || { name: entry.name, type: entry.file.type || "application/octet-stream", size: entry.size },
        studentId: firstStudent.studentId,
        studentName: firstStudent.studentName,
        rollNumber: firstStudent.rollNumber,
        extractedName: firstStudent.extractedName,
        studentConfidence: firstStudent.confidence === "HIGH" ? "HIGH" : firstStudent.confidence === "MEDIUM" ? "MEDIUM" : "LOW",
        examName: scanResult.examination || "",
        examDate: scanResult.examDate || "",
        defaultMaxMarks: scanResult.maxMarksDefault || examMaxMarks,
        defaultPassMarks: scanResult.passMarksDefault || examPassMarks,
        generalRemarks: firstStudent.remarks || "",
        subjects: firstStudent.subjects,
        allDetectedStudents: detectedStudents,
        detectedStudents,
        rawTextPreview: scanResult.rawTextPreview,
        docTotal: firstStudent.printedTotal
      };

      setFileQueue(prev =>
        prev.map(f =>
          f.id === entry.id
            ? {
                ...f,
                status: "EXTRACTED",
                stage: "json-validate",
                progressText: `Extracted ${detectedStudents.length} student(s) successfully`,
                progressPercent: 100,
                result,
                debugInfo
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
      const stage = err?.stage || "ocr-recognize";
      const errMsg = err?.message || `Scan failed at [${stage}]. Try the Excel template or a clearer photo.`;
      setGlobalError(errMsg);

      setFileQueue(prev =>
        prev.map(f =>
          f.id === entry.id
            ? {
                ...f,
                status: "FAILED",
                stage,
                errorStage: stage,
                progressText: `Scan failed at [${stage}]`,
                error: errMsg
              }
            : f
        )
      );
    }
  };

  const handleEnterManually = () => {
    setGlobalError(null);
    setHasAttemptedDispatch(false);
    if (!selectedStudentId && classStudents[0]) {
      setSelectedStudentId(classStudents[0].id);
    }
    if (subjects.length === 0 && classSubjects.length > 0) {
      setSubjects(
        classSubjects.map((cs, idx) => ({
          id: `manual-sub-${idx}`,
          subjectId: cs.id,
          subjectName: cs.name,
          score: "",
          maxScore: cs.maxMarks || examMaxMarks || 100,
          passMarks: cs.passMarks || examPassMarks || 35,
          grade: "-",
          status: "NEEDS_REVIEW",
          remarks: "",
          confidence: "HIGH",
          isInvalid: false
        }))
      );
    }
  };

  // Populate Editor State from Result
  const applyScanResultToEditor = (result: ScanReportCardResult) => {
    setStudentEdits({});
    setActiveStudentIndex(0);
    setVerifiedIndices(new Set());
    setHasAttemptedDispatch(false);

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
    const newEdits = {
      ...studentEdits,
      [activeStudentIndex]: {
        studentId: selectedStudentId,
        subjects: [...subjects],
        attendance,
        generalRemarks
      }
    };
    setStudentEdits(newEdits);

    // 2. Load target student's cached edits or scan defaults
    const cached = newEdits[newIndex];
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
    setStudentEdits({});
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
  const handleDownloadExcelTemplate = async () => {
    try {
      if (!currentClass) {
        setGlobalError("Please select a target class first.");
        return;
      }

      const excelBytes = await generateClassReportCardExcelTemplate({
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
  const handleVerifyAndDispatchStudent = async (providedRevisionReason?: string) => {
    setGlobalError(null);
    setSaveSuccess(null);

    if (!activeClassId) {
      setGlobalError("Please select a valid class.");
      return;
    }
    if (!selectedStudentId) {
      setHasAttemptedDispatch(true);
      setGlobalError("Please select the enrolled student this report card belongs to.");
      return;
    }
    if (!examName.trim()) {
      setHasAttemptedDispatch(true);
      setGlobalError("Examination / Term name is required before dispatching.");
      return;
    }
    if (!examDate) {
      setHasAttemptedDispatch(true);
      setGlobalError("Examination Date is required before dispatching.");
      return;
    }
    if (subjects.length === 0) {
      setHasAttemptedDispatch(true);
      setGlobalError("Please enter at least one subject mark before dispatching.");
      return;
    }

    if (duplicateSubjectIds.size > 0) {
      setHasAttemptedDispatch(true);
      setGlobalError("Duplicate subjects found. Please ensure each subject is included only once.");
      return;
    }

    const hasMissingOrInvalid = subjects.some(s => s.isInvalid || s.score === "" || s.score === null);
    if (hasMissingOrInvalid) {
      setHasAttemptedDispatch(true);
      setGlobalError("All subject marks must be entered (or marked Absent) before dispatching.");
      return;
    }

    setIsSaving(true);

    try {
      const formattedSubjects: DispatchSubjectInput[] = subjects.map(s => {
        let finalSubjectId = s.subjectId;
        if (!finalSubjectId) {
          const match = classSubjects.find(
            cs => cs.name.toLowerCase() === s.subjectName.toLowerCase()
          );
          finalSubjectId = match?.id || classSubjects[0]?.id || "";
        }
        return {
          subjectId: finalSubjectId,
          subjectName: s.subjectName,
          score: s.score === "AB" ? "AB" : Number(s.score),
          maxScore: s.maxScore || 100,
          passMarks: s.passMarks || 35,
          remarks: s.remarks || undefined,
          absent: s.score === "AB",
        };
      });

      const res = await dispatchSingleStudentReportCardAction({
        studentId: selectedStudentId,
        classId: activeClassId,
        examName: examName.trim(),
        examDate,
        academicYear,
        attendance: attendance.trim() || undefined,
        generalRemarks: generalRemarks.trim() || undefined,
        subjects: formattedSubjects,
        revisionReason: providedRevisionReason || undefined,
      });

      if (res.needsRevisionReason) {
        setIsSaving(false);
        setRevisionStudent({
          studentId: selectedStudentId,
          studentName: res.studentName || "Student",
          rollNumber: res.rollNumber || "",
          revision: res.previousRevision || 1,
        });
        setRevisionReasonText("");
        setIsRevisionModalOpen(true);
        return;
      }

      if (res.success && res.reportCardId) {
        const studentObj = classStudents.find(s => s.id === selectedStudentId);
        const newHistoryItem: HistoryItem = {
          id: res.reportCardId,
          studentId: selectedStudentId,
          studentName: studentObj?.name || res.studentName || "Student",
          rollNumber: studentObj?.rollNumber || res.rollNumber || "",
          className: currentClass ? `${currentClass.name} - ${currentClass.section}` : "Class",
          classId: activeClassId,
          examId: `exam-${Date.now()}`,
          examName: examName.trim(),
          examDate: new Date(examDate).toISOString(),
          totalMarks: totals.obtained,
          percentage: totals.percentage,
          grade: totals.grade,
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

        const notifMsg = (res.parentsNotifiedCount || 0) > 0
          ? `${res.parentsNotifiedCount} parent(s) notified.`
          : `No parent linked (saved to history).`;
        const rankMsg = res.rank ? ` [Rank #${res.rank}]` : "";
        const revisionMsg = (res.revision || 1) > 1 ? ` (Revision ${res.revision})` : "";
        const successMsg = `Verified and dispatched for ${studentObj?.name || "Student"}${rankMsg}${revisionMsg}! ${notifMsg}`;

        setSaveSuccess(successMsg);
        onReportCardCreated(newHistoryItem, []);

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

  // Open Bulk Confirmation Modal
  const handleOpenBulkConfirm = () => {
    setGlobalError(null);
    setSaveSuccess(null);

    if (!activeClassId) {
      setGlobalError("Please select a target class before dispatching.");
      return;
    }
    if (!examName.trim()) {
      setHasAttemptedDispatch(true);
      setGlobalError("Examination / Term name is required before dispatching.");
      return;
    }
    if (!examDate) {
      setHasAttemptedDispatch(true);
      setGlobalError("Examination Date is required before dispatching.");
      return;
    }

    if (readyCount === 0) {
      setGlobalError("No students have complete, error-free marks ready for dispatch.");
      return;
    }

    setHasCheckedBulkMarks(false);
    setIsBulkConfirmOpen(true);
  };

  // Execute Bulk Dispatch across all ready students (pool concurrency 2 with live progress)
  const handleExecuteBulkDispatch = async (onlyStudentIds?: string[] | unknown) => {
    setIsBulkConfirmOpen(false);
    setIsBulkProgressOpen(true);
    setBulkProgressPercent(10);
    setIsSaving(true);

    // Cache active student's edits first
    const currentEdits = {
      ...studentEdits,
      [activeStudentIndex]: {
        studentId: selectedStudentId,
        subjects: [...subjects],
        attendance,
        generalRemarks
      }
    };
    setStudentEdits(currentEdits);

    const targetList = Array.isArray(onlyStudentIds) ? onlyStudentIds : undefined;
    let targetReady = readyStudentsList.filter(s => s.isReady);
    if (targetList && targetList.length > 0) {
      targetReady = targetReady.filter(s => targetList.includes(s.studentId));
    }

    const total = targetReady.length;
    if (total === 0) {
      setIsBulkProgressOpen(false);
      setIsSaving(false);
      setGlobalError("No ready students found to dispatch.");
      return;
    }

    setBulkProgressText(`Preparing ${total} ready student(s)...`);

    const results: DispatchResultItem[] = [];
    const missingParentStudentNames: string[] = [];
    let dispatchedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let parentsNotifiedCount = 0;
    let sharedExamId: string | undefined;

    const dispatchOneStudent = async (st: typeof targetReady[0]): Promise<DispatchResultItem> => {
      const formattedSubjects: DispatchSubjectInput[] = st.subjects.map(s => {
        let finalSubjectId = s.subjectId;
        if (!finalSubjectId) {
          const match = classSubjects.find(cs => cs.name.toLowerCase() === s.subjectName.toLowerCase());
          finalSubjectId = match?.id || classSubjects[0]?.id || "";
        }
        return {
          subjectId: finalSubjectId,
          subjectName: s.subjectName,
          score: s.score === "AB" ? "AB" : Number(s.score),
          maxScore: s.maxScore || 100,
          passMarks: s.passMarks || 35,
          remarks: s.remarks || undefined,
          absent: s.score === "AB",
        };
      });

      const payload: SingleStudentDispatchInput = {
        studentId: st.studentId,
        classId: activeClassId,
        examName: examName.trim(),
        examDate,
        academicYear,
        attendance: st.attendance ? String(st.attendance) : undefined,
        generalRemarks: st.generalRemarks || undefined,
        subjects: formattedSubjects,
      };

      try {
        const response = await fetch("/api/teacher/report-cards/dispatch-one", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const res: DispatchResultItem = await response.json();
        return res;
      } catch (err: any) {
        return {
          studentId: st.studentId,
          studentName: st.studentName,
          rollNumber: st.rollNumber,
          success: false,
          error: err?.message || "Network error",
        };
      }
    };

    let completed = 0;
    let queueIdx = 0;
    const concurrency = 2;

    const worker = async () => {
      while (queueIdx < total) {
        const currentIdx = queueIdx++;
        const currentStudent = targetReady[currentIdx];
        setBulkProgressText(`Dispatching ${completed + 1} of ${total}: ${currentStudent.studentName}...`);
        const res = await dispatchOneStudent(currentStudent);
        results.push(res);
        completed++;
        setBulkProgressPercent(Math.min(95, Math.round(15 + (completed / total) * 80)));

        if (res.success) {
          dispatchedCount++;
          parentsNotifiedCount += res.parentsNotifiedCount || 0;
          if (res.examId) sharedExamId = res.examId;
          if (!res.hasLinkedParents) {
            missingParentStudentNames.push(res.studentName || currentStudent.studentName);
          }
        } else if (res.needsRevisionReason) {
          skippedCount++;
        } else {
          failedCount++;
        }
      }
    };

    try {
      await Promise.all(
        Array.from({ length: Math.min(concurrency, total) }, () => worker())
      );

      setBulkProgressPercent(100);
      setBulkProgressText(`Dispatch completed!`);

      // Update verified indices
      const newlyVerified = new Set(verifiedIndices);
      results.forEach((r) => {
        if (r.success) {
          const idx = detectedStudentsList.findIndex(d => d.studentId === r.studentId);
          if (idx !== -1) newlyVerified.add(idx);
        }
      });
      setVerifiedIndices(newlyVerified);

      const summary: BulkDispatchSummary = {
        success: dispatchedCount > 0,
        examId: sharedExamId,
        totalRequested: total,
        dispatchedCount,
        failedCount,
        skippedCount,
        parentsNotifiedCount,
        missingParentsCount: missingParentStudentNames.length,
        missingParentStudentNames,
        results,
      };

      setBulkSummary(summary);
      setIsBulkProgressOpen(false);
      setIsBulkSummaryOpen(true);

      if (summary.dispatchedCount > 0) {
        setSaveSuccess(`Verified and dispatched ${summary.dispatchedCount} student report card(s)! ${summary.parentsNotifiedCount} parent(s) notified.`);
      }
      if (summary.failedCount > 0) {
        setGlobalError(`${summary.failedCount} student(s) could not be dispatched. See summary for details.`);
      }
    } catch (err: any) {
      console.error("Bulk dispatch error:", err);
      setIsBulkProgressOpen(false);
      setGlobalError(err?.message || "Server error while bulk dispatching report cards.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetryFailedOnly = () => {
    if (!bulkSummary) return;
    const failedIds = bulkSummary.results.filter(r => !r.success).map(r => r.studentId);
    if (failedIds.length === 0) return;
    setIsBulkSummaryOpen(false);
    handleExecuteBulkDispatch(failedIds);
  };

  // Generate and Download Excel Class Mark Sheet from Summary
  const handleExportExcelFromSummary = () => {
    if (!currentClass || !examName.trim()) return;

    const exportSubjects = classSubjects.map(s => ({
      id: s.id,
      subjectName: s.name,
      maxMarks: s.maxMarks || 100,
      passMark: s.passMarks || 35,
    }));

    const exportStudents = detectedStudentsList.map((st, idx) => {
      const edits = studentEdits[idx];
      const targetStudentId = edits?.studentId || st.studentId;
      const targetSubjects = edits?.subjects || st.subjects || [];
      const studentObj = classStudents.find(s => s.id === targetStudentId);

      const subjectScores: Record<string, { marksObtained: number | null; isAbsent: boolean }> = {};
      let totalObtained = 0;
      let hasFail = false;

      targetSubjects.forEach(s => {
        const isAbsent = s.score === "AB";
        const score = typeof s.score === "number" ? s.score : null;
        if (score !== null) totalObtained += score;
        if (isAbsent || (score !== null && score < (s.passMarks || 35))) hasFail = true;
        subjectScores[s.subjectId] = {
          marksObtained: score,
          isAbsent,
        };
      });

      const maxTotal = targetSubjects.reduce((acc, s) => acc + (s.maxScore || 100), 0);
      const percentage = maxTotal > 0 ? parseFloat(((totalObtained / maxTotal) * 100).toFixed(1)) : 0;

      return {
        rollNumber: studentObj?.rollNumber || st.rollNumber || "",
        fullName: studentObj?.name || st.studentName || `Student ${idx + 1}`,
        subjectScores,
        totalObtained,
        percentage,
        rank: idx + 1,
        result: hasFail ? "FAIL" : "PASS",
      };
    });

    exportConsolidatedMarksToExcel(
      examName.trim(),
      currentClass.name,
      currentClass.section,
      exportSubjects,
      exportStudents
    );
  };

  // Confirm Revision Submission
  const handleConfirmRevision = async () => {
    if (!revisionReasonText.trim()) return;
    setIsRevisionModalOpen(false);
    await handleVerifyAndDispatchStudent(revisionReasonText.trim());
  };

  // Confirm and Execute Re-scan / Remove
  const handleExecuteRescanAndRemove = () => {
    setIsRescanConfirmOpen(false);
    if (activeQueuedFile) {
      handleRemoveFile(activeQueuedFile.id);
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
                onClick={handleOpenBulkConfirm}
                disabled={isSaving || readyCount === 0}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  padding: "0.45rem 1rem",
                  background: readyCount > 0 ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "rgba(100, 116, 139, 0.4)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 800,
                  fontSize: "0.82rem",
                  cursor: readyCount > 0 && !isSaving ? "pointer" : "not-allowed",
                  boxShadow: readyCount > 0 ? "0 2px 8px rgba(16, 185, 129, 0.3)" : "none",
                  opacity: readyCount > 0 ? 1 : 0.6
                }}
              >
                <CheckCircle2 size={15} />
                <span>{isSaving ? "Dispatching..." : `Verify All Ready Students (${readyCount})`}</span>
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
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: item.status === "EXTRACTED" ? "#10b981" : item.status === "FAILED" ? "#ef4444" : "var(--text-secondary)" }}>
                      {formatFileSize(item.size)} • {item.progressText || item.status}
                    </div>
                    {item.status === "FAILED" && (
                      <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.35rem" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            processQueueItem(item);
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            padding: "0.2rem 0.5rem",
                            borderRadius: "4px",
                            border: "1px solid #ef4444",
                            background: "rgba(239, 68, 68, 0.15)",
                            color: "#f87171",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            cursor: "pointer"
                          }}
                        >
                          <RotateCcw size={11} /> Try Again
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEnterManually();
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            padding: "0.2rem 0.5rem",
                            borderRadius: "4px",
                            border: "1px solid var(--border-color)",
                            background: "transparent",
                            color: "var(--foreground)",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            cursor: "pointer"
                          }}
                        >
                          Enter Manually
                        </button>
                      </div>
                    )}
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

      {/* Dev-Only Collapsible Scan Debug Panel */}
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
            Dev Scan Debug: Stage, Layout, Words with Boxes &amp; Final JSON
          </summary>
          <div style={{ marginTop: "0.65rem", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
            <div><strong>Processing Stage:</strong> <span style={{ color: "#34d399", fontWeight: 700 }}>{activeQueuedFile.debugInfo.stage}</span></div>
            <div><strong>Layout Detected:</strong> <span style={{ color: "#60a5fa", fontWeight: 700 }}>Layout {activeQueuedFile.debugInfo.layout}</span></div>
            <div><strong>Word Count:</strong> {activeQueuedFile.debugInfo.wordCount}</div>
            <div><strong>Header Words:</strong> {activeQueuedFile.debugInfo.headerWords?.join(", ") || "None"}</div>
            
            {activeQueuedFile.debugInfo.finalJson && (
              <div>
                <strong>Final Extracted JSON Output:</strong>
                <pre style={{
                  background: "#090d16",
                  padding: "0.5rem",
                  borderRadius: "6px",
                  overflow: "auto",
                  maxHeight: "180px",
                  fontSize: "0.72rem"
                }}>
                  {JSON.stringify(activeQueuedFile.debugInfo.finalJson, null, 2)}
                </pre>
              </div>
            )}

            {activeQueuedFile.debugInfo.rawWords && activeQueuedFile.debugInfo.rawWords.length > 0 && (
              <details style={{ marginTop: "0.3rem" }}>
                <summary style={{ cursor: "pointer", color: "#94a3b8" }}>Raw OCR Words with Bounding Boxes ({activeQueuedFile.debugInfo.rawWords.length})</summary>
                <pre style={{
                  background: "#090d16",
                  padding: "0.5rem",
                  borderRadius: "6px",
                  overflow: "auto",
                  maxHeight: "150px",
                  fontSize: "0.7rem"
                }}>
                  {JSON.stringify(activeQueuedFile.debugInfo.rawWords.slice(0, 40), null, 2)}
                </pre>
              </details>
            )}
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
                    overflowX: "auto",
                    overflowY: "hidden",
                    border: "1px solid var(--border-color)",
                    cursor: "zoom-in",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#000000",
                    position: "relative",
                    width: "100%",
                    maxWidth: "100%",
                    boxSizing: "border-box"
                  }}
                  title="Click to zoom and inspect full document"
                >
                  <img
                    src={activeQueuedFile.previewUrl}
                    alt="Document Scan"
                    style={{
                      width: "100%",
                      maxWidth: "100%",
                      height: "auto",
                      maxHeight: "480px",
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
                      border: (hasAttemptedDispatch && !selectedStudentId) ? "1.5px solid #ef4444" : "1px solid var(--border-color)",
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
                  {hasAttemptedDispatch && !selectedStudentId && (
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
                      border: (hasAttemptedDispatch && !examName.trim()) ? "1.5px solid #ef4444" : "1px solid var(--border-color)",
                      background: "var(--input-bg, #0f172a)",
                      color: "var(--foreground)",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      boxSizing: "border-box"
                    }}
                  />
                  {hasAttemptedDispatch && !examName.trim() && (
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
                      border: (hasAttemptedDispatch && !examDate) ? "1.5px solid #ef4444" : "1px solid var(--border-color)",
                      background: "var(--input-bg, #0f172a)",
                      color: "var(--foreground)",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      boxSizing: "border-box"
                    }}
                  />
                  {hasAttemptedDispatch && !examDate && (
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
                      <th style={{ padding: "0.65rem 0.5rem", textAlign: "center", minWidth: "85px", whiteSpace: "nowrap" }}>Grade</th>
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
                                border: sub.isInvalid || (hasAttemptedDispatch && (sub.score === null || sub.score === "")) ? "1.5px solid #ef4444" : "1px solid var(--border-color)",
                                background: sub.isInvalid || (hasAttemptedDispatch && (sub.score === null || sub.score === "")) ? "rgba(239, 68, 68, 0.12)" : "var(--card-bg, #1e293b)",
                                color: sub.isInvalid || (hasAttemptedDispatch && (sub.score === null || sub.score === "")) ? "#ef4444" : "var(--foreground)",
                                fontWeight: 800,
                                fontSize: "0.95rem",
                                textAlign: "center"
                              }}
                            />
                            {(sub.validationError || (hasAttemptedDispatch && (sub.score === null || sub.score === ""))) && (
                              <span style={{ fontSize: "0.68rem", color: "#ef4444", display: "block", marginTop: "2px", lineHeight: "1.2" }}>
                                {sub.validationError || "Mark required"}
                              </span>
                            )}
                          </td>

                          <td style={{ padding: "0.6rem 0.85rem", textAlign: "center", color: "var(--text-secondary)" }}>
                            {sub.maxScore}
                          </td>

                          <td style={{ padding: "0.6rem 0.85rem", textAlign: "center", color: "var(--text-secondary)" }}>
                            {sub.passMarks}
                          </td>

                          <td style={{ padding: "0.6rem 0.5rem", textAlign: "center", minWidth: "85px", whiteSpace: "nowrap", fontWeight: 800, color: sub.grade === "F" ? "#ef4444" : "#10b981" }}>
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

              {/* Responsive Action Buttons (Desktop one row right-aligned, Mobile sticky stacked) */}
              <div className={styles.buttonBar}>
                <button
                  type="button"
                  onClick={() => setIsRescanConfirmOpen(true)}
                  disabled={isSaving}
                  style={{
                    border: "1.5px solid var(--border-color)",
                    background: "transparent",
                    color: "var(--foreground)",
                  }}
                  title="Remove this scan and clear memory"
                >
                  <RotateCcw size={16} />
                  <span>Re-scan / Remove</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenBulkConfirm}
                  disabled={isSaving || readyCount === 0 || !examName.trim() || !examDate}
                  style={{
                    background: readyCount > 0 ? "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)" : "rgba(255, 255, 255, 0.05)",
                    color: readyCount > 0 ? "#ffffff" : "var(--text-secondary)",
                    border: "none",
                    boxShadow: readyCount > 0 ? "0 4px 12px rgba(59, 130, 246, 0.35)" : "none",
                    opacity: readyCount === 0 ? 0.6 : 1,
                    cursor: readyCount > 0 ? "pointer" : "not-allowed",
                  }}
                  title={
                    readyCount === 0
                      ? "No students currently ready for bulk dispatch"
                      : `Verify and dispatch all ${readyCount} ready students to parents`
                  }
                >
                  <CheckCircle2 size={18} />
                  <span>{isSaving ? "Dispatching..." : `Verify All Ready Students (${readyCount})`}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleVerifyAndDispatchStudent()}
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

      {/* 1. Bulk Dispatch Confirmation Modal */}
      {isBulkConfirmOpen && (
        <div className={styles.modalOverlay} onClick={() => !isSaving && setIsBulkConfirmOpen(false)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Confirm Bulk Dispatch to Parents</h3>
                <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                  {examName} &bull; Class {currentClass?.name} - {currentClass?.section} &bull; {readyStudentsList.filter(s => s.isReady).length} Student(s) Ready
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkConfirmOpen(false)}
                disabled={isSaving}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Warnings Section */}
              {(() => {
                const targetReady = readyStudentsList.filter(s => s.isReady);
                const missingParents = targetReady.filter(s => !s.hasLinkedParent);
                const skippedCount = readyStudentsList.length - targetReady.length;

                return (
                  <>
                    {missingParents.length > 0 && (
                      <div style={{
                        background: "rgba(245, 158, 11, 0.12)",
                        border: "1px solid #f59e0b",
                        borderRadius: "10px",
                        padding: "0.75rem 1rem",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.6rem",
                        fontSize: "0.84rem",
                        color: "#fbbf24"
                      }}>
                        <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
                        <div>
                          <strong>{missingParents.length} student(s) have no linked parents:</strong>
                          <div style={{ marginTop: "0.25rem", color: "var(--foreground)" }}>
                            {missingParents.map(s => `${s.studentName} (${s.rollNumber || "No Roll"})`).join(", ")}
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                            These report cards will be securely saved to history, but no parent notifications can be delivered.
                          </div>
                        </div>
                      </div>
                    )}

                    {skippedCount > 0 && (
                      <div style={{
                        background: "rgba(59, 130, 246, 0.1)",
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                        borderRadius: "10px",
                        padding: "0.6rem 0.85rem",
                        fontSize: "0.82rem",
                        color: "var(--text-secondary)"
                      }}>
                        ℹ️ <strong>{skippedCount} student(s)</strong> are incomplete or have unverified marks and will be skipped. You can review and dispatch them individually.
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Ready Students Preview Table */}
              <div style={{ border: "1px solid var(--border-color)", borderRadius: "10px", overflowX: "auto", WebkitOverflowScrolling: "touch", width: "100%" }}>
                <table style={{ width: "100%", minWidth: "640px", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead style={{ background: "rgba(255, 255, 255, 0.04)" }}>
                    <tr>
                      <th style={{ padding: "0.55rem 0.75rem", textAlign: "left", fontWeight: 700, minWidth: "150px", whiteSpace: "nowrap" }}>Student Name</th>
                      <th style={{ padding: "0.55rem 0.75rem", textAlign: "left", fontWeight: 700, minWidth: "110px", whiteSpace: "nowrap" }}>Roll No</th>
                      <th style={{ padding: "0.55rem 0.75rem", textAlign: "center", fontWeight: 700, minWidth: "75px", whiteSpace: "nowrap" }}>Total</th>
                      <th style={{ padding: "0.55rem 0.75rem", textAlign: "center", fontWeight: 700, minWidth: "60px", whiteSpace: "nowrap" }}>%</th>
                      <th style={{ padding: "0.55rem 0.75rem", textAlign: "center", fontWeight: 700, minWidth: "65px", whiteSpace: "nowrap" }}>Grade</th>
                      <th style={{ padding: "0.55rem 0.75rem", textAlign: "center", fontWeight: 700, minWidth: "80px", whiteSpace: "nowrap" }}>Result</th>
                      <th style={{ padding: "0.55rem 0.75rem", textAlign: "center", fontWeight: 700, minWidth: "85px", whiteSpace: "nowrap" }}>Parents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readyStudentsList.filter(s => s.isReady).map((st) => (
                      <tr key={st.studentId} style={{ borderTop: "1px solid var(--border-color)" }}>
                        <td style={{ padding: "0.55rem 0.75rem", fontWeight: 700, whiteSpace: "nowrap" }}>{st.studentName}</td>
                        <td style={{ padding: "0.55rem 0.75rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{st.rollNumber || "-"}</td>
                        <td style={{ padding: "0.55rem 0.75rem", textAlign: "center", fontWeight: 800, whiteSpace: "nowrap" }}>{st.totalScore}/{st.maxTotal}</td>
                        <td style={{ padding: "0.55rem 0.75rem", textAlign: "center", fontWeight: 700, whiteSpace: "nowrap" }}>{st.percentage}%</td>
                        <td style={{ padding: "0.55rem 0.75rem", textAlign: "center", fontWeight: 900, color: st.grade === "F" ? "#ef4444" : "#10b981", whiteSpace: "nowrap" }}>{st.grade}</td>
                        <td style={{ padding: "0.55rem 0.75rem", textAlign: "center", whiteSpace: "nowrap" }}>
                          <span style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "0.72rem",
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                            background: st.result === "PASS" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                            color: st.result === "PASS" ? "#10b981" : "#ef4444"
                          }}>
                            {st.result}
                          </span>
                        </td>
                        <td style={{ padding: "0.55rem 0.75rem", textAlign: "center", color: st.hasLinkedParent ? "#10b981" : "#f59e0b", whiteSpace: "nowrap" }}>
                          {st.parentCount > 0 ? `${st.parentCount} linked` : "None"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Required Verification Checkbox */}
              <label style={{
                display: "flex",
                alignItems: "center",
                gap: "0.65rem",
                cursor: "pointer",
                padding: "0.75rem 1rem",
                borderRadius: "10px",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid var(--border-color)",
                fontSize: "0.86rem",
                fontWeight: 700,
                color: "var(--foreground)"
              }}>
                <input
                  type="checkbox"
                  checked={hasCheckedBulkMarks}
                  onChange={e => setHasCheckedBulkMarks(e.target.checked)}
                  style={{ width: "18px", height: "18px", accentColor: "#10b981", cursor: "pointer" }}
                />
                <span>I have checked these marks and verify they are accurate for official dispatch.</span>
              </label>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => setIsBulkConfirmOpen(false)}
                disabled={isSaving}
                style={{
                  padding: "0.55rem 1.15rem",
                  borderRadius: "10px",
                  background: "transparent",
                  border: "1px solid var(--border-color)",
                  color: "var(--foreground)",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkDispatch}
                disabled={!hasCheckedBulkMarks || isSaving}
                style={{
                  padding: "0.55rem 1.35rem",
                  borderRadius: "10px",
                  background: hasCheckedBulkMarks ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "rgba(255, 255, 255, 0.05)",
                  color: hasCheckedBulkMarks ? "#ffffff" : "var(--text-secondary)",
                  border: "none",
                  fontWeight: 800,
                  cursor: hasCheckedBulkMarks ? "pointer" : "not-allowed",
                  boxShadow: hasCheckedBulkMarks ? "0 4px 12px rgba(16, 185, 129, 0.35)" : "none",
                }}
              >
                Confirm &amp; Dispatch ({readyStudentsList.filter(s => s.isReady).length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Bulk Dispatch Progress Modal */}
      {isBulkProgressOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard} style={{ maxWidth: "480px" }}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Dispatching Report Cards...</h3>
            </div>
            <div className={styles.modalBody} style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
              <div className={styles.progressBarContainer}>
                <div className={styles.progressBarFill} style={{ width: `${bulkProgressPercent}%` }} />
              </div>
              <p style={{ marginTop: "1rem", fontSize: "0.9rem", color: "var(--foreground)", fontWeight: 700 }}>
                {bulkProgressText}
              </p>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                Processing individual student transactions. Please keep this window open.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Bulk Dispatch Summary Modal */}
      {isBulkSummaryOpen && bulkSummary && (
        <div className={styles.modalOverlay} onClick={() => setIsBulkSummaryOpen(false)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Dispatch Complete</h3>
                <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                  {examName} &bull; Class {currentClass?.name} - {currentClass?.section}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkSummaryOpen(false)}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Summary Stats Grid */}
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <div className={styles.summaryStatCard}>
                  <div className={styles.summaryStatNumber} style={{ color: "#10b981" }}>
                    {bulkSummary.dispatchedCount}
                  </div>
                  <div className={styles.summaryStatLabel}>Dispatched</div>
                </div>
                <div className={styles.summaryStatCard}>
                  <div className={styles.summaryStatNumber} style={{ color: "#3b82f6" }}>
                    {bulkSummary.parentsNotifiedCount}
                  </div>
                  <div className={styles.summaryStatLabel}>Parents Notified</div>
                </div>
                {bulkSummary.missingParentsCount > 0 && (
                  <div className={styles.summaryStatCard}>
                    <div className={styles.summaryStatNumber} style={{ color: "#f59e0b" }}>
                      {bulkSummary.missingParentsCount}
                    </div>
                    <div className={styles.summaryStatLabel}>No Parent Linked</div>
                  </div>
                )}
                {bulkSummary.failedCount > 0 && (
                  <div className={styles.summaryStatCard}>
                    <div className={styles.summaryStatNumber} style={{ color: "#ef4444" }}>
                      {bulkSummary.failedCount}
                    </div>
                    <div className={styles.summaryStatLabel}>Failed</div>
                  </div>
                )}
              </div>

              {/* Missing Parents Warning Banner */}
              {bulkSummary.missingParentStudentNames.length > 0 && (
                <div style={{
                  background: "rgba(245, 158, 11, 0.12)",
                  border: "1px solid #f59e0b",
                  borderRadius: "10px",
                  padding: "0.75rem 1rem",
                  fontSize: "0.82rem",
                  color: "#fbbf24"
                }}>
                  <strong>Note:</strong> The following students have no linked parents: {bulkSummary.missingParentStudentNames.join(", ")}. Their marks are stored in history and accessible to school staff.
                </div>
              )}

              {/* Failed Students Details if any */}
              {bulkSummary.failedCount > 0 && (
                <div style={{
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid #ef4444",
                  borderRadius: "10px",
                  padding: "0.75rem 1rem",
                  fontSize: "0.82rem",
                  color: "#ef4444"
                }}>
                  {bulkSummary.results.filter(r => !r.success).map((r, i) => (
                    <div key={i}>{r.studentName}: {r.error}</div>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.modalFooter} style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                <a
                  href={`/api/pdf/report-card?examId=${bulkSummary.examId || ""}&classId=${activeClassId}&type=class&download=true`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    padding: "0.55rem 1rem",
                    borderRadius: "10px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid var(--border-color)",
                    color: "var(--foreground)",
                    fontSize: "0.84rem",
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  <Download size={15} />
                  <span>Download PDF</span>
                </a>

                <button
                  type="button"
                  onClick={handleExportExcelFromSummary}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    padding: "0.55rem 1rem",
                    borderRadius: "10px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid var(--border-color)",
                    color: "var(--foreground)",
                    fontSize: "0.84rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <FileSpreadsheet size={15} />
                  <span>Download Excel</span>
                </button>

                {bulkSummary.failedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleRetryFailedOnly}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      padding: "0.55rem 1rem",
                      borderRadius: "10px",
                      background: "rgba(239, 68, 68, 0.15)",
                      border: "1px solid #ef4444",
                      color: "#f87171",
                      fontSize: "0.84rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    <RotateCcw size={15} />
                    <span>Retry Failed ({bulkSummary.failedCount})</span>
                  </button>
                )}
              </div>

              <div style={{ display: "flex", gap: "0.6rem" }}>
                {onSwitchToHistory && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsBulkSummaryOpen(false);
                      onSwitchToHistory();
                    }}
                    style={{
                      padding: "0.55rem 1.15rem",
                      borderRadius: "10px",
                      background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                      color: "#ffffff",
                      border: "none",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    View in History
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsBulkSummaryOpen(false)}
                  style={{
                    padding: "0.55rem 1.15rem",
                    borderRadius: "10px",
                    background: "var(--border-color)",
                    color: "var(--foreground)",
                    border: "none",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Revision Reason Modal */}
      {isRevisionModalOpen && revisionStudent && (
        <div className={styles.modalOverlay} onClick={() => !isSaving && setIsRevisionModalOpen(false)}>
          <div className={styles.modalCard} style={{ maxWidth: "520px" }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Update Dispatched Report Card</h3>
              <button
                type="button"
                onClick={() => setIsRevisionModalOpen(false)}
                disabled={isSaving}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--foreground)" }}>
                A report card for <strong>{revisionStudent.studentName}</strong> ({revisionStudent.rollNumber}) has already been dispatched (Revision {revisionStudent.revision}).
              </p>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                To record this modification with full audit integrity and notify the parent of the update, please enter the reason for this revision:
              </p>

              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.3rem", color: "var(--text-secondary)" }}>
                  Reason for Update / Correction (Required):
                </label>
                <textarea
                  rows={3}
                  value={revisionReasonText}
                  onChange={e => setRevisionReasonText(e.target.value)}
                  placeholder="e.g., Re-evaluation of Mathematics answer sheet; recalculated marks."
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "10px",
                    border: "1px solid var(--border-color)",
                    background: "var(--input-bg, #0f172a)",
                    color: "var(--foreground)",
                    fontSize: "0.88rem",
                    boxSizing: "border-box"
                  }}
                />
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => setIsRevisionModalOpen(false)}
                disabled={isSaving}
                style={{
                  padding: "0.55rem 1.15rem",
                  borderRadius: "10px",
                  background: "transparent",
                  border: "1px solid var(--border-color)",
                  color: "var(--foreground)",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRevision}
                disabled={!revisionReasonText.trim() || isSaving}
                style={{
                  padding: "0.55rem 1.35rem",
                  borderRadius: "10px",
                  background: revisionReasonText.trim() ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" : "rgba(255, 255, 255, 0.05)",
                  color: revisionReasonText.trim() ? "#ffffff" : "var(--text-secondary)",
                  border: "none",
                  fontWeight: 800,
                  cursor: revisionReasonText.trim() ? "pointer" : "not-allowed",
                }}
              >
                Confirm &amp; Update Revision {revisionStudent.revision + 1}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Re-scan / Remove Confirmation Modal */}
      {isRescanConfirmOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsRescanConfirmOpen(false)}>
          <div className={styles.modalCard} style={{ maxWidth: "460px" }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Remove Scanned Document?</h3>
              <button
                type="button"
                onClick={() => setIsRescanConfirmOpen(false)}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--foreground)" }}>
                Are you sure you want to remove the uploaded document and re-scan?
              </p>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                All unsaved extracted marks and student entries will be immediately released from memory. Dispatched records in the database remain safe.
              </p>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => setIsRescanConfirmOpen(false)}
                style={{
                  padding: "0.55rem 1.15rem",
                  borderRadius: "10px",
                  background: "transparent",
                  border: "1px solid var(--border-color)",
                  color: "var(--foreground)",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteRescanAndRemove}
                style={{
                  padding: "0.55rem 1.35rem",
                  borderRadius: "10px",
                  background: "#ef4444",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Remove &amp; Re-scan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
