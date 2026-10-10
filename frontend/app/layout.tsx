import type { Metadata } from "next";
import "./globals.css";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { ThemeProvider } from "@/frontend/components/ThemeProvider";
import Script from "next/script";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { getSystemSetting } from "@/backend/api/actions/dashboard/admin/settings/actions";

export async function generateMetadata(): Promise<Metadata> {
  let schoolName = "School Portal";
  try {
    schoolName = await getSystemSetting("SCHOOL_NAME", "SRT School Portal");
  } catch (err) {}
  
  return {
    title: schoolName,
    description: "School management portal for teachers, parents, and admins",
    verification: {
      google: "qVtRH0vqbgqX_w0_sDfrgHF91IaAL9EvKq3i2KplAj4",
    },
  };
}

/**
 * Inline script that runs BEFORE hydration to prevent theme flash.
 * Priority order:
 *   1. data-theme already on <html> (set by server render)
 *   2. localStorage cache
 *   3. default: "light"
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let defaultThemeMode = "light";
  try {
    const rawMode = await getSystemSetting("THEME_MODE", "System");
    if (rawMode === "Dark") defaultThemeMode = "dark";
    if (rawMode === "Light") defaultThemeMode = "light";
    if (rawMode === "System") defaultThemeMode = "system";
  } catch (err) {}

  const flashPreventionScript = `
  (function() {
    try {
      var cached = localStorage.getItem('theme-cache');
      var valid = cached === 'dark' || cached === 'light';
      var current = document.documentElement.getAttribute('data-theme');
      var systemSetting = '${defaultThemeMode}';
      
      if (!current) {
        if (valid) {
          document.documentElement.setAttribute('data-theme', cached);
        } else {
          if (systemSetting === 'dark' || systemSetting === 'light') {
            document.documentElement.setAttribute('data-theme', systemSetting);
          } else {
            // System preference
            var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
          }
        }
      }
    } catch(e) {}
  })();
  `;

  let initialTheme = defaultThemeMode === "system" ? "light" : defaultThemeMode; // fallback for server render
  let isAuthenticated = false;

  const session = await getServerSession(getAuthOptions());
  if (session?.user) {
    isAuthenticated = true;
    if (session.user.theme) {
      initialTheme = session.user.theme;
    }
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
