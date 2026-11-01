import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { validateSession, recordSessionActivity } from "@/backend/lib/session-manager";
import { SessionRevocationReason } from "@/backend/lib/session-config";

export interface ValidatedSessionResult {
  valid: boolean;
  reason?: SessionRevocationReason | string;
  user?: {
    id: string;
    role: string;
    name?: string | null;
    email?: string | null;
    theme?: string;
    notificationsEnabled?: boolean;
    sessionId?: string;
  } | null;
  session?: any;
}

/**
 * Server-side helper for route handlers, server actions, and server components.
 * Retrieves session from NextAuth and ensures the database UserSession is active,
 * unrevoked, and within the 6-hour idle timeout.
 */
export async function getValidatedSession(): Promise<ValidatedSessionResult> {
  const session = await getServerSession(getAuthOptions());

  if (!session?.user?.id) {
    return { valid: false, reason: "LOGOUT", user: null };
  }

  const sessionId = (session.user as any).sessionId;

  // If session has a tracked sessionId, validate against database
  if (sessionId) {
    const validation = await validateSession(sessionId);
    if (!validation.valid) {
      return {
        valid: false,
        reason: validation.reason || "LOGOUT",
        user: null,
      };
    }

    // Trigger throttled activity update
    recordSessionActivity(sessionId).catch(() => {});

    return {
      valid: true,
      user: session.user,
      session: validation.session,
    };
  }

  // Legacy fallback if sessionId not present
  return {
    valid: true,
    user: session.user,
  };
}

