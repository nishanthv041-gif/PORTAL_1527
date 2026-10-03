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

        const ip = (req?.headers?.['x-forwarded-for'] || req?.headers?.['x-real-ip'] || 'unknown') as string;
        if (!loginRateLimiter.check(ip)) {
          throw new Error("Too many login attempts. Please try again later.");
        }

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
          await prisma.loginAttempt.create({
            data: { email: credentials.email, success: false, ipAddress: ip, userAgent: req?.headers?.['user-agent'] as string | undefined }
          });
          return null;
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, user.password);

        if (isPasswordValid) {
          if (user.status === "INACTIVE") {
            await prisma.loginAttempt.create({
              data: { email: credentials.email, success: false, ipAddress: ip, userAgent: req?.headers?.['user-agent'] as string | undefined }
            });
            throw new Error(
              "Your account has been deactivated. Please contact the administrator."
            );
          }

          // If expectedRole is provided, ensure it matches the user's actual role
          if (
            credentials.expectedRole &&
            credentials.expectedRole.toUpperCase() !== user.role.toUpperCase()
          ) {
            await prisma.loginAttempt.create({
              data: { email: credentials.email, success: false, ipAddress: ip, userAgent: req?.headers?.['user-agent'] as string | undefined }
            });
            throw new Error(
              `This is a ${user.role.toLowerCase()} account. Please use the correct login page.`
            );
          }

          await prisma.loginAttempt.create({
            data: { email: credentials.email, success: true, ipAddress: ip, userAgent: req?.headers?.['user-agent'] as string | undefined }
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            theme: user.theme,
            notificationsEnabled: user.notificationsEnabled,
          };
        }

        await prisma.loginAttempt.create({
          data: { email: credentials.email, success: false, ipAddress: ip, userAgent: req?.headers?.['user-agent'] as string | undefined }
        });
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
        token.theme = user.theme;
        token.notificationsEnabled = user.notificationsEnabled;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
        session.user.theme = token.theme as string;
        session.user.notificationsEnabled = token.notificationsEnabled as boolean;
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

