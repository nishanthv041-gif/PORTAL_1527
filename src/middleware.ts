import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  // Check if a session cookie exists in the request
  const hasSessionCookie = 
    req.cookies.has("next-auth.session-token") || 
    req.cookies.has("__Secure-next-auth.session-token");

  if (hasSessionCookie) {
    // Attempt to decrypt the token
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    
    // If the token fails to decrypt (returns null) but the cookie exists, it is stale/invalid.
    if (!token) {
      const res = NextResponse.redirect(req.url);
      // Clear both dev and prod variants of the cookie (including chunked versions if they exist)
      res.cookies.delete("next-auth.session-token");
      res.cookies.delete("__Secure-next-auth.session-token");
      res.cookies.delete("next-auth.callback-url");
      res.cookies.delete("__Secure-next-auth.callback-url");
      return res;
    }
  }
  
  return NextResponse.next();
}

// Skip middleware for NextAuth API, static files, and Next.js internal requests
export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
