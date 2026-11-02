import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from '@/backend/db/prisma';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || (searchParams.get('classId') && !searchParams.get('studentId') ? 'class' : 'student');
    const studentId = searchParams.get('studentId');
    const examId = searchParams.get('examId');
    const classId = searchParams.get('classId');
    const download = searchParams.get('download') !== 'false';

    const logoPath = path.join(process.cwd(), 'public', 'logo', 'srt-logo.png');
    const hasLogo = fs.existsSync(logoPath);

    // ==========================================
    // 1. CLASS MARK SHEET PDF (LANDSCAPE A4)
    // ==========================================
    if (type === 'class') {
      if (!examId && !classId) {
        return NextResponse.json({ error: 'Missing classId or examId' }, { status: 400 });
      }

      const exam = examId ? await prisma.exam.findUnique({
        where: { id: examId },
        include: { class: { include: { students: { orderBy: { rollNumber: 'asc' } } } } }
      }) : null;

      const targetClassId = classId || exam?.classId;
      if (!targetClassId) {
        return NextResponse.json({ error: 'Class not found' }, { status: 404 });
      }

      const classData = await prisma.class.findUnique({
        where: { id: targetClassId },
        include: {
          students: { orderBy: [{ rollNumber: 'asc' }, { firstName: 'asc' }] },
          subjects: { orderBy: { name: 'asc' } }
        }
      });

      if (!classData) {
        return NextResponse.json({ error: 'Class not found' }, { status: 404 });
      }

      // Teacher / Parent access check
      if (session.user.role === 'TEACHER') {
        const teacher = await prisma.teacher.findUnique({
          where: { userId: session.user.id },
          include: { classes: true, subjects: true }
        });
        const teachesClass = teacher?.classes.some(c => c.id === targetClassId);
        const teachesSub = teacher?.subjects.some(s => s.classId === targetClassId);
        if (!teachesClass && !teachesSub) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      }

      // Fetch all report cards and marks for this exam or class
      const reportCards = await prisma.reportCard.findMany({
        where: {
          examId: examId || undefined,
          student: { classId: targetClassId }
        },
        include: {
          student: true,
          subjectMarks: true
        }
      });

      const marks = await prisma.mark.findMany({
        where: {
          examId: examId || undefined,
          student: { classId: targetClassId }
        },
        include: { subject: true }
      });

      const examName = exam?.name || 'Class Examination';
      const academicYear = '2025-2026';
      const examDate = exam?.date ? new Date(exam.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-IN');

      return new Promise<NextResponse>((resolve, reject) => {
        try {
          const doc = new PDFDocument({
            size: 'A4',
            layout: 'landscape',
            margin: 30,
            info: { Title: `Class Mark Sheet - ${classData.name} ${classData.section}` }
          });
          const buffers: Buffer[] = [];
          doc.on('data', buffers.push.bind(buffers));
          doc.on('end', () => {
            const pdfData = Buffer.concat(buffers);
            const safeClass = `${classData.name}${classData.section}`.replace(/[^a-zA-Z0-9]/g, '');
            const safeExam = examName.replace(/[^a-zA-Z0-9]/g, '');
            resolve(new NextResponse(pdfData, {
              status: 200,
              headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': download
                  ? `attachment; filename="SRT_${safeClass}_${safeExam}_ClassMarkSheet.pdf"`
                  : 'inline',
              },
            }));
          });

          // Header
          if (hasLogo) {
            try {
              doc.image(logoPath, 35, 25, { width: 50 });
            } catch (e) {
              // Ignore image load error fallback to text
            }
          }

          doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f172a').text('SRT UNIVERSAL SCHOOL', 95, 26);
          doc.font('Helvetica-Oblique').fontSize(9).fillColor('#64748b').text('Seeing Righteousness & Truth  •  Affiliated to State Board & CBSE Curriculum', 95, 44);
          doc.font('Helvetica-Bold').fontSize(11).fillColor('#1e293b').text(`CONSOLIDATED CLASS MARK SHEET — ${examName.toUpperCase()}`, 95, 58);

          doc.font('Helvetica').fontSize(9).fillColor('#334155');
          doc.text(`Class & Section: Class ${classData.name} - ${classData.section}`, 550, 26, { align: 'right' });
          doc.text(`Academic Year: ${academicYear}`, 550, 40, { align: 'right' });
          doc.text(`Date of Issue: ${examDate}`, 550, 54, { align: 'right' });

          doc.moveTo(35, 76).lineTo(805, 76).strokeColor('#cbd5e1').lineWidth(1).stroke();

          // Table Config
          const subjects = classData.subjects;
          const tableTop = 86;
          const left = 35;
          const rowHeight = 22;

          // Compute column widths dynamically
          const rollW = 80;
          const nameW = 140;
          const subCount = Math.max(1, subjects.length);
          const subColW = Math.min(65, Math.floor((400) / subCount));
          const totalW = 45;
          const pctW = 45;
          const grdW = 35;
          const resW = 45;
          const rnkW = 35;

          // Header Row
          doc.rect(left, tableTop, 770, rowHeight).fill('#1e293b');
          doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);

          let curX = left + 5;
          doc.text('Roll No', curX, tableTop + 7, { width: rollW - 10 });
          curX += rollW;
          doc.text('Student Name', curX, tableTop + 7, { width: nameW - 10 });
          curX += nameW;

          subjects.forEach(sub => {
            const shortName = sub.name.length > 9 ? sub.name.substring(0, 8) + '.' : sub.name;
            doc.text(`${shortName} (${sub.maxMarks})`, curX, tableTop + 7, { width: subColW - 6, align: 'center' });
            curX += subColW;
          });

          doc.text('Total', curX, tableTop + 7, { width: totalW, align: 'center' });
          curX += totalW;
          doc.text('%', curX, tableTop + 7, { width: pctW, align: 'center' });
          curX += pctW;
          doc.text('Grd', curX, tableTop + 7, { width: grdW, align: 'center' });
          curX += grdW;
          doc.text('Result', curX, tableTop + 7, { width: resW, align: 'center' });
          curX += resW;
          doc.text('Rank', curX, tableTop + 7, { width: rnkW, align: 'center' });

          // Rows
          let y = tableTop + rowHeight;
          let highestTotal = 0;
          let topperName = '-';
          let passCount = 0;
          let totalScoreSum = 0;
          let validTotalCount = 0;

          classData.students.forEach((st, sIdx) => {
            if (y > 480) {
              doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 });
              y = 40;
            }

            const rc = reportCards.find(r => r.studentId === st.id);
            const stMarks = marks.filter(m => m.studentId === st.id);

            const isEven = sIdx % 2 === 0;
            doc.rect(left, y, 770, rowHeight).fill(isEven ? '#f8fafc' : '#ffffff');

            doc.fillColor('#0f172a').font('Helvetica').fontSize(8);
            let rowX = left + 5;

            // Roll
            doc.font('Helvetica-Bold').text(st.rollNumber || `S${sIdx + 1}`, rowX, y + 6, { width: rollW - 10 });
            rowX += rollW;

            // Name
            const fullName = `${st.firstName} ${st.lastName || ''}`.trim();
            doc.font('Helvetica').text(fullName, rowX, y + 6, { width: nameW - 10 });
            rowX += nameW;

            // Subjects
            subjects.forEach(sub => {
              const sm = rc?.subjectMarks?.find(m => m.subjectId === sub.id);
              const fallbackMark = stMarks.find(m => m.subjectId === sub.id);
              let val = '-';
              if (sm) {
                if (sm.marks === null || sm.marks === undefined) {
                  val = (sm as any).remarks === 'Absent' ? 'AB' : '-';
                } else {
                  val = `${sm.marks} (${sm.grade || '-'})`;
                }
              } else if (fallbackMark) {
                val = `${fallbackMark.score}`;
              }
              doc.text(val, rowX, y + 6, { width: subColW - 6, align: 'center' });
              rowX += subColW;
            });

            const tot = rc?.totalMarks ?? stMarks.reduce((acc, m) => acc + (m.score || 0), 0);
            const pct = rc?.percentage ?? (subjects.length > 0 ? (tot / (subjects.length * 100)) * 100 : 0);
            const gr = rc?.overallGrade || rc?.grade || (pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B+' : pct >= 60 ? 'B' : pct >= 50 ? 'C' : pct >= 35 ? 'D' : 'F');
            const res = rc?.result || (pct >= 35 ? 'PASS' : 'FAIL');
            const rnk = rc?.rank ? `#${rc.rank}` : '-';

            if (tot > highestTotal) {
              highestTotal = tot;
              topperName = fullName;
            }
            if (res === 'PASS') passCount++;
            if (tot > 0) {
              totalScoreSum += tot;
              validTotalCount++;
            }

            doc.font('Helvetica-Bold').text(tot.toString(), rowX, y + 6, { width: totalW, align: 'center' });
            rowX += totalW;
            doc.font('Helvetica').text(`${pct.toFixed(1)}%`, rowX, y + 6, { width: pctW, align: 'center' });
            rowX += pctW;
            doc.font('Helvetica-Bold').text(gr, rowX, y + 6, { width: grdW, align: 'center' });
            rowX += grdW;

            doc.fillColor(res === 'PASS' ? '#059669' : '#dc2626')
              .font('Helvetica-Bold')
              .text(res, rowX, y + 6, { width: resW, align: 'center' });
            rowX += resW;

            doc.fillColor('#0f172a').font('Helvetica').text(rnk, rowX, y + 6, { width: rnkW, align: 'center' });

            y += rowHeight;
          });

          // Summary Stats Box & Signatures
          const totalStudents = classData.students.length;
          const passPct = totalStudents > 0 ? ((passCount / totalStudents) * 100).toFixed(1) : '0';
          const avgScore = validTotalCount > 0 ? (totalScoreSum / validTotalCount).toFixed(1) : '0';

          y = Math.max(y + 10, 470);
          doc.rect(left, y, 770, 45).fill('#f1f5f9');
          doc.rect(left, y, 770, 45).strokeColor('#cbd5e1').lineWidth(0.75).stroke();

          doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(8.5);
          doc.text(`Total Students: ${totalStudents}`, left + 15, y + 10);
          doc.text(`Passed: ${passCount}  |  Failed: ${totalStudents - passCount}`, left + 15, y + 25);

          doc.text(`Pass Percentage: ${passPct}%`, left + 200, y + 10);
          doc.text(`Class Average Score: ${avgScore}`, left + 200, y + 25);

          doc.text(`Highest Total: ${highestTotal}`, left + 400, y + 10);
          doc.text(`Class Topper: ${topperName}`, left + 400, y + 25);

          // Grade Scale Legend
          doc.font('Helvetica').fontSize(7.5).fillColor('#64748b');
          doc.text('Grading Scale: A+ (90-100) | A (80-89) | B+ (70-79) | B (60-69) | C (50-59) | D (35-49) | F (<35)', left + 15, y + 36);

          // Signatures
          y += 55;
          doc.moveTo(left + 30, y).lineTo(left + 170, y).strokeColor('#475569').lineWidth(1).stroke();
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#1e293b').text('CLASS TEACHER', left + 55, y + 5);

          doc.moveTo(left + 320, y).lineTo(left + 460, y).strokeColor('#475569').lineWidth(1).stroke();
          doc.text('ACADEMIC COORDINATOR', left + 325, y + 5);

          doc.moveTo(left + 610, y).lineTo(left + 740, y).strokeColor('#475569').lineWidth(1).stroke();
          doc.text('PRINCIPAL', left + 655, y + 5);

          doc.end();
        } catch (err) {
          reject(err);
        }
      });
    }

    // ==========================================
    // 2. SINGLE STUDENT REPORT CARD PDF (PORTRAIT A4)
    // ==========================================
    if (!studentId || !examId) {
      return NextResponse.json({ error: 'Missing studentId or examId' }, { status: 400 });
    }

    if (session.user.role === 'PARENT') {
      const parentUser = await prisma.parent.findUnique({
        where: { userId: session.user.id },
        include: { children: true }
      });
      if (!parentUser || !parentUser.children.some(c => c.studentId === studentId)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { class: true }
    });

    const exam = await prisma.exam.findUnique({
      where: { id: examId }
    });

    const reportCard = await prisma.reportCard.findUnique({
      where: { studentId_examId: { studentId, examId } },
      include: { subjectMarks: true }
    });

    if (!student || !exam || !reportCard) {
      return NextResponse.json({ error: 'Data not found' }, { status: 404 });
    }

    const marks = await prisma.mark.findMany({
      where: { studentId, examId },
      include: { subject: true }
    });

    return new Promise<NextResponse>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'portrait',
          margin: 40,
          info: { Title: `Report Card - ${student.firstName} ${student.lastName || ''}` }
        });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          const safeRoll = (student.rollNumber || student.id).replace(/[^a-zA-Z0-9]/g, '');
          const safeExam = exam.name.replace(/[^a-zA-Z0-9]/g, '');
          resolve(new NextResponse(pdfData, {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': download
                ? `attachment; filename="SRT_ReportCard_${safeRoll}_${safeExam}.pdf"`
                : 'inline',
            },
          }));
        });

        // Header Border Frame
        doc.rect(20, 20, 555, 802).strokeColor('#cbd5e1').lineWidth(1.5).stroke();
        doc.rect(23, 23, 549, 796).strokeColor('#0f172a').lineWidth(0.5).stroke();

        // School Logo
        if (hasLogo) {
          try {
            doc.image(logoPath, 45, 38, { width: 55 });
          } catch (e) {
            // Ignore logo error
          }
        }

        // Header Titles
        doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a').text('SRT UNIVERSAL SCHOOL', 115, 38);
        doc.font('Helvetica-Oblique').fontSize(9.5).fillColor('#64748b').text('Seeing Righteousness & Truth  •  Affiliated to State Board & CBSE Curriculum', 115, 58);
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#2563eb').text('OFFICIAL ACADEMIC REPORT CARD', 115, 74);

        doc.moveTo(40, 98).lineTo(555, 98).strokeColor('#cbd5e1').lineWidth(1).stroke();

        // Student Info Grid
        doc.rect(40, 108, 515, 75).fill('#f8fafc');
        doc.rect(40, 108, 515, 75).strokeColor('#e2e8f0').lineWidth(1).stroke();

        doc.font('Helvetica-Bold').fontSize(9).fillColor('#475569');
        doc.text('STUDENT NAME:', 55, 118);
        doc.text('ROLL NUMBER:', 55, 138);
        doc.text('CLASS & SECTION:', 55, 158);

        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a');
        doc.text(`${student.firstName} ${student.lastName || ''}`.trim(), 160, 118);
        doc.text(student.rollNumber || '-', 160, 138);
        doc.text(`${student.class?.name || ''} - ${student.class?.section || ''}`, 160, 158);

        doc.font('Helvetica-Bold').fontSize(9).fillColor('#475569');
        doc.text('EXAMINATION:', 330, 118);
        doc.text('EXAM DATE:', 330, 138);
        doc.text('ATTENDANCE:', 330, 158);

        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a');
        doc.text(exam.name, 420, 118);
        doc.text(new Date(exam.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), 420, 138);
        doc.text(reportCard.attendance || '96%', 420, 158);

        // Subject Marks Table
        const tableTop = 198;
        const rowHeight = 24;
        const col1 = 40;  // Subject (180w)
        const col2 = 220; // Max (65w)
        const col3 = 285; // Pass (65w)
        const col4 = 350; // Obtained (75w)
        const col5 = 425; // Grade (55w)
        const col6 = 480; // Remarks (75w)

        doc.rect(col1, tableTop, 515, rowHeight).fill('#1e293b');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);

        doc.text('SUBJECT', col1 + 10, tableTop + 8);
        doc.text('MAX', col2, tableTop + 8, { width: 65, align: 'center' });
        doc.text('PASS', col3, tableTop + 8, { width: 65, align: 'center' });
        doc.text('SCORED', col4, tableTop + 8, { width: 75, align: 'center' });
        doc.text('GRADE', col5, tableTop + 8, { width: 55, align: 'center' });
        doc.text('STATUS', col6, tableTop + 8, { width: 70, align: 'center' });

        let currentY = tableTop + rowHeight;

        // Merge subject marks
        const subjectsData = marks.map(m => {
          const detail = reportCard.subjectMarks?.find(sm => sm.subjectId === m.subjectId);
          return {
            name: m.subject.name,
            maxMarks: m.maxScore,
            passMarks: (m as any).passMarks || 35,
            score: detail?.marks !== undefined && detail?.marks !== null ? detail.marks : m.score,
            grade: detail?.grade || (m.score >= 90 ? 'A+' : m.score >= 80 ? 'A' : m.score >= 70 ? 'B+' : m.score >= 60 ? 'B' : m.score >= 50 ? 'C' : m.score >= 35 ? 'D' : 'F'),
            isAbsent: (m as any).remarks === 'Absent' || (detail as any)?.remarks === 'Absent'
          };
        });

        subjectsData.forEach((s, idx) => {
          const isEven = idx % 2 === 0;
          doc.rect(col1, currentY, 515, rowHeight).fill(isEven ? '#f8fafc' : '#ffffff');

          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9);
          doc.text(s.name, col1 + 10, currentY + 7);

          doc.font('Helvetica').fontSize(9);
          doc.text(s.maxMarks.toString(), col2, currentY + 7, { width: 65, align: 'center' });
          doc.text(s.passMarks.toString(), col3, currentY + 7, { width: 65, align: 'center' });

          const scoredText = s.isAbsent ? 'ABSENT' : s.score.toString();
          doc.font('Helvetica-Bold').text(scoredText, col4, currentY + 7, { width: 75, align: 'center' });

          doc.text(s.isAbsent ? 'F' : s.grade, col5, currentY + 7, { width: 55, align: 'center' });

          const isPass = !s.isAbsent && s.score >= s.passMarks;
          doc.fillColor(isPass ? '#059669' : '#dc2626')
            .text(isPass ? 'PASS' : 'FAIL', col6, currentY + 7, { width: 70, align: 'center' });

          currentY += rowHeight;
        });

        // Overall Summary Card
        currentY += 12;
        doc.rect(col1, currentY, 515, 60).fill('#f1f5f9');
        doc.rect(col1, currentY, 515, 60).strokeColor('#cbd5e1').lineWidth(1).stroke();

        const maxTotal = reportCard.maxTotal || (subjectsData.reduce((acc, s) => acc + s.maxMarks, 0) || 500);
        const overallResult = reportCard.result || (reportCard.percentage >= 35 ? 'PASS' : 'FAIL');
        const overallGrade = reportCard.overallGrade || reportCard.grade;

        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8);
        doc.text('TOTAL MARKS', col1 + 20, currentY + 12);
        doc.text('PERCENTAGE', col1 + 150, currentY + 12);
        doc.text('OVERALL GRADE', col1 + 280, currentY + 12);
        doc.text('FINAL RESULT', col1 + 410, currentY + 12);

        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14);
        doc.text(`${reportCard.totalMarks} / ${maxTotal}`, col1 + 20, currentY + 28);
        doc.text(`${reportCard.percentage.toFixed(1)}%`, col1 + 150, currentY + 28);
        doc.text(overallGrade, col1 + 280, currentY + 28);

        doc.fillColor(overallResult === 'PASS' ? '#059669' : '#dc2626')
          .text(overallResult, col1 + 410, currentY + 28);

        // Teacher Remarks Box
        currentY += 75;
        doc.rect(col1, currentY, 515, 50).fill('#ffffff');
        doc.rect(col1, currentY, 515, 50).strokeColor('#e2e8f0').lineWidth(1).stroke();

        doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(8.5).text('TEACHER REMARKS & EVALUATION FEEDBACK:', col1 + 10, currentY + 8);
        doc.fillColor('#475569').font('Helvetica-Oblique').fontSize(8.5).text(
          reportCard.remarks || 'Shows diligent effort and dedication towards academic excellence. Keep up the high standard!',
          col1 + 10, currentY + 24, { width: 495, lineGap: 3 }
        );

        // Grade Scale Legend
        currentY += 60;
        doc.rect(col1, currentY, 515, 24).fill('#f8fafc');
        doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(
          'Grading Scale: A+ (90-100% Exemplary) | A (80-89% Excellent) | B+ (70-79% Very Good) | B (60-69% Good) | C (50-59% Satisfactory) | D (35-49% Pass) | F (<35% Needs Remediation)',
          col1 + 10, currentY + 8, { width: 495, align: 'center' }
        );

        // Signatures Block
        currentY += 55;
        doc.moveTo(col1 + 15, currentY).lineTo(col1 + 130, currentY).strokeColor('#475569').lineWidth(1).stroke();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#1e293b').text('CLASS TEACHER', col1 + 25, currentY + 5);

        doc.moveTo(col1 + 200, currentY).lineTo(col1 + 315, currentY).strokeColor('#475569').lineWidth(1).stroke();
        doc.text('PARENT / GUARDIAN', col1 + 205, currentY + 5);

        doc.moveTo(col1 + 380, currentY).lineTo(col1 + 495, currentY).strokeColor('#475569').lineWidth(1).stroke();
        doc.text('PRINCIPAL', col1 + 420, currentY + 5);

        doc.end();
      } catch (err) {
        reject(err);
      }
    });

  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
