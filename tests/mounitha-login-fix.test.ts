import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../backend/db/prisma";

async function simulateCredentialsLogin(identifier: string, pass: string) {
  const cleanEmail = identifier.trim();
  const lowerEmail = cleanEmail.toLowerCase();
  const digitsOnly = cleanEmail.replace(/[^0-9]/g, "");

  const searchConditions: any[] = [
    { email: { equals: lowerEmail, mode: "insensitive" } },
    { email: { equals: cleanEmail, mode: "insensitive" } },
    { email: cleanEmail },
    { alternateEmail: { equals: lowerEmail, mode: "insensitive" } },
    { alternateEmail: { equals: cleanEmail, mode: "insensitive" } },
    { alternateEmail: cleanEmail },
    { googleEmail: { equals: lowerEmail, mode: "insensitive" } },
    { googleEmail: { equals: cleanEmail, mode: "insensitive" } },
    { googleEmail: cleanEmail },
  ];

  if (digitsOnly.length === 10) {
    searchConditions.push(
      { teacher: { phone: digitsOnly } },
      { parent: { phone: digitsOnly } }
    );
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: searchConditions,
    },
  });

  if (!user || !user.password) {
    return { success: false, reason: "USER_NOT_FOUND" };
  }

  const isPasswordValid = await bcrypt.compare(pass, user.password);
  if (!isPasswordValid) {
    return { success: false, reason: "INVALID_PASSWORD" };
  }

  return { success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

async function runTests() {
  console.log("=== RUNNING LOGIN FIX VERIFICATION FOR TEACHER MOUNITHA V ===");

  const password = "Mouni@#$" + "2008"; // Avoid powershell variable expansion

  // Test 1: Login with personal gmail
  console.log("1. Testing login with 'mounithavenkatesan@gmail.com'...");
  const res1 = await simulateCredentialsLogin("mounithavenkatesan@gmail.com", password);
  assert.equal(res1.success, true, "Should succeed with personal gmail");
  assert.equal(res1.user?.name, "MOUNITHA V");
  assert.equal(res1.user?.role, "TEACHER");
  console.log("✓ Login with personal gmail succeeded as MOUNITHA V (TEACHER).");

  // Test 2: Login with institutional email (bitsathy.ac.in - the one from Image 2!)
  console.log("2. Testing login with 'mounithav.ad25@bitsathy.ac.in' (from Image 2)...");
  const res2 = await simulateCredentialsLogin("mounithav.ad25@bitsathy.ac.in", password);
  assert.equal(res2.success, true, "Should succeed with institutional bitsathy email");
  assert.equal(res2.user?.name, "MOUNITHA V");
  assert.equal(res2.user?.role, "TEACHER");
  console.log("✓ Login with institutional email succeeded as MOUNITHA V (TEACHER).");

  // Test 3: Login with phone number
  console.log("3. Testing login with phone number '8015519276'...");
  const res3 = await simulateCredentialsLogin("8015519276", password);
  assert.equal(res3.success, true, "Should succeed with phone number");
  assert.equal(res3.user?.name, "MOUNITHA V");
  console.log("✓ Login with phone number succeeded as MOUNITHA V.");

  // Test 4: Wrong password check
  console.log("4. Testing login with wrong password...");
  const res4 = await simulateCredentialsLogin("mounithav.ad25@bitsathy.ac.in", "WrongPassword123!");
  assert.equal(res4.success, false);
  assert.equal(res4.reason, "INVALID_PASSWORD");
  console.log("✓ Wrong password correctly rejected.");

  // Test 5: Non-existent user check
  console.log("5. Testing login with non-existent user...");
  const res5 = await simulateCredentialsLogin("nonexistent_user@example.com", "any_password");
  assert.equal(res5.success, false);
  assert.equal(res5.reason, "USER_NOT_FOUND");
  console.log("✓ Non-existent user correctly rejected.");

  console.log("\nALL LOGIN VERIFICATION TESTS PASSED! 🎉");
  await prisma.$disconnect();
}

runTests().catch(async (err) => {
  console.error("Test failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
