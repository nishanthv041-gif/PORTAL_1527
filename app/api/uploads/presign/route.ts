export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import path from "path";
import crypto from "crypto";
import { 
  ALLOWED_EXTENSIONS, 
  getMaxSizeBytesForExtension, 
  getFileCategory 
} from "@/backend/lib/storage/magicBytes";
import { 
  isS3Configured, 
  getPresignedUploadUrl 
} from "@/backend/lib/storage/s3Storage";

export async function POST(request: Request) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return NextResponse.json(
        { ok: false, code: "UNAUTHORIZED", error: "Your session has expired. Please log in again.", requestId },
        { status: 401 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, code: "BAD_REQUEST", error: "Invalid JSON request payload.", requestId },
        { status: 400 }
      );
    }

    const { fileName, mimeType, fileSize, purpose = "message" } = body || {};

    if (!fileName || typeof fileName !== "string") {
      return NextResponse.json(
        { ok: false, code: "BAD_REQUEST", error: "File name is required.", requestId },
        { status: 400 }
      );
    }

    const rawExt = path.extname(fileName).slice(1).toLowerCase();
    if (!rawExt || !ALLOWED_EXTENSIONS.has(rawExt)) {
      return NextResponse.json(
        { 
          ok: false, 
          code: "UNSUPPORTED_MEDIA_TYPE", 
          error: `File type .${rawExt || "unknown"} is not supported. Allowed: images (png, jpg, webp, gif), documents (pdf, docx, xlsx, pptx, csv, txt), audio (mp3, wav, m4a, ogg, webm).`,
          requestId 
        },
        { status: 415 }
      );
    }

    const maxAllowedBytes = getMaxSizeBytesForExtension(rawExt);
    const category = getFileCategory(rawExt);
    const sizeNumber = Number(fileSize) || 0;

    if (sizeNumber > maxAllowedBytes) {
      const maxMb = Math.round(maxAllowedBytes / (1024 * 1024));
      return NextResponse.json(
        { 
          ok: false, 
          code: "FILE_TOO_LARGE", 
          error: `File exceeds maximum allowed size of ${maxMb}MB for ${category.toLowerCase()}s.`,
          requestId 
        },
        { status: 413 }
      );
    }

    const cleanBase = path.basename(fileName, path.extname(fileName))
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 50);
    const randomSuffix = crypto.randomBytes(6).toString("hex");
    const uniqueFileName = `${Date.now()}-${randomSuffix}-${cleanBase}.${rawExt}`;
    const storageKey = `uploads/${purpose}/${session.user.id}/${uniqueFileName}`;

    function inferMimeTypeFromExt(ext: string): string {
      switch (ext) {
        case "png": return "image/png";
        case "jpg":
        case "jpeg": return "image/jpeg";
        case "webp": return "image/webp";
        case "gif": return "image/gif";
        case "pdf": return "application/pdf";
        case "doc": return "application/msword";
        case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        case "xls": return "application/vnd.ms-excel";
        case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        case "ppt": return "application/vnd.ms-powerpoint";
        case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        case "txt": return "text/plain";
        case "csv": return "text/csv";
        case "zip": return "application/zip";
        case "mp3": return "audio/mpeg";
        case "wav": return "audio/wav";
        case "m4a": return "audio/mp4";
        case "webm": return "audio/webm";
        case "ogg": return "audio/ogg";
        default: return "application/octet-stream";
      }
    }

    const effectiveMime = (mimeType && mimeType !== "application/octet-stream")
      ? mimeType
      : inferMimeTypeFromExt(rawExt);
    console.log(`[Uploads:Presign][${requestId}] Step 1: Received presign request for file="${fileName}" size=${sizeNumber} mime="${effectiveMime}" purpose="${purpose}" user="${session.user.id}"`);

    // 1. Direct-to-S3 Presigned Upload (Bypasses Next.js & CloudFront Edge entirely)
    const s3Active = isS3Configured();
    console.log(`[Uploads:Presign][${requestId}] Step 2: Storage backend check: isS3Configured=${s3Active}`);

    if (s3Active) {
      const presignStart = Date.now();
      const presigned = await getPresignedUploadUrl(storageKey, effectiveMime, 900); // 15 mins
      const presignElapsed = Date.now() - presignStart;
      console.log(`[Uploads:Presign][${requestId}] Step 3: getPresignedUploadUrl finished in ${presignElapsed}ms (success=${Boolean(presigned)})`);

      if (presigned) {
        const dbStart = Date.now();
        const attachment = await prisma.attachment.create({
          data: {
            fileName,
            fileSize: sizeNumber,
            fileType: effectiveMime,
            storageKey,
            url: presigned.publicUrl,
            status: "PENDING",
            uploaderId: session.user.id,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24hr auto-expiry for pending
          },
        });
        console.log(`[Uploads:Presign][${requestId}] Step 4: DB attachment record created in ${Date.now() - dbStart}ms (id=${attachment.id}). Returning direct S3 upload URL.`);

        return NextResponse.json({
          ok: true,
          directToS3: true,
          attachmentId: attachment.id,
          uploadUrl: presigned.uploadUrl,
          storageKey,
          headers: {
            "Content-Type": effectiveMime,
          },
          requestId,
        });
      } else {
        console.warn(`[Uploads:Presign][${requestId}] Step 3: S3 presign failed or timed out. Falling back to streaming route.`);
      }
    }

    // 2. Direct streaming route fallback (if S3 is unconfigured or presigning timed out)
    console.log(`[Uploads:Presign][${requestId}] Step 4: Initializing streaming fallback attachment...`);
    const fallbackAttachment = await prisma.attachment.create({
      data: {
        fileName,
        fileSize: sizeNumber,
        fileType: effectiveMime,
        storageKey,
        url: `/uploads/fallback/${uniqueFileName}`,
        status: "PENDING",
        uploaderId: session.user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    console.log(`[Uploads:Presign][${requestId}] Step 5: Fallback attachment created (id=${fallbackAttachment.id}). Returning streaming upload URL.`);

    return NextResponse.json({
      ok: true,
      directToS3: false,
      attachmentId: fallbackAttachment.id,
      uploadUrl: `/api/uploads/stream?attachmentId=${fallbackAttachment.id}`,
      storageKey,
      requestId,
    });
  } catch (error: any) {
    console.error(`[POST /api/uploads/presign][${requestId}] Error:`, error);
    return NextResponse.json(
      { 
        ok: false, 
        code: "INTERNAL_ERROR", 
        error: error.message || "Failed to initialize upload session.",
        requestId 
      },
      { status: 500 }
    );
  }
}
