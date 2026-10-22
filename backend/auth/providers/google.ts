/* eslint-disable @typescript-eslint/no-explicit-any */
import GoogleProvider from "next-auth/providers/google";
import { headers } from "next/headers";
import { prisma } from "@/backend/db/prisma";
import { env } from "@/backend/config/env";

export const googleProviderConfig = GoogleProvider({
  get clientId() { return env.GOOGLE_CLIENT_ID; },
  get clientSecret() { return env.GOOGLE_CLIENT_SECRET; },
  authorization: {
    params: {
      prompt: "select_account",
    },
  },
});

async function getClientMetadata() {
  let ipAddress = "Unknown";
  let userAgent = "Unknown";

  try {
    const h = await headers();
    const forwardedFor = h.get("x-forwarded-for");
    const realIp = h.get("x-real-ip");
    const cfIp = h.get("cf-connecting-ip");
    const extractedIp = forwardedFor ? forwardedFor.split(",")[0].trim() : (realIp || cfIp);
    if (extractedIp) {
      ipAddress = extractedIp;
    }
    const ua = h.get("user-agent");
    if (ua) {
      userAgent = ua;
    }
  } catch (err) {
    console.warn("[GoogleAuth] Could not extract request headers:", err);
  }

  return { ipAddress, userAgent };
}

export async function verifyGoogleSignIn(user: any, account: any) {
  if (account?.provider === "google") {
    const { ipAddress, userAgent } = await getClientMetadata();

    if (!user.email) {
      await prisma.loginAttempt.create({
        data: { email: "unknown@google", success: false, ipAddress, userAgent }
      });
      return "/?error=AccessDenied: Google account has no email.";
    }

    let dbUser;
    try {
      dbUser = await prisma.user.findFirst({
        where: { 
          OR: [
            { email: user.email },
            { googleEmail: user.email }
          ]
        },
      });
    } catch (error) {
      console.error("[GoogleAuth] Prisma error:", error);
      await prisma.loginAttempt.create({
        data: { email: user.email, success: false, ipAddress, userAgent }
      });
      return "/?error=Server error verifying account.";
    }

    if (!dbUser) {
      console.warn(`[GoogleAuth] Rejecting unrecognized email: ${user.email}`);
      await prisma.loginAttempt.create({
        data: { email: user.email, success: false, ipAddress, userAgent }
      });
      return "/?error=AccessDenied: Your Google account email is not registered. Please contact your administrator.";
    }

    if (dbUser.status === "INACTIVE") {
      await prisma.loginAttempt.create({
        data: { email: user.email, success: false, ipAddress, userAgent }
      });
      return "/?error=AccessDenied: Your account has been deactivated. Please contact the administrator.";
    }

    // Optional: Mark Google email as verified if you want to link them permanently
    if (!dbUser.googleEmailVerified) {
      await prisma.user.update({
        where: { id: dbUser.id },
        data: {
          googleEmail: user.email,
          googleEmailVerified: true,
        },
      });
    }

    await prisma.loginAttempt.create({
      data: { email: user.email, success: true, ipAddress, userAgent }
    });

    return true; // Allow sign in
  }
  return true;
}

export async function populateGoogleJwt(token: any, user: any, account: any) {
  if (account?.provider === "google" && user?.email) {
    try {
      const dbUser = await prisma.user.findFirst({
        where: { 
          OR: [
            { email: user.email },
            { googleEmail: user.email }
          ]
        },
        select: {
          id: true,
          name: true,
          role: true,
          theme: true,
          notificationsEnabled: true,
        },
      });

      if (dbUser) {
        token.id = dbUser.id;
        token.name = dbUser.name ? dbUser.name.trim() : user.name;
        token.role = dbUser.role;
        token.theme = dbUser.theme;
        token.notificationsEnabled = dbUser.notificationsEnabled;
      }
    } catch (error) {
      console.error("[GoogleAuth JWT] Prisma error:", error);
    }
  }
  return token;
}
