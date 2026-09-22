import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import PDFDocument from 'pdfkit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const session = await getServerSession(getAuthOptions());
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const parent = await prisma.parent.findUnique({
      where: { id: resolvedParams.id },
      include: {
        user: true,
        children: {
          include: {
            student: {
              include: {
                class: true
              }
            }
          }
        }
      }
    });

    if (!parent) {
      return new NextResponse("Parent not found", { status: 404 });
    }

    const stream = new ReadableStream({
      start(controller) {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });

        doc.on('data', (chunk: Buffer) => controller.enqueue(chunk));
        doc.on('end', () => controller.close());
        doc.on('error', (err: Error) => controller.error(err));

        // Header
        doc.fontSize(22).text('SCHOOL ADMIN PORTAL', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(16).text('Parent Profile Report', { align: 'center' });
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
            if (i > 0) {
              doc.moveTo(startX, currentY).lineTo(startX + col1Width + col2Width, currentY).stroke();
            }
            if (i === 0) {
              doc.moveTo(startX + col1Width, currentY).lineTo(startX + col1Width, currentY + data.length * rowHeight).stroke();
            }
            doc.font('Helvetica-Bold').text(row.label, startX + 5, currentY + 5, { width: col1Width - 10 });
            doc.font('Helvetica').text(row.value, startX + col1Width + 5, currentY + 5, { width: col2Width - 10 });
            currentY += rowHeight;
          });
          
          doc.y = currentY + 20;
        };

        const personalData = [
          { label: 'Name', value: parent.user.name },
          { label: 'Email', value: parent.user.email },
          { label: 'Phone', value: parent.phone || 'N/A' },
          { label: 'Occupation', value: parent.occupation || 'N/A' },
          { label: 'Account Status', value: parent.isActive ? 'Active' : 'Inactive' },
        ];
        drawTable('Personal Information', personalData);

        const childrenData = parent.children.length > 0
          ? parent.children.map((c, i) => ({
              label: `Child ${i + 1}`,
              value: `${c.student.firstName} ${c.student.lastName} | Roll: ${c.student.rollNumber} | Class: ${c.student.class ? `${c.student.class.name} - ${c.student.class.section}` : 'N/A'}`
            }))
          : [{ label: 'Children', value: 'No students linked.' }];
        drawTable('Linked Students', childrenData);

        doc.end();
      }
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="parent-${parent.id}.pdf"`,
      }
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      return new NextResponse(error.message, { status: 500 });
    }
    return new NextResponse("Failed to generate PDF", { status: 500 });
  }
}
