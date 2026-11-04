import { prisma } from "../backend/db/prisma";
import { encode } from "next-auth/jwt";

async function measureNavigation() {
  console.log("=== STEP 1: MEASURING SERVER-SIDE PAGE EXECUTION TIMES ===");

  // Find users for each role
  const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  const teacherUser = await prisma.user.findFirst({ where: { role: "TEACHER" } });
  const parentUser = await prisma.user.findFirst({ where: { role: "PARENT" } });

  console.log("Admin user:", adminUser?.email);
  console.log("Teacher user:", teacherUser?.email);
  console.log("Parent user:", parentUser?.email);

  const secret = process.env.NEXTAUTH_SECRET || "fallback_secret";

  async function getSessionCookie(user: any) {
    if (!user) return "";
    const token = await encode({
      token: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isRevoked: false,
      },
      secret,
    });
    return `next-auth.session-token=${token}`;
  }

  const adminCookie = await getSessionCookie(adminUser);
  const teacherCookie = await getSessionCookie(teacherUser);
  const parentCookie = await getSessionCookie(parentUser);

  const routesToTest = [
    { role: "ADMIN", url: "http://localhost:3000/dashboard/admin", cookie: adminCookie },
    { role: "ADMIN", url: "http://localhost:3000/dashboard/admin/main-roles", cookie: adminCookie },
    { role: "ADMIN", url: "http://localhost:3000/dashboard/admin/users", cookie: adminCookie },
    { role: "ADMIN", url: "http://localhost:3000/dashboard/admin/settings", cookie: adminCookie },
    { role: "TEACHER", url: "http://localhost:3000/dashboard/teacher", cookie: teacherCookie },
    { role: "TEACHER", url: "http://localhost:3000/dashboard/teacher/classes", cookie: teacherCookie },
    { role: "TEACHER", url: "http://localhost:3000/dashboard/teacher/attendance", cookie: teacherCookie },
    { role: "TEACHER", url: "http://localhost:3000/dashboard/teacher/assignments", cookie: teacherCookie },
    { role: "TEACHER", url: "http://localhost:3000/dashboard/teacher/report-cards", cookie: teacherCookie },
    { role: "PARENT", url: "http://localhost:3000/dashboard/parent", cookie: parentCookie },
    { role: "PARENT", url: "http://localhost:3000/dashboard/parent/attendance", cookie: parentCookie },
    { role: "PARENT", url: "http://localhost:3000/dashboard/parent/report-cards", cookie: parentCookie },
    { role: "PARENT", url: "http://localhost:3000/dashboard/parent/assignments", cookie: parentCookie },
    { role: "PARENT", url: "http://localhost:3000/dashboard/parent/classes", cookie: parentCookie },
  ];

  console.log("\n--- Testing Full HTML Page Fetch (Cold vs Warm) ---");
  for (const item of routesToTest) {
    if (!item.cookie) {
      console.log(`Skipping ${item.url} (no user for role ${item.role})`);
      continue;
    }

    // 1. Full page fetch
    const t0 = performance.now();
    const res1 = await fetch(item.url, {
      headers: { Cookie: item.cookie },
    });
    const t1 = performance.now();
    const time1 = Math.round(t1 - t0);

    // 2. Client-side RSC navigation fetch (as sent when user clicks a link)
    const t2 = performance.now();
    const res2 = await fetch(item.url, {
      headers: {
        Cookie: item.cookie,
        RSC: "1",
        "Next-Router-State-Tree": "%5B%22%22%2C%7B%22children%22%3A%5B%22dashboard%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%5D%7D%5D%7D%2Cnull%2Cnull%2Ctrue%5D",
      },
    });
    const t3 = performance.now();
    const time2 = Math.round(t3 - t2);

    const routeName = item.url.replace("http://localhost:3000", "");
    console.log(`[${item.role}] ${routeName.padEnd(36)} -> Full SSR: ${time1}ms | RSC Payload: ${time2}ms | Status: ${res1.status}`);
  }

  await prisma.$disconnect();
}

measureNavigation().catch(console.error);

