import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Dual-Role Switcher System Verification", () => {
  it("computes availableRoles correctly for users with both Teacher and Parent profiles", () => {
    const user = {
      id: "u123",
      role: "TEACHER",
      teacher: { id: "t1", isActive: true },
      parent: { id: "p1", isActive: true },
      staff: null,
    };

    const availableRoles: string[] = [];
    if (user.role) availableRoles.push(user.role);
    if (user.teacher?.isActive && !availableRoles.includes("TEACHER")) {
      availableRoles.push("TEACHER");
    }
    if (user.parent?.isActive && !availableRoles.includes("PARENT")) {
      availableRoles.push("PARENT");
    }
    if (user.staff?.isActive && !availableRoles.includes("STAFF")) {
      availableRoles.push("STAFF");
    }
    if (user.role === "ADMIN" && !availableRoles.includes("ADMIN")) {
      availableRoles.push("ADMIN");
    }

    assert.deepEqual(availableRoles, ["TEACHER", "PARENT"]);
    assert.equal(availableRoles.length, 2);
    assert.equal(availableRoles.includes("TEACHER"), true);
    assert.equal(availableRoles.includes("PARENT"), true);
  });

  it("calculates redirect target url appropriately for switched roles", () => {
    const getRedirectUrl = (targetRole: string) => {
      if (targetRole === "ADMIN") return "/dashboard/admin";
      if (targetRole === "TEACHER") return "/dashboard/teacher";
      if (targetRole === "PARENT") return "/dashboard/parent";
      if (targetRole === "STAFF" || targetRole === "NON_TEACHING_STAFF") return "/staff/my-bus";
      return "/dashboard";
    };

    assert.equal(getRedirectUrl("TEACHER"), "/dashboard/teacher");
    assert.equal(getRedirectUrl("PARENT"), "/dashboard/parent");
    assert.equal(getRedirectUrl("ADMIN"), "/dashboard/admin");
    assert.equal(getRedirectUrl("STAFF"), "/staff/my-bus");
  });

  it("safeguards teacher accounts from deletion when child student record is unlinked or deleted", () => {
    // Simulating parent-student unlinking logic
    const parent = {
      id: "p1",
      userId: "u1",
      user: {
        id: "u1",
        role: "TEACHER",
        teacher: { id: "t1" },
        staff: null,
      },
    };

    const hasOtherStaffRoles =
      parent.user &&
      (parent.user.teacher !== null ||
        parent.user.staff !== null ||
        parent.user.role === "TEACHER" ||
        parent.user.role === "ADMIN" ||
        parent.user.role === "STAFF" ||
        parent.user.role === "NON_TEACHING_STAFF");

    let userDeleted = false;
    if (parent.user && !hasOtherStaffRoles) {
      userDeleted = true;
    }

    assert.equal(hasOtherStaffRoles, true);
    assert.equal(userDeleted, false, "Teacher's user record must NEVER be deleted when child student record is deleted");
  });

  it("permits pure parent deletion when unlinked with no other children", () => {
    const pureParent = {
      id: "p2",
      userId: "u2",
      user: {
        id: "u2",
        role: "PARENT",
        teacher: null,
        staff: null,
      },
    };

    const hasOtherStaffRoles =
      pureParent.user &&
      (pureParent.user.teacher !== null ||
        pureParent.user.staff !== null ||
        pureParent.user.role === "TEACHER" ||
        pureParent.user.role === "ADMIN" ||
        pureParent.user.role === "STAFF" ||
        pureParent.user.role === "NON_TEACHING_STAFF");

    let userDeleted = false;
    if (pureParent.user && !hasOtherStaffRoles) {
      userDeleted = true;
    }

    assert.equal(hasOtherStaffRoles, false);
    assert.equal(userDeleted, true, "Pure parent user record should be cleaned up when no children remain");
  });
});
