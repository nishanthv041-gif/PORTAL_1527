import type { WordBox, ScanResult } from "./types";
import { reconstructTableFromWords } from "./table-reconstruction";
import { runBrowserOcr } from "./ocr";
import { preprocessImageForOcr } from "./preprocess";

/**
 * Parses PDF documents (Text-based or Scanned)
 * 1. Attempts to extract text layer with spatial bounding coordinates.
 * 2. If no text layer is present, renders page to canvas and runs self-hosted OCR.
 */
export async function parsePdfDocument(
  file: File,
  defaultMaxMarks = 100,
  defaultPassMarks = 35,
  onProgress?: (percent: number, message: string) => void
): Promise<ScanResult> {
  onProgress?.(15, "Reading PDF document structure...");
  const buffer = await file.arrayBuffer();

  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const numPages = pdf.numPages;

  const allWords: WordBox[] = [];

  for (let pageNum = 1; pageNum <= Math.min(numPages, 5); pageNum++) {
    onProgress?.(25 + Math.round((pageNum / numPages) * 20), `Extracting page ${pageNum} text elements...`);
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];

    for (const item of items) {
      const str = (item.str || "").trim();
      if (!str) continue;

      const tx = item.transform;
      // In PDF coordinate space: tx[4] is x, tx[5] is y (from bottom-left)
      const x = tx ? tx[4] : 0;
      const y = tx ? 1000 - tx[5] : 0; // Flip Y so 0 is top
      const w = item.width || str.length * 8;
      const h = item.height || 12;

      // Split space-separated strings if multiple words merged in one text chunk
      const subWords = str.split(/\s+/);
      let curX = x;
      for (const sw of subWords) {
        if (!sw) continue;
        const swWidth = (sw.length / str.length) * w;
        allWords.push({
          text: sw,
          x0: Math.round(curX),
          y0: Math.round(y),
          x1: Math.round(curX + swWidth),
          y1: Math.round(y + h),
          confidence: 0.99,
          lineNum: pageNum,
        });
        curX += swWidth + 4;
      }
    }
  }

  // If text layer found with meaningful words, reconstruct table directly
  if (allWords.length >= 15) {
    onProgress?.(70, "Reconstructing tabular marks from PDF layout coordinates...");
    const result = reconstructTableFromWords(allWords, {
      defaultMaxMarks,
      defaultPassMarks,
    });

    if (result.students.length > 0) {
      result.fileDetails = {
        name: file.name,
        size: file.size,
        type: "application/pdf",
      };
      return result;
    }
  }

  // If no text layer found (scanned PDF), render page to image canvas and perform OCR
  onProgress?.(30, "Scanned PDF detected (no text layer); rendering high-res canvas...");
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.5 });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Unable to create canvas context for PDF page rendering.");
  }

  await (page as any).render({
    canvasContext: ctx,
    viewport,
  }).promise;

  onProgress?.(45, "Preprocessing rendered PDF canvas for OCR...");
  const preprocessed = await preprocessImageForOcr(
    await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"))
  );

  const ocrResult = await runBrowserOcr(preprocessed.canvas, onProgress);
  const finalResult = reconstructTableFromWords(ocrResult.words, {
    defaultMaxMarks,
    defaultPassMarks,
  });

  finalResult.fileDetails = {
    name: file.name,
    size: file.size,
    type: "application/pdf",
  };

  return finalResult;
}

