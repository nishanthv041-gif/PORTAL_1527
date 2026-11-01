import { NextResponse } from 'next/server';
import { prisma } from '@/backend/db/prisma';
import { deleteUser } from '@/backend/api/actions/dashboard/admin/users/actions';
import { cleanupExpiredSessions } from '@/backend/lib/session-manager';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const expiredUsers = await prisma.user.findMany({
      where: {
        expiresAt: {
          lte: new Date(),
        },
      },
      select: { id: true }
    });

    for (const user of expiredUsers) {
      await deleteUser(user.id);
    }

    // Purge sessions revoked or expired more than 30 days ago
    const deletedSessionsCount = await cleanupExpiredSessions();

    return NextResponse.json({
      success: true,
      deletedUsersCount: expiredUsers.length,
      deletedSessionsCount,
    });
  } catch (error) {
    console.error('Error cleaning up users:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
