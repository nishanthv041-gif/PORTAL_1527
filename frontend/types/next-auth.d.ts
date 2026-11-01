import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      theme: string;
      notificationsEnabled: boolean;
      sessionId?: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: string;
    theme: string;
    notificationsEnabled: boolean;
    sessionId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    theme: string;
    notificationsEnabled: boolean;
    sessionId?: string;
    isRevoked?: boolean;
    revokedReason?: string;
    sessionVersion?: number;
  }
}
