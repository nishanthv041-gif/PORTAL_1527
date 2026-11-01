import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protected route paths
  const isProtectedPage =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/staff");

  if (!isProtectedPage) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Not authenticated
  if (!token || !token.id) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
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

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/settings/:path*",
    "/staff/:path*",
  ],
};

