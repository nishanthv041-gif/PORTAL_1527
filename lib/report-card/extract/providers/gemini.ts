import { z } from "zod";
import {
  ExtractedSheetResult,
  ExtractedStudent,
  ExtractionOptions,
  ExtractionProvider
} from "../types";
import { normalizeSubjectName } from "../normalizer";

const GeminiStudentSchema = z.object({
  name: z.string(),
  rollNo: z.string().nullable().optional(),
  admissionNo: z.string().nullable().optional(),
  marks: z.record(z.string(), z.union([z.number(), z.literal("AB"), z.literal("Absent"), z.null()])),
  total: z.union([z.number(), z.null()]).optional()
});

const GeminiSheetSchema = z.object({
  subjectCount: z.number().int().nonnegative(),
  maxPerSubject: z.number().default(100),
  maxTotal: z.union([z.number(), z.null()]).optional(),
  subjects: z.array(z.string()),
  students: z.array(GeminiStudentSchema),
  uncertain: z.array(z.string()).default([])
});

const PROMPT_INSTRUCTIONS = `You are an accurate school mark sheet OCR parser.
Return ONLY valid JSON matching this exact structure, with no markdown fences, no code blocks, and no extra prose.
Rules:
1. Identify all subject columns located between the student name/roll number and the TOTAL column.
2. Count the subjects and set "subjectCount". Never omit or merge subjects (e.g. Science and Social Science must remain separate).
3. If a student was absent for an exam, record the mark as "AB".
4. If a mark is unclear or smudged, record it as null and add "<StudentName>-<Subject>" to the "uncertain" array.
5. Read max marks per subject (default 100 if unspecified) and maximum total declared if present in headers/title.

Output JSON format:
{
  "subjectCount": 5,
  "maxPerSubject": 100,
  "maxTotal": 500,
  "subjects": ["Tamil", "English", "Mathematics", "Science", "Social Science"],
  "students": [
    {
      "name": "Anushka S",
      "rollNo": "101",
      "marks": { "Tamil": 86, "English": 91, "Mathematics": 88, "Science": 84, "Social Science": 90 },
      "total": 439
    }
  ],
  "uncertain": []
}`;

export class GeminiProvider implements ExtractionProvider {
  name = "GEMINI" as const;

  async isAvailable(): Promise<boolean> {
    return !!process.env.GEMINI_API_KEY;
  }

  async extractFromImage(
    buffer: Buffer,
    mimeType: string = "image/png",
    options?: ExtractionOptions
  ): Promise<ExtractedSheetResult> {
    const startTime = Date.now();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    const base64Data = buffer.toString("base64");
    const payload = {
      contents: [
        {
          parts: [
            { text: PROMPT_INSTRUCTIONS },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }
      ],
      generationConfig: {
        response_mime_type: "application/json",
        temperature: 0.1
      }
    };

    return this.executeCall(payload, apiKey, startTime);
  }

  async extractFromText(
    text: string,
    options?: ExtractionOptions
  ): Promise<ExtractedSheetResult> {
    const startTime = Date.now();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    const payload = {
      contents: [
        {
          parts: [
            { text: `${PROMPT_INSTRUCTIONS}\n\nDocument Text Content:\n${text}` }
          ]
        }
      ],
      generationConfig: {
        response_mime_type: "application/json",
        temperature: 0.1
      }
    };

    return this.executeCall(payload, apiKey, startTime);
  }

  private async executeCall(
    payload: any,
    apiKey: string,
    startTime: number
  ): Promise<ExtractedSheetResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Gemini API returned HTTP ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error("Empty response returned from Gemini API.");
      }

      let parsedJson: any;
      try {
        parsedJson = JSON.parse(rawText.replace(/```json/g, "").replace(/```/g, "").trim());
      } catch (jsonErr: any) {
        throw new Error(`Failed to parse Gemini JSON output: ${jsonErr.message}`);
      }

      const validated = GeminiSheetSchema.safeParse(parsedJson);
      if (!validated.success) {
        throw new Error(`Gemini output failed schema validation: ${validated.error.message}`);
      }

      const output = validated.data;
      const warnings: string[] = [];
      const normalizedSubjects = output.subjects.map(normalizeSubjectName);

      if (output.maxTotal && normalizedSubjects.length > 0) {
        const expected = Math.round(output.maxTotal / output.maxPerSubject);
        if (expected !== normalizedSubjects.length) {
          warnings.push(
            `Expected ${expected} subjects based on declared maximum ${output.maxTotal}, but found ${normalizedSubjects.length}. A column may be missing.`
          );
        }
      }

      const students: ExtractedStudent[] = output.students.map(st => {
        const marks: Record<string, number | null | "AB"> = {};
        const confidence: Record<string, number> = {};

        normalizedSubjects.forEach((subName, idx) => {
          const origKey = output.subjects[idx] || subName;
          let val = st.marks[origKey] !== undefined ? st.marks[origKey] : st.marks[subName];
          if (val === undefined) val = null;

          if (val === "AB" || val === "Absent") {
            marks[subName] = "AB";
            confidence[subName] = 0.95;
          } else if (typeof val === "number") {
            marks[subName] = val;
            confidence[subName] = output.uncertain.includes(`${st.name}-${subName}`) ? 0.4 : 0.95;
          } else {
            marks[subName] = null;
            confidence[subName] = 0;
          }
        });

        const calculatedSum = Object.values(marks).reduce<number>(
          (acc, m) => (typeof m === "number" ? acc + m : acc),
          0
        );

        if (st.total !== null && st.total !== undefined && st.total !== calculatedSum) {
          warnings.push(
            `${st.name}: sheet total ${st.total} vs calculated ${calculatedSum}, please check.`
          );
        }

        return {
          name: st.name,
          rollNo: st.rollNo || undefined,
          admissionNo: st.admissionNo || undefined,
          marks,
          totalFromSheet: st.total || undefined,
          confidence
        };
      });

      const usage = data?.usageMetadata;
      const tokensUsed = usage
        ? {
            input: usage.promptTokenCount || 0,
            output: usage.candidatesTokenCount || 0
          }
        : undefined;

      return {
        maxMarkPerSubject: output.maxPerSubject || 100,
        maxTotalDeclared: output.maxTotal || undefined,
        subjects: normalizedSubjects,
        students,
        warnings,
        providerUsed: "GEMINI",
        tokensUsed,
        estimatedCostUsd: 0.0, // Free tier
        durationMs: Date.now() - startTime
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

