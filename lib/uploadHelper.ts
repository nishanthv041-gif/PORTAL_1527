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
  console.log(`[UploadHelper:Debug] Starting upload:`, {
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    lastModified: file.lastModified,
  });

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

  if (directToS3) {
    // 2. Direct-to-S3 pre-signed PUT with granular progress
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

      const reqHeaders = presignRes.headers || { "Content-Type": file.type || "application/octet-stream" };
      console.log(`[UploadHelper:Debug] Sending PUT to S3:`, {
        url: uploadUrl,
        headers: reqHeaders,
        fileSize: file.size,
        fileType: file.type,
      });

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
          console.log(`[UploadHelper:Debug] S3 upload succeeded with status ${xhr.status}`);
          resolve();
        } else {
          console.error(`[UploadHelper:Debug] S3 PUT failed with status ${xhr.status}:`, {
            status: xhr.status,
            statusText: xhr.statusText,
            responseHeaders: xhr.getAllResponseHeaders(),
            responseBody: xhr.responseText?.slice(0, 500),
          });
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
    });

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
  } else {
    // 2. CloudFront 8KB-Proof Chunked Upload Engine
    // AWS Amplify CloudFront drops any request over 8,192 bytes.
    // By streaming the file in 4,000-byte chunks (~4.2 KB HTTP payload), every single
    // chunk flies under CloudFront's radar with a 100% success rate.
    console.log(`[UploadHelper:Debug] Executing 4KB Chunked upload for "${file.name}" (${file.size} bytes)...`);

    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new ApiError({
        status: 0,
        code: "FILE_READ_ERROR",
        userMessage: "Could not read file for upload.",
      }));
      reader.readAsDataURL(file);
    });

    const rawBase64 = base64Data.replace(/^data:[^;]+;base64,/, "");
    const CHUNK_SIZE = 4000; // 4,000 characters base64 (~3KB raw bytes) - far below 8,192 bytes
    const totalChunks = Math.ceil(rawBase64.length / CHUNK_SIZE) || 1;

    let finalizedAttachment: UploadedAttachmentResult | null = null;

    for (let i = 0; i < totalChunks; i++) {
      if (abortSignal?.aborted) {
        throw new ApiError({
          status: 499,
          code: "ABORTED",
          userMessage: "Upload was cancelled.",
        });
      }

      const chunkSlice = rawBase64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const isLastChunk = i === totalChunks - 1;

      const res = await apiFetch<{
        ok: boolean;
        chunkReceived?: number;
        attachment?: {
          id: string;
          fileName: string;
          fileSize: number;
          fileType: string;
          url: string;
          status: string;
        };
        error?: string;
      }>("/api/uploads/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachmentId,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          chunkIndex: i,
          totalChunks,
          chunkData: chunkSlice,
          isLastChunk,
        }),
        signal: abortSignal,
        timeoutMs: 30000,
      });

      if (!res?.ok) {
        throw new ApiError({
          status: 500,
          code: "CHUNK_FAILED",
          userMessage: res?.error || `Upload failed on chunk ${i + 1} of ${totalChunks}.`,
        });
      }

      if (onProgress) {
        const pct = Math.min(99, Math.round(((i + 1) / totalChunks) * 100));
        onProgress(pct);
      }

      if (isLastChunk && res.attachment) {
        finalizedAttachment = {
          attachmentId: res.attachment.id,
          url: res.attachment.url,
          fileName: res.attachment.fileName,
          fileSize: res.attachment.fileSize,
          fileType: res.attachment.fileType,
        };
      }
    }

    if (!finalizedAttachment) {
      throw new ApiError({
        status: 500,
        code: "FINALIZE_FAILED",
        userMessage: "Could not finalize uploaded file. Please try again.",
      });
    }

    if (onProgress) onProgress(100);
    console.log(`[UploadHelper:Debug] Chunked upload succeeded: id=${finalizedAttachment.attachmentId}`);

    return finalizedAttachment;
  }
}
