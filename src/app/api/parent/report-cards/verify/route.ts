import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'PARENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { reportCardId } = body;

    if (!reportCardId) {
      return NextResponse.json({ error: 'Missing reportCardId' }, { status: 400 });
    }

    // Ensure the parent actually owns the student who owns the report card
    const parentUser = await prisma.parent.findUnique({
      where: { userId: session.user.id },
      include: { children: true }
    });

    if (!parentUser) {
      return NextResponse.json({ error: 'Parent profile not found' }, { status: 404 });
    }

    const reportCard = await prisma.reportCard.findUnique({
      where: { id: reportCardId }
    });

    if (!reportCard) {
      return NextResponse.json({ error: 'Report card not found' }, { status: 404 });
    }

    const isChild = parentUser.children.some(c => c.studentId === reportCard.studentId);
    if (!isChild) {
      return NextResponse.json({ error: 'Unauthorized to verify this report card' }, { status: 403 });
    }

    const updated = await prisma.reportCard.update({
      where: { id: reportCardId },
      data: { parentVerified: true }
    });

    return NextResponse.json({ success: true, reportCard: updated });
  } catch (error) {
    console.error('Error verifying report card:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
