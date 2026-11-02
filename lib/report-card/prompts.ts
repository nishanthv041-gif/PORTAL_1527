import { z } from "zod";

export const MARK_SHEET_VISION_PROMPT = `You are reading a school mark sheet image. Return ONLY valid JSON, no markdown.
Rules:
- Read EVERY column between the student name column and the TOTAL column. Each one is a subject. Do not skip any (Science, Social, Computer, etc.).
- Count the subject columns first and return it as "subjectCount".
- Read every student row. Keep roll numbers as strings.
- If a number is unclear, return null and put the cell in "uncertain".
- Read "max marks per subject" and "total marks maximum" from the title/footer if present.
Schema: { "subjectCount": number, "maxPerSubject": number, "maxTotal": number|null,
  "subjects": string[], "students": [{ "name": string, "rollNo": string|null,
  "marks": { "<subject>": number|null }, "total": number|null }], "uncertain": string[] }`;

export const ExtractedStudentItemSchema = z.object({
  name: z.string(),
  rollNo: z.string().nullable().optional(),
  marks: z.record(z.string(), z.union([z.number(), z.null()])),
  total: z.union([z.number(), z.null()]).optional(),
});

export const ExtractedSheetVisionSchema = z.object({
  subjectCount: z.number().int().nonnegative(),
  maxPerSubject: z.number().default(100),
  maxTotal: z.union([z.number(), z.null()]).optional(),
  subjects: z.array(z.string()),
  students: z.array(ExtractedStudentItemSchema),
  uncertain: z.array(z.string()).default([]),
});

export type ExtractedSheetVisionOutput = z.infer<typeof ExtractedSheetVisionSchema>;
