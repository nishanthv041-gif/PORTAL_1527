import { NextResponse } from 'next/server';
import { requireClassTeacherAccess } from '@/lib/teacher/classAccess';
import { prisma } from '@/backend/db/prisma';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('classId');

    if (!classId) {
      return NextResponse.json({ error: 'Missing classId' }, { status: 400 });
    }

    // Server-side authorization check (Class Teacher of this class or Admin)
    await requireClassTeacherAccess(classId);

    const classData = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: {
          where: { isActive: true },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rollNumber: true,
            dateOfBirth: true,
          },
          orderBy: [{ rollNumber: 'asc' }, { firstName: 'asc' }],
        },
      },
    });

    if (!classData) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Filter students with DOB and sort them chronologically by calendar day (Jan 1 to Dec 31)
    const studentsWithDob = classData.students
      .filter((s) => s.dateOfBirth !== null)
      .map((s) => {
        const d = s.dateOfBirth!;
        const month = d.getUTCMonth() + 1;
        const day = d.getUTCDate();
        return {
          id: s.id,
          name: `${s.firstName} ${s.lastName || ''}`.trim(),
          rollNumber: s.rollNumber,
          month,
          day,
          birthdayText: `${day} ${monthNames[month - 1]}`,
        };
      })
      .sort((a, b) => {
        if (a.month !== b.month) return a.month - b.month;
        return a.day - b.day;
      });

    const studentsWithoutDob = classData.students.filter((s) => s.dateOfBirth === null);

    const logoPath = path.join(process.cwd(), 'public', 'logo', 'srt-logo.png');
    const hasLogo = fs.existsSync(logoPath);

    return new Promise<NextResponse>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'portrait',
          margin: 40,
          info: { Title: `Class Birthday Calendar - ${classData.name} ${classData.section}` },
        });

        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          const safeClass = `${classData.name}_${classData.section}`.replace(/[^a-zA-Z0-9_-]/g, '');
          resolve(
            new NextResponse(pdfData, {
              status: 200,
              headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="Birthday_Calendar_${safeClass}.pdf"`,
                'Cache-Control': 'no-store, max-age=0',
              },
            })
          );
        });

        // Header Background Card
        doc.rect(40, 40, 515, 75).fill('#1e293b');
        doc.rect(40, 115, 515, 3).fill('#f59e0b'); // Accent gold strip

        if (hasLogo) {
          try {
            doc.image(logoPath, 55, 48, { width: 55 });
          } catch {}
        }

        const textX = hasLogo ? 120 : 60;
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16).text('SRT UNIVERSAL SCHOOL', textX, 52);
        doc.fillColor('#f59e0b').font('Helvetica-Bold').fontSize(11).text('CLASSROOM BIRTHDAY CALENDAR', textX, 73);
        doc.fillColor('#cbd5e1').font('Helvetica').fontSize(9.5).text(
          `Class: ${classData.name} - ${classData.section}   |   Notice Board Copy   |   Academic Year 2025-2026`,
          textX,
          92
        );

        let curY = 135;

        // Privacy badge notice
        doc.rect(40, curY, 515, 20).fill('#f8fafc');
        doc.rect(40, curY, 515, 20).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(8).text(
          'Note: Only celebration day and month are displayed to celebrate our students while honoring their privacy.',
          48,
          curY + 6,
          { width: 500, align: 'center' }
        );

        curY += 32;

        // Table Header
        const colSno = 40;
        const colRoll = 80;
        const colName = 160;
        const colBday = 390;

        const wSno = 40;
        const wRoll = 80;
        const wName = 230;
        const wBday = 165;

        doc.rect(40, curY, 515, 24).fill('#0f172a');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
        doc.text('#', colSno + 6, curY + 7, { width: wSno - 10, align: 'center' });
        doc.text('Roll No', colRoll + 6, curY + 7, { width: wRoll - 10 });
        doc.text('Student Name', colName + 6, curY + 7, { width: wName - 10 });
        doc.text('Birthday (Day & Month)', colBday + 6, curY + 7, { width: wBday - 10, align: 'center' });

        curY += 24;

        if (studentsWithDob.length === 0) {
          doc.rect(40, curY, 515, 40).fill('#ffffff');
          doc.rect(40, curY, 515, 40).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
          doc.fillColor('#64748b').font('Helvetica').fontSize(9.5).text(
            'No dates of birth recorded for students in this class yet.',
            40,
            curY + 14,
            { width: 515, align: 'center' }
          );
          curY += 40;
        } else {
          studentsWithDob.forEach((st, idx) => {
            // Check page overflow
            if (curY > 750) {
              doc.addPage();
              curY = 50;
              // Repeat Table Header on new page
              doc.rect(40, curY, 515, 24).fill('#0f172a');
              doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
              doc.text('#', colSno + 6, curY + 7, { width: wSno - 10, align: 'center' });
              doc.text('Roll No', colRoll + 6, curY + 7, { width: wRoll - 10 });
              doc.text('Student Name', colName + 6, curY + 7, { width: wName - 10 });
              doc.text('Birthday (Day & Month)', colBday + 6, curY + 7, { width: wBday - 10, align: 'center' });
              curY += 24;
            }

            const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
            doc.rect(40, curY, 515, 22).fill(rowBg);
            doc.rect(40, curY, 515, 22).strokeColor('#f1f5f9').lineWidth(0.5).stroke();

            doc.fillColor('#475569').font('Helvetica').fontSize(8.5);
            doc.text(String(idx + 1), colSno + 6, curY + 6, { width: wSno - 10, align: 'center' });
            doc.text(st.rollNumber, colRoll + 6, curY + 6, { width: wRoll - 10 });

            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5);
            doc.text(st.name, colName + 6, curY + 6, { width: wName - 10 });

            doc.fillColor('#b45309').font('Helvetica-Bold').fontSize(8.5);
            doc.text(`🎂  ${st.birthdayText}`, colBday + 6, curY + 6, { width: wBday - 10, align: 'center' });

            curY += 22;
          });
        }

        // Summary footer
        curY += 20;
        if (curY > 730) {
          doc.addPage();
          curY = 50;
        }

        doc.rect(40, curY, 515, 36).fill('#f1f5f9');
        doc.rect(40, curY, 515, 36).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

        doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(8.5);
        doc.text(`Total Students: ${classData.students.length}`, 55, curY + 12);
        doc.text(`Birthdays Listed: ${studentsWithDob.length}`, 220, curY + 12);
        doc.text(`Pending Date: ${studentsWithoutDob.length}`, 390, curY + 12);

        // Signatures block
        curY += 55;
        if (curY > 740) {
          doc.addPage();
          curY = 60;
        }

        doc.moveTo(60, curY).lineTo(200, curY).strokeColor('#475569').lineWidth(1).stroke();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#1e293b').text('CLASS TEACHER SIGNATURE', 65, curY + 5);

        doc.moveTo(350, curY).lineTo(490, curY).strokeColor('#475569').lineWidth(1).stroke();
        doc.text('PRINCIPAL / HEAD OF SCHOOL', 355, curY + 5);

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  } catch (error: any) {
    console.error('Error generating birthday notice board PDF:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

