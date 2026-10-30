import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/backend/db/prisma";
import bcrypt from "bcryptjs";
import { loginRateLimiter } from "@/backend/lib/rate-limit";
import { googleProviderConfig, verifyGoogleSignIn, populateGoogleJwt } from "./providers/google";

export function getAuthOptions(): NextAuthOptions {
  return {
  providers: [
    googleProviderConfig,
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        expectedRole: { label: "Expected Role", type: "text" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const rawIp = (req?.headers?.['x-vercel-ip'] || req?.headers?.['x-forwarded-for'] || req?.headers?.['x-real-ip'] || req?.headers?.['cf-connecting-ip'] || 'unknown') as string;
        const ip = rawIp.includes(',') ? rawIp.split(',')[0].trim() : rawIp;
        const userAgent = req?.headers?.['user-agent'] as string | undefined;

        if (!loginRateLimiter.checkPair(ip, credentials.email)) {
          throw new Error("Too many login attempts. Please try again later.");
        }

        const logAttempt = (success: boolean) => {
          prisma.loginAttempt.create({
            data: { email: credentials.email, success, ipAddress: ip, userAgent }
          }).catch((err) => console.error("[NextAuth] Failed to log login attempt:", err));
        };

        let user;
        try {
          user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });
        } catch (error) {
          console.error("[NextAuth] Prisma database error:", error);
          throw new Error("Server error, try again");
        }

        if (!user || !user.password) {
          logAttempt(false);
          return null;
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, user.password);

        if (isPasswordValid) {
          if (user.status === "INACTIVE") {
            logAttempt(false);
            throw new Error(
              "Your account has been deactivated. Please contact the administrator."
            );
          }

          // If expectedRole is provided, ensure it matches the user's actual role
          if (
            credentials.expectedRole &&
            credentials.expectedRole.toUpperCase() !== user.role.toUpperCase()
          ) {
            logAttempt(false);
            throw new Error(
              `This is a ${user.role.toLowerCase()} account. Please use the correct login page.`
            );
          }

          logAttempt(true);

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            theme: user.theme,
            notificationsEnabled: user.notificationsEnabled,
            sessionVersion: user.sessionVersion || 1,
          };
        }

        logAttempt(false);
        return null;
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        return await verifyGoogleSignIn(user, account);
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (account?.provider === "google") {
        return await populateGoogleJwt(token, user, account);
      }
      if (user) {
        token.role = user.role;
        token.id = user.id;
        token.name = user.name ? user.name.trim() : token.name;
        token.theme = user.theme;
        token.notificationsEnabled = user.notificationsEnabled;
        token.sessionVersion = (user as any).sessionVersion || 1;
      } else if (token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { status: true, sessionVersion: true, role: true }
          });
          if (!dbUser || dbUser.status === "INACTIVE" || (token.sessionVersion && dbUser.sessionVersion !== token.sessionVersion)) {
            token.isRevoked = true;
          } else {
            token.role = dbUser.role;
          }
        } catch (err) {
          console.warn("[Auth JWT] Session verification error:", err);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.isRevoked || !token.id) {
        return null as any;
      }
      if (session.user) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
        session.user.theme = token.theme as string;
        session.user.notificationsEnabled = token.notificationsEnabled as boolean;
        if (token.name) {
          session.user.name = token.name as string;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  logger: {
    error(code, metadata) {
      if (code === "JWT_SESSION_ERROR") {
        console.warn("[NextAuth] JWT_SESSION_ERROR: Stale session cookie detected. Middleware will clear it.");
      } else {
        console.error(`[NextAuth Error] ${code}`, metadata);
      }
    },
  },
};
}

