import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  HeadObjectCommand, 
  DeleteObjectCommand 
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export function getS3BucketName(): string | undefined {
  return (
    process.env.S3_UPLOADS_BUCKET ||
    process.env.AWS_S3_BUCKET ||
    process.env.NEXT_PUBLIC_AWS_S3_BUCKET ||
    undefined
  );
}

export function getS3Region(): string {
  return (
    process.env.S3_UPLOADS_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    "ap-southeast-2"
  );
}

export function getS3Credentials(): { accessKeyId: string; secretAccessKey: string; sessionToken?: string } | undefined {
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID ||
    process.env.S3_UPLOADS_KEY_ID ||
    process.env.AWS_ACCESS_KEY_ID;

  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY ||
    process.env.S3_UPLOADS_SECRET_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY;

  const sessionToken =
    process.env.S3_SESSION_TOKEN ||
    process.env.AWS_SESSION_TOKEN;

  if (accessKeyId && secretAccessKey) {
    return {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    };
  }
  return undefined;
}

export function hasS3Credentials(): boolean {
  return Boolean(getS3Credentials());
}

/**
 * Returns true only when both a valid bucket AND explicit access credentials exist.
 * This guarantees we never attempt S3 signing when credentials cannot be resolved,
 * preventing long-running IMDS credential hangs on AWS Amplify Lambda compute.
 */
export function isS3Configured(): boolean {
  return Boolean(getS3BucketName() && hasS3Credentials());
}

// Cached S3 client instance
let cachedS3Client: S3Client | null = null;
let lastClientBucket: string | undefined = undefined;
let lastClientRegion: string | undefined = undefined;
let lastAccessKey: string | undefined = undefined;

function getS3Client(): S3Client | null {
  const bucket = getS3BucketName();
  if (!bucket) return null;
  const region = getS3Region();
  const credentials = getS3Credentials();

  if (
    !cachedS3Client || 
    lastClientBucket !== bucket || 
    lastClientRegion !== region ||
    lastAccessKey !== credentials?.accessKeyId
  ) {
    cachedS3Client = new S3Client({
      region,
      ...(credentials ? { credentials } : {}),
    });
    lastClientBucket = bucket;
    lastClientRegion = region;
    lastAccessKey = credentials?.accessKeyId;
  }
  return cachedS3Client;
}

/**
 * Helper to race an async operation against a timeout (default 4 seconds)
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`[S3Storage] Operation '${label}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Upload a binary Buffer directly to private S3 bucket
 */
export async function uploadBufferToS3(
  buffer: Buffer,
  key: string,
  contentType: string = "application/octet-stream"
): Promise<{ success: boolean; key: string; s3Url?: string; error?: string }> {
  const bucket = getS3BucketName();
  const region = getS3Region();
  const client = getS3Client();
  if (!client || !bucket) {
    return { success: false, key, error: "AWS S3 storage is not configured (missing S3_UPLOADS_BUCKET or credentials)." };
  }

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    });

    await withTimeout(client.send(command), 8000, "uploadBufferToS3");

    return {
      success: true,
      key,
      s3Url: `https://${bucket}.s3.${region}.amazonaws.com/${key}`,
    };
  } catch (err) {
    console.error("[S3Storage] Direct upload failed:", err);
    return {
      success: false,
      key,
      error: err instanceof Error ? err.message : "S3 upload failed",
    };
  }
}

/**
 * Generate a short-lived pre-signed PUT URL for direct browser uploads (15 minutes expiry)
 * Strict 4-second timeout prevents any credential resolution hangs on Amplify
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds: number = 900 // 15 mins
): Promise<{ uploadUrl: string; key: string; publicUrl: string } | null> {
  const bucket = getS3BucketName();
  const region = getS3Region();
  const client = getS3Client();
  if (!client || !bucket) {
    console.warn("[S3Storage] getPresignedUploadUrl aborted: Missing S3 bucket or client.");
    return null;
  }

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await withTimeout(
      getSignedUrl(client, command, { expiresIn: expiresInSeconds }),
      1500,
      "getPresignedUploadUrl"
    );

    const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    return { uploadUrl, key, publicUrl };
  } catch (err) {
    console.error("[S3Storage] Presigned upload URL generation failed or timed out:", err);
    return null;
  }
}

/**
 * Check object existence and metadata in S3 with strict 4s timeout
 */
export async function getS3ObjectMetadata(
  key: string
): Promise<{ exists: boolean; size?: number; contentType?: string } | null> {
  const bucket = getS3BucketName();
  const client = getS3Client();
  if (!client || !bucket) return null;

  try {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const head = await withTimeout(client.send(command), 1500, "getS3ObjectMetadata");
    return {
      exists: true,
      size: head.ContentLength,
      contentType: head.ContentType,
    };
  } catch (err: unknown) {
    const errorAny = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (errorAny?.name === "NotFound" || errorAny?.$metadata?.httpStatusCode === 404) {
      return { exists: false };
    }
    console.error("[S3Storage] HeadObject error or timeout:", err);
    return null;
  }
}

/**
 * Fetch the first N bytes of an object from S3 for magic byte validation with strict 1.5s timeout
 */
export async function getS3ObjectHeadBytes(
  key: string,
  maxBytes: number = 4096
): Promise<Buffer | null> {
  const bucket = getS3BucketName();
  const client = getS3Client();
  if (!client || !bucket) return null;

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: `bytes=0-${maxBytes - 1}`,
    });
    const res = await withTimeout(client.send(command), 1500, "getS3ObjectHeadBytes");
    if (!res.Body) return null;
    const byteArray = await res.Body.transformToByteArray();
    return Buffer.from(byteArray);
  } catch (err) {
    console.error("[S3Storage] GetObject head bytes error or timeout:", err);
    return null;
  }
}

/**
 * Delete an object from S3
 */
export async function deleteS3Object(key: string): Promise<boolean> {
  const bucket = getS3BucketName();
  const client = getS3Client();
  if (!client || !bucket) return false;

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    await withTimeout(client.send(command), 1500, "deleteS3Object");
    return true;
  } catch (err) {
    console.error("[S3Storage] DeleteObject error:", err);
    return false;
  }
}

/**
 * Generate a short-lived pre-signed GET URL for secure downloads (60 minutes expiry)
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds: number = 3600 // 1 hour
): Promise<string | null> {
  const bucket = getS3BucketName();
  const client = getS3Client();
  if (!client || !bucket) return null;

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    return await withTimeout(
      getSignedUrl(client, command, { expiresIn: expiresInSeconds }),
      1500,
      "getPresignedDownloadUrl"
    );
  } catch (err) {
    console.error("[S3Storage] Presigned download URL generation failed:", err);
    return null;
  }
}
