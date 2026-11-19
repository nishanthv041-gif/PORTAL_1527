export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import path from "path";
import fs from "fs/promises";
import { 
  ALLOWED_EXTENSIONS, 
  getMaxSizeBytesForExtension, 
  getFileCategory, 
  validateMagicBytes, 
  sanitizeImageBuffer 
} from "@/backend/lib/storage/magicBytes";

export async function POST(request: Request) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return NextResponse.json(
        { ok: false, error: "Your session has expired. Please log in again.", requestId },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const clientMessageType = formData.get("messageType") as string | null;

    if (!file || file.size === 0) {
      return NextResponse.json(
        { ok: false, error: "No file was selected for upload.", requestId },
        { status: 400 }
      );
    }

    const originalName = file.name || "attachment";
    const rawExt = (path.extname(originalName).slice(1) || "bin").toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(rawExt)) {
      return NextResponse.json(
        { ok: false, error: `File type .${rawExt} is not supported.`, requestId },
        { status: 415 }
      );
    }

    const maxAllowedBytes = getMaxSizeBytesForExtension(rawExt);
    const category = getFileCategory(rawExt);

    if (file.size > maxAllowedBytes) {
      const maxMb = Math.round(maxAllowedBytes / (1024 * 1024));
      return NextResponse.json(
        { ok: false, error: `File exceeds the maximum size limit of ${maxMb}MB for ${category.toLowerCase()}s.`, requestId },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    let buffer: any = Buffer.from(arrayBuffer);

    // Validate magic bytes to reject disguised executables
    const magicCheck = validateMagicBytes(buffer, rawExt);
    if (!magicCheck.valid) {
      return NextResponse.json(
        { ok: false, error: magicCheck.error || "File validation failed.", requestId },
        { status: 415 }
      );
    }

    // Strip EXIF metadata from images
    buffer = await sanitizeImageBuffer(buffer, rawExt);

    let detectedMessageType: "AUDIO" | "IMAGE" | "FILE" = "FILE";
    if (clientMessageType === "AUDIO" || category === "AUDIO") {
      detectedMessageType = "AUDIO";
    } else if (category === "IMAGE") {
      detectedMessageType = "IMAGE";
    }

    // Generate safe clean filename: timestamp-random-sanitized
    const cleanBaseName = path.basename(originalName, path.extname(originalName))
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40);
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${cleanBaseName}.${rawExt}`;

    let fileUrl: string;

    // 1. Try AWS S3 if configured
    const { isS3Configured, uploadBufferToS3 } = await import("@/backend/lib/storage/s3Storage");
    if (isS3Configured()) {
      const s3Res = await uploadBufferToS3(buffer, `messages/${uniqueFileName}`, file.type || undefined);
      if (s3Res.success && s3Res.s3Url) {
        fileUrl = s3Res.s3Url;
      } else {
        console.warn("S3 upload failed, falling back to robust storage:", s3Res.error);
        fileUrl = await saveFileRobust(buffer, file.type, uniqueFileName);
      }
    } else if (process.env.BLOB_READ_WRITE_TOKEN) {
      // 2. Try Vercel Blob if configured
      try {
        const { put } = await import("@vercel/blob");
        const blob = await put(`messages/${uniqueFileName}`, buffer, {
          access: "public",
          contentType: file.type || undefined,
        });
        fileUrl = blob.url;
      } catch (blobErr) {
        console.warn("Vercel Blob upload failed, falling back to robust storage:", blobErr);
        fileUrl = await saveFileRobust(buffer, file.type, uniqueFileName);
      }
    } else {
      fileUrl = await saveFileRobust(buffer, file.type, uniqueFileName);
    }

    return NextResponse.json({
      ok: true,
      success: true,
      url: fileUrl,
      fileName: originalName,
      fileSize: buffer.length,
      fileType: file.type || rawExt,
      messageType: detectedMessageType,
      requestId,
    });
  } catch (error: any) {
    console.error(`[POST /api/messages/upload][${requestId}] Error:`, error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to upload file", requestId },
      { status: 500 }
    );
  }
}

async function saveFileRobust(buffer: Buffer, mime: string | undefined, uniqueFileName: string): Promise<string> {
  const effectiveMime = mime || "application/octet-stream";
  const isServerless = Boolean(
    process.env.VERCEL || 
    process.env.AWS_LAMBDA_FUNCTION_NAME || 
    process.env.LAMBDA_TASK_ROOT
  );

  if (!isServerless) {
    try {
      const uploadDir = path.join(process.cwd(), "public", "uploads", "messages");
      await fs.mkdir(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, uniqueFileName);
      await fs.writeFile(filePath, buffer);
      return `/uploads/messages/${uniqueFileName}`;
    } catch (localErr) {
      console.warn("Local filesystem write failed, using data URI fallback:", localErr);
    }
  }

  // Universal Serverless fallback: Self-contained Data URI
  const base64 = buffer.toString("base64");
  return `data:${effectiveMime};base64,${base64}`;
}
