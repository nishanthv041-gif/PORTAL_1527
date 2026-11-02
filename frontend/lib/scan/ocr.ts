import { SELF_HOSTED_OCR_PATHS } from "./config";
import type { WordBox } from "./types";
import { cropCanvasRegion } from "./preprocess";

/**
 * Runs browser-side OCR using self-hosted Tesseract.js assets.
 * Guarantees zero external network/CDN dependency.
 */
export async function runBrowserOcr(
  imageCanvasOrBlob: HTMLCanvasElement | Blob,
  onProgress?: (percent: number, message: string) => void
): Promise<{ words: WordBox[]; rawText: string }> {
  // Dynamically import tesseract.js in browser
  const { createWorker } = await import("tesseract.js");

  onProgress?.(30, "Initializing self-hosted OCR engine...");

  // Initialize with self-hosted paths to comply with strict CSP and zero-CDN rule
  const worker = await createWorker("eng", 1, {
    workerPath: SELF_HOSTED_OCR_PATHS.workerPath,
    corePath: SELF_HOSTED_OCR_PATHS.corePath,
    langPath: SELF_HOSTED_OCR_PATHS.langPath,
    logger: (m) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        const pct = Math.round(35 + m.progress * 40);
        onProgress?.(pct, `Recognizing text and marks (${Math.round(m.progress * 100)}%)...`);
      }
    },
  });

  try {
    // Primary Pass: Uniform block of text (PSM 6)
    await worker.setParameters({
      tessedit_pageseg_mode: "6" as any,
    });

    onProgress?.(45, "Scanning marksheet structure and tables...");
    let result = await worker.recognize(imageCanvasOrBlob as any, {}, { tsv: true });

    let words = parseTsvToWordBoxes(result.data.tsv || "");

    // If PSM 6 yielded too few words, retry with PSM 11 (Sparse text)
    if (words.length < 12) {
      onProgress?.(55, "Sparse layout detected; running adaptive text segmentation...");
      await worker.setParameters({
        tessedit_pageseg_mode: "11" as any,
      });
      result = await worker.recognize(imageCanvasOrBlob as any, {}, { tsv: true });
      words = parseTsvToWordBoxes(result.data.tsv || "");
    }

    onProgress?.(75, `Identified ${words.length} text & score elements.`);

    return {
      words,
      rawText: result.data.text || "",
    };
  } finally {
    // Always terminate worker to prevent memory leaks in the browser
    await worker.terminate();
  }
}

/**
 * Secondary OCR Pass for Numeric Regions:
 * Uses a strict character whitelist to correct OCR symbol confusions (e.g. £ -> 9, E -> 8).
 */
export async function runDigitRefinementOcr(
  sourceCanvas: HTMLCanvasElement,
  regions: Array<{ id: string; rect: { x0: number; y0: number; x1: number; y1: number } }>
): Promise<Map<string, string>> {
  if (regions.length === 0) return new Map();

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: SELF_HOSTED_OCR_PATHS.workerPath,
    corePath: SELF_HOSTED_OCR_PATHS.corePath,
    langPath: SELF_HOSTED_OCR_PATHS.langPath,
  });

  const refinedMap = new Map<string, string>();

  try {
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789./%AB",
      tessedit_pageseg_mode: "7" as any, // Single text line
    });

    for (const region of regions) {
      const crop = cropCanvasRegion(sourceCanvas, region.rect, 8);
      if (!crop) continue;

      const res = await worker.recognize(crop);
      const text = (res.data.text || "").trim();
      if (text) {
        refinedMap.set(region.id, text);
      }
    }
  } catch (err) {
    console.warn("Digit refinement second pass warning:", err);
  } finally {
    await worker.terminate();
  }

  return refinedMap;
}

/**
 * Parses Tesseract TSV output into typed WordBoxes with bounding coordinates
 */
export function parseTsvToWordBoxes(tsvText: string): WordBox[] {
  if (!tsvText) return [];

  const lines = tsvText.split("\n");
  const words: WordBox[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split("\t");
    // TSV level 5 is word level
    if (parts.length >= 12 && parts[0] === "5") {
      const left = Number(parts[6]);
      const top = Number(parts[7]);
      const width = Number(parts[8]);
      const height = Number(parts[9]);
      const confidence = Number(parts[10]);
      const text = parts[11]?.trim();

      if (text && !isNaN(left) && !isNaN(top)) {
        words.push({
          text,
          x0: left,
          y0: top,
          x1: left + width,
          y1: top + height,
          confidence: isNaN(confidence) ? 0.9 : confidence / 100,
          lineNum: Number(parts[4]) || 0,
        });
      }
    }
  }

  return words;
}
