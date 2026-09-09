import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
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

    const student = await prisma.student.findUnique({
      where: { id: resolvedParams.id },
      include: {
        class: true,
        parents: { include: { parent: { include: { user: true } } } },
        attendances: true,
        marks: { include: { subject: true } }
      }
    });

    if (!student) {
      return new NextResponse("Student not found", { status: 404 });
    }

    // PDFKit requires streams. We can use a readable stream to pipe it to the NextResponse.
    const stream = new ReadableStream({
      start(controller) {
        const doc = new PDFDocument({ margin: 50 });

        doc.on('data', (chunk) => controller.enqueue(chunk));
        doc.on('end', () => controller.close());

        // Header
        doc.fontSize(20).text('SRT School Portal', { align: 'center' });
        doc.moveDown();
        doc.fontSize(16).text('Student Profile Report', { align: 'center' });
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
          { label: 'Name', value: `${student.firstName} ${student.lastName}` },
          { label: 'Roll Number', value: student.rollNumber },
          { label: 'Admission Number', value: student.admissionNo },
          { label: 'Gender', value: student.gender || 'N/A' },
          { label: 'Date of Birth', value: student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString() : 'N/A' },
          { label: 'Address', value: student.address || 'N/A' },
          { label: 'Status', value: student.isActive ? 'Active' : 'Inactive' },
        ];
        drawTable('Personal Information', personalData);

        const totalDays = student.attendances.length;
        const presentDays = student.attendances.filter(a => a.status === 'PRESENT').length;
        const attPercent = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

        const academicData = [
          { label: 'Class', value: student.class ? `${student.class.name} - ${student.class.section}` : 'Unassigned' },
          { label: 'Attendance', value: `${attPercent}% (${presentDays} / ${totalDays} days)` },
        ];
        drawTable('Academic Information', academicData);

        const parentData = student.parents.length > 0 
          ? student.parents.map((p, i) => ({
              label: `Parent ${i + 1}`, 
              value: `${p.parent.user.name} | ${p.parent.user.email} | ${p.parent.phone || 'No phone'}` 
            }))
          : [{ label: 'Parents', value: 'No parent records found.' }];
        
        drawTable('Parent/Guardian Details', parentData);

        // Finish the document
        doc.end();
      }
    });

    return new NextResponse(stream as unknown as ReadableStream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="student_${student.rollNumber}_profile.pdf"`,
      },
    });

  } catch (error) {
    console.error(error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
