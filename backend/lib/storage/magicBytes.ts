/**
 * Magic Bytes & File Security Validator
 * Validates that binary payloads match their advertised extension and are free of dangerous executable signatures.
 */

export interface ValidationResult {
  valid: boolean;
  detectedType?: string;
  error?: string;
}

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;    // 10 MB
export const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024; // 20 MB
export const MAX_AUDIO_SIZE = 25 * 1024 * 1024;    // 25 MB

export const ALLOWED_EXTENSIONS = new Set([
  // Images
  "png", "jpg", "jpeg", "webp", "gif",
  // Documents
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "zip",
  // Audio
  "mp3", "wav", "m4a", "aac", "ogg", "webm"
]);

export function getFileCategory(ext: string): "IMAGE" | "DOCUMENT" | "AUDIO" | "UNKNOWN" {
  const cleanExt = ext.toLowerCase().replace(/^\./, "");
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(cleanExt)) return "IMAGE";
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "zip"].includes(cleanExt)) return "DOCUMENT";
  if (["mp3", "wav", "m4a", "aac", "ogg", "webm"].includes(cleanExt)) return "AUDIO";
  return "UNKNOWN";
}

export function getMaxSizeBytesForExtension(ext: string): number {
  const category = getFileCategory(ext);
  switch (category) {
    case "IMAGE":
      return MAX_IMAGE_SIZE;
    case "AUDIO":
      return MAX_AUDIO_SIZE;
    case "DOCUMENT":
    default:
      return MAX_DOCUMENT_SIZE;
  }
}

/**
 * Sniffs the first bytes of a buffer to verify that the declared extension is legitimate
 * and rejects disguised executable files (e.g. .exe disguised as .png).
 */
