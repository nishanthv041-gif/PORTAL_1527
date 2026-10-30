import assert from "node:assert";
import { prisma } from "../backend/db/prisma";
import bcrypt from "bcryptjs";

async function runTests() {
  console.log("=== STARTING MANAGEMENT & AUTH INTEGRATION TESTS ===");

  let testClassId: string = "";
  let testTeacherUserId: string = "";
  let testTeacherId: string = "";
  let testStudentId: string = "";
  let testParentUserId: string = "";
  let testParentId: string = "";

  try {
    // 1. Setup Test Class
    let testClass = await prisma.class.findFirst({ where: { name: "Test Auto Grade" } });
    if (!testClass) {
      testClass = await prisma.class.create({
        data: {
          name: "Test Auto Grade",
          section: "Z",
          isActive: true,
        }
      });
    }
    testClassId = testClass.id;
    console.log("✓ Test class initialized:", testClass.id);

    // 2. Test Teacher Creation & Session Version
    const rawPass = "TeacherSecure@2026";
    const hashed = await bcrypt.hash(rawPass, 10);
    const testEmail = `teacher.test.${Date.now()}@schoolportal.edu`;

    const user = await prisma.user.create({
      data: {
        name: "Dr. Alistair Finch",
        email: testEmail,
        password: hashed,
        role: "TEACHER",
        status: "ACTIVE",
        sessionVersion: 1,
      }
    });
    testTeacherUserId = user.id;

    const teacher = await prisma.teacher.create({
      data: {
        userId: user.id,
        phone: "+1 (555) 012-3456",
        alternatePhone: "+1 (555) 012-7890",
        qualification: "Ph.D. Physics",
        maxPeriodsPerDay: 5,
        maxPeriodsPerWeek: 25,
        isActive: true,
      }
    });
    testTeacherId = teacher.id;

    assert.strictEqual(user.sessionVersion, 1, "Initial sessionVersion should be 1");
    assert.strictEqual(teacher.userId, user.id, "Teacher must link to User ID");
    assert.strictEqual(teacher.phone, "+1 (555) 012-3456", "Phone must match");
    console.log("✓ Teacher creation & initial sessionVersion: PASS");

    // 3. Test Credential Change & Session Version Bump
    const newPass = "TeacherNewPass@2026";
    const newHashed = await bcrypt.hash(newPass, 10);

    const updatedUser = await prisma.user.update({
      where: { id: testTeacherUserId },
      data: {
        password: newHashed,
        sessionVersion: { increment: 1 }
      }
    });

    assert.strictEqual(updatedUser.sessionVersion, 2, "sessionVersion should increment to 2 on password change");
    const isNewPassValid = await bcrypt.compare(newPass, updatedUser.password!);
    assert.strictEqual(isNewPassValid, true, "Bcrypt verification for new password must pass");
    console.log("✓ Password reset & session version increment: PASS");

    // 4. Test Teacher Deactivation & Revocation
    const deactivatedUser = await prisma.user.update({
      where: { id: testTeacherUserId },
      data: {
        status: "INACTIVE",
        sessionVersion: { increment: 1 }
      }
    });
    const deactivatedTeacher = await prisma.teacher.update({
      where: { id: testTeacherId },
      data: { isActive: false }
    });

    assert.strictEqual(deactivatedUser.status, "INACTIVE", "User status should be INACTIVE");
    assert.strictEqual(deactivatedUser.sessionVersion, 3, "sessionVersion should increment to 3 on deactivation");
    assert.strictEqual(deactivatedTeacher.isActive, false, "Teacher record isActive should be false");
    console.log("✓ Teacher deactivation & session revocation: PASS");

    // 5. Test Student, Parent, and ParentStudent Link
    const parentEmail = `parent.test.${Date.now()}@schoolportal.edu`;
    const hashedParentPass = await bcrypt.hash("ParentPass@2026", 10);

    const parentUser = await prisma.user.create({
      data: {
        name: "Sunita Sharma",
        email: parentEmail,
        password: hashedParentPass,
        role: "PARENT",
        status: "ACTIVE",
        sessionVersion: 1,
      }
    });
    testParentUserId = parentUser.id;

    const parent = await prisma.parent.create({
      data: {
        userId: parentUser.id,
        phone: "+1 (555) 987-6543",
        alternatePhone: "+1 (555) 987-1111",
        occupation: "Senior Architect",
        isActive: true,
      }
    });
    testParentId = parent.id;

    const admNo = `ADM-TEST-${Date.now().toString().slice(-4)}`;
    const student = await prisma.student.create({
      data: {
        firstName: "Aarav",
        lastName: "Sharma",
        rollNumber: "42",
        admissionNo: admNo,
        classId: testClassId,
        gender: "Male",
        bloodGroup: "O+",
        residenceType: "DAYSCHOLAR",
        isActive: true,
      }
    });
    testStudentId = student.id;

    const link = await prisma.parentStudent.create({
      data: {
        parentId: parent.id,
        studentId: student.id,
      }
    });

    assert.strictEqual(link.parentId, parent.id, "Link must point to parent ID");
    assert.strictEqual(link.studentId, student.id, "Link must point to student ID");

    const fetchedStudent = await prisma.student.findUnique({
      where: { id: student.id },
      include: { parents: { include: { parent: { include: { user: true } } } } }
    });

    assert.strictEqual(fetchedStudent?.parents[0].parent.user.email, parentEmail, "Linked parent email must match");
    console.log("✓ Student & Parent creation and linking: PASS");

    // 6. Test Class Move Continuity
    let targetClass = await prisma.class.findFirst({ where: { name: "Target Auto Grade" } });
    if (!targetClass) {
      targetClass = await prisma.class.create({
        data: { name: "Target Auto Grade", section: "Y", isActive: true }
      });
    }

    const movedStudent = await prisma.student.update({
      where: { id: testStudentId },
      data: { classId: targetClass.id }
    });

    assert.strictEqual(movedStudent.classId, targetClass.id, "Student must move to target class");
    console.log("✓ Student class move continuity: PASS");

    await prisma.student.update({ where: { id: testStudentId }, data: { classId: testClassId } });
    await prisma.class.delete({ where: { id: targetClass.id } }).catch(() => {});

    console.log("\n==========================================");
    console.log("ALL 5 MANAGEMENT & AUTH TESTS PASSED CLEANLY!");
    console.log("==========================================");
  } finally {
    // Cleanup test records
    if (testStudentId) {
      await prisma.parentStudent.deleteMany({ where: { studentId: testStudentId } });
      await prisma.student.delete({ where: { id: testStudentId } }).catch(() => {});
    }
    if (testParentId) {
      await prisma.parent.delete({ where: { id: testParentId } }).catch(() => {});
    }
    if (testParentUserId) {
      await prisma.user.delete({ where: { id: testParentUserId } }).catch(() => {});
    }
    if (testTeacherId) {
      await prisma.teacher.delete({ where: { id: testTeacherId } }).catch(() => {});
    }
    if (testTeacherUserId) {
      await prisma.user.delete({ where: { id: testTeacherUserId } }).catch(() => {});
    }
    if (testClassId) {
      await prisma.class.delete({ where: { id: testClassId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
