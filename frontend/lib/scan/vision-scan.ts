import { SCAN_ENGINE } from "./config";
import type { ScanResult } from "./types";
import { ScanResultSchema } from "./types";

/**
 * Optional Cloud Vision-based Scan (disabled by default via SCAN_ENGINE = "local")
 * If enabled and configured with an API key, calls a secure, memory-only vision endpoint.
 * Automatically falls back to local browser OCR if disabled, network fails, or limits reached.
 */
export async function attemptVisionScan(
  imageBlob: Blob
): Promise<ScanResult | null> {
  if (SCAN_ENGINE !== "vision") {
    return null;
  }

  try {
    const formData = new FormData();
    formData.append("image", imageBlob, "scan.jpg");

    const res = await fetch("/api/report-cards/vision-scan", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      console.warn("Vision scan returned non-OK status, falling back to local OCR");
      return null;
    }

    const data = await res.json();
    const parsed = ScanResultSchema.safeParse(data);
    if (parsed.success) {
      return parsed.data;
    }
    return null;
  } catch (err) {
    console.warn("Vision scan exception, falling back to local OCR:", err);
    return null;
  }
}

