import type { Metadata } from "next";
import "./globals.css";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { ThemeProvider } from "@/frontend/components/ThemeProvider";
import Script from "next/script";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  title: "SRT School Portal",
  description: "School management portal for teachers, parents, and admins",
};

/**
 * Inline script that runs BEFORE hydration to prevent theme flash.
 * Priority order:
 *   1. data-theme already on <html> (set by server render)
 *   2. localStorage cache
 *   3. default: "light"
 */
const flashPreventionScript = `
(function() {
  try {
    var cached = localStorage.getItem('theme-cache');
    var valid = cached === 'dark' || cached === 'light';
    // Only apply if the server hasn't already set a theme
    var current = document.documentElement.getAttribute('data-theme');
    if (!current && valid) {
      document.documentElement.setAttribute('data-theme', cached);
    } else if (!current) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch(e) {}
})();
`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Try to get the session server-side so we can set the correct initial theme
  // on the <html> element before the page is sent to the client.
  let initialTheme = "light";
  let isAuthenticated = false;

  const session = await getServerSession(authOptions);
  if (session?.user) {
    isAuthenticated = true;
    initialTheme = session.user.theme ?? "light";
  }

  return (
    <html lang="en" data-theme={initialTheme} suppressHydrationWarning>
      <head>
        {/* Flash-prevention: runs synchronously before paint */}
        <Script
          id="flash-prevention-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: flashPreventionScript }}
        />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider
          initialTheme={initialTheme}
          isAuthenticated={isAuthenticated}
        >
          {children}
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
