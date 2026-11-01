"use server";

import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { revokeSession } from "@/backend/lib/session-manager";

export async function logoutCurrentSessionAction() {
  try {
    const session = await getServerSession(getAuthOptions());
    const sessionId = (session?.user as any)?.sessionId;
    if (sessionId) {
      await revokeSession(sessionId, "LOGOUT");
    }
    return { success: true };
  } catch (err) {
    console.error("[logoutCurrentSessionAction] error:", err);
    return { success: false };
  }
}

