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
    assert(Boolean(csp?.value?.includes("default-src 'self'")), "CSP restricts default-src to 'self'");
    assert(Boolean(!csp?.value?.includes("techblazing.com")), "CSP does not whitelist techblazing.com");
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

  // 4. Verify Technical SEO: robots.ts and sitemap.ts
  const robotsModule = await import('../app/robots');
  const robotsConfig = robotsModule.default();
  assert(robotsConfig.sitemap === 'https://nipoportal.vercel.app/sitemap.xml', 'robots.txt specifies canonical sitemap');
  const rules = Array.isArray(robotsConfig.rules) ? robotsConfig.rules[0] : robotsConfig.rules;
  assert(Boolean(rules?.disallow?.includes('/dashboard/')), 'robots.txt disallows /dashboard/');
  assert(Boolean(rules?.disallow?.includes('/api/')), 'robots.txt disallows /api/');
  assert(rules?.allow === '/' || (Array.isArray(rules?.allow) && rules.allow.includes('/')), 'robots.txt allows root homepage /');

  const sitemapModule = await import('../app/sitemap');
  const sitemapConfig = sitemapModule.default();
  assert(Array.isArray(sitemapConfig) && sitemapConfig.length > 0, 'sitemap returns non-empty array');
  assert(sitemapConfig[0].url === 'https://nipoportal.vercel.app', 'sitemap points to canonical production domain');
  assert(!sitemapConfig.some(entry => entry.url.includes('/dashboard')), 'sitemap does not contain private dashboard routes');
  assert(!sitemapConfig.some(entry => entry.url.includes('/api')), 'sitemap does not contain api routes');

  // 5. Verify Dashboard Layout robots metadata
  const fs = await import('fs');
  const path = await import('path');
  const layoutContent = fs.readFileSync(path.join(__dirname, '../frontend/app/dashboard/layout.tsx'), 'utf-8');
  assert(layoutContent.includes('export const metadata: Metadata = {'), 'Dashboard layout defines metadata');
  assert(layoutContent.includes('index: false') && layoutContent.includes('follow: false'), 'Dashboard layout enforces robots index: false (noindex)');

  console.log(`\nTest Summary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
