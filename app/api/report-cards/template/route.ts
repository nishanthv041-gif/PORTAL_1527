import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { generateStandardJsonTemplate } from "@/backend/api/actions/dashboard/teacher/report-cards/scanReportCardUtils";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Unauthorized: Teacher or Admin access required." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");

    let className = "Class Template";
    let classSubjects: Array<{ id: string; name: string; maxMarks?: number; passMarks?: number }> = [];
    let classStudents: Array<{ id: string; rollNumber: string; name: string }> = [];

    if (classId) {
      const cls = await prisma.class.findUnique({
        where: { id: classId },
        include: {
          subjects: { orderBy: { name: "asc" } },
          students: {
            where: { isActive: true },
            orderBy: [{ firstName: "asc" }, { lastName: "asc" }]
          }
        }
      });

      if (cls) {
        className = `${cls.name} - ${cls.section}`;
        classSubjects = (cls.subjects || []).map(s => ({
          id: s.id,
          name: s.name,
          maxMarks: s.maxMarks || 100,
          passMarks: s.passMarks || 35
        }));
        classStudents = (cls.students || []).map(st => ({
          id: st.id,
          rollNumber: st.rollNumber,
          name: `${st.firstName || ""} ${st.lastName || ""}`.trim() || "Student"
        }));
      }
    }

    const template = generateStandardJsonTemplate(className, classSubjects, classStudents);
    const sanitizedName = className.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();

    return new NextResponse(JSON.stringify(template, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="report_card_template_${sanitizedName}.json"`
      }
    });
  } catch (err: any) {
    console.error("Template generation error:", err);
    return NextResponse.json({ error: "Failed to generate report card template" }, { status: 500 });
  }
}
