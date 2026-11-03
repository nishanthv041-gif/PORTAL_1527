import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getCachedServerSession } from "@/backend/auth/sessionCache";
import NavigationProgressBar from "@/frontend/components/NavigationProgressBar";
import { ThemeProvider } from "@/frontend/components/ThemeProvider";
import { ConfirmDialogProvider } from "@/frontend/components/ui/ConfirmDialog";
import SessionGuard from "@/frontend/components/auth/SessionGuard";
import PwaRegistration from "@/frontend/components/pwa/PwaRegistration";
import PwaWelcomeNotificationPrompt from "@/frontend/components/pwa/PwaWelcomeNotificationPrompt";

import Script from "next/script";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { getSystemSettings } from "@/backend/api/actions/dashboard/admin/settings/actions";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

const CANONICAL_URL = "https://nipoportal.vercel.app";
const DEFAULT_TITLE = "SRT Universal School Portal";
const DEFAULT_DESCRIPTION =
  "Official Academic & Management Portal of SRT Universal School. Access school records, attendance, report cards, announcements, and authorized administrative services.";

export async function generateMetadata(): Promise<Metadata> {
  let schoolName = "SRT Universal School";
  let schoolLogo = `${CANONICAL_URL}/logo/srt-logo.png`;
  try {
    const settings = await getSystemSettings();
    if (settings.SCHOOL_NAME) schoolName = settings.SCHOOL_NAME;
    if (settings.SCHOOL_LOGO) schoolLogo = settings.SCHOOL_LOGO;
  } catch (err) { }

  const dynamicTitle = DEFAULT_TITLE;

  return {
    metadataBase: new URL(CANONICAL_URL),
    title: {
      default: dynamicTitle,
      template: `%s | ${dynamicTitle}`,
    },
    description: DEFAULT_DESCRIPTION,
    applicationName: dynamicTitle,
    authors: [{ name: schoolName }],
    creator: schoolName,
    publisher: schoolName,
    referrer: "strict-origin-when-cross-origin",
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    alternates: {
      canonical: "/",
    },
    openGraph: {
      title: dynamicTitle,
      description: DEFAULT_DESCRIPTION,
      url: CANONICAL_URL,
      siteName: dynamicTitle,
      locale: "en_US",
      type: "website",
      images: [
        {
          url: schoolLogo,
          width: 1120,
          height: 1120,
          alt: `${schoolName} Official Crest`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: dynamicTitle,
      description: DEFAULT_DESCRIPTION,
      images: [schoolLogo],
    },
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "32x32" },
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon.png", sizes: "64x64", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    },
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "SRT Portal",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
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
  let settings: Record<string, string> = {};
  try {
    settings = await getSystemSettings();
    const rawMode = settings.THEME_MODE || "System";
    if (rawMode === "Dark") defaultThemeMode = "dark";
    if (rawMode === "Light") defaultThemeMode = "light";
    if (rawMode === "System") defaultThemeMode = "system";
  } catch (err) { }

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

  const session = await getCachedServerSession();
  if (session?.user) {
    isAuthenticated = true;
    if (session.user.theme) {
      initialTheme = session.user.theme;
    }
  }

  // Verified JSON-LD structured data
  const orgName = settings.SCHOOL_NAME || "School Portal";
  const orgLogo = settings.SCHOOL_LOGO || `${CANONICAL_URL}/images/school_3d_moss_campus.jpg`;

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "EducationalOrganization",
      "name": orgName,
      "url": CANONICAL_URL,
      "description": DEFAULT_DESCRIPTION,
      "logo": orgLogo,
      ...(settings.SCHOOL_EMAIL ? { "email": settings.SCHOOL_EMAIL } : {}),
      ...(settings.SCHOOL_CONTACT ? { "telephone": settings.SCHOOL_CONTACT } : {}),
      ...(settings.SCHOOL_ADDRESS
        ? {
          "address": {
            "@type": "PostalAddress",
            "streetAddress": settings.SCHOOL_ADDRESS,
          },
        }
        : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": orgName,
      "url": CANONICAL_URL,
      "description": DEFAULT_DESCRIPTION,
    },
  ];

  return (
    <html lang="en" data-theme={initialTheme} suppressHydrationWarning>
      <head>
        {/* Preload school crest logo for instant splash rendering */}
        <link rel="preload" href="/logo/srt-logo.svg" as="image" type="image/svg+xml" />
        {/* PWA & Mobile Web App Manifest Links */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SRT Portal" />
        <meta name="application-name" content="SRT Universal School Portal" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        {/* Flash-prevention: runs synchronously before paint */}
        <Script
          id="flash-prevention-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: flashPreventionScript }}
        />
        {/* Verified JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body suppressHydrationWarning>
        <NavigationProgressBar />
        <ThemeProvider
          initialTheme={initialTheme}
          isAuthenticated={isAuthenticated}
        >
          <ConfirmDialogProvider>
            <SessionGuard />
            {children}
          </ConfirmDialogProvider>
        </ThemeProvider>
        <SpeedInsights />
        <PwaRegistration />
        <PwaWelcomeNotificationPrompt />

      </body>
    </html>
  );
}
