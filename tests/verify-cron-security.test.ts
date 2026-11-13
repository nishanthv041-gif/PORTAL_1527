import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/cron/birthdays/route";

async function testSecurity() {
  console.log("==================================================================");
  console.log("TESTING CRON ROUTE SECURITY & CRON_SECRET VERIFICATION");
  console.log("==================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✓ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${msg}`);
      failed++;
    }
  }

  process.env.CRON_SECRET = "test-secret-key-123456";

  // 1. Request with NO authorization header
  const reqNoAuth = new NextRequest("http://localhost:3000/api/cron/birthdays", {
    method: "GET",
  });
  const resNoAuth = await GET(reqNoAuth);
  assert(resNoAuth.status === 401, "GET without Authorization header is rejected with HTTP 401 Unauthorized");

  // 2. Request with INVALID authorization header
  const reqInvalid = new NextRequest("http://localhost:3000/api/cron/birthdays", {
    method: "GET",
    headers: {
      authorization: "Bearer wrong-secret-key",
    },
  });
  const resInvalid = await GET(reqInvalid);
  assert(resInvalid.status === 401, "GET with invalid Bearer token is rejected with HTTP 401 Unauthorized");

  // 3. Request with VALID Authorization: Bearer <CRON_SECRET>
  const reqValidBearer = new NextRequest("http://localhost:3000/api/cron/birthdays", {
    method: "GET",
    headers: {
      authorization: "Bearer test-secret-key-123456",
    },
  });
  const resValidBearer = await GET(reqValidBearer);
  assert(resValidBearer.status === 200, "GET with valid Bearer token is accepted with HTTP 200 OK");

  // 4. Request with VALID x-cron-secret header
  const reqValidHeader = new NextRequest("http://localhost:3000/api/cron/birthdays", {
    method: "GET",
    headers: {
      "x-cron-secret": "test-secret-key-123456",
    },
  });
  const resValidHeader = await GET(reqValidHeader);
  assert(resValidHeader.status === 200, "GET with valid x-cron-secret header is accepted with HTTP 200 OK");

  // 5. POST request with invalid secret
  const reqPostInvalid = new NextRequest("http://localhost:3000/api/cron/birthdays", {
    method: "POST",
    headers: {
      authorization: "Bearer wrong-secret",
    },
    body: JSON.stringify({}),
  });
  const resPostInvalid = await POST(reqPostInvalid);
  assert(resPostInvalid.status === 401, "POST with invalid Bearer token is rejected with HTTP 401 Unauthorized");

  console.log("\n==================================================================");
  console.log(`SECURITY SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) process.exit(1);
}

testSecurity().catch((e) => {
  console.error("Security test failed:", e);
  process.exit(1);
});
