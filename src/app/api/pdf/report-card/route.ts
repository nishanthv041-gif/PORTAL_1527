import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import PDFDocument from 'pdfkit';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');
    const examId = searchParams.get('examId');
    const download = searchParams.get('download') === 'true';

    if (!studentId || !examId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Verify access if parent
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
      where: {
        studentId_examId: { studentId, examId }
      }
    });

    if (!student || !exam || !reportCard) {
      return NextResponse.json({ error: 'Data not found' }, { status: 404 });
    }

    const marks = await prisma.mark.findMany({
      where: { studentId, examId },
      include: { subject: true }
    });

    // Create a PDF using PDFKit
    return new Promise<NextResponse>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(new NextResponse(pdfData, {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': download
                ? `attachment; filename="${student.firstName}_${student.lastName}_ReportCard.pdf"`
                : 'inline',
            },
          }));
        });

        // Add Content to PDF
        doc.fontSize(20).text('Student Report Card', { align: 'center' });
        doc.moveDown();

        doc.fontSize(12).text(`Student Name: ${student.firstName} ${student.lastName}`);
        doc.text(`Roll Number: ${student.rollNumber}`);
        doc.text(`Class: ${student?.class?.name} - ${student?.class?.section}`);
        doc.text(`Exam: ${exam.name}`);
        doc.text(`Date: ${new Date(exam.date).toLocaleDateString()}`);
        doc.moveDown();

        // Draw Table Header
        const tableTop = 200;
        const col1 = 50;
        const col2 = 250;
        const col3 = 350;
        const col4 = 450;

        doc.font('Helvetica-Bold');
        doc.text('Subject', col1, tableTop);
        doc.text('Marks', col2, tableTop);
        doc.text('Max Marks', col3, tableTop);
        doc.text('Remarks', col4, tableTop);
        
        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
        
        // Draw Table Rows
        doc.font('Helvetica');
        let y = tableTop + 25;
        
        marks.forEach((mark) => {
          doc.text(mark.subject.name, col1, y);
          doc.text(mark.score.toString(), col2, y);
          doc.text(mark.maxScore.toString(), col3, y);
          doc.text(mark.remarks || '-', col4, y);
          y += 20;
        });

        doc.moveTo(50, y).lineTo(550, y).stroke();
        y += 15;

        // Footer Summary
        doc.font('Helvetica-Bold');
        doc.text(`Total Marks: ${reportCard.totalMarks}`, col1, y);
        doc.text(`Percentage: ${reportCard.percentage.toFixed(2)}%`, col1, y + 20);
        doc.text(`Grade: ${reportCard.grade}`, col1, y + 40);
        doc.text(`Overall Remarks: ${reportCard.remarks || 'None'}`, col1, y + 60);

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
