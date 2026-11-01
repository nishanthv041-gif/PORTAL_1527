import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { validateSession, recordSessionActivity } from "@/backend/lib/session-manager";
import { REVOCATION_MESSAGES, SessionRevocationReason } from "@/backend/lib/session-config";

export const dynamic = "force-dynamic";

function mapReasonToParam(reason: string): string {
  switch (reason) {
    case "LOGIN_ELSEWHERE":
      return "other-device";
    case "IDLE_TIMEOUT":
      return "timeout";
    case "MAX_TIME":
      return "max-time";
    case "ADMIN_FORCED":
      return "admin-forced";
    case "PASSWORD_CHANGED":
      return "password-changed";
    default:
      return "timeout";
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          authenticated: false,
          reason: "logout",
          rawReason: "LOGOUT",
          message: REVOCATION_MESSAGES.LOGOUT,
        },
        { status: 401 }
      );
    }

    const sessionId = (session.user as any).sessionId;

    if (!sessionId) {
      return NextResponse.json({
        authenticated: true,
        userId: session.user.id,
        role: session.user.role,
      });
    }

    const validation = await validateSession(sessionId);

    if (!validation.valid) {
      const rawReason = (validation.reason as SessionRevocationReason) || "IDLE_TIMEOUT";
      const mappedReason = mapReasonToParam(rawReason);
      const message = REVOCATION_MESSAGES[rawReason] || "Session has expired.";

      return NextResponse.json(
        {
          authenticated: false,
          reason: mappedReason,
          rawReason,
          message,
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      userId: session.user.id,
      role: session.user.role,
      expiresAt: validation.session?.expiresAt,
      lastActiveAt: validation.session?.lastActiveAt,
    });
  } catch (error) {
    console.error("[API session-status GET] Error:", error);
    return NextResponse.json(
      { authenticated: false, reason: "error", message: "Server check error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());

    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
    }

    const sessionId = (session.user as any).sessionId;

    if (!sessionId) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const validation = await validateSession(sessionId);

    if (!validation.valid) {
      const rawReason = (validation.reason as SessionRevocationReason) || "IDLE_TIMEOUT";
      const mappedReason = mapReasonToParam(rawReason);
      return NextResponse.json(
        {
          ok: false,
          reason: mappedReason,
          message: REVOCATION_MESSAGES[rawReason],
        },
        { status: 401 }
      );
    }

    // Throttled activity recording
    await recordSessionActivity(sessionId);

    return NextResponse.json({
      ok: true,
      activeAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API session-status POST] Error:", error);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

