import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { extractWithGemini } from "@/backend/api/actions/dashboard/teacher/report-cards/extractReportCardGemini";
import { parseTextToReportCard } from "@/backend/api/actions/dashboard/teacher/report-cards/scanReportCardUtils";

// In-memory rate limiting map: userId -> [timestamp array]
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) || [];
  const validTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  validTimestamps.push(now);
  rateLimitMap.set(userId, validTimestamps);
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user?.role !== "TEACHER") {
      return NextResponse.json({ error: "Unauthorized: Teacher access required" }, { status: 401 });
    }

    const userId = session.user.id;
    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { error: "Too many extraction requests. Please wait a moment before trying again." },
        { status: 429 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const classId = formData.get("classId") as string | null;
    const clientOcrText = (formData.get("clientOcrText") as string | null) || "";
    const defaultMaxMarks = parseInt(formData.get("defaultMaxMarks") as string || "100", 10);
    const defaultPassMarks = parseInt(formData.get("defaultPassMarks") as string || "35", 10);

    if (!file) {
      return NextResponse.json({ error: "No document file provided." }, { status: 400 });
    }

    if (!classId) {
      return NextResponse.json({ error: "Class ID is required." }, { status: 400 });
    }

    // Authorization check: Verify teacher teaches this class
    const teacher = await prisma.teacher.findUnique({
      where: { userId },
      include: {
        classes: { select: { id: true } },
        classTeacherOf: { select: { id: true } }
      }
    });

    if (!teacher) {
      return NextResponse.json({ error: "Teacher profile not found." }, { status: 403 });
    }

    const authorizedClassIds = new Set([
      ...(teacher.classes || []).map(c => c.id),
      ...(teacher.classTeacherOf ? [teacher.classTeacherOf.id] : [])
    ]);

    if (!authorizedClassIds.has(classId)) {
      return NextResponse.json({ error: "Unauthorized: You are not assigned to this class." }, { status: 403 });
    }

    // Fetch class subjects and students
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
      return NextResponse.json({ error: "Target class not found." }, { status: 404 });
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

    // In-memory buffer extraction
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = file.name.toLowerCase();
    const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|bmp)$/i.test(fileName);
    const isPdf = file.type === "application/pdf" || fileName.endsWith(".pdf");
    const isExcel = /\.(xlsx|xls|csv)$/i.test(fileName);
    const isWord = /\.(docx|doc)$/i.test(fileName);

    let extractionResult: any = null;

    // 1. Try Gemini Vision for images
    if (isImage) {
      const geminiResult = await extractWithGemini({
        buffer,
        mimeType: file.type || "image/jpeg",
        classSubjects,
        classStudents,
        customDefaults: { defaultMaxMarks, defaultPassMarks }
      });

      if (geminiResult && geminiResult.detectedStudents.length > 0) {
        extractionResult = geminiResult;
      }
    }

    // 1b. Fallback for images if Gemini Vision is unavailable: in-memory Tesseract OCR
    if (!extractionResult && isImage) {
      try {
        const path = await import("path");
        const workerPath = path.join(process.cwd(), "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js");
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng", 1, { workerPath });
        const ret = await worker.recognize(buffer);
        await worker.terminate();
        const text = ret?.data?.text || "";
        if (text && text.trim().length > 10) {
          const parsed = parseTextToReportCard(
            text,
            classSubjects,
            classStudents,
            { defaultMaxMarks, defaultPassMarks }
          );
          if (parsed.allDetectedStudents && parsed.allDetectedStudents.length > 0) {
            extractionResult = {
              success: true,
              detectedStudents: parsed.allDetectedStudents,
              examName: parsed.examName,
              examDate: parsed.examDate,
              docTotal: parsed.docTotal,
              docPercentage: parsed.docPercentage
            };
          }
        }
      } catch (ocrErr) {
        console.warn("Server-side image OCR fallback notice:", ocrErr);
      }
    }

    // 2. If PDF, extract text in-memory using unpdf
    if (!extractionResult && isPdf) {
      try {
        const { extractText } = await import("unpdf");
        const pdfData = await extractText(new Uint8Array(buffer));
        const fullText = (pdfData.text || []).join("\n");
        if (fullText && fullText.trim().length > 10) {
          const parsed = parseTextToReportCard(
            fullText,
            classSubjects,
            classStudents,
            { defaultMaxMarks, defaultPassMarks }
          );
          extractionResult = {
            success: true,
            detectedStudents: parsed.allDetectedStudents,
            examName: parsed.examName,
            examDate: parsed.examDate,
            docTotal: parsed.docTotal,
            docPercentage: parsed.docPercentage
          };
        }
      } catch (pdfErr) {
        console.warn("PDF in-memory parsing failed:", pdfErr);
      }
    }

    // 3. If Excel or CSV, parse workbook in-memory using xlsx
    if (!extractionResult && isExcel) {
      try {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const csvText = XLSX.utils.sheet_to_csv(sheet);
        if (csvText && csvText.trim().length > 10) {
          const parsed = parseTextToReportCard(
            csvText,
            classSubjects,
            classStudents,
            { defaultMaxMarks, defaultPassMarks }
          );
          extractionResult = {
            success: true,
            detectedStudents: parsed.allDetectedStudents,
            examName: parsed.examName,
            examDate: parsed.examDate,
            docTotal: parsed.docTotal,
            docPercentage: parsed.docPercentage
          };
        }
      } catch (xlErr) {
        console.warn("Excel in-memory parsing failed:", xlErr);
      }
    }

    // 4. If Word docx, parse text in-memory using mammoth
    if (!extractionResult && isWord) {
      try {
        const mammoth = await import("mammoth");
        const docResult = await mammoth.extractRawText({ buffer });
        const text = docResult?.value || "";
        if (text.trim().length > 10) {
          const parsed = parseTextToReportCard(
            text,
            classSubjects,
            classStudents,
            { defaultMaxMarks, defaultPassMarks }
          );
          extractionResult = {
            success: true,
            detectedStudents: parsed.allDetectedStudents,
            examName: parsed.examName,
            examDate: parsed.examDate,
            docTotal: parsed.docTotal,
            docPercentage: parsed.docPercentage
          };
        }
      } catch (wordErr) {
        console.warn("Word in-memory parsing failed:", wordErr);
      }
    }

    // 5. Fallback: If client provided OCR text from Tesseract
    if (!extractionResult && clientOcrText && clientOcrText.trim().length > 10) {
      const parsed = parseTextToReportCard(
        clientOcrText,
        classSubjects,
        classStudents,
        { defaultMaxMarks, defaultPassMarks }
      );
      extractionResult = {
        success: true,
        detectedStudents: parsed.allDetectedStudents,
        examName: parsed.examName,
        examDate: parsed.examDate,
        docTotal: parsed.docTotal,
        docPercentage: parsed.docPercentage
      };
    }

    // 6. Graceful fallback if nothing could be parsed: return empty structure for manual review
    if (!extractionResult || !extractionResult.detectedStudents || extractionResult.detectedStudents.length === 0) {
      const defaultSubjects = classSubjects.map((cs, idx) => ({
        id: `subj-${Date.now()}-${idx}`,
        subjectId: cs.id,
        subjectName: cs.name,
        score: "" as const,
        maxScore: cs.maxMarks || defaultMaxMarks,
        passMarks: cs.passMarks || defaultPassMarks,
        remarks: "",
        grade: "-",
        status: "NEEDS_REVIEW" as const
      }));

      const fallbackStudent = classStudents[0];
      extractionResult = {
        success: true,
        detectedStudents: [
          {
            studentId: fallbackStudent?.id || "",
            studentName: fallbackStudent?.name || "Student",
            rollNumber: fallbackStudent?.rollNumber || "",
            subjects: defaultSubjects
          }
        ],
        allDetectedStudents: [
          {
            studentId: fallbackStudent?.id || "",
            studentName: fallbackStudent?.name || "Student",
            rollNumber: fallbackStudent?.rollNumber || "",
            subjects: defaultSubjects
          }
        ],
        examName: "Midterm Examination",
        examDate: new Date().toISOString().split("T")[0]
      };
    }

    const rawDetectedList: any[] = extractionResult.allDetectedStudents || extractionResult.detectedStudents || [];
    const withScores = rawDetectedList.filter(
      (st: any) => st.subjects && st.subjects.some((s: any) => s.score !== "" && s.score !== null && s.score !== undefined)
    );
    const validList = withScores.length > 0 ? withScores : rawDetectedList;
    const firstStudent = validList.find((st: any) => st.studentId) || validList[0];

    return NextResponse.json({
      success: true,
      fileDetails: {
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size
      },
      studentId: firstStudent?.studentId || "",
      studentName: firstStudent?.studentName || "",
      rollNumber: firstStudent?.rollNumber || "",
      extractedName: firstStudent?.extractedName || firstStudent?.studentName || "",
      studentConfidence: firstStudent?.studentId ? "HIGH" : "NONE",
      examName: extractionResult.examName || "Midterm Examination",
      examDate: extractionResult.examDate || new Date().toISOString().split("T")[0],
      academicYear: extractionResult.academicYear || "2026-2027",
      defaultMaxMarks,
      defaultPassMarks,
      attendance: firstStudent?.attendance ?? null,
      generalRemarks: firstStudent?.remarks || "",
      subjects: firstStudent?.subjects || [],
      allDetectedStudents: validList,
      detectedStudents: validList,
      docTotal: firstStudent?.docTotal ?? extractionResult.docTotal,
      docPercentage: firstStudent?.docPercentage ?? extractionResult.docPercentage
    });
  } catch (err: any) {
    console.error("Report card extraction API error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal document extraction error." },
      { status: 500 }
    );
  }
}

