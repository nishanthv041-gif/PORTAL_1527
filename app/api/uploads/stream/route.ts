export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import path from "path";
import fs from "fs/promises";
import { validateMagicBytes, sanitizeImageBuffer } from "@/backend/lib/storage/magicBytes";

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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const attachmentId = formData.get("attachmentId") as string | null;

    if (!file || file.size === 0) {
      return NextResponse.json(
        { ok: false, code: "BAD_REQUEST", error: "No file was uploaded.", requestId },
        { status: 400 }
      );
    }

    if (!attachmentId) {
      return NextResponse.json(
        { ok: false, code: "BAD_REQUEST", error: "attachmentId is required.", requestId },
        { status: 400 }
      );
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", error: "Attachment record not found.", requestId },
        { status: 404 }
      );
    }

    if (attachment.uploaderId !== session.user.id) {
      return NextResponse.json(
        { ok: false, code: "FORBIDDEN", error: "You do not have permission to upload this file.", requestId },
        { status: 403 }
      );
    }

    const rawExt = path.extname(file.name || attachment.fileName).slice(1).toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    let buffer: any = Buffer.from(arrayBuffer);

    // Validate magic bytes
    const magicCheck = validateMagicBytes(buffer, rawExt);
    if (!magicCheck.valid) {
      await prisma.attachment.update({
        where: { id: attachmentId },
        data: { status: "FAILED" },
      });
      return NextResponse.json(
        { ok: false, code: "INVALID_FILE_CONTENT", error: magicCheck.error || "File content validation failed.", requestId },
        { status: 415 }
      );
    }

    // Sanitize image buffer (EXIF stripping)
    buffer = await sanitizeImageBuffer(buffer, rawExt);

    let finalUrl: string;

    const isServerless = Boolean(
      process.env.VERCEL || 
      process.env.AWS_LAMBDA_FUNCTION_NAME || 
      process.env.LAMBDA_TASK_ROOT
    );

    // Try Vercel Blob if available
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const { put } = await import("@vercel/blob");
        const blob = await put(`messages/${path.basename(attachment.storageKey)}`, buffer, {
          access: "public",
          contentType: file.type || "application/octet-stream",
        });
        finalUrl = blob.url;
      } catch (blobErr) {
        console.warn("[StreamUpload] Vercel blob failed, falling back to data URI", blobErr);
        const mime = file.type || "application/octet-stream";
        finalUrl = `data:${mime};base64,${buffer.toString("base64")}`;
      }
    } else if (!isServerless) {
      // Local disk storage (VM or dev server)
      try {
        const uploadDir = path.join(process.cwd(), "public", "uploads", "messages");
        await fs.mkdir(uploadDir, { recursive: true });
        const filePath = path.join(uploadDir, path.basename(attachment.storageKey));
        await fs.writeFile(filePath, buffer);
        finalUrl = `/uploads/messages/${path.basename(attachment.storageKey)}`;
      } catch (diskErr) {
        console.warn("[StreamUpload] Disk write failed, using data URI fallback", diskErr);
        const mime = file.type || "application/octet-stream";
        finalUrl = `data:${mime};base64,${buffer.toString("base64")}`;
      }
    } else {
      // Serverless fallback
      const mime = file.type || "application/octet-stream";
      finalUrl = `data:${mime};base64,${buffer.toString("base64")}`;
    }

    const updated = await prisma.attachment.update({
      where: { id: attachmentId },
      data: {
        status: "READY",
        url: finalUrl,
        fileSize: buffer.length,
      },
    });

    return NextResponse.json({
      ok: true,
      attachment: {
        id: updated.id,
        fileName: updated.fileName,
        fileSize: updated.fileSize,
        fileType: updated.fileType,
        url: updated.url,
        status: updated.status,
      },
      requestId,
    });
  } catch (error: any) {
    console.error(`[POST /api/uploads/stream][${requestId}] Error:`, error);
    return NextResponse.json(
      { 
        ok: false, 
        code: "INTERNAL_ERROR", 
        error: error.message || "Failed to process streaming upload.",
        requestId 
      },
      { status: 500 }
    );
  }
}
