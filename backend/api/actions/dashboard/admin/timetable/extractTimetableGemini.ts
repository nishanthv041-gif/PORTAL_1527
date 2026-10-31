import { z } from "zod";

const GeminiPeriodSlotSchema = z.object({
  order: z.number(),
  label: z.string().default("Period"),
  start: z.string(),
  end: z.string(),
  type: z.enum(["LESSON", "BREAK", "LUNCH", "ASSEMBLY", "FREE"]).default("LESSON")
});

const GeminiSlotSchema = z.object({
  period: z.number(),
  subject: z.string(),
  teacher: z.string().nullable().optional(),
  room: z.string().nullable().optional()
});

const GeminiDaySchema = z.object({
  day: z.string(), // "MONDAY", "TUESDAY", etc.
  slots: z.array(GeminiSlotSchema)
});

const GeminiClassSchema = z.object({
  className: z.string(),
  days: z.array(GeminiDaySchema)
});

export const GeminiTimetableOutputSchema = z.object({
  periods: z.array(GeminiPeriodSlotSchema).default([]),
  classes: z.array(GeminiClassSchema).default([])
});

export type GeminiTimetableOutput = z.infer<typeof GeminiTimetableOutputSchema>;

interface GeminiExtractionOptions {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Extracts school timetable structure from an image or scanned document buffer using Google Gemini Vision.
 * In-memory execution only: image buffer is never saved to disk, DB, or external storage.
 */
export async function extractTimetableWithGemini(
  options: GeminiExtractionOptions
): Promise<GeminiTimetableOutput | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const { buffer, mimeType } = options;
  const base64Data = buffer.toString("base64");

  const prompt = `
You are an expert school document OCR and academic timetable extraction parser.
Analyze this school timetable image or scan carefully.

TABLE EXTRACTION RULES:
1. Identify the periods header row (Period 1, 2, Break, Lunch, etc.) with start and end times if printed.
2. Mark 'Break', 'Interval', 'Recess', or 'Lunch' slots with type: "BREAK" or "LUNCH".
3. Identify all classes (e.g., "Class 2 - A", "Grade 10 - B", or single class).
4. For each day (MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY), extract the subject name, teacher name/initials, and classroom/room number for each period.
5. If a cell contains a break/recess, set subject to "Break" and teacher/room to null.
6. Support any orientation (days as rows or days as columns).

Return ONLY a valid JSON object matching this exact schema:
{
  "periods": [
    { "order": 1, "label": "Period 1", "start": "08:00", "end": "08:45", "type": "LESSON" },
    { "order": 2, "label": "Period 2", "start": "08:45", "end": "09:30", "type": "LESSON" },
    { "order": 3, "label": "Break", "start": "09:30", "end": "09:45", "type": "BREAK" }
  ],
  "classes": [
    {
      "className": "Class 2 - A",
      "days": [
        {
          "day": "MONDAY",
          "slots": [
            { "period": 1, "subject": "Tamil", "teacher": "Mrs. Lakshmi", "room": "101" },
            { "period": 2, "subject": "English", "teacher": "Mr. David", "room": "101" }
          ]
        }
      ]
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
    if (!textOutput) return null;

    let parsedRaw: any;
    try {
      parsedRaw = JSON.parse(textOutput);
    } catch {
      return null;
    }

    const zodResult = GeminiTimetableOutputSchema.safeParse(parsedRaw);
    return zodResult.success ? zodResult.data : parsedRaw;
  } catch (err) {
    console.warn("Gemini Timetable vision extraction error:", err);
    return null;
  }
}
