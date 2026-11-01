-- AlterTable Notification
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "category" TEXT DEFAULT 'GENERAL';
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "priority" TEXT DEFAULT 'NORMAL';

-- CreateTable Bus
CREATE TABLE IF NOT EXISTS "Bus" (
    "id" TEXT NOT NULL,
    "busNumber" TEXT NOT NULL,
    "registrationNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 40,
    "driverName" TEXT NOT NULL,
    "driverPhone" TEXT NOT NULL,
    "routeDescription" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "inChargeStaffId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bus_pkey" PRIMARY KEY ("id")
);

-- CreateTable BusStudent
CREATE TABLE IF NOT EXISTS "BusStudent" (
    "id" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL DEFAULT '2025-2026',
    "pickupPoint" TEXT,
    "dropPoint" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable BusStatusLog
CREATE TABLE IF NOT EXISTS "BusStatusLog" (
    "id" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "issueType" TEXT,
    "description" TEXT NOT NULL,
    "reportedByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable BusMessage
CREATE TABLE IF NOT EXISTS "BusMessage" (
    "id" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "senderStaffId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'COMMON',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "targetStudentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "Bus_busNumber_key" ON "Bus"("busNumber");
CREATE INDEX IF NOT EXISTS "Bus_status_idx" ON "Bus"("status");
CREATE INDEX IF NOT EXISTS "Bus_inChargeStaffId_idx" ON "Bus"("inChargeStaffId");
CREATE INDEX IF NOT EXISTS "Bus_isActive_idx" ON "Bus"("isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "BusStudent_studentId_academicYear_key" ON "BusStudent"("studentId", "academicYear");
CREATE INDEX IF NOT EXISTS "BusStudent_busId_idx" ON "BusStudent"("busId");
CREATE INDEX IF NOT EXISTS "BusStudent_studentId_idx" ON "BusStudent"("studentId");
CREATE INDEX IF NOT EXISTS "BusStudent_assignedAt_idx" ON "BusStudent"("assignedAt");

CREATE INDEX IF NOT EXISTS "BusStatusLog_busId_idx" ON "BusStatusLog"("busId");
CREATE INDEX IF NOT EXISTS "BusStatusLog_createdAt_idx" ON "BusStatusLog"("createdAt");
CREATE INDEX IF NOT EXISTS "BusStatusLog_reportedByStaffId_idx" ON "BusStatusLog"("reportedByStaffId");

CREATE INDEX IF NOT EXISTS "BusMessage_busId_idx" ON "BusMessage"("busId");
CREATE INDEX IF NOT EXISTS "BusMessage_createdAt_idx" ON "BusMessage"("createdAt");
CREATE INDEX IF NOT EXISTS "BusMessage_targetStudentId_idx" ON "BusMessage"("targetStudentId");
CREATE INDEX IF NOT EXISTS "BusMessage_senderStaffId_idx" ON "BusMessage"("senderStaffId");

CREATE INDEX IF NOT EXISTS "Notification_userId_category_idx" ON "Notification"("userId", "category");
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_category_idx" ON "Notification"("userId", "isRead", "category");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");

-- AddForeignKey
ALTER TABLE "Bus" DROP CONSTRAINT IF EXISTS "Bus_inChargeStaffId_fkey";
ALTER TABLE "Bus" ADD CONSTRAINT "Bus_inChargeStaffId_fkey" FOREIGN KEY ("inChargeStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BusStudent" DROP CONSTRAINT IF EXISTS "BusStudent_busId_fkey";
ALTER TABLE "BusStudent" ADD CONSTRAINT "BusStudent_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusStudent" DROP CONSTRAINT IF EXISTS "BusStudent_studentId_fkey";
ALTER TABLE "BusStudent" ADD CONSTRAINT "BusStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusStatusLog" DROP CONSTRAINT IF EXISTS "BusStatusLog_busId_fkey";
ALTER TABLE "BusStatusLog" ADD CONSTRAINT "BusStatusLog_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusStatusLog" DROP CONSTRAINT IF EXISTS "BusStatusLog_reportedByStaffId_fkey";
ALTER TABLE "BusStatusLog" ADD CONSTRAINT "BusStatusLog_reportedByStaffId_fkey" FOREIGN KEY ("reportedByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BusMessage" DROP CONSTRAINT IF EXISTS "BusMessage_busId_fkey";
ALTER TABLE "BusMessage" ADD CONSTRAINT "BusMessage_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusMessage" DROP CONSTRAINT IF EXISTS "BusMessage_senderStaffId_fkey";
ALTER TABLE "BusMessage" ADD CONSTRAINT "BusMessage_senderStaffId_fkey" FOREIGN KEY ("senderStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BusMessage" DROP CONSTRAINT IF EXISTS "BusMessage_targetStudentId_fkey";
ALTER TABLE "BusMessage" ADD CONSTRAINT "BusMessage_targetStudentId_fkey" FOREIGN KEY ("targetStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

