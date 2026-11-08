/**
 * Canonical Application URL Helper
 * Reads from APP_URL or NEXT_PUBLIC_APP_URL or VERCEL_URL.
 * Ensures metadata, canonical tags, sitemaps, and manifests always use the current deployment domain.
 */
export function getAppUrl(): string {
  const envUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, "");
  }

  if (process.env.VERCEL_URL && typeof process.env.VERCEL_URL === "string") {
    const vUrl = process.env.VERCEL_URL.trim().replace(/\/+$/, "");
    return vUrl.startsWith("http") ? vUrl : `https://${vUrl}`;
  }

  // Default to current primary production host (AWS Amplify)
  return "https://main.d3bt7u4517jg0f.amplifyapp.com";
}

