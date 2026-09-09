import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { loginRateLimiter } from "@/lib/rate-limit";

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

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

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
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
