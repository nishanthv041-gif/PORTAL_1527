import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ testId: string }> }
) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const testId = resolvedParams.testId;
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get("format") || "xlsx").toLowerCase();

    // 1. Fetch Exam/Test details
    const exam = await prisma.exam.findUnique({
      where: { id: testId },
      include: {
        class: {
          include: {
            subjects: { orderBy: { name: "asc" } },
            students: { orderBy: [{ rollNumber: "asc" }, { firstName: "asc" }] },
          },
        },
        reportCards: {
          include: {
            student: true,
            subjectMarks: true,
          },
          orderBy: { rank: "asc" },
        },
      },
    });

    if (!exam) {
      return NextResponse.json({ error: "Exam / Test not found" }, { status: 404 });
    }

    // Role-based authorization
    if (session.user.role === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: session.user.id },
        include: { classes: true, classTeacherOf: true },
      });
      const teachesClass =
        teacher?.classes.some((c) => c.id === exam.classId) ||
        teacher?.classTeacherOf?.id === exam.classId;
      if (!teachesClass) {
        return NextResponse.json({ error: "Forbidden: Not class teacher" }, { status: 403 });
      }
    } else if (session.user.role === "PARENT") {
      // Parent can only view/export if their child is in the exam
      const parent = await prisma.parent.findUnique({
        where: { userId: session.user.id },
        include: { children: { select: { studentId: true } } },
      });
      const childIds = (parent?.children || []).map((s: { studentId: string }) => s.studentId);
      const hasChildInExam = exam.reportCards.some((rc) => childIds.includes(rc.studentId));
      if (!hasChildInExam) {
        return NextResponse.json({ error: "Forbidden: No enrolled student found" }, { status: 403 });
      }
    }

    const className = exam.class?.name || "Class";
    const section = exam.class?.section || "";
    const examName = exam.name;
    const examDateStr = exam.date ? new Date(exam.date).toISOString().split("T")[0] : "";

    // Collect all dynamic subjects present across report cards or class
    const subjectMap = new Map<string, { id: string; name: string; maxMarks: number; passMarks: number }>();
    (exam.class?.subjects || []).forEach((s) => {
      subjectMap.set(s.name.toUpperCase(), {
        id: s.id,
        name: s.name,
        maxMarks: s.maxMarks || 100,
        passMarks: s.passMarks || 35,
      });
    });

    exam.reportCards.forEach((rc) => {
      rc.subjectMarks.forEach((sm) => {
        const key = sm.subjectName.toUpperCase();
        if (!subjectMap.has(key)) {
          subjectMap.set(key, {
            id: sm.subjectId || sm.id,
            name: sm.subjectName,
            maxMarks: sm.maxMarks,
            passMarks: sm.passMark,
          });
        }
      });
    });

    const subjectsList = Array.from(subjectMap.values());

    // ==========================================
    // EXCEL EXPORT (xlsx)
    // ==========================================
    if (format === "xlsx" || format === "excel") {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Full Class Marks Table
      const headerRow = [
        "S.No",
        "Roll No",
        "Student Name",
        ...subjectsList.map((s) => `${s.name} (${s.maxMarks})`),
        "Total",
        "Max Total",
        "Percentage (%)",
        "Grade",
        "Result",
        "Rank",
        "Attendance",
      ];

      const dataRows: any[][] = [];
      let totalSum = 0;
      let highestScore = 0;
      let lowestScore = 999999;
      let passCount = 0;
      let failCount = 0;

      exam.reportCards.forEach((rc, idx) => {
        const stName = `${rc.student.firstName} ${rc.student.lastName}`.trim();
        const row: any[] = [
          idx + 1,
          rc.student.rollNumber || "-",
          stName,
        ];

        subjectsList.forEach((sub) => {
          const sm = rc.subjectMarks.find(
            (m) => m.subjectName.toUpperCase() === sub.name.toUpperCase()
          );
          if (!sm) {
            row.push("-");
          } else if (sm.absent || sm.status === "ABSENT") {
            row.push("ABSENT");
          } else if (sm.marks !== null && sm.marks !== undefined) {
            row.push(sm.marks);
          } else {
            row.push("-");
          }
        });

        row.push(
          rc.totalMarks,
          rc.maxTotal || (subjectsList.length * 100),
          rc.percentage,
          rc.overallGrade || rc.grade,
          rc.result || (rc.percentage >= 35 ? "PASS" : "FAIL"),
          rc.rank || "-",
          rc.attendance || "-"
        );

        totalSum += rc.totalMarks;
        if (rc.totalMarks > highestScore) highestScore = rc.totalMarks;
        if (rc.totalMarks < lowestScore) lowestScore = rc.totalMarks;
        if (rc.result === "PASS" || rc.percentage >= 35) passCount++;
        else failCount++;

        dataRows.push(row);
      });

      const totalStudents = exam.reportCards.length;
      const classAvg = totalStudents > 0 ? (totalSum / totalStudents).toFixed(1) : "0";
      const passRate = totalStudents > 0 ? ((passCount / totalStudents) * 100).toFixed(1) + "%" : "0%";
      if (lowestScore === 999999) lowestScore = 0;

      const wsClass = XLSX.utils.aoa_to_sheet([
        ["SRT Universal School"],
        ["Seeing Righteousness & Truth"],
        [`Exam: ${examName} | Class: ${className} - ${section} | Date: ${examDateStr}`],
        [],
        headerRow,
        ...dataRows,
      ]);

      // Sheet 2: Summary Stats
      const summaryRows = [
        ["Metric", "Value"],
        ["Examination", examName],
        ["Class & Section", `${className} - ${section}`],
        ["Examination Date", examDateStr],
        ["Total Students", totalStudents],
        ["Total Appeared", totalStudents],
        ["Passed", passCount],
        ["Failed", failCount],
        ["Pass Rate", passRate],
        ["Class Average Total", classAvg],
        ["Highest Mark", highestScore],
        ["Lowest Mark", lowestScore],
        [],
        ["Subject", "Max Mark", "Pass Mark"],
        ...subjectsList.map((s) => [s.name, s.maxMarks, s.passMarks]),
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);

      XLSX.utils.book_append_sheet(wb, wsClass, "Class Mark Sheet");
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary Statistics");

      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      const safeName = `${examName}_${className}_${section}`.replace(/[^a-zA-Z0-9]/g, "_");
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="Class_Marksheet_${safeName}.xlsx"`,
        },
      });
    }

    // ==========================================
    // PDF EXPORT (Landscape A4)
    // ==========================================
    const logoPath = path.join(process.cwd(), "public", "logo", "srt-logo.png");
    const hasLogo = fs.existsSync(logoPath);

    return new Promise<NextResponse>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: "A4",
          layout: "landscape",
          margin: 30,
          info: { Title: `Class Mark Sheet - ${examName} ${className}` },
        });

        const chunks: Buffer[] = [];
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => {
          const pdfBuffer = Buffer.concat(chunks);
          const safeName = `${examName}_${className}_${section}`.replace(/[^a-zA-Z0-9]/g, "_");
          resolve(
            new NextResponse(new Uint8Array(pdfBuffer), {
              status: 200,
              headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="Class_Marksheet_${safeName}.pdf"`,
              },
            })
          );
        });

        // Header Block
        if (hasLogo) {
          try {
            doc.image(logoPath, 35, 25, { width: 45, height: 45 });
          } catch (e) {
            // Non-fatal
          }
        }

        const headerX = hasLogo ? 90 : 35;
        doc
          .font("Helvetica-Bold")
          .fontSize(16)
          .fillColor("#0f172a")
          .text("SRT Universal School", headerX, 26);
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#64748b")
          .text("Seeing Righteousness & Truth • Comprehensive Class Mark Sheet", headerX, 44);

        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor("#1e293b")
          .text(`Exam: ${examName}`, 580, 26, { align: "right" });
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#64748b")
          .text(`Class: ${className} - ${section} | Date: ${examDateStr}`, 580, 42, { align: "right" });

        // Divider
        doc.moveTo(35, 75).lineTo(805, 75).strokeColor("#cbd5e1").lineWidth(1).stroke();

        // Table Header
        let tableTop = 88;
        const colWidths = [30, 75, 130]; // S.No, Roll No, Name
        const subCount = Math.max(1, subjectsList.length);
        const remainingWidth = 805 - 35 - 30 - 75 - 130 - 45 - 45 - 40 - 45 - 35; // Total, Max, %, Grd, Rnk
        const subWidth = Math.max(45, Math.floor(remainingWidth / subCount));

        doc.rect(35, tableTop, 770, 22).fill("#1e3a8a");
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff");

        let curX = 40;
        doc.text("S.No", curX, tableTop + 7, { width: 25, align: "center" });
        curX += 30;
        doc.text("Roll No", curX, tableTop + 7, { width: 70 });
        curX += 75;
        doc.text("Student Name", curX, tableTop + 7, { width: 125 });
        curX += 130;

        subjectsList.forEach((sub) => {
          doc.text(sub.name.slice(0, 8), curX, tableTop + 7, { width: subWidth, align: "center" });
          curX += subWidth;
        });

        doc.text("Total", curX, tableTop + 7, { width: 45, align: "center" });
        curX += 45;
        doc.text("%", curX, tableTop + 7, { width: 40, align: "center" });
        curX += 40;
        doc.text("Grade", curX, tableTop + 7, { width: 40, align: "center" });
        curX += 40;
        doc.text("Result", curX, tableTop + 7, { width: 45, align: "center" });
        curX += 45;
        doc.text("Rank", curX, tableTop + 7, { width: 35, align: "center" });

        // Table Rows
        let rowY = tableTop + 22;
        exam.reportCards.forEach((rc, rIdx) => {
          if (rowY > 520) {
            doc.addPage({ size: "A4", layout: "landscape", margin: 30 });
            rowY = 40;
          }

          const isEven = rIdx % 2 === 0;
          doc.rect(35, rowY, 770, 18).fill(isEven ? "#f8fafc" : "#ffffff");

          doc.font("Helvetica").fontSize(8).fillColor("#1e293b");
          let x = 40;
          doc.text(String(rIdx + 1), x, rowY + 5, { width: 25, align: "center" });
          x += 30;
          doc.text(rc.student.rollNumber || "-", x, rowY + 5, { width: 70 });
          x += 75;
          const stName = `${rc.student.firstName} ${rc.student.lastName}`.trim();
          doc.text(stName.slice(0, 22), x, rowY + 5, { width: 125 });
          x += 130;

          subjectsList.forEach((sub) => {
            const sm = rc.subjectMarks.find(
              (m) => m.subjectName.toUpperCase() === sub.name.toUpperCase()
            );
            const scoreText = sm?.absent ? "AB" : sm?.marks !== null && sm?.marks !== undefined ? String(sm.marks) : "-";
            const isFail = sm && !sm.absent && sm.marks !== null && sm.marks < sm.passMark;
            if (isFail) doc.fillColor("#dc2626");
            doc.text(scoreText, x, rowY + 5, { width: subWidth, align: "center" });
            doc.fillColor("#1e293b");
            x += subWidth;
          });

          doc.font("Helvetica-Bold").text(String(rc.totalMarks), x, rowY + 5, { width: 45, align: "center" });
          x += 45;
          doc.font("Helvetica").text(`${rc.percentage}%`, x, rowY + 5, { width: 40, align: "center" });
          x += 40;
          doc.text(rc.overallGrade || rc.grade, x, rowY + 5, { width: 40, align: "center" });
          x += 40;

          const res = rc.result || (rc.percentage >= 35 ? "PASS" : "FAIL");
          doc.fillColor(res === "PASS" ? "#16a34a" : "#dc2626");
          doc.font("Helvetica-Bold").text(res, x, rowY + 5, { width: 45, align: "center" });
          doc.fillColor("#1e293b").font("Helvetica");
          x += 45;

          doc.text(rc.rank ? `#${rc.rank}` : "-", x, rowY + 5, { width: 35, align: "center" });

          rowY += 18;
        });

        // Summary Footer
        doc.moveTo(35, rowY + 8).lineTo(805, rowY + 8).strokeColor("#cbd5e1").lineWidth(0.5).stroke();
        doc.font("Helvetica").fontSize(8).fillColor("#64748b").text(
          `Generated automatically on ${new Date().toLocaleString()} • SRT Universal School Portal`,
          35,
          rowY + 12
        );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  } catch (err: any) {
    console.error("[Export Route Error]:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate class export" },
      { status: 500 }
    );
  }
}
