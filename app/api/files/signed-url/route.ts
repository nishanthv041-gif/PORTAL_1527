import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { getSecurePresignedUrl, sanitizeS3Key, isS3SecureConfigured } from "@/lib/s3Secure";

/**
 * 5-Layer Security Firewall - S3 Signed URL API Route
 * Path: /app/api/files/signed-url/route.ts
 *
 * Verifies JWT session roles and generates 60-second expiring pre-signed URLs
 * for private S3 objects using APP_AWS_ credentials.
 */

// Allowed directory prefixes per user role
const ROLE_ALLOWED_PREFIXES: Record<string, string[]> = {
  ADMIN: ["*"], // Full system access
  TEACHER: [
    "uploads/",
    "assignments/",
    "reports/",
    "classes/",
    "exams/",
    "messages/",
    "avatars/",
    "homework/",
    "circulars/",
  ],
  PARENT: [
    "uploads/",
    "reports/",
    "messages/",
    "bus/",
    "avatars/",
    "circulars/",
  ],
  STUDENT: [
    "uploads/",
    "assignments/",
    "reports/",
    "messages/",
    "avatars/",
    "circulars/",
  ],
  STAFF: [
    "uploads/",
    "bus/",
    "messages/",
    "avatars/",
    "circulars/",
  ],
  NON_TEACHING_STAFF: [
    "uploads/",
    "bus/",
    "messages/",
    "avatars/",
    "circulars/",
  ],
};

function isKeyAuthorizedForRole(key: string, role: string): boolean {
  const normalizedRole = role.toUpperCase();
  const allowedPrefixes = ROLE_ALLOWED_PREFIXES[normalizedRole];

  if (!allowedPrefixes || allowedPrefixes.length === 0) {
    return false;
  }

  if (allowedPrefixes.includes("*")) {
    return true;
  }

  return allowedPrefixes.some((prefix) => key.startsWith(prefix));
}

export async function POST(req: NextRequest) {
  try {
    // 1. Verify JWT session and user roles
    const session = await getServerSession(getAuthOptions());
    let userRole = session?.user?.role;
    let userId = session?.user?.id;

    // Fallback: Check NextAuth JWT directly from request cookies
    if (!userRole || !userId) {
      const token = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET,
      });
      if (token && token.id) {
        userId = token.id as string;
        userRole = (token.role as string) || "STUDENT";
      }
    }

    if (!userId || !userRole) {
      return NextResponse.json(
        { error: "Authentication required. Active JWT session role not found." },
        { status: 401 }
      );
    }

    // 2. Parse and validate request payload
    let body: {
      fileKey?: string;
      key?: string;
      operation?: "get" | "put";
      contentType?: string;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const rawKey = body.fileKey || body.key;
    if (!rawKey || typeof rawKey !== "string") {
      return NextResponse.json(
        { error: "Missing required 'fileKey' or 'key' parameter." },
        { status: 400 }
      );
    }

    // 3. Security Sanitize the Key (prevent directory traversal / command injection)
    const sanitizedKey = sanitizeS3Key(rawKey);
    if (!sanitizedKey || sanitizedKey.includes("..")) {
      return NextResponse.json(
        { error: "Invalid file key: Path traversal sequences detected." },
        { status: 400 }
      );
    }

    // 4. Role-based authorization check
    if (!isKeyAuthorizedForRole(sanitizedKey, userRole)) {
      return NextResponse.json(
        {
          error: `Forbidden: Role '${userRole}' is not authorized to access file path '${sanitizedKey}'.`,
        },
        { status: 403 }
      );
    }

    // 5. Ensure S3 backend is configured
    if (!isS3SecureConfigured()) {
      return NextResponse.json(
        {
          error: "S3 storage service is not properly configured with APP_AWS_ environment variables.",
        },
        { status: 503 }
      );
    }

    const operation = body.operation === "put" ? "put" : "get";
    const contentType = body.contentType;

    // 6. Generate 60-second expiring pre-signed URL
    const signedUrl = await getSecurePresignedUrl(sanitizedKey, {
      operation,
      contentType,
      expiresIn: 60, // Enforced 60-second window
    });

    if (!signedUrl) {
      return NextResponse.json(
        { error: "Failed to generate pre-signed URL." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      signedUrl,
      key: sanitizedKey,
      expiresIn: 60,
      operation,
      issuedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/files/signed-url] Error generating secure signed URL:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// Support GET requests with query parameters: /api/files/signed-url?key=uploads/...
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    let userRole = session?.user?.role;
    let userId = session?.user?.id;

    if (!userRole || !userId) {
      const token = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET,
      });
      if (token && token.id) {
        userId = token.id as string;
        userRole = (token.role as string) || "STUDENT";
      }
    }

    if (!userId || !userRole) {
      return NextResponse.json(
        { error: "Authentication required. Active JWT session role not found." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const rawKey = searchParams.get("key") || searchParams.get("fileKey");

    if (!rawKey) {
      return NextResponse.json(
        { error: "Missing required 'key' query parameter." },
        { status: 400 }
      );
    }

    const sanitizedKey = sanitizeS3Key(rawKey);
    if (!sanitizedKey || sanitizedKey.includes("..")) {
      return NextResponse.json(
        { error: "Invalid file key: Path traversal sequences detected." },
        { status: 400 }
      );
    }

    if (!isKeyAuthorizedForRole(sanitizedKey, userRole)) {
      return NextResponse.json(
        {
          error: `Forbidden: Role '${userRole}' is not authorized to access file path '${sanitizedKey}'.`,
        },
        { status: 403 }
      );
    }

    if (!isS3SecureConfigured()) {
      return NextResponse.json(
        {
          error: "S3 storage service is not properly configured with APP_AWS_ environment variables.",
        },
        { status: 503 }
      );
    }

    const signedUrl = await getSecurePresignedUrl(sanitizedKey, {
      operation: "get",
      expiresIn: 60,
    });

    if (!signedUrl) {
      return NextResponse.json(
        { error: "Failed to generate pre-signed URL." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      signedUrl,
      key: sanitizedKey,
      expiresIn: 60,
      operation: "get",
      issuedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/files/signed-url] GET Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
