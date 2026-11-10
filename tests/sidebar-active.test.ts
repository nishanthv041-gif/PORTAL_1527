import { describe, test } from "node:test";
import assert from "node:assert";
import { getActiveNavItemHref, NavItemCandidate } from "../lib/navigation/sidebarActive";

describe("Sidebar Navigation Active State Determination", () => {
  const teacherLinks: NavItemCandidate[] = [
    { href: "/dashboard/teacher", label: "Dashboard" },
    { href: "/dashboard/teacher/classes", label: "My Classes" },
    { href: "/dashboard/teacher/attendance", label: "Attendance" },
    { href: "/dashboard/teacher/assignments", label: "Home Work" },
    { href: "/dashboard/teacher/exams", label: "Exams" },
    { href: "/dashboard/teacher/report-cards", label: "Report Cards" },
    { href: "/dashboard/teacher/birthdays", label: "Birthday Wishes" },
    { href: "/dashboard/teacher/birthdays/missing", label: "Missing Date of Birth" },
    { href: "/dashboard/teacher/messages", label: "Messages" },
    { href: "/dashboard/teacher/settings", label: "Settings" },
  ];

  const adminLinks: NavItemCandidate[] = [
    { href: "/dashboard/admin", label: "Dashboard" },
    { href: "/dashboard/admin/main-roles", label: "Main Roles" },
    { href: "/dashboard/admin/classes", label: "Class Management" },
    { href: "/dashboard/admin/birthdays/missing", label: "Missing Date of Birth" },
    { href: "/dashboard/admin/settings/birthdays", label: "Birthday Wishes" },
    { href: "/dashboard/admin/settings", label: "Settings" },
  ];

  test("1. On /dashboard/teacher/birthdays/missing, ONLY 'Missing Date of Birth' is active", () => {
    const active = getActiveNavItemHref("/dashboard/teacher/birthdays/missing", teacherLinks);
    assert.strictEqual(active, "/dashboard/teacher/birthdays/missing");
  });

  test("2. On /dashboard/teacher/birthdays, ONLY 'Birthday Wishes' is active", () => {
    const active = getActiveNavItemHref("/dashboard/teacher/birthdays", teacherLinks);
    assert.strictEqual(active, "/dashboard/teacher/birthdays");
  });

  test("3. On /dashboard/admin/settings/birthdays, ONLY 'Birthday Wishes' is active (NOT Settings)", () => {
    const active = getActiveNavItemHref("/dashboard/admin/settings/birthdays", adminLinks);
    assert.strictEqual(active, "/dashboard/admin/settings/birthdays");
  });

  test("4. On /dashboard/admin/settings, ONLY 'Settings' is active (NOT Birthday Wishes)", () => {
    const active = getActiveNavItemHref("/dashboard/admin/settings", adminLinks);
    assert.strictEqual(active, "/dashboard/admin/settings");
  });

  test("5. On /dashboard/admin/birthdays/missing, ONLY 'Missing Date of Birth' is active", () => {
    const active = getActiveNavItemHref("/dashboard/admin/birthdays/missing", adminLinks);
    assert.strictEqual(active, "/dashboard/admin/birthdays/missing");
  });

  test("6. Homework alias routes map to /dashboard/teacher/assignments", () => {
    const active = getActiveNavItemHref("/dashboard/teacher/homework", teacherLinks);
    assert.strictEqual(active, "/dashboard/teacher/assignments");
  });

  test("7. Subroutes under attendance activate Attendance link", () => {
    const active = getActiveNavItemHref("/dashboard/teacher/attendance/history", teacherLinks);
    assert.strictEqual(active, "/dashboard/teacher/attendance");
  });
});
