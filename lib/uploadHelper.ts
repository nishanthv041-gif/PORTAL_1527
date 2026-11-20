/**
 * Direct-to-Storage Upload Engine with Progress Tracking
 * Bypasses Next.js serverless compute & CloudFront edge request limits
 * by executing direct pre-signed PUT requests with XMLHttpRequest progress reporting.
 */

import { apiFetch, ApiError } from "./apiFetch";

export interface UploadProgressEvent {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadedAttachmentResult {
  attachmentId: string;
  url: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

export async function uploadFileWithProgress(
  file: File,
  onProgress?: (percentage: number) => void,
  abortSignal?: AbortSignal
): Promise<UploadedAttachmentResult> {
  const uploadStart = Date.now();
  console.log(`[UploadHelper] Step 1: Requesting presigned session for "${file.name}" (${file.size} bytes)...`);

  // 1. Request presigned upload session from backend (45s timeout to absorb cold starts)
  const presignRes = await apiFetch<{
    ok: boolean;
    directToS3: boolean;
    attachmentId: string;
    uploadUrl: string;
    storageKey: string;
    headers?: Record<string, string>;
  }>("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      purpose: "messages",
    }),
    signal: abortSignal,
    timeoutMs: 20000,
  });

  if (!presignRes?.ok || !presignRes?.uploadUrl) {
    throw new ApiError({
      status: 500,
      code: "PRESIGN_FAILED",
      userMessage: "Could not initialize file upload. Please try again.",
    });
  }

  const { directToS3, uploadUrl, attachmentId } = presignRes;
  console.log(`[UploadHelper] Step 1 complete (${Date.now() - uploadStart}ms): directToS3=${directToS3}, attachmentId=${attachmentId}`);

  let streamAttachment: UploadedAttachmentResult | null = null;

  // 2. Upload file directly with XMLHttpRequest for granular progress
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (abortSignal) {
      abortSignal.addEventListener("abort", () => {
        xhr.abort();
        reject(new ApiError({
          status: 499,
          code: "ABORTED",
          userMessage: "Upload was cancelled.",
        }));
      });
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const pct = Math.min(99, Math.round((event.loaded / event.total) * 100));
        onProgress(pct);
      }
    };

    xhr.onerror = () => {
      reject(new ApiError({
        status: 0,
        code: "NETWORK_ERROR",
        userMessage: "Network connection failed during upload. Please check your connection and retry.",
        isNetworkError: true,
      }));
    };

    xhr.ontimeout = () => {
      reject(new ApiError({
        status: 408,
        code: "TIMEOUT",
        userMessage: "Upload timed out after 3 minutes. Please check your internet connection speed and retry.",
        isNetworkError: true,
      }));
    };

    if (directToS3) {
      // Direct-to-S3 pre-signed PUT
      xhr.open("PUT", uploadUrl, true);
      xhr.timeout = 180000; // 3 minutes timeout for large files

      if (presignRes.headers) {
        for (const [key, val] of Object.entries(presignRes.headers)) {
          xhr.setRequestHeader(key, val);
        }
      } else {
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (onProgress) onProgress(100);
          resolve();
        } else {
          let cleanMessage = "Storage rejected the upload.";
          if (xhr.status === 403) {
            cleanMessage = "Storage authorization expired or access was denied. S3 CORS or permissions may need updating.";
          } else if (xhr.status === 413) {
            cleanMessage = "File exceeds the storage provider's maximum upload limit.";
          }
          reject(new ApiError({
            status: xhr.status,
            code: `STORAGE_${xhr.status}`,
            userMessage: cleanMessage,
            rawText: xhr.responseText?.slice(0, 300),
          }));
        }
      };

      xhr.send(file);
    } else {
      // Fallback multipart streaming route
      const formData = new FormData();
      formData.append("file", file);
      formData.append("attachmentId", attachmentId);

      xhr.open("POST", uploadUrl, true);
      xhr.timeout = 180000;

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (onProgress) onProgress(100);
          try {
            const parsed = JSON.parse(xhr.responseText);
            if (parsed.ok && parsed.attachment) {
              streamAttachment = {
                attachmentId: parsed.attachment.id,
                url: parsed.attachment.url,
                fileName: parsed.attachment.fileName,
                fileSize: parsed.attachment.fileSize,
                fileType: parsed.attachment.fileType,
              };
            }
          } catch {
            // Ignored
          }
          resolve();
        } else {
          let errText = "Failed to upload file.";
          try {
            const parsed = JSON.parse(xhr.responseText);
            if (parsed.error) errText = parsed.error;
          } catch {
            // Non-JSON response
          }
          reject(new ApiError({
            status: xhr.status,
            code: `STREAM_${xhr.status}`,
            userMessage: errText,
            rawText: xhr.responseText?.slice(0, 300),
          }));
        }
      };

      xhr.send(formData);
    }
  });

  // If streaming fallback was used, it already finalized the record in DB
  if (streamAttachment) {
    return streamAttachment;
  }

  // 3. Complete and verify upload on backend (instant DB status update)
  console.log(`[UploadHelper] Step 3: Finalizing attachment id=${attachmentId}...`);
  const completeRes = await apiFetch<{
    ok: boolean;
    attachment: {
      id: string;
      fileName: string;
      fileSize: number;
      fileType: string;
      url: string;
      status: string;
    };
  }>("/api/uploads/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attachmentId }),
    signal: abortSignal,
    timeoutMs: 15000,
  });

  if (!completeRes?.ok || !completeRes?.attachment) {
    throw new ApiError({
      status: 500,
      code: "COMPLETE_FAILED",
      userMessage: "Could not finalize attachment. Please try again.",
    });
  }

  return {
    attachmentId: completeRes.attachment.id,
    url: completeRes.attachment.url,
    fileName: completeRes.attachment.fileName,
    fileSize: completeRes.attachment.fileSize,
    fileType: completeRes.attachment.fileType,
  };
}
