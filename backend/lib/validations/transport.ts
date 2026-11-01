import { z } from "zod";

export const BusStatusEnum = z.enum(["RUNNING", "NOT_RUNNING", "MAINTENANCE", "DELAYED"]);
export const IssueTypeEnum = z.enum(["BREAKDOWN", "TRAFFIC", "ACCIDENT", "LATE", "ROUTE_CHANGE", "OTHER"]);
export const BusMessageTypeEnum = z.enum(["COMMON", "INDIVIDUAL"]);
export const PriorityEnum = z.enum(["NORMAL", "URGENT"]);

export const CreateBusSchema = z.object({
  busNumber: z.string().trim().min(1, "Bus Number is required (e.g. BUS-01)"),
  registrationNo: z.string().trim().min(1, "Registration Number is required (e.g. TN-01-AB-1234)"),
  name: z.string().trim().min(1, "Bus / Route Name is required"),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1").max(120, "Capacity cannot exceed 120").default(40),
  driverName: z.string().trim().min(1, "Driver Name is required"),
  driverPhone: z.string().trim().min(6, "Valid Driver Phone is required"),
  routeDescription: z.string().trim().optional().nullable(),
  inChargeStaffId: z.string().trim().optional().nullable(),
  status: BusStatusEnum.default("RUNNING"),
  isActive: z.boolean().default(true),
});

export const UpdateBusSchema = CreateBusSchema.partial();

export const AssignStudentItemSchema = z.object({
  studentId: z.string().trim().min(1, "Student ID is required"),
  pickupPoint: z.string().trim().optional().nullable(),
  dropPoint: z.string().trim().optional().nullable(),
  academicYear: z.string().trim().default("2025-2026"),
});

export const AssignStudentsSchema = z.object({
  students: z.array(AssignStudentItemSchema).min(1, "At least one student must be provided"),
  academicYear: z.string().trim().default("2025-2026"),
});

export const UpdateBusStatusSchema = z.object({
  status: BusStatusEnum,
  issueType: IssueTypeEnum.optional().nullable(),
  description: z.string().trim().min(1, "Status update description is required"),
});

export const SendBusMessageSchema = z.object({
  type: BusMessageTypeEnum.default("COMMON"),
  title: z.string().trim().min(1, "Title is required"),
  message: z.string().trim().min(1, "Message content is required"),
  priority: PriorityEnum.default("NORMAL"),
  targetStudentId: z.string().trim().optional().nullable(),
});

