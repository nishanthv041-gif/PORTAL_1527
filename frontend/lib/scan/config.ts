/**
 * Scan Engine Configuration
 * - "local" (default): Browser-based OCR using self-hosted Tesseract.js / pdf.js / SheetJS.
 *   100% private, free, and runs entirely in the client browser memory.
 * - "vision": Optional server-side Vision API fallback (only enabled when configured via env).
 */
export const SCAN_ENGINE: "local" | "vision" =
  (process.env.NEXT_PUBLIC_SCAN_ENGINE as "local" | "vision") || "local";

export const SELF_HOSTED_OCR_PATHS = {
  workerPath: "/tesseract/worker.min.js",
  corePath: "/tesseract",
  langPath: "/tesseract",
};

export const MAX_DOCUMENT_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

