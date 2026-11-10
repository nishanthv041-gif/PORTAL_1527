export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { runReportCardExtraction, SsrfError } from "@/lib/report-card/extract";

// In-memory rate limiting map: userId -> [timestamp array]
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) || [];
  const validTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  validTimestamps.push(now);
  rateLimitMap.set(userId, validTimestamps);
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    const userRole = session?.user?.role;
    if (!session || (userRole !== "TEACHER" && userRole !== "ADMIN")) {
      return NextResponse.json({ error: "Unauthorized: Teacher or Admin access required." }, { status: 401 });
    }

    const userId = session.user.id;
    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { error: "Too many extraction requests. Please wait a moment before trying again." },
        { status: 429 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const webUrl = (formData.get("webUrl") as string | null)?.trim() || "";
    const classId = formData.get("classId") as string | null;
    const examId = (formData.get("examId") as string | null) || undefined;
    const clientOcrText = (formData.get("clientOcrText") as string | null) || "";
    const defaultMaxMarks = parseInt((formData.get("defaultMaxMarks") as string) || "100", 10);
    const defaultPassMarks = parseInt((formData.get("defaultPassMarks") as string) || "35", 10);

    if (!file && !webUrl) {
      return NextResponse.json(
        { error: "Please provide either a document file (Excel, CSV, PDF, Image) or a web link URL." },
        { status: 400 }
      );
    }

    if (!classId) {
      return NextResponse.json({ error: "Class ID is required." }, { status: 400 });
    }

    // Authorization check for Teachers: verify assignment to class
    if (userRole === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({
        where: { userId },
        include: {
          classes: { select: { id: true } },
          classTeacherOf: { select: { id: true } }
        }
      });

      if (!teacher) {
        return NextResponse.json({ error: "Teacher profile not found." }, { status: 403 });
      }

      const authorizedClassIds = new Set([
        ...(teacher.classes || []).map(c => c.id),
        ...(teacher.classTeacherOf ? [teacher.classTeacherOf.id] : [])
      ]);

      if (!authorizedClassIds.has(classId)) {
        return NextResponse.json({ error: "Unauthorized: You are not assigned to this class." }, { status: 403 });
      }
    }

    // Fetch class subjects and active students
    const targetClass = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        subjects: { orderBy: { name: "asc" } },
        students: {
          where: { isActive: true },
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }]
        }
      }
    });

    if (!targetClass) {
      return NextResponse.json({ error: "Target class not found." }, { status: 404 });
    }

    const classSubjects = (targetClass.subjects || []).map(s => ({
      id: s.id,
      name: s.name,
      maxMarks: s.maxMarks || defaultMaxMarks,
      passMarks: s.passMarks || defaultPassMarks
    }));

    const classStudents = (targetClass.students || []).map(st => ({
      id: st.id,
      rollNumber: st.rollNumber,
      name: `${st.firstName || ""} ${st.lastName || ""}`.trim() || "Student"
    }));

    // Buffer preparation if file was uploaded
    let fileBuffer: Buffer | undefined;
    let mimeType: string | undefined;
    let fileName: string | undefined;

    if (file) {
      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
      mimeType = file.type || "application/octet-stream";
      fileName = file.name;
    }

    // Run unified extraction pipeline
    const extractionResult = await runReportCardExtraction({
      fileBuffer,
      mimeType,
      fileName,
      webUrl: webUrl || undefined,
      rawText: clientOcrText || undefined,
      classId,
      examId,
      userId,
      options: {
        classSubjects,
        classStudents,
        customDefaults: { defaultMaxMarks, defaultPassMarks }
      }
    });

    return NextResponse.json(extractionResult);
  } catch (err: any) {
    if (err instanceof SsrfError) {
      return NextResponse.json(
        { error: `Security check: ${err.message}`, code: err.code },
        { status: 400 }
      );
    }
    console.error("Report card extraction API error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal document extraction error." },
      { status: 500 }
    );
  }
}
