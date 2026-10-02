/* eslint-disable @typescript-eslint/no-explicit-any */
import GoogleProvider from "next-auth/providers/google";
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

export async function verifyGoogleSignIn(user: any, account: any) {
  if (account?.provider === "google") {
    if (!user.email) {
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
      return "/?error=Server error verifying account.";
    }

    if (!dbUser) {
      console.warn(`[GoogleAuth] Rejecting unrecognized email: ${user.email}`);
      return "/?error=AccessDenied: Your Google account email is not registered. Please contact your administrator.";
    }

    if (dbUser.status === "INACTIVE") {
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
          role: true,
          theme: true,
          notificationsEnabled: true,
        },
      });

      if (dbUser) {
        token.id = dbUser.id;
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
