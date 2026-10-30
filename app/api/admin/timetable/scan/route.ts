import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { scanTimetableAction } from "@/backend/api/actions/dashboard/admin/timetable/scanTimetableAction";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
    }

    const formData = await req.formData();
    const result = await scanTimetableAction(formData);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("API /api/admin/timetable/scan error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process timetable file." },
      { status: 500 }
    );
  }
}
