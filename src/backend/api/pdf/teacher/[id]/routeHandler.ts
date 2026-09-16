import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import PDFDocument from 'pdfkit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const session = await getServerSession(authOptions);
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const teacher = await prisma.teacher.findUnique({
      where: { id: resolvedParams.id },
      include: {
        user: true,
        classes: true,
        subjects: { include: { class: true } }
      }
    });

    if (!teacher) {
      return new NextResponse("Teacher not found", { status: 404 });
    }

    const stream = new ReadableStream({
      start(controller) {
        const doc = new PDFDocument({ margin: 50 });

        doc.on('data', (chunk) => controller.enqueue(chunk));
        doc.on('end', () => controller.close());

        // Header
        doc.fontSize(20).text('SRT School Portal', { align: 'center' });
        doc.moveDown();
        doc.fontSize(16).text('Teacher Profile Report', { align: 'center' });
        doc.moveDown(2);

        const drawTable = (title: string, data: { label: string; value: string }[]) => {
          doc.moveDown();
          doc.fontSize(14).text(title, { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(10);
          
          const startX = 50;
          let currentY = doc.y;
          const rowHeight = 20;
          const col1Width = 150;
          const col2Width = 350;
          
          doc.lineWidth(0.5);
          doc.rect(startX, currentY, col1Width + col2Width, data.length * rowHeight).stroke();
          
          data.forEach((row, i) => {
            // Draw row separator
            if (i > 0) {
              doc.moveTo(startX, currentY).lineTo(startX + col1Width + col2Width, currentY).stroke();
            }
            
            // Draw column separator
            if (i === 0) {
              doc.moveTo(startX + col1Width, currentY).lineTo(startX + col1Width, currentY + data.length * rowHeight).stroke();
            }
            
            // Draw text
            doc.font('Helvetica-Bold').text(row.label, startX + 5, currentY + 5, { width: col1Width - 10 });
            doc.font('Helvetica').text(row.value, startX + col1Width + 5, currentY + 5, { width: col2Width - 10 });
            
            currentY += rowHeight;
          });
          
          doc.y = currentY + 20;
        };

        const personalData = [
          { label: 'Name', value: teacher.user.name },
          { label: 'Email', value: teacher.user.email },
          { label: 'Google SSO Email', value: teacher.user.googleEmail ? `${teacher.user.googleEmail} (${teacher.user.googleEmailVerified ? 'Verified' : 'Unverified'})` : 'N/A' },
          { label: 'Phone', value: teacher.phone || 'N/A' },
          { label: 'Qualification', value: teacher.qualification || 'N/A' },
          { label: 'Join Date', value: teacher.joinDate ? new Date(teacher.joinDate).toLocaleDateString() : 'N/A' },
          { label: 'Status', value: teacher.isActive ? 'Active' : 'Inactive' },
        ];
        drawTable('Personal Information', personalData);

        const classData = teacher.classes.length > 0
          ? teacher.classes.map((c, i) => ({ label: `Class ${i + 1}`, value: `${c.name} - Section ${c.section}` }))
          : [{ label: 'Class Teacher', value: 'Not assigned as class teacher.' }];
        drawTable('Class Teacher For', classData);

        const subjectData = teacher.subjects.length > 0
          ? teacher.subjects.map((s, i) => ({ label: `Subject ${i + 1}`, value: `${s.name} (Class: ${s.class ? `${s.class.name}-${s.class.section}` : 'N/A'})` }))
          : [{ label: 'Subjects', value: 'No subjects assigned.' }];
        drawTable('Subjects Taught', subjectData);

        // Finish the document
        doc.end();
      }
    });

    return new NextResponse(stream as unknown as ReadableStream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="teacher_${teacher.user.name.replace(/\s+/g, '_')}_profile.pdf"`,
      },
    });

  } catch (error) {
    console.error(error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
