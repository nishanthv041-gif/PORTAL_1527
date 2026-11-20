import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * 5-Layer Security Firewall - Edge Middleware
 * File: middleware.ts
 *
 * Implements:
 * 1. Strict CORS origin filtering (ALLOWED_ORIGINS)
 * 2. IP-based rate limiting (5 req/min on /api/auth/login, 30 req/min on /api/*)
 * 3. Hardened security headers (X-Frame-Options: DENY, CSP, X-Content-Type-Options)
 * 4. Protected page route enforcement and JWT token revocation checks
 */

// -----------------------------------------------------------------------------
// 1. HARDENED SECURITY HEADERS
// -----------------------------------------------------------------------------
const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.onesignal.com https://onesignal.com https://accounts.google.com https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https: wss:; frame-ancestors 'none'; object-src 'none'; base-uri 'self';",
};

function applySecurityHeaders(
  res: NextResponse,
  allowedOrigin?: string | null
): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(key, value);
  }

  if (allowedOrigin) {
    res.headers.set("Access-Control-Allow-Origin", allowedOrigin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
  }

  return res;
}

// -----------------------------------------------------------------------------
// 2. STRICT CORS ORIGIN FILTERING (ALLOWED_ORIGINS)
// -----------------------------------------------------------------------------
const DEFAULT_ALLOWED_ORIGINS = [
  "https://main.d3bt7u4517jg0f.amplifyapp.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "capacitor://localhost",
  "http://localhost",
];

function getAllowedOrigins(): string[] {
  const envOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    : [];

  const appUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      const parsed = new URL(appUrl).origin;
      if (!envOrigins.includes(parsed)) {
        envOrigins.push(parsed);
      }
    } catch {}
  }

  return Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...envOrigins]));
}

function isOriginAllowed(origin: string): boolean {
  const allowed = getAllowedOrigins();
  if (allowed.includes(origin)) return true;

  // Allow subdomains of amplifyapp.com deployment if applicable
  try {
    const parsed = new URL(origin);
    if (parsed.hostname.endsWith(".amplifyapp.com")) {
      return true;
    }
  } catch {}

  return false;
}

// -----------------------------------------------------------------------------
// 3. IP-BASED RATE LIMITING
// -----------------------------------------------------------------------------
// Window: 60,000ms (1 minute)
// - 5 req/min on /api/auth/login and auth callbacks
// - 30 req/min on /api/*
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Periodic in-memory cleanup every 5 minutes
let lastCleanup = Date.now();
function pruneRateLimitStore() {
  const now = Date.now();
  if (now - lastCleanup > 300000) {
    lastCleanup = now;
    for (const [key, record] of rateLimitStore.entries()) {
      if (now > record.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }
}

function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60000
): { allowed: boolean; remaining: number; resetAt: number } {
  pruneRateLimitStore();
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (record.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  record.count += 1;
  return { allowed: true, remaining: limit - record.count, resetAt: record.resetAt };
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}

// -----------------------------------------------------------------------------
// 4. MAIN EDGE FIREWALL MIDDLEWARE
// -----------------------------------------------------------------------------
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.headers.get("origin");

  // A. CORS Preflight & Origin Verification
  let allowedOriginHeader: string | null = null;

  if (origin) {
    if (isOriginAllowed(origin)) {
      allowedOriginHeader = origin;
    } else {
      // Forbidden origin: block cross-site request forgery
      return applySecurityHeaders(
        NextResponse.json(
          { error: "CORS origin forbidden by security firewall." },
          { status: 403 }
        )
      );
    }
  }

  // Handle CORS OPTIONS preflight request
  if (req.method === "OPTIONS") {
    const preflightRes = new NextResponse(null, { status: 204 });
    if (allowedOriginHeader) {
      preflightRes.headers.set("Access-Control-Allow-Origin", allowedOriginHeader);
      preflightRes.headers.set("Access-Control-Allow-Credentials", "true");
      preflightRes.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, PATCH, OPTIONS"
      );
      preflightRes.headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With, Accept, Origin, Range, X-CSRF-Token"
      );
      preflightRes.headers.set("Access-Control-Max-Age", "86400");
    }
    return applySecurityHeaders(preflightRes, allowedOriginHeader);
  }

  // B. IP-Based Rate Limiting for API routes
  if (pathname.startsWith("/api/")) {
    const clientIp = getClientIp(req);

    // Is this an authentication / login endpoint?
    const isAuthLogin =
      pathname === "/api/auth/login" ||
      pathname === "/api/auth/callback/credentials" ||
      pathname === "/api/auth/signin";

    // Polling, health checks, and chunked upload streaming have dedicated higher capacity
    // to prevent real-time chat sync or file chunk transfers from consuming the mutation rate limit
    const isHighFrequencyInternal =
      pathname.startsWith("/api/messages/thread") ||
      pathname.startsWith("/api/notifications/unread-count") ||
      pathname.startsWith("/api/auth/session-status") ||
      pathname.startsWith("/api/health") ||
      pathname.startsWith("/api/uploads/stream");

    // 5 req/min on login routes, 30 req/min on general /api/* routes
    const limit = isAuthLogin ? 5 : 30;
    const rateKey = isAuthLogin
      ? `auth:${clientIp}`
      : isHighFrequencyInternal
        ? `polling:${clientIp}`
        : `api:${clientIp}`;

    // For polling & upload streaming chunks, allow up to 300 req/min; for standard endpoints, use 30 req/min
    const effectiveLimit = isHighFrequencyInternal ? 300 : limit;

    const { allowed, remaining, resetAt } = checkRateLimit(rateKey, effectiveLimit, 60000);

    if (!allowed) {
      const retryAfterSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
      const rateLimitRes = NextResponse.json(
        {
          error: "Too many requests. Rate limit exceeded by security firewall.",
          limit,
          retryAfter: retryAfterSec,
        },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfterSec.toString(),
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": Math.ceil(resetAt / 1000).toString(),
          },
        }
      );
      return applySecurityHeaders(rateLimitRes, allowedOriginHeader);
    }
  }

  // C. Protected Page Route Authorization & Token Revocation Checks
  const isProtectedPage =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/staff");

  if (isProtectedPage) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    // Not authenticated
    if (!token || !token.id) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return applySecurityHeaders(
        NextResponse.redirect(loginUrl),
        allowedOriginHeader
      );
    }

    // Token was revoked (e.g. login elsewhere, inactivity timeout, admin forced)
    if (token.isRevoked) {
      const rawReason = token.revokedReason || "LOGOUT";
      let mappedReason = "timeout";
      if (rawReason === "LOGIN_ELSEWHERE") mappedReason = "other-device";
      if (rawReason === "ADMIN_FORCED") mappedReason = "admin-forced";
      if (rawReason === "PASSWORD_CHANGED") mappedReason = "password-changed";

      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("reason", mappedReason);

      const response = NextResponse.redirect(loginUrl);

      // Clear session cookies
      const cookieNames = [
        "next-auth.session-token",
        "__Secure-next-auth.session-token",
        "next-auth.callback-url",
        "__Secure-next-auth.callback-url",
      ];

      cookieNames.forEach((name) => {
        response.cookies.delete(name);
      });

      return applySecurityHeaders(response, allowedOriginHeader);
    }
  }

  // D. Proceed to requested route with full security headers
  const response = NextResponse.next();
  return applySecurityHeaders(response, allowedOriginHeader);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and media
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|webmanifest)$).*)",
  ],
};
