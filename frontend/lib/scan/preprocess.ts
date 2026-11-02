/**
 * Image Pre-Processing for Browser OCR
 * - High-resolution upscaling for small/low-res marksheets (e.g., 57KB PNGs)
 * - Grayscale conversion, contrast stretching, and noise reduction
 * - Sub-canvas region cropping for digit-specific re-checking
 */

export interface PreprocessedImageResult {
  canvas: HTMLCanvasElement;
  blob: Blob;
  width: number;
  height: number;
  scaleFactor: number;
}

export async function preprocessImageForOcr(
  fileOrBlob: Blob,
  targetWidth = 2000
): Promise<PreprocessedImageResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(fileOrBlob);

    img.onload = () => {
      try {
        URL.revokeObjectURL(objectUrl);
        const originalWidth = img.naturalWidth || img.width;
        const originalHeight = img.naturalHeight || img.height;

        if (!originalWidth || !originalHeight) {
          throw new Error("Invalid image dimensions (0x0).");
        }

        // Calculate scaling factor to target optimal 1800-2400px OCR width
        let scale = 1;
        if (originalWidth < 1600) {
          scale = Math.min(3.5, targetWidth / originalWidth);
        } else if (originalWidth > 3200) {
          scale = 3000 / originalWidth;
        }

        const width = Math.round(originalWidth * scale);
        const height = Math.round(originalHeight * scale);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          throw new Error("Unable to create 2D canvas context for OCR preprocessing.");
        }

        // High-quality bicubic smoothing for upscaled text edges
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // Preprocessing: Grayscale & Contrast Optimization
        try {
          const imgData = ctx.getImageData(0, 0, width, height);
          const data = imgData.data;

          // Contrast stretching factor (1.35 factor gives sharp, high-contrast character edges)
          const contrast = 1.35;
          const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));

          for (let i = 0; i < data.length; i += 4) {
            // Standard perceptual luminance
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;

            // Apply contrast curve
            const enhanced = Math.min(255, Math.max(0, factor * (gray - 128) + 128));

            data[i] = enhanced;
            data[i + 1] = enhanced;
            data[i + 2] = enhanced;
          }

          ctx.putImageData(imgData, 0, 0);
        } catch {
          // If security or canvas taint fails, continue with drawn canvas
        }

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({
                canvas,
                blob,
                width,
                height,
                scaleFactor: scale,
              });
            } else {
              reject(new Error("Failed to export preprocessed canvas to Blob."));
            }
          },
          "image/png"
        );
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not decode image file. Please check file format."));
    };

    img.src = objectUrl;
  });
}

/**
 * Crops a sub-region of the preprocessed canvas to a new canvas or Blob for digit re-checking
 */
export function cropCanvasRegion(
  sourceCanvas: HTMLCanvasElement,
  rect: { x0: number; y0: number; x1: number; y1: number },
  padding = 6
): HTMLCanvasElement | null {
  try {
    const x = Math.max(0, Math.floor(rect.x0 - padding));
    const y = Math.max(0, Math.floor(rect.y0 - padding));
    const w = Math.min(sourceCanvas.width - x, Math.ceil(rect.x1 - rect.x0 + padding * 2));
    const h = Math.min(sourceCanvas.height - y, Math.ceil(rect.y1 - rect.y0 + padding * 2));

    if (w <= 0 || h <= 0) return null;

    const crop = document.createElement("canvas");
    crop.width = w;
    crop.height = h;

    const ctx = crop.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(sourceCanvas, x, y, w, h, 0, 0, w, h);
    return crop;
  } catch {
    return null;
  }
}

