import fs from "fs";
import path from "path";

function runPerformanceVerification() {
  console.log("================================================================================");
  console.log("⚡ PERFORMANCE, ZERO-LAG NAVIGATION & INSTANT MOBILE OPENING VERIFICATION");
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

  // 1. Mobile Splash Screen Instant Open (Eliminating Mobile Hanging Screen)
  console.log("--- Check 1: Capacitor Native Splash Screen Configuration ---");
  const capConfigPath = path.join(process.cwd(), "capacitor.config.ts");
  assert("capacitor.config.ts exists", fs.existsSync(capConfigPath));

  if (fs.existsSync(capConfigPath)) {
    const content = fs.readFileSync(capConfigPath, "utf8");
    assert("SplashScreen launchShowDuration is set to 0 (no artificial native freeze)", content.includes("launchShowDuration: 0"));
    assert("SplashScreen launchAutoHide is enabled", content.includes("launchAutoHide: true"));
  }

  const homeClientPath = path.join(process.cwd(), "frontend/app/HomeClient.tsx");
  assert("HomeClient.tsx exists", fs.existsSync(homeClientPath));
  if (fs.existsSync(homeClientPath)) {
    const content = fs.readFileSync(homeClientPath, "utf8");
    assert("HomeClient hides native splash immediately on mount", content.includes("SplashScreen.hide"));
    assert("HomeClient auto-redirects active sessions to dashboard", content.includes("getPersistedNativeSession") || content.includes("/dashboard"));
  }

  // 2. Client-Side Instant Navigation & Skeletons
  console.log("\n--- Check 2: Zero-Lag Navigation Shell & Loading Skeletons ---");
  const loadingPath = path.join(process.cwd(), "frontend/app/loading.tsx");
  assert("Root loading.tsx shimmer skeleton exists", fs.existsSync(loadingPath));

  const errorPath = path.join(process.cwd(), "frontend/app/error.tsx");
  assert("Root error.tsx error boundary exists", fs.existsSync(errorPath));
  if (fs.existsSync(errorPath)) {
    const content = fs.readFileSync(errorPath, "utf8");
    assert("error.tsx exports default function with reset handler", content.includes("reset: () => void") && content.includes("Try again"));
    assert("error.tsx includes instant link to /dashboard", content.includes("/dashboard"));
  }

  // 3. Rate Limiting & High-Frequency API Exemption
  console.log("\n--- Check 3: Middleware Rate Limiting & Chat Polling Resilience ---");
  const middlewarePath = path.join(process.cwd(), "middleware.ts");
  assert("middleware.ts exists", fs.existsSync(middlewarePath));
  if (fs.existsSync(middlewarePath)) {
    const content = fs.readFileSync(middlewarePath, "utf8");
    assert("middleware.ts enforces 5 req/min on /api/auth/login", content.includes("limit = isAuthLogin ? 5 : 30"));
    assert("middleware.ts enforces 30 req/min on general /api/*", content.includes("30") && content.includes("checkRateLimit"));
    assert("middleware.ts separates high-frequency polling/streaming capacity", content.includes("isHighFrequencyInternal") && content.includes("polling:"));
  }

  // 4. Chat Thread Polling Optimization
  console.log("\n--- Check 4: Chat Polling Cadence ---");
  const chatThreadPath = path.join(process.cwd(), "frontend/components/chat/ChatThreadClient.tsx");
  assert("ChatThreadClient.tsx exists", fs.existsSync(chatThreadPath));
  if (fs.existsSync(chatThreadPath)) {
    const content = fs.readFileSync(chatThreadPath, "utf8");
    assert("Chat polling uses 4000ms active interval to prevent rate limit saturation", content.includes("startPolling(4000)"));
  }

  // 5. Database Performance Indexes
  console.log("\n--- Check 5: Database Performance Indexes ---");
  const sqlIndexPath = path.join(process.cwd(), "db/performance_indexes.sql");
  assert("db/performance_indexes.sql exists", fs.existsSync(sqlIndexPath));
  if (fs.existsSync(sqlIndexPath)) {
    const content = fs.readFileSync(sqlIndexPath, "utf8");
    assert("Student indexes defined", content.includes("idx_student_class_active") && content.includes("idx_student_admission_no"));
    assert("Attendance indexes defined", content.includes("idx_attendance_student_date") && content.includes("idx_attendance_class_date"));
    assert("Mark / Exam indexes defined", content.includes("idx_mark_student_exam_subject") && content.includes("idx_mark_exam_subject"));
    assert("ParentStudent indexes defined", content.includes("idx_parent_student_composite"));
    assert("Message indexes defined", content.includes("idx_message_sender_receiver_created"));
    assert("Notification indexes defined", content.includes("idx_notification_recipient_read_created"));
  }

  // 6. Mobile 300ms Delay Elimination
  console.log("\n--- Check 6: Touch Action Manipulation ---");
  const globalsCssPath = path.join(process.cwd(), "frontend/app/globals.css");
  assert("globals.css exists", fs.existsSync(globalsCssPath));
  if (fs.existsSync(globalsCssPath)) {
    const content = fs.readFileSync(globalsCssPath, "utf8");
    assert("touch-action: manipulation enforced", content.includes("touch-action: manipulation"));
    assert("-webkit-tap-highlight-color transparent configured", content.includes("-webkit-tap-highlight-color: transparent"));
  }

  // 7. Next.js Package Optimization
  console.log("\n--- Check 7: Next.js Configuration ---");
  const nextConfigPath = path.join(process.cwd(), "next.config.ts");
  assert("next.config.ts exists", fs.existsSync(nextConfigPath));
  if (fs.existsSync(nextConfigPath)) {
    const content = fs.readFileSync(nextConfigPath, "utf8");
    assert("nextConfig enables compress", content.includes("compress: true"));
    assert("optimizePackageImports includes performance icon packages", content.includes("lucide-react") && content.includes("recharts"));
  }

  console.log("\n================================================================================");
  console.log(`📊 PERFORMANCE VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPerformanceVerification();
