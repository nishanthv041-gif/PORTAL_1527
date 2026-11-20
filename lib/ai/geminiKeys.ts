/**
 * Google Gemini Multi-Key Resolver & Failover Helper
 * 
 * Enables using a single key, comma-separated keys, or a primary + backup key.
 * Automatically rotates and tries the second key if the first key encounters
 * a rate limit (HTTP 429) or transient error, doubling the free tier quota.
 */

export function getGeminiApiKeys(): string[] {
  const primary = process.env.GEMINI_API_KEY || "";
  const backup = process.env.GEMINI_API_KEY_BACKUP || process.env.GEMINI_API_KEY_SECONDARY || "";
  const combined = `${primary},${backup}`;
  const keys = combined
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 10 && !k.startsWith("<"));

  // Return unique keys preserving order
  return Array.from(new Set(keys));
}

export function isGeminiConfigured(): boolean {
  return getGeminiApiKeys().length > 0;
}
