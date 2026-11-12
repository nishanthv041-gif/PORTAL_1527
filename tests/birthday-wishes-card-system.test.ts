import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  serializeBirthdayCardPayload,
  parseBirthdayCardPayload,
  buildBirthdaySummaryText,
  BIRTHDAY_CARD_PREFIX,
  BirthdayCardPayload,
} from "../frontend/components/birthdays/birthdayCardUtils";
import { prisma } from "../backend/db/prisma";

async function runTests() {
  console.log("=== RUNNING BIRTHDAY WISHES CARD SYSTEM VERIFICATION ===");

  // Test 1: Static Amman Image Asset exists
  console.log("1. Checking static Amman deity asset...");
  const ammanPath = path.join(process.cwd(), "public", "assets", "birthday", "amman.jpg");
  assert.ok(fs.existsSync(ammanPath), "Amman photo should exist at public/assets/birthday/amman.jpg");
  const stats = fs.statSync(ammanPath);
  assert.ok(stats.size > 10000, `Amman photo file size should be substantial (actual: ${stats.size} bytes)`);
  console.log(`✓ Amman photo verified (${stats.size} bytes).`);

  // Test 2: Payload serialization and parsing
  console.log("2. Testing payload serialization and parsing...");
  const samplePayload: BirthdayCardPayload = {
    recipientName: "Anushka A",
    classNameLabel: "Class 10-A",
    deityName: "Lord Bannari Amman",
    cardLine1: "I have great pleasure in conveying my best wishes on the eve of your birthday",
    cardLine2: "My prayers are to Lord Bannari Amman to bless you with peace, prosperity and happiness",
    senderName: "PRANAV.J",
    senderDesignation: "Correspondent",
    schoolName: "SRT SCHOOL",
    schoolLogo: "/logo/srt-logo.svg",
    schoolTagline: "Universal School",
    ammanPhotoUrl: "/assets/birthday/amman.jpg",
    summaryText: "Happy Birthday Anushka A! May Lord Bannari Amman bless you with peace, prosperity, and happiness. - PRANAV.J, Correspondent, SRT SCHOOL",
  };

  const serialized = serializeBirthdayCardPayload(samplePayload);
  assert.ok(serialized.startsWith(BIRTHDAY_CARD_PREFIX), "Serialized payload should start with prefix");

  const parsed = parseBirthdayCardPayload(serialized);
  assert.ok(parsed !== null, "Parsed payload should not be null");
  assert.equal(parsed?.recipientName, "Anushka A");
  assert.equal(parsed?.deityName, "Lord Bannari Amman");
  assert.equal(parsed?.senderName, "PRANAV.J");
  assert.equal(parsed?.senderDesignation, "Correspondent");
  assert.equal(parsed?.schoolName, "SRT SCHOOL");
  console.log("✓ Serialization and deserialization roundtrip verified.");

  // Test 3: Plain text summary building
  console.log("3. Testing summary text builder...");
  const summary = buildBirthdaySummaryText({
    recipientName: "Anushka A",
    senderName: "PRANAV.J",
    senderDesignation: "Correspondent",
    schoolName: "SRT SCHOOL",
    deityName: "Amman",
  });
  assert.ok(summary.includes("Anushka A"), "Summary should include recipient name");
  assert.ok(summary.includes("PRANAV.J"), "Summary should include Correspondent name");
  assert.ok(summary.includes("Amman"), "Summary should include deity name");
  console.log("✓ Summary text builder verified:", summary);

  // Test 4: Database BirthdaySettings verification
  console.log("4. Verifying database BirthdaySettings record...");
  const settings = await prisma.birthdaySettings.findUnique({
    where: { id: "default" },
  });
  assert.ok(settings !== null, "BirthdaySettings record should exist in database");
  assert.ok(["S V Balasubramaniam", "PRANAV.J"].includes(settings?.senderName || ""), "senderName should be valid");
  assert.ok(["Chairman", "Correspondent"].includes(settings?.senderDesignation || ""), "senderDesignation should be valid");
  assert.ok(settings?.deityName?.includes("Amman"), "deityName should refer to Amman");
  console.log("✓ Database record verified:", {
    senderName: settings?.senderName,
    senderDesignation: settings?.senderDesignation,
    deityName: settings?.deityName,
  });

  // Test 5: Idempotency check logic
  console.log("5. Testing wish idempotency constraint...");
  const year = new Date().getFullYear();
  // Ensure BirthdayWish compound index or check works
  const sampleWishWhere = {
    audience: "PARENT_OF_STUDENT" as const,
    personType: "student",
    personId: "nonexistent-test-id",
    year,
  };
  const existing = await prisma.birthdayWish.findFirst({
    where: sampleWishWhere,
  });
  assert.equal(existing, null, "Should return null for non-existent student wish");
  console.log("✓ Idempotency query verified.");

  console.log("\nALL TESTS PASSED SUCCESSFULLY! 🎉");
  await prisma.$disconnect();
}

runTests().catch(async (e) => {
  console.error("Test failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
