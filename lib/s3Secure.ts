import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * 5-Layer Security Firewall - S3 Secure Utility
 *
 * Implements private S3 object presigning using APP_AWS_ environment variables
 * with fallback to AWS_ and S3_UPLOADS_ variables.
 * Enforces a strict 60-second expiration policy for all issued signed URLs.
 */

export interface SecureS3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

/**
 * Resolves AWS S3 configuration prioritizing APP_AWS_ environment variables.
 */
export function getSecureS3Config(): SecureS3Config | null {
  const bucket =
    process.env.APP_AWS_BUCKET_NAME ||
    process.env.APP_AWS_S3_BUCKET ||
    process.env.S3_UPLOADS_BUCKET ||
    process.env.AWS_S3_BUCKET ||
    process.env.NEXT_PUBLIC_AWS_S3_BUCKET;

  const region =
    process.env.APP_AWS_REGION ||
    process.env.S3_UPLOADS_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    "ap-southeast-2";

  const accessKeyId =
    process.env.APP_AWS_ACCESS_KEY_ID ||
    process.env.AWS_ACCESS_KEY_ID ||
    process.env.S3_UPLOADS_KEY_ID ||
    process.env.S3_ACCESS_KEY_ID;

  const secretAccessKey =
    process.env.APP_AWS_SECRET_ACCESS_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY ||
    process.env.S3_UPLOADS_SECRET_KEY ||
    process.env.S3_SECRET_ACCESS_KEY;

  const sessionToken =
    process.env.APP_AWS_SESSION_TOKEN ||
    process.env.AWS_SESSION_TOKEN ||
    process.env.S3_SESSION_TOKEN;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    ...(sessionToken ? { sessionToken } : {}),
  };
}

/**
 * Checks if secure S3 credentials and bucket are configured.
 */
export function isS3SecureConfigured(): boolean {
  return Boolean(getSecureS3Config());
}

// Cached S3Client instance for high-throughput connection reuse
let cachedSecureClient: S3Client | null = null;
let lastClientKey: string | null = null;

/**
 * Returns or instantiates the cached S3Client.
 */
export function getSecureS3Client(): S3Client | null {
  const config = getSecureS3Config();
  if (!config) return null;

  const cacheKey = `${config.region}:${config.accessKeyId}:${config.bucket}`;
  if (!cachedSecureClient || lastClientKey !== cacheKey) {
    cachedSecureClient = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        ...(config.sessionToken ? { sessionToken: config.sessionToken } : {}),
      },
    });
    lastClientKey = cacheKey;
  }

  return cachedSecureClient;
}

/**
 * Sanitize an S3 object key to eliminate directory traversal or dangerous characters.
 */
export function sanitizeS3Key(rawKey: string): string {
  if (!rawKey) return "";
  return rawKey
    .replace(/^(\.\.(\/|\\|$))+/, "") // Prevent leading path traversal
    .replace(/\.\.(\/|\\)/g, "")      // Prevent mid-path traversal
    .replace(/^\/+/, "")             // Trim leading slashes
    .trim();
}

export interface PresignedUrlOptions {
  operation?: "get" | "put";
  contentType?: string;
  expiresIn?: number; // Defaults to 60 seconds
}

/**
 * Generates a short-lived, 60-second expiring pre-signed URL for a private S3 object.
 *
 * @param key - The S3 object key
 * @param options - Operation ('get' or 'put'), optional contentType, and expiresIn (default 60s)
 * @returns The pre-signed URL string, or null if unconfigured
 */
export async function getSecurePresignedUrl(
  key: string,
  options: PresignedUrlOptions = {}
): Promise<string | null> {
  const config = getSecureS3Config();
  const client = getSecureS3Client();
  if (!config || !client) {
    console.warn("[s3Secure] S3 client not configured. Missing APP_AWS_ credentials or bucket.");
    return null;
  }

  const sanitizedKey = sanitizeS3Key(key);
  if (!sanitizedKey) {
    throw new Error("Invalid or empty S3 object key.");
  }

  const { operation = "get", contentType, expiresIn = 60 } = options;

  // Strict enforcement: Maximum expiration is 60 seconds as mandated by 5-layer security policy
  const effectiveExpiresIn = Math.min(Math.max(expiresIn, 1), 60);

  try {
    if (operation === "put") {
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: sanitizedKey,
        ...(contentType ? { ContentType: contentType } : {}),
        ServerSideEncryption: "AES256",
      });
      return await getSignedUrl(client, command, { expiresIn: effectiveExpiresIn });
    }

    // Default operation: 'get'
    const command = new GetObjectCommand({
      Bucket: config.bucket,
      Key: sanitizedKey,
    });
    return await getSignedUrl(client, command, { expiresIn: effectiveExpiresIn });
  } catch (error) {
    console.error(`[s3Secure] Failed to sign URL for key '${sanitizedKey}':`, error);
    throw error;
  }
}
