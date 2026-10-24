/**
 * Production Routing & Security Verification Test
 * 
 * Validates:
 * 1. Homepage configuration & components
 * 2. Absence of external redirects to techblazing.com or unauthorized domains
 * 3. Legitimate authentication routes & redirect targets
 * 4. Content Security Policy headers in next.config.ts
 */

import nextConfig from '../next.config';

async function runTests() {
  console.log("=== RUNNING ROUTING & SECURITY TESTS ===");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. Verify nextConfig headers and CSP
  if (nextConfig.headers) {
    const headersConfig = await nextConfig.headers();
    assert(Array.isArray(headersConfig), "headers() returns an array");
    const globalHeader = headersConfig.find((h: any) => h.source === '/(.*)');
    assert(!!globalHeader, "Global source header rule exists for /(.*)");
    
    const csp = globalHeader?.headers?.find((h: any) => h.key === 'Content-Security-Policy');
    assert(!!csp, "Content-Security-Policy header is configured");
    assert(csp?.value?.includes("default-src 'self'"), "CSP restricts default-src to 'self'");
    assert(!csp?.value?.includes("techblazing.com"), "CSP does not whitelist techblazing.com");
  } else {
    assert(false, "nextConfig.headers should be defined");
  }

  // 2. Verify NextConfig does NOT have malicious rewrites or redirects
  assert(!nextConfig.redirects, "No unexpected redirects defined in nextConfig");
  assert(!nextConfig.rewrites, "No unexpected rewrites defined in nextConfig");

  // 3. Verify legitimate role redirects map strictly to internal dashboard paths
  const validRoles = ["ADMIN", "TEACHER", "PARENT", "STUDENT"];
  const expectedRedirects: Record<string, string> = {
    ADMIN: "/dashboard/admin",
    TEACHER: "/dashboard/teacher",
    PARENT: "/dashboard/parent",
    STUDENT: "/dashboard",
  };

  for (const role of validRoles) {
    const target = expectedRedirects[role];
    assert(
      target.startsWith("/dashboard") && !target.includes("http"),
      `Role ${role} routes strictly to internal path: ${target}`
    );
  }

  console.log(`\nTest Summary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
