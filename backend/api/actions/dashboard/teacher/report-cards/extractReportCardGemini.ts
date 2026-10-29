import type {
  StructuredExtractionResult,
  DetectedStudentEntry,
  ScannedReportCardSubject
} from "./scanReportCardTypes";
import {
  matchSubject,
  matchStudent,
  computeGrade
} from "./scanReportCardUtils";

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
export async function extractWithGemini(
  options: GeminiExtractionOptions
): Promise<{
  success: boolean;
  detectedStudents: DetectedStudentEntry[];
  examName: string;
  examDate: string;
  docTotal?: number;
  docPercentage?: number;
} | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null; // Fall back gracefully to OCR / heuristic parser
  }

  const { buffer, mimeType, classSubjects, classStudents, customDefaults } = options;

  const prompt = `
You are an expert school document OCR and gradebook data extraction AI.
Analyze this academic report card or marksheet image carefully.

CRITICAL INSTRUCTIONS:
1. Determine whether this image contains a SINGLE student report card OR a MULTI-STUDENT gradebook table (e.g. S.No, Student Name, Roll No, Subject 1, Subject 2... Total, Percentage).
2. For EVERY student found in the document:
   - Extract their Full Name and Roll Number.
   - Extract every subject name, marks obtained (score), maximum marks, and pass marks.
   - DO NOT confuse 'S.No' (serial number like 1, 2, 3...) with marks scored! The serial number is NOT a mark!
   - DO NOT confuse 'Marks Obtained' with pass marks! Pass marks are typically 35, 40, etc.
   - If Maximum marks is shown (e.g. 100, 50, /100), extract it.
   - Extract printed Total Marks, Percentage/Average, Overall Grade, and Exam Term/Date if visible.
3. Return ONLY a valid JSON object matching this exact schema:
{
  "examName": string (e.g. "Midterm Examination", "Unit Test 1", etc.),
  "examDate": string in YYYY-MM-DD or DD-MM-YYYY format,
  "academicYear": string (e.g. "2026-2027"),
  "students": [
    {
      "studentName": string,
      "rollNumber": string,
      "attendance": string (or null),
      "subjects": [
        {
          "subjectName": string,
          "marksObtained": number,
          "maxMarks": number,
          "passMarks": number,
          "grade": string (or null),
          "remarks": string (or null)
        }
      ],
      "totalMarks": number (or null),
      "percentage": number (or null),
      "grade": string (or null),
      "teacherRemarks": string (or null)
    }
  ]
}
`.trim();

  try {
    const base64Data = buffer.toString("base64");
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20-second timeout

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType || "image/jpeg",
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
    });

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

    const parsedJson: StructuredExtractionResult = JSON.parse(textOutput);
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

      // Build subject list aligned with class subjects
      const mappedSubjects: ScannedReportCardSubject[] = classSubjects.map((cs, idx) => {
        // Find matching extracted subject
        const found = extStudent.subjects?.find(es => {
          const m = matchSubject(es.subjectName, [cs]);
          return m && m.subjectId === cs.id;
        });

        const score = found && found.marksObtained !== null && found.marksObtained !== undefined
          ? found.marksObtained
          : "";
        const maxScore = customDefaults?.defaultMaxMarks || found?.maxMarks || cs.maxMarks || 100;
        const passMarks = customDefaults?.defaultPassMarks || found?.passMarks || cs.passMarks || 35;
        const grade = score !== "" ? computeGrade(Number(score), maxScore) : "-";
        const status = score === "" ? "NEEDS_REVIEW" : Number(score) >= passMarks ? "PASS" : "FAIL";

        return {
          id: `subj-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
          subjectId: cs.id,
          subjectName: cs.name,
          score,
          maxScore,
          passMarks,
          remarks: found?.remarks || "",
          grade,
          status,
          originalExtractedValue: score !== "" ? String(score) : undefined
        };
      });

      detectedStudents.push({
        studentId: stMatch.studentId,
        studentName: stMatch.studentName || extStudent.studentName || "Student",
        rollNumber: stMatch.rollNumber || extStudent.rollNumber || "",
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
      examName: parsedJson.examName || "Midterm Examination",
      examDate: parsedJson.examDate || new Date().toISOString().split("T")[0],
      docTotal: firstStudent?.docTotal,
      docPercentage: firstStudent?.docPercentage
    };
  } catch (err) {
    console.warn("Gemini vision extraction error, falling back:", err);
    return null;
  }
}
