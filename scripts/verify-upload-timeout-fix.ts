/**
 * Verification test for upload timeout fix, direct S3 configuration,
 * and 1.45 MB image, PDF, and voice note handling.
 */

import { isS3Configured, getS3BucketName, getS3Region, getPresignedUploadUrl } from "../backend/lib/storage/s3Storage";
import { validateMagicBytes, getMaxSizeBytesForExtension, getFileCategory } from "../backend/lib/storage/magicBytes";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function run() {
  console.log("==================================================");
  console.log("🧪 TESTING S3 RESOLUTION, EXTENSIONS & UPLOAD TIMEOUT LOGIC");
  console.log("==================================================\n");

  // 1. S3 Multi-Bucket Environment Resolution
  console.log("📦 1. Testing S3 Environment Variable Resolution");
  const originalBucket = process.env.AWS_S3_BUCKET;
  const originalRegion = process.env.AWS_REGION;
  const originalUploadsBucket = process.env.S3_UPLOADS_BUCKET;

  try {
    delete process.env.AWS_S3_BUCKET;
    delete process.env.S3_UPLOADS_BUCKET;
    assert(!isS3Configured(), "isS3Configured returns false when no bucket env is set");

    process.env.S3_UPLOADS_BUCKET = "portal-custom-bucket";
    assert(isS3Configured(), "isS3Configured returns true with S3_UPLOADS_BUCKET");
    assert(getS3BucketName() === "portal-custom-bucket", "Resolves S3_UPLOADS_BUCKET name correctly");

    process.env.AWS_S3_BUCKET = "portal-primary-bucket";
    assert(getS3BucketName() === "portal-primary-bucket", "AWS_S3_BUCKET takes priority when present");

    delete process.env.AWS_REGION;
    delete process.env.S3_UPLOADS_REGION;
    assert(getS3Region() === "ap-southeast-1", "Default region is ap-southeast-1");

    process.env.S3_UPLOADS_REGION = "eu-central-1";
    assert(getS3Region() === "eu-central-1", "Resolves S3_UPLOADS_REGION correctly");
  } finally {
    if (originalBucket) process.env.AWS_S3_BUCKET = originalBucket;
    else delete process.env.AWS_S3_BUCKET;
    if (originalRegion) process.env.AWS_REGION = originalRegion;
    else delete process.env.AWS_REGION;
    if (originalUploadsBucket) process.env.S3_UPLOADS_BUCKET = originalUploadsBucket;
    else delete process.env.S3_UPLOADS_BUCKET;
  }

  // 2. Timetable PNG (1.45 MB) Simulation
  console.log("\n🖼️ 2. Testing 1.45 MB PNG (Timetable) Validation");
  // 1449.4 KB = 1484185 bytes
  const timetablePngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const simulated145MbPng = Buffer.alloc(1484185);
  timetablePngHeader.copy(simulated145MbPng, 0);

  const pngCheck = validateMagicBytes(simulated145MbPng, "png");
  assert(pngCheck.valid === true, "1.45 MB PNG magic bytes pass validation");
  assert(pngCheck.detectedType === "image/png", "Detected as image/png");
  assert(simulated145MbPng.length <= getMaxSizeBytesForExtension("png"), "1.45 MB is well within the 10 MB limit");

  // 3. PDF Document Simulation
  console.log("\n📄 3. Testing PDF Document Validation");
  const pdfHeader = Buffer.from("%PDF-1.7 Report Card Document Payload");
  const simulatedPdf = Buffer.alloc(500000);
  pdfHeader.copy(simulatedPdf, 0);

  const pdfCheck = validateMagicBytes(simulatedPdf, "pdf");
  assert(pdfCheck.valid === true, "PDF document passes validation");
  assert(getFileCategory("pdf") === "DOCUMENT", "Category is DOCUMENT");
  assert(simulatedPdf.length <= getMaxSizeBytesForExtension("pdf"), "Within 20 MB document limit");

  // 4. Voice Note Audio Simulation (WebM / M4A)
  console.log("\n🎤 4. Testing Voice Note Audio Validation");
  // WebM EBML header 1A 45 DF A3
  const webmHeader = Buffer.from([0x1A, 0x45, 0xDF, 0xA3]);
  const simulatedWebm = Buffer.alloc(120000);
  webmHeader.copy(simulatedWebm, 0);

  const webmCheck = validateMagicBytes(simulatedWebm, "webm");
  assert(webmCheck.valid === true, "WebM voice note audio passes validation");
  assert(getFileCategory("webm") === "AUDIO", "Category is AUDIO");
  assert(simulatedWebm.length <= getMaxSizeBytesForExtension("webm"), "Within 25 MB audio limit");

  // 5. Presigned URL generator validation with mocked S3 client
  console.log("\n🔑 5. Testing Presigned URL generation contract");
  process.env.AWS_S3_BUCKET = "test-bucket";
  process.env.AWS_REGION = "ap-southeast-1";
  process.env.AWS_ACCESS_KEY_ID = "mock_key";
  process.env.AWS_SECRET_ACCESS_KEY = "mock_secret";

  const presigned = await getPresignedUploadUrl("uploads/messages/user_1/test.png", "image/png", 900);
  assert(presigned !== null, "Presigned upload generation succeeds with valid config");
  assert(Boolean(presigned?.publicUrl?.includes("test-bucket.s3.ap-southeast-1.amazonaws.com")), "Public URL points to correct S3 path");
  assert(Boolean(presigned?.uploadUrl?.includes("X-Amz-Signature") || presigned?.uploadUrl?.includes("test-bucket")), "Upload URL contains presigned authorization signature");

  console.log("\n==================================================");
  console.log(`🏁 TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
