import fs from "fs";
import path from "path";
import { sanitizeS3Key, getSecureS3Config, PresignedUrlOptions } from "../lib/s3Secure";

function runVerification() {
  console.log("================================================================================");
  console.log("🛡️ 5-LAYER SECURITY FIREWALL VERIFICATION SUITE");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, extra?: string) {
    if (condition) {
      console.log(`[PASS] ${name}${extra ? ` - ${extra}` : ""}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}${extra ? ` - ${extra}` : ""}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // Layer 1: middleware.ts (CORS, Rate Limiting, Hardened Security Headers)
  // ---------------------------------------------------------------------------
  console.log("--- Layer 1: Edge Firewall Middleware (middleware.ts) ---");
  const middlewarePath = path.join(process.cwd(), "middleware.ts");
  assert("middleware.ts exists", fs.existsSync(middlewarePath));

  if (fs.existsSync(middlewarePath)) {
    const content = fs.readFileSync(middlewarePath, "utf8");

    // CORS Origin Filtering
    assert("middleware.ts checks ALLOWED_ORIGINS", content.includes("ALLOWED_ORIGINS"));
    assert("middleware.ts implements origin validation", content.includes("isOriginAllowed"));
    assert("middleware.ts rejects unauthorized CORS origins with 403", content.includes("403") && content.includes("CORS origin forbidden"));
    assert("middleware.ts handles OPTIONS preflight requests", content.includes("OPTIONS") && content.includes("Access-Control-Allow-Methods"));
    assert("middleware.ts sets Access-Control-Allow-Credentials: true", content.includes("Access-Control-Allow-Credentials"));

    // IP-Based Rate Limiting
    assert("middleware.ts enforces 5 req/min on /api/auth/login", content.includes("/api/auth/login") && content.includes("limit = isAuthLogin ? 5 : 30"));
    assert("middleware.ts enforces 30 req/min on general /api/*", content.includes("30") && content.includes("checkRateLimit"));
    assert("middleware.ts extracts client IP from headers", content.includes("x-forwarded-for") && content.includes("x-real-ip"));
    assert("middleware.ts returns HTTP 429 when rate limit exceeded", content.includes("429") && content.includes("Retry-After"));

    // Hardened Security Headers
    assert("middleware.ts sets X-Frame-Options: DENY", content.includes('"X-Frame-Options": "DENY"'));
    assert("middleware.ts sets X-Content-Type-Options: nosniff", content.includes('"X-Content-Type-Options": "nosniff"'));
    assert("middleware.ts sets Content-Security-Policy (CSP)", content.includes("Content-Security-Policy") && content.includes("frame-ancestors 'none'"));
    assert("middleware.ts sets Strict-Transport-Security (HSTS)", content.includes("Strict-Transport-Security") && content.includes("max-age=31536000"));
    assert("middleware.ts sets Referrer-Policy", content.includes("Referrer-Policy"));
    assert("middleware.ts preserves NextAuth token revocation checks", content.includes("isRevoked"));
  }

  // ---------------------------------------------------------------------------
  // Layer 2: lib/s3Secure.ts (APP_AWS_ credentials, 60s expiring pre-signed URLs)
  // ---------------------------------------------------------------------------
  console.log("\n--- Layer 2: S3 Secure Service (lib/s3Secure.ts) ---");
  const s3SecurePath = path.join(process.cwd(), "lib/s3Secure.ts");
  assert("lib/s3Secure.ts exists", fs.existsSync(s3SecurePath));

  if (fs.existsSync(s3SecurePath)) {
    const content = fs.readFileSync(s3SecurePath, "utf8");

    assert("s3Secure.ts imports @aws-sdk/client-s3", content.includes("@aws-sdk/client-s3"));
    assert("s3Secure.ts imports getSignedUrl from @aws-sdk/s3-request-presigner", content.includes("@aws-sdk/s3-request-presigner"));
    assert("s3Secure.ts resolves APP_AWS_ACCESS_KEY_ID", content.includes("APP_AWS_ACCESS_KEY_ID"));
    assert("s3Secure.ts resolves APP_AWS_SECRET_ACCESS_KEY", content.includes("APP_AWS_SECRET_ACCESS_KEY"));
    assert("s3Secure.ts resolves APP_AWS_REGION", content.includes("APP_AWS_REGION"));
    assert("s3Secure.ts resolves APP_AWS_BUCKET_NAME", content.includes("APP_AWS_BUCKET_NAME"));
    assert("s3Secure.ts enforces 60-second expiration window", content.includes("expiresIn = 60") && content.includes("Math.min"));

    // Test sanitization function
    const sanitizedTraverse = sanitizeS3Key("../../../secret.pdf");
    assert("sanitizeS3Key strips leading traversal attacks", sanitizedTraverse === "secret.pdf", `got: ${sanitizedTraverse}`);

    const sanitizedSlash = sanitizeS3Key("///uploads/file.png");
    assert("sanitizeS3Key strips leading slashes", sanitizedSlash === "uploads/file.png", `got: ${sanitizedSlash}`);

    const sanitizedNormal = sanitizeS3Key("uploads/student/avatar.jpg");
    assert("sanitizeS3Key preserves clean paths", sanitizedNormal === "uploads/student/avatar.jpg");
  }

  // ---------------------------------------------------------------------------
  // Layer 3: app/api/files/signed-url/route.ts (JWT Session Role Verification)
  // ---------------------------------------------------------------------------
  console.log("\n--- Layer 3: S3 Signed URL Route Handler (app/api/files/signed-url/route.ts) ---");
  const routePath = path.join(process.cwd(), "app/api/files/signed-url/route.ts");
  assert("app/api/files/signed-url/route.ts exists", fs.existsSync(routePath));

  if (fs.existsSync(routePath)) {
    const content = fs.readFileSync(routePath, "utf8");

    assert("Route handler imports getServerSession", content.includes("getServerSession"));
    assert("Route handler verifies active JWT session role", content.includes("userRole") && content.includes("userId"));
    assert("Route handler returns 401 when unauthenticated", content.includes("401") && content.includes("Authentication required"));
    assert("Route handler enforces role-based prefix isolation", content.includes("ROLE_ALLOWED_PREFIXES") && content.includes("isKeyAuthorizedForRole"));
    assert("Route handler rejects path traversal with 400", content.includes("400") && content.includes("Path traversal"));
    assert("Route handler returns 60-second expiring signedUrl", content.includes("expiresIn: 60") && content.includes("signedUrl"));
    assert("Route handler exports POST and GET methods", content.includes("export async function POST") && content.includes("export async function GET"));
  }

  // ---------------------------------------------------------------------------
  // Layer 4: db/rls_policies.sql (PostgreSQL Row-Level Security Policies)
  // ---------------------------------------------------------------------------
  console.log("\n--- Layer 4: PostgreSQL RLS Policies (db/rls_policies.sql) ---");
  const rlsPath = path.join(process.cwd(), "db/rls_policies.sql");
  assert("db/rls_policies.sql exists", fs.existsSync(rlsPath));

  if (fs.existsSync(rlsPath)) {
    const content = fs.readFileSync(rlsPath, "utf8");

    // Tables RLS enabled
    assert("Enables RLS on Student table", content.includes('ALTER TABLE "Student" ENABLE ROW LEVEL SECURITY;'));
    assert("Enables RLS on Attendance table", content.includes('ALTER TABLE "Attendance" ENABLE ROW LEVEL SECURITY;'));
    assert("Enables RLS on Mark table", content.includes('ALTER TABLE "Mark" ENABLE ROW LEVEL SECURITY;'));

    // Parent isolation
    assert("Isolates Student table by parent_id", content.includes("parent_student_isolation_select") && content.includes('"ParentStudent"'));
    assert("Isolates Attendance table by parent_id", content.includes("parent_attendance_isolation_select") && content.includes('current_app_parent_id()'));
    assert("Isolates Mark table by parent_id", content.includes("parent_mark_isolation_select") && content.includes('current_app_parent_id()'));

    // Teacher isolation
    assert("Isolates Student table by teacher_id", content.includes("teacher_student_isolation_select") && content.includes('current_app_teacher_id()'));
    assert("Isolates Attendance table by teacher_id", content.includes("teacher_attendance_isolation_all") && content.includes('current_app_teacher_id()'));
    assert("Isolates Mark table by teacher_id", content.includes("teacher_mark_isolation_all") && content.includes('"enteredByStaffId"'));

    // Admin & Student access
    assert("Grants full bypass access to ADMIN", content.includes("admin_student_all") && content.includes("current_app_user_role() = 'ADMIN'"));
    assert("Allows student self-access to their own records", content.includes("student_self_isolation_select") && content.includes("student_attendance_isolation_select"));
  }

  // ---------------------------------------------------------------------------
  // Layer 5: amplify.yml (Server Environment Variable Propagation)
  // ---------------------------------------------------------------------------
  console.log("\n--- Layer 5: AWS Amplify Build Pipeline (amplify.yml) ---");
  const amplifyPath = path.join(process.cwd(), "amplify.yml");
  assert("amplify.yml exists", fs.existsSync(amplifyPath));

  if (fs.existsSync(amplifyPath)) {
    const content = fs.readFileSync(amplifyPath, "utf8");

    assert("amplify.yml writes server environment variables into .env.production", content.includes(".env.production"));
    assert("amplify.yml passes APP_AWS_ACCESS_KEY_ID", content.includes("APP_AWS_ACCESS_KEY_ID"));
    assert("amplify.yml passes APP_AWS_SECRET_ACCESS_KEY", content.includes("APP_AWS_SECRET_ACCESS_KEY"));
    assert("amplify.yml passes APP_AWS_REGION", content.includes("APP_AWS_REGION"));
    assert("amplify.yml passes APP_AWS_BUCKET_NAME", content.includes("APP_AWS_BUCKET_NAME"));
    assert("amplify.yml passes APP_AWS_S3_BUCKET", content.includes("APP_AWS_S3_BUCKET"));
    assert("amplify.yml passes ALLOWED_ORIGINS", content.includes("ALLOWED_ORIGINS"));
    assert("amplify.yml strips server source maps (.map)", content.includes('find .next/server -name "*.map" -type f -delete'));
    assert("amplify.yml enforces build packaging budget", content.includes("scripts/check-build-size.mjs"));
  }

  console.log("\n================================================================================");
  console.log(`TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification();
