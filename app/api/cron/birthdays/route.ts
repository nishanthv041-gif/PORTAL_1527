import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import crypto from "crypto";
import { processUniversalBirthdayWishes } from "@/backend/services/birthdays/birthdayService";

export const dynamic = "force-dynamic";

/**
 * Constant-time string comparison to defend against timing attacks on CRON_SECRET.
 */
function safeCompare(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Authorization guard:
 * Accepts:
 *  1. Header `Authorization: Bearer <CRON_SECRET>` (Standard Vercel Cron invocation)
 *  2. Header `x-cron-secret: <CRON_SECRET>`
 *  3. Authenticated session with role ADMIN (Admin testing / manual trigger)
 */
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const cronHeader = req.headers.get("x-cron-secret");

  if (cronSecret && (safeCompare(authHeader, cronSecret) || safeCompare(cronHeader, cronSecret))) {
    return true;
  }

  try {
    const session = await getServerSession(getAuthOptions());
    if (session?.user?.role === "ADMIN") {
      return true;
    }
  } catch {}

  return false;
}

/**
 * GET Handler for Vercel Cron execution.
 * Configured in vercel.json:
 *   "path": "/api/cron/birthdays",
 *   "schedule": "0 19 * * *"  (19:00 UTC = 00:30 IST)
 */
export async function GET(req: NextRequest) {
  const authorized = await isAuthorized(req);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processUniversalBirthdayWishes(undefined, "vercel-cron", true);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[Birthday Cron GET] Error processing birthdays:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST Handler for manual trigger from Admin Dashboard or custom dates.
 */
export async function POST(req: NextRequest) {
  const authorized = await isAuthorized(req);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const customDate = body?.customDate;
    const includeCatchUp = body?.includeCatchUp ?? true;

    const result = await processUniversalBirthdayWishes(
      customDate,
      "manual-admin-trigger",
      includeCatchUp
    );
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[Birthday Cron POST] Error processing birthdays:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
