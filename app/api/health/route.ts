import { env } from '@/backend/config/env';
import { NextResponse } from 'next/server';

export async function GET() {
  const missing: string[] = [];

  const check = (key: keyof typeof env) => {
    try {
      const _ = env[key];
    } catch {
      missing.push(key);
    }
  };

  check('DATABASE_URL');
  check('NEXTAUTH_SECRET');
  check('NEXTAUTH_URL');
  check('GOOGLE_CLIENT_ID');
  check('GOOGLE_CLIENT_SECRET');

  if (missing.length > 0) {
    return NextResponse.json({
      status: 'error',
      message: 'Missing required environment variables.',
      missing,
    }, { status: 500 });
  }

  return NextResponse.json({
    status: 'ok',
    message: 'All required environment variables are present.',
  });
}
