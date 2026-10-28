import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { scanReportCardAction } from "@/backend/api/actions/dashboard/teacher/report-cards/scanReportCardAction";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || (session.user.role?.toUpperCase() !== "TEACHER" && session.user.role?.toUpperCase() !== "ADMIN")) {
      return NextResponse.json({
        success: false,
        error: "Unauthorized: Teacher or Admin session required."
      }, { status: 401 });
    }

    const formData = await req.formData();
    const result = await scanReportCardAction(formData);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Error in /api/teacher/report-cards/scan route:", err);
    return NextResponse.json({
      success: false,
      error: err?.message || "Failed to parse report card document on server."
    }, { status: 500 });
  }
}
