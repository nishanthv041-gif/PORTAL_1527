import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import path from "path";
import fs from "fs/promises";

// Max file size: 25MB
const MAX_FILE_SIZE = 25 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  // Images
  "jpg", "jpeg", "png", "gif", "webp",
  // Audio
  "webm", "ogg", "mp3", "wav", "m4a", "aac", "mp4",
  // Documents
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"
]);

export async function POST(request: Request) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const clientMessageType = formData.get("messageType") as string | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File exceeds the maximum size limit of 25MB" }, { status: 400 });
    }

    const originalName = file.name || "attachment";
    // Sanitize extension
    const ext = (path.extname(originalName).slice(1) || "bin").toLowerCase();
    
    // Check if extension or MIME is allowed
    const mime = file.type.toLowerCase();
    const isAudio = mime.startsWith("audio/") || ["webm", "ogg", "mp3", "wav", "m4a", "aac"].includes(ext);
    const isImage = mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
    
    if (!isAudio && !isImage && !ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: `File type .${ext} is not supported.` }, { status: 400 });
    }

    let detectedMessageType: "AUDIO" | "IMAGE" | "FILE" = "FILE";
    if (clientMessageType === "AUDIO" || isAudio) {
      detectedMessageType = "AUDIO";
    } else if (isImage) {
      detectedMessageType = "IMAGE";
    }

    // Generate safe clean filename: timestamp-random-sanitized
    const cleanBaseName = path.basename(originalName, path.extname(originalName))
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40);
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${cleanBaseName}.${ext}`;

    let fileUrl: string;

    // Use Vercel Blob in production if configured
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const { put } = await import("@vercel/blob");
        const blob = await put(`messages/${uniqueFileName}`, file, {
          access: "public",
          contentType: file.type || undefined,
        });
        fileUrl = blob.url;
      } catch (blobErr) {
        console.warn("Vercel Blob upload failed, attempting local fallback:", blobErr);
        fileUrl = await saveLocalFile(file, uniqueFileName);
      }
    } else {
      fileUrl = await saveLocalFile(file, uniqueFileName);
    }

    return NextResponse.json({
      success: true,
      url: fileUrl,
      fileName: originalName,
      fileSize: file.size,
      fileType: file.type || ext,
      messageType: detectedMessageType,
    });
  } catch (error) {
    const e = error as Error;
    console.error("POST /api/messages/upload error:", e);
    return NextResponse.json({ error: e.message || "Failed to upload file" }, { status: 500 });
  }
}

async function saveLocalFile(file: File, uniqueFileName: string): Promise<string> {
  const uploadDir = path.join(process.cwd(), "public", "uploads", "messages");
  await fs.mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, uniqueFileName);
  
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.writeFile(filePath, buffer);
  
  return `/uploads/messages/${uniqueFileName}`;
}
