import { prisma } from "../backend/db/prisma";

async function checkExistingEmailCollisions() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, googleEmail: true, status: true }
  });

  console.log(`Total users in database: ${users.length}`);

  const emailMap = new Map<string, typeof users>();
  for (const u of users) {
    const canonical = (u.email || "").trim().toLowerCase();
    const list = emailMap.get(canonical) || [];
    list.push(u);
    emailMap.set(canonical, list);
  }

  const collisions = Array.from(emailMap.entries()).filter(([_, list]) => list.length > 1);

  if (collisions.length === 0) {
    console.log("✅ Zero email collisions found in database! All existing emails are unique when lowercased and trimmed.");
  } else {
    console.log(`⚠️ Found ${collisions.length} email collisions in database:`);
    collisions.forEach(([email, list]) => {
      console.log(`Email: "${email}" (${list.length} accounts):`);
      list.forEach(u => console.log(`   ID: ${u.id}, Name: ${u.name}, Role: ${u.role}, Status: ${u.status}`));
    });
  }

  // Check Google emails
  const googleEmailMap = new Map<string, typeof users>();
  for (const u of users) {
    if (!u.googleEmail) continue;
    const canonical = u.googleEmail.trim().toLowerCase();
    const list = googleEmailMap.get(canonical) || [];
    list.push(u);
    googleEmailMap.set(canonical, list);
  }

  const googleCollisions = Array.from(googleEmailMap.entries()).filter(([_, list]) => list.length > 1);
  if (googleCollisions.length === 0) {
    console.log("✅ Zero Google email collisions found in database!");
  } else {
    console.log(`⚠️ Found ${googleCollisions.length} Google email collisions in database:`);
    googleCollisions.forEach(([email, list]) => {
      console.log(`Google Email: "${email}" (${list.length} accounts):`);
      list.forEach(u => console.log(`   ID: ${u.id}, Name: ${u.name}, Role: ${u.role}`));
    });
  }
}

checkExistingEmailCollisions().catch(console.error).finally(() => prisma.$disconnect());

