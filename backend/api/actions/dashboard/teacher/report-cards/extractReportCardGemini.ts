import { z } from "zod";
import type {
  ScannedReportCardSubject,
  DetectedStudentEntry,
  StructuredExtractionResult
} from "./scanReportCardTypes";
import {
  matchSubject,
  matchStudent,
  computeGrade,
  cleanString,
  normalizeSubjectName,
  parseScoreNumber,
  mergeStudentSubjects,
  toNumber
} from "./scanReportCardUtils";

export { normalizeSubjectName };

const GeminiStudentSchema = z.object({
  studentName: z.string(),
  rollNumber: z.string().optional().default(""),
  attendance: z.union([z.string(), z.number()]).nullable().optional(),
  subjects: z.array(
    z.object({
      subjectName: z.string(),
      marksScored: z.union([z.number(), z.null()]).optional(),
      marksObtained: z.union([z.number(), z.null()]).optional(),
      maxMarks: z.number().optional().default(100),
      passMarks: z.number().optional().default(35),
      remarks: z.string().optional().default("")
    })
  ),
  totalMarks: z.union([z.number(), z.null()]).optional(),
  percentage: z.union([z.number(), z.null()]).optional(),
  grade: z.string().nullable().optional(),
  teacherRemarks: z.string().nullable().optional()
});

const GeminiOutputSchema = z.object({
  examName: z.string().optional().default("Midterm Examination"),
  examDate: z.string().optional().default(""),
  academicYear: z.string().optional().default("2026-2027"),
  students: z.array(GeminiStudentSchema)
});

interface GeminiExtractionOptions {
  buffer: Buffer;
  mimeType: string;
  classSubjects: Array<{ id: string; name: string; maxMarks?: number; passMarks?: number }>;
  classStudents: Array<{ id: string; rollNumber: string; name: string }>;
  customDefaults?: { defaultMaxMarks?: number; defaultPassMarks?: number };
}

/**
 * Extracts student marks and metadata from an image buffer using Google Gemini Vision.
 * In-memory execution only: image buffer is never saved to disk, DB, or external storage.
 */
