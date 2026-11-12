import { PrismaClient } from "@prisma/client";
import {
  serializeBirthdayCardPayload,
  buildBirthdaySummaryText,
  BirthdayCardPayload,
} from "../frontend/components/birthdays/birthdayCardUtils";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

async function main() {
  console.log("=== DISPATCHING OFFICIAL DESIGNED BIRTHDAY CARDS ===");

  // 1. Update BirthdaySettings
  await prisma.birthdaySettings.upsert({
    where: { id: "default" },
    update: {
      senderName: "PRANAV.J",
      senderDesignation: "Correspondent",
      deityName: "Amman",
      enabled: true,
      notifyParents: true,
      notifyStudents: true,
    },
    create: {
      id: "default",
      senderName: "PRANAV.J",
      senderDesignation: "Correspondent",
      deityName: "Amman",
      enabled: true,
      notifyParents: true,
      notifyStudents: true,
    },
  });
  console.log("✓ Updated BirthdaySettings with Correspondent PRANAV.J & SRT SCHOOL.");

  // 2. Celebrants to send cards to
  const celebrants = [
    {
      studentName: "Iniya K",
      className: "Class 2 - A",
      parentEmail: "itsiniya.k@gmail.com",
    },
    {
      studentName: "Anushka A",
      className: "Class 2 - A",
      parentEmail: "anushkaa.ad25@bitsathy.ac.in",
    },
  ];

  for (const c of celebrants) {
    const parentUser = await prisma.user.findFirst({
      where: { email: { equals: c.parentEmail, mode: "insensitive" } },
    });

    if (!parentUser) {
      console.log(`Parent user not found for ${c.parentEmail}`);
      continue;
    }

    const payload: BirthdayCardPayload = {
      recipientName: c.studentName,
      classNameLabel: c.className,
      deityName: "Amman",
      cardLine1: "I have great pleasure in conveying my best wishes on the eve of your birthday",
      cardLine2: "My prayers are to Amman to bless you with peace, prosperity and happiness",
      senderName: "PRANAV.J",
      senderDesignation: "Correspondent",
      schoolName: "SRT SCHOOL",
      schoolLogo: "/logo/srt-logo.svg",
      schoolTagline: "UNIVERSAL SCHOOL",
      ammanPhotoUrl: "/assets/birthday/amman.jpg",
      signatureUrl: undefined,
      summaryText: buildBirthdaySummaryText({
        recipientName: c.studentName,
        senderName: "PRANAV.J",
        senderDesignation: "Correspondent",
        schoolName: "SRT SCHOOL",
        deityName: "Amman",
      }),
    };

    const serialized = serializeBirthdayCardPayload(payload);

    // Delete previous old plain-text notifications for this celebrant so the card is fresh & pops up
    await prisma.notification.deleteMany({
      where: {
        userId: parentUser.id,
        category: "BIRTHDAY",
      },
    });

    // Create fresh notification with designed card payload
    const notif = await prisma.notification.create({
      data: {
        userId: parentUser.id,
        title: `Happy Birthday, ${c.studentName}! 🎂`,
        content: serialized,
        type: "BIRTHDAY",
        category: "BIRTHDAY",
        priority: "NORMAL",
        link: "/dashboard/parent",
        isRead: false,
      },
    });

    console.log(`✓ Dispatched official designed card to ${c.studentName} (${c.parentEmail})! Notif ID: ${notif.id}`);
  }

  await prisma.$disconnect();
  console.log("=== COMPLETED DISPATCH ===");
}

main().catch(console.error);
