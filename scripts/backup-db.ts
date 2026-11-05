/**
 * Automated Database Backup to S3
 * Dumps primary database and uploads gzip archive to private AWS S3 bucket.
 * 
 * Usage:
 *   npx tsx scripts/backup-db.ts
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Load environment variables
const repoRoot = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(repoRoot, ".env.production"));
} catch {
  try {
    process.loadEnvFile(path.join(repoRoot, ".env"));
  } catch {
    // env already loaded
  }
}

const databaseUrl = process.env.DATABASE_URL;
const bucketName = process.env.S3_STORAGE_BUCKET || process.env.AWS_S3_BUCKET;
const region = process.env.AWS_REGION || "ap-southeast-1";

async function runBackup() {
  console.log("==================================================");
  console.log("🛡️  Starting Automated Database Backup to S3");
  console.log("==================================================");

  if (!databaseUrl) {
    console.error("❌ Error: DATABASE_URL is not set.");
    process.exit(1);
  }

  if (!bucketName) {
    console.error("❌ Error: S3_STORAGE_BUCKET or AWS_S3_BUCKET is not set.");
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const tempDir = path.join(repoRoot, "tmp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const backupFileName = `backup-${timestamp}.sql.gz`;
  const backupFilePath = path.join(tempDir, backupFileName);

  console.log(`📦 Creating compressed pg_dump archive...`);
  try {
    // pg_dump into gzip
    const dumpCmd = `pg_dump "${databaseUrl}" --no-owner --no-acl --clean --if-exists | gzip > "${backupFilePath}"`;
    execSync(dumpCmd, { stdio: "inherit", shell: "/bin/bash" });
  } catch (err) {
    console.warn("⚠️ pg_dump command failed or not installed. Attempting Prisma schema & data snapshot fallback...");
    // If pg_dump CLI is not installed on host, notify admin
    console.error("❌ pg_dump must be installed on host system (e.g. dnf install postgresql).");
    process.exit(1);
  }

  const fileStats = fs.statSync(backupFilePath);
  const sizeMb = (fileStats.size / (1024 * 1024)).toFixed(2);
  console.log(`✅ Backup archive created (${sizeMb} MB): ${backupFileName}`);

  console.log(`☁️ Uploading to S3 bucket: s3://${bucketName}/backups/${backupFileName}...`);
  const s3 = new S3Client({ region });
  const fileStream = fs.createReadStream(backupFilePath);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: `backups/${backupFileName}`,
      Body: fileStream,
      ContentType: "application/gzip",
      ServerSideEncryption: "AES256",
    })
  );

  console.log(`🎉 Backup successfully uploaded to S3!`);

  // Clean up local temp file
  fs.unlinkSync(backupFilePath);
  console.log("🧹 Cleaned up local temporary backup file.");
}

runBackup().catch((err) => {
  console.error("❌ Backup failed:", err);
  process.exit(1);
});

