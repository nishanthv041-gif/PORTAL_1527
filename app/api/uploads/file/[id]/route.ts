export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/backend/db/prisma";
import path from "path";
import fs from "fs/promises";

import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

/**
 * Streaming File Delivery Route
 *
 * Serves stored attachments cleanly to authenticated chat recipients:
 * - RBAC: Only uploader, sender, recipient, or admin can access
 * - Redirects to AWS S3 if stored externally
 * - Streams decoded binary buffer with correct Content-Type if stored in DB
 * - Serves from local filesystem if stored on VM disk
 *
 * Guarantees zero huge base64 strings in API payloads or chat messages.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return new NextResponse("Attachment ID is required.", { status: 400 });
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id },
      include: {
        message: {
          select: { senderId: true, receiverId: true },
        },
      },
    });

    if (!attachment || !attachment.url) {
      return new NextResponse("Attachment not found.", { status: 404 });
    }

    // Access control: Caller must be uploader, sender, recipient, or admin
    const isAdmin = session.user.role === "ADMIN" || session.user.role === "SUPER_ADMIN";
    const isUploader = attachment.uploaderId === session.user.id;
    const isSender = attachment.message?.senderId === session.user.id;
    const isReceiver = attachment.message?.receiverId === session.user.id;

    if (!isAdmin && !isUploader && !isSender && !isReceiver) {
      return new NextResponse("Forbidden: Access denied to this file.", { status: 403 });
    }

    // 1. External S3 or CDN URL: 302 Redirect directly
    if (attachment.url.startsWith("http://") || attachment.url.startsWith("https://")) {
      return NextResponse.redirect(attachment.url);
    }

    // 2. Base64 Data URI in DB (Serverless storage fallback)
    if (attachment.url.startsWith("data:") || attachment.url.length > 500) {
      const cleanBase64 = attachment.url.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");

      const rawExt = path.extname(attachment.fileName).slice(1).toLowerCase();
      const isInline = ["png", "jpg", "jpeg", "webp", "gif", "pdf", "mp3", "wav", "m4a", "ogg", "webm"].includes(rawExt);
      const disposition = isInline ? "inline" : "attachment";

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": attachment.fileType || "application/octet-stream",
          "Content-Length": buffer.length.toString(),
          "Content-Disposition": `${disposition}; filename="${encodeURIComponent(attachment.fileName)}"`,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    // 3. Local filesystem path (/uploads/...)
    if (attachment.url.startsWith("/")) {
      const localPath = path.join(process.cwd(), "public", attachment.url);
      try {
        const fileBuffer = await fs.readFile(localPath);
        return new NextResponse(fileBuffer, {
          status: 200,
          headers: {
            "Content-Type": attachment.fileType || "application/octet-stream",
            "Content-Length": fileBuffer.length.toString(),
            "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      } catch {
        // Local file missing, return 404
        return new NextResponse("File not found on server disk.", { status: 404 });
      }
    }

    return new NextResponse("Invalid attachment storage format.", { status: 500 });
  } catch (error: any) {
    console.error("[GET /api/uploads/file/[id]] Error:", error);
    return new NextResponse("Failed to retrieve file.", { status: 500 });
  }
}
