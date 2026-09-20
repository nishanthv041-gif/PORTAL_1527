import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/backend/db/prisma";
import bcrypt from "bcryptjs";
import { loginRateLimiter } from "@/backend/lib/rate-limit";

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error("Missing NEXTAUTH_SECRET environment variable. Please define it in production.");
}
if (!process.env.NEXTAUTH_URL && !process.env.VERCEL_URL && process.env.NODE_ENV === "production") {
  throw new Error("Missing NEXTAUTH_URL environment variable. Please define it in production (e.g., https://your-render-app.onrender.com).");
}

export const authOptions: NextAuthOptions = {
  providers: [
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

        if (!user || !user.password) return null;

        const isPasswordValid = await bcrypt.compare(credentials.password, user.password);

        if (isPasswordValid) {
          if (user.status === "INACTIVE") {
            throw new Error(
              "Your account has been deactivated. Please contact the administrator."
            );
          }

          // If expectedRole is provided, ensure it matches the user's actual role
          if (
            credentials.expectedRole &&
            credentials.expectedRole.toUpperCase() !== user.role.toUpperCase()
          ) {
            throw new Error(
              `This is a ${user.role.toLowerCase()} account. Please use the correct login page.`
            );
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            theme: user.theme,
            notificationsEnabled: user.notificationsEnabled,
          };
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
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

