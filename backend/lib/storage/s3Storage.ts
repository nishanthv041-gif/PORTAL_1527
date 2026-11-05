import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const S3_REGION = process.env.AWS_REGION || "ap-southeast-1";
const S3_BUCKET = process.env.AWS_S3_BUCKET;

// Automatically uses IAM Instance Profile on EC2/ECS or standard AWS credentials
let s3Client: S3Client | null = null;

function getS3Client(): S3Client | null {
  if (!S3_BUCKET) return null;
  if (!s3Client) {
    s3Client = new S3Client({ region: S3_REGION });
  }
  return s3Client;
}

export function isS3Configured(): boolean {
  return Boolean(S3_BUCKET);
}

/**
 * Upload a binary Buffer directly to private S3 bucket
 */
export async function uploadBufferToS3(
  buffer: Buffer,
  key: string,
  contentType: string = "application/octet-stream"
): Promise<{ success: boolean; key: string; s3Url?: string; error?: string }> {
  const client = getS3Client();
  if (!client || !S3_BUCKET) {
    return { success: false, key, error: "AWS S3 storage is not configured (missing AWS_S3_BUCKET)." };
  }

  try {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    });

    await client.send(command);

    return {
      success: true,
      key,
      s3Url: `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`,
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
 * Generate a short-lived pre-signed PUT URL for client-side uploads (15 minutes expiry)
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds: number = 900 // 15 mins
): Promise<{ uploadUrl: string; key: string } | null> {
  const client = getS3Client();
  if (!client || !S3_BUCKET) return null;

  try {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    return { uploadUrl, key };
  } catch (err) {
    console.error("[S3Storage] Presigned upload URL generation failed:", err);
    return null;
  }
}

/**
 * Generate a short-lived pre-signed GET URL for secure downloads (60 minutes expiry)
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds: number = 3600 // 1 hour
): Promise<string | null> {
  const client = getS3Client();
  if (!client || !S3_BUCKET) return null;

  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  } catch (err) {
    console.error("[S3Storage] Presigned download URL generation failed:", err);
    return null;
  }
}

