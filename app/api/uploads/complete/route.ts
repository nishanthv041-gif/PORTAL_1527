export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import path from "path";
import { validateMagicBytes } from "@/backend/lib/storage/magicBytes";
import { 
  isS3Configured, 
  getS3ObjectMetadata, 
  getS3ObjectHeadBytes, 
  deleteS3Object 
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

    const { attachmentId } = body || {};
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

    // RBAC: caller must be the uploader or an ADMIN
    const isAdmin = session.user.role === "ADMIN" || session.user.role === "SUPER_ADMIN";
    if (attachment.uploaderId !== session.user.id && !isAdmin) {
      return NextResponse.json(
        { ok: false, code: "FORBIDDEN", error: "You do not have permission to finalize this attachment.", requestId },
        { status: 403 }
      );
    }

    console.log(`[Uploads:Complete][${requestId}] Finalizing attachment id="${attachmentId}" file="${attachment.fileName}" storageKey="${attachment.storageKey}"`);

    // Mark attachment as READY in database (Zero external network calls, instant <50ms completion)
    const updated = await prisma.attachment.update({
      where: { id: attachmentId },
      data: {
        status: "READY",
      },
    });
    console.log(`[Uploads:Complete][${requestId}] Attachment status updated to READY in DB.`);

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
    console.error(`[POST /api/uploads/complete][${requestId}] Error:`, error);
    return NextResponse.json(
      { 
        ok: false, 
        code: "INTERNAL_ERROR", 
        error: error.message || "Failed to finalize attachment.",
        requestId 
      },
      { status: 500 }
    );
  }
}
