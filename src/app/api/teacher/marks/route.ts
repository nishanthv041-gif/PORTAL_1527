import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'TEACHER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { marks } = body;

    if (!Array.isArray(marks)) {
      return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
    }

    const results = [];
    for (const mark of marks) {
      const { studentId, examId, subjectId, score, maxScore, remarks } = mark;

      if (!studentId || !examId || !subjectId || score === undefined || isNaN(parseFloat(score))) {
        continue;
      }

      const upserted = await prisma.mark.upsert({
        where: {
          studentId_examId_subjectId: {
            studentId,
            examId,
            subjectId,
          }
        },
        update: {
          score: parseFloat(score),
          maxScore: maxScore ? parseFloat(maxScore) : 100,
          remarks: remarks || null,
        },
        create: {
          studentId,
          examId,
          subjectId,
          score: parseFloat(score),
          maxScore: maxScore ? parseFloat(maxScore) : 100,
          remarks: remarks || null,
        }
      });
      results.push(upserted);
    }

    return NextResponse.json({ success: true, count: results.length });
  } catch (error) {
    console.error('Error saving marks:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
