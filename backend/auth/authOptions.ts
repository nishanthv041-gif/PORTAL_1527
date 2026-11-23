import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/backend/db/prisma";
import bcrypt from "bcryptjs";
import { loginRateLimiter } from "@/backend/lib/rate-limit";
import { googleProviderConfig, verifyGoogleSignIn, populateGoogleJwt } from "./providers/google";
import {
  createUserSession,
  validateSession,
  recordSessionActivity,
} from "@/backend/lib/session-manager";
import { recordUserLogin } from "@/backend/services/auth/loginActivityTracker";
import {
  IDLE_TIMEOUT_HOURS,
  ACTIVITY_UPDATE_INTERVAL_MIN,
} from "@/backend/lib/session-config";

export function getAuthOptions(): NextAuthOptions {
  const providers: any[] = [
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

        const logAttempt = async (success: boolean) => {
          try {
            await prisma.loginAttempt.create({
              data: { email: credentials.email, success, ipAddress: ip, userAgent }
            });
          } catch (err) {
            console.error("[NextAuth] Failed to log login attempt:", err);
          }
        };

        const cleanEmail = (credentials.email || "").trim();
        const lowerEmail = cleanEmail.toLowerCase();
        const digitsOnly = cleanEmail.replace(/[^0-9]/g, "");

        let user;
        try {
          const searchConditions: any[] = [
            { email: { equals: lowerEmail, mode: "insensitive" } },
            { email: { equals: cleanEmail, mode: "insensitive" } },
            { email: cleanEmail },
            { alternateEmail: { equals: lowerEmail, mode: "insensitive" } },
            { alternateEmail: { equals: cleanEmail, mode: "insensitive" } },
            { alternateEmail: cleanEmail },
            { googleEmail: { equals: lowerEmail, mode: "insensitive" } },
            { googleEmail: { equals: cleanEmail, mode: "insensitive" } },
            { googleEmail: cleanEmail },
          ];

          if (digitsOnly.length === 10) {
            searchConditions.push(
              { teacher: { phone: digitsOnly } },
              { parent: { phone: digitsOnly } }
            );
          }

          user = await prisma.user.findFirst({
            where: {
              OR: searchConditions,
            },
            include: {
              teacher: { select: { id: true, isActive: true } },
              parent: { select: { id: true, isActive: true } },
              staff: { select: { id: true, isActive: true } },
            },
          });
        } catch (error) {
          console.error("[NextAuth] Prisma database error:", error);
          throw new Error("Server error, try again");
        }

        if (!user || !user.password) {
          await logAttempt(false);
          return null;
        }

        let isPasswordValid = false;
        try {
          isPasswordValid = await bcrypt.compare(credentials.password, user.password);
        } catch {
          isPasswordValid = false;
        }

        // Automatic fallback and self-healing for legacy unhashed plain text passwords
        if (!isPasswordValid && credentials.password === user.password) {
          isPasswordValid = true;
          try {
            const upgradedHash = await bcrypt.hash(credentials.password, 10);
            await prisma.user.update({
              where: { id: user.id },
              data: { password: upgradedHash }
            });
          } catch (upgradeErr) {
            console.warn("[NextAuth] Failed to auto-upgrade plain text password:", upgradeErr);
          }
        }

        if (isPasswordValid) {
          if (user.status === "INACTIVE") {
            await logAttempt(false);
            throw new Error(
              "Your account has been deactivated. Please contact the administrator."
            );
          }

          // Determine all roles available to this user account (Dual Role Switcher)
          const availableRoles: string[] = [];
          if (user.role) availableRoles.push(user.role);
          if (user.teacher && user.teacher.isActive && !availableRoles.includes("TEACHER")) {
            availableRoles.push("TEACHER");
          }
          if (user.parent && user.parent.isActive && !availableRoles.includes("PARENT")) {
            availableRoles.push("PARENT");
          }
          if (user.staff && user.staff.isActive && !availableRoles.includes("STAFF")) {
            availableRoles.push("STAFF");
          }
          if (user.role === "ADMIN" && !availableRoles.includes("ADMIN")) {
            availableRoles.push("ADMIN");
          }

          let activeRole = user.role;

          // If expectedRole is provided, ensure it matches one of the user's available roles
          if (credentials.expectedRole) {
            const exp = credentials.expectedRole.toUpperCase();
            const actual = user.role.toUpperCase();
            const isStaffMatch =
              (exp === "STAFF" || exp === "NON_TEACHING_STAFF") &&
              (actual === "STAFF" || actual === "NON_TEACHING_STAFF");
            const isRoleAvailable =
              isStaffMatch ||
              availableRoles.map((r) => r.toUpperCase()).includes(exp);

            if (!isRoleAvailable) {
              await logAttempt(false);
              throw new Error(
                `This is a ${user.role.toLowerCase()} account. Please use the correct login page.`
              );
            }

            // If logging in via another portal that the user is authorized for, switch active role
            if (exp !== actual && !isStaffMatch) {
              activeRole = exp;
              try {
                await prisma.user.update({
                  where: { id: user.id },
                  data: { role: exp },
                });
              } catch (updateErr) {
                console.warn("[NextAuth] Failed to sync active role on login:", updateErr);
              }
            }
          }

          let userSession;
          try {
            userSession = await createUserSession({
              userId: user.id,
              userRole: activeRole,
              ipAddress: ip,
              deviceInfo: userAgent || "Web Browser",
            });
          } catch (sessErr) {
            console.error("[NextAuth] Failed to create UserSession:", sessErr);
          }

          await logAttempt(true);

          // 24-hour inactivity tracking & device login record
          recordUserLogin(user.id, { ipAddress: ip, userAgent }).catch((err) =>
            console.error("[NextAuth] Failed to track login activity:", err)
          );

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: activeRole,
            availableRoles,
            theme: user.theme,
            notificationsEnabled: user.notificationsEnabled,
            sessionVersion: user.sessionVersion || 1,
            sessionId: userSession?.sessionId,
          };
        }

        await logAttempt(false);
        return null;
      },
    }),
  ];

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.unshift(googleProviderConfig);
  }

  return {
    providers,
    callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        return await verifyGoogleSignIn(user, account);
      }
      return true;
    },
    async jwt({ token, user, account, trigger, session }) {
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
        token.sessionId = (user as any).sessionId;
        token.availableRoles = (user as any).availableRoles || [user.role];
      } else if (trigger === "update" && session) {
        if (session.role) {
          token.role = session.role;
        }
        if (session.availableRoles && Array.isArray(session.availableRoles)) {
          token.availableRoles = session.availableRoles;
        }
        if (session.theme) {
          token.theme = session.theme;
        }
        if (typeof session.notificationsEnabled === "boolean") {
          token.notificationsEnabled = session.notificationsEnabled;
        }
      } else if (token.sessionId) {
        try {
          const validation = await validateSession(token.sessionId as string);
          if (!validation.valid) {
            token.isRevoked = true;
            token.revokedReason = validation.reason || "LOGOUT";
          } else if (validation.user) {
            token.name = validation.user.name;
            // Ensure availableRoles is populated on token
            if (!token.availableRoles || !Array.isArray(token.availableRoles) || token.availableRoles.length <= 1) {
              const dbRoles = await prisma.user.findUnique({
                where: { id: validation.user.id },
                select: {
                  role: true,
                  teacher: { select: { id: true, isActive: true } },
                  parent: { select: { id: true, isActive: true } },
                  staff: { select: { id: true, isActive: true } },
                },
              });
              if (dbRoles) {
                const roles: string[] = [dbRoles.role];
                if (dbRoles.teacher?.isActive && !roles.includes("TEACHER")) roles.push("TEACHER");
                if (dbRoles.parent?.isActive && !roles.includes("PARENT")) roles.push("PARENT");
                if (dbRoles.staff?.isActive && !roles.includes("STAFF")) roles.push("STAFF");
                if (dbRoles.role === "ADMIN" && !roles.includes("ADMIN")) roles.push("ADMIN");
                token.availableRoles = roles;
              }
            }
            // Activity tracking (throttled to at most once per ACTIVITY_UPDATE_INTERVAL_MIN minutes)
            recordSessionActivity(token.sessionId as string).catch((err) =>
              console.warn("[Auth JWT] recordSessionActivity error:", err)
            );
          }
        } catch (err) {
          console.warn("[Auth JWT] validateSession error:", err);
        }
      } else if (token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: {
              status: true,
              sessionVersion: true,
              role: true,
              teacher: { select: { id: true, isActive: true } },
              parent: { select: { id: true, isActive: true } },
              staff: { select: { id: true, isActive: true } },
            },
          });
          if (!dbUser || dbUser.status === "INACTIVE" || (token.sessionVersion && dbUser.sessionVersion !== token.sessionVersion)) {
            token.isRevoked = true;
            token.revokedReason = "ADMIN_FORCED";
          } else {
            const roles: string[] = [dbUser.role];
            if (dbUser.teacher?.isActive && !roles.includes("TEACHER")) roles.push("TEACHER");
            if (dbUser.parent?.isActive && !roles.includes("PARENT")) roles.push("PARENT");
            if (dbUser.staff?.isActive && !roles.includes("STAFF")) roles.push("STAFF");
            if (dbUser.role === "ADMIN" && !roles.includes("ADMIN")) roles.push("ADMIN");
            token.availableRoles = roles;
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
        session.user.availableRoles = (token.availableRoles as string[]) || [token.role as string];
        session.user.id = token.id as string;
        session.user.theme = token.theme as string;
        session.user.notificationsEnabled = token.notificationsEnabled as boolean;
        session.user.sessionId = token.sessionId as string;
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
    maxAge: IDLE_TIMEOUT_HOURS * 3600, // 1 Year (31,536,000s) indefinite session persistence
    updateAge: 24 * 3600, // Daily silent background JWT access-token rotation
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: IDLE_TIMEOUT_HOURS * 3600, // 1 Year persistent cookie
      },
    },
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

