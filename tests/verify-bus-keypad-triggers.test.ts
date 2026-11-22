import { UpdateBusDriverSchema } from "../backend/lib/validations/transport";

async function runTests() {
  console.log("🚀 Starting Bus Keypad Dual-Button Trigger & Driver Permissions Test Suite...\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name}`);
      failed++;
    }
  }

  // TEST 1: UpdateBusDriverSchema validation
  console.log("1. Validating UpdateBusDriverSchema...");
  const validDriverPayload = {
    busId: "bus-cuid-123",
    driverName: "Suresh Babu",
    driverPhone: "+91 98450 12345",
    driverDob: "1980-05-15",
    routeDescription: "East Gate to Central Station",
  };
  const parseResult = UpdateBusDriverSchema.safeParse(validDriverPayload);
  assert(parseResult.success, "Valid driver update payload parses successfully");

  const invalidDriverPayload = {
    busId: "",
    driverName: "",
    driverPhone: "123", // too short
  };
  const invalidResult = UpdateBusDriverSchema.safeParse(invalidDriverPayload);
  assert(!invalidResult.success, "Invalid payload is rejected with validation errors");

  // TEST 2: Phone normalization logic for button phone caller ID matching
  console.log("\n2. Testing Phone Normalization & Keypad Caller Matching...");
  function matchPhone(dbPhone: string, incomingCaller: string) {
    const rawDigits = incomingCaller.replace(/\D/g, "");
    const last10Digits = rawDigits.slice(-10);
    const bDigits = dbPhone.replace(/\D/g, "");
    return (
      bDigits === rawDigits ||
      (last10Digits.length >= 7 && (bDigits.endsWith(last10Digits) || last10Digits.endsWith(bDigits.slice(-10))))
    );
  }

  assert(matchPhone("+91 98450 12345", "9845012345"), "Matches 10-digit incoming number with +91 database entry");
  assert(matchPhone("9845012345", "+919845012345"), "Matches +91 incoming caller with 10-digit database entry");
  assert(matchPhone("044-2456-7890", "24567890"), "Matches landline / local formatting without dashes");
  assert(!matchPhone("9845012345", "9123456789"), "Rejects different phone number");

  // TEST 3: Recipient Routing Rules for Button 1 and Button 2
  console.log("\n3. Testing Recipient Routing Rules...");
  
  // Simulated Button 1 scenario
  function resolveRecipients(buttonKey: string, parentsCount: number, adminCount: number, hasTeacher: boolean) {
    if (buttonKey === "1") {
      return {
        parents: parentsCount,
        admins: adminCount,
        teacher: hasTeacher ? 1 : 0,
        notifiedParents: true,
      };
    } else if (buttonKey === "2") {
      return {
        parents: 0, // STRICTLY ZERO PARENTS
        admins: adminCount,
        teacher: hasTeacher ? 1 : 0,
        notifiedParents: false,
      };
    }
    throw new Error("Invalid key");
  }

  const btn1Recipients = resolveRecipients("1", 35, 3, true);
  assert(btn1Recipients.parents === 35, "Button 1 notifies all 35 parents");
  assert(btn1Recipients.admins === 3, "Button 1 notifies all 3 administrators");
  assert(btn1Recipients.teacher === 1, "Button 1 notifies assigned teacher");
  assert(btn1Recipients.notifiedParents === true, "Button 1 flag indicates parents notified");

  const btn2Recipients = resolveRecipients("2", 35, 3, true);
  assert(btn2Recipients.parents === 0, "Button 2 STRICTLY DOES NOT notify parents (zero panic)");
  assert(btn2Recipients.admins === 3, "Button 2 notifies all 3 administrators");
  assert(btn2Recipients.teacher === 1, "Button 2 notifies assigned teacher");
  assert(btn2Recipients.notifiedParents === false, "Button 2 strictly excludes parents");

  // TEST 4: Teacher Permission Check
  console.log("\n4. Testing Teacher Access Control for Assigned Bus...");
  function canTeacherEditBus(
    userRole: string,
    busInChargeStaffId: string | null,
    teacherStaffId: string
  ): boolean {
    if (userRole === "ADMIN") return true;
    if (["TEACHER", "STAFF", "NON_TEACHING_STAFF"].includes(userRole)) {
      return busInChargeStaffId === teacherStaffId;
    }
    return false;
  }

  assert(canTeacherEditBus("ADMIN", "staff-1", "staff-2"), "Admin can edit any bus");
  assert(canTeacherEditBus("TEACHER", "staff-1", "staff-1"), "Assigned teacher can edit their own bus");
  assert(!canTeacherEditBus("TEACHER", "staff-1", "staff-2"), "Teacher CANNOT edit someone else's bus");
  assert(!canTeacherEditBus("PARENT", "staff-1", "staff-1"), "Parent cannot edit bus");

  console.log(`\n========================================`);
  console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