export async function extractWithGemini(options: GeminiExtractionOptions): Promise<{
  success: boolean;
  detectedStudents: DetectedStudentEntry[];
  allDetectedStudents: DetectedStudentEntry[];
  examName: string;
  examDate: string;
  academicYear: string;
  docTotal?: number;
  docPercentage?: number;
} | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const { buffer, mimeType, classSubjects, classStudents, customDefaults } = options;

  const base64Data = buffer.toString("base64");

  const prompt = `
You are an expert school document OCR and gradebook data extraction parser.
Analyze this academic report card or marksheet image carefully.

TABLE EXTRACTION INSTRUCTIONS:
1. Read the table. Each row is a student. Columns are S.No, Student Name, Roll No, then one column per subject (Tamil, English, Maths, Science, Social), then Total and Percentage.
2. Return every row. Return each subject mark as a number. Return null only if truly unreadable.
3. Do not return the Total or Percentage columns as subjects.
4. NORMALIZE subject names: Maths -> MATHEMATICS, Social -> SOCIAL SCIENCE, Tamil -> TAMIL, English -> ENGLISH, Science -> SCIENCE.
5. DO NOT confuse 'S.No' (serial number 1, 2, 3...) with marks scored! S.No is just a row index.
6. Extract printed Total Marks, Percentage, and Exam Term/Date if visible.

Return ONLY a valid JSON object matching this exact schema:
{
  "examName": "Midterm Examination",
  "examDate": "2026-10-29",
  "academicYear": "2026-2027",
  "students": [
    {
      "studentName": string,
      "rollNumber": string,
      "attendance": string or null,
      "subjects": [
        {
          "subjectName": string,
          "marksScored": number or null,
          "marksObtained": number or null,
          "maxMarks": number,
          "passMarks": number,
          "remarks": string
        }
      ],
      "totalMarks": number or null,
      "percentage": number or null,
      "grade": string or null,
      "teacherRemarks": string or null
    }
  ]
}
No markdown backticks, no explanatory text, return ONLY the raw JSON object.
`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.1
          }
        })
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn("Gemini Vision API request failed with status:", response.status);
      return null;
    }

    const data = await response.json();
    const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textOutput) {
      return null;
    }

    let parsedRaw: any;
    try {
      parsedRaw = JSON.parse(textOutput);
    } catch {
      return null;
    }

    const zodResult = GeminiOutputSchema.safeParse(parsedRaw);
    const parsedJson = zodResult.success ? zodResult.data : parsedRaw;

    if (!parsedJson.students || !Array.isArray(parsedJson.students) || parsedJson.students.length === 0) {
      return null;
    }

    // Map extracted students to the class roster and subjects
    const detectedStudents: DetectedStudentEntry[] = [];

    for (const extStudent of parsedJson.students) {
      // Fuzzy match student in class roster
      const stMatch = matchStudent(
        `${extStudent.studentName || ""} ${extStudent.rollNumber || ""}`,
        classStudents
      );

      // Single source of truth: merge extracted subjects into student's rows
      const mappedSubjects = mergeStudentSubjects(
        extStudent.subjects || [],
        classSubjects,
        customDefaults?.defaultMaxMarks || 100,
        customDefaults?.defaultPassMarks || 35
      );

      // Deterministic self-check: if printed total exists, compare with sum of extracted marks
      const calculatedSum = mappedSubjects.reduce((acc, s) => {
        const val = typeof s.score === "number" ? s.score : (s.marksScored && typeof s.marksScored === "number" ? s.marksScored : 0);
        return acc + val;
      }, 0);

      const printedTotal = extStudent.totalMarks !== null && extStudent.totalMarks !== undefined ? Number(extStudent.totalMarks) : undefined;
      const docTotal = printedTotal !== undefined && !isNaN(printedTotal) ? printedTotal : (calculatedSum > 0 ? calculatedSum : undefined);

      let docPct = extStudent.percentage !== null && extStudent.percentage !== undefined ? Number(extStudent.percentage) : undefined;
      if (docPct === undefined && docTotal !== undefined) {
        const totalMax = mappedSubjects.reduce((acc, s) => acc + s.maxScore, 0);
        if (totalMax > 0) {
          docPct = Math.round((docTotal / totalMax) * 1000) / 10;
        }
      }

      detectedStudents.push({
        studentId: stMatch.studentId,
        studentName: stMatch.studentName || extStudent.studentName || "Student",
        rollNumber: stMatch.rollNumber || extStudent.rollNumber || "",
        extractedName: extStudent.studentName,
        attendance: extStudent.attendance || null,
        subjects: mappedSubjects,
        totalMarks: extStudent.totalMarks || undefined,
        percentage: extStudent.percentage || undefined,
        grade: extStudent.grade || undefined,
        remarks: extStudent.teacherRemarks || undefined,
        docTotal: extStudent.totalMarks || undefined,
        docPercentage: extStudent.percentage || undefined,
        confidence: stMatch.confidence === "HIGH" ? 0.95 : stMatch.confidence === "MEDIUM" ? 0.8 : 0.5
      });
    }

    const firstStudent = detectedStudents[0];

    return {
      success: true,
      detectedStudents,
      allDetectedStudents: detectedStudents,
      examName: parsedJson.examName || "Midterm Examination",
      examDate: parsedJson.examDate || new Date().toISOString().split("T")[0],
      academicYear: parsedJson.academicYear || "2026-2027",
      docTotal: firstStudent?.docTotal,
      docPercentage: firstStudent?.docPercentage
    };
  } catch (err) {
    console.warn("Gemini vision extraction error, falling back:", err);
    return null;
  }
}

