import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { validateSession, recordSessionActivity } from "@/backend/lib/session-manager";
import { REVOCATION_MESSAGES, SessionRevocationReason } from "@/backend/lib/session-config";
import { ServerTimer } from "@/lib/perf/serverTimer";

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
  const timer = new ServerTimer("/api/auth/session-status", "GET");

  try {
    const token = await timer.measure("auth-token", () =>
      getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET,
      })
    );

    if (!token?.id || token.isRevoked) {
      timer.logSummary(401);
      return NextResponse.json(
        {
          authenticated: false,
          reason: token?.revokedReason ? mapReasonToParam(token.revokedReason as string) : "logout",
          rawReason: token?.revokedReason || "LOGOUT",
          message: REVOCATION_MESSAGES[token?.revokedReason as string] || REVOCATION_MESSAGES.LOGOUT,
        },
        {
          status: 401,
          headers: { "Server-Timing": timer.getHeaderValue() },
        }
      );
    }

    const sessionId = token.sessionId as string | undefined;

    if (!sessionId) {
      timer.logSummary(200, token.role as string);
      return NextResponse.json(
        {
          authenticated: true,
          userId: token.id,
          role: token.role,
        },
        {
          headers: {
            "Server-Timing": timer.getHeaderValue(),
            "Cache-Control": "private, no-cache, no-store, must-revalidate",
          },
        }
      );
    }

    // Validate against database exactly once
    const validation = await timer.measure("db-validate-session", () =>
      validateSession(sessionId)
    );

    if (!validation.valid) {
      const rawReason = (validation.reason as SessionRevocationReason) || "IDLE_TIMEOUT";
      const mappedReason = mapReasonToParam(rawReason);
      const message = REVOCATION_MESSAGES[rawReason] || "Session has expired.";

      timer.logSummary(401);
      return NextResponse.json(
        {
          authenticated: false,
          reason: mappedReason,
          rawReason,
          message,
        },
        {
          status: 401,
          headers: { "Server-Timing": timer.getHeaderValue() },
        }
      );
    }

    timer.logSummary(200, token.role as string);
    return NextResponse.json(
      {
        authenticated: true,
        userId: token.id,
        role: token.role,
        expiresAt: validation.session?.expiresAt,
        lastActiveAt: validation.session?.lastActiveAt,
      },
      {
        headers: {
          "Server-Timing": timer.getHeaderValue(),
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("[API session-status GET] Error:", error);
    timer.logSummary(500);
    return NextResponse.json(
      { authenticated: false, reason: "error", message: "Server check error" },
      {
        status: 500,
        headers: { "Server-Timing": timer.getHeaderValue() },
      }
    );
  }
}

export async function POST(req: NextRequest) {
  const timer = new ServerTimer("/api/auth/session-status", "POST");

  try {
    const token = await timer.measure("auth-token", () =>
      getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET,
      })
    );

    if (!token?.id || token.isRevoked) {
      timer.logSummary(401);
      return NextResponse.json(
        { ok: false, error: "Unauthenticated" },
        {
          status: 401,
          headers: { "Server-Timing": timer.getHeaderValue() },
        }
      );
    }

    const sessionId = token.sessionId as string | undefined;

    if (!sessionId) {
      timer.logSummary(200, token.role as string);
      return NextResponse.json(
        { ok: true, skipped: true },
        { headers: { "Server-Timing": timer.getHeaderValue() } }
      );
    }

    const validation = await timer.measure("db-validate-session", () =>
      validateSession(sessionId)
    );

    if (!validation.valid) {
      const rawReason = (validation.reason as SessionRevocationReason) || "IDLE_TIMEOUT";
      const mappedReason = mapReasonToParam(rawReason);
      const message = REVOCATION_MESSAGES[rawReason] || "Session has expired.";

      timer.logSummary(401);
      return NextResponse.json(
        {
          ok: false,
          reason: mappedReason,
          rawReason,
          message,
        },
        {
          status: 401,
          headers: { "Server-Timing": timer.getHeaderValue() },
        }
      );
    }

    // Record activity (throttled)
    timer.measure("db-record-activity", () => recordSessionActivity(sessionId)).catch(() => {});

    timer.logSummary(200, token.role as string);
    return NextResponse.json(
      { ok: true, timestamp: Date.now() },
      {
        headers: {
          "Server-Timing": timer.getHeaderValue(),
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("[API session-status POST] Error:", error);
    timer.logSummary(500);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      {
        status: 500,
        headers: { "Server-Timing": timer.getHeaderValue() },
      }
    );
  }
}
