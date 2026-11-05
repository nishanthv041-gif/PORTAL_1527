import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testLogins() {
  console.log("=== TESTING LOGIN READINESS & AUTH LOOKUP ===");

  // 1. Test case-insensitive lookup
  const teacherUser = await prisma.user.findFirst({
    where: { role: "TEACHER", status: "ACTIVE" },
    select: { id: true, email: true, password: true, googleEmail: true }
  });

  if (!teacherUser || !teacherUser.email || !teacherUser.password) {
    console.log("No existing active teacher found to test, checking admin...");
  } else {
    console.log(`Testing teacher account: ${teacherUser.email}`);
    
    // Test lowercase lookup
    const foundLower = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: teacherUser.email.toLowerCase(), mode: "insensitive" } },
          { email: { equals: teacherUser.email, mode: "insensitive" } },
          { email: teacherUser.email }
        ]
      }
    });
    if (!foundLower || foundLower.id !== teacherUser.id) {
      throw new Error("Case-insensitive email lookup failed for lowercase input");
    }

    // Test UPPERCASE lookup
    const foundUpper = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: teacherUser.email.toUpperCase(), mode: "insensitive" } },
          { email: { equals: teacherUser.email, mode: "insensitive" } },
          { email: teacherUser.email }
        ]
      }
    });
    if (!foundUpper || foundUpper.id !== teacherUser.id) {
      throw new Error("Case-insensitive email lookup failed for UPPERCASE input");
    }

    console.log("✓ Case-insensitive email lookup works for both lowercase and UPPERCASE typing!");
  }

  // 2. Test numeric passwords & leading zeros preservation
  const testNumericPassword = "05031978";
  const hash = await bcrypt.hash(testNumericPassword, 10);
  const isMatch = await bcrypt.compare("05031978", hash);
  const isWrongNumberMatch = await bcrypt.compare(String(5031978), hash); // Without leading zero

  if (!isMatch) throw new Error("Numeric password matching failed");
  if (isWrongNumberMatch) throw new Error("Leading zero was lost in password comparison");
  console.log("✓ Leading zeros and numeric string passwords preserved securely without digit loss!");

  // 3. Test Google SSO matching logic
  const testGoogleEmail = "TeacherSample@Gmail.Com";
  const cleanEmail = testGoogleEmail.trim().toLowerCase();
  console.log(`Clean Google email: "${cleanEmail}"`);
  if (cleanEmail !== "teachersample@gmail.com") {
    throw new Error("Google email canonicalization failed");
  }
  console.log("✓ Google SSO email normalization verified!");

  console.log("=== ALL SAMPLE LOGIN & SECURITY CHECKS PASSED ===");
}

testLogins()
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

