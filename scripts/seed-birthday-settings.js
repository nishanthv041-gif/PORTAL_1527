const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const res = await prisma.birthdaySettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      senderName: "PRANAV.J",
      senderDesignation: "Correspondent",
      deityName: "Amman",
      cardLine1: "I have great pleasure in conveying my best wishes on the eve of your birthday",
      cardLine2: "My prayers are to {deityName} to bless you with peace, prosperity and happiness",
    },
    update: {
      senderName: "PRANAV.J",
      senderDesignation: "Correspondent",
      deityName: "Amman",
      cardLine1: "I have great pleasure in conveying my best wishes on the eve of your birthday",
      cardLine2: "My prayers are to {deityName} to bless you with peace, prosperity and happiness",
    },
  });
  console.log("Seeded BirthdaySettings successfully:", {
    id: res.id,
    senderName: res.senderName,
    senderDesignation: res.senderDesignation,
    deityName: res.deityName,
  });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
