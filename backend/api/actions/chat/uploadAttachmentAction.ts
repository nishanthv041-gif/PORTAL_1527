"use server";

import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import path from "path";
import { 
  ALLOWED_EXTENSIONS, 
  getMaxSizeBytesForExtension, 
  validateMagicBytes, 
  sanitizeImageBuffer 
} from "@/backend/lib/storage/magicBytes";

export interface ServerActionUploadResult {
  ok: boolean;
  attachment?: {
    id: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    url: string;
    status: string;
  };
  error?: string;
  code?: string;
}

/**
 * Server Action for Chat Attachment Uploads
 * 
 * Bypasses the AWS Amplify CloudFront 8 KB Route Handler limit by leveraging
 * Next.js Server Actions with a configured bodySizeLimit of 25MB.
 */
export async function uploadAttachmentAction(formData: FormData): Promise<ServerActionUploadResult> {
  const requestId = `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return {
        ok: false,
        code: "UNAUTHORIZED",
        error: "Your session has expired. Please log in again."
      };
    }

    const file = formData.get("file") as File | null;
    const attachmentId = formData.get("attachmentId") as string | null;

    if (!file || file.size === 0) {
      return {
        ok: false,
        code: "BAD_REQUEST",
        error: "No file was selected for upload."
      };
    }

    if (!attachmentId) {
      return {
        ok: false,
        code: "BAD_REQUEST",
        error: "attachmentId is required."
      };
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      return {
        ok: false,
        code: "NOT_FOUND",
        error: "Attachment record not found."
      };
    }

    const isAdmin = session.user.role === "ADMIN" || session.user.role === "SUPER_ADMIN";
    if (attachment.uploaderId !== session.user.id && !isAdmin) {
      return {
        ok: false,
        code: "FORBIDDEN",
        error: "You do not have permission to upload this file."
      };
    }

    const fileName = file.name || attachment.fileName;
    const rawExt = path.extname(fileName).slice(1).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(rawExt)) {
      return {
        ok: false,
        code: "UNSUPPORTED_MEDIA_TYPE",
        error: `File type .${rawExt} is not supported.`
      };
    }

    const maxAllowed = getMaxSizeBytesForExtension(rawExt);
    if (file.size > maxAllowed) {
      const maxMb = Math.round(maxAllowed / (1024 * 1024));
      return {
        ok: false,
        code: "FILE_TOO_LARGE",
        error: `File exceeds maximum allowed size of ${maxMb}MB.`
      };
    }

    const arrayBuffer = await file.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);

    // Validate magic bytes
    const magicCheck = validateMagicBytes(buffer, rawExt);
    if (!magicCheck.valid) {
      await prisma.attachment.update({
        where: { id: attachmentId },
        data: { status: "FAILED" },
      });
      return {
        ok: false,
        code: "INVALID_FILE_CONTENT",
        error: magicCheck.error || "File content validation failed."
      };
    }

    // Sanitize image buffer (EXIF metadata stripping)
    buffer = await sanitizeImageBuffer(buffer, rawExt);

    let finalUrl: string;

    // Check S3 first if configured
    const { isS3Configured, uploadBufferToS3 } = await import("@/backend/lib/storage/s3Storage");
    if (isS3Configured()) {
      const s3Res = await uploadBufferToS3(buffer, attachment.storageKey, file.type || undefined);
      if (s3Res.success && s3Res.s3Url) {
        finalUrl = s3Res.s3Url;
      } else {
        console.warn("[uploadAttachmentAction] S3 upload failed, using Data URI fallback:", s3Res.error);
        const mime = file.type || "application/octet-stream";
        finalUrl = `data:${mime};base64,${buffer.toString("base64")}`;
      }
    } else {
      // Universal self-contained portable Data URI (zero CloudFront / S3 dependencies)
      const mime = file.type || "application/octet-stream";
      finalUrl = `data:${mime};base64,${buffer.toString("base64")}`;
    }

    // Update DB record to READY
    const updated = await prisma.attachment.update({
      where: { id: attachmentId },
      data: {
        status: "READY",
        url: finalUrl,
        fileSize: buffer.length,
      },
    });

    console.log(`[uploadAttachmentAction][${requestId}] Attachment finalized successfully (id=${updated.id}, size=${updated.fileSize})`);

    return {
      ok: true,
      attachment: {
        id: updated.id,
        fileName: updated.fileName,
        fileSize: updated.fileSize,
        fileType: updated.fileType,
        url: updated.url,
        status: updated.status,
      }
    };
  } catch (error: any) {
    console.error(`[uploadAttachmentAction][${requestId}] Error:`, error);
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      error: error.message || "Failed to process upload."
    };
  }
}
