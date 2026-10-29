"use server";

import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import type {
  ScanReportCardResult,
  ScannedReportCardSubject,
  DetectedStudentEntry
} from "./scanReportCardTypes";
import {
  parseTextToReportCard
} from "./scanReportCardUtils";
import { extractWithGemini } from "./extractReportCardGemini";

// Rate limiting map for Server Action
const actionRateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = actionRateLimitMap.get(userId) || [];
  const validTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  validTimestamps.push(now);
  actionRateLimitMap.set(userId, validTimestamps);
  return true;
}

export async function scanReportCardAction(formData: FormData): Promise<ScanReportCardResult> {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user?.role !== "TEACHER") {
      return {
        success: false,
        error: "Unauthorized: Teacher access required",
        fileDetails: { name: "", type: "", size: 0 },
        studentId: "",
        studentName: "",
        rollNumber: "",
        studentConfidence: "NONE",
        examName: "Midterm Examination",
        examDate: new Date().toISOString().split("T")[0],
        defaultMaxMarks: 100,
        defaultPassMarks: 35,
        generalRemarks: "",
        subjects: []
      };
    }

    const userId = session.user.id;
    if (!checkRateLimit(userId)) {
      return {
        success: false,
        error: "Too many extraction requests. Please wait a moment before trying again.",
        fileDetails: { name: "", type: "", size: 0 },
        studentId: "",
        studentName: "",
        rollNumber: "",
        studentConfidence: "NONE",
        examName: "Midterm Examination",
        examDate: new Date().toISOString().split("T")[0],
        defaultMaxMarks: 100,
        defaultPassMarks: 35,
        generalRemarks: "",
        subjects: []
      };
    }

    const file = formData.get("file") as File | null;
    const classId = formData.get("classId") as string | null;
    const clientOcrText = (formData.get("clientOcrText") as string | null) || "";
    const defaultMaxMarks = parseInt(formData.get("defaultMaxMarks") as string || "100", 10);
    const defaultPassMarks = parseInt(formData.get("defaultPassMarks") as string || "35", 10);

    if (!file) {
      return {
        success: false,
        error: "No file was uploaded.",
        fileDetails: { name: "", type: "", size: 0 },
        studentId: "",
        studentName: "",
        rollNumber: "",
        studentConfidence: "NONE",
        examName: "Midterm Examination",
        examDate: new Date().toISOString().split("T")[0],
        defaultMaxMarks: 100,
        defaultPassMarks: 35,
        generalRemarks: "",
        subjects: []
      };
    }

    if (!classId) {
      return {
        success: false,
        error: "Target class was not selected.",
        fileDetails: { name: file.name, type: file.type, size: file.size },
        studentId: "",
        studentName: "",
        rollNumber: "",
        studentConfidence: "NONE",
        examName: "Midterm Examination",
        examDate: new Date().toISOString().split("T")[0],
        defaultMaxMarks: 100,
        defaultPassMarks: 35,
        generalRemarks: "",
        subjects: []
      };
    }

    // Verify Teacher access to class
    const teacher = await prisma.teacher.findUnique({
      where: { userId },
      include: {
        classes: { select: { id: true } },
        classTeacherOf: { select: { id: true } }
      }
    });

    if (!teacher) {
      return {
        success: false,
        error: "Teacher profile not found.",
        fileDetails: { name: file.name, type: file.type, size: file.size },
        studentId: "",
        studentName: "",
        rollNumber: "",
        studentConfidence: "NONE",
        examName: "Midterm Examination",
        examDate: new Date().toISOString().split("T")[0],
        defaultMaxMarks: 100,
        defaultPassMarks: 35,
        generalRemarks: "",
        subjects: []
      };
    }

    const authorizedClassIds = new Set([
      ...(teacher.classes || []).map(c => c.id),
      ...(teacher.classTeacherOf ? [teacher.classTeacherOf.id] : [])
    ]);

    if (!authorizedClassIds.has(classId)) {
      return {
        success: false,
        error: "You are not authorized to manage report cards for this class.",
        fileDetails: { name: file.name, type: file.type, size: file.size },
        studentId: "",
        studentName: "",
        rollNumber: "",
        studentConfidence: "NONE",
        examName: "Midterm Examination",
        examDate: new Date().toISOString().split("T")[0],
        defaultMaxMarks: 100,
        defaultPassMarks: 35,
        generalRemarks: "",
        subjects: []
      };
    }

    const targetClass = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        subjects: { orderBy: { name: "asc" } },
        students: {
          where: { isActive: true },
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }]
        }
      }
    });

    if (!targetClass) {
      return {
        success: false,
        error: "Class not found in database.",
        fileDetails: { name: file.name, type: file.type, size: file.size },
        studentId: "",
        studentName: "",
        rollNumber: "",
        studentConfidence: "NONE",
        examName: "Midterm Examination",
        examDate: new Date().toISOString().split("T")[0],
        defaultMaxMarks: 100,
        defaultPassMarks: 35,
        generalRemarks: "",
        subjects: []
      };
    }

    const classSubjects = (targetClass.subjects || []).map(s => ({
      id: s.id,
      name: s.name,
      maxMarks: s.maxMarks || defaultMaxMarks,
      passMarks: s.passMarks || defaultPassMarks
    }));

    const classStudents = (targetClass.students || []).map(st => ({
      id: st.id,
      rollNumber: st.rollNumber,
      name: `${st.firstName || ""} ${st.lastName || ""}`.trim() || "Student"
    }));

    // In-memory file processing
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = file.name.toLowerCase();
    const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|bmp)$/i.test(fileName);
    const isPdf = file.type === "application/pdf" || fileName.endsWith(".pdf");
    const isExcel = /\.(xlsx|xls|csv)$/i.test(fileName);
    const isWord = /\.(docx|doc)$/i.test(fileName);

    let extractedData: any = null;

    if (isImage) {
      const geminiRes = await extractWithGemini({
        buffer,
        mimeType: file.type || "image/jpeg",
        classSubjects,
        classStudents,
        customDefaults: { defaultMaxMarks, defaultPassMarks }
      });
      if (geminiRes && geminiRes.detectedStudents.length > 0) {
        extractedData = geminiRes;
      }
    }

    if (!extractedData && isPdf) {
      try {
        const { extractText } = await import("unpdf");
        const pdfData = await extractText(new Uint8Array(buffer));
        const fullText = (pdfData.text || []).join("\n");
        if (fullText.trim().length > 10) {
          const parsed = parseTextToReportCard(fullText, classSubjects, classStudents, { defaultMaxMarks, defaultPassMarks });
          extractedData = {
            detectedStudents: parsed.allDetectedStudents,
            examName: parsed.examName,
            examDate: parsed.examDate,
            docTotal: parsed.docTotal,
            docPercentage: parsed.docPercentage
          };
        }
      } catch (e) {
        console.warn("PDF parse error:", e);
      }
    }

    if (!extractedData && isExcel) {
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buffer, { type: "buffer" });
        const text = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
        if (text.trim().length > 10) {
          const parsed = parseTextToReportCard(text, classSubjects, classStudents, { defaultMaxMarks, defaultPassMarks });
          extractedData = {
            detectedStudents: parsed.allDetectedStudents,
            examName: parsed.examName,
            examDate: parsed.examDate,
            docTotal: parsed.docTotal,
            docPercentage: parsed.docPercentage
          };
        }
      } catch (e) {
        console.warn("Excel parse error:", e);
      }
    }

    if (!extractedData && isWord) {
      try {
        const mammoth = await import("mammoth");
        const res = await mammoth.extractRawText({ buffer });
        if (res?.value?.trim()?.length > 10) {
          const parsed = parseTextToReportCard(res.value, classSubjects, classStudents, { defaultMaxMarks, defaultPassMarks });
          extractedData = {
            detectedStudents: parsed.allDetectedStudents,
            examName: parsed.examName,
            examDate: parsed.examDate,
            docTotal: parsed.docTotal,
            docPercentage: parsed.docPercentage
          };
        }
      } catch (e) {
        console.warn("Word parse error:", e);
      }
    }

    if (!extractedData && clientOcrText.trim().length > 10) {
      const parsed = parseTextToReportCard(clientOcrText, classSubjects, classStudents, { defaultMaxMarks, defaultPassMarks });
      extractedData = {
        detectedStudents: parsed.allDetectedStudents,
        examName: parsed.examName,
        examDate: parsed.examDate,
        docTotal: parsed.docTotal,
        docPercentage: parsed.docPercentage
      };
    }

    // Default fallback if parsing produced no students
    if (!extractedData || !extractedData.detectedStudents || extractedData.detectedStudents.length === 0) {
      const defaultSubjects: ScannedReportCardSubject[] = classSubjects.map((cs, idx) => ({
        id: `subj-${Date.now()}-${idx}`,
        subjectId: cs.id,
        subjectName: cs.name,
        score: "",
        maxScore: cs.maxMarks || defaultMaxMarks,
        passMarks: cs.passMarks || defaultPassMarks,
        remarks: "",
        grade: "-",
        status: "NEEDS_REVIEW"
      }));

      const firstSt = classStudents[0];
      return {
        success: true,
        fileDetails: { name: file.name, type: file.type, size: file.size },
        studentId: firstSt?.id || "",
        studentName: firstSt?.name || "",
        rollNumber: firstSt?.rollNumber || "",
        studentConfidence: "NONE",
        examName: "Midterm Examination",
        examDate: new Date().toISOString().split("T")[0],
        defaultMaxMarks,
        defaultPassMarks,
        generalRemarks: "",
        subjects: defaultSubjects,
        allDetectedStudents: [
          {
            studentId: firstSt?.id || "",
            studentName: firstSt?.name || "Student",
            rollNumber: firstSt?.rollNumber || "",
            subjects: defaultSubjects
          }
        ]
      };
    }

    const first = extractedData.detectedStudents[0];

    return {
      success: true,
      fileDetails: { name: file.name, type: file.type, size: file.size },
      studentId: first?.studentId || "",
      studentName: first?.studentName || "",
      rollNumber: first?.rollNumber || "",
      studentConfidence: first?.studentId ? "HIGH" : "NONE",
      examName: extractedData.examName || "Midterm Examination",
      examDate: extractedData.examDate || new Date().toISOString().split("T")[0],
      defaultMaxMarks,
      defaultPassMarks,
      generalRemarks: first?.remarks || "",
      subjects: first?.subjects || [],
      allDetectedStudents: extractedData.detectedStudents,
      docTotal: extractedData.docTotal,
      docPercentage: extractedData.docPercentage
    };
  } catch (err: any) {
    console.error("scanReportCardAction unexpected error:", err);
    return {
      success: false,
      error: err?.message || "Internal server error scanning report card.",
      fileDetails: { name: "", type: "", size: 0 },
      studentId: "",
      studentName: "",
      rollNumber: "",
      studentConfidence: "NONE",
      examName: "Midterm Examination",
      examDate: new Date().toISOString().split("T")[0],
      defaultMaxMarks: 100,
      defaultPassMarks: 35,
      generalRemarks: "",
      subjects: []
    };
  }
}

