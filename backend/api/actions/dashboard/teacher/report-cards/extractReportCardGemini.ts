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
  parseScoreNumber
} from "./scanReportCardUtils";

export { normalizeSubjectName };

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
You are an expert school document OCR and gradebook data extraction AI.
Analyze this academic report card or marksheet image carefully.

CRITICAL INSTRUCTIONS:
1. Determine whether this image contains a SINGLE student report card OR a MULTI-STUDENT gradebook table (one student per row).
2. For EVERY student found in the document:
   - Extract their Full Name and Roll Number.
   - Extract every subject name, marks scored/obtained, and maximum marks.
   - NORMALIZE subject names: Maths -> MATHEMATICS, Social -> SOCIAL SCIENCE, Tamil -> TAMIL, English -> ENGLISH, Science -> SCIENCE.
   - DO NOT confuse 'S.No' (serial number 1, 2, 3...) with marks scored! S.No is just a row index.
   - Extract printed Total Marks, Percentage, and Exam Term/Date if visible.
3. Return ONLY a valid JSON object matching this exact schema:
{
  "examName": string (e.g. "Midterm Examination", "Unit Test 1"),
  "examDate": string (e.g. "2026-10-29"),
  "academicYear": string (e.g. "2026-2027"),
  "students": [
    {
      "studentName": string,
      "rollNumber": string,
      "attendance": string or null,
      "subjects": [
        {
          "subjectName": string,
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

      const processedSubjectIds = new Set<string>();
      const mappedSubjects: ScannedReportCardSubject[] = [];

      (extStudent.subjects || []).forEach((es, idx) => {
        const normName = normalizeSubjectName(es.subjectName || "");
        const matched = matchSubject(normName, classSubjects);
        const maxScore = customDefaults?.defaultMaxMarks || es.maxMarks || matched?.maxMarks || 100;
        const passMarks = customDefaults?.defaultPassMarks || es.passMarks || matched?.passMarks || 35;
        const parsed = parseScoreNumber(es.marksObtained);
        const score = parsed.score !== null ? parsed.score : "";
        const grade = score !== "" ? computeGrade(Number(score), maxScore) : "-";
        const status = score === "" ? "NEEDS_REVIEW" : Number(score) >= passMarks ? "PASS" : "FAIL";

        if (matched) {
          processedSubjectIds.add(matched.subjectId);
          mappedSubjects.push({
            id: `subj-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
            subjectId: matched.subjectId,
            subjectName: matched.subjectName,
            score,
            maxScore,
            passMarks,
            remarks: es.remarks || "",
            grade,
            status,
            originalExtractedValue: parsed.raw || (score !== "" ? String(score) : undefined),
            isCustomSubject: false
          });
        } else {
          // Unknown subject in document, add as custom row (never dropped!)
          mappedSubjects.push({
            id: `subj-custom-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
            subjectId: "",
            subjectName: normName,
            score,
            maxScore,
            passMarks,
            remarks: es.remarks || "",
            grade,
            status,
            originalExtractedValue: parsed.raw || (score !== "" ? String(score) : undefined),
            isCustomSubject: true
          });
        }
      });

      // Append any curriculum subjects from the class roster that were not found in the document
      classSubjects.forEach((cs, cIdx) => {
        if (!processedSubjectIds.has(cs.id)) {
          mappedSubjects.push({
            id: `subj-missing-${Date.now()}-${cIdx}`,
            subjectId: cs.id,
            subjectName: cs.name,
            score: "",
            maxScore: customDefaults?.defaultMaxMarks || cs.maxMarks || 100,
            passMarks: customDefaults?.defaultPassMarks || cs.passMarks || 35,
            remarks: "",
            grade: "-",
            status: "NEEDS_REVIEW",
            originalExtractedValue: undefined,
            isCustomSubject: false
          });
        }
      });

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

