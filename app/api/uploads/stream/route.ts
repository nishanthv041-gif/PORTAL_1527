export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import path from "path";
import fs from "fs/promises";
import { validateMagicBytes, sanitizeImageBuffer, ALLOWED_EXTENSIONS, getMaxSizeBytesForExtension } from "@/backend/lib/storage/magicBytes";

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

    let attachmentId: string | null = null;
    let fileName: string = "";
    let fileType: string = "application/octet-stream";
    let buffer: Buffer;

    const contentTypeHeader = request.headers.get("content-type") || "";
    console.log(`[POST /api/uploads/stream][${requestId}] Request received:`, {
      userId: session.user.id,
      userRole: session.user.role,
      receivedContentType: contentTypeHeader,
    });

    if (contentTypeHeader.includes("application/json")) {
      // JSON Payload
      const body = await request.json();
      attachmentId = body.attachmentId;
      fileName = body.fileName || "attachment";
      fileType = body.mimeType || body.fileType || "application/octet-stream";

      if (body.chunkIndex !== undefined) {
        // Chunked Upload Mode: Each chunk is ~4KB, well below AWS Amplify's CloudFront 8,192 byte limit
        const chunkIndex = Number(body.chunkIndex);
        const totalChunks = Number(body.totalChunks);
        const chunkData = body.chunkData || "";
        const isLastChunk = Boolean(body.isLastChunk);

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

        const isAdmin = session.user.role === "ADMIN" || session.user.role === "SUPER_ADMIN";
        if (attachment.uploaderId !== session.user.id && !isAdmin) {
          return NextResponse.json(
            { ok: false, code: "FORBIDDEN", error: "You do not have permission to upload this file.", requestId },
            { status: 403 }
          );
        }

        if (chunkIndex === 0) {
          await prisma.attachment.update({
            where: { id: attachmentId },
            data: { url: chunkData },
          });
        } else {
          await prisma.$executeRawUnsafe(
            'UPDATE "Attachment" SET "url" = "url" || $1 WHERE id = $2',
            chunkData,
            attachmentId
          );
        }

        if (!isLastChunk) {
          return NextResponse.json({
            ok: true,
            chunkReceived: chunkIndex,
            totalChunks,
            requestId,
          });
        }

        // On final chunk, read complete reassembled string
        const assembled = await prisma.attachment.findUnique({
          where: { id: attachmentId },
        });

        if (!assembled || !assembled.url) {
          return NextResponse.json(
            { ok: false, code: "ASSEMBLY_FAILED", error: "Could not assemble file chunks.", requestId },
            { status: 500 }
          );
        }

        const cleanBase64 = assembled.url.replace(/^data:[^;]+;base64,/, "");
        buffer = Buffer.from(cleanBase64, "base64");
      } else {
        // Single JSON Payload (for small files < 6KB)
        const base64Data = body.base64Data || body.data || "";

        if (!base64Data) {
          return NextResponse.json(
            { ok: false, code: "BAD_REQUEST", error: "No file data was provided.", requestId },
            { status: 400 }
          );
        }

        const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, "");
        buffer = Buffer.from(cleanBase64, "base64");
      }
    } else {
      // Standard Multipart Form Data
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      attachmentId = formData.get("attachmentId") as string | null;

      console.log(`[POST /api/uploads/stream][${requestId}] Decision: Multipart payload detected:`, {
        attachmentId,
        fileName: file?.name,
        fileType: file?.type,
        fileSize: file?.size,
      });

      if (!file || file.size === 0) {
        return NextResponse.json(
          { ok: false, code: "BAD_REQUEST", error: "No file was uploaded.", requestId },
          { status: 400 }
        );
      }

      fileName = file.name || "attachment";
      fileType = file.type || "application/octet-stream";
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
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

    const isAdmin = session.user.role === "ADMIN" || session.user.role === "SUPER_ADMIN";
    if (attachment.uploaderId !== session.user.id && !isAdmin) {
      return NextResponse.json(
        { ok: false, code: "FORBIDDEN", error: "You do not have permission to upload this file.", requestId },
        { status: 403 }
      );
    }

    const rawExt = path.extname(fileName || attachment.fileName).slice(1).toLowerCase();
    console.log(`[POST /api/uploads/stream][${requestId}] Validating file:`, {
      detectedExtension: rawExt,
      bufferLength: buffer.length,
      fileType,
    });

    if (!ALLOWED_EXTENSIONS.has(rawExt)) {
      console.warn(`[POST /api/uploads/stream][${requestId}] Decision: Rejected - unsupported extension .${rawExt}`);
      return NextResponse.json(
        { ok: false, code: "UNSUPPORTED_MEDIA_TYPE", error: `File type .${rawExt} is not supported.`, requestId },
        { status: 415 }
      );
    }

    const maxAllowed = getMaxSizeBytesForExtension(rawExt);
    if (buffer.length > maxAllowed) {
      const maxMb = Math.round(maxAllowed / (1024 * 1024));
      console.warn(`[POST /api/uploads/stream][${requestId}] Decision: Rejected - size ${buffer.length} exceeds ${maxAllowed}`);
      return NextResponse.json(
        { ok: false, code: "FILE_TOO_LARGE", error: `File exceeds maximum allowed size of ${maxMb}MB.`, requestId },
        { status: 413 }
      );
    }

    // Validate magic bytes
    const magicCheck = validateMagicBytes(buffer, rawExt);
    if (!magicCheck.valid) {
      console.warn(`[POST /api/uploads/stream][${requestId}] Decision: Rejected - magic bytes invalid:`, magicCheck.error);
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
      process.env.LAMBDA_TASK_ROOT ||
      process.env.AWS_EXECUTION_ENV
    );

    // Try Vercel Blob if available
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const { put } = await import("@vercel/blob");
        const blob = await put(`messages/${path.basename(attachment.storageKey)}`, buffer, {
          access: "public",
          contentType: fileType || "application/octet-stream",
        });
        finalUrl = blob.url;
      } catch (blobErr) {
        console.warn("[StreamUpload] Vercel blob failed, falling back to data URI", blobErr);
        const mime = fileType || "application/octet-stream";
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
        const mime = fileType || "application/octet-stream";
        finalUrl = `data:${mime};base64,${buffer.toString("base64")}`;
      }
    } else {
      // Serverless fallback: Self-contained Data URI
      const mime = fileType || "application/octet-stream";
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

    console.log(`[POST /api/uploads/stream][${requestId}] Attachment finalized successfully:`, {
      attachmentId: updated.id,
      fileName: updated.fileName,
      fileSize: updated.fileSize,
      urlPrefix: finalUrl.slice(0, 40),
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
        error: error.message || "Failed to process upload.",
        requestId 
      },
      { status: 500 }
    );
  }
}
