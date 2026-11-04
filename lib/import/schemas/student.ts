/**
 * Schema and strict alias definitions for Student bulk upload.
 */

import { z } from "zod";
import { isValidEmail, isValidIndianPhone } from "../normalizers";
import { TargetFieldDef } from "./teacher";

export const STUDENT_TARGET_FIELDS: TargetFieldDef[] = [
  {
    key: "rollNo",
    label: "Roll Number / Student ID",
    required: true,
    description: "Unique student roll number (e.g. 7376252AD114)",
    aliases: ["roll no", "roll number", "student roll no", "student id", "reg no", "register no", "admission no", "adm no"],
  },
  {
    key: "name",
    label: "Student Name",
    required: true,
    description: "Student full name (e.g. ANUSHKA A)",
    aliases: ["name", "student name", "full name", "student full name"],
  },
  {
    key: "class",
    label: "Class & Section",
    required: true,
    description: "Enrolled class (e.g. Class 2 - A, 2-A)",
    aliases: ["class", "standard", "grade", "class & sec", "class section", "enrolled class"],
  },
  {
    key: "gender",
    label: "Gender",
    required: false,
    description: "Gender (Male, Female, Other)",
    aliases: ["gender", "sex"],
  },
  {
    key: "dob",
    label: "Date of Birth",
    required: false,
    description: "DOB (YYYY-MM-DD or DD/MM/YYYY)",
    aliases: ["date of birth", "dob", "birth date"],
  },
  {
    key: "residenceType",
    label: "Day Scholar / Hosteler",
    required: false,
    description: "DAYSCHOLAR or HOSTEL",
    aliases: ["residence type", "hostel/dayscholar", "day scholar", "hosteler", "residence"],
  },
  {
    key: "parentName",
    label: "Parent / Guardian Name",
    required: true,
    description: "Father, Mother, or Guardian name",
    aliases: ["parent name", "father name", "father's name", "guardian name", "mother name"],
  },
  {
    key: "parentPhone",
    label: "Parent Phone Number",
    required: true,
    description: "10-digit mobile number for SMS & Portal login",
    aliases: ["parent phone", "phone number", "mobile", "parent mobile", "contact no", "emergency phone"],
  },
  {
    key: "parentEmail",
    label: "Parent Login Email",
    required: true,
    description: "Parent portal login email address",
    aliases: ["parent email", "email", "parent email id", "login email", "email id"],
  },
  {
    key: "parentPassword",
    label: "Parent Password",
    required: false,
    description: "Parent portal initial password (defaults to Parent@123 if blank)",
    aliases: ["parent password", "password", "login password", "pass"],
  },
];

export const StudentRowSchema = z.object({
  rollNo: z.string().min(1, "Roll number is required."),
  name: z.string().min(1, "Student name is required."),
  firstName: z.string().min(1, "Student first name is required."),
  lastName: z.string().optional().default(""),
  class: z.string().min(1, "Class is required."),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).default("OTHER"),
  dob: z.string().optional(),
  residenceType: z.enum(["DAYSCHOLAR", "HOSTEL"]).default("DAYSCHOLAR"),
  parentName: z.string().min(1, "Parent name is required."),
  parentFirstName: z.string().min(1, "Parent first name is required."),
  parentLastName: z.string().optional().default(""),
  parentPhone: z.string().refine(p => isValidIndianPhone(p), {
    message: "Parent phone must be a valid 10-digit Indian mobile number.",
  }),
  parentEmail: z.string().refine(e => isValidEmail(e), {
    message: "Parent email must be a valid email address.",
  }),
  parentPassword: z.string().optional().default("Parent@123"),
});

export type ValidatedStudentRow = z.infer<typeof StudentRowSchema>;