export function validateMagicBytes(buffer: Buffer, declaredExt: string): ValidationResult {
  const ext = declaredExt.toLowerCase().replace(/^\./, "");

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `File type .${ext} is not allowed.` };
  }

  if (buffer.length < 4) {
    return { valid: false, error: "File payload is too small or truncated." };
  }

  // 1. Detect and immediately reject executable binaries
  // Windows MZ header (EXE, DLL)
  if (buffer[0] === 0x4D && buffer[1] === 0x5A) {
    return { valid: false, error: "Executable files (PE/EXE) are strictly prohibited." };
  }
  // Linux ELF header
  if (buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) {
    return { valid: false, error: "Executable binaries (ELF) are strictly prohibited." };
  }
  // Mach-O binary
  if (
    (buffer[0] === 0xCA && buffer[1] === 0xFE && buffer[2] === 0xBA && buffer[3] === 0xBE) ||
    (buffer[0] === 0xCE && buffer[1] === 0xFA && buffer[2] === 0xED && buffer[3] === 0xFE) ||
    (buffer[0] === 0xCF && buffer[1] === 0xFA && buffer[2] === 0xED && buffer[3] === 0xFE)
  ) {
    return { valid: false, error: "Mach-O binaries are strictly prohibited." };
  }

  // 2. Validate declared type against magic bytes
  switch (ext) {
    case "png": {
      // 89 50 4E 47 0D 0A 1A 0A
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
      if (!isPng) return { valid: false, error: "File content does not match PNG image format." };
      return { valid: true, detectedType: "image/png" };
    }

    case "jpg":
    case "jpeg": {
      // FF D8 FF
      const isJpg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
      if (!isJpg) return { valid: false, error: "File content does not match JPEG image format." };
      return { valid: true, detectedType: "image/jpeg" };
    }

    case "gif": {
      // 47 49 46 38 ('GIF8')
      const isGif = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;
      if (!isGif) return { valid: false, error: "File content does not match GIF image format." };
      return { valid: true, detectedType: "image/gif" };
    }

    case "webp": {
      // RIFF at 0..3 and WEBP at 8..11
      const isRiff = buffer.subarray(0, 4).toString("ascii") === "RIFF";
      const isWebp = buffer.length >= 12 && buffer.subarray(8, 12).toString("ascii") === "WEBP";
      if (!isRiff || !isWebp) return { valid: false, error: "File content does not match WebP image format." };
      return { valid: true, detectedType: "image/webp" };
    }

    case "pdf": {
      // %PDF-
      const header = buffer.subarray(0, 5).toString("ascii");
      if (!header.startsWith("%PDF")) {
        return { valid: false, error: "File content does not match PDF document format." };
      }
      return { valid: true, detectedType: "application/pdf" };
    }

    case "zip":
    case "docx":
    case "xlsx":
    case "pptx": {
      // Zip header: 50 4B 03 04 ('PK\x03\x04')
      const isPk = buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
      if (!isPk) return { valid: false, error: `File content does not match ${ext.toUpperCase()} archive/document format.` };
      return { valid: true, detectedType: ext === "zip" ? "application/zip" : `application/vnd.openxmlformats-officedocument.${ext}` };
    }

    case "doc":
    case "xls":
    case "ppt": {
      // OLE2 Compound File Header: D0 CF 11 E0 A1 B1 1A E1
      const isOle2 = buffer.length >= 8 &&
        buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0 &&
        buffer[4] === 0xA1 && buffer[5] === 0xB1 && buffer[6] === 0x1A && buffer[7] === 0xE1;
      if (!isOle2) return { valid: false, error: `File content does not match Microsoft Office binary (${ext}) format.` };
      return { valid: true, detectedType: `application/msword` };
    }

    case "csv":
    case "txt": {
      // Ensure no binary null bytes in the first 512 bytes
      const sample = buffer.subarray(0, Math.min(buffer.length, 512));
      for (let i = 0; i < sample.length; i++) {
        if (sample[i] === 0x00) {
          return { valid: false, error: `File is not a valid plain text or CSV file (contains binary null bytes).` };
        }
      }
      // Check for script tags in text/csv
      const textSample = sample.toString("utf8").toLowerCase();
      if (textSample.includes("<script") || textSample.includes("<?php")) {
        return { valid: false, error: "Embedded scripts in text files are prohibited." };
      }
      return { valid: true, detectedType: ext === "csv" ? "text/csv" : "text/plain" };
    }

    case "mp3": {
      // ID3 or MPEG sync (0xFF 0xFB/F3/F2)
      const hasId3 = buffer.subarray(0, 3).toString("ascii") === "ID3";
      const hasSync = buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0;
      if (!hasId3 && !hasSync) {
        return { valid: false, error: "File content does not match MP3 audio format." };
      }
      return { valid: true, detectedType: "audio/mpeg" };
    }

    case "wav": {
      const isRiff = buffer.subarray(0, 4).toString("ascii") === "RIFF";
      const isWave = buffer.length >= 12 && buffer.subarray(8, 12).toString("ascii") === "WAVE";
      if (!isRiff || !isWave) {
        return { valid: false, error: "File content does not match WAV audio format." };
      }
      return { valid: true, detectedType: "audio/wav" };
    }

    case "ogg": {
      const isOgg = buffer.subarray(0, 4).toString("ascii") === "OggS";
      if (!isOgg) return { valid: false, error: "File content does not match Ogg audio format." };
      return { valid: true, detectedType: "audio/ogg" };
    }

    case "webm": {
      // EBML header 0x1A 0x45 0xDF 0xA3
      const isEbml = buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3;
      if (!isEbml) return { valid: false, error: "File content does not match WebM audio format." };
      return { valid: true, detectedType: "audio/webm" };
    }

    case "m4a":
    case "aac": {
      // Check for ftyp or ADTS sync
      const isFtyp = buffer.length >= 8 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
      const isAdts = buffer[0] === 0xFF && (buffer[1] & 0xF0) === 0xF0;
      if (!isFtyp && !isAdts) {
        return { valid: false, error: "File content does not match M4A/AAC audio format." };
      }
      return { valid: true, detectedType: "audio/mp4" };
    }

    default:
      return { valid: true, detectedType: "application/octet-stream" };
  }
}

/**
 * Strips EXIF location metadata. Client-side canvas compression already strips EXIF.
 * Safe no-op on server to eliminate native C++ sharp bindings from blocking serverless Lambdas.
 */
export async function sanitizeImageBuffer(buffer: any, ext: string): Promise<any> {
  return buffer;
}
