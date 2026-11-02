import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import {
  dispatchSingleStudentReportCardAction,
  SingleStudentDispatchInput,
} from "@/backend/lib/services/dispatchReportCardService";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !["TEACHER", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized: Teacher or Admin session required.",
          errorCode: "ERR_PERMISSION",
        },
        { status: 401 }
      );
    }

    const body: SingleStudentDispatchInput = await req.json();

    if (!body.studentId || !body.classId || !body.examName || !body.examDate) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required parameters (studentId, classId, examName, examDate).",
          errorCode: "ERR_VALIDATION",
        },
        { status: 400 }
      );
    }

    const result = await dispatchSingleStudentReportCardAction(body);

    if (result.needsRevisionReason) {
      return NextResponse.json(
        {
          ...result,
          errorCode: "ERR_REVISION_REQUIRED",
        },
        { status: 200 }
      );
    }

    if (!result.success) {
      return NextResponse.json(
        {
          ...result,
          errorCode: "ERR_DB",
        },
        { status: 422 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error("[API dispatch-one] Unhandled error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Internal server error during report card dispatch.",
        errorCode: "ERR_DB",
      },
      { status: 500 }
    );
  }
}
