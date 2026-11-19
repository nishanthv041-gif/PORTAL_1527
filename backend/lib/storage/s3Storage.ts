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
    process.env.AWS_S3_BUCKET ||
    process.env.S3_UPLOADS_BUCKET ||
    process.env.NEXT_PUBLIC_AWS_S3_BUCKET ||
    undefined
  );
}

export function getS3Region(): string {
  return (
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    process.env.S3_UPLOADS_REGION ||
    "ap-southeast-1"
  );
}

export function isS3Configured(): boolean {
  return Boolean(getS3BucketName());
}

// Automatically uses IAM Instance Profile on EC2/ECS/Amplify or explicit AWS credentials
let cachedS3Client: S3Client | null = null;
let lastClientBucket: string | undefined = undefined;
let lastClientRegion: string | undefined = undefined;

function getS3Client(): S3Client | null {
  const bucket = getS3BucketName();
  if (!bucket) return null;
  const region = getS3Region();

  if (!cachedS3Client || lastClientBucket !== bucket || lastClientRegion !== region) {
    const credentials = (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ? {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}),
    } : undefined;

    cachedS3Client = new S3Client({
      region,
      ...(credentials ? { credentials } : {}),
    });
    lastClientBucket = bucket;
    lastClientRegion = region;
  }
  return cachedS3Client;
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
    return { success: false, key, error: "AWS S3 storage is not configured (missing AWS_S3_BUCKET)." };
  }

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    });

    await client.send(command);

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
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds: number = 900 // 15 mins
): Promise<{ uploadUrl: string; key: string; publicUrl: string } | null> {
  const bucket = getS3BucketName();
  const region = getS3Region();
  const client = getS3Client();
  if (!client || !bucket) return null;

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    return { uploadUrl, key, publicUrl };
  } catch (err) {
    console.error("[S3Storage] Presigned upload URL generation failed:", err);
    return null;
  }
}

/**
 * Check object existence and metadata in S3
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
    const head = await client.send(command);
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
    console.error("[S3Storage] HeadObject error:", err);
    return null;
  }
}

/**
 * Fetch the first N bytes of an object from S3 for magic byte validation
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
    const res = await client.send(command);
    if (!res.Body) return null;
    const byteArray = await res.Body.transformToByteArray();
    return Buffer.from(byteArray);
  } catch (err) {
    console.error("[S3Storage] GetObject head bytes error:", err);
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
    await client.send(command);
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

    return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  } catch (err) {
    console.error("[S3Storage] Presigned download URL generation failed:", err);
    return null;
  }
}
